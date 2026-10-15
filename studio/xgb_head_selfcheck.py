#!/usr/bin/env python3
"""Selfcheck for the XGBoost taste head export (spec T1, issue #762 lineage).

    python3 studio/xgb_head_selfcheck.py

Proves the parts that must be right before any model is trained: an XGBoost
JSON dump converts to spec trees that WALK to the same leaves the booster
would, the base-score calibration recovers the booster's margin offset,
the ship rule only ships a winner, and the guarded fit path degrades to a
clear note — never a traceback — when xgboost is not installed.

Stdlib only: synthetic dumps and trees throughout, no xgboost, no numpy.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import curator  # noqa: E402

# ── a synthetic XGBoost dump, in get_dump(dump_format='json') shape ───────
# Columns are the linear head's own design: one-hot terms + the num block.
COLUMNS = ["density=high", "density=low", "accum=true", "num.count"]
DUMP = [
    {"nodeid": 0, "depth": 0, "split": "density=high", "split_condition": 0.5,
     "yes": 1, "no": 2, "missing": 1, "gain": 12.5,
     "children": [
         {"nodeid": 1, "leaf": -0.5},
         {"nodeid": 2, "depth": 1, "split": "num.count", "split_condition": 0.5,
          "yes": 3, "no": 4, "missing": 3, "gain": 4.25,
          "children": [{"nodeid": 3, "leaf": 0.75}, {"nodeid": 4, "leaf": -0.25}]},
     ]},
    {"nodeid": 0, "depth": 0, "split": "accum=true", "split_condition": 0.5,
     "yes": 1, "no": 2, "missing": 2, "gain": 2.0,
     "children": [{"nodeid": 1, "leaf": 0.1}, {"nodeid": 2, "leaf": 0.3}]},
]
GAINS = {0: {0: 12.5, 2: 4.25}, 1: {0: 2.0}}

names, trees = curator.convert_xgb_dump(DUMP, COLUMNS, GAINS)
assert names == ["accum", "density", "num.count"], names
root = trees[0]
# the one-hot split became an equality split on the parent feature, with
# the children swapped (XGBoost's yes child is 'term absent' on a 0/1 column)
assert root["op"] == "=" and root["v"] == "high" and root["f"] == names.index("density")
assert root["gain"] == 12.5, "gains ride along from trees_to_dataframe"
assert root["n"] == {"leaf": -0.5}, "term absent -> the dump's yes child"
inner = root["y"]
assert inner["op"] == "<" and inner["v"] == 0.5 and inner["f"] == names.index("num.count")
assert inner["y"] == {"leaf": 0.75} and inner["n"] == {"leaf": -0.25}
# a boolean term converts to a real boolean value, not the string 'true'
assert trees[1]["v"] is True and trees[1]["op"] == "="


def xgb_walk(node, row):
    """The booster's own semantics over a one-hot row, for parity."""
    while "leaf" not in node:
        x = row.get(node["split"], 0.0)
        node = next(c for c in node["children"]
                    if c["nodeid"] == (node["yes"] if x < node["split_condition"] else node["no"]))
    return float(node["leaf"])


CASES = [
    # (features dict, expected Σ leaves over both trees)
    ({"density": "high", "accum": True, "num": {"count": 0.1}}, 0.75 + 0.3),
    ({"density": "high", "accum": False, "num": {"count": 0.9}}, -0.25 + 0.1),
    ({"density": "low", "accum": True, "num": {"count": 0.1}}, -0.5 + 0.3),
    ({"density": "mid", "accum": False, "num": {"count": 0.0}}, -0.5 + 0.1),
]
for feats, expected in CASES:
    got = curator._spec_leaf_sum(trees, feats, names)
    assert abs(got - expected) < 1e-12, (feats, got, expected)
    # parity: the same rows walked in booster semantics over one-hot rows
    row = {"density=high": 1.0 if feats["density"] == "high" else 0.0,
           "density=low": 1.0 if feats["density"] == "low" else 0.0,
           "accum=true": 1.0 if feats["accum"] else 0.0,
           "num.count": feats["num"]["count"]}
    boosted = sum(xgb_walk(t, row) for t in DUMP)
    assert abs(boosted - got) < 1e-12, (feats, boosted, got)

