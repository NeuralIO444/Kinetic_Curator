# STAGING REPORT — #1469 STIMULI read-only MOTION readout (expanded spec)

Branch `ember/1469-motion-readout` on main `fd58ba5c`. Local commits only — no push, no PR.
Contract read in full: issue body + the 2026-10-13 expanded-spec comment (governs) + the later
comment noting PR #1485's partial build. This build implements the expanded spec's three pieces.

## What was built

- **`app/src/hooks/motionMeterTap.js`** (new) — mirrors `hooks/audioMeterTap.js` exactly: a
  module-level holder, `setMotionMeterTap` / `getMotionMeterTap`, and `readMotionLevels()`
  returning `{ drift, breath, wind, rhythmPhase, rhythmType, wobble, mothBeat | null }`, or
  `null` before the first publish.
- **`app/src/composition/motionLive.js`** (new) — `observeMotion()`, the publisher. App's
  resolve-frame tap (`App.jsx`, the same tap that drives `clockLive`/`audioLive`) calls it once
  per resolved frame. It reads the resolver's exposed latest frame read and republishes it to
  the tap. It computes nothing the engine has not already computed (the new selfcheck asserts
  the file never calls `patternAmounts`/`livingMotion`).
- **Resolver exposure** (`app/src/gl/liveResolve.mjs`) — a module-level holder in the
  dish-density pattern: `getLastFrameMotion()` returns the latest completed resolve's
  `{ kineme, wind, mothBeat }`. The kineme is captured at the exact `buildPlacements` call site
  (hoisted into a local — the identical object the placements consumed), so the read is
  post-pattern, post-beat-drive, post-shed by construction. `app/src/engine/creature.js` —
  the creature builder now records the wing beat it used (`lastWingBeat()`), reset on every
  `append` and set only when moth items were actually appended.
