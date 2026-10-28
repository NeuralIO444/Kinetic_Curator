# #1578 staging report — Slice B: the cost-head training pipeline

Branch `feat/1578-cost-training`, on main `ef06205a`, committed locally only — not pushed, no PR; the coordinator publishes. Everything below was run and measured in this worktree. This file replaces the report that was at the worktree root; that report remains in git history.

**What this is:** the offline half of the Governor cost head. The runtime evaluator (`app/src/hooks/costHead.mjs`) has existed, inert, since PR #1583; the Studio bench (PR #1622, GPU fix #1817) produced the first honest label set on 2026-10-28. This slice is the pipeline that turns that dataset into the artifact the evaluator consumes — trainer, trained model, and the gates that prove the exported JSON is the model the trainer measured. **Nothing is wired into the app.** Priming the governor is a later slice, gated on Slice C's replay verdict; this slice makes no ship claim for the head itself.

## What was built

| file | what |
|---|---|
| `studio/train_cost_head.py` | The trainer. CLI: dataset path + `--out` / `--report`. Fits XGBoost `reg:quantileerror` (α = τ = 0.9) on `log(labelMs)`, exports the costHead artifact contract, evaluates grouped, chooses calibration from out-of-fold predictions, emits a report JSON with per-row OOF + in-sample predictions. |
| `studio/cost-head-model.json` | The trained artifact from the real Studio dataset (28,011 bytes): kind `xgboost-cost`, 60 trees, depth ≤ 3, 464 nodes, baseScore 3.941926, calibration ×1.871554, tau 0.9, 41 declared features. |
| `studio/cost-head-report.json` | The training record: dataset stamp, hyperparams, fold table, pooled OOF before/after calibration, and every measured row's features (evaluator-visible projection) + OOF / calibrated-OOF / in-sample predictions. |
| `studio/train_cost_head_selfcheck.py` | Stdlib-first selfcheck: shaping, dump→spec conversion with booster-semantics parity, calibration math, and — when xgboost is present — a full synthetic round-trip (train → export → margins reproduced through the exported JSON). Skips the round-trip loudly when xgboost is absent. |
| `studio/verify_cost_model.mjs` | The node-side gate: loads the artifact through the **real** `validateCostModel` / `predictMs`, asserts every measured row predicts finite-positive, and asserts the JS walk agrees with the trainer's reported in-sample predictions (rel tol 1e-6). `--dataset` additionally cross-checks the report's rows against the dataset itself. |
| `app/selfcheck.manifest` | +1 line: `node ../studio/verify_cost_model.mjs` after the costHead suite. See "Manifest" below. |

**House mirror:** the trainer follows `studio/curator.py`'s taste-head distill (spec kc1-xgboost-taste-spec-2026-10-14 §§3–4): one-hot term columns + numeric columns, the same node conversion (numeric → `<`; one-hot → `=` with children swapped, booleans as real booleans), gains annotated per node, and `baseScore` set by curator's `calibrate_base_score` (median booster-margin − Σ exported leaves) so the exported walk reproduces the booster whatever its base_score bookkeeping does. One deviation, forced by the environment: curator reads gains from `trees_to_dataframe`, which needs pandas — the training venv has none — so gains fall back to the JSON dump's own fields (the export requests `with_stats=True` for exactly this); all 202 split nodes in the shipped artifact carry real gains.

## Feature shaping (the contract decides, not taste)

41 declared features, 48 design columns. Categorical keys first (sorted), then numeric names (sorted), curator's layout:

- **13 categoricals** (top-level string/boolean scalars): accum, behave, bleed, blend, bodies, density, mirror, overlap, palette, paletteShift, scale, symmetry, system — one-hot as `key=value` columns, booleans spelled `true`/`false`.
- **28 numerics**: `num.*` ×18, `mech.*` ×6, `probe.*` ×4 (probe.blend, probe.fillRate, probe.instanced, probe.js).
- **Excluded, with the contract reason:** `cast` / `castCategories` (lists — the evaluator equality-tests `features[name]` against a string/boolean; a list can never match) and `castSize` / `v` (top-level numbers — the contract treats every non-prefixed name as a categorical whose split value must be a string/boolean, so a numeric bag value could never split; `v` is also just the features-version stamp).

## The data

`cost-dataset-studio-2026-10-28.json` (kc-cost-dataset v1, generated 2026-10-28T17:17:54Z by costBench at git `ef06205a`, renderer **ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max)** — a real GPU). 26 rows → **25 measured** (labels 10.7–53.6 ms), families: grid 19, parity 6. **grid-heavy-all excluded** (status `failed`, no label — the bench page hit its memory cap; excluded, never imputed).

Two measured limits of this dataset, stated plainly because the results below are mostly these two facts wearing numbers:

- **One device.** All 25 rows share a single probe bag (fillRate 1, instanced 1.1, blend 0.3, js 55.3). The four `probe.*` features are declared — the contract and future datasets need them — but constant here, so the ensemble splits on them **0 times**. On single-device data they cannot carry signal; they are not dead weight in the artifact, they are unwitnessed.
- **Repeated bags.** Only **13 distinct evaluator-visible feature bags exist among the 25 rows** (parity 2 of 6 — the fx-chain variants share recipe bags, because recipeFeatures cannot see GL effect chains; grid 11 of 19). Rows sharing a bag necessarily share a prediction.

