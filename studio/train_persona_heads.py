#!/usr/bin/env python3
"""Persona Adapters A2 (#2395): the Mac Studio trainer for the persona steering heads.

    python3 studio/train_persona_heads.py train --rows <rows.json> --taste <taste.json>
        [--store <dir>] [--force] [--now <iso8601>] [--report <report.json>]
    python3 studio/train_persona_heads.py rollback --id <persona> --kind <solo|trade|cut>
        --taste <taste.json> [--store <dir>] [--now <iso8601>]

personaRows.mjs turns A0's labeled turns into encoded rows; this trainer fits one gradient-boosted
tree head per persona per decision kind and ships it into taste.json's `personas` section (A1's
shipped shape) — but only when it earns the slot. The rulings on #2395 (Matt, 2026-11-20) are the
contract, enforced here:

  Q1  Rows carry only the live-true features (personaRows' law); the trainer trains on exactly
      what the rows carry and nothing else.
  Q2  heldOut = Spearman(the head's keep-probability, the label weight) on held-out turns.
  Q3  The held-out split is BY TAKE (a take is wholly train or wholly held-out — decisions inside
      one performance are not independent evidence), deterministic (a hash order over take seeds,
      stable across runs and machines), ~80/20 by turns with a floor of 30 held-out turns: below
      the floor nothing ships that run.
  Q4  Beat-the-old is a strict beat on the SAME held-out slice with the same metric, no margin.
      A first-ever head ships only at heldOut >= 0.3 (HEAD_MIN_FIDELITY, A1's bar); below the bar
      it never enters taste.json.
  Q5  The rollback unit is the per-persona-per-kind entry: the store keeps every shipped version's
      entry artifact; rollback restores that entry's previous-version artifact exactly, and past
      version 1 it removes the entry — nothing else in taste.json changes.
  Q6  labeledTurns stamped on an entry counts ALL labeled turns for that persona x kind
      (train + held-out) — A1's earn-in gate reads it, so it must be the whole corpus, not the fit.

The watermark rule (A3 will be a dumb clock on top of it): an entry is retrained only when its
labeled-turn count grew since the last attempt that actually fit a challenger (shipped, rejected,
or below the bar); --force overrides. Floor and no-fit attempts do not move the watermark — a
corpus that could not be judged yet is retried when it grows, not remembered as judged.

Incumbents are read through a shape gate: every personas entry is validated up front against
A1's rules (mirrored below), and an entry that fails is no incumbent for its slot — a malformed
entry in the file can never crash a run after earlier entries have written to the store.

Stdlib for shaping / split / store / rollback; xgboost is imported only inside the fit step
(train_cost_head.py's shape), so CI — which has no xgboost — runs the stdlib selfcheck with
fixture heads of known scores. Head conversion, base-score calibration, the spec walk and the
Spearman rank correlation are curator.py's own functions, imported, so the trainer can never
drift from the pipeline that ships the taste head.

The store lives beside taste.json: <taste dir>/persona-heads/<id>/<kind>/v<n>.json holds each
shipped version's entry artifact exactly as written, and history.jsonl logs every train attempt
(held-out scores, verdict) and every rollback. Versions are per-entry monotonic and never reused:
a band record's head stamp cites (id, kind, version), so a version number must name one artifact
forever — a rolled-back entry that later re-ships takes the NEXT number, not the recycled one.
"""
import argparse
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import curator  # noqa: E402  (stdlib-only at import; xgboost loads lazily inside its fit helpers)

ROWS_FORMAT = "kc-persona-rows"
ROWS_VERSION = 1
REPORT_FORMAT = "kc-persona-train-report"
REPORT_VERSION = 1
DECISION_FEATURES_VERSION = 1
HEAD_MIN_FIDELITY = 0.3  # A1's bar (tasteHead.js HEAD_MIN_FIDELITY) — Q4's first-head floor.
HELDOUT_FLOOR = 30  # Q3: below this many held-out turns, nothing ships that run.
HELDOUT_FRACTION = 0.2  # Q3: ~80/20 by turns.
XGB_ROUNDS = 60
XGB_MAX_DEPTH = 3
XGB_SEED = 1723

# The trainable entries (spec §2/§5): solo x4 soloists, trade x5 answerers, the governor's cut x1.
# The Queen is never a persona head; personas outside this table are never trained.
TRAINABLE = {
    "solo": ("davis", "carson", "greiman", "ashworth"),
    "trade": ("davis", "lois", "carson", "greiman", "ashworth"),
    "cut": ("governor",),
}
ENTRY_KEYS = [(pid, kind) for kind in ("solo", "trade", "cut") for pid in TRAINABLE[kind]]


