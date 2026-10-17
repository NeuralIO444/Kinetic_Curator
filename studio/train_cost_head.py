#!/usr/bin/env python3
"""train_cost_head — the T4 governor cost-head TRAINER (#1578).

Consumes kc-cost-dataset v1 artifacts (from the harness: costBench.mjs,
usually driven by app/scripts/costStudioRun.mjs) and produces the cost-model
artifact the runtime evaluator consumes (src/hooks/costHead.mjs:
kind 'xgboost-cost', objective 'reg:quantileerror', flat JSON tree arrays —
the same export discipline as the T1 taste head in studio/curator.py, whose
conversion and base-score calibration this mirrors).

Pipeline law (issue #1578 — do not improvise):
  1. ADDITIVITY FIRST. If per-effect costs simply add (the corpus's
     one-factor ladders price the pairwise heavy combos within tolerance
     on every testable device), the tier table already tells the truth:
     report ADDITIVE-KILL, write the report, and REFUSE to train.
  2. Grouped splits only — by recipe AND by device (the shared FNV-1a fold
     rule, identical to the replay judge's; random splits leak and are not
     evidence). Train cells fit; cross cells (exactly one side held out)
     early-stop and calibrate; test cells are never touched here — they
     belong to the judge.
  3. Quantile regression on log-ms, objective reg:quantileerror, tau 0.9:
     under-predicting a scene's cost is the hitch-causing error, so it
     costs ~9x over-predicting. Monotone constraints where the physics is
     monotone (mechanism estimates, probe times, body counts).
  4. Per-tier calibration: one multiplier, the nearest-rank 90th
     percentile of actual/predicted on the cross cells, floored at 1.0 —
     calibrated coverage >= 90% there by construction.
  5. The exported artifact is verified against the booster it came from
     (base-score calibration + a full walk comparison) before it is
     written; a mismatch stops the train, never ships an approximation.

Deliberate deviation from T1: no refit-on-full-pool after early stopping.
Calibration honesty outranks pool size here — the false-cheap ship gate is
judged on cells the calibrator never saw, so the calibrator's cells stay
out of the fit. Recorded so the choice is visible, not silent.

Exit codes: 0 trained · 3 ADDITIVE-KILL · 2 error (including xgboost
missing — the message says exactly what to install).

  python3 studio/train_cost_head.py DATASET.json [DATASET2.json ...]
      --out cost-model.json --report train-report.json [--tau 0.9]
      [--max-rounds 300] [--max-depth 6] [--seed 0]

Everything up to the fit is stdlib-only, so the shaping, the split, the
additivity screen, the dump conversion and the calibration math are
testable with no xgboost installed (studio/train_cost_head_selfcheck.py).
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

COST_HEAD_KIND = "xgboost-cost"
COST_OBJECTIVE = "reg:quantileerror"
DATASET_KIND = "kc-cost-dataset"
DATASET_VERSION = 1

# Artifact bounds — the runtime validator's caps (costHead.mjs), mirrored.
MAX_TREES = 512
MAX_TREE_DEPTH = 6
MAX_TREE_NODES = 20000

ADDITIVITY_TOLERANCE = 0.25  # mirrors costJudge.mjs ADDITIVITY_TOLERANCE
SPLIT_FOLDS = 5

# Feature-bag keys that never become design columns: identity/version and
# the array-valued or evaluator-unsplittable bags. `castSize` is a top-level
# NUMBER, and the evaluator only splits prefixed numerics (num./mech./
# probe.) numerically — a top-level numeric could only ever split with
# '=', which the artifact validator rejects for numbers. Excluded, loudly
# (the report lists every exclusion and its reason).
SHAPE_SKIP_KEYS = {"v", "cast", "castCategories", "castSize", "num", "mech", "probe"}
NUMERIC_PREFIXES = ("num.", "mech.", "probe.")

# Monotone-in-cost features (constraint +1): more of the mechanism, a
# slower device probe, or more bodies cannot make a frame cheaper.
MONOTONE_NUM = {"num.count", "num.scaleMid", "num.density", "num.particleCount"}


# ── the shared split (judge mirror — keep the two in lockstep) ──────────

def fnv1a(text: str) -> int:
    """FNV-1a 32-bit over the UTF-8 bytes — identical to costJudge.mjs."""
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def assign_splits(recipe_ids, device_keys):
    """Mirror of costJudge.mjs assignSplits — same fallbacks, same order."""
    recipes = sorted(set(recipe_ids))
    devices = sorted(set(device_keys))
    held_recipes = [r for r in recipes if fnv1a(r) % SPLIT_FOLDS == 0]
    if not held_recipes or len(held_recipes) == len(recipes):
        held_recipes = [r for i, r in enumerate(recipes) if i % SPLIT_FOLDS == SPLIT_FOLDS - 1]
    recipe_leg = 0 < len(held_recipes) < len(recipes)
    held_devices = [d for d in devices if fnv1a(d) % SPLIT_FOLDS == 0]
    if len(devices) <= 1:
        held_devices = []
        device_leg = False
    elif not held_devices:
        held_devices = [devices[-1]]
        device_leg = True
    elif len(held_devices) == len(devices):
        held_devices = devices[1:]
        device_leg = True
    else:
        device_leg = True
    return {
        "held_recipes": set(held_recipes),
        "held_devices": set(held_devices),
        "recipe_leg": recipe_leg,
        "device_leg": device_leg,
    }


def cell_of(split, recipe_id, device_key):
    hr = recipe_id in split["held_recipes"]
    hd = device_key in split["held_devices"]
    if hr and hd:
        return "test"
    if hr or hd:
        return "cross"
    return "train"


def device_key_of(dataset) -> str:
    env = dataset.get("environment") or {}
    return f"{env.get('renderer') or 'unknown-renderer'}|{env.get('platform') or 'unknown-platform'}"


# ── the additivity screen (judge mirror) ────────────────────────────────

def additivity_screen(labels):
    """labels: recipe id -> labelMs for ONE device. Mirror of
    costJudge.mjs additivityScreen — same ladder math, same tolerance."""
    need = [
        "grid-base", "grid-count-160", "grid-count-480", "grid-scale-large", "grid-cast-24",
        "grid-fx-1", "grid-fx-2", "grid-fx-3", "grid-fx-4",
        "grid-heavy-count-fx", "grid-heavy-scale-fx", "grid-heavy-count-scale", "grid-heavy-all",
    ]
    for rid in need:
        v = labels.get(rid)
        if not isinstance(v, (int, float)) or not math.isfinite(v):
            return {"status": "indeterminate", "combos": [], "missing": rid}
    B = labels["grid-base"]
    d_count = labels["grid-count-480"] - B
    d_scale = labels["grid-scale-large"] - B
    d_cast = labels["grid-cast-24"] - labels["grid-count-160"]
    e1 = labels["grid-fx-1"] - B
    e2 = labels["grid-fx-2"] - labels["grid-fx-1"]
    e3 = labels["grid-fx-3"] - labels["grid-fx-2"]
    e4 = labels["grid-fx-4"] - labels["grid-fx-3"]
    raw = [
        ("grid-heavy-count-fx", B + d_count + e1 + e2 + e3),
        ("grid-heavy-scale-fx", B + d_scale + e1 + e2),
        ("grid-heavy-count-scale", B + d_count + d_scale),
        ("grid-heavy-all", B + d_count + d_scale + d_cast + e1 + e2 + e3 + e4),
    ]
    combos = [
        {"id": rid, "pred": pred, "actual": labels[rid],
         "relErr": abs(pred - labels[rid]) / labels[rid]}
        for rid, pred in raw
    ]
    additive = all(c["relErr"] <= ADDITIVITY_TOLERANCE for c in combos)
    return {"status": "additive" if additive else "non-additive",
            "combos": combos, "tolerance": ADDITIVITY_TOLERANCE}


# ── dataset shaping ─────────────────────────────────────────────────────

def load_rows(paths):
    """Datasets -> flat rows + provenance. Raises ValueError on anything
    the trainer would silently choke on (the JS dataset gate is the
    authority upstream; this is the second lock on the door)."""
    rows = []
    sources = []
    for path in paths:
        raw = Path(path).read_bytes()
        ds = json.loads(raw)
        if ds.get("kind") != DATASET_KIND or ds.get("version") != DATASET_VERSION:
            raise ValueError(f"{path}: not a {DATASET_KIND} v{DATASET_VERSION} artifact")
        device = device_key_of(ds)
        measured = 0
        for row in ds.get("rows") or []:
            if row.get("status") != "measured":
                continue
            label = row.get("labelMs")
            if not isinstance(label, (int, float)) or not math.isfinite(label) or label <= 0:
                raise ValueError(f"{path}: row {row.get('id')}: bad labelMs {label!r}")
            feats = row.get("features") or {}
            for bag in ("num", "mech", "probe"):
                if not isinstance(feats.get(bag), dict):
                    raise ValueError(f"{path}: row {row.get('id')}: features.{bag} missing")
            rows.append({"recipe": row["id"], "device": device,
                         "features": feats, "label": float(label)})
            measured += 1
        sources.append({
            "file": str(path),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "device": device,
            "renderer": (ds.get("environment") or {}).get("renderer"),
            "swiftShader": bool((ds.get("environment") or {}).get("swiftShader")),
            "measuredRows": measured,
        })
    if not rows:
        raise ValueError("no measured rows in any dataset")
    return rows, sources


def design_columns(rows):
    """The design: numeric columns (num./mech./probe. flattened) + one-hot
    term columns for eligible categorical keys. Returns (columns,
    exclusions) — eligibility: a top-level key whose value is a string or
    boolean in EVERY row (never null/absent/numeric), so every artifact
    feature the evaluator looks up is present in a runtime feature bag.
    Column order is deterministic: terms sorted, then numerics sorted."""
    numeric = set()
    for r in rows:
        for bag in ("num", "mech", "probe"):
            for k in (r["features"].get(bag) or {}):
                numeric.add(f"{bag}.{k}")
    cat_keys = set()
    for r in rows:
        for k in r["features"]:
            if k not in SHAPE_SKIP_KEYS:
                cat_keys.add(k)
    exclusions = []
    terms = set()
    for k in sorted(cat_keys):
        eligible = True
        for r in rows:
            v = r["features"].get(k)
            if isinstance(v, bool) or isinstance(v, str):
                continue
            eligible = False
            break
        if not eligible:
            exclusions.append({"key": k, "reason": "not a string/boolean in every row "
                               "(null, numeric, array or absent values cannot be split by the evaluator)"})
            continue
        for r in rows:
            v = r["features"][k]
            terms.add(f"{k}={'true' if v is True else 'false' if v is False else v}")
    for k in sorted(SHAPE_SKIP_KEYS - {"num", "mech", "probe"}):
        if any(k in r["features"] for r in rows):
            exclusions.append({"key": k, "reason": "identity/array/top-level-numeric — "
                               "not a splittable feature under the evaluator's rules"})
    columns = sorted(terms) + sorted(numeric)
    return columns, exclusions


def design_value(features, col):
    """One design cell. Numeric: the bag value (absent = 0.0, the
    evaluator's own default). Term: 1.0 when the feature carries the term."""
    if col.startswith(NUMERIC_PREFIXES):
        bag, _, key = col.partition(".")
        v = (features.get(bag) or {}).get(key)
        return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0.0
    key, _, value = col.partition("=")
    v = features.get(key)
    spelled = "true" if v is True else "false" if v is False else v
    return 1.0 if spelled == value else 0.0


def monotone_for(col):
    if col.startswith(("mech.", "probe.")):
        return 1
    if col in MONOTONE_NUM:
        return 1
    return 0


# ── spec-tree walk + conversion (curator.py mirrors, cost prefixes) ────

def spec_feature_value(features, name):
    """Mirror of costHead.mjs treeFeatureValue."""
    if name.startswith(NUMERIC_PREFIXES):
        bag, _, key = name.partition(".")
        v = (features.get(bag) or {}).get(key)
        return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0.0
    return features.get(name)


def _spec_eq(a, b):
    """Mirror of costHead.mjs treeEq (and curator.py _spec_eq)."""
    if a is b or (a == b and type(a) is type(b)):
        return True
    if isinstance(a, bool) and isinstance(b, str):
        return ("true" if a else "false") == b
    if isinstance(b, bool) and isinstance(a, str):
        return a == ("true" if b else "false")
    return False


def walk_spec_tree(node, features, names):
    while "leaf" not in node:
        val = spec_feature_value(features, names[node["f"]])
        if node["op"] == "<":
            go = (isinstance(val, (int, float)) and not isinstance(val, bool)
                  and math.isfinite(val) and val < node["v"])
        else:
            go = _spec_eq(val, node["v"])
        node = node["y"] if go else node["n"]
    return float(node["leaf"])


def artifact_predict_log(artifact, features):
    """baseScore + sum of leaves — the evaluator's margin (pre-calibration)."""
    return artifact["baseScore"] + sum(
        walk_spec_tree(t, features, artifact["features"]) for t in artifact["trees"])


def xgb_feature_names(columns):
    """Design columns -> the artifact's declared features (T1's binding
    order: categorical keys sorted, then numeric names sorted)."""
    cats = sorted({c.partition("=")[0] for c in columns if not c.startswith(NUMERIC_PREFIXES)})
    nums = sorted(c for c in columns if c.startswith(NUMERIC_PREFIXES))
    return cats + nums


def _convert_xgb_node(node, columns, names, gains):
    """Mirror of curator.py _convert_xgb_node, with the cost head's three
    numeric prefixes. Raises ValueError on any shape the artifact format
    cannot say exactly."""
    if "leaf" in node:
        return {"leaf": round(float(node["leaf"]), 6)}
    split = node["split"]
    if split in columns:
        col = split
    elif split.startswith("f") and split[1:].isdigit() and int(split[1:]) < len(columns):
        col = columns[int(split[1:])]
    else:
        raise ValueError(f"xgboost split names unknown feature {split!r}")
    cond = float(node["split_condition"])
    kids = {c["nodeid"]: c for c in node["children"]}
    yes = _convert_xgb_node(kids[node["yes"]], columns, names, gains)
    no = _convert_xgb_node(kids[node["no"]], columns, names, gains)
    gain = round(float(gains.get(node["nodeid"], 0.0)), 6)
    if col.startswith(NUMERIC_PREFIXES):
        return {"f": names.index(col), "op": "<", "v": round(cond, 6),
                "y": yes, "n": no, "gain": gain}
    key, _, value = col.partition("=")
    if not value:
        raise ValueError(f"design column {col!r} is not a term column")
    if not 0.0 < cond <= 1.0:
        raise ValueError(f"one-hot column {col!r} split at {cond} is not a membership test")
    v = True if value == "true" else False if value == "false" else value
    # XGBoost routes x < cond to the yes child; on a 0/1 column that is
    # exactly 'term absent', so the spec equality node takes the children
    # swapped (curator.py's reasoning, unchanged).
    return {"f": names.index(key), "op": "=", "v": v,
            "y": no, "n": yes, "gain": gain}


def convert_xgb_dump(dump, columns, gains=None):
    names = xgb_feature_names(columns)
    gains = gains or {}
    trees = [_convert_xgb_node(t, columns, names, gains.get(i, {}))
             for i, t in enumerate(dump)]
    return names, trees


def calibrate_base_score(margins, leaf_sums):
    """Mirror of curator.py: median of (booster margin - exported leaf
    sum) over the pool, so the artifact reproduces the booster whatever
    its internal base_score bookkeeping does."""
    res = sorted(m - s for m, s in zip(margins, leaf_sums))
    if not res:
        raise ValueError("no rows to calibrate on")
    mid = len(res) // 2
    return res[mid] if len(res) % 2 else (res[mid - 1] + res[mid]) / 2


def percentile_nearest_rank(sorted_asc, p):
    """Mirror of costDataset.mjs percentile: rank = ceil(p/100 * n)."""
    if not sorted_asc:
        return None
    rank = max(1, math.ceil((p / 100) * len(sorted_asc)))
    return sorted_asc[min(rank, len(sorted_asc)) - 1]


def calibration_multiplier(preds_ms, actuals_ms, coverage=0.9):
    """Smallest multiplier reaching `coverage` of actuals, floored at 1.0:
    the nearest-rank coverage percentile of actual/predicted."""
    ratios = sorted(a / p for p, a in zip(preds_ms, actuals_ms) if p > 0)
    if not ratios:
        return 1.0
    m = percentile_nearest_rank(ratios, coverage * 100)
    return max(1.0, m)


def spec_head_stats(trees):
    def rec(node, depth):
        if "leaf" in node:
            return 1, depth
        ln, ld = rec(node["y"], depth + 1)
        rn, rd = rec(node["n"], depth + 1)
        return 1 + ln + rn, max(ld, rd)

    nodes = depth = 0
    for t in trees:
        n, d = rec(t, 0)
        nodes += n
        depth = max(depth, d)
    return len(trees), depth, nodes


def pinball(preds, actuals, tau=0.9):
    if not preds:
        return None
    total = 0.0
    for p, a in zip(preds, actuals):
        u = a - p
        total += tau * u if u >= 0 else (tau - 1) * u
    return total / len(preds)


# ── the fit (xgboost boundary — everything above is stdlib) ─────────────

def fit_and_export(rows, cells, columns, *, tau, max_rounds, max_depth, seed):
    """Train on train cells, early-stop on cross cells, export the
    artifact. Returns (artifact, fit_notes). Raises on any inconsistency —
    a bad export stops the train, never approximates the model."""
    import numpy as np
    import xgboost as xgb

    train = [r for r, c in zip(rows, cells) if c == "train"]
    cross = [r for r, c in zip(rows, cells) if c == "cross"]
    if len(train) < 8:
        raise ValueError(f"only {len(train)} train cells — not enough to fit honestly")

    def matrix(rs):
        return np.array([[design_value(r["features"], c) for c in columns] for r in rs],
                        dtype=np.float64)

    X_train = matrix(train)
    y_train = np.array([math.log(r["label"]) for r in train])
    monotone = tuple(monotone_for(c) for c in columns)
    # The native train API (not the sklearn wrapper): the trainer then
    # needs numpy + xgboost only — one less thing to be missing on a
    # Studio that already has xgboost for the taste pipeline.
    dtrain = xgb.DMatrix(X_train, label=y_train)
    params = {
        "objective": COST_OBJECTIVE,
        "quantile_alpha": tau,
        "max_depth": max_depth,
        "eta": 0.08,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "monotone_constraints": monotone,
        "seed": seed,
    }
    evals = [(dtrain, "train")]
    if cross:
        X_cross = matrix(cross)
        y_cross = np.array([math.log(r["label"]) for r in cross])
        evals.append((xgb.DMatrix(X_cross, label=y_cross), "cross"))
    booster = xgb.train(
        params, dtrain, num_boost_round=max_rounds, evals=evals,
        early_stopping_rounds=50 if cross else None, verbose_eval=False)

    dump = [json.loads(s) for s in booster.get_dump(dump_format="json")]
    best = getattr(booster, "best_iteration", None)
    rounds_used = (best + 1) if (cross and best is not None and best >= 0) else len(dump)
    dump = dump[:rounds_used]
    try:
        gains = {}
        df = booster.trees_to_dataframe()
        for _, rowdf in df.iterrows():
            if rowdf.get("Feature") in (None, "Leaf"):
                continue
            gains.setdefault(int(rowdf["Tree"]), {})[int(rowdf["Node"])] = float(rowdf["Gain"])
    except Exception:
        gains = {}  # gains annotate the file; the walk never reads them
    names, trees = convert_xgb_dump(dump, columns, gains)

    n_trees, depth, nodes = spec_head_stats(trees)
    if n_trees > MAX_TREES or depth > MAX_TREE_DEPTH or nodes > MAX_TREE_NODES:
        raise ValueError(f"export exceeds the artifact bounds: {n_trees} trees, "
                         f"depth {depth}, {nodes} nodes")

    # Base score: reproduce the booster's own margins on the train rows.
    # The native API's predict() defaults to ALL rounds even after early
    # stopping (the sklearn wrapper is the one that respects
    # best_iteration) — so the margin reference is taken over exactly the
    # exported rounds, or the self-verification below rightly fails.
    leaf_sums = [sum(walk_spec_tree(t, r["features"], names) for t in trees) for r in train]
    margins = booster.predict(xgb.DMatrix(X_train), output_margin=True,
                              iteration_range=(0, rounds_used))
    base_score = calibrate_base_score([float(m) for m in margins], leaf_sums)

    artifact = {
        "kind": COST_HEAD_KIND,
        "objective": COST_OBJECTIVE,
        "baseScore": round(float(base_score), 6),
        "tau": tau,
        "calibration": 1.0,
        "features": names,
        "trees": trees,
    }

    # Self-verification: the exported walk must reproduce the booster's
    # margins on every train row ( conversion + base-score honesty).
    worst = 0.0
    for r, m in zip(train, margins):
        got = artifact_predict_log(artifact, r["features"])
        worst = max(worst, abs(got - float(m)))
    if worst > 1e-3:
        raise ValueError(f"export does not reproduce the booster: worst margin "
                         f"divergence {worst:.6f} log-ms on train rows")

    # Calibration on the cross cells (never the test cells, never — after
    # the no-refit rule — the train cells when cross cells exist).
    cal_rows = cross if cross else train
    cal_preds = [math.exp(artifact_predict_log(artifact, r["features"])) for r in cal_rows]
    cal_actuals = [r["label"] for r in cal_rows]
    mult = calibration_multiplier(cal_preds, cal_actuals, coverage=0.9)
    artifact["calibration"] = round(float(mult), 6)

    notes = {
        "trainRows": len(train),
        "crossRows": len(cross),
        "roundsUsed": rounds_used,
        "trees": n_trees,
        "maxDepth": depth,
        "nodes": nodes,
        "exportSelfCheckMaxMarginDivergence": worst,
        "calibrationCells": "cross" if cross else "train (no cross cells — in-sample, flagged)",
        "calibrationMultiplier": artifact["calibration"],
        "crossPinballCalibrated": pinball(
            [p * mult for p in cal_preds], cal_actuals, tau) if cross else None,
        "xgboostVersion": xgb.__version__,
    }
    return artifact, notes


def main(argv=None):
    ap = argparse.ArgumentParser(description="Train the #1578 governor cost head.")
    ap.add_argument("datasets", nargs="+", help="kc-cost-dataset v1 JSON files")
    ap.add_argument("--out", required=True, help="cost-model artifact path")
    ap.add_argument("--report", help="training report JSON path")
    ap.add_argument("--tau", type=float, default=0.9)
    ap.add_argument("--max-rounds", type=int, default=300)
    ap.add_argument("--max-depth", type=int, default=6)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args(argv)

    report = {"tool": "studio/train_cost_head.py", "datasets": a.datasets}
    try:
        rows, sources = load_rows(a.datasets)
    except (ValueError, KeyError, json.JSONDecodeError) as e:
        print(f"[train-cost] ERROR: {e}", file=sys.stderr)
        return 2
    report["sources"] = sources
    report["anySwiftShader"] = any(s["swiftShader"] for s in sources)

    # 1 — additivity first, on every device.
    per_device = {}
    for device in sorted({r["device"] for r in rows}):
        labels = {r["recipe"]: r["label"] for r in rows if r["device"] == device}
        per_device[device] = additivity_screen(labels)
    report["additivity"] = per_device
    testable = [s for s in per_device.values() if s["status"] != "indeterminate"]
    if testable and all(s["status"] == "additive" for s in testable):
        report["verdict"] = "ADDITIVE-KILL"
        if a.report:
            Path(a.report).write_text(json.dumps(report, indent=2))
        print("[train-cost] ADDITIVE — per-effect costs add within "
              f"{ADDITIVITY_TOLERANCE:.0%} on every testable device; the tier "
              "table already tells the truth. Refusing to train (issue kill path).")
        return 3

    # 2 — the xgboost gate, fail-clear.
    try:
        import xgboost  # noqa: F401
    except ImportError:
        print("[train-cost] ERROR: xgboost is not installed for this Python "
              f"({sys.executable}). Install it (pip install xgboost) and re-run — "
              "the dataset and the additivity screen above are unaffected.",
              file=sys.stderr)
        if a.report:
            Path(a.report).write_text(json.dumps(report, indent=2))
        return 2

    # 3 — shape, split, fit, calibrate, export.
    columns, exclusions = design_columns(rows)
    report["design"] = {"columns": columns, "exclusions": exclusions}
    split = assign_splits([r["recipe"] for r in rows], [r["device"] for r in rows])
    cells = [cell_of(split, r["recipe"], r["device"]) for r in rows]
    report["split"] = {
        "heldRecipes": sorted(split["held_recipes"]),
        "heldDevices": sorted(split["held_devices"]),
        "recipeLeg": split["recipe_leg"],
        "deviceLeg": split["device_leg"],
        "train": cells.count("train"),
        "cross": cells.count("cross"),
        "test": cells.count("test"),
    }
    try:
        artifact, notes = fit_and_export(
            rows, cells, columns,
            tau=a.tau, max_rounds=a.max_rounds, max_depth=a.max_depth, seed=a.seed)
    except Exception as e:  # fit/export failures are loud, never partial
        print(f"[train-cost] ERROR: training failed: {e}", file=sys.stderr)
        if a.report:
            Path(a.report).write_text(json.dumps(report, indent=2))
        return 2
    artifact["meta"] = {
        "trainedBy": "studio/train_cost_head.py",
        "tau": a.tau,
        "sources": [{"file": s["file"], "sha256": s["sha256"],
                     "swiftShader": s["swiftShader"]} for s in sources],
        "note": ("Labels from a SwiftShader environment validate machinery "
                 "only — they are not Studio/device truth."
                 if report["anySwiftShader"] else
                 "Trained on measured harness labels."),
    }
    Path(a.out).write_text(json.dumps(artifact, indent=2))
    report["fit"] = notes
    report["artifact"] = a.out
    report["verdict"] = "TRAINED"
    if a.report:
        Path(a.report).write_text(json.dumps(report, indent=2))
    print(f"[train-cost] trained: {notes['trees']} trees, depth {notes['maxDepth']}, "
          f"calibration x{notes['calibrationMultiplier']}, "
          f"export self-check divergence {notes['exportSelfCheckMaxMarginDivergence']:.2e} "
          f"-> {a.out}")
    if report["anySwiftShader"]:
        print("[train-cost] WARNING: at least one dataset is SwiftShader — this "
              "artifact validates machinery only and must never ship.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
