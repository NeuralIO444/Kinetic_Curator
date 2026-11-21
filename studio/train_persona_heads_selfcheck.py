#!/usr/bin/env python3
"""train_persona_heads selfcheck (A2, #2395) — stdlib only, fixture heads of known scores.

CI has no xgboost, so the fit is injected: hand-made spec heads whose Spearman against the fixture
rows is known exactly, scored through curator.py's REAL spec walk and rank correlation. One block
per ruling:

  Q3  split honesty — by take (no seed on both sides), deterministic, across entries;
  Q4  a worse challenger is rejected and taste.json is byte-unchanged (issue acceptance 1);
      a tie is not a beat; a first head below 0.3 never enters taste.json;
  Q5  rollback restores the previous version's entry exactly, and past v1 removes the entry
      (issue acceptance 2) — proven at the whole-file byte level through the real CLI;
  Q6  labeledTurns counts ALL labeled turns (train + held-out);
  watermark — an entry whose labeled count did not grow is not retrained (--force overrides);
  the held-out floor — under 30 held-out turns nothing ships;
  empty corpus — nothing is written, not even history;
  the real fit's dump seam — a stub xgboost whose booster returns JSON strings (as the real
      Booster.get_dump does) driven through the REAL fit_head_xgb, which the fixture-fit seam
      never touches;
  malformed incumbents — an entry failing A1's shape rules degrades to no-incumbent for its
      slot instead of crashing the run, and store/history never claim a ship taste.json
      does not carry;
  the depth bound — a challenger deeper than the app's MAX_TREE_DEPTH is rejected like
      every other bounds failure.

Run: python3 studio/train_persona_heads_selfcheck.py
(The real-xgboost end-to-end runs only when xgboost imports; it skips loudly otherwise.)
"""
import copy
import json
import os
import subprocess
import sys
import tempfile
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import curator  # noqa: E402
import train_persona_heads as T  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def heat_head(lo, hi):
    """One split on num.heat at 0.5: rows under it score sigmoid(lo), the rest sigmoid(hi)."""
    return {
        "kind": "xgboost-trees",
        "objective": "binary:logistic",
        "baseScore": 0.0,
        "fidelity": 0.0,
        "fitOn": 0,
        "features": ["num.heat"],
        "trees": [{"f": 0, "op": "<", "v": 0.5, "y": {"leaf": lo}, "n": {"leaf": hi}, "gain": 1.0}],
    }


def constant_head():
    return {
        "kind": "xgboost-trees",
        "objective": "binary:logistic",
        "baseScore": 0.0,
        "fidelity": 0.0,
        "fitOn": 0,
        "features": ["num.heat"],
        "trees": [{"leaf": 0.0}],
    }


def fit_returning(head):
    def fit(rows, train_idx, columns):
        h = copy.deepcopy(head)
        h["fitOn"] = len(train_idx)
        return h

    return fit


def solo_rows(takes, per_take=12, pid="davis"):
    """Each take: half its rows hot-and-kept (heat .9, weight +1), half cold-and-passed (.1, -1) —
    so ANY whole-take held-out slice is perfectly rank-correlated with the heat head."""
    rows = []
    for t in range(takes):
        seed = 1000 + t
        for j in range(per_take):
            hot = j % 2 == 0
            rows.append(
                {
                    "id": pid,
                    "kind": "solo",
                    "takeSeed": seed,
                    "features": {"num": {"heat": 0.9 if hot else 0.1, "pressure": 0.5}},
                    "label": "good" if hot else "bad",
                    "weight": 1 if hot else -1,
                }
            )
    return rows


def mixed_rows(takes, pid="davis"):
    """A corpus a heat-only head reads imperfectly: weight is +1 iff heat >= 0.5 AND soloAge = 2.
    Per take: 4 hot/old keeps, 4 cold/young passes, 2 warm/old keeps, 2 warm/young passes — the
    same composition in every take, so any whole-take slice gives the heat head the same
    in-between Spearman (~0.71) and the heat+age head exactly 1."""
    rows = []
    kinds = [(0.9, 2, 1), (0.1, 0, -1), (0.5, 2, 1), (0.5, 0, -1)]
    counts = [4, 4, 2, 2]
    for t in range(takes):
        seed = 3000 + t
        for (heat, age, w), n in zip(kinds, counts):
            for _ in range(n):
                rows.append(
                    {
                        "id": pid,
                        "kind": "solo",
                        "takeSeed": seed,
                        "features": {"num": {"heat": heat, "soloAge": age, "pressure": 0.5}},
                        "label": "good" if w > 0 else "bad",
                        "weight": w,
                    }
                )
    return rows


