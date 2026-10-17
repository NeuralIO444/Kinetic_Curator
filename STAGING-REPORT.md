# STAGING REPORT — #1578 automation harness (governor cost head, T4)

Branch `ember/1578-automation`, base `cb016db3`. **Staging only — no push, no PR.**
Goal: the #1578 remainder (Studio label run → device probes → training →
governor-replay ship/kill verdict) becomes ONE command, with everything
downstream running itself. The prime call site is **not** built — the head
stays inert, zero behavior change to the live instrument.

## The one command

```sh
cd app && npm run cost:studio        # docs/COST_HEAD_RUNBOOK.md
```

Stages: build → bench (full corpus + probes) → dataset gate → train →
judge. Exit code = the verdict's (0 SHIP · 1 KILL · 3 ADDITIVE-KILL).

## What was built

| Piece | File | What it does |
|---|---|---|
| Studio runner | `app/scripts/costStudioRun.mjs` (+ `cost:studio` npm script) | Chains build → `costBench.mjs` → gate → trainer → judge. The gate re-validates the dataset and **fails the run** on any failed recipe (no silent partial dataset), probe drift >±50%, or suspect-timing rows (overrides `--allow-drift` / `--allow-suspect`, printed when used). Provenance (renderer, SwiftShader) is printed from the dataset itself every run. |
| Trainer | `studio/train_cost_head.py` | Additivity gate FIRST (refuses to train, exit 3, when costs add). Else: grouped splits (recipe × device, shared FNV-1a folds), quantile regression τ=0.9 on log-ms (`reg:quantileerror`), monotone constraints on the physically-monotone features, calibration multiplier = nearest-rank p90 of actual/predicted on the cross cells (floored at 1.0), export in the runtime's exact artifact format. Self-verifies the exported walk reproduces the booster before writing (max divergence is in the report). Fail-clear if xgboost is missing (exit 2). Native `xgb.train` API — needs numpy + xgboost only, no sklearn. |
| Replay judge | `app/src/gl/parity/costJudge.mjs` | Replays held-out (unseen recipe × unseen device) scenes through (a) static tiers, (b) count-only baseline, (c) ridge baseline, (d) the head — scored through the **real** runtime evaluator (`validateCostModel` + `predictMs` + `initialRung` from `costHead.mjs`). Prints one verdict line against #1578's thresholds. Baselines fit on train cells only, inside the judge. |
| Browser override | `app/src/gl/parity/glDriver.mjs` | `KC_CHROMIUM_PATH` env → `chromium.launch({ executablePath })`; unset = today's behavior, byte-identical. Lets a real Mac point the harness at its installed Chrome. |
| Runbook | `docs/COST_HEAD_RUNBOOK.md` | The Studio procedure, prerequisites, variations, honesty notes. |
| Selfchecks | `app/src/gl/parity/costJudge.selfcheck.mjs` (in the manifest), `studio/train_cost_head_selfcheck.py` (standalone, mirroring `xgb_head_selfcheck.py`) | See “Verification”. |
| Housekeeping | `app/package.json`, `app/selfcheck.manifest`, `.gitignore` | `cost:studio` script; judge suite registered; `app/cost-datasets/` ignored (per-machine working data, same precedent as `mlx_data/`). |

## Audit findings — what already existed vs what was built

