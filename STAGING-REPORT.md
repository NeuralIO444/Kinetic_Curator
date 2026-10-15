# STAGING REPORT — #1545: fix the dead scaleMid axis + FEATURES_VERSION 3 → 4

Branch `ember/1545-scalemid` on origin/main 13a7e4ff. Local commits only —
nothing pushed, no PR opened. Matt's ruling (2026-10-14): "Fix it and
re-baseline."

## What was built

1. **The reader fix** (`app/src/curator/recipeFeatures.js`). Root cause,
   confirmed in code: `recipeNumerics` gated pair params on
   `Array.isArray(v)` — since #1202 the normalized scale is an `{x, y}`
   object, so it fell back to `[0, 0]` and `scaleMid` clamped to 0 for
   every recipe (the `v[0]`/`v[1]` legacy indexing in `PAIR_NUMS` never
   even got a real pair). The fix normalizes scale to its **X pair** at
   the point numerics receives the value — the same convention the
   bucket path in the same file already uses (`scalePair` reads
   `p.scale.x`) — then the existing `PAIR_NUMS` arithmetic runs
   unchanged: pair mid, normalized on the existing 0.1–3.0 range,
   clamped like its sibling axes. A legacy array still reads as itself.
   No bucket edges changed; no other axis touched; no param, range, or
   PARAM_SPEC change.
2. **FEATURES_VERSION 3 → 4** in the same file, with the v4 note added
   to the file's version history comment, per its own contract ("bump
   whenever a key or bucket edge changes in meaning").
3. **prospecting.mjs note updated**: the dead-axis caveat is retired and
   replaced with the v3 history + the standing design reason — scale is
   proven at bucket granularity because a corner declares rolled
   `{x, y}` ranges and the bucket is what it can honestly promise. The
   bucket-granularity bias proof itself is unchanged.

## Before / after — the corpus measurement