def heat_age_head():
    """Splits heat, then soloAge — the perfect head for the mixed corpus."""
    return {
        "kind": "xgboost-trees",
        "objective": "binary:logistic",
        "baseScore": 0.0,
        "fidelity": 0.0,
        "fitOn": 0,
        "features": ["num.heat", "num.soloAge"],
        "trees": [
            {
                "f": 0, "op": "<", "v": 0.5,
                "y": {"leaf": -2.0},
                "n": {"f": 1, "op": "<", "v": 1, "y": {"leaf": -2.0}, "n": {"leaf": 2.0}, "gain": 1.0},
                "gain": 1.0,
            }
        ],
    }


def rows_artifact(rows):
    return {"format": "kc-persona-rows", "version": 1, "featuresVersion": 1, "rows": rows, "summary": {}}


def entry_of(result, pid, kind):
    return next(e for e in result["entries"] if e["id"] == pid and e["kind"] == kind)


# ── Q3: split honesty — by take, deterministic, per entry ────────────────────────────────────────
rows = solo_rows(12)
for pid, kind in [("davis", "solo"), ("lois", "trade"), ("governor", "cut")]:
    tr1, he1 = T.split_rows(rows, pid, kind)
    tr2, he2 = T.split_rows(rows, pid, kind)
    check(tr1 == tr2 and he1 == he2, f"split not deterministic for {pid}|{kind}")
    train_seeds = {rows[i]["takeSeed"] for i in tr1}
    held_seeds = {rows[i]["takeSeed"] for i in he1}
    check(not (train_seeds & held_seeds), f"a take seed sits on both sides for {pid}|{kind}")
    check(len(he1) >= T.HELDOUT_FLOOR, f"held-out under the floor for {pid}|{kind}: {len(he1)}")
    check(len(tr1) + len(he1) == len(rows), "split must partition the labeled rows")
tr, he = T.split_rows([r for r in rows if r["weight"] != 0], "davis", "solo")
check(len(he) >= 30 and len(he) <= 48, f"~80/20 by turns: held {len(he)} of {len(rows)}")

# ── first head ships; Q6 labeledTurns; the store artifact is the shipped entry ───────────────────
store = tempfile.mkdtemp()
taste = {"kind": "kc-taste", "head": {"bias": 0}}
rows = solo_rows(10)  # 120 labeled turns
result = T.train(rows_artifact(rows), taste, "taste.json", store, now="2026-11-20T00:00:00Z",
                 fit_fn=fit_returning(heat_head(-2.0, 2.0)))
e = entry_of(result, "davis", "solo")
check(result["shipped"], "a perfect first head must ship")
check(e["verdict"] == "shipped" and e["version"] == 1, f"first ship is v1: {e}")
check(e["challengerHeldOut"] == 1.0, f"perfect head, perfect held-out: {e['challengerHeldOut']}")
shipped = taste["personas"]["davis"]["solo"]
check(shipped["labeledTurns"] == 120, f"Q6: labeledTurns = train + held-out = 120, got {shipped['labeledTurns']}")
check(shipped["heldOut"] == 1.0 and shipped["head"]["fidelity"] == 1.0, "heldOut stamps the head's fidelity")
check(shipped["featuresVersion"] == 1 and shipped["kind"] == "solo", "A1's shipped shape")
check(taste["head"] == {"bias": 0}, "every other taste section survives a ship")
with open(T.store_artifact_path(store, "davis", "solo", 1), encoding="utf-8") as fh:
    stored_text = fh.read()
check(stored_text == T.canonical(shipped), "the store keeps the shipped entry artifact exactly")
# the report's held-out rows + Python scores re-derive independently through curator's walk
for idx, score in zip(e["heldOutRows"], e["pythonScores"]):
    check(abs(curator.score_spec_head(shipped["head"], rows[idx]["features"]) - score) < 1e-12,
          "report pythonScores must be the spec walk over the held-out rows")