- **`app/src/panels/stimulus/MotionMeter.jsx`** (new) — rendered in `StimulusPanel.jsx`
  directly beside `MeterHero`. Six vertical bars (DRIFT, BREATH, WIND, RHYTHM, WOBBLE, MOTH),
  short names only, no numbers, no units, no tooltips. It polls the tap in its own rAF
  (MeterHero's cadence) and writes bar heights straight to the DOM via refs — no React state,
  no store, no bus. MOTH's column is present in the DOM but `display:none` unless the latest
  read carries a moth value (absent, not zeroed). Styles in `panels.css` (`.stim-motionmeter*`),
  reusing the meter's `.stim-motion-head` / `.stim-motion-label`.

## Where each displayed value actually comes from

| bar | source |
|---|---|
| DRIFT | the frame kineme ctx's `amounts.drift` — `patternAmounts` output for the first layer (stack order) whose living-motion floor is alive |
| BREATH | the same ctx's `amounts.breath` |
| WOBBLE | the same ctx's `amounts.brushWobble` (the #1516 boil channel, assigned beside paletteBreath in `livingMotion`) |
| RHYTHM | the same ctx's `rhythm`: bar = presence (see adaptation 2), `rhythmType` = `'perlin'` (ORGANIC) / `'sine'` (CADENCE) / null |
| WIND | the first resolved layer's `layoutParams.wind` ÷ 3 (the dial span), **0 on a frozen (`slowRender`) frame**. Per the spec's own instruction, verified rather than assumed: the effective scalar *is* the param as resolved this frame — voices, macros and patches all write the param itself, and the behave/particle side applies it with no per-frame modulation on top (the only multiplier is the per-organism profile constant in `particles.js:1070`, a constant, not a frame signal) |
| MOTH | the creature builder's recorded beat: `beat = MOTH.flap · sin(2π · loopTimeMs / MOTH.flapMs)` as computed inside `creatures.append`, normalised to wing openness `(beat / MOTH.flap + 1) / 2`; **null whenever that frame appended no moth** (no formed pins, or pins but nothing appended) |

Post-everything, as the spec demands: a governor freeze (`slowRender`) makes `livingMotion`
return null, so the strip reads flat — the selfcheck proves the frozen frame publishes all
zeros, never a ghost of the previous live frame. The creatures' own `livingMotion` calls
(moth hover, liveResolve's `motionFor` callback) do **not** feed the strip; only the layer
loop's ctx is captured.

## Adaptations from the spec's letter (and why)

1. **The #1485 strip still stands — flagged, not silently resolved.** `MotionStrip.jsx`
   (LIFE/DRIFT/BREATH/PULSE/WIND/RHYTHM/PALETTE, fed by `gl/motionTap` from `liveLoop`) is
   untouched and still rendered lower in the panel, and its selfcheck stays green untouched,
   per my orders. The new MotionMeter takes the slot directly beside the METER, as the brief
   specifies — which means STIMULI currently shows **two** motion readouts that overlap on
   DRIFT/BREATH/WIND/RHYTHM. Retiring or merging the #1485 strip is a product call: the
   issue's second comment explicitly left the as-built strip's fate to Matt ("close it if the
   strip as built is what you wanted"), so I did not delete merged work on my own authority.
   **This is the one open question in the build.**
2. **`rhythmPhase` reads presence, not a phase.** The rhythm layer (#1198) is *static per
   (seed, placement)* by design — the engine computes no temporal rhythm phase to sample
   (the field must survive printing). The honest global read is: 1 when a rhythm pattern is
   shaping placement (at its full authored depth), 0 otherwise — the same semantics #1485's
   rhythm bar already shipped with. `rhythmType` carries the function name. Recorded here
   rather than inventing an oscillation the engine does not have.
3. **First-alive-layer capture.** `livingMotion` is per-layer; the strip is a global read,
   not a per-layer matrix (spec's own out-of-scope line). The resolver therefore exposes the
   first layer in stack order whose floor is alive, and wind from the first resolved layer.
4. **Reduced motion = slow poll.** The strip detects `prefers-reduced-motion` the way the
   loop itself does (`matchMedia`); under it there is no rAF — the bars hold the last read
   values and refresh on a 1 s poll, un-animated. (The values also collapse engine-side,
   as the spec notes.)
5. **Moth beat is the global beat, before grow-in scaling.** Each moth's wings use
   `beat · g` (its grow-in ease); the strip shows the shared wing beat the frame was built
   with, which is the creature system's own headline number.

## Acceptance, walked item by item

- [x] **Six bars beside the METER, short names only** — MotionMeter sits directly after
  `MeterHero` in `StimulusPanel.jsx`; source scan asserts the six labels and no `title=`.
- [~] **Bars track the live frame** — proven at the resolver→tap chain level by the new
  selfcheck: a DRIFT frame publishes its exact amounts (0.5 / 0.3 / wobble 0.4 / wind 0.5),
  ORGANIC switches the rhythm read on, a frozen frame flattens everything. The by-hand
  visual pass (raise drift, watch DRIFT; moths on stage, watch MOTH appear) is the
  localhost review step and has **not** been run — the sandbox cannot boot the app
  (standing limitation); it belongs to the coordinator's review lane.
- [x] **The strip writes nothing** — source scan green: no `emit(`, no store read/write,
  no bus references, no pointer handlers.
- [x] **Reduced motion static; null read flat, never a missing panel** — component logic
  (tap-null → all heights 0, MOTH hidden, panel rendered) + tap-level tests. Visual
  confirmation rides the same localhost step as above.
- [x] **No per-frame React re-render of the panel shell** — rAF + ref writes only; the
  component holds no state at all (scan asserts no `setState`).
- [ ] **Localhost preview handed over** — the coordinator's review-lane step, not run here.

## Suites run (all by my own exit codes)

- **NEW** `hooks/motionMeterTap.selfcheck.mjs` (registered in `app/selfcheck.manifest`):
  **7/7 pass** — null-before-first-publish, round-trip, moth null-vs-value (tap level and
  creature-builder level: beat at flapMs/4 = openness 1, at 0 = 0.5, absent without a
  formed pin), the full resolver→publisher→tap chain, the read-only source scan, wiring scans.
- Neighbours, all green: `gl/motionReadout` 6/6 (the #1485 suite, untouched) ·
  `gl/livingMotion` · `engine/creature` · `gl/resolveTap` · `curator/dishPressure` ·
  `curator/formation` · `composition/audioBus` 3/3 · `composition/clockBus` 6/6 ·
  `gl/liveResolve` · `gl/resolve` · `gl/performanceCreatures` · `gl/liveResolve.determinism`
  (the resolver is still a pure function of its input sequence — the new holder is a
  side read, never an output).
- `npm run build`: **green**.
- ESLint on all touched files: **0 errors**; 3 warnings, all pre-existing `App.jsx`
  `glLoopRef` exhaustive-deps (lines 271/296/396) — none in this build's files or lines.
- The full manifest sweep was **not** run; the suites above cover every touched file's
  neighbourhood. The sandbox's known base-identical non-greens (swarmWasm "cargo not
  found", accum V8 OOM, rollSafety non-completion) were not re-verified against main in
  this build and no claim is made about them.

## Process note

During verification I accidentally ran `git stash` once in this worktree. I popped it
immediately in the same minute: the tree was restored in full (diff stat and a re-run of
the new suite confirmed identical state) and the stash stack was left empty. Recorded
here because the house rule exists and the record should be honest.