## Training setup

Objective `reg:quantileerror`, quantile_alpha 0.9, target `log(labelMs)`, seed 1578. Deliberately small, because 25 rows cannot support more: **60 rounds, max_depth 3, eta 0.15, min_child_weight 2, subsample 0.9, colsample_bytree 0.8** — well inside both the artifact bounds (512 trees / depth 6 / 20,000 nodes) and this slice's caps (≤ 80 trees, depth ≤ 4).

## Results (measured here, from the runs below)

**Grouped evaluation — leave-one-family-out.** The corpus has exactly two families, so grouped CV *is* LOFO: a family's near-identical variants never straddle train/test, at the price of judging cross-family transfer only.

| held out | train rows | coverage (τ=0.9) | false-cheap | MAE | pinball (log) |
|---|---|---|---|---|---|
| grid | 6 (parity) | 0.368 | 0.632 | 14.864 ms | 0.3188 |
| parity | 19 (grid) | 1.000 | 0.000 | 22.141 ms | 0.0771 |

**Pooled out-of-fold (25 rows):** coverage **0.520 → 0.920** after calibration; false-cheap **0.480 → 0.080**; calibration multiplier **×1.871554** (the smallest multiplier ≥ 1.0 reaching the ≥ 90% coverage rule — never calibrated down); pooled pinball (log-ms, τ = 0.9, uncalibrated) 0.2608.

**The honest read:** cross-family generalization is weak on this evidence — a model trained on one family under-predicts the other (the grid fold's 0.368 coverage is the sound of that), and the ×1.87 calibration is the price of buying the coverage rule back. The shipped head therefore systematically over-predicts in-sample (e.g. grid-count-480: label 53.6 ms → in-sample 100.7 ms): as trained, it is a conservative upper-bound machine, not a sharp estimator. That is the correct posture for a governor feedforward term *if* it ships — but whether it earns priming is Slice C's replay verdict on real sessions, not this slice's claim. More families and a second device are what would change these numbers; no hyperparameter on 25 rows will.

**What the model leans on** (total split gain): bodies 0.8557 · mech.cpuDriver 0.3662 · mech.instancesXprim 0.0747 · mech.drawCalls 0.0627 · scale 0.0177 · num.count 0.0086 · mirror 0.0025 · num.scaleMid 0.0009 · mech.overdraw 0.0007. The mechanism estimates carry the model, as designed; the recipe categorical `bodies` is its single biggest lever.

## Verification (all run in this worktree)

- Trainer on the real dataset: prints the fold table and pooled OOF above; deterministic across reruns (fixed seed).
- `studio/train_cost_head_selfcheck.py` (venv python): **OK**, round-trip section included (synthetic 16-row train → export → exported-JSON margins match an independently refit booster within 0.01 log-ms on every row).
- Same selfcheck with xgboost import-blocked: **OK** — stdlib sections pass, round-trip section reports its skip in plain words, exit 0.
- `node studio/verify_cost_model.mjs`: **OK** — `validateCostModel` passes, 25/25 rows predict finite-positive through the real JS evaluator, max relative difference vs the trainer's in-sample predictions **5.81e-9** (tolerance 1e-6). With `--dataset <the Studio dataset>`: also OK (report rows cross-checked against the dataset's labels and feature projections). Runs green from any cwd (paths resolve next to the script).
- Manifest validation via the runner's own `manifestProblems`: **no problems** (522 commands).

## Manifest

The node gate IS wired: `node ../studio/verify_cost_model.mjs`, following the existing precedent `node ../studio/pool_rig.selfcheck.mjs` (line 158), placed after `src/hooks/costHead.selfcheck.mjs`. The python selfcheck is NOT wired: `app/scripts/runSelfcheck.mjs` rejects any manifest line not matching `/^node \S+/` — **python entries do not exist as a pattern** (all 522 commands are node), and curator's `studio/xgb_head_selfcheck.py` is likewise unmanifested. The python selfcheck runs via the reproduce commands below; if the runner ever grows a python pattern, it should be added then.

## Reproduce

```
cd ~/workspace/kc-1578-training
~/workspace/.venv-xgb/bin/python studio/train_cost_head.py \
  /home/hatch/workspace/goals/kinetic-curator-generative-art-instrument/hidden_files/cost-dataset-studio-2026-10-28.json
~/workspace/.venv-xgb/bin/python studio/train_cost_head_selfcheck.py
node studio/verify_cost_model.mjs --dataset \
  /home/hatch/workspace/goals/kinetic-curator-generative-art-instrument/hidden_files/cost-dataset-studio-2026-10-28.json
```

(The first command regenerates `studio/cost-head-model.json` + `studio/cost-head-report.json` in place.)

## Not touched

`costHead.mjs`, deviceProbes, `predictCostTier.mjs` (the older per-effect system), `mlx_artifacts`, every live-loop file. No call site reads the artifact; `primeGovernor` still receives no model anywhere. Untouched on purpose: priming waits for Slice C.
