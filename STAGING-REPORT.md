# XGBoost taste head — Phase T2 staging report (dice ordering + census readout)

Branch `ember/xgb-t2-dice-census`, stacked on T1 (`ember/xgb-t1-taste-trees`,
tip `be05d9f0`). Built to spec `kc1-xgboost-taste-spec-2026-10-14.md` §5/§6/§8-T2.
Local commits only — no push, no PR. Coordinator: this file is the staging
record; extract it before publishing, as with T1. (It replaces T1's report at
this path; T1's remains in history at `be05d9f0`.)

## ⚠️ Kill-criterion flag for the coordinator (read first)

The §8-T2 kill criterion was re-measured exactly as the brief demanded, and
the result needs a human call — stated plainly, nothing tuned:

- With a plausible opinionated fixture head ordering the tray, **never-tray
  lands at 16–24 across the 8 seeds — BELOW the #1546 band (28–37)** — and
  trio overlap lands at **0.9–1.2%** (headline was 1.7%). Both measures move
  in the *improving* direction on every seed: more of the library reaches
  the tray, and finalist trios are more distinct.
- The spec's own kill text (§8-T2) targets diversity that "**degrades** past
  its 8-seed band". Nothing degrades here. But the brief's letter says
  "out of that band", and never-tray is out of it on the low side — so this
  is flagged, not silently re-baselined. The suite pins the *direction*
  (ordering must never exceed the unordered run's never-tray or overlap on
  the same stream); the absolute band call is yours.
- Why it moves: the finalist cut is stratified (below), so the anchored
  stratum holds a guaranteed finalist voice per roll. Decomposition,
  measured: a FLAT scorer (ordering machinery, no opinions) already lowers
  never-tray to 25–32; the head's layout opinions do the rest when they
  favor varied modes (an inverted-opinion head lands at 25–31). On the
  headline stream the four #1546 families reach their FULL library in-tray
  (biosynthetic 12/12, crystalline 12/12, floral 15/15, radial 26/26).

## What was built

### 1. Dice ordering (`app/src/curator/dice.js`, `useDiceRoll.js`)
- `rollDice` gains optional `orderScorer` + `orderMeta`. The deal itself —
  stream, casts, stratification (#1546), persona scores — is byte-for-byte
  the same code path; the suite proves an ordered and an unordered roll on
  the same seed deal the identical multiset of casts.
- With a scorer: each candidate is stamped `xgbScore`, `stratum`
  ('open' | 'anchored'), `anchorFamily` (null for open). "Anchored" means
  the deal actually used a family pool for that slot (a family whose pool
  is empty anchors nothing — exactly the pre-T2 semantics).
- Finalist slots follow the deal's own proportions:
  `anchoredSlots = min(|anchored|, max(1, round(3 · |anchored| / n)))` —
  1 anchored + 2 open in every live configuration (n = 10/12/16). Within a
  stratum, ranking is model score → persona score → deal order (stable
  sort, no new stream draws). Slot overflow fills from the other stratum's
  next-best; a slot is never left empty while candidates remain. Finalists
  are presented in model order. **Scores never gate**: no threshold exists
  anywhere; a candidate reaches the tray by winning its stratum.
- No scorer → the return is the pre-T2 object exactly (no new keys), and
  the whole pre-T2 suite surface passes unchanged — including the miner's
  pinned takeHashes (miner suite green; the miner deliberately keeps its
  persona-only real tray and never passes an order scorer).
- Wiring: `useDiceRoll.roll()` builds the scorer per roll with the
  curate.js idiom — `makeXgbScorer(getTaste(), { experimental:
  experimentalOn() })` — so an absent/linear/below-bar/experimental-off
  head yields null and the roll is bit-identical to today.

### 2. Crown stamps (`app/src/curator/diceCrowns.js`)
- `sanitize` gains the flat trio in the file's own idiom (always-present
  keys, null defaults, like `davisCode`): `xgbScore`, `tasteVersion`,
  `headKind`, each validated independently. `crown()` in useDiceRoll
  passes the finalist's `xgbScore` + the roll's `orderMeta`.
- Field name is `xgbScore`, not the spec §5 prose's bare `score`: on the
  tray record `score` already IS the persona's score (both live on the
  same object), so one name — `xgbScore` — is used in both records.
  Judgment call, flagged for the coordinator.

### 3. Census agreement readout (`censusReport.mjs`, `censusReadout.mjs`)
- `tasteAgreement({ keeps, passes }, taste)` (pure): scores each ledger
  row's `recipe.layoutParams` via `scoreLayout` — the exact live
  reduction (the palette rides in the row but the head scores
  layoutParams only; documented in the code). Rows without layoutParams
  are counted as `unscored`, never silently dropped.
- Reports mean keep score vs mean pass score (null for an empty side)
  plus one separation statistic: **AUC by rank-sum (Mann–Whitney,
  tie-averaged ranks)** — P(a random keep out-scores a random pass),
  ties half. Deterministic and hand-computable; the census suite
  reproduces 0.875 by hand on a fixture ledger (with a designed tie).
