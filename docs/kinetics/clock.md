# CLOCK — design brief (Kinetics deep pass)

Owner system: **CLOCK** = every time source and every gate that freezes/advances time.
Umbrella: `docs/KINETICS.md:24-33`. Read-only analysis; line refs verified 2026-09-22.
Embargo stands (`docs/EMBARGO.md`) — diagnosis + protection of existing systems only.

## 1. Contract

CLOCK answers "what time is it" for six consumers: LIFE (loopLifeT/breath), DYNAMICS
(dt integration), FIELDS (drift/warp phase), TRACKS (per-frame cadence), TRANSITIONS
(morph/dissolve progress), GOVERNOR (sustain windows). Inputs: `performance.now()`
(rAF tick), `setInterval` (evolve/phrase metro), audio rAF (beat), store flags
(`running`, `slowRender`, `batchPaused`). Outputs: `dtSec`, `loopTimeMs`, `loopLifeT`,
gate booleans, and the wall/loop anchors each transition reads.

Testable invariants (numbered):

- **C1 dt clamp** — `dtSec ∈ [0.008, 0.05]`, derived per frame from rAF delta
  (`liveLoop.mjs:754-760`). First frame after start/restore samples without a step
  (`:755`); context restore resets `prevTime` (`:153-155`).
- **C2 loopTimeMs monotonic** — never decreases across presented frames; paused and
  cold-boot frames roll back *exactly* the delta they added (`:783-797`, rollback via
  `:762-779`). No caller may feed the resolver a `loopTimeMs` sample lower than the
  last one seen for that layer (this is violated today — §3 F2).
- **C3 gate consistency** — every *automatic* trigger freezes under the same gate set.
  Today's intended set: `slowRender | batchPaused` for auto-triggers (`beatArbiter.js:42`,
  `App.jsx:89`), `!running` freezes everything (rAF chain dies, `liveLoop.mjs:739`).
  METRO phrase is **not** in this set (§3 F3) — invariant stated, currently broken.
- **C4 transition clocks share one base** — itemMorph runs on `loopTimeMs`
  (`liveResolve.mjs:387,399-415`); paletteMix, voiceMix driver, morphEvolve, beatDecay
  run on wall clock (`liveLoop.mjs:478`, `useVoiceMixDriver.js:18`,
  `useMorphEvolve.js:42`, `useBeatDecay.js:18`). C4 says: on any freeze the two bases
  may diverge only in ways §7 Q1 explicitly chooses. Currently unchosen/undefined.
- **C5 freeze matrix is a fact, not an accident** — under cut6 `slowRender`
  (`running=true`): physics/drift/warp freeze (`liveResolve.mjs:143,240,287`) while
  breath LFO, ballistics, loopTimeMs, itemMorph, paletteMix, METRO all keep advancing
  (`liveLoop.mjs:389,401,478`). Under `!running`: everything stops. Each pair must be
  asserted somewhere (none are today).
- **C6 completion edges fire on continuous input** — a transition may only complete on
  a frame whose time sample is `prev + clamped dt`. This is CLOCK's side of **#444**:
  the morph-deletion edge (`liveResolve.mjs:410-411`) is clock-triggered, so a
  discontinuous sample can fire a completion on an unexpected frame.
- **C7 60 Hz golden lock** — at `dtFrames = 1`, `pow(damp, dtFrames) === damp` exactly
  (`particles.js:974-976`), so placement/swarm hashes are unchanged; enforced
  indirectly by `goldenPlacement.selfcheck.mjs:106-107` + `spineC`/`spineE`/`spineF`
  selfchecks. No dedicated "spineA" selfcheck file exists — the lock is implicit.

## 2. Inventory

