#!/usr/bin/env python3
"""Selfcheck for the cost head trainer (#1578, XGBoost T4).

    ~/workspace/.venv-xgb/bin/python studio/train_cost_head_selfcheck.py
    python3 studio/train_cost_head_selfcheck.py        # stdlib sections only

Proves the parts that must be right before any model ships: the feature
shaping follows the costHead contract (lists and top-level numbers
excluded, probe features declared), an XGBoost JSON dump converts to
spec trees that WALK to the same leaves the booster would, the
base-score calibration recovers the booster's margin offset, and the
coverage calibration never tunes down. The round-trip section trains a
tiny synthetic dataset end-to-end when xgboost is installed and skips —
loudly, not silently — when it is not. No real dataset is read.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import train_cost_head as tch  # noqa: E402

# ── feature shaping follows the contract ─────────────────────────────────
BAGS = [
    {"system": "fibonacci", "bodies": "sparse", "mirror": False, "cast": ["a", "b"],
     "castSize": 12, "v": 4,
     "num": {"count": 12.0}, "mech": {"drawCalls": 1}, "probe": {"js": 55.3}},
    {"system": "swarm", "bodies": "dense", "mirror": True, "cast": ["c"],
     "castSize": 480, "v": 4,
     "num": {"count": 480.0}, "mech": {"drawCalls": 8}, "probe": {"js": 55.3}},
]
assert tch.categorical_keys(BAGS) == ["bodies", "mirror", "system"], \
    "lists (cast) and top-level numbers (castSize, v) are not categoricals"
assert tch.numeric_names(BAGS) == ["mech.drawCalls", "num.count", "probe.js"]
names, columns = tch.design_columns(BAGS)
assert names == ["bodies", "mirror", "system", "mech.drawCalls", "num.count", "probe.js"], names
assert columns == ["bodies=dense", "bodies=sparse", "mirror=false", "mirror=true",
                   "system=fibonacci", "system=swarm",
                   "mech.drawCalls", "num.count", "probe.js"], columns
X = tch.design_matrix(BAGS, columns)
assert X[0].tolist() == [0, 1, 1, 0, 1, 0, 1, 12.0, 55.3], X[0]
assert X[1].tolist() == [1, 0, 0, 1, 0, 1, 8, 480.0, 55.3], X[1]
proj = tch.project_bag(BAGS[0])
assert "cast" not in proj and "castSize" not in proj and "v" not in proj
assert proj["num"] == {"count": 12.0} and proj["bodies"] == "sparse"
assert tch.recipe_family("grid-heavy-all") == "grid"
assert tch.recipe_family("parity-single-basic") == "parity"

# ── a synthetic XGBoost dump converts to spec trees that walk the same ───
COLUMNS = ["bodies=dense", "bodies=sparse", "mirror=true", "num.count", "probe.js"]
NAMES = ["bodies", "mirror", "num.count", "probe.js"]
DUMP = [
    {"nodeid": 0, "depth": 0, "split": "bodies=dense", "split_condition": 0.5,
     "yes": 1, "no": 2, "missing": 1, "gain": 12.5,
     "children": [
         {"nodeid": 1, "leaf": -0.5},
         {"nodeid": 2, "depth": 1, "split": "num.count", "split_condition": 100.0,
          "yes": 3, "no": 4, "missing": 3, "gain": 4.25,
          "children": [{"nodeid": 3, "leaf": 0.75}, {"nodeid": 4, "leaf": -0.25}]},
     ]},
    {"nodeid": 0, "depth": 0, "split": "mirror=true", "split_condition": 0.5,
     "yes": 1, "no": 2, "missing": 2, "gain": 2.0,
     "children": [{"nodeid": 1, "leaf": 0.1}, {"nodeid": 2, "leaf": 0.3}]},
    {"nodeid": 0, "depth": 0, "split": "probe.js", "split_condition": 60.0,
     "yes": 1, "no": 2, "missing": 1, "gain": 1.0,
     "children": [{"nodeid": 1, "leaf": 0.05}, {"nodeid": 2, "leaf": -0.05}]},
]
GAINS = {0: {0: 12.5, 2: 4.25}, 1: {0: 2.0}, 2: {0: 1.0}}
trees = tch.convert_cost_dump(DUMP, COLUMNS, NAMES, GAINS)
root = trees[0]
assert root["op"] == "=" and root["v"] == "dense" and root["f"] == NAMES.index("bodies")
assert root["gain"] == 12.5, "gains ride along from the gains map"
assert root["n"] == {"leaf": -0.5}, "term absent -> the dump's yes child (children swapped)"
inner = root["y"]
assert inner["op"] == "<" and inner["v"] == 100.0 and inner["f"] == NAMES.index("num.count")
assert inner["y"] == {"leaf": 0.75} and inner["n"] == {"leaf": -0.25}
assert trees[1]["v"] is True and trees[1]["op"] == "=", "boolean term -> a real boolean"
assert trees[2]["op"] == "<" and trees[2]["f"] == NAMES.index("probe.js"), \
    "probe.* is a numeric family and splits with <"


def xgb_walk(node, row):
    """The booster's own semantics over a one-hot row, for parity."""
    while "leaf" not in node:
        x = row.get(node["split"], 0.0)
        node = next(c for c in node["children"]
                    if c["nodeid"] == (node["yes"] if x < node["split_condition"] else node["no"]))
    return float(node["leaf"])