# ── Q4: a worse challenger is rejected; taste is untouched; a tie is not a beat ──────────────────
before = copy.deepcopy(taste)
result = T.train(rows_artifact(rows), taste, "taste.json", store, force=True,
                 now="2026-11-20T01:00:00Z", fit_fn=fit_returning(heat_head(2.0, -2.0)))
e = entry_of(result, "davis", "solo")
check(e["verdict"] == "rejected" and e["challengerHeldOut"] == -1.0 and e["incumbentHeldOut"] == 1.0,
      f"the anti-correlated challenger must lose on the same slice: {e}")
check(not result["shipped"] and taste == before, "a rejected challenger changes nothing (acceptance 1)")
result = T.train(rows_artifact(rows), taste, "taste.json", store, force=True,
                 now="2026-11-20T02:00:00Z", fit_fn=fit_returning(heat_head(-2.0, 2.0)))
check(entry_of(result, "davis", "solo")["verdict"] == "rejected", "an equal challenger does not beat the old head")
check(taste == before, "a tied challenger changes nothing")

# ── watermark: no growth, no retrain; --force overrides (proven above); growth retrains ──────────
result = T.train(rows_artifact(rows), taste, "taste.json", store, now="2026-11-20T03:00:00Z",
                 fit_fn=fit_returning(heat_head(-2.0, 2.0)))
check(entry_of(result, "davis", "solo")["verdict"] == "skipped-watermark",
      "same labeled count as the last judged attempt: not retrained")

# ── history: every judged attempt on the first store is logged; skips are not attempts ───────────
history = T.read_history(store)
check([h["verdict"] for h in history if h["action"] == "train"] == ["shipped", "rejected", "rejected"],
      f"judged attempts logged in order: {history}")

# ── v1 -> v2 -> rollback: a better challenger ships the NEXT version; rollback restores v1 (Q5) ──
store_b = tempfile.mkdtemp()
taste_b = {}
result = T.train(rows_artifact(mixed_rows(10)), taste_b, "taste.json", store_b,
                 now="2026-11-20T00:00:00Z", fit_fn=fit_returning(heat_head(-2.0, 2.0)))
e = entry_of(result, "davis", "solo")
check(e["verdict"] == "shipped" and e["version"] == 1, f"the imperfect heat head ships v1: {e}")
check(0.3 <= e["challengerHeldOut"] < 1.0, f"heat alone reads the mixed corpus in-between: {e['challengerHeldOut']}")
v1_entry = copy.deepcopy(taste_b["personas"]["davis"]["solo"])
result = T.train(rows_artifact(mixed_rows(12)), taste_b, "taste.json", store_b,
                 now="2026-11-20T01:00:00Z", fit_fn=fit_returning(heat_age_head()))
e = entry_of(result, "davis", "solo")
check(e["verdict"] == "shipped" and e["version"] == 2, f"the perfect challenger ships v2: {e}")
check(e["challengerHeldOut"] == 1.0 and e["incumbentHeldOut"] < 1.0,
      f"the beat is judged on the same slice: {e['challengerHeldOut']} vs {e['incumbentHeldOut']}")
check(taste_b["personas"]["davis"]["solo"]["labeledTurns"] == 144, "Q6 again at v2")
rec = T.rollback(taste_b, "davis", "solo", store_b, now="2026-11-20T02:00:00Z")
check(rec["fromVersion"] == 2 and rec["toVersion"] == 1, f"rollback record: {rec}")
check(taste_b["personas"]["davis"]["solo"] == v1_entry, "rollback restores the v1 entry exactly (acceptance 2)")
rec = T.rollback(taste_b, "davis", "solo", store_b, now="2026-11-20T03:00:00Z")
check(rec["toVersion"] is None and "personas" not in taste_b, "past v1 the entry — and the empty section — goes")
try:
    T.rollback(taste_b, "davis", "solo", store_b)
    check(False, "rollback with nothing shipped must raise")
except ValueError:
    pass