# an unknown split feature is an export error, never an approximation
try:
    curator.convert_xgb_dump([{"nodeid": 0, "split": "nope=1", "split_condition": 0.5,
                               "yes": 1, "no": 1, "children": [{"nodeid": 1, "leaf": 0.0}]}], COLUMNS)
    raise AssertionError("unknown split feature must refuse")
except ValueError as e:
    assert "unknown feature" in str(e)
# an f-index split binds by position, as a nameless dump would print it
_, idx_trees = curator.convert_xgb_dump(
    [{"nodeid": 0, "split": "f3", "split_condition": 0.25, "yes": 1, "no": 2,
      "children": [{"nodeid": 1, "leaf": 1.0}, {"nodeid": 2, "leaf": 2.0}]}], COLUMNS)
assert idx_trees[0]["op"] == "<" and idx_trees[0]["v"] == 0.25

# ── score: sigmoid(baseScore + Σ leaves), the number the JS suite pins ────
head = {"kind": curator.XGB_HEAD_KIND, "objective": "binary:logistic", "baseScore": 0.25,
        "fidelity": 0.9, "fitOn": 400, "features": ["density"],
        "trees": [{"f": 0, "op": "=", "v": "high", "gain": 5.0,
                   "y": {"leaf": 1.0}, "n": {"leaf": 0.0}}]}
p = curator.score_spec_head(head, {"density": "high"})
assert abs(p - 0.7772998611746911) < 1e-12, p  # sigmoid(1.25), hand-computed
assert abs(curator.score_spec_head(head, {"density": "low"}) - 0.5621765008857981) < 1e-12
assert curator.spec_head_stats(head) == (1, 1, 3)

# ── calibration recovers the booster's margin offset ──────────────────────
base = curator.calibrate_base_score([2.0, 3.0, 4.0, 5.0], [1.5, 2.5, 3.4, 4.6])
assert abs(base - 0.5) < 1e-12, base  # residuals .5 .5 .6 .4 -> median .5
assert curator.calibrate_base_score([1.0], [0.25]) == 0.75

# ── the ship rule: trees ship only on a held-out win ──────────────────────
kind, reason = curator.choose_head(0.81, 0.72)
assert kind == curator.XGB_HEAD_KIND and reason is None
kind, reason = curator.choose_head(0.72, 0.72)
assert kind == "linear" and "did not beat" in reason, "a tie is not a win"
kind, reason = curator.choose_head(None, 0.72)
assert kind == "linear" and reason

# ── describe_trees prints the model (spec: printable or it doesn't ship) ──
text = curator.describe_trees({"features": names, "trees": trees})
assert "2 trees" in text and "density" in text and "num.count < 0.5" in text, text
assert "+0.7500" in text, "leaf margins print signed"

# ── the guarded fit: no xgboost (or a puddle of a pool) -> a clear note ───
rows = [{"density": "high", "num": {"count": 0.5}} for _ in range(10)]
head2, note = curator.fit_xgb_head(rows, [0.1] * 10)
assert head2 is None and note, note
try:
    import xgboost  # noqa: F401
except ImportError:
    assert "pip install xgboost" in note, note
else:
    assert "pool too small" in note, note

# the linear mirror the ship rule judges with
lin = {"terms": {"density=high": 2.0}, "num": {"count": -1.0}, "bias": 0.5}
assert curator.linear_head_scores(lin, [{"density": "high", "num": {"count": 0.5}}]) == [2.0]
assert curator.linear_head_scores(lin, [{"density": "low", "num": {}}]) == [0.5]

print("xgb_head selfcheck OK")