CASES = [
    ({"bodies": "dense", "mirror": True, "num": {"count": 10.0}, "probe": {"js": 55.0}},
     0.75 + 0.3 + 0.05),
    ({"bodies": "dense", "mirror": False, "num": {"count": 900.0}, "probe": {"js": 70.0}},
     -0.25 + 0.1 - 0.05),
    ({"bodies": "sparse", "mirror": True, "num": {"count": 10.0}, "probe": {"js": 10.0}},
     -0.5 + 0.3 + 0.05),
]
for feats, expected in CASES:
    got = tch.cost_leaf_sum(trees, feats, NAMES)
    assert abs(got - expected) < 1e-12, (feats, got, expected)
    row = {"bodies=dense": 1.0 if feats["bodies"] == "dense" else 0.0,
           "bodies=sparse": 1.0 if feats["bodies"] == "sparse" else 0.0,
           "mirror=true": 1.0 if feats["mirror"] else 0.0,
           "num.count": feats["num"]["count"], "probe.js": feats["probe"]["js"]}
    boosted = sum(xgb_walk(t, row) for t in DUMP)
    assert abs(boosted - got) < 1e-12, (feats, boosted, got)

# an unknown split feature is an export error, never an approximation
try:
    tch.convert_cost_dump([{"nodeid": 0, "split": "nope=1", "split_condition": 0.5,
                            "yes": 1, "no": 1, "children": [{"nodeid": 1, "leaf": 0.0}]}],
                          COLUMNS, NAMES)
    raise AssertionError("unknown split feature must refuse")
except ValueError as e:
    assert "unknown feature" in str(e)
# a one-hot split that is not a membership test is an export error
try:
    tch.convert_cost_dump([{"nodeid": 0, "split": "bodies=dense", "split_condition": 1.5,
                            "yes": 1, "no": 1, "children": [{"nodeid": 1, "leaf": 0.0}]}],
                          COLUMNS, NAMES)
    raise AssertionError("non-membership one-hot split must refuse")
except ValueError as e:
    assert "membership test" in str(e)
# an f-index split binds by position, as a nameless dump would print it
idx_trees = tch.convert_cost_dump(
    [{"nodeid": 0, "split": "f3", "split_condition": 0.25, "yes": 1, "no": 2,
      "children": [{"nodeid": 1, "leaf": 1.0}, {"nodeid": 2, "leaf": 2.0}]}], COLUMNS, NAMES)
assert idx_trees[0]["op"] == "<" and idx_trees[0]["v"] == 0.25

# ── the walk's defaults and equality rule mirror the evaluator ───────────
assert tch.cost_feature_value({"num": {}}, "num.count") == 0.0, "absent numeric = 0"
assert tch.cost_feature_value({}, "probe.js") == 0.0
assert tch._cost_eq(True, "true") and tch._cost_eq("false", False)
assert not tch._cost_eq(True, "false") and not tch._cost_eq(1, "1")

# ── base-score calibration recovers the booster's margin offset ──────────
base = tch.calibrate_base_score([2.0, 3.0, 4.0, 5.0], [1.5, 2.5, 3.4, 4.6])
assert abs(base - 0.5) < 1e-12, base  # residuals .5 .5 .6 .4 -> median .5
assert tch.calibrate_base_score([1.0], [0.25]) == 0.75