def canonical(obj):
    """The taste file's canonical write (curator.py's form): sorted keys, indent 1."""
    return json.dumps(obj, indent=1, sort_keys=True)


def utc_now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── the store ────────────────────────────────────────────────────────────────────────────────────

def default_store(taste_path):
    return os.path.join(os.path.dirname(os.path.abspath(taste_path)), "persona-heads")


def store_artifact_path(store, pid, kind, version):
    return os.path.join(store, pid, kind, f"v{version}.json")


def stored_versions(store, pid, kind):
    d = os.path.join(store, pid, kind)
    out = []
    if os.path.isdir(d):
        for name in os.listdir(d):
            if name.startswith("v") and name.endswith(".json"):
                try:
                    out.append(int(name[1:-5]))
                except ValueError:
                    pass
    return sorted(out)


def read_history(store):
    path = os.path.join(store, "history.jsonl")
    records = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return records


def append_history(store, record):
    os.makedirs(store, exist_ok=True)
    with open(os.path.join(store, "history.jsonl"), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, sort_keys=True) + "\n")


def watermark(records, pid, kind):
    """The labeled-turn count of the entry's last JUDGED attempt (a challenger was fit and scored:
    shipped, rejected, or below the bar). Floor / no-fit / skipped attempts never set it."""
    mark = None
    for rec in records:
        if (
            rec.get("action") == "train"
            and rec.get("id") == pid
            and rec.get("kind") == kind
            and rec.get("verdict") in ("shipped", "rejected", "below-bar")
        ):
            mark = rec.get("labeledTurns")
    return mark


# ── the split (Q3) ───────────────────────────────────────────────────────────────────────────────

def split_rows(rows, pid, kind):
    """Deterministic by-take split of one entry's labeled rows. Takes are ordered by a salted hash
    of their seed (the salt is the entry, so each entry's split is its own), then dealt to the
    held-out side whole until it holds at least max(floor, 20% of turns) — never splitting a take.
    Returns (train_idx, held_idx): indices into `rows`, each in the rows' own order."""
    labeled = [i for i, r in enumerate(rows) if r.get("weight") != 0]
    by_take = {}
    for i in labeled:
        by_take.setdefault(rows[i].get("takeSeed"), []).append(i)
    salt = f"{pid}|{kind}"
    order = sorted(by_take, key=lambda s: hashlib.sha256(f"{salt}:{s}".encode()).hexdigest())
    target = max(HELDOUT_FLOOR, math.ceil(HELDOUT_FRACTION * len(labeled)))
    held = set()
    held_count = 0
    for seed in order:
        if held_count >= target:
            break
        held.update(by_take[seed])
        held_count += len(by_take[seed])
    train_idx = [i for i in labeled if i not in held]
    held_idx = [i for i in labeled if i in held]
    return train_idx, held_idx


# ── the fit (xgboost lives only here) ────────────────────────────────────────────────────────────

def feature_columns(rows, idx):
    """The design-matrix columns for the fit, in curator.convert_xgb_dump's layout: categorical
    terms first (feature_terms' one term rule over the row vectors), then num.* sorted."""
    cats = set()
    nums = set()
    for i in idx:
        feats = rows[i].get("features") or {}
        cats.update(curator.feature_terms(feats))
        for key in feats.get("num") or {}:
            nums.add(f"num.{key}")
    return sorted(cats) + sorted(nums)


