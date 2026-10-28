#!/usr/bin/env python3
"""Train the Governor cost head (#1578, XGBoost T4) from a kc-cost-dataset.

    ~/workspace/.venv-xgb/bin/python studio/train_cost_head.py <dataset.json> \
        [--out studio/cost-head-model.json] [--report studio/cost-head-report.json]

The dataset is produced on a real device by the bench harness
(app/src/gl/parity/costBench.mjs): one row per corpus recipe, features =
costFeatures() from app/src/hooks/costHead.mjs, label = measured frame ms.
This script fits XGBoost (objective reg:quantileerror, quantile_alpha =
TAU) on log(labelMs) and exports the artifact app/src/hooks/costHead.mjs
consumes: {kind 'xgboost-cost', objective, baseScore, calibration, tau,
features, trees}. predictMs() there returns exp(baseScore + Σ leaves) ×
calibration, so the exported trees must reproduce the booster's raw
margins on log-ms — the export mirrors studio/curator.py's taste-head
distill path (kc1-xgboost-taste-spec-2026-10-14 §§3–4): one-hot term
columns + numeric columns, the same node conversion, and baseScore set by
calibrate_base_score so the exported walk reproduces the booster whatever
its own base_score bookkeeping does.

Feature shaping follows the costHead contract, not the taste one:
  * numeric families are the nested blocks — declared 'num.<k>',
    'mech.<k>', 'probe.<k>' — and split with '<';
  * top-level string/boolean scalars are categoricals, declared by key,
    one-hot encoded as 'key=value' columns (booleans spelled
    'true'/'false', the feature_terms rule) and split with '=';
  * top-level lists (cast, castCategories) are EXCLUDED: the evaluator
    reads features[name] and equality-tests it against a string/boolean,
    which a list can never satisfy;
  * top-level numbers (castSize, v) are EXCLUDED: the contract treats
    every non-prefixed name as a categorical, whose split value must be
    a string/boolean — a numeric bag value can never equal it, so such
    a feature could never split and would only force predictMs to
    demand a key it cannot use. (v is also just the features version.)

Evaluation is grouped by recipe family — the id prefix before the first
'-' (this corpus has exactly two: 'parity' and 'grid'), so grouped
cross-validation IS leave-one-family-out: near-identical variants of a
family never straddle train/test. The calibration multiplier is chosen
from the pooled out-of-fold predictions: the smallest multiplier >= 1.0
whose calibrated predictions cover >= 90% of held-out actuals (never
calibrate down on small evidence — under-prediction is the hitch).

Everything up to the training section is stdlib-only, so the shaping,
conversion, walk and calibration math are testable with no xgboost
installed (studio/train_cost_head_selfcheck.py). The trained artifact is
gated by studio/verify_cost_model.mjs through the real JS evaluator.
"""
import argparse
import json
import math
import sys
from pathlib import Path

# ── the artifact contract (mirrors app/src/hooks/costHead.mjs) ────────────
COST_HEAD_KIND = "xgboost-cost"
COST_OBJECTIVE = "reg:quantileerror"
TAU = 0.9
MAX_TREES = 512
MAX_DEPTH = 6
MAX_NODES = 20000
NUMERIC_BLOCKS = ("num", "mech", "probe")

# Small-data hyperparameters. 25 measured rows cannot support a wide or
# deep ensemble: depth 3 / 60 rounds keeps the whole model far inside the
# artifact bounds (and the task cap of <= 80 trees, depth <= 4) while the
# quantile objective does the conservative work. eta 0.15 with
# min_child_weight 2 keeps single rows from owning leaves.
PARAMS = {"objective": COST_OBJECTIVE, "quantile_alpha": TAU,
          "max_depth": 3, "eta": 0.15, "min_child_weight": 2,
          "subsample": 0.9, "colsample_bytree": 0.8, "seed": 1578,
          "verbosity": 0}
NUM_BOOST_ROUND = 60
COVERAGE_TARGET = 0.90