Corpus protocol (deterministic, shipped tooling): miner `sampleBatch`,
seed 0x1506 (E2's demo seed), batch 600, no corner; every sample
featurized via `featuresOf`; `num.scaleMid` histogrammed.
Script: `~/workspace/kc-1545-evidence/measure-corpus.mjs`.

| | v3 (origin/main 13a7e4ff) | v4 (this branch) |
|---|---|---|
| ==0 | **600** | 0 |
| (0, .25] | 0 | 173 |
| (.25, .5] | 0 | 330 |
| (.5, .75] | 0 | 97 |
| (.75, 1] | 0 | 0 |
| mid-band (.25, .75] | **0** | **427** |
| mean / min / max | 0 / 0 / 0 | 0.3608 / 0.1586 / 0.6483 |

Point values on the fixed code (all measured, then pinned):
floor pair [0.1, 0.1] → 0 · mid pair [1.55, 1.55] → 0.5 · top pair
[3.0, 3.0] → 1 · span pair [0.1, 3.0] → 0.5 (the mid is read, not an
end) · object `{x:[0.2,2.9], y:[0.1,0.1]}` → 0.5 (X pair only) ·
default recipe → 0.3103 (was 0) · hostile `scale:'big'` → 0.3103
(normalizes to the default; finite, in range).

## Every pin re-derived, and from what run

- `recipeFeatures.selfcheck.mjs` — `FEATURES_VERSION` pin 3 → 4. The
  `scaleMid === 0` pin: the fixture is the pair [0.1, 0.1], whose mid
  IS the 0.1 range floor, so 0 is now pinned as the floor with the
  reason stated. New v4 block pins the measured point values above,
  plus a **40-rung ladder corpus** (X pairs [v, v] spanning 0.1–3.0):
  histogram **[1, 9, 10, 10, 10]** — only the floor rung reads 0, the
  mid-band holds 20 of 40. All values taken from runs of the fixed
  code, never hand-computed into the test first.
- `queenChannel.selfcheck.mjs` — **found by the repo-wide sweep**: the
  taste fixture hardcoded `featuresVersion: 3` and runs through
  `validateTaste`, so it would have failed the moment v4 landed. It
  now reads `FEATURES_VERSION` dynamically — the pattern tasteHead's
  and bundleFile's fixtures already use — with the reason in a comment.
  (Stale-version rejection stays covered dynamically in
  tasteHead.selfcheck via `FEATURES_VERSION - 1`.)
- `prospecting.selfcheck.mjs` — the `!('scaleMid' in ranges)` assertion
  **stays** (see judgment call 2); only its stale "the substrate's dead
  axis" justification was updated to the by-design reason.
- Verified dynamic, no change needed: `tasteHead.selfcheck.mjs`
  (imports FEATURES_VERSION; rejection case is `FEATURES_VERSION - 1`),
  `bundleFile.selfcheck.mjs` (imports FEATURES_VERSION).
- Repo-wide grep for `scaleMid` / `FEATURES_VERSION===3` /
  `featuresVersion: 3` across `app/src` + `app/scripts`: nothing else.
  One docs hit — `docs/research/look-explorer-spec-2026-10-13.md`
  names FEATURES_VERSION 3 as of its writing (Oct 13); it's a dated
  research record, not a pin, left untouched.
- Miner + prospecting suites: no exact distance/spread numbers are
  pinned (miner asserts determinism + finalists-spread > tray-spread,
  both relative), so nothing there needed re-deriving; both pass
  against v4 unchanged.

## The census corpus pin — an honest gap in the brief, and what stands in

The brief expected a scale-histogram corpus pin in `census.selfcheck`
or the explorer census suite. **On main there is none**: no census
suite imports recipeFeatures at all — the histogram E4/E5 reported
lived in their staging measurements over miner-run candidate corpora,
never as a code pin. So there was nothing to re-derive in place.
What stands in: (a) the before/after corpus table above, measured
with the miner's own sampler on both trees; (b) the ladder-corpus pin
in `recipeFeatures.selfcheck` (the substrate's own suite, in the
manifest), which fails if the axis ever dies again — under v3 code
the same ladder reads [40, 0, 0, 0, 0].

## Fail-safe sanity (explicit)

Against the branch's `validateTaste`: a v3-stamped artifact is
rejected with exactly `taste was trained on features v3, app has v4 —
retrain on a fresh pool`; a v4-stamped artifact validates. The known,
accepted consequence holds: the current v3 taste export reads as stale
until the next offline MLX training run (#1173), failing safe to the
rules fallback. Script + output in the evidence folder.

## Verification

- Targeted suites on the branch — recipeFeatures, tasteHead,
  queenChannel, bundleFile, miner, prospecting, census, coverage,
  censusReadout: **all green**.
- `npm run build`: **green**.
- Full manifest sweep (405 suites), branch: **403/405**. Failures:
  swarmWasm ("build-wasm: cargo not found on PATH" — signature captured)
  and accum (solo re-run: V8 "JavaScript heap out of memory" abort,
  exit 134 — the known sandbox failure). rollSafety's in-sweep FAIL is
  invalid (its child was killed by an operator error mid-run — mine);
  adjudicated solo: **7 checks passed** (16m37s wall under load, 1m52s
  user time — the documented starvation stretch, not a failure).
- Full manifest sweep, pristine origin/main (kc-1545-base worktree):
  **400/405 raw, 403/405 adjudicated — the identical failure set**
  {swarmWasm, accum}. The three extra raw failures are sandbox
  contention casualties, each proven on solo re-run: kineme OK,
  livingMotion 15 checks passed, and phase6 passes sections A–F in
  milliseconds-to-seconds then hangs in section G, its Playwright
  browser re-test, which cannot launch in this sandbox (the same
  suite passed in-sweep on the branch, where the browser attempt
  failed fast). **The change introduces zero new failures.**
  My sweeps never ran concurrently with each other; other lanes'
  sweeps shared the box at times, which is exactly what the solo
  adjudications above exist to correct for.
- Playwright e2e: not run — the sandbox cannot run the harness
  (localhost blocked / Chromium hangs, established Oct 14); CI on
  Matt's Mac runner is the authoritative e2e measure. This change is
  numerics-only with zero render-path contact.

## Judgment calls (flagged, not buried)

1. **Fix point.** The task preferred normalizing scale to the pair
   where numerics receives the value; done exactly there (one
   conditional in `recipeNumerics`). `PAIR_NUMS.scale` itself is
   untouched — it still receives a plain pair, as rotate/alpha do.
2. **prospecting keeps scale out of `pairRange`.** With the axis alive,
   adding a declared scaleMid range was possible, but the issue scopes
   the bucket-granularity proof to stay ("may stay as belt-and-braces")
   and adding the axis would silently widen every corner's bias box —
   a change to E4's proven machinery, not a re-baseline. Exclusion kept;
   wording updated in both the note and the suite.
3. **queenChannel fixture went dynamic rather than 4.** A hardcoded 4
   would rot identically at the next bump; dynamic matches the repo's
   own fixture pattern and the fixture's intent (a CURRENT artifact).

## Files touched

- `app/src/curator/recipeFeatures.js` (feat)
- `app/src/curator/prospecting.mjs` (feat — comment only)
- `app/src/curator/recipeFeatures.selfcheck.mjs` (test)
- `app/src/curator/queenChannel.selfcheck.mjs` (test)
- `app/src/curator/prospecting.selfcheck.mjs` (test — assertion message only)

## What was NOT done

- No retraining of taste.json (offline MLX lane, #1173) — v3 artifacts
  reading as stale is the accepted consequence, gated fail-safe.
- No change to what scale means: params, ranges, PARAM_SPEC, bucket
  edges, and every other feature axis untouched.
- No prospecting bias-box widening (judgment call 2); no Q1 dice-funnel
  work; no e2e run (sandbox limitation, above).

## How to QA (for the PR body)

- Run `node src/curator/recipeFeatures.selfcheck.mjs` — a mid-scale
  recipe now reads scaleMid 0.5; extremes pin to the ends; the ladder
  histogram shows every band populated.
- Hand the app a v3 taste.json — it must refuse with "retrain on a
  fresh pool" and fall back to rules; a v4 export loads.
- Nothing visual changes: features are bookkeeping. Any Look renders
  byte-identically before and after; what changes is that novelty
  distances (miner, explorer) now carry a live scale axis.

## Addendum — post-staging rebase + two pins CI caught (conveyor fix 0f71a3cd)

While the sweeps above were running, the publish conveyor merged E5
(main a2f7923c), rebased this branch onto it, published the PR, and CI
caught **two more v3-assuming pins that this staging missed** — fixed
in commit 0f71a3cd on top of the staged commits:

1. `app/e2e/taste-experimental.spec.js` — a Playwright taste fixture
   hardcoded `featuresVersion: 3`, re-stamped to 4. My repo sweep
   grepped `app/src` + `app/scripts` and never covered `app/e2e`;
   the sandbox cannot run the e2e harness, so only CI could catch it.
   The report's "nothing else" claim above is scoped accordingly —
   it was true of the trees searched, and incomplete as a repo claim.
2. `app/src/curator/variants.selfcheck.mjs` — E5's suite (absent from
   my 13a7e4ff base; it arrived with the rebase) pinned
   `FEATURES_VERSION === 3` as its "variants add no version of their
   own" doctrine. It now asserts the property instead — candidate
   features carry the current FEATURES_VERSION, whatever it is.

Both fixes follow the patterns this staging used (dynamic read where
the fixture models "current", explicit re-stamp where it models a
dated artifact). The sweeps and corpus numbers in this report were
measured on the pre-rebase staging branch (base 13a7e4ff); the feat
delta is byte-identical after the rebase, and the published PR's CI
is the authority for the rebased tree.