def fit_head_xgb(rows, train_idx, columns):
    """Fit one challenger on the train slice and convert it to a spec head (curator's converter +
    calibrator). Returns None when the slice cannot carry a fit (a single class)."""
    import xgboost as xgb  # the fit step is the only place xgboost exists

    def matrix(idxs):
        X, y, w = [], [], []
        for i in idxs:
            feats = rows[i].get("features") or {}
            terms = set(curator.feature_terms(feats))
            num = feats.get("num") or {}
            X.append(
                [
                    (1.0 if col in terms else 0.0)
                    if not col.startswith("num.")
                    else float(num.get(col[4:], 0.0) or 0.0)
                    for col in columns
                ]
            )
            y.append(1 if rows[i]["weight"] > 0 else 0)
            w.append(abs(float(rows[i]["weight"])))
        return X, y, w

    X, y, w = matrix(train_idx)
    if len(set(y)) < 2:
        return None
    dtrain = xgb.DMatrix(X, label=y, weight=w, feature_names=columns)
    params = {
        "objective": "binary:logistic",
        "max_depth": XGB_MAX_DEPTH,
        "eta": 0.15,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "seed": XGB_SEED,
        "verbosity": 0,
    }
    booster = xgb.train(params, dtrain, num_boost_round=XGB_ROUNDS)
    # get_dump returns JSON STRINGS; the converter eats parsed dicts (curator.py's own pattern).
    dump = [json.loads(s) for s in booster.get_dump(dump_format="json")]
    names, trees = curator.convert_xgb_dump(dump, columns, curator._xgb_gains(booster))
    margins = [float(m) for m in booster.predict(dtrain, output_margin=True)]
    leaf_sums = [
        curator._spec_leaf_sum(trees, rows[i].get("features") or {}, names) for i in train_idx
    ]
    return {
        "kind": "xgboost-trees",
        "objective": "binary:logistic",
        "baseScore": curator.calibrate_base_score(margins, leaf_sums),
        "fidelity": 0.0,  # stamped by the caller with the held-out score once judged
        "fitOn": len(train_idx),
        "features": names,
        "trees": trees,
    }


def head_scores(head, rows, idx):
    """The head's keep-probability per row (curator's spec walk — the same walk the app mirrors)."""
    return [curator.score_spec_head(head, rows[i].get("features") or {}) for i in idx]


def heldout_score(head, rows, idx):
    return curator.spearman(head_scores(head, rows, idx), [rows[i]["weight"] for i in idx])


# ── the incumbent shape gate (A1's rules, mirrored) ──────────────────────────────────────────────
# The trainer reads taste.json's personas section as its incumbents, and a malformed entry must
# never crash a run mid-loop — ships write the store and history per entry while the CLI writes
# taste.json only at the end, so a crash on entry k would leave earlier entries recorded as
# shipped but absent from taste.json (and watermark-skipped until the corpus grows). So every
# incumbent is validated UP FRONT, before any write, against A1's shape rules (tasteHead.js's
# validatePersonasSection + validateTreeHeadFor, mirrored for the v1 decision universe below).
# An entry that fails is no incumbent for its slot: the slot is judged as a first head and a
# ship overwrites the broken entry — the same degradation the "head not a dict" case always had,
# extended to every shape failure. The mirror is pinned to decisionFeatures.mjs's live universe
# by the selfcheck; it can only ever be applied to featuresVersion-1 entries (the version check
# below), so a future universe bump cannot make it stale for the entries it judges.

PERSONA_HEAD_IDS = ("governor", "davis", "lois", "carson", "greiman", "ashworth")
HEAD_STRUCTURE = {  # tasteHead.js PERSONA_HEAD_STRUCTURE: who may hold a head of each kind
    "solo": ("davis", "carson", "greiman", "ashworth"),
    "trade": ("davis", "lois", "carson", "greiman", "ashworth"),
    "cut": ("governor",),
}
MAX_TREES = 512  # tasteHead.js MAX_TREES (== curator.XGB_MAX_TREES)
MAX_TREE_DEPTH = 6  # tasteHead.js MAX_TREE_DEPTH (== curator.XGB_MAX_DEPTH)
MAX_TREE_NODES = 20000  # tasteHead.js MAX_TREE_NODES (== curator.XGB_MAX_NODES)
# decisionFeatureNames() at DECISION_FEATURES_VERSION 1 (decisionFeatures.mjs + recipeFeatures v4).
DECISION_FEATURE_NAMES = frozenset(
    "phase caller verdict move target".split()
    + (
        "recipe.system recipe.symmetry recipe.behave recipe.blend recipe.paletteShift "
        "recipe.palette recipe.accum recipe.mirror recipe.bleed recipe.overlap recipe.bodies "
        "recipe.density recipe.scale"
    ).split()
    + (
        "num.bar num.bpm num.energy num.beatConfidence num.density num.coverage num.heat "
        "num.recentKeepRate num.pressure num.soloAge"
    ).split()
    + (
        "num.recipe.count num.recipe.scaleMid num.recipe.rotateSpread num.recipe.alphaMid "
        "num.recipe.jitter num.recipe.density num.recipe.zTiers num.recipe.noiseFreq "
        "num.recipe.noiseSpeed num.recipe.displacement num.recipe.particleCount "
        "num.recipe.swarmCohesion num.recipe.gravityWells num.recipe.damping num.recipe.wind "
        "num.recipe.flap num.recipe.breath num.recipe.lifeDrift"
    ).split()
)