def recipe_family(recipe_id: str) -> str:
    """The grouping key: the id's family prefix (before the first '-')."""
    return recipe_id.split("-", 1)[0]


# ── feature shaping (stdlib only) ─────────────────────────────────────────

def _spelled(value) -> str:
    """A categorical value as its one-hot column spells it (feature_terms
    rule: booleans lowercase)."""
    if value is True:
        return "true"
    if value is False:
        return "false"
    return str(value)


def categorical_keys(bags: list[dict]) -> list[str]:
    """Top-level keys that are scalars the evaluator can equality-test:
    present with a string/boolean value in the bags. Lists, dicts and
    top-level numbers are excluded (see the module docstring)."""
    keys = set()
    for bag in bags:
        for k, v in bag.items():
            if k in NUMERIC_BLOCKS:
                continue
            if isinstance(v, (str, bool)):
                keys.add(k)
    return sorted(keys)


def numeric_names(bags: list[dict]) -> list[str]:
    """Declared numeric feature names: '<block>.<key>' over num/mech/probe."""
    names = set()
    for bag in bags:
        for block in NUMERIC_BLOCKS:
            for k in (bag.get(block) or {}):
                names.add(f"{block}.{k}")
    return sorted(names)


def design_columns(bags: list[dict]):
    """(declared feature names, design columns) — the curator layout:
    categorical keys sorted, then numeric names sorted, as the declared
    features; one-hot 'key=value' term columns (sorted), then the numeric
    columns under their declared names, as the design."""
    cats = categorical_keys(bags)
    nums = numeric_names(bags)
    terms = sorted({f"{k}={_spelled(bag[k])}" for bag in bags for k in cats if k in bag})
    return cats + nums, terms + nums


def numeric_value(bag: dict, name: str) -> float:
    """A declared numeric feature's value in a bag (absent = 0.0, the
    evaluator's walk default)."""
    block, _, key = name.partition(".")
    v = (bag.get(block) or {}).get(key, 0.0)
    return float(v)


def design_matrix(bags: list[dict], columns: list[str]):
    """Bags -> numeric matrix rows over the design columns (one-hot
    membership 0/1 for term columns, raw values for numeric columns)."""
    import numpy as np

    X = np.zeros((len(bags), len(columns)))
    for r, bag in enumerate(bags):
        for c, colname in enumerate(columns):
            if colname.startswith(tuple(f"{b}." for b in NUMERIC_BLOCKS)):
                X[r, c] = numeric_value(bag, colname)
            else:
                key, _, value = colname.partition("=")
                if key in bag and _spelled(bag[key]) == value:
                    X[r, c] = 1.0
    return X


def project_bag(bag: dict) -> dict:
    """The evaluator-visible projection of a feature bag: the top-level
    string/boolean scalars plus the three numeric blocks. This is all
    costHead can ever read, and all the training report embeds (the cast
    lists are bulk the model never sees)."""
    out = {k: v for k, v in bag.items() if isinstance(v, (str, bool))}
    for block in NUMERIC_BLOCKS:
        if isinstance(bag.get(block), dict):
            out[block] = dict(bag[block])
    return out


# ── the spec walk (mirrors costHead.mjs walkTree / treeEq) ────────────────

def _cost_eq(a, b) -> bool:
    """costHead.js treeEq: strict equality, with a boolean on either side
    compared by its spelling ('true'/'false')."""
    if a is b or (a == b and type(a) is type(b)):
        return True
    if isinstance(a, bool) and isinstance(b, str):
        return ("true" if a else "false") == b
    if isinstance(b, bool) and isinstance(a, str):
        return a == ("true" if b else "false")
    return False


def cost_feature_value(bag: dict, name: str):
    """A declared feature's value in a bag (mirrors treeFeatureValue:
    numeric blocks read nested with absent = 0; categoricals top level)."""
    for block in NUMERIC_BLOCKS:
        if name.startswith(f"{block}."):
            return float((bag.get(block) or {}).get(name[len(block) + 1:], 0.0))
    return bag.get(name)


