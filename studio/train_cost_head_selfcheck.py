#!/usr/bin/env python3
"""Selfcheck for the T4 governor cost-head trainer (#1578).

    python3 studio/train_cost_head_selfcheck.py

Proves the parts that must be right before any model is trained, with no
xgboost installed: the shared split (FNV-1a fold vectors — the same pins
as app/src/gl/parity/costJudge.selfcheck.mjs, so the Python and JS
implementations cannot drift), the additivity screen on hand-computed
ladder fixtures, the design shaping (which features may become columns,
and why the rest may not), the XGBoost-dump conversion on a synthetic
dump (including the one-hot child swap), and the calibration math.

Stdlib only: synthetic fixtures throughout.
"""
import json
import math
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import train_cost_head as tch  # noqa: E402

# ── FNV-1a pins (judge mirror) ──────────────────────────────────────────
assert tch.fnv1a("") == 2166136261
assert tch.fnv1a("grid-base") == 1382191041
assert tch.fnv1a("grid-heavy-all") == 2602625481
assert tch.fnv1a("dev-b|x") == 2828046335
assert tch.fnv1a("dev-a|x") == 428785218

# ── the split ───────────────────────────────────────────────────────────
IDS22 = [
    "parity-a", "parity-b", "grid-base", "grid-count-12", "grid-count-160", "grid-count-480",
    "grid-cast-4", "grid-cast-24", "grid-scale-small", "grid-scale-large",
    "grid-fx-1", "grid-fx-2", "grid-fx-3", "grid-fx-4", "grid-blend-screen", "grid-mirror-x",
    "grid-swarm-150", "grid-swarm-500", "grid-heavy-count-fx", "grid-heavy-scale-fx",
    "grid-heavy-count-scale", "grid-heavy-all",
]
split = tch.assign_splits(IDS22, ["dev-a|x", "dev-b|x"])
assert split["held_recipes"] == {
    "grid-count-12", "grid-heavy-count-fx", "grid-heavy-count-scale", "grid-mirror-x", "parity-a",
}, split["held_recipes"]
assert split["held_devices"] == {"dev-b|x"}
assert split["recipe_leg"] and split["device_leg"]
assert tch.cell_of(split, "grid-count-12", "dev-b|x") == "test"
assert tch.cell_of(split, "grid-count-12", "dev-a|x") == "cross"
assert tch.cell_of(split, "grid-base", "dev-a|x") == "train"
solo = tch.assign_splits(IDS22, ["dev-a|x"])
assert solo["device_leg"] is False and solo["held_devices"] == set()

# ── additivity screen: hand-computed ladder (judge fixture, verbatim) ──
LADDER = {
    "grid-base": 10, "grid-count-160": 22, "grid-count-480": 46, "grid-scale-large": 26,
    "grid-cast-24": 30, "grid-fx-1": 14, "grid-fx-2": 19, "grid-fx-3": 27, "grid-fx-4": 34,
    "grid-heavy-count-fx": 84,  # boundary: |63-84|/84 = 0.25 exactly
    "grid-heavy-scale-fx": 35, "grid-heavy-count-scale": 62, "grid-heavy-all": 94,
}
scr = tch.additivity_screen(LADDER)
assert scr["status"] == "additive", scr
assert [c for c in scr["combos"] if c["id"] == "grid-heavy-all"][0]["pred"] == 94
assert [c for c in scr["combos"] if c["id"] == "grid-heavy-count-fx"][0]["relErr"] == 0.25
scr_na = tch.additivity_screen({**LADDER, "grid-heavy-all": 200})
assert scr_na["status"] == "non-additive"
assert abs([c for c in scr_na["combos"] if c["id"] == "grid-heavy-all"][0]["relErr"] - 0.53) < 1e-9
assert tch.additivity_screen({k: v for k, v in LADDER.items() if k != "grid-fx-3"})["status"] == "indeterminate"

# ── design shaping ──────────────────────────────────────────────────────
def row(system, accum, palette, shift, label=50.0):
    return {"recipe": "r", "device": "d", "label": label, "features": {
        "v": 4, "system": system, "accum": accum, "palette": palette,
        "paletteShift": shift, "castSize": 3, "cast": ["a", "b"],
        "num": {"count": 0.5},
        "mech": {"instancesXprim": 42},
        "probe": {"fillRate": 7, "instanced": 8, "blend": 9, "js": 10},
    }}