# ── coverage calibration: smallest multiplier >= 1 that covers ───────────
preds = [10.0] * 10
actuals = [5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 20.0]
assert tch.coverage(preds, actuals) == 0.6
c = tch.choose_calibration(preds, actuals, 0.9)
assert abs(c - 1.3) < 1e-12, c  # 9th of 10 ratios -> covers 9/10
assert tch.coverage(preds, actuals, c) == 0.9
assert tch.choose_calibration([20.0] * 10, actuals, 0.9) == 1.0, \
    "a model that already covers is never calibrated down (floor 1.0)"

# ── model stats counts the artifact bounds ───────────────────────────────
head = {"features": NAMES, "trees": trees}
assert tch.model_stats(head) == (3, 2, 11), tch.model_stats(head)

# ── round-trip: train small, export, verify through the exported JSON ────
try:
    import xgboost  # noqa: F401
    HAVE_XGB = True
except ImportError:
    HAVE_XGB = False

if not HAVE_XGB:
    print("train_cost_head selfcheck: xgboost not installed — "
          "round-trip section skipped (stdlib sections passed)")
else:
    import math

    import numpy as np

    def synth_bag(system, bodies, count, draw):
        return {"system": system, "bodies": bodies, "mirror": False,
                "cast": ["x"], "castSize": int(count), "v": 4,
                "num": {"count": float(count)},
                "mech": {"drawCalls": draw, "cpuDriver": draw * 0.05},
                "probe": {"fillRate": 1.0, "instanced": 1.1, "blend": 0.3, "js": 55.3}}

    rows = []
    for i, count in enumerate([10, 40, 90, 160, 260, 400, 560, 760]):
        dense = i % 2 == 0
        bag = synth_bag("fibonacci" if i % 3 else "swarm",
                        "dense" if dense else "sparse", count, 1 + count // 64)
        label = 8.0 + 0.02 * count + (6.0 if dense else 0.0)
        rows.append({"id": f"aa-r{i}", "family": "aa", "labelMs": label, "features": bag})
        bag2 = synth_bag("swarm", "mid", count * 2, 2 + count // 32)
        rows.append({"id": f"bb-r{i}", "family": "bb",
                     "labelMs": 10.0 + 0.02 * count, "features": bag2})

    head, report = tch.train_on_rows(rows)
    assert head["kind"] == "xgboost-cost" and head["objective"] == "reg:quantileerror"
    assert head["tau"] == 0.9 and head["calibration"] >= 1.0
    n_trees, depth, nodes = tch.model_stats(head)
    assert n_trees <= 80 and depth <= 4 and nodes <= 20000, (n_trees, depth, nodes)
    assert set(head["features"]) >= {"bodies", "num.count", "probe.js"}
    assert len(report["rows"]) == len(rows) and len(report["folds"]) == 2
    for r in report["rows"]:
        assert r["oofPredMs"] > 0 and r["inSamplePredMs"] > 0

    # the exported JSON reproduces the booster's margins: refit the same
    # design independently and compare raw margins to baseScore + Σ leaves
    bags = [r["features"] for r in rows]
    names2, columns2 = tch.design_columns(bags)
    assert names2 == head["features"]
    X = tch.design_matrix(bags, columns2)
    y = np.asarray([math.log(r["labelMs"]) for r in rows])
    bst = tch._fit_booster(X, y, columns2)
    import xgboost as _x

    margins = bst.predict(_x.DMatrix(X, feature_names=columns2), output_margin=True)
    for i, r in enumerate(rows):
        walked = head["baseScore"] + tch.cost_leaf_sum(head["trees"], bags[i], head["features"])
        assert abs(float(margins[i]) - walked) < 0.01, (r["id"], margins[i], walked)
        via_head = tch.predict_cost_ms(head, bags[i])
        assert abs(via_head - report["rows"][i]["inSamplePredMs"]) < 0.01

    # signal survived the export: cost grows with count in-sample
    lo = report["rows"][0]["inSamplePredMs"]
    hi = report["rows"][14]["inSamplePredMs"]
    assert hi > lo, (lo, hi)
    print("train_cost_head selfcheck: round-trip section passed "
          f"({n_trees} trees, calibration x{head['calibration']})")

print("train_cost_head selfcheck OK")