- **The measurement harness was already complete** (PR #1622): `costBench.mjs`
  drives headless Chromium through all 26 corpus recipes via the parity
  render path, with the label law (median of per-repetition p90s, warm-ups
  discarded, wall-clock cross-check) and dataset validation on write. The
  runner reuses it untouched.
- **The four device probes were already built** — implemented page-side in
  `costBench.html` (`window.__kcProbes()`), exactly the `PROBE_SPEC` work in
  `costDataset.mjs` (fill 512²/48-iter/16 draws · instanced 8192×8 · blend
  512²/24 · JS 2M iterations; 1 warm-up + median of 5), run by the bench at
  session start and end with a ±50% drift flag. Nothing to build. (The
  runtime's `runDeviceProbes()` in `costHead.mjs` is still a placeholder —
  that's the prime slice, out of scope.)
- **The artifact byte-contract** is `costHead.mjs validateCostModel`:
  `{kind:'xgboost-cost', objective:'reg:quantileerror', baseScore, features,
  trees[{f,op,v,y,n,gain}|{leaf}], calibration, tau}`, prediction =
  `exp(baseScore + Σ leaves) × calibration`, depth cap 6 / 512 trees /
  20000 nodes. (`app/scripts/predictCostTier.mjs` is a different, older
  per-effect tier model — not this contract.) The trainer's export mirrors
  T1's conversion discipline from `studio/curator.py` (one-hot term →
  `=` split with children swapped, `calibrate_base_score` median), adapted
  to the cost head's three numeric prefixes (`num.`/`mech.`/`probe.`).
- **No recorded cost performances exist in-repo.** `performanceFile.mjs`
  replays resolver *inputs* for determinism, not frame costs — so the
  judge's replay set is the harness's corpus scenes with measured labels,
  the fallback the harness slice documented. The judge prints this on
  every run.
- **Playwright**: the repo's devDep is `@playwright/test` 1.49.1 (which
  brings `playwright`/`playwright-core`); `glDriver` launches its Chromium.
  No new dependencies anywhere.
- Sandbox environment note: this worktree arrived with **no
  `app/node_modules`** — module resolution was silently falling through to
  a stale shared `node_modules` in `~/workspace/kc263run` (which lacks a
  current `@tauri-apps/api`, so `npm run build` failed on an untouched-tree
  import). `npm install` in `app/` fixed it; build is green. Not a repo
  defect — a sandbox provisioning gap, recorded here so the next lane
  doesn't re-diagnose it.

## Design calls (flagged)

