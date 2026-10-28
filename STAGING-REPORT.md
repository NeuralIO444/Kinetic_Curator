# STAGING REPORT — #1578 device probes slice (branch `feat/1578-device-probes`)

Coordinator: this branch is LOCAL ONLY (no push, no PR) — publish after verifying.
Base: origin/main @ 7f371547. This file replaces the previous slice's report at
the worktree root (that report remains in git history), per house convention.

## What was built

The runtime device-probes module for the governor cost head (XGBoost T4):
four tiny self-run microbenchmarks (fill rate, instanced draw, blend, JS)
producing the `features.probe` descriptor bag `{ fillRate, instanced, blend, js }`
(measured ms) that `app/src/hooks/costHead.mjs` already consumes.

- **`app/src/hooks/deviceProbes.mjs`** (new) — the module. Placement: beside
  `costHead.mjs` in `src/hooks/`, because costHead is its consumer and hooks/
  is where the app's runtime (non-harness) modules live; `src/gl/parity/` is
  Node harness tooling. API:
  - `measureDeviceProbes({ budgetMs, now })` — runs the probes, never throws,
    returns a bag holding ONLY honestly-measured descriptors.
  - `getDeviceProbes({ storage, force, measure })` — cache-first entry point
    (the future prime call site's one call); concurrent calls share one pass.
  - `readCachedProbes` / `writeCachedProbes` — the persistence pair.
  - `sanitizeProbeBag` — the single honesty gate shared by measurement and
    cache reads; `timeBatches` / `jsProbeBatch` exported for the selfcheck.
- **`app/src/hooks/deviceProbes.selfcheck.mjs`** (new) — pins: spec parity,
  descriptor shape, absent-on-failure, cache versioning, the no-fake-numbers
  law, and the end-to-end costHead contract (bag rides through `costFeatures`
  verbatim; `predictMs` returns null when a probe a model splits on is absent).
- **`app/selfcheck.manifest`** (+1 line) — the new suite, wired immediately
  after `costHead.selfcheck.mjs`, per the house rule.
- **`app/src/state/bundle.js`** (+2 lines) — the ONE existing-file touch, and
  it is forced by the repo's own gate: `bundleKeys.selfcheck` requires every
  `kc:` storage key to carry a bundle decision. `kc:device-probes:v1` is
  registered in `BUNDLE_LEFT_OUT` with its reason (descriptors of THIS machine;
  meaningless elsewhere; never project content). Declarative registry data
  only — no behaviour change (bundle + bundleKeys suites green, below).

## Laws honoured

- **Work spec is PROBE_SPEC verbatim** (`src/gl/parity/costDataset.mjs`):
  fill 512×512 / 16 draws / 48-iteration fragment loop; instanced 8192 quads /
  8 draws; blend 512×512 / 24 quads at alpha 0.1; JS 2,000,000 iterations;
  1 discarded warm-up + 5 timed batches, median; every GPU batch ends in
  readPixels (the bench's timing law). The spec values are duplicated in the
  module per the house convention (costBench.html duplicates them too) and
  the selfcheck pins the copy `deepStrictEqual` against `PROBE_SPEC`.
- **Honest signals:** any probe that fails, times out, or cannot run yields
  NO descriptor (absent key) — never a guessed/default number. One gate
  (`sanitizeProbeBag`) enforces it for live measurement and cache reads
  alike: unknown keys, non-numbers, NaN/Infinity, ≤ 0 are dropped.
- **Time budget:** `PROBE_TIME_BUDGET_MS = 2000` ms wall clock for the whole
  pass, checked between probes; a probe that would start past budget is
  skipped (absent), never rushed with fewer reps.
- **Cache:** localStorage `kc:device-probes:v1` (app convention; injectable
  `{getItem, setItem}` backend with memory fallback, diceCrowns pattern).
  Record = `{ v: 1, at, probes }`; version mismatch / corrupt JSON / junk
  probes = miss → re-measure. Only bags with ≥ 1 real descriptor are cached,
  so a total failure retries next launch instead of freezing. A key missing
  inside a cached bag stays missing until the version bumps — the version
  key is the invalidation mechanism.
- **Inertness:** nothing imports the module yet; no call sites anywhere; no
  governor wiring; costHead untouched. `git diff --stat` vs main: only the
  files above. Behaviour with the module present is bit-identical by
  construction (it is dead code until the prime call-site slice).

## Dataset schema finding (coordinator's question)

The kc-cost-dataset v1 schema ALREADY has the slot: `validateDataset`
requires `features.probe` with exactly the four finite keys
`fillRate / instanced / blend / js` — this module's output shape matches it
exactly, no schema change made or needed. Likewise, recording probe
descriptors alongside labels in the corpus run needs NO schema change:
`costBench.mjs` already records them (`probeBag()` from the bench page's
`__kcProbes`, plus a start/end drift check) into every row. The runtime
module produces the same bag names from the same spec, so runtime-measured
and harness-measured descriptors are directly comparable.

## Verification (run in this worktree)

- `node src/hooks/deviceProbes.selfcheck.mjs` — **OK**.
- Full manifest chain (`npm run selfcheck`): **520 of 521 suites pass**,
  including the new suite and `bundleKeys`/`bundle` after the registry entry.
  The one exclusion: `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` fails
  with "cargo not found on PATH" — this sandbox has no Rust toolchain
  (`which cargo` is empty machine-wide; the suite's own output names the
  cause). No Rust/wasm files are touched by this slice; the suite was
  excluded via a filtered manifest copy (`SELFCHECK_MANIFEST`) so the
  remaining 520 could run to the manifest's final suite (showSpectrum, OK).
- `npm run selfcheck:sweep` — exits 0 with "SWEEP TESTS SKIPPED: no headless
  Chromium" (Playwright browsers not installed in this sandbox; environmental).
- `npm run build` — **✓ built in 2.63s** (the >500 kB chunk warning is
  pre-existing).
- `eslint` + `prettier --check` on all touched files — clean.

## Follow-ups flagged (NOT done here, by design)

1. **costHead's `runDeviceProbes()` placeholder still returns fake 1.0s**,
   and `costFeatures()` falls back to it when no probes are passed. Replacing
   that placeholder with `getDeviceProbes()` (or deleting it and making the
   bag inject-only) belongs to the prime call-site slice — this slice was
   forbidden from touching call sites.
2. **Prime call site** (crown/load): call `getDeviceProbes()` once at first
   launch and pass the bag into `costFeatures`/`primeGovernor`. Async by
   design: `predictMs` already treats an absent bag as fallback, so the
   first frame never has to wait for probes.
3. **GPU probe paths are unverifiable in this sandbox** (no DOM/WebGL2): the
   selfcheck pins everything Node can reach — in Node the GPU probes are
   honestly ABSENT and only `js` measures, which is itself the
   absent-on-failure proof. The GL work itself is a verbatim port of the
   shipped `costBench.html __kcProbes` implementation; a browser smoke of
   `measureDeviceProbes()` on a real device should ride along with the
   Studio corpus run or the prime call-site slice.
4. Partial-bag caching means a probe that failed once stays absent until
   the version bumps (deliberate — see module header). If driver-drift
   re-measurement is wanted sooner, that's a cache-policy decision for the
   prime slice, not a silent change here.