rows = [row("swarm", True, "praystation", "warm"), row("fibonacci", False, None, None)]
columns, exclusions = tch.design_columns(rows)
assert columns == [
    "accum=false", "accum=true", "system=fibonacci", "system=swarm",
    "mech.instancesXprim", "num.count", "probe.blend", "probe.fillRate",
    "probe.instanced", "probe.js",
], columns
excluded_keys = {e["key"] for e in exclusions}
# palette/paletteShift carry nulls; castSize is a top-level number; cast an
# array; v is identity — none may become a column, each with a reason.
assert {"palette", "paletteShift", "castSize", "cast", "v"} <= excluded_keys, exclusions
f0 = rows[0]["features"]
assert tch.design_value(f0, "system=swarm") == 1.0
assert tch.design_value(f0, "system=fibonacci") == 0.0
assert tch.design_value(f0, "accum=true") == 1.0
assert tch.design_value(f0, "num.count") == 0.5
assert tch.design_value(f0, "num.density") == 0.0  # absent numeric = the evaluator's 0.0
assert tch.monotone_for("mech.instancesXprim") == 1
assert tch.monotone_for("probe.js") == 1
assert tch.monotone_for("num.count") == 1
assert tch.monotone_for("num.jitter") == 0
assert tch.monotone_for("system=swarm") == 0

# ── dump conversion: the one-hot child swap, walked ─────────────────────
COLUMNS = ["system=swarm", "mech.instancesXprim", "num.count"]
DUMP = [
    {"nodeid": 0, "depth": 0, "split": "system=swarm", "split_condition": 0.5,
     "yes": 1, "no": 2, "missing": 1, "gain": 3.0,
     "children": [
         {"nodeid": 1, "leaf": 0.75},
         {"nodeid": 2, "depth": 1, "split": "num.count", "split_condition": 0.5,
          "yes": 3, "no": 4, "missing": 3, "gain": 1.5,
          "children": [{"nodeid": 3, "leaf": -0.25}, {"nodeid": 4, "leaf": 0.5}]},
     ]},
]
names, trees = tch.convert_xgb_dump(DUMP, COLUMNS, {0: {0: 3.0, 2: 1.5}})
assert names == ["system", "mech.instancesXprim", "num.count"], names
root = trees[0]
assert root["op"] == "=" and root["v"] == "swarm"
# booster YES (term absent) became spec n; booster NO became spec y.
assert root["n"] == {"leaf": 0.75}
assert root["y"]["op"] == "<"
def feats(system, count):
    return {"system": system, "num": {"count": count}, "mech": {}, "probe": {}}
assert tch.walk_spec_tree(root, feats("swarm", 0.7), names) == 0.5
assert tch.walk_spec_tree(root, feats("swarm", 0.3), names) == -0.25
assert tch.walk_spec_tree(root, feats("fibonacci", 0.7), names) == 0.75
# a numeric split names its column even when the dump calls it f<idx>
DUMP_F = [{"nodeid": 0, "split": "f2", "split_condition": 10.0, "yes": 1, "no": 2,
           "missing": 1, "children": [{"nodeid": 1, "leaf": 1.0}, {"nodeid": 2, "leaf": 2.0}]}]
_, trees_f = tch.convert_xgb_dump(DUMP_F, COLUMNS, {})
assert trees_f[0]["f"] == names.index("num.count") and trees_f[0]["op"] == "<"

# ── calibration math ────────────────────────────────────────────────────
assert tch.calibrate_base_score([10, 20, 30], [1, 2, 3]) == 18
assert tch.calibrate_base_score([0, 10], [0, 0]) == 5
assert tch.percentile_nearest_rank(list(range(1, 11)), 90) == 9
assert tch.percentile_nearest_rank(list(range(1, 11)), 50) == 5
mult = tch.calibration_multiplier([10] * 10, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
assert mult == 9.0, mult  # nearest-rank p90 of ratios 1..10
assert tch.calibration_multiplier([10, 10], [5, 5]) == 1.0  # floored at 1.0
assert abs(tch.pinball([90], [100]) - 9.0) < 1e-9
assert abs(tch.pinball([110], [100]) - 1.0) < 1e-9

# ── dataset loading: the second lock on the door ────────────────────────
good = {
    "kind": "kc-cost-dataset", "version": 1,
    "environment": {"renderer": "dev-a", "platform": "x", "swiftShader": False},
    "rows": [{"id": "grid-base", "status": "measured", "labelMs": 12.5,
              "features": {"num": {}, "mech": {}, "probe": {}}}],
}
with tempfile.TemporaryDirectory() as td:
    p = Path(td) / "ds.json"
    p.write_text(json.dumps(good))
    loaded, sources = tch.load_rows([str(p)])
    assert len(loaded) == 1 and loaded[0]["device"] == "dev-a|x"
    assert sources[0]["sha256"]
    p.write_text(json.dumps({**good, "kind": "nope"}))
    try:
        tch.load_rows([str(p)])
        raise AssertionError("wrong-kind dataset accepted")
    except ValueError:
        pass

print("train_cost_head.selfcheck: all assertions passed")
