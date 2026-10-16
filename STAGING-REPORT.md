# STAGING REPORT — #1578 T4 benchmark harness (slice 1 of the remaining T4 work)

Branch `ember/1578-cost-harness` on main `19b60b9c`. LOCAL ONLY — nothing pushed, no PR.
Scope per the issue's scheduling comment: **benchmark harness first**; Studio training, real
device probes, and the prime call site are LATER slices and were NOT built. The runtime slice
from PR #1583 stays inert; no governor behaviour changed.

## What was built

All new files live beside the parity harness whose render path they reuse
(`app/src/gl/parity/`):

- **`costBench.mjs`** — the harness CLI (`npm run bench:costs`). Per recipe: resolveLayers →
  buildSceneContract → buildRenderPayload (the parity driver's own pipeline — the real render
  path, not a mock) → load once into the bench page → repeated timed render batches → dataset
  JSON. Flags: `--out --only --width --height --frames --reps --max-payload-mb`.
- **`costBench.html`** — the bench page. `__kcBenchLoad` / `__kcBenchRun` time
  `renderer.renderScene` per frame with performance.now() (renderScene ends in readPixels, so
  the timed window contains completed work — the `__kcPerf` convention). No rAF anywhere:
  vsync-censored labels would read every sub-refresh frame as identical. `__kcProbes` runs the
  four device microbenchmarks (fill / instanced / blend / JS) as raw WebGL2 + JS on a scratch
  context, 1 warm-up + 5 timed batches, median kept.
- **`costCorpus.mjs`** — 26 recipes: the 6 parity corpus scenes verbatim as anchors, plus a
  20-recipe designed grid (base + count/cast/scale/FX-depth ladders + blend/mirror/swarm +
  4 heavy-tail combinations, oversampling the expensive end on purpose). Deterministic by
  construction (fixed seeds, strided cast slices, no RNG).
- **`costDataset.mjs`** — the dataset contract: statistics (nearest-rank percentiles), the
  label definition, the PROBE_SPEC work definitions, and `validateDataset()` — the gate the
  bench runs before writing, and the contract the Studio training slice consumes.
- **`costDataset.selfcheck.mjs`** — pure suite (registered in `app/selfcheck.manifest`):
  stats/label math, corpus determinism + JSON-safety, feature-vector completeness for every
  corpus doc, and the validator's accept/reject behaviour.
- **`glDriver.mjs`** — one additive export: `evaluateChunked` (the existing 16MB-piece ferry
  the export path uses) is now exported so the bench can load big atlas payloads. No existing
  behaviour touched.

## Dataset schema (v1, `kind: kc-cost-dataset`)

Header: `generatedAt`, `generator` (script + git sha + node), `environment` (UA, WebGL
renderer/vendor strings, `swiftShader` boolean, platform/CPUs/RAM, probe results at session
start AND end, `probeDrift` flag), `method` (label definition, frames/reps/warm-up, timing
convention, "no vsync — tight loop" statement), `featureSchema` (source = `costFeatures()`,
recipeFeatures version). Each row: `id`, `description`, `status` (`measured` | `failed` +
`error`), the full `doc` (rows are replayable — the future governor-replay ship/kill judge
needs them), `features` (the exact `costFeatures()` output: recipe categoricals + `num.` +
`mech.` + `probe.` in costHead's runtime key names {fillRate, instanced, blend, js} carrying
measured probe ms), `canvas`, per-rep summaries `{n, mean, p50, p90, p99, max}`, and
`labelMs` = **median of the per-repetition p90s**. A sample artifact from the sandbox runs is
committed beside this report: `cost-dataset.sample.json`.

Methodology guards: 2 warm-up renders discarded per rep; every rep is also wall-timed from
Node and a >2.5× disagreement with the page median flags the row `timingSuspect` (none fired);
a recipe that kills its page is retried once on a fresh browser, then recorded as a failed row
with its error — never silently dropped; probes re-run at session end and >±50% drift flags
the dataset.

## Defect found in the landed runtime slice (fixed here)

`mechanismFeatures()` in `src/hooks/costHead.mjs` read the post-#1202 scale shape
(`{x: [lo,hi], y: [lo,hi]}`) as if `p.scale.x` were a number — it is an array — producing
**NaN `mech.*` values for every current-shape recipe**. The taste-head features were fixed for
this shape in #1545; the cost head's estimator never got the same treatment, and its selfcheck
only exercised the legacy array shape, so nothing caught it. Fix: read the X pair with
recipeFeatures' own convention (finite-guarded), plus a deep-equal pin in
`costHead.selfcheck.mjs` (object shape ≡ array shape) and a validator rule that every
`num.`/`mech.` value in a dataset row is finite. Anything less (sanitizing in the harness)
would have shipped poisoned rows and hidden a real defect.

