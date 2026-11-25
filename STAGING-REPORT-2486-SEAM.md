# STAGING REPORT — #2486 seam (A8): present-on-change while paused

**Branch:** `feat/2486-paused-present`, stacked LOCALLY on A2's branch
(`feat/2480-freeze-clear-stage`, base b6603522). Local only — not pushed,
no PR. It publishes stacked behind A2's PR when the coordinator's lane
opens.
**Issue:** "Hit recall while the loop is paused does not restore the stage"
**Spec:** STAGING-REPORT-2486.md (kc-2486-build), "Seam spec" incl. the QA
fix-round corrections — followed as written.

## What was built

One file of production code: `app/src/gl/liveLoop.mjs`.

- **`lastPresentedSig`** — the identity of the scene the last presented
  frame was built from, recorded at the tick's present site (every
  present, running or still), beside A2's `accumReseedPending`.
- **The paused branch presents on change.** The Spine-B hold still rolls
  `loopTimeMs` / `presentedMs` and the life clocks back first, exactly as
  before. Then: if the current frame's signature matches the last
  presented one, the tick returns — the hold is byte-for-byte the old
  behaviour. If it differs, the tick falls through and presents exactly
  one held still of the current state, then the hold resumes. The clocks
  stay rolled back (the still is the frame `buildFrame` computed at the
  held clock — a peek, never a physics step; the captureFrame discipline
  is the precedent). `running` / `slowRender` / badges / logs are never
  written by the seam: PERF PAUSED keeps reading paused; only the picture
  changes.
- **No double rollback.** The #823 slowRender clock rollback below sits
  inside an `if (!paused)` wrapper: a paused fall-through already rolled
  both clocks back in the paused branch, and rolling back again would
  walk the clock backwards a second step. Non-paused ticks are untouched.
  The inner block keeps its #823 shape byte-verbatim — `clock.freeze`
  source-pins it (see the sweep section; the first draft of this guard
  changed the pinned condition line and that suite caught it).
- **Morphs stay frozen mid-pose** — the still is whatever pose
  `buildFrame` computes at the held clock; nothing advances it.

## The signature, and why

`sceneSignature(state, frame)` — an array compared element-wise:

- **Store references/scalars** (zustand replaces these wholesale on write,
  never mutates in place, so reference identity is write identity): seed,
  seedOffsets, layoutParams, paletteId, paletteOverrides, userPalettes,
  enabledAssets, layers, activeLayerId, light, world, customAssets,
  regionKinemes, assetKineme, colorMode, quality, perfTier1,
  exposureStops, morphing / morphFrom / morphTo.
- **Voice mix by value** (from / to / t): the mix driver rewrites the mix
  object every rAF even at a held t, so the reference alone would read
  as perpetual change; the values are what the frame renders.
- **Frame facts**: presented size (rw, rh — a resize/DPR change while
  paused re-presents the held scene once at the new size), bgCss,
  transparent, accumOn, accumFrozen, the palette dissolve factor (mix),
  and the atlas generation (atlasKey — when a bake lands mid-hold, the
  new cells are a real change to what the scene draws, so the held scene
  re-presents once with them).
- **Deliberate exclusions**: audio (a motion input the pause holds by its
  own law; its bands rewrite every frame and would still every tick) and
  wall-clock dressing (the weave offset, the glow gesture) — held for the
  same reason. A still is for scene writes, not for the clock.

## ACCUM composition (both sub-cases)

- **Paused, not frozen, ACCUM on** → the fall-through takes the normal
  render + step path once: picture and buffer advance together by the
  same single frame — exactly A2's behaviour for a begin-while-frozen.
- **Paused AND frozen, ACCUM on** → the frozen branch would present the
  buffer's pre-recall texture, which cannot show the recall. The seam
  does not fork A2's law: it sets A2's own `accumReseedPending` flag, the
  frozen branch yields for exactly one render + step frame, the buffer
  seeds with the recalled scene, and the hold resumes. After still +
  resume the buffer is indistinguishable from the no-recall case apart
  from the new scene. (A recall does not itself begin the buffer; the
  flag request is the whole composition.)

## The pin — `pausedRecallPresent.selfcheck` (17 groups)