- Absent, honestly, when there is no usable tree head: reasons are
  'no taste loaded' / 'taste has no tree head (linear head)' / 'tree
  head below the fidelity bar'. Presence requires the default (non-
  experimental) `headUsable` bar. `formatTasteAgreement` renders both
  states; `agreementView` in censusReadout.mjs is the section-level view
  model (reshape only, per that module's law).
- NOT wired into the snapshot script or any panel: spec §9 Q3 (room vs
  dev-panel) is unruled, so T2 ships the measurement + view model only.
  The window is whatever rows the caller passes (the full ledger by
  default) — §6's "trailing window" becomes a caller choice at wiring
  time.

### 4. Palette wart — resolved (a) TRIM (`studio/curator.py`)
- `XGB_LIVE_NULL_FEATURES = frozenset({'palette'})` + pure helper
  `xgb_design_columns(vocab, nums)`: palette terms are dropped from the
  tree head's design columns (reason written at the constant: palette is
  the constant null bucket in every live scoreLayout call, so palette
  splits spend depth on distinctions that can never fire and credit
  held-out fidelity to dead signal). The design-matrix fill guards
  trimmed terms (`if t in col`).
- The LINEAR head is NOT touched: its palette weights are equally inert
  live, but that head predates this audit and is not re-baselined here.
- `studio/xgb_head_selfcheck.py` asserts the trim (palette terms dropped,
  others kept, exported feature names exclude 'palette'). Passes.

## Diversity measurements (dice suite harness, 600 rolls/seed)

Never-tray of 294 (OFF = unordered; the T1-era #1546 8-seed band was 28–37):

| seed | OFF | flat scorer | opinionated head | OFF jac | ON jac |
|------|-----|------|------|------|------|
| 0x1504 | 31 | 27 | 20 | 1.65% | 1.19% |
| 0x1505 | 38 | 32 | 17 | 1.46% | 1.22% |
| 0x1506 | 31 | 25 | 22 | 1.56% | 1.15% |
| 0x1507 | 32 | 28 | 24 | 1.49% | 0.95% |
| 0x1508 | 35 | 30 | 19 | 1.58% | 1.14% |
| 0x1509 | 35 | 30 | 16 | 1.44% | 1.12% |
| 0x150a | 33 | 28 | 24 | 1.65% | 0.89% |
| 0x150b | 41 | 30 | 21 | 1.37% | 1.01% |

Note: OFF on seeds 0x1505/0x150b (38, 41) already sits above the T1-era
band's top on this seed set — the band was measured on a different seed
set at #1546 publish; the on/off comparisons above are same-stream,
which is the comparison that isolates the ordering's effect. Tray reach
(distinct) rises on every seed with ordering (263 → 270–278 range).
Inverted-opinion head (fibonacci/orbit/grid down, swarm/eden up):
never-tray 28/30/26/29/31/28/25/30 — never above OFF either.

## Tests

Extended suites only; no new suite, so `app/selfcheck.manifest` is
unchanged and the package.json selfcheck script is untouched.

- `dice.selfcheck.mjs` §12: fixture-head ordered roll — same casts as
  unordered (stream untouched), stamps on every candidate, stratum
  counts = the #1546 share, anchored finalist = stratum's model-best,
  allocation = deal proportions, tray presented in model order, ties
  fall to persona (flat scorer), no-head surface has no T2 keys, crown
  trio round-trips + junk sanitizes to nulls. PASS.
- `coverage.selfcheck.mjs` §4: the 8-seed guard sweep above (OFF vs
  flat vs opinionated), non-degradation asserted per seed, headline
  stream's four families fully tray-reached when ordered. PASS (~10 s).
- `census.selfcheck.mjs`: tasteAgreement on a fixture ledger + head —
  means and AUC (0.875) reproduced by hand from scoreLayout, unscored
  rows counted, three absent states honest, empty-side nulls. PASS.
- `censusReadout.selfcheck.mjs`: agreementView present/absent/purity
  (deep-frozen input). PASS.
- Curator neighbourhood (tasteHead, tasteLedger, recipeFeatures, miner,
  candidateTray, curate, dice): all PASS.
- Full manifest sweep (417 suites, run solo): **415 pass, 1 fail,
  1 skip** — the fail is `src/gl/accum.selfcheck.mjs` (V8 OOM abort) and
  the skip is `swarmWasm` (cargo absent; the stock `npm run selfcheck`
  halts there). Both are the known base-identical sandbox limitations,
  in code this diff does not touch.
- `npm run build`: PASS.
- Python: `studio/xgb_head_selfcheck.py` PASS (incl. trim asserts),
  `geom_selfcheck.py` PASS, `run_manifest_selfcheck.py` 9/9 PASS.

## Not done (deliberately)

- No persona text/citations, no dev-panel tree reader (T3).
- No snapshot-script/panel wiring for the agreement readout (Q3 unruled).
- The miner's REAL tray stays persona-only.
- `castCategories` observation from T1 stands (array terms could reach
  the xgb vocab from cast-carrying pool rows; the app would reject
  them) — a Studio-run question, not chased here.