history_b = T.read_history(store_b)
check([h["verdict"] for h in history_b if h["action"] == "train"] == ["shipped", "shipped"],
      f"both ships logged: {history_b}")
check(len([h for h in history_b if h["action"] == "rollback"]) == 2, "rollbacks are logged")

# ── Q4: a first head below the bar never enters taste.json ───────────────────────────────────────
store2 = tempfile.mkdtemp()
taste2 = {}
result = T.train(rows_artifact(solo_rows(10)), taste2, "taste.json", store2,
                 fit_fn=fit_returning(constant_head()))
e = entry_of(result, "davis", "solo")
check(e["verdict"] == "below-bar" and e["challengerHeldOut"] == 0.0, f"a constant head scores 0: {e}")
check("personas" not in taste2 and not result["shipped"], "below the bar, the head never enters taste.json")

# ── Q3 floor: under 30 held-out turns, nothing ships that run ────────────────────────────────────
store3 = tempfile.mkdtemp()
taste3 = {}
result = T.train(rows_artifact(solo_rows(2, per_take=10)), taste3, "taste.json", store3,
                 fit_fn=fit_returning(heat_head(-2.0, 2.0)))
check(entry_of(result, "davis", "solo")["verdict"] == "heldout-floor", "20 labeled turns cannot fill a 30-turn held-out")
check("personas" not in taste3, "the floor ships nothing")

# ── empty corpus: a clean no-op — no writes at all ───────────────────────────────────────────────
store4 = tempfile.mkdtemp()
taste4 = {"kind": "kc-taste"}
result = T.train(rows_artifact([]), taste4, "taste.json", store4, fit_fn=fit_returning(heat_head(-2.0, 2.0)))
check(not result["shipped"] and taste4 == {"kind": "kc-taste"}, "empty corpus changes nothing")
check(all(e["verdict"] == "no-corpus" for e in result["entries"]), "every entry reports no-corpus")
check(not os.path.exists(os.path.join(store4, "history.jsonl")), "an empty run writes no history")
check(len(result["entries"]) == 10, "exactly the 10 trainable entries are considered")

# ── non-trainable rows are never trained (the Queen never; kinds stay in their lanes) ────────────
store5 = tempfile.mkdtemp()
taste5 = {}
alien = solo_rows(10, pid="queen") + [{**r, "id": "governor"} for r in solo_rows(10)]
result = T.train(rows_artifact(alien), taste5, "taste.json", store5, fit_fn=fit_returning(heat_head(-2.0, 2.0)))
check(not result["shipped"] and "personas" not in taste5, "queen|solo and governor|solo rows train nothing")

# ── the featuresVersion guard ────────────────────────────────────────────────────────────────────
try:
    T.train({"format": "kc-persona-rows", "version": 1, "featuresVersion": 2, "rows": []}, {}, "t", store5)
    check(False, "rows from a future feature universe must be refused")
except ValueError:
    pass

# ── CLI, byte level: empty-corpus train leaves the file untouched; rollback round-trips bytes ────
d = tempfile.mkdtemp()
taste_path = os.path.join(d, "taste.json")
rows_path = os.path.join(d, "rows.json")
with open(rows_path, "w", encoding="utf-8") as fh:
    json.dump(rows_artifact([]), fh)
with open(taste_path, "w", encoding="utf-8") as fh:
    fh.write('{"kind": "kc-taste"}')
out = subprocess.run(
    [sys.executable, os.path.join(HERE, "train_persona_heads.py"), "train",
     "--rows", rows_path, "--taste", taste_path],
    capture_output=True, text=True)
check(out.returncode == 0, f"CLI train failed: {out.stderr}")
with open(taste_path, encoding="utf-8") as fh:
    check(fh.read() == '{"kind": "kc-taste"}', "a no-ship CLI run leaves taste.json byte-unchanged")

# ship v1 then v2 through the module, writing canonically as the CLI does; then let the real
# CLI roll back: the file must return to the exact v1 bytes, then lose the section at v1.
store6 = os.path.join(d, "persona-heads")
taste6 = {}
T.train(rows_artifact(mixed_rows(10)), taste6, taste_path, store6, now="2026-11-20T00:00:00Z",
        fit_fn=fit_returning(heat_head(-2.0, 2.0)))
