# STAGING REPORT — #1935: MIX dissolve bounded crawl (DRAGGING)

Branch `fix/1935-drag-bounded-crawl`, local commits only (coordinator publishes).
Contract: issue #1935 body + Matt's two rulings in the comments (2026-11-02) —
the presentation states are **running / HELD / DRAGGING**, and the law is
**bounded crawl**: a dissolve keeps blending on simulation time but must LAND
by a wall-clock ceiling of **1.5× its authored duration**, as a named constant.

## Root cause — verified against the code before building

As filed: `useVoiceMixDriver` computed `t = (loopClock.ms − mix.startedAt) /
mix.durationMs` (loopClock mirrors liveLoop's `loopTimeMs`), and liveLoop
credits `clamp(rawDtMs, 8, 50)` per presented frame — below ~20 fps presented,
sim time crawls vs wall time with no bound. The #806 held-cut covers only a
never-started dissolve on a fully held engine. All confirmed at the lines the
issue names (liveLoop's clamp at the Spine A dt clock; both mix creators —
voiceSlice `loadVoice` and layoutSlice `openParamsMix` — stamp `startedAt:
loopClock.ms` and share the one driver and the one `commitVoiceMix` landing).

## The constraint that shaped the mechanism

`clock.inventory.selfcheck` (#806/#807 law table) lists
`useVoiceMixDriver.js` as a **must-loop performer with ZERO wall-clock reads**
— the blend may not read a wall clock, full stop. So the ceiling is measured
on **presented time**: real time between presented frames, accumulated by the
loop owner that already owns the rAF timestamps. The driver still reads only
loopClock. The law table passes **unamended** (9/9).

## What was built

1. **`app/src/gl/liveLoop.mjs`** — `presentedMs`, loopTimeMs's wall sibling:
   per presented frame it credits `presentedDtMs = min(rawDtMs,
   PRESENTED_FRAME_MAX_MS)` beside the sim credit. `PRESENTED_FRAME_MAX_MS =
   250` (exported, named): deltas at ≥4 fps pass through whole; one stall
   (GC, tab restore) credits at most 250 ms, so an absence cannot masquerade
   as presented time. All three reject paths (cold boot / paused / slowRender
   freeze) roll it back with loopTimeMs — a frame the audience never got
   credits nothing, so HELD and governor-frozen spans never advance it (tick
   also does not accumulate while held: the paused path rolls the credit
   back). Exposed read-only as `getPresentedMs()` beside `getLoopTimeMs()`.
2. **`app/src/gl/loopClock.js`** — the mirror gains `presentedMs` (a true
   zero, not "unknown": readers use differences). **`app/src/App.jsx`**
   mirrors it in the same per-frame effect as `loopClock.ms`.
3. **Mix records** — both creators stamp `presentedAt: loopClock.presentedMs`
   beside `startedAt`; `resumeVoiceMix` re-anchors it in lockstep
   (`presentedMs − t·durationMs`), so a resumed mix gets a fresh ceiling
   budget from the resume point. Voice shape doc updated.
4. **`app/src/hooks/useVoiceMixDriver.js`** — the ceiling, in the module
   that owns the driver:
   - **`MIX_WALL_CEILING_FACTOR = 1.5`** (exported, named), ruling cited in
     its comment.
   - `mixCeilingHit(mix, presentedMs)` — pure predicate: presented age ≥
     durationMs × factor. Unstamped mix or unobserved clock: never hits.
   - In the tick, after the natural t≥1 commit and before advancing: if
     `s.running && mixCeilingHit(mix, loopClock.presentedMs)` →
     `commitVoiceMix()`. The landing is the **identical** commit path as
     t=1 — final state applied in one undo step, voiceMix settled to null —
     never a partial snap. The `running` gate states the freeze-holds law
     explicitly: while HELD the ceiling cannot land a dissolve (presentedMs
     is frozen then anyway — defence in depth).

## State vocabulary (spec point 2) — finding, no surface invented

No user- or telemetry-facing surface names the presentation triad today:
`running` is a store boolean, fps is a number, MixBar names no state, and
TapeCounter's labels (PERF PAUSED / RENDER FAULT / LOAD SHED) are the
governor's legislated fault vocabulary ("the honest semantics of the old
pills are kept, not softened") — renaming them would be scope creep into
the governor's law. Per the brief, nothing was invented: the terms
running / HELD / DRAGGING enter the codebase where this fix legislates
behaviour — the comments on the ceiling constant, the presentedMs
declarations, and this report.

## Healthy-case behaviour proof

The blend is untouched on a healthy engine: the driver's t formula line is
byte-identical to origin/main (0 removed lines in the diff), the sim credit
clamp is untouched, and the new suite pins t at frames 10/20/39 of a 2 s
blend (0.25 / 0.5 / 0.975) with `mixCeilingHit` false on every frame and
the landing arriving as `commit-complete` at exactly the authored duration.
At ≥20 fps presented, sim age ≈ presented age, so the ceiling (1.5×) is
structurally unreachable before completion.

## Verification (all by file, from `app/`)

- **New suite** `src/hooks/useVoiceMixDriver.selfcheck.mjs` (+ manifest
  line): predicate boundary (hit at exactly 1.5×, miss at −1 ms; 4 s blend
  → 6 s ceiling; unstamped/NaN/rolled-back clocks never hit); the drive
  through the real store in the hook's decision order — healthy (above),
  crawl (5 fps presented, 50 ms sim credit: a 2 s blend lands at presented
  age exactly 3000 ms via `commit-ceiling`, blend still at t=0.35, full
  target state applied), held (started dissolve frozen across 200 held
  observations; ceiling branch unreachable while `running` is false even
  with presentedMs artificially ahead; lands on resume); resume re-anchor;
  source pins binding hook + liveLoop + loopClock to the driven shapes;
  and an assertion that the driver source contains no wall-clock API call.
- **Touched-module suites:** every suite importing the changed modules
  (66 files) plus the mix/voice suites by name — 73 pass; the one failure,
  `clock.freeze`, was a source-shape pin on the slowRender rollback block
  (see re-pin below) and passes after it. Every suite that reads the
  changed files as text (80 files, incl. `clock.inventory` 9/9 and
  `clock.freeze` 6/6 post-re-pin) — **80/80 pass**.
- **The one re-pin, with cause:** `clock.freeze.selfcheck` — its regex
  pinned the exact slowRender block `{ loopTimeMs -= clampedDtMs; }`. The
  block now also rolls back `presentedMs` (the #1935 sibling discipline:
  frozen frames credit no presented time). The pin was extended to expect
  both lines, with the cause in the assertion message. Exact replacement,
  no weakening — the extended pin is stricter than the old one.
- `npm run format:check` clean; `npm run lint` 0 errors (11 warnings, the
  pre-existing exhaustive-deps pattern — total unchanged); `npm run build` ✓.
- Full 571-suite sweep NOT run (coordinator runs it at publish).
- `app/package-lock.json` churn from the verification `npm install` was
  reverted; it is not part of this change.

## e2e — `e2e/voice-personas.spec.js`, spec untouched

The spec was NOT edited: no budget relaxed, no assertion changed. The fix
is entirely in engine behaviour, as the brief required.

- **Standalone** (`--workers=1`, sandbox, with suite loops running
  concurrently): **6/6 pass**. MIX rides: Night Migration 16.8 s test,
  stub-tile ride 16.7 s test (durations include per-test boot ≈ 9.5 s).
  A second standalone run on a quieter machine profile: 6/6, rides at
  9.8 s / 14.9 s.
- **Under parallel load** — the FULL `--project=app` run (the environment
  that reproduced the failure class pre-fix): **voice-personas 6/6 pass**,
  Night Migration ride **11.3 s**, **stub-tile ride (#517) 20.7 s** — the
  test that was red on main twice and failed the coordinator's pre-fix
  parallel run now passes in the same run where 17 unrelated timing-class
  tests still failed (topbar-expand ×8, poisoned-project ×2,
  autosave-quarantine ×2, asset-inspector, cache-verify, fx-row,
  grain-render, pattern-track; run totals
  82 passed / 17 failed / 1 skipped, 18.6 min). That failure count matches
  the pre-fix sandbox corroboration in the issue comments (81 passed /
  14 failed, same class, same sandbox) — the sandbox starvation class is
  unchanged; the MIX test is what flipped. CI on the Mac runner remains
  the authoritative parallel environment.

## Not built / not touched

- No e2e spec changes; no sim-clamp changes (Spine A's [8, 50] credit is
  deliberate and stays); no governor/TapeCounter vocabulary changes; the
  #806 held-cut (20 rAF ticks, never-started) is byte-untouched.
- `presentedMs` has exactly one consumer (the MIX ceiling). The DRAGGING
  measure it makes available (presentedMs − loopClock.ms divergence) is
  recorded here as available for a future readout; no readout was built.