## What was measured here (real numbers, sandbox environment)

Environment: headless Chromium, ANGLE/Vulkan **SwiftShader** (CPU rasterizer), 2 CPUs / 8 GB,
shared with other builders. Canvas 512×358, 5 frames × 2 reps (sandbox-sized; defaults are
1280×720, 30 × 3). Absolute ms are SwiftShader numbers — see limits below. Ordering within a
session is the validated signal, and it is monotone on every axis:

| recipe | label (ms) | session |
|---|---|---|
| grid-count-12 | 442 / 655 | 1 / 2 (two sessions — load noise) |
| parity-fx-stack-3 (anchor) | 1344 | 1 |
| grid-base (48 bodies) | 1560 | 2 |
| grid-fx-1 | 1722 | 2 |
| grid-fx-4 | 1888 | 2 |
| grid-count-480 | 4190 | 3 |
| grid-heavy-all (480 × large × cast24 × 4 FX) | 11311 | 3 |

Count ↑ ⇒ cost ↑; FX depth ↑ ⇒ cost ↑; the all-heavy combination is 3–6× the next row down.
Probes (session 2): fill 1879 ms, instanced 8031 ms, blend 217 ms, js 129 ms per fixed batch;
end-of-session probes drifted (instanced → 4589 ms as sandbox load changed) and the dataset
correctly carries `probeDrift: true` — the flag works, and it is also why cross-session label
ratios must be read through probe ratios, not raw ms.

Payload findings (they shape any future harness work): payload size is driven by distinct
(asset × tint × accent) **combos**, not instance count — 9 combos ≈ 80 MB ferried, 25 combos
≈ 244 MB, ~55 combos ≈ 532 MB, heavy-all ≈ 640 MB (atlas raster + mipmaps dominate). The first
bench run's 80 MB single-evaluate guard failed 5 of 7 recipes; routing the load through the
driver's chunked ferry fixed every one of them. At the default 512 MB page-memory cap the two
heaviest recipes record as failed rows; with `--max-payload-mb 1024` both measured (attempt 1
died on a SwiftShader "framebuffer incomplete" — the fresh-browser retry absorbed it).

## What could NOT be validated in this sandbox

- **Absolute frame times are not device truth.** SwiftShader renders fx-stack-3 at ~1.3–3.6 s
  per frame where a real GPU is in the tens of ms. These labels must never train a shipped
  model; device-truth labels come from running this harness on the Studio / real devices.
- **Session-to-session variance is large under shared load** (count-12: 442 vs 655 ms;
  instanced probe: 16.7 s vs 4.8 s across sessions). Within-session ordering held everywhere;
  absolute repeatability did not, and cannot here.
- **The full 26-recipe corpus was not run end-to-end here** (at SwiftShader speeds the heavy
  rows take 5–8 minutes each; 8 of 26 were measured across three runs, spanning every ladder
  axis + both anchors tried). The full run is a Studio job.
- **The accum/live path is unpriced** (documented v1 corpus gap): layoutParams.accumulation
  renders through the live renderer's sequence path, not renderScene — grid recipes keep it
  off, and pricing it needs a live-frame bench slice.
- Features describe the doc-level (active-layer) layoutParams — the prime call site's own
  input shape. Per-layer snapshot costs ride along only inside the stored doc, for replay.

## Verification run

- `costDataset.selfcheck` — green (26 corpus recipes, contract pinned).
- `costHead.selfcheck` — green, including the new scale-shape pin.
- `parity/diff.selfcheck` — green (neighbour).
- ESLint on all touched files — clean. `npm run build` — green.
- The full manifest sweep was NOT run (per dispatch: shared sandbox tonight; the coordinator
  runs it solo at publish time). The parity render suite itself is untouched by this change
  except the additive glDriver export.

## For the next slices

Training (Studio): read rows where `status: 'measured'`, features = `row.features` verbatim,
target = `log(labelMs)`, objective quantile τ≈0.9, grouped splits by recipe family AND device
(environment block). Governor replay: rows carry their full docs — replay needs nothing else.
Device probes slice: PROBE_SPEC in costDataset.mjs is the work definition to reuse verbatim so
runtime probes stay comparable to harness rows.