with open(taste_path, "w", encoding="utf-8") as fh:
    fh.write(T.canonical(taste6))
with open(taste_path, encoding="utf-8") as fh:
    v1_bytes = fh.read()
T.train(rows_artifact(mixed_rows(12)), taste6, taste_path, store6, now="2026-11-20T01:00:00Z",
        fit_fn=fit_returning(heat_age_head()))
check(taste6["personas"]["davis"]["solo"]["version"] == 2, "fixture: v2 shipped")
with open(taste_path, "w", encoding="utf-8") as fh:
    fh.write(T.canonical(taste6))
out = subprocess.run(
    [sys.executable, os.path.join(HERE, "train_persona_heads.py"), "rollback",
     "--id", "davis", "--kind", "solo", "--taste", taste_path, "--store", store6],
    capture_output=True, text=True)
check(out.returncode == 0, f"CLI rollback failed: {out.stderr}")
with open(taste_path, encoding="utf-8") as fh:
    check(fh.read() == v1_bytes, "CLI rollback restores the file's v1 bytes exactly (acceptance 2)")
out = subprocess.run(
    [sys.executable, os.path.join(HERE, "train_persona_heads.py"), "rollback",
     "--id", "davis", "--kind", "solo", "--taste", taste_path, "--store", store6],
    capture_output=True, text=True)
check(out.returncode == 0, f"CLI rollback past v1 failed: {out.stderr}")
with open(taste_path, encoding="utf-8") as fh:
    check(json.load(fh) == {}, "past v1, the CLI rollback removes the entry and the section")

# ── the real fit's dump seam: a stub xgboost returning JSON strings, through fit_head_xgb ────────
# Real xgboost's Booster.get_dump(dump_format="json") returns a list of JSON STRINGS; the fit must
# parse them before curator.convert_xgb_dump (the repo's own pattern in curator.py and
# train_cost_head.py). The fixture-fit seam above never calls fit_head_xgb, so this pin drives the
# real function with a stub module — CI (no xgboost) still exercises the dump handling.
STUB_TREE = {
    "nodeid": 0, "split": "num.heat", "split_condition": 0.5, "yes": 1, "no": 2, "missing": 1,
    "children": [{"nodeid": 1, "leaf": -1.5}, {"nodeid": 2, "leaf": 1.5}],
}


class _StubDMatrix:
    def __init__(self, X, label=None, weight=None, feature_names=None):
        self.rows = len(X)


class _StubBooster:
    def __init__(self, n):
        self._n = n

    def get_dump(self, dump_format="json"):
        return [json.dumps(STUB_TREE)]  # strings, exactly as the real booster returns

    def predict(self, data, output_margin=False):
        return [0.0] * self._n

    # no trees_to_dataframe: curator._xgb_gains degrades to {} by design


_stub_xgb = types.ModuleType("xgboost")
_stub_xgb.DMatrix = _StubDMatrix
_stub_xgb.train = lambda params, dtrain, num_boost_round=0: _StubBooster(dtrain.rows)
_real_xgb = sys.modules.get("xgboost")
sys.modules["xgboost"] = _stub_xgb
try:
    stub_rows = solo_rows(10)
    stub_idx = list(range(len(stub_rows)))
    stub_cols = T.feature_columns(stub_rows, stub_idx)
    stub_head = T.fit_head_xgb(stub_rows, stub_idx, stub_cols)
finally:
    if _real_xgb is None:
        sys.modules.pop("xgboost", None)
    else:
        sys.modules["xgboost"] = _real_xgb
check(stub_head is not None, "the stub fit must produce a head")
check(stub_head["features"] == ["num.heat", "num.pressure"],
      f"stub head features: {stub_head['features']}")
check(stub_head["trees"] == [{"f": 0, "op": "<", "v": 0.5,
                               "y": {"leaf": -1.5}, "n": {"leaf": 1.5}, "gain": 0.0}],
      f"the JSON-string dump must convert to the spec tree: {stub_head['trees']}")
check(curator.score_spec_head(stub_head, {"num": {"heat": 0.9}}) > 0.5
      > curator.score_spec_head(stub_head, {"num": {"heat": 0.1}}),
      "the converted head separates hot from cold")

