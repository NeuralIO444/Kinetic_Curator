# ACCUM audit — "doesn't seem to be working" (Matt, live demo, build 43eb699)

**Verdict: AUDIT ONLY — no code change. ACCUM is behaving to spec on current
main (43eb6999, the exact build Matt was running). The prime hypothesis — the
ACCUM FADE value/units being wrong by an order of magnitude — is falsified by
measurement. What Matt saw is a feel/communication trap with a precise
mechanism, named below; any change to it is a design ruling for Matt, not a
bug fix.**

## 1. Reproduction — decay measured through the real engine pieces

Method: headless Chromium driving the real `createLiveRenderer` +
`ensureAccum` + `accumRecipeParams` + `accum.step` (the same calls
`liveLoop.mjs` makes per frame). One bright disc stamped once, then stepped
with empty frames; the held buffer's disc-centre peak read back per step and
the per-step keep fitted. Readback passes through the resolve (ACES), whose
shoulder compresses highlight ratios slightly toward 1 — hence measured
ratios sit a consistent ~+0.02 above the raw keep, in the correct order.

| Case | Specified keep | Measured /step | Peaks (steps 0–11) |
|---|---|---|---|
| ACCUM FADE 12 (Matt's value) | 0.5^(1/12) = 0.9439 | 0.959 | 142, 138, 135, 131, 127, 123, 119, 115, 111, 107, 104, 100 |
| ACCUM FADE 5.4 (shipped default) | 0.8795 | 0.908 | 140, 132, 123, 114, 106, 97, 89, 81, 73, 65, 58, 52 |
| ACCUM FADE 34 | 0.9798 | 0.989 | 143, 142, 141, 139, 138, 137, 135, 134, 133, 131, 130, 129 |
| **Matt's exact state: LEAVE, trail fade 0.05, echoes 2, ACCUM FADE 12** | **0.95 (1 − leaveFade)** | **0.965** | 142, 141, 138, 134, 131, 127, 124, 120, 117, 113, 110, 106 |
| LEAVE hold (trail fade 0) | 1.0000 | **1.0000 exactly** | 144 ×12, flat |

The buffer accumulates, holds, and decays per the stated fade in every case.
Nothing is wiped per frame. Visual proof (Matt's exact params, one stamp,
steps 0/5/10/20/40): `~/workspace/kc-accum-shots/decay-matt-leave-strip.png`
— clearly held at step 20 (0.95^20 ≈ 0.36), still readable at step 40.

A live-app A/B (seeded docs, Space to clear the headless PERF PAUSED
watchdog, frames sampled via the canvas's own captureStream) was also run,
but this sandbox starves the loop to ~2 presented fps and the factory show
drives the scene by wall clock, so OFF vs ON scenes track in lockstep and
the probe cannot isolate the trail contribution for this scene class; it is
reported as inconclusive, not as evidence either way. The recipe-level
measurement above is the decisive one, and the repo's own CI e2e
(accum-recording fade differential) covers the full app path.

## 2. The "12.01" readout — in family, different units, by design

- `accumulationFade` is stored in **half-life frames**, not a 0–1 fraction:
  default 5.4, range 1–40 (`layout-modes.js:121,501`), stops
  **[1, 3, 5.4, 20]** with a `halfLife` taper (`layout-modes.js:635`). The
  row's format renders `` `${(round(v*10)/10).toFixed(1)}f` `` → "12.0f";
  its own title reads "Trail persistence in frames of half-life". The
  sibling fades (0.05–0.55) are fractions because they are different kinds
  of quantity (per-mode fade fractions). 12 frames is mid-family; the
  nearest-stop logic correctly lights MID (5.4) with an off-detent dot.
- The value ≈12 was dealt, not dialed: presets carry `accumulationFade: 12`
  (`presets.js`), voices carry 12/14/24. A legacy-keep migration (#274)
  guards the (0,1) space, so an old fraction cannot be misread as frames.
- Conversion verified: `halfLifeToKeep(12) = 0.5^(1/12) = 0.9439` reaches
  the recipe as `keep` (clamp 0–0.99, NaN→0) — measured above.

## 3. Bisection — nothing in the window changed the behaviour

- LEAVE's keep override (`keepFinal = 1 − leaveFade`) originates in
  **1e08e74f "feat(trail): Leave fade is optional (#560)"** — the original
  LEAVE design, long predating the Oct 29 ACCUM shelf. #1800/#1824 only
  added the spectral `keepVec` derivation from the same scalar.
- `halfLifeToKeep` + the frames-half-life param: **85278af5 (#273/#274)**.
- The Strata Q stop table entry (Phase 1, **64b6fdaa / PR #1884**) authored
  the stops in the param's own physical units; the Phase 1 panel diff
  (ValueButton → ModeRow) kept the same editor and taper — verified by
  reading the diff and by `modeStops.selfcheck` (11 checks).
- Since the shelf: only #1878 (ember — adds an age-buffer *read*, no write
  path change) and Phase 4 (#1887, dither) touched `liveLoop.mjs` /
  `renderer.mjs`; `accum.mjs` untouched after the shelf closed.
- Silent-off paths excluded for Matt's session: the governor's tier-1 shed
  kills ACCUM below 16 fps and restores at 20 (`usePerformanceGovernor.js`)
  — his footer read **29.9 fps**; the freeze path presents a frozen buffer
  only when paused/slowRender — his canvas was live. `clearAccum` fires
  only on the explicit CLEAR gesture; `begin()` on enable/size-swap only.

## 4. Why it looked dead — the trap, precisely

1. **In LEAVE mode, ACCUM FADE does nothing — by #560 design.** LEAVE's
   keep is `1 − leaveFade` (TRAIL FADE), full stop. Matt's TRAIL FADE 0.05
   → keep 0.95 → a **~13.5-frame half-life ≈ 0.45 s at his 29.9 fps**.
   Dialing ACCUM FADE (12, or anything) changes nothing on screen in LEAVE.
   The shelf still shows ACCUM FADE as a live control in LEAVE — the
   instrument gives no signal that the knob is disconnected in this mode.
2. **The content hides the wake.** His stage was formed clusters of large,
   slow, flat marks (alpha as low as 40%): a sub-second wake sits *behind*
   the mark that made it. On small fast marks the same keep streaks
   obviously; on this look it reads as "no trails".
3. Echoes (2) do reach the recipe (`echoTaps`, weights 0.5/0.35) in all
   trail modes — no second trap there.

If Matt wants a ruling, the honest options are his: (a) leave as designed
(LEAVE = TRAIL FADE's knob, ACCUM FADE is for accum/ribbon/comet), possibly
with the ACCUM FADE row signalling its LEAVE inertness; (b) make LEAVE take
the longer of the two fades. No code was changed here — both are feel
decisions, and the engine underneath is measurably honest.

## 5. Verification (this tree, 43eb6999, no code changes)

- `src/gl/accum.selfcheck.mjs` — **OK (83 cases)** (needed
  `NODE_OPTIONS=--max-old-space-size=6144` in this sandbox; at the default
  2 GB heap it OOM-crashes after 65 passing checks — environmental,
  box has 7 GB total under multi-agent load; CI is authoritative).
- `accum.seam` pass · `accumGuard` OK · `accumInput` OK (7) ·
  `accumFeed` OK (15) · `modeStops` 11 checks passed.
- `npm run build` OK (the preview build these measurements ran against).
- One unrelated local failure: `e2e/accum-recording.spec.js` times out
  waiting for `.panel-output` after the tab click in this sandbox (the
  class exists on PipelinePanel; the click-to-visible step stalls under
  sandbox load). Its measurement (WebM fade differential) is the CI
  project's own; nothing in this audit touched e2e. Flagged, not fixed —
  out of scope for an audit-only lane.
- Evidence: `~/workspace/kc-accum-shots/` (decay strip + step frames +
  the live Matt-state scene capture `S2_matt-mid.png`).

## 6. Disposition

No fix committed — per orders, an audit that proves spec behaviour stops
with the measurements. Branch `fix/accum-audit` carries this report only.
Recommend the coordinator surface §4.1 to Matt as the one decision: whether
ACCUM FADE should stay inert under LEAVE.
