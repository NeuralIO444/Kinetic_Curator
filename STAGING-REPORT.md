# STAGING REPORT — XGBoost taste head, Phase T1 (2026-10-14)

Branch `ember/xgb-t1-taste-trees` on origin/main 29c0555c. LOCAL ONLY — no push, no PR.
Spec: `~/workspace/your_files/kc1-xgboost-taste-spec-2026-10-14.md` §§2–5, §7, §8-T1.
Scope kept: trainer + file format + evaluator. No dice/curate behaviour change, no UI,
no governor contact, no new features (recipeFeatures FEATURES_VERSION 4 only).

## What was built

**App — `app/src/curator/tasteHead.js`**
- `validateTaste` dispatches on `head.kind`: `'xgboost-trees'` → new `validateTreeHead`;
  absent/`'linear'` → the existing linear path, byte-identical behaviour (the validated
  linear head still carries NO `kind` field — its historical shape); anything else is
  rejected (`unknown taste head kind`). The featuresVersion gate and its "retrain on a
  fresh pool" error guard tree files unchanged. Lois/Queen sections untouched.
- Tree validation teeth (spec §3): objective must be `binary:logistic`; baseScore/fidelity
  finite (fidelity in [−1, 1]); declared features must bind to the app's own universe
  (`treeFeatureNames()`: scalar recipe keys minus the term-rule skips and array-valued
  `castCategories`, plus `num.<key>`), no duplicates; ≤512 trees, depth ≤6 split levels,
  ≤20,000 total nodes; split nodes are `{f, op, v, y, n, gain}` with `f` an in-range
  integer, numeric features splitting only with `<` on a finite number, categoricals only
  with `=` on a string/boolean, every gain finite, every leaf finite. Validation rebuilds
  clean node copies — the app never keeps the file's objects (selfcheck corrupts the raw
  file post-validate and proves scores don't move).
- `scoreLayout` branches on the kind: tree heads return
  `sigmoid(baseScore + Σ leaf margins)` via a pure walk (`scoreTreeHead` exported);
  `headUsable` needed no change — it reads fidelity only, so HEAD_MIN_FIDELITY and the
  experimental switch gate trees identically (selfcheck proves both).
- `makeXgbScorer(taste, {experimental})` — the diceScorer-shaped factory
  `{ id: 'xgb-head-v1', score(candidate) }`, null when no usable tree head (the
  makeMlxCurator convention, so persona fallback is intact). Deliberately NOT wired
  into dice.js/curate.js — T1 ends at the factory. Importing a tree taste.json through
  tasteStore drives the existing mlx curator correctly (probability argmax; sigmoid is
  monotonic) — proven end-to-end in the selfcheck via importTaste/getActiveCurator/
  pickCurated, then cleared back to the previous fallback.

**Trainer — `studio/curator.py`** (`train --xgb`; default off, linear path untouched)
- `distil_head` challenges `fit_head` under the ship rule. `fit_xgb_head` fits XGBoost
  (`binary:logistic`, depth 4, ≤300 rounds, early stopping) on the SAME design the
  linear head fits (one-hot `feature_terms` + the num block), targets = probe scores as
  probabilities. `import xgboost` is guarded (absent → a clear note naming the package,
  linear ships); the whole fit is additionally wrapped so any xgboost failure degrades
  to linear with the reason printed — a broken student never breaks the train.