# ── the shape gate's universe mirror is decisionFeatures.mjs's live v1 universe ──────────────────
# The trainer's DECISION_FEATURE_NAMES is a static mirror (it is only ever applied to
# featuresVersion-1 entries, so it cannot go stale for them) — pinned here against the source
# of truth whenever node is on hand.
try:
    out = subprocess.run(
        ["node", "-e",
         "import('./app/src/curator/decisionFeatures.mjs')"
         ".then(m => console.log(JSON.stringify(m.decisionFeatureNames())))"],
        capture_output=True, text=True,
        cwd=os.path.join(HERE, ".."), timeout=60)
    if out.returncode == 0:
        live_names = set(json.loads(out.stdout.strip()))
        check(live_names == set(T.DECISION_FEATURE_NAMES),
              f"the trainer's universe mirror drifted from decisionFeatures.mjs: "
              f"missing {sorted(live_names - set(T.DECISION_FEATURE_NAMES))}, "
              f"extra {sorted(set(T.DECISION_FEATURE_NAMES) - live_names)}")
        print("  [node] universe mirror matches decisionFeatureNames()")
    else:
        print("  [node] universe-mirror pin could not run (node import failed) — skipped")
except (OSError, subprocess.SubprocessError):
    print("  [node] node not available — universe-mirror pin skipped")

# ── malformed incumbents: A1-shape failures degrade to no-incumbent; the run never desyncs ───────
def valid_entry(kind, head, version=3):
    return {
        "version": version,
        "kind": kind,
        "head": head,
        "labeledTurns": 120,
        "heldOut": 0.9,
        "trainedAt": "2026-11-19T00:00:00Z",
        "featuresVersion": 1,
    }


def assert_no_desync(store_dir, taste_dict):
    """Every ship the history claims is a ship taste carries, byte for byte in the store."""
    for rec in T.read_history(store_dir):
        if rec.get("action") == "train" and rec.get("verdict") == "shipped":
            entry = taste_dict["personas"][rec["id"]][rec["kind"]]
            check(entry["version"] == rec["version"],
                  f"history claims v{rec['version']} shipped for {rec['id']}|{rec['kind']}, "
                  f"taste carries v{entry['version']}")
            with open(T.store_artifact_path(store_dir, rec["id"], rec["kind"], rec["version"]),
                      encoding="utf-8") as fh:
                check(fh.read() == T.canonical(entry),
                      f"the store artifact for {rec['id']}|{rec['kind']} is the taste entry exactly")


# crash shape 1: the incumbent's head is a dict missing the keys the spec walk reads
store_m1 = tempfile.mkdtemp()
broken_head_entry = valid_entry("solo", heat_head(-2.0, 2.0))
broken_head_entry["head"] = {"kind": "xgboost-trees"}  # no baseScore / features / trees
taste_m1 = {"personas": {"davis": {"solo": broken_head_entry}}}
result = T.train(rows_artifact(solo_rows(10)), taste_m1, "taste.json", store_m1,
                 fit_fn=fit_returning(heat_head(-2.0, 2.0)))
e = entry_of(result, "davis", "solo")
check(e["verdict"] == "shipped" and e["version"] == 1 and e["incumbentHeldOut"] is None,
      f"a head missing its keys is no incumbent at all: {e}")
check(taste_m1["personas"]["davis"]["solo"]["head"]["trees"], "the shipped head replaced the broken one")
assert_no_desync(store_m1, taste_m1)

# crash shape 2: the incumbent entry is missing `version` — scorable head, crash at ship time
store_m2 = tempfile.mkdtemp()
no_version_entry = valid_entry("solo", heat_head(-2.0, 2.0))
del no_version_entry["version"]
taste_m2 = {"personas": {"carson": {"solo": no_version_entry}}}
result = T.train(rows_artifact(mixed_rows(10, pid="carson")), taste_m2, "taste.json", store_m2,
                 fit_fn=fit_returning(heat_age_head()))
e = entry_of(result, "carson", "solo")
check(e["verdict"] == "shipped" and e["version"] == 1 and e["incumbentHeldOut"] is None,
      f"an entry missing its version is no incumbent at all: {e}")