def _finite(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _is_int(x):
    """JSON integral (JS Number.isInteger): a Python int, or a float with no fraction."""
    return (isinstance(x, int) and not isinstance(x, bool)) or (
        isinstance(x, float) and x.is_integer()
    )


def _node_ok(node, features, depth, counter):
    """validateTreeNode, mirrored: a leaf {leaf} or a split {f, op, v, y, n, gain} inside the
    artifact bounds (node count, depth), every number the walk reads finite."""
    if not isinstance(node, dict):
        return False
    counter[0] += 1
    if counter[0] > MAX_TREE_NODES or depth > MAX_TREE_DEPTH:
        return False
    if "leaf" in node:
        return _finite(node["leaf"])
    f = node.get("f")
    if not _is_int(f) or f < 0 or f >= len(features):
        return False
    op, v = node.get("op"), node.get("v")
    if features[int(f)].startswith("num."):
        if op != "<" or not _finite(v):
            return False
    elif op != "=" or not (isinstance(v, str) or isinstance(v, bool)):
        return False
    if not _finite(node.get("gain")):
        return False
    return _node_ok(node.get("y"), features, depth + 1, counter) and _node_ok(
        node.get("n"), features, depth + 1, counter
    )


def _head_ok(head):
    """validateTreeHeadFor against the decision universe, mirrored."""
    if not isinstance(head, dict):
        return False
    if head.get("objective") != "binary:logistic":
        return False
    if not _finite(head.get("baseScore")):
        return False
    if not _finite(head.get("fidelity")) or not -1 <= head["fidelity"] <= 1:
        return False
    features = head.get("features")
    if not isinstance(features, list) or not features:
        return False
    if any(not isinstance(n, str) or n not in DECISION_FEATURE_NAMES for n in features):
        return False
    if len(set(features)) != len(features):
        return False
    trees = head.get("trees")
    if not isinstance(trees, list) or not trees or len(trees) > MAX_TREES:
        return False
    counter = [0]
    return all(_node_ok(t, features, 0, counter) for t in trees)


def incumbent_entry_ok(pid, kind, entry):
    """A1's per-entry shape rules (validatePersonasSection). Total: any garbage returns False."""
    if pid not in PERSONA_HEAD_IDS or pid not in HEAD_STRUCTURE.get(kind, ()):
        return False
    if not isinstance(entry, dict):
        return False
    if not _is_int(entry.get("version")) or entry["version"] < 1:
        return False
    if entry.get("kind") != kind:
        return False
    if not _is_int(entry.get("labeledTurns")) or entry["labeledTurns"] < 0:
        return False
    if not _finite(entry.get("heldOut")) or not -1 <= entry["heldOut"] <= 1:
        return False
    if entry.get("featuresVersion") != DECISION_FEATURES_VERSION:
        return False
    return _head_ok(entry.get("head"))


# ── train ────────────────────────────────────────────────────────────────────────────────────────

def train(rows_artifact, taste, taste_path, store, force=False, now=None, fit_fn=None):
    """One training pass. Mutates `taste` only where a head ships; the caller writes the file only
    when the returned report says something shipped (a no-ship run leaves taste.json byte-unchanged).
    fit_fn(rows, train_idx, columns) -> spec head | None is injectable for the stdlib selfcheck;
    the CLI passes fit_head_xgb."""
    if rows_artifact.get("format") != ROWS_FORMAT or rows_artifact.get("version") != ROWS_VERSION:
        raise ValueError(f"not a {ROWS_FORMAT} v{ROWS_VERSION} artifact")
    if rows_artifact.get("featuresVersion") != DECISION_FEATURES_VERSION:
        raise ValueError(
            f"rows carry featuresVersion {rows_artifact.get('featuresVersion')}, "
            f"this trainer writes {DECISION_FEATURES_VERSION}"
        )
    fit_fn = fit_fn or fit_head_xgb
    now = now or utc_now_iso()
    rows = rows_artifact.get("rows") or []
    history = read_history(store)
    personas = taste.get("personas") if isinstance(taste.get("personas"), dict) else {}
    # The incumbents, validated up front (the shape gate above): a malformed entry is no
    # incumbent for its slot, so nothing inside the loop can crash on the file's own contents
    # after earlier entries have written to the store.
    incumbents = {}
    for pid, kind in ENTRY_KEYS:
        by_kind = personas.get(pid)
        raw_entry = by_kind.get(kind) if isinstance(by_kind, dict) else None
        incumbents[(pid, kind)] = raw_entry if incumbent_entry_ok(pid, kind, raw_entry) else None
    entries = []
    shipped_any = False
    for pid, kind in ENTRY_KEYS:
        erows = [r for r in rows if r.get("id") == pid and r.get("kind") == kind]
        labeled_count = sum(1 for r in erows if r.get("weight") != 0)
        entry = {"id": pid, "kind": kind, "labeledTurns": labeled_count}
        entries.append(entry)
        if labeled_count == 0:
            entry["verdict"] = "no-corpus"
            continue
        mark = watermark(history, pid, kind)
        if not force and mark is not None and labeled_count <= mark:
            entry["verdict"] = "skipped-watermark"
            continue
        train_idx, held_idx = split_rows(erows, pid, kind)
        entry["trainTurns"] = len(train_idx)
        entry["heldOutTurns"] = len(held_idx)
        if len(held_idx) < HELDOUT_FLOOR or not train_idx:
            entry["verdict"] = "heldout-floor"
            _log_train(store, now, entry)
            continue
        columns = feature_columns(erows, train_idx)
        head = fit_fn(erows, train_idx, columns)
        if head is None:
            entry["verdict"] = "no-fit"
            _log_train(store, now, entry)
            continue
        n_trees, depth, n_nodes = curator.spec_head_stats(head)
        if (
            n_trees > curator.XGB_MAX_TREES
            or depth > curator.XGB_MAX_DEPTH
            or n_nodes > curator.XGB_MAX_NODES
        ):
            entry["verdict"] = "no-fit"
            entry["note"] = (
                f"challenger exceeds the shipped head bounds "
                f"({n_trees} trees, depth {depth}, {n_nodes} nodes)"
            )
            _log_train(store, now, entry)
            continue
        challenger = heldout_score(head, erows, held_idx)
        incumbent_entry = incumbents[(pid, kind)]
        incumbent = (
            heldout_score(incumbent_entry["head"], erows, held_idx)
            if incumbent_entry is not None
            else None
        )
        entry["challengerHeldOut"] = challenger
        entry["incumbentHeldOut"] = incumbent
        entry["heldOutRows"] = held_idx
        entry["pythonScores"] = head_scores(head, erows, held_idx)
        if incumbent is None and challenger < HEAD_MIN_FIDELITY:
            entry["verdict"] = "below-bar"  # Q4: a first head under the bar never enters taste.json
            _log_train(store, now, entry)
            continue
        if incumbent is not None and not challenger > incumbent:
            entry["verdict"] = "rejected"  # Q4: beat-the-old is a strict beat, same slice, no margin
            _log_train(store, now, entry)
            continue
        # Ship it.
        head = dict(head)
        head["fidelity"] = challenger
        highest = max(
            [incumbent_entry["version"] if incumbent_entry else 0]
            + stored_versions(store, pid, kind)
        )
        version = highest + 1
        shipped = {
            "version": version,
            "kind": kind,
            "head": head,
            "labeledTurns": labeled_count,  # Q6: ALL labeled turns, train + held-out
            "heldOut": challenger,
            "trainedAt": now,
            "featuresVersion": DECISION_FEATURES_VERSION,
        }
        os.makedirs(os.path.join(store, pid, kind), exist_ok=True)
        with open(store_artifact_path(store, pid, kind, version), "w", encoding="utf-8") as fh:
            fh.write(canonical(shipped))
        taste.setdefault("personas", {}).setdefault(pid, {})[kind] = shipped
        personas = taste["personas"]
        entry["verdict"] = "shipped"
        entry["version"] = version
        entry["heldOut"] = challenger
        shipped_any = True
        _log_train(store, now, entry)
    return {"entries": entries, "shipped": shipped_any}


def _log_train(store, now, entry):
    append_history(
        store,
        {
            "ts": now,
            "action": "train",
            "id": entry["id"],
            "kind": entry["kind"],
            "labeledTurns": entry.get("labeledTurns"),
            "trainTurns": entry.get("trainTurns"),
            "heldOutTurns": entry.get("heldOutTurns"),
            "challengerHeldOut": entry.get("challengerHeldOut"),
            "incumbentHeldOut": entry.get("incumbentHeldOut"),
            "verdict": entry["verdict"],
            **({"version": entry["version"]} if "version" in entry else {}),
        },
    )


# ── rollback (Q5) ────────────────────────────────────────────────────────────────────────────────

def rollback(taste, pid, kind, store, now=None):
    """Restore the entry's previous-version artifact from the store; past version 1, remove the
    entry (pruning the persona, then the section, when they empty). Mutates `taste`; returns the
    history record. Raises without touching anything when there is nothing to roll back to, the
    shipped entry is itself malformed, or the stored artifact is missing/mismatched — a rollback
    that cannot restore exactly does not run."""
    if pid not in TRAINABLE.get(kind, ()):
        raise ValueError(f"not a trainable entry: {pid}|{kind}")
    now = now or utc_now_iso()
    personas = taste.get("personas") if isinstance(taste.get("personas"), dict) else {}
    current = (personas.get(pid) or {}).get(kind)
    if not current:
        raise ValueError(f"no shipped entry for {pid}|{kind} — nothing to roll back")
    if not incumbent_entry_ok(pid, kind, current):
        raise ValueError(f"shipped entry for {pid}|{kind} is malformed — refusing to roll back")
    version = current["version"]
    record = {"ts": now, "action": "rollback", "id": pid, "kind": kind, "fromVersion": version}
    if version <= 1:
        del personas[pid][kind]
        if not personas[pid]:
            del personas[pid]
        if not personas:
            del taste["personas"]
        record["toVersion"] = None
    else:
        path = store_artifact_path(store, pid, kind, version - 1)
        if not os.path.exists(path):
            raise ValueError(f"store artifact missing for {pid}|{kind} v{version - 1}: {path}")
        with open(path, encoding="utf-8") as fh:
            prior = json.load(fh)
        if prior.get("version") != version - 1 or prior.get("kind") != kind:
            raise ValueError(f"store artifact mismatch for {pid}|{kind} v{version - 1}: {path}")
        personas[pid][kind] = prior
        record["toVersion"] = version - 1
    append_history(store, record)
    return record


# ── CLI ──────────────────────────────────────────────────────────────────────────────────────────

def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Persona head trainer (A2, #2395)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--rows", required=True)
    t.add_argument("--taste", required=True)
    t.add_argument("--store")
    t.add_argument("--force", action="store_true")
    t.add_argument("--now")
    t.add_argument("--report")
    r = sub.add_parser("rollback")
    r.add_argument("--id", required=True)
    r.add_argument("--kind", required=True, choices=["solo", "trade", "cut"])
    r.add_argument("--taste", required=True)
    r.add_argument("--store")
    r.add_argument("--now")
    args = ap.parse_args(argv)

    store = args.store or default_store(args.taste)
    taste = load_json(args.taste) if os.path.exists(args.taste) else {}
    if args.cmd == "train":
        now = args.now or utc_now_iso()
        result = train(load_json(args.rows), taste, args.taste, store, force=args.force, now=now)
        if result["shipped"]:
            with open(args.taste, "w", encoding="utf-8") as fh:
                fh.write(canonical(taste))
        report = {
            "format": REPORT_FORMAT,
            "version": REPORT_VERSION,
            "trainedAt": now,
            "entries": result["entries"],
        }
        if args.report:
            with open(args.report, "w", encoding="utf-8") as fh:
                fh.write(canonical(report))
        for e in result["entries"]:
            extra = ""
            if e["verdict"] == "shipped":
                extra = f" -> v{e['version']} (heldOut {e['heldOut']:.3f})"
            elif e.get("challengerHeldOut") is not None:
                inc = e.get("incumbentHeldOut")
                extra = f" (challenger {e['challengerHeldOut']:.3f}" + (
                    f" vs incumbent {inc:.3f}" if inc is not None else ", no incumbent"
                ) + ")"
            print(f"[train] {e['id']}|{e['kind']}: {e['verdict']}{extra}")
        print(f"[train] taste.json {'updated' if result['shipped'] else 'unchanged'}")
    else:
        record = rollback(taste, args.id, args.kind, store, now=args.now)
        with open(args.taste, "w", encoding="utf-8") as fh:
            fh.write(canonical(taste))
        print(
            f"[rollback] {args.id}|{args.kind}: v{record['fromVersion']} -> "
            + (f"v{record['toVersion']}" if record["toVersion"] is not None else "entry removed")
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