def walk_cost_tree(node: dict, bag: dict, names: list[str]) -> float:
    """One exported tree walked to its leaf (the app's walk, mirrored)."""
    while "leaf" not in node:
        val = cost_feature_value(bag, names[node["f"]])
        if node["op"] == "<":
            go = (isinstance(val, (int, float)) and not isinstance(val, bool)
                  and val < node["v"])
        else:
            go = _cost_eq(val, node["v"])
        node = node["y"] if go else node["n"]
    return float(node["leaf"])


def cost_leaf_sum(trees, bag, names) -> float:
    return sum(walk_cost_tree(t, bag, names) for t in trees)


def predict_cost_ms(head: dict, bag: dict) -> float:
    """The exported head applied to a bag: exp(base + Σ leaves) × calib.
    Mirrors predictMs minus its missing-feature refusal (training rows
    always carry every declared feature)."""
    return math.exp(head["baseScore"] + cost_leaf_sum(head["trees"], bag, head["features"])) \
        * (head.get("calibration") or 1)


def model_stats(head: dict):
    """(tree count, max depth, total nodes) — the app's artifact bounds."""
    def rec(node, depth):
        if "leaf" in node:
            return 1, depth
        ln, ld = rec(node["y"], depth + 1)
        rn, rd = rec(node["n"], depth + 1)
        return 1 + ln + rn, max(ld, rd)

    nodes = depth = 0
    for t in head["trees"]:
        n, d = rec(t, 0)
        nodes += n
        depth = max(depth, d)
    return len(head["trees"]), depth, nodes


# ── XGBoost dump -> exported trees (mirrors curator._convert_xgb_node) ────

def _convert_cost_node(node, columns, names, gains):
    """One XGBoost JSON-dump node -> one cost-spec node. Raises ValueError
    on a shape the spec format cannot say exactly — a bad export must
    stop the train, never approximate the model."""
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
    yes = _convert_cost_node(kids[node["yes"]], columns, names, gains)
    no = _convert_cost_node(kids[node["no"]], columns, names, gains)
    gain = round(float(gains.get(node["nodeid"], 0.0)), 6)
    if col.startswith(tuple(f"{b}." for b in NUMERIC_BLOCKS)):
        return {"f": names.index(col), "op": "<", "v": round(cond, 6),
                "y": yes, "n": no, "gain": gain}
    key, _, value = col.partition("=")
    if not value:
        raise ValueError(f"design column {col!r} is not a term column")
    if not 0.0 < cond <= 1.0:
        raise ValueError(f"one-hot column {col!r} split at {cond} is not a membership test")
    v = True if value == "true" else False if value == "false" else value
    # XGBoost routes x < cond to the yes child; on a 0/1 column that is
    # exactly 'term absent', so the spec equality node (y = feature equals
    # value) takes the children swapped. The dump's 'missing' child is
    # never consulted: the design has no missing values.
    return {"f": names.index(key), "op": "=", "v": v,
            "y": no, "n": yes, "gain": gain}


def convert_cost_dump(dump, columns, names, gains=None):
    """Parsed XGBoost JSON dump trees -> spec trees over declared names.
    `gains` is {(tree, nodeid): gain}; gains annotate the file for
    readers — the walk never reads them, so a missing gain is 0.0."""
    gains = gains or {}
    return [_convert_cost_node(t, columns, names, gains.get(i, {}))
            for i, t in enumerate(dump)]


def calibrate_base_score(margins, leaf_sums) -> float:
    """baseScore for the exported head: the median (booster margin −
    Σ exported leaves) over the rows, so exp(baseScore + Σ leaves)
    reproduces the booster's predictions whatever its own base_score
    bookkeeping does across versions. (curator.calibrate_base_score.)"""
    res = sorted(m - s for m, s in zip(margins, leaf_sums))
    if not res:
        raise ValueError("no rows to calibrate on")
    mid = len(res) // 2
    return res[mid] if len(res) % 2 else (res[mid - 1] + res[mid]) / 2


