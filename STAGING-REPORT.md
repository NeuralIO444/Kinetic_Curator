# #1578 staging report — Slice C: the governor-replay ship/kill judge

Branch `feat/1578-cost-replay`, stacked on `feat/1578-cost-training` (Slice B, `f3ad4622`), committed locally only — not pushed, no PR; the coordinator rebases onto main and publishes. Everything below was run and measured in this worktree. This file replaces the report that was at the worktree root; that report (Slice B's) remains in git history.

**What this is:** the judge the issue demands — "judged by governor replay, not MAE." Slices A/B built the probes, the harness, and the trained head; this slice builds the replay that decides whether the head ships, and renders the verdict on the evidence that exists. **Nothing is wired into the app, and nothing judged here was modified:** `costHead.mjs`, the governor, the harness, the trainer, and the artifact are read-only inputs.

## What was built

| file | what |
|---|---|
| `app/src/gl/parity/costReplay.mjs` | The judge. CLI: `--dataset <kc-cost-dataset.json> --out <report.json>` (`--head-report` / `--model` default to Slice B's studio files). Validates the dataset (`validateDataset`), the artifact (the real `validateCostModel`), and the report↔dataset pairing (ids + labels cross-checked; calibration must match the artifact) before judging anything — a stale or mismatched input is a refusal, not a verdict. |
| `app/src/gl/parity/costReplay.selfcheck.mjs` | Pins the verdict arithmetic on synthetic worlds with known answers: a planted additive world must trigger the gate-0 kill; a planted count×fx interaction world with accurate OOF predictions must pass every evidenced leg and HOLD only on the missing device leg (and `decideVerdict` must return SHIP when a passing device leg is supplied, KILL on <10% gain). Unit-pins the simulation (sustain timing, primed-vs-reactive settled states), the pinball/calibration math, and structurally validates the committed real report. When the Studio dataset is reachable it also re-runs the real judge end-to-end and asserts the committed report matches. |
| `studio/cost-replay-report.json` | The real run's full output: definitions, gate-0 fit with per-row residuals, per-scene tables for all five strategies, the legs, and the verdict with its reason strings. |
| `app/selfcheck.manifest` | +1 line: `node src/gl/parity/costReplay.selfcheck.mjs` after the costDataset suite. |

## The verdict

**KILL — gate 0: costs prove additive.** The replay legs were run for the record (the contract's order: additivity first; a gate-0 kill cannot be overridden by the replay). Even without gate 0, the head would not have shipped on this evidence: it fails the false-cheap and pinball legs, and the unseen-device leg does not exist yet, which caps any outcome at HOLD.

### Pre-registered definitions (fixed before the run, in the judge's header)

- **Budget** 33.33 ms (targetFps 30, `costHead.initialRung`'s default). **Over-budget scene** := its *opening* state (after any prime, before reactive correction) costs more than budget — the head's claim is the first frame.
- **Replay mechanics:** frame cost at renderScale s = label × s² (pixel-bound). Quality-tier steps are cost-neutral in the model (no measured per-tier factor exists; this is conservative *against* priming). The modelled ladder is `nextGovernorCut`'s prime-relevant prefix — cut 1 renderScale (1 → 0.75 → 0.5 → 0.33), then cut 2 quality. Hitch exposure uses the governor's real timing (`SUSTAIN_MS` 1600, `COOLDOWN_MS` 8000 from `usePerformanceGovernor.js`): first cut 1.6 s into an over-budget opening, further cuts every 9.6 s; scene length 30 s. Restore is a bounded climb into headroom; settled states are judged. **Retained quality** = settled renderScale² × tier weight {high 1, balanced 0.85, performance 0.7}; "equal" := within 5% relative.
- **Strategies:** (a) static-reactive = today's governor literally (no prime); (a′) static-tiers = the tier table's additive functional form as a prime (record only — no such prime exists in the product today); (b) count-only and ridge baselines fit inside the same leave-one-family-out folds as Slice B, calibrated on their train fold only (the trainer's ≥90%-coverage law); (c) the head = Slice B's per-row **OOF calibrated** predictions (`oofCalibratedMs`) — in-sample predictions are never read. Baseline predictions are winsorized to each fold's train feature range (A9 in the judge header: an unclamped ridge on the 6-row fold predicts e^30 ms — a numerical accident, not a baseline).
- **False-cheap** := prediction-level P(pred < label) on OOF predictions (Slice B's own metric, 1 − coverage). **Pinball** := mean τ-pinball in ms at the artifact's τ = 0.9.
- **Gate-0 rule (pre-registered):** additive iff an OLS fit of the grid corpus's labels on component terms `[1, log2(bodies/48), cast−8, scaleMid−1, fxDepth, blend≠normal, mirror, swarm]` reaches R² ≥ 0.90 **and** median |residual|/label ≤ 10%.

### Gate 0 — the additivity result

**ADDITIVE. R² 0.9448, median |residual| 2.8% of label** — both bars cleared. Fitted component costs (ms, at 1280×720 on the M2 Max): intercept 31.13 (≈ grid-base's measured 31.5), +7.22 per doubling of bodies, −0.20 per cast asset (≈ 0), +1.68 per unit of scaleMid (≈ flat), −1.37 per FX wrap (≈ 0, vs `measuredCosts.mjs`'s ~0.3 ms/pass at 512²), +2.13 for a non-normal blend, +3.93 for mirror, −38.56 for swarm mode (a different, cheaper render path). On this device the scene price really is a sum of parts; nothing in the labels needs an interaction to explain it.

Sensitivity, stated plainly: the **mean** |residual| is 11.0% — the median rule passes clearly, a mean rule at the same 10% would narrowly fail, and the gap is two rows: `grid-swarm-150` / `grid-swarm-500` carry *identical* labels (10.7 ms) at 150 and 500 particles, so the log-bodies term is forced to split a difference the data says isn't there (±58.6% residuals, mirror images). The rule was pre-registered with the median precisely so two outlier rows can't veto a 19-row design; the exception is itself additive-world evidence (particle count is simply not a cost driver in the measured range). Also recorded: the most extreme combo, `grid-heavy-all`, has no label (bench page memory cap) and is excluded everywhere below — the additivity claim covers the measured space, not that corner.

### The replay, for the record (25 scenes scored; grid-heavy-all excluded)

| strategy | over-budget | mean hitch frames | settled quality | false-cheap | pinball (ms) |
|---|---|---|---|---|---|
| (a) static-reactive (today) | 11/25 | 21.12 | 0.8075 | — | — |
| (a′) static-tiers (additive prime) | 11/25 | 21.12 | 0.8075 | 0.96 | 24.0435 |
| (b) count-only | 0/25 | 0 | 0.8075 | 0.04 | **2.1361** |
| (b) ridge | 0/25 | 0 | 0.8075 | 0.48 | 8.7120 |
| (c) cost head (OOF calibrated) | **0/25** | 0 | 0.8075 | 0.08 | 2.7137 |

Leg by leg, against the issue's numbers:

- **Over-budget: PASS.** The head opens 0 scenes over budget vs today's 11 (the count/cast/scale/blend/mirror grid rows) — a 100% reduction, ≥ the 30% bar, at *equal* settled quality (0.8075 both: bounded restore settles primed scenes at the same rung the reactive ladder reaches; the win is entirely the opening seconds, which is the head's stated purpose). Note the count-only baseline also reaches 0/25 — in an additive world, simple primes work too.
- **False-cheap: FAIL.** 0.08 > the 0.05 ship bar — the head under-predicts 2 of 25 rows after calibration (`grid-count-480`, `grid-heavy-count-scale`: the fold-constant calibrated prediction 50.3 ms vs labels 53.6 / 53.4). This is Slice B's measured OOF reality, re-derived independently here. (Decision-level false-cheap is 0: the head never says "no prime needed" about a scene that opens over budget.)
- **Pinball: FAIL.** Head 2.7137 ms vs count-only 2.1361 ms — the head does not beat the count-only baseline at all, let alone by the required 15% (it does beat ridge, 8.7120). Cause, visible in Slice B's report: per-fold OOF predictions collapse to a constant (50.3 ms for every grid row, 79.56 for every parity row) — leaf saturation on 6–19 training rows. A constant cannot win a pinball contest against a slope.
- **Unseen-device: NOT EVIDENCED.** One device in evidence (Apple M2 Max). The judge prints this leg mechanically and never estimates it — labels for an unmeasured device would be fabrication. **Closer:** run the same harness on a second device (`node src/gl/parity/costBench.mjs --gpu --out <device2-dataset.json>`) and re-run this judge with that dataset and the shipped artifact's `predictMs` predictions as the head leg. Until then SHIP was unreachable regardless of the other legs.

### Caveats that ride with the numbers

- The dataset's environment stamp records `probeDrift: true` (the end-of-run blend probe moved 0.3 → 0.8 ms). Labels are medians of per-rep p90s and stand, but small label differences (~1–3 ms) are inside session noise — one more reason the fxDepth coefficient reads ≈ 0 rather than exactly its lab value.
- Gate 0 asks whether component costs *explain* the labels (in-sample, on the designed grid). The replay asks a different question — whether anything *predicts* unseen families — and there the additive form itself extrapolates poorly (a′: false-cheap 0.96). Both facts are in the report; the contract's kill turns on the explanation test, and it fired.
- 25 rows, 2 families, 1 device. Every leg above is exactly as strong as that evidence base and no stronger.

## Reproduce

```bash
# the judgment (dataset = the Studio run of 2026-10-28; head report + model default to studio/)
node app/src/gl/parity/costReplay.mjs \
  --dataset /home/hatch/workspace/goals/kinetic-curator-generative-art-instrument/hidden_files/cost-dataset-studio-2026-10-28.json \
  --out studio/cost-replay-report.json

# the selfcheck (planted worlds + committed-report structure; re-runs the
# real judge end-to-end when KC_COST_DATASET points at the dataset)
KC_COST_DATASET=/home/hatch/workspace/goals/kinetic-curator-generative-art-instrument/hidden_files/cost-dataset-studio-2026-10-28.json \
  node app/src/gl/parity/costReplay.selfcheck.mjs
```

Observed in this worktree: judge run prints the table above and `VERDICT: KILL`; selfcheck OK (real-dataset run exercised, 25 rows); neighbouring suites still green (`costDataset`, `costHead`, `glDriver` selfchecks); Prettier + ESLint clean on both new files.

**Not done, deliberately:** no prime call site (the verdict is KILL — wiring the head now would contradict the judgment); no changes to the judged code; no second-device run (needs a second physical device + a bench session — the named closer above, not a code task).