1. **Split rule shared by trainer and judge** (identical code in Python and
   JS, same fixture vectors pinned in both selfchecks): FNV-1a fold-0
   holdout over sorted recipe ids and device keys (device = renderer +
   platform), with declared fallbacks so a train set always exists. Cells:
   train / cross (one side held — calibration + early stopping) / test
   (held × held — the judge's alone). With a single device there is no
   unseen-device leg and the judge says so (verdict KILL, “not evaluable”)
   rather than passing on partial evidence.
2. **No refit after early stopping** (deviation from T1's refit-on-pool):
   calibration honesty outranks pool size — the calibrator's cross cells
   stay out of the fit so the false-cheap gate is judged on cells the
   calibrator never saw. Recorded in the trainer's header.
3. **The judge's shed rubric**: a primed rung's retained quality
   (1 / 0.85 / 0.70 / 0.50) and cost factor (renderScale²) are declared
   constants in `costJudge.mjs`, applied identically to every contender —
   the judge's ruler, not a renderer claim. “Equal retained quality” for
   the 30% leg is operationalized as within 0.05 of static's mean; the
   ≥15%-quality-at-equal-hitches leg is implemented as written.
4. **Feature exclusions in shaping** (each listed in the trainer report):
   top-level keys that are null/numeric/array in any row (`palette` when
   null, `castSize`, `cast`, `castCategories`, `v`) cannot be split by the
   evaluator's rules and never become columns.
5. **Monotone set**: all `mech.*`, all `probe.*` (a slower probe = a
   costlier frame), and `num.count` / `num.scaleMid` / `num.density` /
   `num.particleCount`. Everything else unconstrained.
6. **Additivity tolerance 25%** relative error per combo, on the corpus's
   own ladder math (base + one-factor deltas vs the four measured pairwise
   heavies) — implemented identically in trainer and judge; both
   selfchecks pin the same hand-computed fixture, boundary case included.
7. Trainer defaults: `--out studio/cost-model.json` via the runner. The
   artifact is written but **not** wired anywhere; committing it belongs
   to the prime slice, after a SHIP verdict on Studio labels.

## Verification

- `costJudge.selfcheck`: **all assertions passed** — FNV pins, split
  partitions + fallbacks, additivity fixtures (incl. the exact-25%
  boundary), baseline fits, hand-computed replay scoring, verdict math
  (SHIP both legs / KILL false-cheap / KILL gain<10% / KILL no-model /
  KILL no-device-leg / ADDITIVE-KILL), artifact round-trip through the
  real evaluator (hand-built artifact → `predictMs` matches hand-computed
  `exp(4.3)×1.2`; validator rejects a top-level-numeric split and a
  depth-7 chain, accepts depth-6), and `runJudge` end-to-end on fabricated
  schema-valid datasets (SHIP on two devices; honest KILL on one).
- `train_cost_head_selfcheck.py` (stdlib python3): **all assertions
  passed** — the same FNV/split/additivity vectors as the JS suite
  (cross-language lockstep), shaping + exclusions, dump conversion incl.
  the one-hot child swap walked to the booster's leaves, calibration math.
- Trainer fail paths exercised live: xgboost missing → exit 2 with an
  install message; exactly-additive fixture → exit 3, report written, **no
  artifact**; the judge independently returns ADDITIVE-KILL (exit 3) on
  the same fixture.
- **Byte-contract proof**: a model trained by the Python trainer
  (xgboost 3.4.1, synthetic dataset) passes the real `validateCostModel`
  and `predictMs` prices all 26 rows; the trainer's internal walk-vs-booster
  divergence was 1.2e-06 log-ms. (Found and fixed en route: the native
  API's `predict()` ignores `best_iteration` — margins are now taken over
  `iteration_range=(0, rounds_used)`. The self-verification caught it;
  divergence before the fix was 0.486.)
- Sandbox end-to-end: **LANDED** — the full chain (bench → dataset gate →
  trainer → judge) executed on real measured sandbox labels (14-recipe
  subset), every honesty gate firing as designed; details below.
- Full manifest sweep: **LANDED** — 447 suites, 444 pass, the only 3
  failures the sanctioned sandbox exceptions; details below.
- `npm run build`: green. ESLint: clean on all touched files.

## Sandbox end-to-end results

_(SwiftShader labels — machinery validation only, per the issue. A verdict
computed on them is not evidence for ship/kill.)_

**First attempt (defaults: 1280×720, 30 frames, 3 reps):** reached 23/26
recipes in ~75 min with sane labels (count ladder 12→69 ms, 160→213 ms,
480→368 ms; scale-large 147.5 ms vs scale-small 69.4 ms; FX chains
~2.5 s under CPU rasterization) — then the sandbox VM **restarted**,
wiping `/tmp` (a 512 MB tmpfs) and the run's outputs with it. The bench
code was never at fault; the outputs were simply on volatile storage.

**Second attempt:** re-run at `--frames 15 --reps 2` with outputs on the
persistent overlay filesystem (`~/tmp-big/`, `TMPDIR` pointed there too).
It stalled in the device probes: the sandbox VM has **2 cores** and was
running at load 13–20 from sibling builders' own Chromium sweeps — a
probe batch is ~200 M transcendental ops on SwiftShader, and the bench's
GPU process accumulated ~10 s of CPU in 7.5 minutes of wall time. Not a
harness defect (the identical code labeled 23/26 recipes in attempt 1);
pure CPU starvation.

**Recorded proof (attempt 3):** a 5-recipe subset at `--frames 5
--reps 1` — `grid-base, grid-count-160, grid-count-480, grid-fx-1,
grid-heavy-count-fx` (a count-ladder leg, an fx single, and one full
additivity combo) — chosen to fit the starved box while still exercising
every code path: probes, label law, wall-clock cross-check, dataset
validation on write, trainer, judge. The full-corpus defaults run
remains the Studio command's job. Results below.

**Attempt 3 outcome (coordinator-completed, 2026-10-17, box idle).** Three
findings on the way through:

1. **Payload cap.** At the default `--max-payload-mb 512`, the two
   480-instance recipes fail deterministically ("payload too large for
   page memory: 531.7MB") — the payload is recipe-size-driven transport,
   not corruption. Re-run with the runner's own `--max-payload-mb 1024`
   flag; all recipes then label. (On the Studio the same flag exists if
   a corpus recipe ever outgrows the default.)
2. **A real runner bug, found and fixed.** `costBench.mjs` wrote the
   dataset with `writeFile` but never created the output directory —
   on any fresh checkout `app/cost-datasets/` (gitignored) does not
   exist, so the bench died with ENOENT *after* labelling everything
   and the chain reported "no dataset was blessed." The Studio
   one-command run would have hit the same wall. Fix (coordinator,
   in this staging): `mkdir(dirname(args.out), { recursive: true })`
   before the write in `app/src/gl/parity/costBench.mjs`. The two
   trainer outputs (`studio/cost-model.json`,
   `studio/cost-model.report.json`) were likewise added to `.gitignore`
   beside the dataset entry — run outputs, never commits; a
   SwiftShader-trained model must never be committable by accident.
3. **The 5-recipe subset stops honestly at the trainer** — "only 4
   train cells — not enough to fit honestly" (the ≥8-train-cell floor
   working as designed; a 5-recipe single-device subset cannot carry
   a verdict). The chain was then re-run on a **14-recipe subset**
   spanning the count/cast/scale/fx/blend/heavy axes (swarm excluded:
   wasm timing noise), and **every stage executed on real labels**:
   - Bench: 14/14 measured, 0 failed. Label order sane: count-12
     652 ms → base 1,669 ms → fx singles ~1.5–1.8 s → count-480
     6,549 ms → scale-large 8,501 ms → heavy-all 23,961 ms
     (SwiftShader-inflated, machinery only).
   - Dataset gate: schema valid; provenance read back correctly;
     the SwiftShader SOFTWARE RENDERING banner and the subset warning
     both printed; probeDrift = false.
   - Trainer: additivity gate read **indeterminate** on this data and
     let training proceed; fit completed — 165 trees, depth 3,
     calibration ×1.000039, and the export self-verification passed on
     a genuinely trained model (walk-vs-booster divergence 1.06e-05
     log-ms, same order as the synthetic byte-contract proof).
   - Judge: replay found **0 held-out scenes** — single-device data
     has no unseen-recipe × unseen-device cell — and returned
     **VERDICT: KILL** with the reason stated in plain language ("a
     ship verdict needs evidence this data cannot give"). Exit code 1,
     matching the documented KILL code. This is the judge working as
     designed, not a machinery failure: on one device it refuses to
     ship, which is the only honest answer.

## Sweep results

Full manifest sweep of this tree (run-all collector, 300 s per-suite
cap, box idle): **447 suites — 444 PASS, 3 FAIL**, and the 3 failures
are exactly the sanctioned sandbox exceptions with their canonical
signatures, each proven base-identical on pristine trees repeatedly
during the Phase 2 slice stagings the same night:

- `kernel/bake/swarmWasm` — exit 1, cargo absent from the sandbox.
- `fx/rollSafety` — exit 124 at the cap (known long non-completion;
  CI is authoritative for this suite).
- `gl/accum` — exit 134 (V8 heap OOM in the sandbox).

The stock `npm run selfcheck` runner stops at the first of these
(swarmWasm), which is the expected sandbox behaviour; CI runs the
manifest on a Mac runner where none of the three apply. `npm run
build` green (re-verified by the coordinator at commit time); ESLint
clean on all touched files; both new selfchecks
(`gl/parity/costJudge.selfcheck.mjs`,
`studio/train_cost_head_selfcheck.py`) green.