def _xgb_gains(bst, dump):
    """{(tree, nodeid): gain}: from trees_to_dataframe when pandas is
    available (curator's source), else from the dump's own gain fields
    (the export requests with_stats=True precisely so they are present),
    else parsed from a with_stats text dump; {} when none work — a
    missing gain annotates as 0.0, never an error."""
    try:
        df = bst.trees_to_dataframe()
        out: dict = {}
        for _, row in df.iterrows():
            if row.get("Feature") in (None, "Leaf"):
                continue
            out.setdefault(int(row["Tree"]), {})[int(row["Node"])] = float(row["Gain"])
        return out
    except Exception:
        pass
    out = {}

    def rec(node, tree_idx):
        if "leaf" in node:
            return
        if "gain" in node:
            out.setdefault(tree_idx, {})[int(node["nodeid"])] = float(node["gain"])
        for c in node.get("children", []):
            rec(c, tree_idx)

    for i, t in enumerate(dump or []):
        rec(t, i)
    if out:
        return out
    try:
        import re

        for t, text in enumerate(bst.get_dump(dump_format="text", with_stats=True)):
            for line in text.splitlines():
                m = re.match(r"\s*(\d+):\[.*\].*gain=([-\d.eE+]+)", line)
                if m:
                    out.setdefault(t, {})[int(m.group(1))] = float(m.group(2))
        return out
    except Exception:
        return {}


# ── coverage / calibration math (stdlib only) ─────────────────────────────

def coverage(preds, actuals, mult: float = 1.0) -> float:
    """Share of rows a (possibly multiplied) prediction covers: pred >=
    actual. The complement is the false-cheap rate."""
    pairs = list(zip(preds, actuals))
    if not pairs:
        return 0.0
    return sum(1 for p, a in pairs if mult * p >= a) / len(pairs)


def choose_calibration(preds, actuals, target: float = COVERAGE_TARGET) -> float:
    """The smallest multiplier >= 1.0 whose calibrated out-of-fold
    predictions cover >= target of the actuals. Floored at 1.0: a model
    that already covers is never calibrated down on small evidence."""
    pairs = sorted(a / p for p, a in zip(preds, actuals) if p > 0)
    if not pairs:
        return 1.0
    k = math.ceil(target * len(pairs))
    needed = pairs[min(k, len(pairs)) - 1]
    return max(1.0, needed)


def pinball_loss(preds, actuals, tau: float = TAU) -> float:
    """Mean quantile (pinball) loss on log-ms at tau — the honest score
    for a quantile head."""
    vals = []
    for p, a in zip(preds, actuals):
        e = math.log(a) - math.log(p)
        vals.append(e * tau if e >= 0 else e * (tau - 1))
    return sum(vals) / len(vals) if vals else 0.0


# ── dataset loading ───────────────────────────────────────────────────────

def load_dataset(path):
    """A kc-cost-dataset file -> (measured rows, excluded rows).
    Measured rows: {id, family, labelMs, features}; only rows with
    status 'measured' and a finite positive labelMs are trainable —
    failed rows are excluded, never imputed."""
    data = json.loads(Path(path).read_text())
    if data.get("kind") != "kc-cost-dataset":
        raise ValueError(f"{path}: not a kc-cost-dataset file")
    measured, excluded = [], []
    for row in data["rows"]:
        label = row.get("labelMs")
        if row.get("status") == "measured" and isinstance(label, (int, float)) \
                and math.isfinite(label) and label > 0:
            measured.append({"id": row["id"], "family": recipe_family(row["id"]),
                             "labelMs": float(label), "features": row["features"]})
        else:
            excluded.append({"id": row.get("id"), "status": row.get("status")})
    if len(measured) < 8:
        raise ValueError(f"{path}: only {len(measured)} measured rows — too few to train")
    return measured, excluded, data