- Ship rule in code (`choose_head`): a deterministic 80/20 split (seed 0); both students
  fit the train slice only; fidelity = the file's `spearman` vs the probe on held-out
  rows (linear judged via a pure mirror, `linear_head_scores`). Trees ship ONLY on a
  held-out win; the shipped ensemble is refit on the full pool at the winning round
  count (the linear head's full-pool convention) and reports the held-out fidelity.
- Export (`convert_xgb_dump`, stdlib-only): XGBoost JSON dump → spec trees. Numeric
  columns map to `<` splits directly; one-hot term columns map to `=` splits on the
  parent feature with children SWAPPED (the booster's yes child on a 0/1 column is
  "term absent"); boolean terms export as real JSON booleans; gains come from
  `trees_to_dataframe` when available (0.0 fallback; the walk never reads them); the
  dump's `missing` child is ignored — the design has no missing values. Shapes the
  format can't say exactly raise, they never approximate.
- `baseScore` is calibrated, not trusted: median (booster margin − Σ exported leaves)
  over the pool (`calibrate_base_score`), so the app reproduces booster probabilities
  across xgboost versions. Exported heads are bounds-checked against the app's caps.
- `describe_trees` (describe_head's analog) prints tree count/depth/nodes, strongest
  features by total gain, and the top-3 trees as readable text; `cmd_train` and
  `cmd_inspect` both use it for tree heads. The Lois head stays linear, untouched.

**Tests**
- `app/src/curator/tasteHead.selfcheck.mjs` (already manifest-registered; no manifest
  or package.json change): a T1 section — one-tree fixture reproduced by hand exactly
  (sigmoid(1.25) / sigmoid(0.75) / sigmoid(−0.25) from density buckets and
  num.count = (count−10)/790), boolean splits in both spellings (true / 'true'),
  19 malformed-file rejections (bounds, depth, node count, index, op/type mismatches,
  non-finite leaf/gain/baseScore, unknown kind, unknown/duplicate/array features),
  exactly-at-cap acceptances (512 trees, depth 6, 19,939 nodes), featuresVersion
  rejection wording, fidelity gate + experimental switch, factory shape and its three
  candidate shapes, store end-to-end, mutation isolation.
- `studio/xgb_head_selfcheck.py` (new, stdlib-only, geom_selfcheck pattern): synthetic
  XGBoost dump conversion incl. the child swap and f-index form, walk parity against a
  reference booster-semantics walker on one-hot rows, the same sigmoid(1.25) the JS
  suite pins, calibration recovery, ship-rule win/tie/absent, describe output, and the
  guarded fit degrading to a named note without xgboost installed.

## Results (this sandbox)

- `node src/curator/tasteHead.selfcheck.mjs` — OK
- Taste/curator neighbourhood, 22 manifest suites (topbarTaste, tasteLedger,
  recipeFeatures, tasteHead, queenChannel, queenDeniability, queenLean, curate, taste,
  loisRank, dice, coverage, census, miner, candidateTray, censusReadout, loisJudge,
  prospecting, director, directorRank, phase, curatePalette, stress, davisState) — ALL OK
- `npm run build` — OK; `npm run lint` — 0 errors (5 warnings, pre-existing on main)
- `python3 studio/xgb_head_selfcheck.py` — OK
- `python3 studio/curator.py selfcheck` — OK (its taste train/head sub-check skips:
  no scikit-learn in the sandbox, as on main)
- `curator.py inspect` on a hand-written tree taste.json — prints the trees readably

## Judgment calls (where the spec left room)

- Depth counts split levels from the root (root = 0); the ≤6 cap therefore allows six
  split levels, and the cap doubles as the recursion bound in the validator.
- `palette` is a legal tree feature (scalar, in the term universe) even though
  scoreLayout's press-constant reduction means it is always null at CURATE time —
  equality against null deterministically takes the n branch. The trainer's pool rows
  may carry real palettes; those splits simply never fire live. Flagging, not fixing:
  if that wastes ensemble capacity, T2's trainer can drop palette from the design.
- The tree head's validated shape keeps `fitOn` (pool size) so tasteSummary and the
  retrain nudge read tree files with no special-casing.
- Python fidelity reported for a shipped tree head is the held-out estimate, while the
  shipped trees are refit on the full pool — stated in the fit docstring and the train
  output line, so the number is never mistaken for an in-sample one.

## NOT verified here (no xgboost / scikit-learn in sandbox or CI)

The live XGBoost fit path itself (DMatrix, get_dump JSON shape, trees_to_dataframe,
best_iteration) is written against the documented APIs and wrapped to degrade loudly;
everything around it — format, conversion, walk, calibration, ship rule — is covered
synthetically on both sides in matching semantics (the equality rule and the walk are
mirrored line-for-line, JS `treeEq` ↔ Python `_spec_eq`). First real `--xgb` train on
the Mac Studio is the live-fire test; if a future xgboost rejects feature names
containing `=` (docs ban only `[`, `]`, `<`), the fit degrades to linear with the
reason printed rather than crashing the train.