Registered in `app/selfcheck.manifest` after `accumFreezeClear`. Bridge
level, the accumFreezeClear pattern: the built app boots through the
shipped agent bridge (`window.__KC_UI__`), the app free-runs (no
`__kcStill` — the still path freezes the loop by design), scenes are read
by polling the presented-frame readback (`__kcPresentedGrid`) until it
shows the target scene. Two palettes chosen for coarse-grid legibility
(hydra, dark / transit, light) plus a seed change.

Flow: scene A presented → hit kept via `directors.favorite` → scene B →
watchdog trip (`transport.watchdog-trip`, PERF PAUSED) → unchanged scene
presents nothing → recall via `transport.hit-recall` → a still of the
recalled scene presents while the store still reads paused, stop fields
untouched by the still → bounded (the scene still + at most its atlas
bake, then zero drift across two settle reads) → canvas resize presents
the held scene once at the new size → RUN → the same scene continues →
ACCUM variant: freeze, pause via RUN off (a watchdog trip stands ACCUM
down via perfTier1, so the frozen variant pauses by RUN off — the loop's
gate is `!running` either way) → recall → exactly the reseed behaviour:
the presented frame moves off the stale buffer texture toward the
recalled scene, hold resumes, no drift → no frame errors anywhere.

Two harness facts the suite is built around, both found by measurement:
`paletteMixSeconds` is set to 0 so scene reads are settled scenes, not
mid-dissolve blends (the pin tests the presentation gate, not the
dissolve); and the governor is disarmed (`__KC_GOVERNOR_OFF`) for the
trip section because under it the governor hook's housekeeping clears a
trip's slowRender overlay on a later effect tick — the trip's own write
is pinned synchronously instead, and the still's stop-neutrality is
pinned by before/after comparison.

### Discrimination (pre-fix / post-fix)

- **Post-fix (this branch):** `pausedRecallPresent.selfcheck: ok (17 groups)`.
- **Pre-fix (base b6603522, seam stashed, browser section only — the
  source pins fail on the base by construction):** the trip and hold
  groups pass, the recall lands in the store, and then **no present ever
  arrives** — the run times out at exactly the recall step
  (`waitCount` 60 s timeout). The stale frame survives, as filed.

## Neighbours

- `accumFreezeClear.selfcheck` (A2's pin): **ok (10 groups)** on this
  branch, unchanged. (Two earlier runs failed its post-CLEAR read while
  this branch's suites ran back-to-back under heavy sandbox contention —
  the atlas bake lagged the still counts; run alone it passes, and the
  base passes identically. The seam cannot engage on that suite's flow:
  its loop is running-held, and `frame.paused` is `!running` only.)
- `watchdog` OK · `watchdogLaw` OK · `favorites` OK · `hitsClear` 4 checks
  passed.
- lint: **0 errors** (11 warnings — the standing baseline).
- format:check: **clean**. build: **green**.

## Full manifest sweep

Full manifest on this branch: **827 PASS / 7 FAIL** of 834 lines
(verdict lines counted from the runner output). The 7 failures:

- `swarmWasm` (exit 1), `rollSafety` (exit 1), `accum` (exit 134) — the
  established sandbox-environmental set, A/B-proven identical on
  pristine main in sibling sweeps.
- `accumFreezeClear` and `pausedRecallPresent` — failed only inside the
  sweep, which ran 834 suites back-to-back under memory pressure (the
  sweep shell itself was OOM-killed at the end). Both pass standalone on
  this branch (10 and 17 groups, above).
- `liveLoop.dishFluid` — in-sweep only; standalone it passes on this
  branch (7 groups) and on the base (7 groups). Contention.
- `clock.freeze` — **real, and fixed.** Its #823 test source-pins the
  slowRender rollback block's literal shape; the first draft of the
  no-double-rollback guard changed the pinned condition line. The block
  now sits byte-verbatim inside an `if (!paused)` wrapper (same
  semantics), and the suite passes on this branch (6 pass / 0 fail). The
  pin suite was re-run green after the fix (17 groups), and lint /
  format:check stayed clean.

## Lane note

The seam's only visible change: **while paused, the stage picture updates
to a recalled hit instead of holding a stale frame** — one still per
distinct change, stop untouched. That is a feel-visible outcome, so this
branch rides to the performer's review lane stacked behind A2's PR
(#2480), published by the coordinator when that lane opens. Not pushed,
no PR opened by this builder.