# ── training (xgboost) ────────────────────────────────────────────────────

def _fit_booster(X, y_log, columns):
    import xgboost

    d = xgboost.DMatrix(X, label=y_log, feature_names=columns)
    return xgboost.train(PARAMS, d, num_boost_round=NUM_BOOST_ROUND, verbose_eval=False)


def _export_head(bst, columns, names, bags):
    """A trained booster -> the artifact dict (calibration set by the
    caller; 1.0 until the out-of-fold step chooses it)."""
    import xgboost

    dump = [json.loads(s) for s in bst.get_dump(dump_format="json", with_stats=True)]
    trees = convert_cost_dump(dump, columns, names, _xgb_gains(bst, dump))
    d = xgboost.DMatrix(design_matrix(bags, columns), feature_names=columns)
    margins = bst.predict(d, output_margin=True)
    leaf_sums = [cost_leaf_sum(trees, bag, names) for bag in bags]
    base = calibrate_base_score([float(m) for m in margins], leaf_sums)
    head = {"kind": COST_HEAD_KIND, "objective": COST_OBJECTIVE,
            "baseScore": round(float(base), 6), "calibration": 1,
            "tau": TAU, "features": list(names), "trees": trees}
    n_trees, depth, nodes = model_stats(head)
    if n_trees > MAX_TREES or depth > MAX_DEPTH or nodes > MAX_NODES:
        raise ValueError(f"exported head exceeds the artifact bounds "
                         f"({n_trees} trees, depth {depth}, {nodes} nodes)")
    return head


def _grouped_folds(rows):
    """Leave-one-family-out folds: [(held_out_family, train_idx, test_idx)].
    (With this corpus' two families, GroupKFold and LOFO coincide.)"""
    families = sorted({r["family"] for r in rows})
    folds = []
    for fam in families:
        test = [i for i, r in enumerate(rows) if r["family"] == fam]
        train = [i for i, r in enumerate(rows) if r["family"] != fam]
        folds.append((fam, train, test))
    return folds


def train_on_rows(rows):
    """Train + honestly evaluate. Returns (head, report) where report
    carries the fold table, the out-of-fold predictions per row, and the
    final model's in-sample predictions through the exported artifact."""
    bags = [r["features"] for r in rows]
    names, columns = design_columns(bags)
    X = design_matrix(bags, columns)
    y_log = [math.log(r["labelMs"]) for r in rows]
    import numpy as np

    y = np.asarray(y_log)

    # Grouped evaluation: each fold exports its own head and predicts its
    # held-out family by WALKING THE EXPORTED TREES, so the numbers judge
    # the artifact the app would ship, not the booster behind it.
    oof = [None] * len(rows)
    fold_reports = []
    for fam, train_idx, test_idx in _grouped_folds(rows):
        bst = _fit_booster(X[train_idx], y[train_idx], columns)
        head_f = _export_head(bst, columns, names, [bags[i] for i in train_idx])
        preds = [predict_cost_ms(head_f, bags[i]) for i in test_idx]
        for i, p in zip(test_idx, preds):
            oof[i] = p
        actuals = [rows[i]["labelMs"] for i in test_idx]
        fold_reports.append({
            "heldOutFamily": fam, "trainRows": len(train_idx), "testRows": len(test_idx),
            "coverage": round(coverage(preds, actuals), 4),
            "falseCheap": round(1 - coverage(preds, actuals), 4),
            "maeMs": round(sum(abs(p - a) for p, a in zip(preds, actuals)) / len(actuals), 3),
            "pinballLog": round(pinball_loss(preds, actuals), 4),
        })

    actuals_all = [r["labelMs"] for r in rows]
    cov_before = coverage(oof, actuals_all)
    calib = choose_calibration(oof, actuals_all)
    cov_after = coverage(oof, actuals_all, calib)

    # The shipped head: refit on every measured row, calibration from OOF.
    bst = _fit_booster(X, y, columns)
    head = _export_head(bst, columns, names, bags)
    head["calibration"] = round(float(calib), 6)
    n_trees, depth, nodes = model_stats(head)
    in_sample = [predict_cost_ms(head, bag) for bag in bags]

    report = {
        "folds": fold_reports,
        "oof": {"coverageBeforeCalibration": round(cov_before, 4),
                "falseCheapBeforeCalibration": round(1 - cov_before, 4),
                "coverageAfterCalibration": round(cov_after, 4),
                "falseCheapAfterCalibration": round(1 - cov_after, 4),
                "pinballLogBeforeCalibration": round(pinball_loss(oof, actuals_all), 4),
                "calibration": head["calibration"]},
        "model": {"trees": n_trees, "maxDepth": depth, "nodes": nodes,
                  "baseScore": head["baseScore"], "calibration": head["calibration"],
                  "tau": TAU},
        "features": {"declared": names, "designColumns": len(columns)},
        "rows": [{"id": r["id"], "family": r["family"], "labelMs": r["labelMs"],
                  "features": project_bag(r["features"]),
                  "oofPredMs": round(oof[i], 6),
                  "oofCalibratedMs": round(oof[i] * calib, 6),
                  "inSamplePredMs": round(in_sample[i], 6)}
                 for i, r in enumerate(rows)],
    }
    return head, report