assert_no_desync(store_m2, taste_m2)

# the desync shape: an early entry ships, a later entry's incumbent is malformed — one clean run
store_m3 = tempfile.mkdtemp()
taste_m3 = {"personas": {"carson": {"solo": broken_head_entry}}}
both_rows = solo_rows(10, pid="davis") + solo_rows(10, pid="carson")
result = T.train(rows_artifact(both_rows), taste_m3, "taste.json", store_m3,
                 fit_fn=fit_returning(heat_head(-2.0, 2.0)))
check(entry_of(result, "davis", "solo")["verdict"] == "shipped", "the clean entry ships")
check(entry_of(result, "carson", "solo")["verdict"] == "shipped", "the malformed slot ships over no-incumbent")
assert_no_desync(store_m3, taste_m3)

# a malformed incumbent with a below-bar challenger: judged as a first head, taste untouched
store_m4 = tempfile.mkdtemp()
taste_m4 = {"personas": {"davis": {"solo": copy.deepcopy(broken_head_entry)}}}
before_m4 = copy.deepcopy(taste_m4)
result = T.train(rows_artifact(solo_rows(10)), taste_m4, "taste.json", store_m4,
                 fit_fn=fit_returning(constant_head()))
check(entry_of(result, "davis", "solo")["verdict"] == "below-bar",
      "no incumbent + a constant challenger is a first head under the bar")
check(taste_m4 == before_m4 and not result["shipped"], "the malformed entry is left exactly as found")

# ── the depth bound: deeper than the app's cap is a bounds rejection, like trees/nodes ───────────
def deep_head(levels):
    node = {"leaf": 1.0}
    for _ in range(levels):
        node = {"f": 0, "op": "<", "v": 0.5, "y": {"leaf": -1.0}, "n": node, "gain": 1.0}
    return {
        "kind": "xgboost-trees",
        "objective": "binary:logistic",
        "baseScore": 0.0,
        "fidelity": 0.0,
        "fitOn": 0,
        "features": ["num.heat"],
        "trees": [node],
    }


store_d = tempfile.mkdtemp()
taste_d8 = {}
result = T.train(rows_artifact(solo_rows(10)), taste_d8, "taste.json", store_d,
                 fit_fn=fit_returning(deep_head(8)))
e = entry_of(result, "davis", "solo")
check(e["verdict"] == "no-fit" and "depth 8" in e.get("note", ""),
      f"a depth-8 challenger exceeds the app's cap and is rejected on bounds: {e}")
check("personas" not in taste_d8 and not result["shipped"], "an over-deep head never enters taste.json")
result = T.train(rows_artifact(solo_rows(10)), {}, "taste.json", tempfile.mkdtemp(),
                 fit_fn=fit_returning(deep_head(6)))
check(entry_of(result, "davis", "solo")["verdict"] == "shipped",
      "a depth-6 challenger sits at the cap and is judged on its score")

# ── the real fit, when xgboost exists in this environment (skips loudly otherwise) ───────────────
try:
    import xgboost  # noqa: F401

    store7 = tempfile.mkdtemp()
    taste7 = {}
    result = T.train(rows_artifact(solo_rows(10)), taste7, "taste.json", store7)
    e = entry_of(result, "davis", "solo")
    check(e["verdict"] == "shipped", f"the real fit must ship on a separable corpus: {e}")
    check(e["challengerHeldOut"] >= 0.99, f"the real fit separates: {e['challengerHeldOut']}")
    head = taste7["personas"]["davis"]["solo"]["head"]
    n_trees, depth, n_nodes = curator.spec_head_stats(head)
    check(0 < n_trees <= curator.XGB_MAX_TREES and depth <= curator.XGB_MAX_DEPTH and n_nodes <= curator.XGB_MAX_NODES,
          "the fitted head sits inside the app's bounds")
    print(f"  [xgb] real fit shipped: heldOut {e['challengerHeldOut']:.3f}, {n_trees} trees")
except ImportError:
    print("  [xgb] xgboost not installed here — real-fit section skipped (CI shape)")

print("train_persona_heads_selfcheck: all blocks passed")