**Loop clock (spine A/C/E) — `app/src/gl/liveLoop.mjs` (one-writer)**
- dt clamp + accumulation `:749-760`; declarations `:233-234`; restore reset `:153-155`.
- Rollback of `loopTimeMs`/`loopLifeT`/breath/ballistics on reject & pause `:762-797` (#421).
- `loopLifeT` advance `:389`; life LFO (0.55@0.73 + 0.30@1.19 + 0.15@0.29) `:416-429`;
  per-agent phase `:565-581`; ballistics on loop dt `:401` (spec pinned at
  `spineC.selfcheck.mjs:133-136`).
- Spine-E slider springs `1 − e^(−14·λ·dtSec)` `:352-381`.
- **`captureFrame` calls `buildFrame()` with default `loopTimeMs = 0`** `:937` — a hidden
  clock consumer with a fake time source (see F2). It also steps swarm physics one extra
  `dtSec` per capture (`liveResolve.mjs:143-159` runs because capture passes no
  `slowRender`), even while the loop is paused.
- Bake-wait windows: `startStaticBuild` gate `:608-615` (spine B: returns null only when
  `!cells`), retry backoff `:696-713`, `waitForReady` 60 s `:1010-1027`,
  `waitForSettled` 12 s `:1029-1045`.

**Resolver clocks — `app/src/gl/liveResolve.mjs` (one-writer)**
- Life drift `applyLifeDrift(lp, locks, loopTimeMs)` `:50-63`, gate `!slowRender &&
  !batchPaused` `:240` (#425; asserted `liveResolve.selfcheck.mjs:298-318`).
- Warp phase = integral of noiseSpeed over `loopTimeMs` `:287-327` (#432), gated only on
  `!slowRender` `:287` — **not** `batchPaused`; warm-start behavior asserted at
  `liveResolve.selfcheck.mjs:342-355`.
- Item-morph clock `nowMs = input.loopTimeMs` `:387`; plan/start `:391-404`; progress +
  completion `:407-415` (deletes transition when `raw >= 1`). Gates: none — runs under
  cut6 because `loopTimeMs` keeps advancing while physics is frozen.

**Wall-clock transition/decay drivers (React side)**
- paletteMix `now: performance.now()` `liveLoop.mjs:478` → machine `paletteMix.mjs:70-115`
  (arming until `bakeReady` `:92-99`; `t = (now−start)/dur` `:107`).
- Voice-MIX driver `useVoiceMixDriver.js:13-27` (wall, commits at t≥1); param/color
  stepper `voices.js:402-409` `MIX_STEPS_PER_SECOND = 6`, applied `:411-435`.
- morphEvolve `useMorphEvolve.js:41-64` — **its own rAF**, `morphStart =
  performance.now()` set at `davisSlice.js:137,215`; keeps writing `layoutParams` while
  slowRender/watchdog freezes the canvas.
- beatDecay `useBeatDecay.js:6,18` — `DECAY = 0.90` **per rAF frame** (not per ms):
  half-life doubles at 30 fps; own rAF chain, ungated.

**Audio / beat / phrase clocks**
- Analyze loop (own rAF) + wall dt `useAudioInput.js:92-100`; beat = raw-rms spike
  `:106`; follower dt clamp [0,250] `audioBallistics.mjs:85`.
- `onBeat` → arbiter `App.jsx:165-175`; `routeBeat` gates `beatArbiter.js:35-51`
  (phrase-first ordering; selfcheck `beatArbiter.selfcheck.mjs`, incl. both-flag gating
  at `:50-51`).
- Phrase METRO `usePhraseLoop.js:27-34` — `setInterval(60000/bpm)`, deps contain **no**
  `slowRender`/`batchPaused`. Phrase logic `phraseTick.js:3-34` (wrap → `cycle-seed`
  re-rolls `seed` `:16-20`, `step-ca` steps CA `:22-30`; selfcheck `phraseTick.selfcheck.mjs`).

**Evolve timer** — TIME: `App.jsx:82-92` `setInterval`, gated `slowRender|batchPaused`
`:89`. BEAT: via arbiter (`davisSlice.js:92-154` `triggerEvolve`, also steps CA grid for
`mode === 'ca'` `:94-96`). Sources in UI = TIME|BEAT only (`EvolveControls.jsx:118-123`);
`KINETICS.md:31` claims TIME/BEAT/PHRASE — doc drift. CA cadence: event-driven only
(evolve / phrase wrap / manual `layoutSlice.js:263-265`), no per-frame CA clock.

**Governor / watchdog time effects** — sustain windows & cooldowns
`usePerformanceGovernor.js:36-47`; cut6 `setSlowRender(true,'cut6')` `:298`, auto-restore
`:241`; watchdog trip `:150-159` → `tripWatchdog` sets `running:false, evolveMode:false,
slowRender:'watchdog'` `globalSlice.js:279-287`; manual-resume contract
`globalSlice.js:207-220` (+ `liveLoop.mjs:161-170` clears it on context restore).
`frameLock` 30 FPS (`globalSlice.js:144,268`, MasterBar `:105-110`) has **no consumer** —
dead gate (its owner `useCanvasLife` was deleted by #418; `showrunner.selfcheck.mjs:33`
only asserts the key exists).

**Selfchecks covering CLOCK today** — `spineC` (LFO/ballistics), `spineE` (paletteMix
machine), `liveResolve.selfcheck` (#419 `:358-378`, #425 gates `:298-318`, warp warm
start `:342-355`), `itemMorph.selfcheck` (#419 plan-once + t-boundaries `:41-53`),
`beatArbiter`, `phraseTick`, `watchdog`, `goldenPlacement`, `particles`
(`dtFrames`-by-construction). **`qaRegression.selfcheck.mjs` contains zero clock
assertions.** Nothing tests dt-clamp bounds, loopTimeMs monotonicity, the freeze matrix,
or capture-frame time.

**Spec docs** — `docs/ENGINE_PLAN.md` §3 spine A `:82-96`, §6 acceptance `:209-223`
(all code-verified, Matt's feel sign-off pending), §7 file map `:225-243`;
`docs/SPINE_REVIEW_C_F.md` (errata `:10-15`: two GPU suites fail pre-spine-A);
`docs/KINETICS.md:24-33`; `docs/EMBARGO.md`; parked tempo clock `docs/TEMPO_AND_CHIPS.md`.

## 3. Failure modes

| # | Failure | What it looks like on canvas | Detected today? |
|---|---------|------------------------------|------------------|
| F1 | dt clamp widened/removed/NaN | tab-switch or GC stall teleports the flock; flock weight changes with FPS (the original spine-A bug) | NOT DETECTED (golden hashes only run at dt=1; no clamp assertion) |
| F2 | **`captureFrame` feeds `loopTimeMs=0`** into a warm resolver (`liveLoop.mjs:937`) | (a) with `displacement > 0`: `warpPhase.lastMs ← 0` (`liveResolve.mjs:302-304`), next live frame integrates the *whole session elapsed* → **entire warped field snaps in one frame**, once per still/auto-snapshot; (b) captured still renders drift at t=0 and any in-flight morph rewound to t=0 ≠ screen; (c) each capture advances `loopLifeT`/ballistics by a fake 16.7 ms and swarm physics by one extra step (even while paused) | **NOT DETECTED** (no monotonicity test; #425 warp test never moves time backwards) |
| F3 | METRO phrase ungated (`usePhraseLoop.js:27-34`) while TIME-evolve + AUDIO-beats are gated | during cut6/watchdog/batch, `cycle-seed` keeps re-rolling `seed` while the picture is frozen → resume shows a different composition; a batch export can change seed mid-run → inconsistent frames | NOT DETECTED (`beatArbiter.selfcheck` covers only the AUDIO route) |
| F4 | Dual time bases diverge across a pause/resume (C4) | arm a palette/voice/evolve morph, pause (or watchdog), resume: wall-clock transitions completed off-screen → **one-frame jump-cut** to the final state; itemMorph (loop base) instead resumes mid-blend → the two land at different times | NOT DETECTED |
| F5 | Gate asymmetry inside the canvas: cut6 freezes physics/drift/warp but not breath LFO, ballistics, itemMorph (C5) | during a perf freeze the swarm is a statue while the frame still breathes, audio still pulses, and a chip-morph completes against frozen targets (lands as a pop when physics resumes) | NOT DETECTED (each gate tested in isolation, never as a matrix) |
| F6 | `useBeatDecay` per-frame decay (`useBeatDecay.js:6`) | at 30 fps or under governor load, hit-glow rings ~2× longer than at 60 — feel changes with FPS | NOT DETECTED |
| F7 | `frameLock` dead switch | 30FPS button does nothing (silent UI lie) | NOT DETECTED (key-presence only) |
| F8 | Clock stalls mid-morph while wall transitions keep running | half-tweened items frozen, dissolve completes underneath → pop when time resumes | NOT DETECTED |
| F9 | Background-tab rAF throttle: sim clamps to 50 ms/frame (runs ~20× slower than wall, by design) while `setInterval`s keep firing on the browser's throttled clock | return to tab: composition has re-evolved/re-phrased but the picture barely moved — sim time and wall time disagree | NOT DETECTED (by design for sim; unexamined for triggers) |
| F10 | `raw >= 1` completion fires on a discontinuous sample (C6) — CLOCK's trigger side of **#444** | transition deletes itself on a frame whose inputs jumped; whatever the renderer then presents gets no continuity guarantee | NOT DETECTED (#419 selfcheck asserts `done == raw` only *after* deletion — the #444 gap, mirrored on the time axis) |

## 4. Blast radius

**Downstream (consumes my time)**
- **LIFE** — `loopLifeT`/breath (`liveLoop:389,416-429`) + ballistics dt (`:401`).
  Symptom on misbehavior: breath frozen while drift advances (F5), or ballistics
  integrating a fake dt per capture (F2c) → scale/alpha pulses that never happened.
- **DYNAMICS** — `particles.js` `dtFrames` integration + heading spring
  (`:974-992,1008`). Symptom: flock speed/turn changes when FPS moves (spine A's whole
  point); a bad clamp = one giant physics step.
- **FIELDS** — drift phase (`liveResolve:50-63`) + warp integral (`:302-304`) + shared
  noise `nt`. Symptom: whole-field position snap (F2a) — reads as a glitch frame, and
  drift phase non-monotonic = params jump backwards.
- **TRACKS** — FEED delay is one `pushSource` per resolve (`liveResolve:380`), MOD reads
  `motionMetrics` of the previous frame. Symptom: a clock jump looks like extreme motion
  → MOD glow/fade knobs spike for a frame; frame-rate-dependent FEED delay time.
- **TRANSITIONS** — itemMorph progress (`liveResolve:407-415`) is *directly* the #444
  completion edge: if the clock stalls mid-morph, paletteMix (wall) completes first and
  the blend lands later as a pop; if time jumps, completion fires early/late on a frame
  the renderer never re-orders (`renderer.mjs:254,267-268` packs in array order).
  Symptom: z-fight/pop exactly at chip-change landing.
- **GOVERNOR** — sustain windows use `Date.now()` (`usePerformanceGovernor:145,158,197,258`)
  — a *third* time base; watch Windows for context-loss gaps (already special-cased `:133`).

**Upstream (I consume)**
- **rAF** — background throttle/tab-switch → large raw delta (handled by C1) but also
  silently stops all loop clocks while `setInterval` keeps running (F9).
- **`performance.now()`** — monotonic; its failure (non-finite) would propagate into
  clamp → `dtSec` NaN; no finite-check exists (would paint via `flagPass` nan view only
  after it corrupted positions).
- **AudioContext/rAF** (`useAudioInput:92-109`) — suspend kills the analyze loop:
  `beatPulse` freezes at last value, `prevRmsRef` goes stale → on resume one false
  beat-spike or a missed attack; follower dt handles the gap via the 250 ms clamp.
- **`setInterval`** — evolve TIME + METRO: browser-clamped in background (fires late,
  still fires) → F9 re-seeding.

**Peers**
- GOVERNOR ↔ CLOCK: gates are written by the governor (`slowRender`), consumed by the
  resolver — the seam is unasserted (F5). TRANSITIONS ↔ CLOCK: wall-vs-loop base (F4).
  LIFE/FIELDS ↔ CLOCK: same `loopTimeMs`, different gates (drift honors `batchPaused`,
  warp doesn't — `liveResolve:240` vs `:287`). Renderer/composite: CLOCK fires the
  completion edge, renderer never re-sorts — joint contract, currently half-missing.
- **One-writer flags:** `app/src/gl/liveLoop.mjs`, `app/src/gl/liveResolve.mjs`,
  `app/src/engine/particles.js` — every guardrail/extraction step below touching these
  needs single-owner staging (AGENTS.md).

## 5. Guardrails

**(G1) dt-clamp + monotonicity core** — *Invariants C1, C2.*
- (a) NEW `app/src/gl/clock.selfcheck.mjs`, run against a pure `createClockStep()`
  extracted from the tick (step X2): clamp bounds [8,50] exact, first-frame no-step,
  pause/resume delta ≤ 50 ms, rollback equality (reject frame leaves `loopTimeMs` and
  `loopLifeT` bit-identical). Cheap.
- (b) RUNTIME: per-frame sanity in `tick` (`liveLoop` is one-writer): non-finite or
  `loopTimeMs < prevLoopTime` outside a rollback → count 3 consecutive →
  `renderFault.noteExternalFault('clock: …')` (existing pattern, `liveLoop:708-710`,
  pill via `state/renderFault`); plus `reportStage('clock', clampedFrac·100)` so clamp
  saturation rides the existing 4 Hz `stageTimings` patrol (`useFpsMeter.js:34-43`) into
  the GOV TUNE histogram — no new subsystem, no per-frame store write. Cheap.
- (c) RUNBOOK: *"Canvas picture snaps wholesale one frame after pressing SNAPSHOT →
  check `clock:` fault reason / clamp-saturation in GOV TUNE → `warpPhase.lastMs`
  poisoned by a `loopTimeMs=0` capture (liveResolve:302)."*

**(G2) Resolver time monotonicity** — *Invariant C2 at the seam most like #444.*
- (a) EXTEND `app/src/gl/liveResolve.selfcheck.mjs`: warm at `loopTimeMs=1000`, feed
  `0`, then `1016`; assert warped coords/morph progress never jump (currently fails →
  lands with the F2 fix; the test is the guardrail either way). Cheap.
- (b) RUNTIME: same store flag as G1b (single `clock:` reason string) — no second hook.
- (c) RUNBOOK: *"Still/export visibly different from the live canvas (or field snaps
  after auto-snapshot) → run G2 test → captureFrame time source (`liveLoop:937`)."*

**(G3) Freeze matrix table** — *Invariant C5.*
- (a) NEW `app/src/state/gateMatrix.selfcheck.mjs`: rows = {`running`,`slowRender`,
  `batchPaused`,`frameLock`}, cols = {evolve-TIME, evolve-BEAT, phrase-AUDIO,
  phrase-METRO, drift, physics, warp, itemMorph, paletteMix, voiceMix, morphEvolve,
  beatDecay}; assert advance/freeze from the real modules (`routeBeat`, `tickPhraseBeat`,
  resolver gates; pure predicates where hooks can't run in node). Rows for METRO /
  morphEvolve / voiceMix / paletteMix document *today's* behavior until §7 Q2/Q1 decide.
  Medium.
- (b) RUNTIME: none cheap and honest — skip (the matrix is dev-time truth; the pills
  already report *which* freeze is active via `slowRenderSource`).
- (c) RUNBOOK: *"Frozen on PERF PAUSED but seeds still re-roll / morphs still finish →
  G3 matrix row 'phrase-METRO under slowRender' → `usePhraseLoop` deps."*

**(G4) Transition time-base continuity (pause/resume)** — *Invariant C4, F4/F8.*
- (a) EXTEND `app/src/gl/paletteMix.selfcheck.mjs` (or `spineE.selfcheck`): drive
  `now` across a simulated pause gap while the loop is frozen; assert the dissolve does
  not jump to `done` on the resume frame (fails today — behavior change gated on Q1).
  Cheap once Q1 is answered; skip otherwise.
- (b) RUNTIME: reuse governor event log **only if** Q5 approves extending
  `LOG_SCHEMA`/`CUT_KINDS` with a `'clock'` record (`governorEventLog.mjs:20,30-42`
  currently throws on unknown kinds — schema extension, not a new subsystem); otherwise
  fold the discontinuity detail into the G1 `clock:` fault reason. Medium.
- (c) RUNBOOK: *"After RESUME from watchdog, every animation snaps to its end state →
  wall-clock transitions completed while frozen → G4/Q1 pause semantics."*

**(G5) Completion-edge continuity (CLOCK side of #444)** — *Invariant C6.*
- (a) EXTEND `app/src/gl/liveResolve.selfcheck.mjs` #419 block (`:358-378`): drive the
  morph at irregular but *monotonic* clamped dts and assert (i) the transition deletes
  only when `nowMs − startMs ≥ dur·1000`, (ii) the last blend frame and the first raw
  frame are produced from the *same* continuous sample (feed a backwards jump at the
  boundary → completion must not fire). Cheap.
- (b) RUNTIME: covered by G1b's `clock:` reason (a discontinuity on the completion frame
  is the same fault class). Cheap.
- (c) RUNBOOK: *"Pop/z-fight exactly at a chip-change landing + clock fault reason lit →
  the completion fired on a discontinuous frame → check capture/pause paths before
  blaming the TRANSITIONS order bug (#444)."*

**#444 verdict for CLOCK:** the #444 class guardrail — *assert the boundary frame's
contract before the state flips* — maps to CLOCK as **C2/C6: assert time-sample
continuity and completion-edge continuity, not post-hoc equality**. #419's selfcheck
compares `done == raw` only *after* deletion; G5 asserts the boundary itself. G2 would
have caught F2 (CLOCK's live, shipping instance of this class — a real one-frame field
snap), and G5 removes "timer fires on a jumped frame" as a trigger for any landing-frame
surprise. What CLOCK cannot catch alone: the *order* flip at completion stays
TRANSITIONS/renderer (`packInstanceData` array order, `renderer.mjs:254`) — CLOCK's job
is guaranteeing that edge is reached only on a continuous frame.

## 6. Extraction plan (toward `docs/KINETICS.md:127-130` pipeline)

Every step: `npm run selfcheck` green; golden hashes / SNAP hex baker / stills
byte-stability unchanged unless explicitly flagged; one PR; **[1W] = touches a
one-writer file — single-owner staging**.

1. **Land this brief + Q1–Q5 answers** (docs-only; no code).
2. **[1W liveLoop]** Fix `captureFrame` time source (pass the loop's real
   `loopTimeMs`/`prevTime`; never default to 0) + G2 monotonicity test. *Live-only
   pixels change* (captured stills start matching the screen; warp stops snapping);
   offline golden/SNAP paths untouched — verify `goldenPlacement`, `exportStill`,
   `parity` selfchecks.
3. **[1W liveLoop]** Extract pure `createClockStep()` (clamp, accumulate, rollback
   snapshot) to `app/src/gl/clock.mjs`; new G1 selfcheck. Byte-identical behavior.
4. **[1W liveLoop]** Q1 pause semantics: if approved, feed `loopTimeMs` (not
   `performance.now()`) to `paletteMix.update` / voiceMix driver anchors — behavior
   change, its own PR, G4 test green.
5. **[1W liveResolve]** Extract `applyLifeDrift` + warp-phase accumulator → LIFE/FIELDS
   module (per KINETICS target `LIFE.ambient` / `FIELDS.worldNoise` reads). Parity:
   #425/#432 tests byte-identical; resolver keeps only `read CLOCK` + call.
6. **[1W liveResolve]** Extract the morph block (`:383-418`) → TRANSITIONS module
   (loopTimeMs in, ordered items out) with G5 boundary test. Does **not** fix #444's
   order bug — that's TRANSITIONS' ticket — but isolates the clock edge.
7. **Gate consolidation (Q2):** one `autoTriggerGate(state)` shared by evolve-TIME,
   beatArbiter, and phrase-METRO (adds `slowRender|batchPaused` to METRO); state files,
   not one-writer, but do not bundle with 5/6.
8. **Docs:** update `docs/KINETICS.md` CLOCK section + `ENGINE_PLAN §7` file map; no
   §6 boxes ticked (no spine letter). Sequence: 1 → 2 → 3 → 4 ∥ 7 → 5 → 6 → 8.

## 7. Open questions for Matt

1. **Pause semantics for wall-clock transitions.** Choice: (a) everything freezes with
   the picture — transitions ride `loopTimeMs`, resume continues mid-blend; (b) keep
   wall time — armed dissolves/morphs complete off-screen and resume snaps to end.
   **Recommend (a):** "pause = frozen picture" stops lying, and it kills F4/F8 outright.
2. **Gate matrix: does METRO phrase (and morphEvolve/voiceMix drivers) honor
   `slowRender|batchPaused` like TIME-evolve and AUDIO-beats?** Options: (a) yes, all
   auto-triggers share one gate (batch exports become seed-stable); (b) METRO is a
   "clock" and must keep time even while frozen. **Recommend (a)** for batch honesty;
   (b) only if you want a frozen set to keep phrasing.
3. **`frameLock` 30FPS switch:** (a) re-wire it to gate life/breath at 30 Hz (its
   stated intent, `globalSlice.js:138-144`), (b) remove the button as dead UI,
   (c) leave it. **Recommend (b) now, (a) post-embargo** — a control that does nothing
   is worse than no control.
4. **Capture/still time source:** (a) capture the live moment (fix F2 — stills match
   screen, warp stops snapping), (b) keep `t=0` for reproducible stills. **Recommend
   (a)** — SNAP/studio determinism lives in the offline baker, not in
   `captureFrame`; WYSIWYG is the contract.
5. **Where does a clock fault report?** (a) `renderFault` pill only (visible, cheap),
   (b) pill + extend `governorEventLog` schema with a `'clock'` record (post-set review
   artifact), (c) console only. **Recommend (b)** if you review logs after sets, else (a).