def main(argv=None):
    ap = argparse.ArgumentParser(description="Train the KC-1 governor cost head (#1578).")
    ap.add_argument("dataset", help="kc-cost-dataset JSON (from costBench.mjs)")
    here = Path(__file__).resolve().parent
    ap.add_argument("--out", default=str(here / "cost-head-model.json"))
    ap.add_argument("--report", default=str(here / "cost-head-report.json"))
    args = ap.parse_args(argv)

    try:
        import xgboost  # noqa: F401
    except ImportError:
        print("xgboost is not installed — use the project venv: "
              "~/workspace/.venv-xgb/bin/python", file=sys.stderr)
        return 2

    rows, excluded, data = load_dataset(args.dataset)
    head, report = train_on_rows(rows)
    families = {}
    for r in rows:
        families[r["family"]] = families.get(r["family"], 0) + 1
    report = {"dataset": {"path": str(args.dataset), "kind": data.get("kind"),
                          "version": data.get("version"),
                          "generatedAt": data.get("generatedAt"),
                          "environment": data.get("environment"),
                          "rowsTotal": len(data["rows"]),
                          "rowsMeasured": len(rows), "excluded": excluded,
                          "families": families},
              "hyperparams": {**PARAMS, "numBoostRound": NUM_BOOST_ROUND,
                              "target": "log(labelMs)", "coverageTarget": COVERAGE_TARGET},
              **report}
    Path(args.out).write_text(json.dumps(head, indent=1) + "\n")
    Path(args.report).write_text(json.dumps(report, indent=1) + "\n")

    o = report["oof"]
    print(f"cost head: {len(rows)} measured rows "
          f"({', '.join(f'{k} {v}' for k, v in sorted(families.items()))}), "
          f"{len(excluded)} excluded")
    for f in report["folds"]:
        print(f"  fold hold out {f['heldOutFamily']}: coverage {f['coverage']:.3f}, "
              f"false-cheap {f['falseCheap']:.3f}, MAE {f['maeMs']} ms "
              f"({f['testRows']} rows)")
    print(f"  OOF pooled: coverage {o['coverageBeforeCalibration']:.3f} -> "
          f"{o['coverageAfterCalibration']:.3f} at calibration x{o['calibration']}; "
          f"false-cheap {o['falseCheapBeforeCalibration']:.3f} -> "
          f"{o['falseCheapAfterCalibration']:.3f}")
    m = report["model"]
    print(f"  model: {m['trees']} trees, depth <= {m['maxDepth']}, {m['nodes']} nodes, "
          f"baseScore {m['baseScore']}")
    print(f"  wrote {args.out} + {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
