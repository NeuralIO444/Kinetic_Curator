# KC-1 Motion Systems Audit — 2026-11-19

**Scope:** every system in Kinetic_Curator that creates animation or motion — the loop itself, kinemes, creatures, the dish, the fluid, the poem, the FX, the takes machinery, and the persona-driven movers.
**Method:** read-only code audit. No code was changed, nothing was run on a canvas.
**Audited tree:** fresh detached worktree at current `origin/main`, HEAD **`069f37e972e14a7aedd3335618f374b15974d351`** (the merge of PR #2418). All paths are under `app/src/` unless stated. A prior in-repo audit, `docs/design/motion-map.md` (Motion Core P0, #2110, written against an older head `2a1c7ba`), was used as background and cross-checked; where this report relies on it without re-verification, that is said.

Strata shorthand, per the ruled stack (#2038): **PAT** = patterns/glyphs (pinned bottom, locked) → **CONTENT** = the one content layer → **FX** → **MATH**.

---

## Executive summary

**Count: 52 distinct motion/animation systems** are inventoried below: 44 built and live (some gated or off by default), 3 built but dormant/dead, 2 spec-only and unbuilt (the persona band, scanography), plus the UI-chrome animation layer counted once. In addition, 5 dead/stub code bodies were found riding along (listed in the table, not counted as systems).

**The headline picture is good.** The instrument's motion is unusually disciplined: one rAF loop owns a clamped simulation clock; almost nothing in a render path reads `Date.now()` or `Math.random`; nearly every decision a persona or a field makes is funnelled into *recorded resolver inputs*, which is why takes replay. The 2026-09-30 "never static" law (#721) is genuinely implemented in code, not just asserted — audio is an additive offset that is exactly zero at silence, and an independent "life breath" keeps the stage moving with audio off.

**The problems are concentrated in four places:**

1. **Frame-rate dependence survives in the frame-counted and per-frame systems.** The dish creature's physics, the moth's growth/flourish timing, and the creature "inner life" ticks all count *frames*, not seconds — on a 120 Hz iPad they run at different wall speed than at 60 Hz. Separately, ACCUM's trail decay, the spectrum warp's spin/zoom, and velocity smear are all computed *per frame* rather than *per second*, so the same performance literally looks different at 120 Hz than at 60 Hz. The iPad is the target hardware, and current iPads are 120 Hz machines.
2. **Two rulings are only half-kept in the ferrofluid / Dish Life area.** The ferrofluid's drawn "clump body" — which Matt's 2026-11-16 one-system ruling explicitly rejected ("I don't want those clumps") and the one-force-seam spec ordered retired — is still live in the renderer. And Dish Life is still *drawn* in the live default path (faint "specks"), even though #2152 rules Life is never drawn; the retirement slice for that is unbuilt.
3. **"Dead ground kills" works, but not by the ruled mechanism.** Marks die because the cell under them decays, not because the asset stood on dead ground for a duration. The outcome matches the ruling; the mechanism doesn't, and the current stateless consumer design cannot express a dwell time if Matt ever rules one.
4. **Clock and vocabulary proliferation.** There are at least six distinct time bases (loop seconds, the kineme clock, the driver clock, the musical/beat clock, resolver frame counts, fixed-step accumulators), two different "kineme amount" laws ([0,2] for bones, 0..1 for drivers), two unrelated things called "gait," three things called "Life," two called "weather," and at least four objects called "the dish." Each is locally disciplined; the cost is that a future builder can easily couple to the wrong one. One concrete casualty already exists: `phrase:<id>` motion sources are lawful in the bone grammar and in the spec, but can never resolve at runtime because of a registry ID mismatch — dead code wearing a lawful grammar.

Also confirmed cleanly: **the persona band (P7, #2387) is unbuilt** (every band field in the shipped tuning table is `null` and nothing reads them), and **scanography (#2252) is not built at all** — zero references in code or docs; the nearest built things (ACCUM slit-scan, velocity smear) are different mechanisms with different drivers.

---

## Table of all systems

| # | System | Moves what | Clock / driver | State |
|---|--------|-----------|----------------|-------|
| 1 | Live loop (rAF tick) | Everything — owns frame production | `performance.now()` delta, clamped 8–50 ms | Live |
| 2 | Loop clock + HELD/DRAGGING bounded crawl | Throttles interval consumers | `loopTimeMs` vs `presentedMs` | Live |
| 3 | Watchdog + `slowRender` | Freezes motion (deliberate) | FPS tiers in store slice | Live |
| 4 | Performance governor (Showrunner) | Removes motion in a shed ladder | Measured frame time | Live |
| 5 | Slider springs / layout smoothing | Layout params ease, never snap | Exp-damp per frame in resolver input | Live |
| 6 | Life breath substrate (always-alive LFO) | Whole-stage breath scale/rotation | Loop time, incommensurate sines | Live |
| 7 | Time evolve + morph evolve | Params drift / glide between looks | Loop-time interval accumulator / rAF lerp | Live |
| 8 | Beat & musical clocks + beat arbiter + phrase tick | Morph durations, phrase wraps, persona cadence | Loop time (never wall/audio clock) | Live |
| 9 | BEAT metro pulse | Beat attacks when audio is not the beat | Wall-clock `setInterval` (deliberate) | Live |
| 10 | Motion Core registry | Nothing — the posing contract/vocabulary | Declares 7 time bases, substitutes none | Live (via poseFigure) |
| 11 | GPU kineme library (kinds 1–8) | Marks spin/rock/pulse/blink/bob + break-up kinds | Anchored kineme clock | Live |
| 12 | Kineme stacking | Two library kinemes per mark | Kineme clock | Live |
| 13 | Region kinemes + cell kinemes | Regions inside a mark; the picture inside a mark | Kineme clock | Live |
| 14 | PATTERN-track kinemes | Tiles inside a pattern texture (CPU) | `layer.pattern.t` | Live |
| 15 | Kineme phrases | A mark's kineme changes step-by-step on the bar | Musical clock | Live |
| 16 | Break-up kinemes + break trigger | Scatter / orbit / assemble | Kineme clock; triggers stamped on it | Live |
| 17 | CPU kineme drivers + patterns + rhythm | Marks breathe/drift/pulse; palette sweeps | Driver clock (`driverSec`) + beat envelope | Live |
| 18 | Transport (FLOW / PATH travel) | Marks travel: wander, orbit, spiral, sweep | Fixed-step accumulator | Live, off by default |
| 19 | Figure posing (poseFigure) | Assembled figures' bones honour dealt motion | Kineme clock via contract | Live |
| 20 | Assembled-creature rig (LOIS_GAITS) | WetLab creatures' limb chains | Kineme clock | Live |
| 21 | Moth (pin-formed creature) | Wing beat, hover, posture, growth | Loop clock + driver clock + frame counts | Live |
| 22 | Dish creature (XPBD discs) | A physics creature on a formed pin | Resolver frame counts | Live |
| 23 | Creature ALife (chem / policy / dream) | Inner-life drives of the dish creature | Frame counts (ticks every 12 frames) | Built, gated (`?alife=1`) |
| 24 | Jansen beast (Strandbeest) | Walking linkage animals | Kineme time, analytic crank | Live (as tiles) |
| 25 | GAIT records (kc-gait/1) | Construct tiles pose + break up | Beats (BPM) over driver seconds | Live, constructs only |
| 26 | KINETIC births | Adds creature tiles to the pool (no posing) | None — event-driven | Live |
| 27 | Dish Life culture core | Nothing directly — publishes a field | Pure function, driven to a stamped generation | Live |
| 28 | Dish Life stage modes (field / quiet / visual) | Field: nothing drawn. Quiet: specks. Visual: cells as marks | Loop-clock stamps (4–8 gens/s) | Field+quiet live; visual dormant |
| 29 | Life coupling consumers (scale/breath/pattern/bg) | Marks swell, glyphs breathe, patterns drift, bg shifts | Per-frame pure functions of the field | Live |
| 30 | LIFE fade/die + births (#2152 force) | Marks fade/vanish; copies are born | Per-frame pure functions of the field | Live (dial-gated, default 0) |
| 31 | Ferrofluid kernel + stage | Nothing directly — publishes density | Loop-clock stamp, ~60 grid-steps/s target | Live (chip-gated) |
| 32 | Ferrofluid force consumers (pull/drift/duplicates/births) | Bones bend, marks lean, copies gather | Per-frame over published density | Live |
| 33 | Ferrofluid GPU field-body channel ("clumps") | Pool-vocabulary assets seat where density is high | Vertex shader from density texture | Live — **contradicts the 2026-11-16 ruling** |
| 34 | GPU culture / GPU fluid hosts (K1/K2) | The two dish kernels, on GPU | Same stamps; async readback 1–2 frames late | Built, gated OFF by default |
| 35 | ParticleSystem (swarm + organisms) | Boids/organism particle layers | Frame-delta `dtSec` (clamped) | Live — authoritative swarm |
| 36 | Petri-dish physics suite (contacts/spin/links/…) | Particle bodies collide, stick, spin, trade colour | Particle step | Live |
| 37 | GPU swarm + GPU contacts (K3) | Swarm steering / contact detection on GPU | One GPU substep per JS step | Built, gated OFF by default |
| 38 | Conway CA engine | CA-mode layout grids | Unclocked; stepped by callers/phrase beats | Live, narrow role; blind |
| 39 | Vortex wet field (WET sim) | The "water under the trails" | Fixed dt = 1/60 | Live |
| 40 | Flow field (FLOW curl) + trail grid | Static curl lookup; ACCUM age/energy steering grid | Static / ACCUM step count | Live |
| 41 | Weather (haze-air, motes, ember drive) | Marks fade in mist; motes drift; moths graze trails | Loop time / locked steps | Live |
| 42 | Ground seam + small drivers (surge, parallax drift, nudge, lean, rift) | Marks lean/nudge/shear/drift over the pattern ground | Loop time / locked travel step | Live |
| 43 | FIELD poem formation | Creates the poem's letter stamps (no motion) | None — deal-time, seeded | Live |
| 44 | Poem transitions (layer morph, review morph, poem lean) | Poem glyphs glide between poses | Loop time | Live |
| 45 | RAY GUN treatment | Per-draw destructive type treatment | None — pure seeded transform per draw | Live |
| 46 | Audio ballistics + route matrix | Scale/alpha/breath/glow gestures from audio | GL loop clock, dt-based ballistics | Live |
| 47 | Meter bands + band feed + audio events | Fine band inputs; onset/tempo/silence events | Caller's loop time | Live |
| 48 | Spectral path (spectrum marks + feedback warp) | Marks modulate by spectrum; ACCUM bends | Per-frame, dt-corrected (warp partly per-frame) | Live, dial-gated |
| 49 | FX stratum + MATH stratum | Filter/tone chains over the composite; audio-modulated knobs | No own clock; per-frame modulation inputs | Live |
| 50 | ACCUM (feedback trails) + trail modes + slit-scan | The presented frame ages into trails | One step per presented frame; decay per frame | Live |
| 51 | Velocity smear (+ squash) | Each mark's quad stretches along its motion | Per-frame Δposition | Live |
| 52 | WET consumers (soak, wet look, warm-up) | Strata absorb/smear; frame looks wet; stills rehearse | Pure functions of the served field | Live |
| 53 | WET × dish medium | Contact physics reads the wet field | Dish per-step integrator | Live |
| 54 | Takes (performance file / capture / playback) | Re-presents a whole performance | Frame-indexed recorded inputs | Live |
| 55 | Take side-sections (routes/gestures/spectrum/retro) | Playback hears/freezes/warps as live did | Frame-indexed change lists | Live |
| 56 | GPU sim hosts + `simLaw` stamp (Full WebGL) | Which kernel implementation ran each sim | Per frame; async readback | Live, opt-in per kernel |
| 57 | Queen channel & sway | Capped biases; BPM easing; dial lean in silence | Phrase/bar boundaries, loop-time relax | Live (one stub inert) |
| 58 | LOIS/DAVIS adjustment (Director, trio, review ladder, room codes) | Retunes deals, routes, poems, creatures | Deal commits + phrase boundaries | Live |
| 59 | Persona band (P7 #2387) | Would solo/trade personas on a phrase clock | — | **Spec-only, unbuilt** |
| 60 | Scanography (#2252) | Would smear the frame by stage motion vectors | — | **Spec-only, unbuilt** |
| 61 | UI chrome animation | Panel/CSS motion, creature miniature, palette transitions | CSS keyframes / own rAF / wall timers | Live |

Dead/stub bodies found (not counted): `engine/beastBuilder.js` (pin-hosted beast builder, zero callers), `engine/beastMotion.js` (stub, zero importers), `engine/robot.js` + `engine/lsystem.js` (skeleton libraries, no production caller), `engine/beastTrails.js writeTrail` (placeholder), `curator/queenChannel.js hiddenBias()` (inert stub), `fx/fxTrack.js` family-binding half (dead data), `engine/kineme.js dWobble` (computed, never applied).

---

## A. The loop and its clocks

### 1. Live loop — the frame factory
The one heartbeat: a `requestAnimationFrame` loop that resolves the scene and presents it. Everything else in this report is downstream of it.
- **Files:** `gl/liveLoop.mjs` (2,327 lines; `tick()` ~:1710), `gl/liveResolve.mjs` (the resolver), `gl/renderer.mjs` (the GL presenter).
- **Clock/driver:** `performance.now()` deltas, **clamped to [8, 50] ms** (spine A, #387). The clamp means a stall can never produce one huge physics step — instead, simulation time (`loopTimeMs`) accumulates the clamped delta and falls behind wall time on purpose. A sibling counter, `presentedMs`, accumulates real presented time (per-frame credit capped at 250 ms, #1935). Rejected frames roll both clocks — and the breath springs and ballistics — back exactly (#421/#441), so a paused frame leaves no trace.
- **Moves:** all strata (PAT → CONTENT → FX → MATH, order enforced in `state/layerOrder.js`).
- **Interactions:** reads the whole store each frame; stamps dozens of recorded inputs (governor sheds, dish stamps, gait stamps, room codes) that the resolver consumes — this recorded-input discipline is what makes takes replay (§54).
- **State:** built & live.
- **Risks:** it is a single point of concentration: `liveLoop.mjs` + `liveResolve.mjs` + `renderer.mjs` ≈ 8,500 lines carry nearly every system below.

### 2. Loop clock mirror + HELD / DRAGGING bounded crawl
The honesty machinery for slow machines: when the engine can't present frames as fast as simulation time advances, interval-driven things crawl instead of bursting or lying.
- **Files:** `gl/loopClock.js`, `gl/liveLoop.mjs`, consumers via the mirror in `App.jsx`.
- **Clock/driver:** the gap `presentedMs − loopTimeMs` *is* the DRAGGING measure. `loopIntervalTick` never credits a freeze gap, fires at most once after a thaw (re-anchors), and on a normal fire carries the anchor by exactly one interval (#1741) so tempo-locked clocks hold their rate.
- **Moves:** nothing directly; it throttles evolve, phrase, MIX driver, and the review-morph settle (HELD freezes them where they stand; DRAGGING crawls them under a ceiling stamped in wall ms, #1935).
- **State:** built & live.
- **Risks:** at sustained <20 fps presentation, sim time dilates — motion reads as slow motion rather than dropped frames. That is the ruled behaviour, but on a weak iPad it is the *felt* behaviour.

### 3. Watchdog + `slowRender`
The hard stop. When frames effectively stop, motion freezes deliberately and stays frozen until a human resumes it (Space / RUN) — the dock pill reads PERF PAUSED.
- **Files:** `state/slices/globalSlice.js` (`slowRender`, `slowRenderSource`, `tripWatchdog` ~:830, tier-1 ~:330), `components/TapeCounter.jsx` (the pill), `state/watchdog.selfcheck.mjs`.
- **Clock/driver:** FPS tiers (#107 §4): tier 1 = FPS < 16 sustained 2 s → shed (`slowRender` from the governor); tier 2 = FPS ~0 sustained or a critical fault → `tripWatchdog`, manual resume only. Since #1919 the watchdog arms only once the governor's shed ladder is exhausted — except two hang-class carve-outs (frozen frame, loop-time crawl) that bypass the ladder by design.
- **Moves:** nothing — it *stops* motion, and folds `slowRender` into the resolver input so a frozen frame is also what a take records.
- **State:** built & live.
- **Risks:** none as designed; note the headless-lane quirk from operations (watchdog tripped at boot in headless Chromium hides creatures) is a harness artefact, reproduced on clean main.

### 4. Performance governor (the Showrunner)
The automatic load-shedder: when frame time runs over budget it removes the cheapest motion first, in a fixed order, and restores in reverse when the machine recovers.
- **Files:** `hooks/usePerformanceGovernor.js`, `hooks/governorCuts.js`, `hooks/useFpsMeter.js`, `gl/governorEventLog.mjs`, `gl/costTiers.mjs`, `personas/governor.mjs` (the GOVERNOR persona record is its character sheet, not its code).
- **Clock/driver:** measured frame time only — "no timer with an opinion"; sustain/cooldown windows prevent thrash.
- **Moves:** it animates nothing; it *removes* motion. Ladder: dynamic resolution (1 → 0.75 → 0.5 → 0.33) → spectral warp shed (1.45) → selective ACCUM feed (1.47) → trail steering (1.48) → creature count (1.5) → travel (1.6) → quality tier (2) → mirror/gloss/ACCUM tier-1 (3) → cost-aware asset thinning (4) → count clamp (5) → **cut 6: freeze motion via `slowRender`** → cut 7: watchdog. Every cut is a render-only overlay — never written into layout params, never serialized — and every shed/restore is logged and shown (shed pills, TapeCounter). Sheds ride resolver inputs, so a shed frame replays shed.
- **Interactions:** reads cost tiers that nearly every system self-registers; writes governor state read by the loop, resolver, WET, ACCUM, spectrum.
- **State:** built & live.
- **Risks:** cut 6 is a direct, *ruled* exception to the always-alive law ("a still instrument beats a dead one") — which means "never static" is false exactly on the weakest hardware, i.e. the iPad target, exactly when ACCUM + WET + fullscreen FX stack up (INFERENCE: the most likely path to living permanently in the ladder).

### 5. Slider springs / layout smoothing
The "no popping" law in code: every layout parameter glides to its new value instead of snapping (the Always Alive mandate's standardized ease; the doc's `blendSeconds: 2`).
- **Files:** the smoothed-layout-params cache inside `gl/liveLoop.mjs` / `gl/liveResolve.mjs`; `docs/ALWAYS_ALIVE.md` §1.
- **Clock/driver:** per-frame exponential damping toward the live slider value.
- **Interactions:** known wart, disclosed in-code (#441): while paused, the spring keeps easing on rejected ticks, so a slider dragged during a pause has silently "caught up" by resume — the ease is skipped exactly when the performer can't see it. Triaged real in the code comments; the fix shape (snapshot/restore like ballistics) is described but the comment records it as a disclosed sibling, not yet folded into the rollback set at the lines read.
- **State:** built & live.
- **Risks:** low; a feel bug, not a correctness bug.

### 6. Life breath substrate — the always-alive floor
The motion that remains when every driver drops out: layered slow sines breathe the whole stage's scale and rotation a few percent, forever.
- **Files:** `gl/liveLoop.mjs` (~:594–760, `loopLifeT`, breath springs), `gl/kinemeRateAudio.mjs`, `docs/ALWAYS_ALIVE.md`.
- **Clock/driver:** `loopLifeT += dtSec` per presented frame; breath = `0.55·sin(0.73t) + 0.3·sin(1.19t+1.7) + 0.15·sin(0.29t+4.1)` (incommensurate, so it never visibly loops), critically damped (ω≈8) toward `1 + rawBreath·0.012·lifeDrift` scale and `rawBreath·0.6·lifeDrift` rotation. Per-voice mode configs hardcode the mandate's floors (heavy modes drift ≤0.15 / flow ≤0.2; fluid modes flow ≥0.35).
- **Moves:** whole-stage breath (all strata) — the direct implementation of the 2026-09-30 law (#721) and of `ALWAYS_ALIVE.md` ("nothing on the canvas is ever 100% frozen").
- **Interactions:** audio adds on top and decays away cleanly: `kinemeRateAudio` maps silence/no-route to a multiplier of exactly **1** ("the piece relaxes to the base rate instead of stalling"), clamped [0.1, 4] so audio can never stall the kineme clock at 0. While paused/frozen the published breath reads 0 — "never a ghost of the last live frame."
- **State:** built & live.
- **Risks:** none material.

### 7. Time evolve + morph evolve
Two slow param-drift systems: evolve re-rolls/steps parameters on a cadence; morph glides layout params between two looks.
- **Files:** `App.jsx` (~:497–520, time-evolve rAF), `hooks/useMorphEvolve.js`, `hooks/useBeatDecay.js`.
- **Clock/driver:** evolve fires through `loopIntervalTick` on loop time (holds under `slowRender`/`batchPaused`, #107 §4/§5 — an automatic trigger must not churn params over a frozen frame or a batch export). Morph lerps on the `loopClock` mirror.
- **Moves:** layout params (CONTENT composition), not pixels directly.
- **State:** built & live.
- **Risks:** low.

### 8. Beat & musical clocks, beat arbiter, phrase tick
Tempo as a stage-wide driver, kept rigorously on loop time: "a take replays exactly with or without audio on any machine."
- **Files:** `gl/beatClock.mjs`, `gl/musicalClock.mjs`, `state/beatArbiter.js`, `state/phraseTick.js`, `hooks/usePhraseLoop.js`, `curator/clockRecord.js`.
- **Clock/driver:** the musical clock integrates `pos += dt·bpm/60000`, so tempo changes bend the future and never jump the past; audio may *nudge* the BPM handed in, it never drives the clock. BEAT: 30–300 BPM, default 120 (so the standard morph is 2 beats = 1 s); past ~160 BPM morph durations fall through the 0.75 s glitch ceiling into deliberate hard cuts. The phrase metro/EUCLID clocks read loop time via `loopIntervalTick` and are freeze-gated (#458 — METRO was once the one auto-trigger with no gate; fixed).
- **Moves:** morph durations everywhere (§44), phrase wraps every `phraseLength` beats (cycle-seed / step-CA / hold), the persona cadence (§57–58), and the **metro-breath**: with no audio and no route table, the BEAT's own pulse breathes the stage a little (capped +0.2) — a second, independent implementation of the never-static law for the "artist routed nothing" case.
- **Interactions:** `beatArbiter.routeBeat` is the single ordered entry for a mic attack: PHRASE ticks first, then EVOLVE fires on the post-phrase state — the historical two-writer race on `seed` is designed out.
- **State:** built & live. The best-disciplined clock code in the audit.
- **Risks:** none found.

### 9. BEAT metro pulse
When the performer turns the metro on and audio isn't the beat, a plain timer fires beat attacks through the same arbiter an audio onset uses.
- **Files:** `hooks/useMetroPulse.js`, `gl/beatClock.mjs` (`metroIntervalMs`).
- **Clock/driver:** wall-clock `setInterval` at the dialled BPM — a deliberate exception to the loop-time discipline, because its whole job is to *be* the external tempo reference. Audio on, paused, or switch off: no timer exists at all.
- **State:** built & live.
- **Risks:** wall-clock drift vs the loop-time musical clock is possible in principle; in practice the arbiter quantizes attacks into the loop's order. Flagged for completeness, not as a defect.

### 61. UI chrome animation (counted last, listed once)
Panel and widget motion that isn't the stage: CSS keyframe pulses/breathes/spins in `styles/*.css` (evolve-pulse, chapter-card-breathe, beat-flash, sway-breathe, stim-shimmer, kc-spin-glyph, lois-ticker), the `CreatureMiniature` component's own rAF loop, `PaletteStrip`'s rAF transition, and readout refresh timers (`setInterval` at 250–1000 ms in readouts/panels). All decoration/readout; none feeds the resolver; several CSS animations disable under `prefers-reduced-motion`-style rules in the same files. No audit concerns beyond noting they exist and are *not* part of the take/determinism contract.

---

## B. Motion Core, kinemes, figures, creatures, beasts, gait

### 10. Motion Core registry — the posing contract
One frozen vocabulary that every motion source registers under, with an anchor law (evaluate at t=0 ≡ rest) and a hard rule that time bases are never substituted for one another.
- **Files:** `engine/motionCore/index.js`, `kinemeSources.js`, `rigSources.js`, `breakTrigger.js`.
- **Clock/driver:** none of its own — it *declares* seven time bases (`seconds, kineme, driver, frames, travel, boil, bars`) and `timeFor()` throws rather than substitute one for another.
- **Moves:** nothing directly; it is the contract consumed by figure posing (§19).
- **Interactions:** exactly one production importer: `gl/sceneContract.js` imports `poseFigure` and side-effect-imports `kinemeSources.js` for registration.
- **State:** built & live, narrowly.
- **Risks:** registration by side-effect import is fragile — if that import disappears, `getMotionSource` silently returns undefined and bones fall back to native pose (fail-quiet). The headers of `index.js` and `kinemeSources.js` still say "NOTHING CALLS THIS YET" — **stale** since P7 step 3.3 wired it; a future agent could delete live code on the header's word.

### 11. GPU kineme library — the primary mark motion
Per-instance looping motion evaluated in the vertex shader: spin, rock/osc, pulse, blink, bob (kinds 1–5) plus the three break-up kinds (§16). This is the main way ordinary marks move.
- **Files:** `data/kinemes.js` (library, `createKinemeClock`, `kinemePhase`), `gl/shaders.mjs` QUAD_VS (`u_kineme[16]` tables), `gl/sceneContract.js` (kineme fields), CPU mirror in `engine/motionCore/kinemeSources.js`.
- **Clock/driver:** the **anchored kineme clock** — loop seconds at rate `kinemeRate` × the audio rate route (`gl/kinemeRateAudio.mjs`, clamped [0.1, 4], silence → 1). The clock re-anchors on rate change so tempo changes never jump the phase. Phase per instance = seed hash (`kinemePhase(seedOffset, key)`), so copies never move in lockstep (the Always Alive per-node-uniqueness rule).
- **Moves:** CONTENT marks (rot/scale/alpha/y). Region and cell kinemes (§13) ride the same 16-slot table.
- **Interactions:** governor-aware only via the slot cap; creature *parts* receive kinemes downstream because expansion turns them into ordinary instances first. Otherwise blind to poem/creatures/dish — by design, it is a per-mark vocabulary.
- **State:** built & live. Default assignments are sparse (six `mic_*` ornaments); the rest need a per-asset assignment.
- **Risks:** the **16-slot table is a hard ceiling** shared by instance + region + phrase slots — over budget, a mark's kineme is silently skipped (regions fall to slot 0/rest). The GLSL math has **no CPU reference** except the hand-transcribed `kinemeSources.js` mirror and the separate PATTERN-track implementation (§14) with its own amplitudes — three implementations of one vocabulary, held together by selfchecks. Phase at t=0 is non-rest by design (phased copies start mid-cycle) — a documented exception to the anchor law.

### 12. Kineme stacking
A mark plays exactly two library kinemes at once, composed as the shader composes them.
- **Files:** `data/kinemes.js` (`KINEME_STACKS`), `gl/shaders.mjs` (`u_kinemeB` branch), `engine/motionCore/kinemeSources.js` (`stackPose`, one shared phase).
- **Clock/driver:** kineme clock. **Moves:** CONTENT instances; one table slot per stack. **State:** built & live (its spec doc still says "Status: spec" — stale).
- **Risks:** CPU `composePose` multiplies scales in the opposite order to the shader — a documented one-ulp divergence, bounded by selfcheck only.

### 13. Region kinemes + cell kinemes
Region kinemes animate tagged regions *inside* a mark (e.g. one petal rocks); cell kinemes play UV strips so the picture inside a mark moves.
- **Files:** `data/regionKinemes.js` (cap 12), `data/cellKinemes.js` (6 strips), applied at pack time in `gl/renderer.mjs`, slots in `gl/sceneContract.js`.
- **Clock/driver:** kineme clock. **Moves:** CONTENT, inside marks. Budgets: 12 desktop / 8 iPad-class for regions; shed ladder freezes at tier 1, collapses at tier 2.
- **State:** built & live where an asset carries an assignment.
- **Risks:** shares the 16-slot contention of §11.

### 14. PATTERN-track kinemes
The same five library kinds, re-implemented on the CPU to animate tiles inside a pattern texture.
- **Files:** `pattern/elements.js`.
- **Clock/driver:** `layer.pattern.t` (origin of that value not traced in either audit). **Moves:** PAT stratum tiles, via CPU raster in `gl/renderer.mjs`.
- **State:** built & live.
- **Risks:** a second, independent implementation of the kineme vocabulary with its own amplitudes (e.g. `BOB_TILES`) — not a mirror of the shader. Duplication, knowingly carried.

### 15. Kineme phrases — motion sequenced on the bar
A mark's kineme changes step by step on the musical bar (e.g. *lookout*: blink 2 bars → spin 2 bars), steps snapped to whole beats, cross-faded over the last beat, marks staggered by seed-hashed bar offsets.
- **Files:** `data/kinemes.js` (`KINEME_PHRASES`), `data/kinemePhrases.js` (`createPhraseClock`, `resolvePhrase`), `gl/sceneContract.js`, `gl/shaders.mjs` (`u_kinemeF` fade branch), CPU reference in `kinemeSources.js`.
- **Clock/driver:** the **musical clock** (§8) — `liveLoop` folds `phraseMusic.advance(loopTimeMs, beatBpm)` and stamps `doc.musical`. A third clock semantic for "kineme" motion, distinct from both the kineme clock and the driver clock.
- **Moves:** CONTENT instances and region marks; a phrase slot is shared by every mark on that phrase.
- **State:** built & live for marks/regions. **Not** live for bones — see §19's dead path.
- **Risks:** slot contention with §11; tempo correctness depends on every consumer going through `timeFor()` discipline — feeding the wrong clock gives visibly wrong tempo, not an error.

### 16. Break-up kinemes + break trigger
Scatter (pieces fly out along their break vector and return each cycle), orbit (marks circle through home), assemble (a triggered one-shot: an audio hit scatters, a downbeat/landing settles everything home).
- **Files:** kinds in `gl/shaders.mjs` + CPU mirrors in `kinemeSources.js`; trigger fold `engine/motionCore/breakTrigger.js`; events `curator/breakLive.js`; stamp in `gl/liveLoop.mjs` (`kinemeBreak`).
- **Clock/driver:** kineme clock for all motion; trigger stamps are taken *on the kineme clock, never wall clock*, so takes replay. An unsettled scatter auto-settles after `BREAK_HOLD_MAX`.
- **Moves:** CONTENT instances/regions carrying a packed break vector.
- **State:** built & live.
- **Risks:** assemble is the only *stateful* kineme (the fold carries seen counters/stamps through snapshot/restore). INFERENCE: all restore paths carry it — verified for the fold's own snapshot API, not for every caller.

### 17. CPU kineme drivers + patterns + rhythm
Scene-level living motion applied to the placement array: marks breathe (scale), drift (wander), pulse (beat thump), wobble brush edges, sweep palette slots. DIRECTOR patterns (DRIFT/SWELL/THUMP/ORGANIC/CADENCE) re-weight the amounts or switch on a static rhythm field.
- **Files:** `engine/kineme.js` (1,705 lines; `KINEME_DRIVERS`, `evaluateKineme`, `applyKinemeDrivers`), consumer `engine/buildPlacements.js`, clock in `gl/liveResolve.mjs`.
- **Clock/driver:** the **driver clock** (`driverSec`) — a *second* anchored clock over the same loop seconds, at `kinemeRate` only. **It does not receive the audio rate route that the kineme clock receives**, so with the `kinemeRate` audio route assigned and non-zero, GPU kinemes and CPU drivers run at different rates (found by the motion-map audit at an older head by reading both call sites; the two-clock structure is unchanged at this HEAD — the divergence itself was not re-run). Boil drivers read `boilSec(driverSec)` snapped to 6–12 fps; THUMP reads the live audio beat envelope and falls back to DRIFT with no audio. The rhythm field (ORGANIC/CADENCE) is deliberately *static* per (seed, placement) — a position field, not time-based, so it survives printing.
- **Moves:** all placed CONTENT marks; also supplies the "living-motion floor" the moth and dish creature stand on. On by default (breath 0.3, drift 0.5, palette-breath 0.12; default pattern DRIFT).
- **Interactions:** unusually aware — reads the DISH LIFE culture as a secondary source (marks near a living colony breathe/fray, #1923), the audio ballistics via THUMP, and the governor shed tiers (tier ≥3 = identity). Amounts are ephemeral, never in the geometry signature.
- **State:** built & live.
- **Risks:** **two "kineme amount" laws coexist** — driver amounts are 0..1 (`num01`, records must declare `amountRange` inside 0..1), bone amounts are [0,2] (§19); nothing states both laws in one place. `dWobble` is computed every frame and **has no stage consumer** ("evaluated, tested, and left unapplied" — admitted in-code), and the live context builds `boilStep: 0` with no setter found, so even the wobble it feeds would hold boil frame 0. Per-frame CPU loops over the full placement array per layer — cost rides on mark count.

### 18. Transport — FLOW / PATH travel
Marks actually travel: FLOW is a per-mark velocity sim wandering in a noise field inside a per-stratum leash; PATH deals orbit/spiral/sweep/lissajous paths, with velocity-stretch deform on travelling marks.
- **Files:** `engine/kineme.js` (`applyTransport`, `createTravelStore`, `selectTravelers`).
- **Clock/driver:** fixed-step accumulator fed by frame ms — frame-rate independent by design. Deliberate asymmetry: the PATH shed freezes its step clock; the FLOW shed keeps stepping and settles.
- **Moves:** CONTENT marks. Governor-aware (travel shed stamped on input); device-class traveler budget (desktop cap 800 marks, reduced on iPad class); artist-pinned marks never step.
- **State:** built, wired, **off by default** (`transport: 'still'`).
- **Risks:** the per-scene store is keyed by instance index — index identity across placement rebuilds is assumed by in-code reasoning, not proven. On iPad the traveler cap means large scenes silently travel fewer marks.

### 19. Figure posing — poseFigure (Motion Core P7)
Poses an assembled figure's bones honouring each bone's baked `motion` — a dealt or recorded kineme/linkage/gait source × amount — composing parent ∘ source locally.
- **Files:** `engine/motionCore/rigSources.js` (`poseTreeFigure`, `poseLinkageFigure`, `poseMobileFigure`, `poseFigure`), door in `engine/creatureRig.js` (`sanitizeBoneMotion`).
- **Clock/driver:** `t` = the contract's `kinemeTime` (kineme clock); sources declare time base `kineme`/`bars`.
- **Moves:** creature/beast parts in CONTENT, via expansion into ordinary instances (§20).
- **Interactions:** reads the Motion Core registry, `creatureRig.poseRig`, `beastRig.poseLinkage`, `beastRoam.roamAt`, and the **ferrofluid pull** through a per-bone sampler (§32) — a genuine cross-system awareness channel. Davis's dealt sources (step 3.3) come from the kinemes the stage is already running, per the P7 ruling.
- **Rulings verified:** the **amount clamp [0,2] is enforced twice** — at the door (`creatureRig.js:171`, non-finite drops the entry) and again at pose time (`rigSources.js:153`, non-finite defaults to 1 — note the asymmetry). **Per-part phase is kept**: each bone evaluates with `kinemePhase(seedOffset, tileKey#boneId)`, matching figures-spec §11 ruling 2. Amount 0 / frozen frames strip motion via the shed ladder.
- **State:** built & live — the sole production path is `gl/sceneContract.js` passing `poseFigure` into `expandCreatureInstances`.
- **Risks — the cluster's sharpest finding:** **`phrase:<id>` bone sources are lawful but can never resolve.** The grammar accepts `phrase:<id>` and figures-spec §11 ruling 8 makes it lawful "from step 3.1"; but P6 registered phrase sources under a different id, `kineme-phrase:<id>`. `readBoneMotion` looks up `phrase:…`, gets `undefined`, and the bone silently poses natively forever. The figurePose selfcheck still asserts the pre-P6 fail-safe using phrase ids that aren't real phrases, and `sceneContract.js` explicitly excludes phrases from Davis's bone palette. Net: phrase-on-a-bone is dead code wearing a lawful grammar — either the registry id or the grammar needs to change. Also: figures-spec's header still says "SPEC ONLY — nothing is built."

### 20. Assembled-creature rig — LOIS_GAITS
WetLab-assembled creatures: invisible cut-out bones (head + 2–3-bone limb chains, ≤12 bones), parts dealt from the stage's own pool by Davis, posed by Lois's gait table (NOD/VIBE/BURN/CUT/AWAY: period, swing, knee, head, crouch).
- **Files:** `engine/creatureRig.js` (`LOIS_GAITS`, `poseRig`, `expandCreatureInstances`, `kinShimmer`), `engine/creatureAssembler.js`, `engine/creatureBreed.js`, `engine/creatureGenome.js`, `engine/creaturePaint.js`.
- **Clock/driver:** `poseRig(rig, t, gait, phase)` is a pure function of `t` = kinemeTime; per-chain phase with a per-depth −π/2 lag is rig-internal, distinct from the per-part kineme phase of §19. Lois's face arrives as the recorded `doc.loisFace`.
- **Moves:** CONTENT — expansion emits body + one ordinary instance per bone into the placed list *before* kinemes/atlas, so parts are governed, counted, and recorded like any mark. Kin shimmer makes a creature's family breathe in unison.
- **Interactions:** highly aware by design — parts redress from the stage's own shapes/colours; Davis role-fit deal; ferrofluid pull via §19's sampler; frozen → rest pose, collapsed → body alone (governor rungs).
- **State:** built & live.
- **Risks:** expansion + posing run per frame per placed creature tile on CPU (memoised by species key — INFERENCE from header claims; the seam was verified, the memo was not). **Vocabulary collision:** "gait" here (LOIS_GAITS) is unrelated to kc-gait/1 records (§25), and both are live.

### 21. The moth — pin-formed creature
A formed pin grows a moth: body + two wing pairs, feather-fan plumage along skeleton bone chains, wings mesh-warped by skinning, posture driven by the room's stress band.
- **Files:** `engine/creature.js`, `engine/skeleton.js`, `engine/wingWarp.mjs`, `engine/featherFan.js`, `engine/creaturePose.js`, `engine/engraveBody.mjs` (a finish that follows the posed spine; not itself motion).
- **Clock/driver:** **mixed** — wing beat is a pure function of `input.loopTimeMs` (flap period 1700 ms); hover comes from the living-motion floor (`driverSec`, §17); growth/pair ages, steering, and the posture flourish (period 96 frames) are **frame-counted** on the builder's own counter.
- **Moves:** top content layer items, appended last (creatures-spec chain).
- **Interactions:** reads formation decisions (recorded input, §54 discipline), the stress band (posture OPEN/NEUTRAL/WITHERED + deep-Relax flourish), the dish ground (same GROUND/EDGE/SNAP as marks), and ACCUM trail drive (§41 ember). Formation itself — fertility + density held 30 frames, per creatures-spec — is decided upstream by `curator/formation*` and arrives as recorded fields (`dishFormed`, `dishLimbs`, `dishTraits`, `dishPins`); builders never read live spawn state.
- **State:** built & live (gated by creature citizen/family switches).
- **Risks:** the frame-counted parts are **frame-rate dependent in wall time**: at 30 fps the flourish and the 45-frame grow-in run at half wall-speed vs 60 fps; at 120 Hz they run double. Deliberate for replay (a take replays frame-for-frame), but the same take plays at different wall speed on different displays. Wing warp is CPU skinning per wing per frame, bounded by the 4-creature cap. Also from the motion-map probe (older head, not re-run): creature parts take asset and region kinemes, but the layer ROTATE spin does **not** reach parts (keyed by instance object; parts are copies) — untested by any selfcheck.

### 22. Dish creature — XPBD disc body
A physics creature: a head disc steered to the hosted pin's hover point, spine/limb discs following through XPBD links with momentum and lag.
- **Files:** `engine/dishCreature.js`, solver `engine/dishLinks.mjs`.
- **Clock/driver:** **entirely resolver-frame-counted** — per-frame spring/damp constants (headPull 0.085/frame, damp 0.8/frame…). No seconds anywhere.
- **Moves:** CONTENT — discs drawn as slime marks on the hosted pin's layer. Gated by `dishAllowed`; the moth builder skips a dish-hosted pin (allocation exclusivity).
- **Interactions:** reads dish pressure (limb growth), the band (material reaction), field flow (facing), keeps (consolidation). Formation decisions arrive recorded.
- **State:** built & live (first formed pin hosts).
- **Risks:** **the most frame-rate-sensitive system in this cluster** — XPBD with per-frame (not per-second) constants changes character at 30/120 Hz. Replay-safe, wall-clock-wrong.

### 23. Creature ALife — chem / policy / dream
A Creatures-style inner life for the dish creature: chemical drives, a learned policy, instinct dreaming.
- **Files:** `engine/creatureChem.js`, `engine/creaturePolicy.js`, `engine/creatureDream.js`, `engine/creatureGenome.js`.
- **Clock/driver:** frame counts — chem ticks every `CHEM_TICK_FRAMES = 12` frames ("~5 Hz" only at 60 fps); hatch dreaming is 120 frames.
- **State:** **built but gated** — opt-in via `?alife=1` in `gl/liveLoop.mjs`, stamped `creatureAlife` on every input so a take records whether it ran. Without the flag, chem/policy/dream never run on stage; their only production consumer is the dish creature.
- **Risks:** same frame-rate caveat as §22, squared.

### 24. Jansen beast — the Strandbeest
A walking linkage animal: 13 Jansen measure genes → closed-form crank kinematics → bars as invisible bones wearing pool parts. Locomotion is the stance stroke itself; steering is differential crank phase between leg banks.
- **Files:** `engine/jansenMeasures.js`, `engine/jansenSolver.js`, `engine/beastRig.js` (`poseLinkage`), `engine/beastRoam.js` (`roamAt` — closed-form arc integration, pure in t), `engine/beastTile.js`, `engine/beastTrace.js` (foot trace marks), `engine/beastSettings.mjs`.
- **Clock/driver:** crank angle is an analytic function of anchored kineme time at contract time; roam integrates in closed form — no per-frame state. This is the frame-rate-independent way to do what §22 does by counting.
- **Moves:** CONTENT via tile expansion (§20's seam); trace marks are fading dish-writing items from the same expansion. Infeasible genomes draw nothing, ever (feasibility gate).
- **Interactions:** reads the DRIVE gene (crank-rate multiplier), Davis's role deal for bar parts, the ferrofluid pull per bar.
- **State:** built & live **as tiles**. The pin-hosted variant, `engine/beastBuilder.js createBeastBuilder()`, has **zero non-selfcheck callers — dead**. `engine/beastTrails.js writeTrail` is an explicit placeholder; only its Fréchet/foot-signature math is live. The epic spec (`docs/design/strandbeest-epic-spec-2026-10-29.md`) still says "drafted, not filed, not scheduled" — badly stale; S1–S5 shipped.
- **Risks:** `evaluateGenome`'s 360-step feasibility sweep is expensive for unmemoised callers (the cultivate model calls it). `window.__KC_BEAST_ROAM` can override roam tuning in the live app — a global-mutation back door; whether the loop folds it into the recorded doc field (and thus into takes) was **not verified** (INFERENCE either way is unsafe — flagged as an open question).

### 25. GAIT records — kc-gait/1
Portable named motion records addressed by join-tree depth (root/inner/leaf) with phase cascade, worn today by construct tiles. The ferrofluid field decides *when* a construct breaks up; the gait decides *how* (release order, scatter style, rejoin ease/path).
- **Files:** `engine/gait.js`, `engine/gaitAssign.js`, `engine/gaitStage.js` (`poseConstruct`), `engine/gaitBreakup.js`, `curator/gaitLive.js`, defaults `data/canon/gaits.js`.
- **Clock/driver:** **beats** — `gaitBeatTime` at the stamp's BPM (default 120 with no audio); the resolver builds the stamp from `driverSec`. QUEEN picks land on phrase boundaries from audio energy (`curator/gaitLive.js` → `gaitAssign.queenPicks`); the user lock is absolute.
- **Moves:** CONTENT — construct tiles only, and only while a gait moves: at rest a construct *is* its flat tile (Matt's 2026-11-18 ruling, hard-gated in `gaitStage`).
- **Interactions:** genuinely field-aware — release triggers on the recorded ferrofluid (drift over the matter floor + magnet + PULL > 0); the fold rides the resolver snapshot so takes replay it. Governor shed = freeze → pin → collapse, never a pop. Blind to poem and to Dish Life.
- **State:** built & live, **constructs only**. Gait-spec ruling 7 promises adapters for creatures, beasts, and glyphs ("M5") — **no such adapters exist**; creatures/beasts use LOIS_GAITS / the Jansen crank instead. DAVIS gait mutation (ruling 4's second half) is not built ("a later slice," per `gaitLive`'s header). Ruling 10's TASTE→QUEEN amount step-down guardrail: no implementation found (grep-level check).
- **Risks:** per-piece driver evaluation is CPU per construct per frame (≤16 pieces × drivers), bounded by construct count. A third clock semantic (beats) layered on driver seconds.

### 26. KINETIC births
A KINETIC press can breed a child from creatures/assemblies on stage (~1 in 8 presses with ≥3 parents, cultivation-gated, banked only if the take is kept).
- **Files:** `engine/kineticBirths.mjs`, `curator/birthLive.mjs`, pool injection in `gl/liveLoop.mjs`.
- **Clock/driver:** none — a pure function of (project seed, per-press counter, standing population, room).
- **Moves:** adds a creature tile to the pool (CONTENT once placed). It produces creatures but animates nothing; included because it is a population mover.
- **State:** built & live. **Risks:** none motion-specific.

### Dead in this cluster
`engine/robot.js` (detent-quantised robot poses) and `engine/lsystem.js` (tree skeletons) are pure, frame-indexed skeleton libraries with **no production caller** — built, selfcheck-only, effectively dead awaiting a consumer. `engine/plateBody/stippleBody/washBody/glassBody.mjs` and `engraveBody.mjs` are **not motion systems** — static material fills/finishes consumed at placement time; audited and excluded. `engine/featherFan.js` is static layout; the flap reaches the wing only as a rigid transform plus wing warp.

---

## C. The dish: Life, ferrofluid, particles, wet field, weather

### 27. Dish Life culture core
A multi-state Game-of-Life-family automaton (Generations rule B3/S234, 8 states: dead, alive, decaying) growing from the performer's own composition on the 96×54 dish grid; locked/held marks are bedrock.
- **Files:** `engine/dishLife.mjs` (`createCulture`, `stepCulture`), `engine/dishLifeSeed.mjs` (marks → coverage field → band-normalised seed).
- **Clock/driver:** none internal — a pure function of (grid, rule, bedrock, steps), driven toward a stamped generation by the stage (§28). No `Math.random`; seeding via a registered hash channel.
- **Moves:** nothing directly. Publishes `field.level` (1 alive → 0 through decay) and `field.activity`.
- **State:** built & live. Cheap: 96×54 typed arrays, zero allocation per step, deterministic (golden `cultureHash`).
- **Risks:** low.

### 28. Dish Life stage — field / quiet / visual modes
Owns when a culture exists, which generation it's on, and whether it's invisible, whispered, or drawn.
- **Files:** `engine/dishLifeStage.mjs`, `engine/dishLifePhase.mjs` (idle clock: 8 s idle, 8 gens/s), `engine/dishLifeQuiet.mjs` (48-gen cycle @ 8 gps), `engine/dishLifeField.mjs` (48-gen cycle @ 4 gps), `engine/dishLifeRender.mjs` (draw path), `engine/dishLifeTouch.mjs`, `gl/dishLifeTouchDom.mjs`; wiring in `gl/liveLoop.mjs` (~:871–917).
- **Clock/driver:** loop-clock stamps only — every stamp is a pure function of loop time and rides the recorded input, so takes replay exactly. Per-frame catch-up is bounded by a shed ladder (`SHED_STEPS = [4,1,0]`).
- **Modes, as actually wired live:** **Field** (the #2152 mode): runs the same machinery but *never draws* — no dissolve, no cell stamps, no specks; its only output is `publishedField`. The loop stamps it whenever the coupling dial **or** the LIFE dial is > 0. **Quiet** (the live default): a kineme sampler for marks plus up to `SPECK_MAX = 64` faint cell-derived **specks drawn in gaps between marks** at tertiary strength (default 0.35). **Visual** (idle ≥8 s dissolves the scene and draws cells as placement items on the top content layer, `MAX_CELL_ITEMS = 600`): **no live producer of a visual stamp was found** — the loop only ever stamps quiet and field. The visual path is reachable only via a stamp whose mode is neither (replay / selfcheck / legacy takes). INFERENCE: visual mode is dormant-but-not-deleted.
- **Interactions:** reads all content layers' marks at wake; receives the ferrofluid birth bias one frame behind; hands `publishedField` to §29–30.
- **State:** built & live (field + quiet); visual built, dormant.
- **Risks — ruling tension:** the quiet path's specks are Life *literally drawn* in the live default configuration, against a strict reading of #2152's "never drawn." `one-force-seam.md` slice 4 ("retire Life's own cell drawing (visual mode) and specks") is **not done**. Also: three clocks (phase/quiet/field) describe overlapping cycle maths with different constants (8 vs 8 vs 4 gens/s; 60 vs 48 vs 48 gens) — duplication.

### 29. Life coupling consumers — the gentle force
Everything the invisible culture does to real assets short of killing them: marks swell/shrink with the ground under them, glyph breath deepens, patterns drift, TIDES shift, backgrounds brighten/dim.
- **Files:** `engine/dishLifeCouple.mjs` (`applyCultureScale`, `cultureBreathFactor`, pattern drift/TIDES, background fold).
- **Clock/driver:** none — pure per-frame functions of (published field, dial, item). Dials ride the recorded input; CULTURE HELD (governor shed ≥2) folds every consumer to 0; dial 0 = byte-identical frame.
- **Moves:** CONTENT marks (scale ×1.40 alive / ×0.60 dead at full dial), FIELD glyph breath, **PAT** drift/TIDES, content backgrounds — the widest strata reach of any system in this cluster.
- **State:** built & live (Stage Coupling Phases 1–2, #1994 and follow-ups).
- **Risks:** low; the model citizen of the seam pattern (read the field, write nothing back, ephemeral deltas only).

### 30. LIFE fade/die + births — the #2152 force itself
With the LIFE dial up: a mark over a decaying cell fades (alpha and scale ease down through the decay states), a mark over a dead cell is **gone**, and live empty cells **birth** copies of the nearest dealt mark.
- **Files:** `engine/dishLifeCouple.mjs` (`cultureLifeFactor`, `applyCultureLife`, roll ease), `engine/dishLifeBorn.mjs` (births); markers stamped in `gl/liveLoop.mjs` / consumed in `gl/liveResolve.mjs`.
- **How death actually works (verified):** stateless. `cultureLifeFactor(level, dial)` — at dial 1 the factor *is* the cell's level; alpha is multiplied by it, scale shrinks by `LIFE_SHRINK = 0.4`; below `LIFE_GONE_BELOW = 0.04` the factor is 0 = not drawn. Held/locked/pinned marks are skipped (bedrock); the poem is out of reach by construction. Births: copies of the nearest *visible* dealt mark, nearest-parent-first, cap `BORN_CAP = 256 × dial`, copies' total ink ≤ half the dealt ink (`BORN_SHARE = 0.5`), copies at 0.6× size / 0.7× opacity, drawn in the parent's own layer, shed first under load. Cycle roll eases over the first 4 generations of each re-seed (slice 3). Old takes without the `dishFieldBorn`/`dishFieldEase` markers replay with the older behaviour — the versioning discipline is exemplary.
- **State:** **built & live, all three slices** (fade/die #2234, births re-cut, roll ease) — despite `docs/design/dish-life-on-assets.md` still carrying the header "spec for Matt's yes. Nothing here is built." The doc is stale; the code is the authority. The force is dial-gated with default 0, so the headline #2152 behaviour is invisible until the performer raises LIFE.
- **Risks — the mechanism gap:** there is **no per-asset dwell/withering timer anywhere**. The ruling's words are "standing on dead ground *too long* withers and is gone"; the code kills by *cell state*, not by *asset dwell*. Outcome conforms, mechanism differs — and because consumers are stateless by law (the field carries all history), no current structure could express a minimum standing time if Matt rules one. Also: births allocate per frame (ring BFS over 5,184 cells) when the dial is up — bounded, but not zero-alloc like the core.

### 31. Ferrofluid kernel + stage
An invisible two-phase Gray-Scott reaction-diffusion fluid in the dish. Its density tells assets where to pool, lean, and be born. The fluid itself is never drawn as a surface (2026-11-08 ruling, kept).
- **Files:** `engine/dishFluid.mjs` (kernel: `GS_DU 0.2097 / GS_DV 0.105`, feed 0.0545 / kill 0.062, magnet + culture bias, a 10-rung shed ladder), `engine/dishFluidStage.mjs` (`publishedFluid`, attachment plan), `gl/dishFluidMagnetsDom.mjs` (magnet placement gesture).
- **Clock/driver:** loop-clock stamp, 6 s cycles; 480 stamp-steps/s ÷ divisor 8 → ~60 grid-steps/s target, per-frame catch-up bounded by shed rung. On only while the FERROFLUID chip (or `window.__KC_FERROFLUID`) is set — off means no input keys at all.
- **Interactions:** reads culture level one frame behind (feed/kill bias); magnets bias feed/kill by a Gaussian of distance, so the dark phase grows toward and stands at magnets. Magnets are placed objects (performer gesture, gated by a MAGNETS arm) — explicitly not the performer's hand.
- **State:** built & live (the JS kernel is the authoritative backend).
- **Risks:** cost scales with catch-up steps after a stall, bounded by rung; cheap at rung 0.

### 32. Ferrofluid force consumers — pull, drift, duplicates, births
The fluid seen only through what it moves — the one-force seam's read side.
- **Files:** `engine/dishFluidPull.mjs` (bones), `engine/dishFluidDrift.mjs` (marks + poem lean), `engine/dishFluidDuplicates.mjs` (copies), `engine/dishFluidCouple.mjs` (fluid → culture births), `engine/dishFluidRender.mjs` (now only the shared matter law; its CPU seating was retired).
- **The magnet pull law — verified as ruled:** `bonePullDelta()` returns nothing unless magnets exist, the PULL dial is > 0, and the bone's cell density ≥ `PULL_DENSITY_FLOOR = 0.25` (field-gated); then rotation closes toward the *nearest* magnet (0.5 of the angle at saturation) and the root drifts toward it (≤18 px), strength = density × dial. In-kernel, magnets grow the dark phase toward themselves (§31). Mark drift: a mark in density ≥ floor leans toward the nearest magnet, ≤32 px. Duplicates: copies of the nearest dealt mark bunch near magnets, `DUP_CAP = 64`. Fluid births seed the culture where density ≥ 0.25; deaths/terrain are never touched.
- **Composition order** (per `one-force-seam.md`, verified in wiring): culture (presence) first, fluid (position) second, every frame and every replay. Bone pull composes inside `poseFigure` (§19) — pose code never learns what a field is.
- **State:** built & live (seam slices 1/1b + bone pull #2190).
- **Risks:** spec drift — the seam doc says duplicates use "LIFE's born-mark cap"; the constant is 64, not 256.

### 33. Ferrofluid GPU field-body channel — the clumps
A dense body of small whole assets pooling where the fluid is dense — the ferrofluid's visible mass, seated entirely in the vertex shader.
- **Files:** `engine/dishFluidChannel.mjs` (seating law + budgets; iPad starts one rung down at 4096 instances), `gl/shaders.mjs` (`FIELD_VS`), `gl/renderer.mjs` (the `fieldBody` program, drawn ~:1386).
- **Clock/driver:** none — every seat derives from `gl_InstanceID` + the density texture; the governor thins the draw in whole sub-rounds at zero CPU cost.
- **Moves:** pool-vocabulary asset instances attached to the fluid's layer (CONTENT). These are **not** the stage's dealt marks. Seating is presentation only: explicitly not bit-exact across devices, and removed from the hashed resolver output by the PERFORMANCE_VERSION 2→3 clean break (old fluid takes retired, per the 2026-11-15 clean-break ruling).
- **State:** **built & live — in direct tension with two rulings.** Matt's 2026-11-16 one-system ruling ("I don't want those clumps… the clumps, game of life and assets dealt to stage [should] all have same intrinsic properties") and `one-force-seam.md` slice 2 (retire the clump body once mark drift reads as fluid) both call for its retirement. Mark drift (§32) shipped; the retirement did not. The channel itself is a legitimate #2180 capability for *other* field systems — it is the ferrofluid's use of it as a drawn body that the ruling retires.
- **Risks:** the highest GPU instance count in the cluster (thousands of instanced stamps) — the main iPad GPU exposure here. Per-device seating variance is accepted by design, but screenshots differ per device.

### 34. GPU culture / GPU fluid hosts (K1/K2)
The two dish kernels on the GPU, without changing what the resolver records.
- **Files:** `gl/cultureSim.mjs` (integer-state shader, bit-equal to `stepCulture` by construction), `gl/gpuCultureHost.mjs`, `gl/fluidSim.mjs` (RG32F ping-pong), `gl/gpuFluidHost.mjs`, sparse-input packing in `engine/dishCultureCells.mjs` / `dishFluidCells.mjs`; wiring in `gl/liveLoop.mjs` (~:946–1008).
- **Clock/driver:** same stamps as the JS stages; hosts step toward the stamped target and read back via PBO + fence polling (never blocking), 1–2 frames late; results enter the next resolve as recorded inputs.
- **State:** **built, gated OFF by default** (`window.__KC_GPU_FLUID` / `window.__KC_GPU_CULTURE`); fail-soft — any exception disables the flag for the session and the JS kernel resumes. JS remains the reference backend (K0 R4).
- **Risks:** Tier S (per-device) outcomes for the float fluid; culture is integer-exact except a ~2⁻²⁴ birth-threshold edge noted in-code. Async readback means the field a frame consumes can be a generation stale — by design, but live timing ≠ selfcheck-harness timing.

### 35. ParticleSystem — the swarm engine
The boids/organism engine underneath swarm and creature-adjacent layers: SoA typed arrays, a counting-sort spatial hash, boids plus organism behaviours (cruise, flock, orbit, scatter, mold, Lévy flights, a Lorenz-attractor ride, seek/flee around a point attractor, chemotaxis on a scent field, pigment leak).
- **Files:** `engine/particles.js` (2,333 lines), `engine/organisms/behave.js`, `engine/particlesSnapshot.mjs` (serialises *every* simulation column + scalars, atomic validated restore), `engine/particles.reference.mjs`.
- **Clock/driver:** `update(dtSec)` — **frame-delta**: `dtFrames = dtSec × 60` scales per-frame quantities; the loop's 8–50 ms clamp bounds it. `time` is loop-accumulated ms. This is the one major sim in the cluster *not* driven by a stamp/generation target.
- **Moves:** particle instances on CONTENT layers.
- **State:** built & live — the authoritative swarm (GPU versions are shadow/takeover guests, §37).
- **Risks:** the integrator steps once per rendered frame, so at the 50 ms clamp a slow iPad frame advances 3 frame-units in one step — contact behaviour differs from 60 fps. It's a chaotic system: last-bit float differences amplify, which is exactly what the SoA/grid ordering discipline exists to contain. CPU neighbour loops are the cluster's main CPU cost at high counts. Lorenz entering re-seeds every agent from seeded hashes (restart-from-seed, never resume) — deterministic, but a visible population reset by design.

### 36. Petri-dish physics suite
The laws that make enrolled particle strata behave like bodies in one physical dish: contacts on a shared cross-strata grid, a wetness medium (restitution/cling/damping/friction; wetness 0 = bit-identical dry path), spin from contact impulses, XPBD links, impact squash (render-attribute only — physics byte-identical on/off), membrane coalescence, pairwise pigment trading on sustained contact, scent/trail fields (own gradient up, others' down), a measured density field (published out, never read back by physics), thermal jitter from `dishTempo`, current advection, and population ecology pressure.
- **Files:** `engine/dishContacts.mjs`, `dishMedium.mjs`, `dishSpin.mjs`, `dishLinks.mjs`, `dishDeform.mjs`, `dishCoalesce.mjs`, `dishPigment.mjs`, `dishTrails.mjs`, `dishDensity.mjs`, `dishThermal.mjs`, `dishCurrents.mjs`, `dishEcology.mjs`; call sites all in `engine/particles.js`.
- **Clock/driver:** the particle step (§35); laws are pure functions of (seed, params, step count) via hash channels keyed by the integrator's step.
- **Interactions:** densely interconnected *within* the suite. **Blind to the culture and ferrofluid fields entirely** — this "dish" (a session object in the resolver) and the 96×54 field dish never exchange data. The word "one dish" is rhetorical here; mechanically there are two.
- **State:** built & live, each law behind its param gate with a bit-identical off path.
- **Risks:** concept duplication with §§27–34 (two dishes, three densities — contact density vs fluid density vs culture level — with no conversion between them). The suite's combined per-step cost is the CPU budget's centre of gravity.

### 37. GPU swarm + GPU contacts (K3)
GPU parity proofs on real inputs: an all-pairs boids shader (WebGL2 has no grid atomics) and GPU contact detection.
- **Files:** `gl/swarmSim.mjs`, `gl/gpuSwarmHost.mjs`, `gl/dishContactsGpu.mjs`, `gl/dishContactsResolveGpu.mjs`, `gl/gpuContactsHost.mjs`; wired in `gl/liveResolve.mjs` / `gl/liveLoop.mjs` with a `swarmGpu: 1` marker recorded on the input when takeover is on.
- **Modes:** **shadow** (GPU compared against JS, reaches nothing) or **takeover** (GPU steering feeds CPU accumulators; contacts/integration stay JS float64). Both only when asked (layout param / window flag / URL).
- **State:** built, gated OFF by default.
- **Risks:** all-pairs is O(n²) texel reads — fine at swarm counts, a hard ceiling at organism counts. Float32-vs-float64 divergence in a chaotic system means shadow parity is statistical, never bitwise.

### 38. Conway CA engine
A small standalone plain-Conway Life grid (B3/S23, toroidal wrap) used as a layout/curation device — *not* Dish Life.
- **Files:** `engine/ca-engine.js` (38 lines).
- **Clock/driver:** unclocked; stepped by callers — store slices for `mode === 'ca'` layout grids (40×28), phrase beats (`state/phraseTick.js`), and fixed census furniture.
- **Interactions:** **fully blind** — no reads/writes with the culture, the fluid, or the dish physics. Name collision only. Note its rim law (toroidal wrap) is the opposite of the culture's (no-wrap glass rim).
- **State:** built & live in its narrow role.
- **Risks:** confusion risk (three "Life" systems in one repo). Allocates a fresh 2-D array per step — fine at 40×28, would not scale.

### 39. Vortex wet field — the WET sim
One shared "water under the trails": marks stamp wetness and pigment into a field that spreads, advects, dries, and darkens at its edges. A vorton fluid (128×128 stream-function Jacobi solve, fixed 20 iterations) with two-compartment Kubelka-Munk pigment.
- **Files:** `gl/vortex.mjs` (1,402 lines), service `gl/wetFrame.mjs`, shed wire `gl/wetLive.mjs`, `gl/pigmentKM.mjs`.
- **Clock/driver:** **fixed dt = 1/60**, fixed iteration counts, splats in deterministic `layer|key` order, seeded RNG for ambient emission. The service steps the sim **only when a consumer requests the field that frame** (need-based gate). Freeze holds the field rather than zeroing it (zeroing "would pop the flow on resume"). Resets only on seed/size change.
- **Moves:** the field itself is never drawn. What the audience sees is indirect: ACCUM's feed/fade drink its velocity + pigment (§50), soaking strata smear/absorb (§52), the dish medium reads it (§53). Stratum: FX/presentation + content coupling.
- **Interactions:** consumers today are ACCUM and the dish. The governor tier-1 shed *degrades* it (stamping continues, mask dries in place, advection skipped) and the mode is published (`live`/`degraded`/`shed`/`off`) and shown in the personas' show block — "a shed is reported, never silent."
- **State:** built & live.
- **Risks:** **the heaviest CPU item in the audit** — cost-registered tier 1 at **~6.6 ms/step measured on sandbox hardware** (≈40% of a 16.6 ms frame before anything renders), ~1.5 MB state. The in-code header names real-hardware confirmation (#1695) as a still-pending separate gate. Field time tracks presented frames, not wall time (consistent with the instrument).

### 40. Flow field + trail grid
The FLOW stratum's static 32×32 curl-noise lookup, and the trail grid — a 32-wide box downsample of the ACCUM buffer (energy, mean colour, dominant age) refreshed every 15 ACCUM steps (≈4 Hz).
- **Files:** `gl/flowField.mjs`, `gl/trailGrid.mjs`, `gl/trailGridLive.mjs`.
- **Moves:** the trail grid draws nothing; it *steers* — the moth ember drive (§41) grazes by it. The vortex's velocity texture rides the feed shader as an *added* advect offset, never replacing the curl lookup; unbound at wetness 0 = pixel-identical.
- **State:** built & live.
- **Risks:** low.

### 41. Weather — three systems sharing one word
(a) **Haze-as-air** (#1183 WEATHER): an FX layer's haze becomes air the marks sit in — colours mix toward the veil grey, alpha scales (×0.6 floor, never erases); the mist field drifts slowly over loop time. (b) **Mark-born motes** (#1627): marks shed drifting motes from beam/pressure/trail/heat signals, on a locked-step accumulator. (c) **Ember drive**: moths graze mid-age/fresh trail light, one drive with two signed poles, steering by the trail grid (§40).
- **Files:** `engine/weatherAir.mjs`, `gl/dishWeather.mjs` (the resolver seam), `engine/markWeather.mjs`, `engine/emberDrive.mjs`.
- **Interactions:** motes read measured signals including **dish density (§36)** — one of the few bridges between the particle dish and the mark world. Both weather systems are dial-gated with byte-identical off paths. `markWeather.mjs`'s own header has to disambiguate itself from (a): "the two weathers share a word and nothing else."
- **State:** built & live.
- **Risks:** naming collision as a standing maintenance hazard.

### 42. Ground seam + small drivers
The original #1183 "one dish" container and a set of small single-law drivers: marks lean/nudge/snap to the pattern ground (`dishGround`), shear by the nearest FX tear above (rift), a z-approach surge (Queen-stamped trigger only, anticipation dip mandatory), constant parallax anchor drift (2.5 px/s × z-tier, pure in banked step count), tile-edge ground nudges (per-frame with undo, never accumulates), and the Queen's beast heading lean (capped 0.25 rad, logged per cycle).
- **Files:** `gl/dishGround.mjs`, `gl/dishRift.mjs`, `engine/kernel/dish.js` (the container — one per resolver/document), `engine/noise.js` (seeded simplex/fBm), `engine/surge.js`, `engine/parallaxDrift.js`, `engine/groundNudge.js`, `engine/herdingLean.js`. (The diorama camera parallax in `gl/parallax.mjs` is view motion, driven from `gl/liveLoop.mjs`.)
- **Clock/driver:** pure functions of resolver inputs / loop time / step counts; surge and parallax run on the locked travel step. All-zero dials = a frozen empty object, byte-identical.
- **Interactions:** note carefully — this seam's "ground" is the *pattern tile*, not the culture/fluid field. The two dish families (§§27–34 vs §36) coexist with no data path between them.
- **State:** built & live, all dial-gated. (`docs/design/dish-strata-sketch.md` still lists the live caller as "Missing" — stale.)
- **Risks:** low individually; cumulative naming risk (at least four distinct objects are called "the dish": kernel container, particle session, 96×54 field grid, pattern ground).

---

## D. Poem, audio, FX, ACCUM, WET consumers

### 43. FIELD poem formation — letters become the poem
A poet's piece is placed as individual letter stamps on the dish itself — the poem is formed by letters on the stage, never rendered as a text plate (the old plate overlay is retired in the renderer; "the poem is instances now").
- **Files:** `poets/placement.js`, `poets/fieldForm.js`, `poets/poemRow.mjs`, decks `poets/{greenleaf,teijo,rosselli,gibson}.js`, draw in `engine/buildPlacements.js`, `components/PoemRow.jsx`.
- **Clock/driver:** none — placement is a pure function of (piece, layout recipe, density, seeded RNG) at deal time, drawing seeded sub-streams indexed by the document's `poemDeal` counter.
- **Moves:** nothing; it *creates* static stamp records (recipes: grid/bands/single/two/square; rotation 0 under every shipped recipe). Threshold law: `FIELD_POEM_MIN_STAMPS = 12` (#1932 — fewer = fragment, silence); cap 200; a stillborn gate refuses charset/fit/overlap violations. Type exclusivity (#2150) is mechanical: poem stamp packs are excluded from every placeable pool by id set.
- **Interactions:** single write site for `layoutParams.fieldForm` (`state/slices/layoutSlice.js`). The field-review path deliberately rebuilds the landing *without* life drift/breath/kineme/travel/surge/shed so a verdict re-derives from the banked record alone.
- **State:** built & live. This is the #1932 ruling implemented literally; no contradiction found.

### 44. Poem transitions — morph, review morph, lean
The standing poem's stamps do not move. What moves is the *transitions*:
- **Layer MIX morph** (`gl/liveResolve.mjs`): on a chip change, all items of the layer — poem included — glide between poses over `mixSeconds` (2 beats of the BEAT clock), squeezed ×0.65 per in-flight re-trigger, floored at 0.5.
- **Review morph** (#2006 slices 3–4): when the review ladder repairs or cuts a just-landed poem (§58), the stage glides from the landing pose to the repaired pose instead of popping. A glyph pairs only with itself; RE-DEAL glyphs arrive as joiners / leave as leavers; the from-pose of a transform repair is *reconstructed* by inverting the review transform (the janky pose was data, never a rendered frame). QUIET repairs move no glyph — the room's marks deepen into suppression instead. Triggered once per landing by a stamped, played-once key; progress on loop time (HELD freezes it, DRAGGING crawls it, §2). The stored form's stamps never move — the adjusted form is recomputed at draw, so removing the record restores the landing exactly.
- **Ferrofluid poem lean** (one-force-seam slice 3): `applyPoemLean` in `engine/dishFluidDrift.mjs` leans the poem *by whole words*, capped per word, only when a fluid runs with a magnet and the seam marker is stamped.
- **Files:** `engine/buildPlacements.js` (FIELD block), `gl/liveResolve.mjs` (morph ~:1900–2060), `curator/fieldReview.mjs`, `curator/fieldReviewLadder.mjs`, `poets/fieldForm.js`.
- **Interactions:** poem glyphs are excluded from fluid duplicates and LIFE births ("the poem and Life's copies are never copied"); a HELD poem is *terrain* to the culture. Mirror copies, material treatment, and velocity smear (§51) reach glyphs at the shader level without moving their centres.
- **State:** built & live.
- **Risks:** negligible cost (≤200 stamps). Morph durations are in sim seconds — fps-independent inside the dt clamp.

### 45. RAY GUN treatment
The sanctioned destructive type treatment on a standing poem: CARSON (per-glyph jitter/tilt/scale/heroes/duplicates), GREIMAN (per-word-block rigid transforms + echoes), GRIT (re-set on the grid with rule violations), SHOT (full texture — word recoverability explicitly OFF by ruling).
- **Files:** `poets/rayGunForm.js`, `curator/treatmentsLive.mjs`, `curator/treatmentRecord.mjs`, `gl/itemDistort.mjs`, `poets/poemRow.mjs` (seed streams).
- **Clock/driver:** none — a pure seeded transform `(form, mode, seed) → drawn stamps`, **recomputed from the plain stored form on every draw**, never cumulative, exactly reversible by cycling back to plain. Armed by a poem-row tap (seed stream deliberately *not* `poemDeal`, so firing the gun never perturbs poem-deal replay) or at deal time by a doctrine.
- **Interactions:** the treatments bus announces arm/disarm but carries no state — "turn every listener off and the stage renders bit-identically." A record may carry `life: 'bedrock'|'seed'` — the poem's meeting with the culture (§27).
- **State:** built & live. Recoverability bounds for CARSON/GREIMAN/GRIT are stated and selfchecked (five `rayGun*.selfcheck.mjs` in `poets/`).
- **Risks:** none material.

### 46. Audio ballistics + route matrix — the coarse audio driver
Mic/file/synthetic audio energy becomes smooth scale, alpha, breath, and glow gestures.
- **Files:** `gl/audioBallistics.mjs`, `gl/audioEnvelopeCore.mjs`, `gl/audioRoutes.mjs`, `gl/liveLoop.mjs` (buildFrame), `state/audioRig.js`, `hooks/useAudioInput.js`.
- **Clock/driver:** the GL loop clock. Two deliberate shaping stages (stage 1 in `useAudioInput` on rAF with the user's attack/decay knobs; stage 2 in the loop with internal defaults) — the duplication is documented in-code as deliberate feel, pinned by a selfcheck ("removing one changes the response character — that call is Matt's"). Ballistics: attack 25 ms / release 320 ms; silence decays to *exact* zeros below an epsilon snap.
- **Moves:** route outputs over CONTENT + FX: `SCALE ← beat·0.38·scaleMod + (bass·0.55 + level·0.35)·0.28`; `ALPHA ← beat·18·alphaMod`; `BREATH ← beat·0.035`; `GLOW ← min(1, beat·0.8 + level·0.4)` — plus the assignable `{input, target, depth}` route table (mid & treble drive nothing in the default table). With no table, the loop runs the original inline math bit-for-bit.
- **Interactions:** feeds resolver inputs, ACCUM's audio envelope (§50), MATH knob modulation (§49), and the STIMULI panel — which renders the *same* `audioRoutes()` function, so panel and render cannot drift.
- **Silence, verified:** ballistics → exact 0; routes are pure offsets, so 0 = identity; the loop passes `audio: null` onward when off. Nothing freezes — the substrate (§6) never depended on audio.
- **State:** built & live. **Risks:** trivial cost; dt-based, correct at any fps.

### 47. Meter bands, band feed, audio events
A second, finer analysis of the same audio: seven log-spaced bands (20 Hz–20 kHz, FFT 2048) and discrete events — onset (adaptive threshold, 120 ms refractory), tempo (70–170 BPM folded, published only on >2 BPM moves), energy tiers with hysteresis, silence start/end (level <0.02 for 2000 ms).
- **Files:** `gl/meterBands.mjs`, `gl/bandFeed.mjs`, `gl/audioEvents.mjs`, silent synthetic patterns via `curator/beatLibrary.js` / `setLive.js`.
- **Clock/driver:** caller's loop time only — "never a wall clock: the same samples give the same events." Bands are shaped through ballistics *only if a route actually reads a band* (zero cost otherwise); silence/off/no-tap all read exactly 0 ("never a frozen ghost"). With a file sidecar driving, bands read 0 by design (the sidecar carries no per-band data, and a live FFT "would not repeat").
- **Interactions:** consumers are the route matrix (§46), Queen pace (§57), the Davis trio (§58), the STIMULI meter. **Blind spot, by design:** the coarse path never reads the bands and the bands never read the coarse path — two parallel analyses of one input.
- **State:** built & live.
- **Risks:** negligible cost. INFERENCE: a live-mic performance's band-driven decisions are replayable only insofar as they were baked into recorded resolver inputs / route records.

### 48. Spectral path — spectrum marks + feedback warp
A perceptual 128-bin log spectrum that (a) modulates marks directly and (b) bends ACCUM's feedback, MilkDrop-style.
- **Files:** `gl/spectrumCore.mjs`, `gl/spectrumLive.mjs`, `gl/spectrumMarks.mjs`, `gl/spectrumWarp.mjs`, `gl/sourceFeed.mjs`.
- **Clock/driver:** per-frame step from the app's frame tap, dt-corrected (attack 8 ms / release 180 ms / peak-hold 120 ms + 350 ms fall — constants chosen so behaviour is "the same at 30 and 144 fps"). The warp driver adds its own per-bin attenuation.
- **Moves:** marks: a 256×4 texture modulating mark scale/displace/colour by INDEX/ANGLE/POSITION/HASH (CONTENT); absent entirely (frame bit-identical) when amounts are 0 or the governor has made its first cut. Warp: bass deviation → ACCUM zoom (±0.02), attenuated mids → spin, level → feedback keep (0.92–0.985), treble → prism + grain. At silence the warp target is explicitly "identity warp, decay only, never a frame frozen mid-zoom." During take playback it reads the take's recorded spectrum rows and ignores the live analyser, so a replay warps identically.
- **State:** built & live, dial-gated (default off = byte-identical).
- **Risks:** **the warp's spin/zoom ceilings are quoted per frame, not per second** — at 120 Hz the warp accumulates roughly twice as fast in wall time as at 60 Hz. Frame-rate dependence, flagged.

### 49. FX stratum + MATH stratum
FX layers apply an ordered effect chain (rgbSplit, displace, halo, grain…) over the composited strata; MATH layers apply pure tone ops (gain, lift, hueRotate, quantize…) on the same fold, in the ruled order (FX before MATH, #1048/#2038).
- **Files:** `fx/fxFilters.js`, `fx/fxTrack.js`, `fx/mathFilters.js`, `fx/{frameHealth,rollGuard,rollSafety}.js`, `gl/effects/mathShaders.mjs`, `gl/renderer.mjs` (the fold).
- **Clock/driver:** no autonomous clock. Live modulation inputs: FX params accept live modulation "for shimmer"; MATH knobs accept `mod: {knob: 'rms'|'flux'|'beatPulse'}` pushed toward max by the audio envelope, supplied per frame (null when audio off → knobs pass through untouched). MATH hard rule: ops **never** sit inside the ACCUM feedback path — they grade the composite fold only (asserted by selfcheck against `accum.mjs`).
- **Interactions:** one FX layer holds any 4 kinds (the old per-track family binding in `fxTrack.js` is dead data — "nothing in the app routes adds through them"; only the kind→family lookup survives). The governor sheds FX *resolution*, never an effect (#192 rule — the silent-cull trap).
- **State:** built & live.
- **Risks:** fullscreen filter passes are the classic iPad-GPU cost; MATH is cost-registered tier 3 and renderScale sheds before fidelity. Filter output is explicitly **excluded from the determinism contract** ("rasterization may vary subtly across browsers") — mitigated in practice because take checkpoints hash resolver outputs, not composited pixels (§54).

### 50. ACCUM — accumulation feedback + trail modes + slit-scan
Trails: each frame is composited over a decaying feedback buffer so motion leaves ageing, colour-shifting ghosts. When on, ACCUM *is* the presentation path.
- **Files:** `gl/accum.mjs` (2,925 lines — the one shared recipe; stills enter through `gl/accumStill.mjs` under a share-or-refuse rule), live step in `gl/liveLoop.mjs`, trail modes `gl/trailMode.mjs`, `docs/ACCUM.md`.
- **Clock/driver:** one step per *presented* frame. **The decay has no dt input: fade is a half-life in frames** (default 5.4 frames, converted via `halfLifeToKeep`); SWELL breathes the half-life toward 40 frames on a timestamped envelope.
- **Per frame, in order:** resample down (feedback pair at half resolution) → **echoes** (a ring of past frames mixed additively, 0–4 taps, capped at 3 for ≥2048 px wide) → **feed** (flow-advected feedback through an in-shader noise field — trails curl as they decay) → **fade** with a **spectral keep** (per-channel half-lives R ×1.35 / G ×1 / B ×0.72, so a trail's colour becomes its age: fresh → amber → deep ember red), sampled through the feedback transform (TUNNEL zoom/spin, PRISM split) → composite frame OVER → mip-chain bloom → stipple diffusion + chromatic offset + halation. Optional age buffer (allocated only when a consumer asks) and buffer statistics ending in a **one-texel readback** (full-buffer readback is a stated hard-rule violation).
- **Trail modes:** LEAVE (keep governed by the ACCUM FADE law alone — the earlier `max()` composition produced an *immortal buffer*, bug recorded in-code, fixed by #1910), RIBBON (keep floored 0.96), COMET (keep capped 0.72). Unknown mode strings resolve to the default, fail-open.
- **Slit-scan** (#1804): at `accumScan > 0` the echo mix becomes per-column tap *selection* from the ring via a 256×1 delay LUT — each column shows a different moment. A user dial + a fixed left-to-right ramp drive it. **This is not scanography** (§60): different driver (dial vs stage motion vectors), different substrate (echo ring vs a global smear buffer).
- **Interactions:** reads the composite (or, with selective feed, a subset render of the feeding strata — with three honest fallbacks to the composite), the WET field (§39 rides the recipe), the audio envelope (silence = passthrough at 0), the spectrum warp (§48). FREEZE holds the feedback image and skips render+step. A persistent fault tears down, falls back to plain rendering, retries after cooldown — "must never freeze the live canvas." Governor tier-1 sheds the whole chain as one unit.
- **State:** built & live.
- **Risks:** **the clearest frame-rate case in the audit** — keep is per-step and steps are per presented frame, so trail half-life in wall-clock seconds halves at 120 Hz vs 60 Hz (the age buffer is dt-clocked; the decay is not). Perf: ~8 passes at half res + 16F textures; the echo ring is ~8 bytes/px — the ≥2K tap cap and half-res pair are the iPad mitigations; cost-registered tier 1. A take's ACCUM *look* is not part of the checkpoint hash (hashes cover resolver outputs), so trail appearance is presentation-count-dependent across a replay on different hardware.

### 51. Velocity smear (+ squash)
Motion blur with zero fullscreen passes: each instance's quad stretches along its own motion.
- **Files:** `gl/velocitySmear.mjs`, `gl/squashAudio.mjs`, renderer QUAD_VS (`a_inst2.zw`).
- **Clock/driver:** per frame, per instance: `vx/vy = current − previous position`, keyed on the stable `layer|key` identity; first sightings get 0 (no one-frame pops); deltas past `SMEAR_MAX_SPEED = 240` are clamped as teleports. At rest the shader is exactly the old path. Audio can ride squash toward 1 on loud moments; silence falls back to the layout dial exactly.
- **State:** built & live; cost tier 0, "never shed."
- **Risks:** **frame-rate dependence by construction** — displacement *per frame* is the input, so the same physical speed smears half as much per frame at 120 Hz as at 60 Hz. INFERENCE: on a 120 Hz iPad the stage reads visibly less smeared than on a 60 Hz display at identical motion. Not scanography either: per-instance stretch, no global pass, no feedback buffer.

### 52. WET consumers — soak, wet look, warm-up
What the wet field (§39) does to the picture: **soak** (inside the renderer's one composite shader, so live/captures/exports/subset all share the code — in soaked areas a stratum's contribution is rebuilt as absorption by the deposited pigment's KM reflectance + a three-tap smear along local field velocity + stamping; dry pixels are bit-exact), **wet look** (one fullscreen pass over the upscaled ACCUM presentation — saturation up, luminance skewed darker-and-glossier, sheen gated by the pixel's own luminance; on paper grounds wet darkens more and never brightens; no controls, it follows the field), and **warm-up** (stills run the service for a fixed K = 90 steps so an export gets the same field by rehearsal; every wet export prints `wet: warm-up K=90`; WETNESS = 0 → no service birth, export byte-identical).
- **Files:** `gl/wetSoak.mjs`, `gl/wetLook.mjs`, `gl/wetWarmup.mjs`.
- **Interactions:** the SVG fallback has no mask — a signed, documented divergence ("mask absent → static blend"). Mask absent under a shed → soak falls back to the dry composite and the BUILD row's WET indicator dims "so the mode never dies silently."
- **State:** built & live.
- **Risks:** wet look is a fullscreen pass at presentation size — additive iPad cost on top of §39's CPU step.

### 53. WET × dish medium
"How wet is it here" gets one answer — the shared field — for contact physics between particle-dish bodies.
- **Files:** `engine/dishMedium.mjs`, `engine/dishContacts.mjs`, `engine/dishLinks.mjs`.
- **Clock/driver:** the dish's per-step integrator; the driver attaches a `wetSampler (x,y) → wetness` sampled at each contact pair's midpoint.
- **Moves:** restitution `e·(1−w)` (full wet absorbs the bounce entirely), cling/friction curves, medium drag, and grip verdicts — sustained wet grip hardens into bonds. Wet contacts record exactly one press per pass into `session.wetStamps`, drained into the next wet-frame request — **the dish writes back into the field that moves it**, a genuine two-way coupling (the only one in this cluster besides LIFE/ferro).
- **State:** built & live. With no sampler attached, the knob medium runs exactly as originally shipped — trajectory goldens held bit-for-bit.
- **Risks:** per-pair sampling is O(contacts), bounded by the dish's caps.

---

## E. Takes, GPU sim backends, personas

### 54. Takes — performance file, capture, playback
A take *is* a performance, replayable exactly: not a recording of pixels, but the live resolver's recorded input sequence, re-run through the same resolver.
- **Files:** `gl/performanceFile.mjs`, `gl/performanceCapture.mjs`, `gl/playback.mjs`, `gl/resolveTap.mjs`, `engine/kernel/replay/inputLog.js`; the kernel golden harness (`engine/kernel/replay/replayer.js` + goldens) survives from the deferred design doc, whose separate headless pipeline was superseded (its own 2026-10-11 status line) because the instrument was already deterministic.
- **Clock/driver:** frame-indexed, never wall-clocked — one recorded input per *resolved* frame; pause holds both cursor and picture. Seek = fresh resolver + resolve every frame before the target without presenting ("a checkpoint is a hash, not a snapshot" — there is no shortcut).
- **Verification, not assumption:** every frame's resolver output folds into a running hash chain (raw IEEE-754 bits, two 32-bit lanes), checkpointed every 60 frames; replay must land on every checkpoint. Capture costs ~0.1–0.3 ms/frame, is off until started, **restarts the scene** on start (a mid-session take could not replay), and caps at 20 min at 60 fps. File = gzip(JSON), ~100 KiB/min compressed. Format `PERFORMANCE_VERSION = 3` — v2 retired with **no legacy replay path** by the #2178 clean-break ruling. (`state/history.js` is not part of this system — it's the bounded undo stack for discrete edits.)
- **Personas during playback:** muted (the app's frame tap is skipped); their recorded decisions ride the recorded inputs.
- **State:** built & live.
- **Risks:** **machine keys are the honest crack** — `MACHINE_KEYS` (quality, perfTier1, assetThin, slowRender, reducedMotion, canvas, device class…) are recorded as a *note*; verification replays them as recorded, but any future playback must take them from the machine doing the playing, and `slowRender` conflates the governor's state with the artist's PAUSE — a named known limit in `performanceFile.mjs`. Seek cost is O(frames): a 20-minute take seek is a 72,000-frame re-resolve (INFERENCE: multi-second on iPad-class hardware; no snapshot shortcut exists by design).

### 55. Take side-sections — routes, gestures, spectrum, world, retro ring
Everything that lives *beside* the resolver is recorded by frame so playback hears and freezes exactly as the live run did: the route table (`routeRecord`), ACCUM gestures FREEZE/CLEAR/SWELL (`gestureRecord` — re-emitted on the bus at their frames with cause `'playback'`, through the same subscriber path, and the recorder ignores cause `'playback'` so a take can never record its own playback), spectrum rows (§48), and the world record (#2104). Frame-indexed change lists, each capped at 2,000 entries, fail-closed shape-checked on load; a malformed/absent section degrades to pre-section behaviour, never a crash. The **retro ring** (always-on) lets a moment be saved after it happens — but **carries none of the side-sections**, so retro saves are measurably less faithful than deliberate takes (a retro save won't freeze/warp like the moment did). Playback asserts the take's freeze state at load and at every seek.
- **Files:** `gl/routeRecord.mjs`, `gl/gestureRecord.mjs`, `gl/spectrumLive.mjs` (playback half), `gl/retroCapture.mjs`, `gl/performanceCapture.mjs`.
- **State:** built & live. **Risks:** the deliberate-vs-retro fidelity asymmetry is real and documented — a user can trip on it.

### 56. GPU sim hosts + the `simLaw` stamp — the Full WebGL ruling in code
"Full means the sims too — takes become per-device" (#2180 program; Option 2 ruling, 2026-11-14), implemented as: GPU kernels may run the sims (fluid/culture/swarm/contacts, §34/§37), and the take records *which implementation ran each kernel*.
- **Files:** `engine/kernel/simBackends.js`, the four hosts in `gl/`, stamp in `gl/performanceFile.mjs`'s header.
- **How replay stays honest:** hosts hand results to the resolver as **recorded inputs** (async readbacks into pixel-pack buffers behind fences, never blocking; newest completed readback wins; an epoch counter discards pre-reseed results). The readback then rides the take (`input.dishFluidCells`, `input.dishCultureCells`, `input.dishContactStamps`), so replay needs no GPU and replays anywhere — the CPU resolves exactly the recorded field. Synchronous readPixels paths exist only in tests/cost bench and export/capture. The stamp: `simLaw = 'js-exact'` when every kernel ran in JS, `'decisions-exact'` when any ran on GPU — "decisions exact; sim outcomes the recording device's." A take naming a backend this build cannot run is **reported, never silently re-run**; swarm is the sharp edge — a `gpu.swarm.v1` take's replay runs the *JS* swarm, so its outcomes are the recording device's by design.
- **State:** built & live, **opt-in per kernel** (layout params / `window.__KC_GPU_*` flags / URL asks); all-JS remains the default. The resolver + contract stay CPU, per the ruling.
- **Risks:** bit-exact cross-device replay is now *given up for sim outcomes* while decisions stay exact — any blanket claim that "takes replay bit-for-bit" is only true for all-JS takes and the recorded-field kernels. Async readback (1+ frames) means the resolver consumes a field behind the live sim — a coupling lag the JS path doesn't have. RGBA32F readback hard-gates these kernels on float-render-target support. Doc drift: `simBackends.js`'s header ("Every kernel is JS today; the GPU fluid is not wired") contradicts its own runnable-backend tables and the live wiring.

### 57. The Queen — channel & sway
Sways, never decides: small, capped, relaxing biases on existing parameters, anchored in the artist's own keeps. She is never named on any surface.
- **Files:** `personas/queen.mjs` (record), `curator/queenChannel.js`, `curator/queenLean.mjs`, `curator/director.js` (`deriveSway`/`applySway`), `curator/paceLive.js`, `curator/leanLive.js`, `curator/swayView.mjs`.
- **Clock/driver:** phrase/bar boundaries (`PHRASE_BARS = 4` bars of the musical clock); relaxations on loop time (2.5 s; one phrase). Gates: a compile-time constant `GATE_OPEN = true` (flipped by PR, never at runtime) AND a trained head at ≥ minimum fidelity AND ≥ 8 keeps — below that, identity.
- **Moves:** **no per-frame motion, and nothing renders.** Her hands: rank bias at CURATOR pick time (≤ one adjacent top-3 swap, never demotes); temperature at Director pull time; palette drift toward the kept palette; beat-sway (phrase arm ≤40 ms early); lean-in (reactivity gain easing over a phrase on audio/MIDI return); **pace** — once a phrase she eases the BEAT BPM a small step toward a confident detected tempo (any artist BPM change silences her); **dial lean** — *in silence*, once a phrase, she steps the WETNESS and EVOLVE dials toward her validated read, and a hand on either dial releases her.
- **State:** built & live in the forms above — with one wart: `queenChannel.hiddenBias()` is an **inert stub** that ignores its inputs and returns neutral even with the gate open; the live sway flows through `queenLean`/`director`, not through it. Two parallel "queen" surfaces invite future wiring mistakes.
- **Risks:** none perf; honesty/maintenance only.

### 58. LOIS / DAVIS real-time adjustment — Director, trio, review ladder, room codes
Personas continuously retune the instrument — but at *decision* cadences, never per frame. This is the #2151 bound implemented as architecture.
- **Files:** `curator/director.js`, `curator/trioLive.js`, `curator/mindConduct.js`, `curator/fieldReviewLadder.mjs`, `curator/{loisRank,loisCut,davisShift}.js`, `curator/mindLive.js`, wiring in `App.jsx`.
- **The hands:** **Director/CURATOR pull (deal time)** — picks candidates, applies sway-adjusted gains/temperature; LOIS ranks and can cut; Davis shifts creature traits *once at birth* (recorded as `dishTraits`). **Davis trio (phrase time, while audio is live)** — edits the *audio route table* inside clamps, never on a target the artist touched, only at an earned presence tier; every edit is announced and handed to the take recorder — this changes per-frame motion *indirectly*, by rewriting §46's routes. **Field-review ladder (deal-commit time)** — acts inside `landPoem`: repairs or CUTs the landed poem in the same commit that deals it; the visible glide is §44's morph. On type, LOIS/DAVIS only ever act through this ladder and the treatment doctrines — they REQUEST revisions; they do not reach into standing type per frame. **Room codes (per frame, read-only)** — the loop stamps `room: readRoomCodes()` (Lois's face + Davis's state) on every resolver input; creature rigs walk Lois's gait and wear Davis's deal from it — the closest thing to per-frame persona influence, and it is a *code read by the creature system*, recorded in the take. **Mind faces (once a bar)** — "decisions are telemetry and recorded in a take; rules never request a stage change."
- **Interactions:** every persona effect that matters is funnelled into (a) store/document writes at commits or (b) recorded resolver inputs — precisely why takes replay persona behaviour. Playback mutes all of them. Verified by grep: the only persona reads in `liveLoop`/`liveResolve` are `room`, `dishTraits`, and the Queen's surge stamp — all recorded inputs.
- **State:** built & live.
- **Risks:** cadence discipline is the thing to guard — any future per-frame persona write would silently break take determinism. None exists today.

### 59. The persona band — solos / trades on a phrase clock (P7, #2387)
As spec'd in the tuning schema: seats (LOIS/DAVIS/QUEEN/GOVERNOR/CARSON/GREIMAN/ASHWORTH) would solo for a number of phrases, answer in an order, and trade at a rate under a bandleader's cut.
- **Files:** `personas/tuning.mjs`, `personas/tuning.json`, `personas/registry.mjs` (seat roles only).
- **State: SPEC-ONLY / UNBUILT — confirmed with unusually clean evidence.** `tuning.json` ships `band: {bandleaderCut: null, maxHornsPerCall: null, tradeRate: null}` and, for every seat, `soloLengthPhrases: null`, `answersFirst: null`, `heat: null`, all odds null, and **all 42 relation entries null**. `tuning.mjs`'s header states it outright: the band fields "ship null: the band is a later phase… **Nothing reads them yet**," and the validator forbids editing a null leaf in the DEV rig ("the rig tunes ruled numbers; it does not invent rulings"). Seat *roles* exist as display labels (LOIS 'ARRANGER · COVER', DAVIS 'LEAD SOLOIST · OVERLAP', QUEEN 'RHYTHM SECTION', GOVERNOR 'BANDLEADER') — labels, not mechanics. There is no band clock, no solo rotation, no trade mechanism anywhere in `app/src`.
- **Risks:** none to the running instrument. Planning risk: any text that treats the band as existing infrastructure (e.g. the Queen record's line about swaying "the whole band's timing") describes a system with no code behind it. The band's numbers are Matt's to rule, or P7's to propose — nothing may read a null field before then.

### 60. Scanography (#2252)
As ruled: a global FX-stratum smear driven by the stage's own motion vectors — one feedback buffer, three knobs (Exposure, Displacement, Scan).
- **State: SPEC-ONLY — confirmed not built.** Grep for `scanograph*` over `app/src` **and** `docs/` returns **zero hits**; no module, layout keys, FX kind, shader, selfcheck, or design doc in the repo carries it. The ruling/spec live outside this tree (issue tracker / goal files).
- **Nearest neighbours, all distinct:** ACCUM slit-scan (§50 — per-column *time* selection, dial-driven, fixed ramp); velocity smear (§51 — per-instance quad stretch, no feedback buffer, no global pass); WET soak smear (§52 — re-sampling along the *wet field's* velocity, a fluid sim's velocity, not the marks' motion vectors); ACCUM feed (§50 — feedback advected by an in-shader *noise* field, not measured stage motion).
- **Build note for whenever it's ordered:** it would need a stage motion-vector *field* that does not currently exist as a texture — `velocitySmear`'s per-instance `vx/vy` are packed into the instance buffer for the quad shader only. The only fullscreen feedback substrate available to reuse is ACCUM's half-res pair — and building inside ACCUM would inherit ACCUM's per-frame (not per-second) time base (§50).

---

## Findings & risks, ranked by severity

**S1 — Frame-rate dependence in the systems the iPad will feel most.**
Three families: (a) *frame-counted* subsystems — dish-creature XPBD (§22), ALife ticks (§23), moth growth/flourish/steering (§21) — run at wall speeds proportional to refresh rate; a take replays frame-for-frame but plays at different wall speed at 30/60/120 Hz. (b) *Per-frame* presentation math — ACCUM decay (§50), spectrum-warp spin/zoom (§48), velocity smear (§51) — makes the same performance *look* different at 120 Hz vs 60 Hz (trails half as long-lived, smear half as strong). (c) The particle integrator (§35) steps once per frame under a 50 ms clamp. The clocks/ballistics/breath core is dt-correct; the edges are not. On the target hardware (120 Hz iPad ProMotion), all of this is user-visible. None of it is a replay bug — it is a *feel* divergence between devices, which for a feel instrument is the bug that matters.

**S2 — The ferrofluid clump body is still drawn, against a direct ruling.**
§33: the GPU field-body channel seats thousands of pool-vocabulary assets as the fluid's visible mass. Matt ruled the opposite on 2026-11-16 ("I don't want those clumps"; one intrinsic kind of thing on stage), and `one-force-seam.md` slice 2 orders the retirement once mark drift reads as fluid. Drift shipped (§32); the retirement didn't. This is the audit's clearest code-vs-ruling contradiction.

**S3 — Life is still drawn in the live default path.**
§28: quiet mode emits up to 64 cell-derived specks. Small, faint, tertiary — but #2152's law is "Life is NEVER DRAWN," and the seam spec's slice 4 (retire visual mode + specks) is unbuilt. The visual mode proper is dormant (no live stamp producer), so the exposure is the specks, plus dead-weight draw code that a legacy/replay stamp can still reach.

**S4 — #2152's death mechanism differs from the ruling.**
§30: death is a stateless function of the *cell's* decay state; the ruling describes an *asset* standing on dead ground *too long*. If Matt's intent is the dwell reading, the current seam law (consumers stateless, field carries all history) cannot express it — that would be a design change, not a knob. If the cell reading is accepted, the ruling text should be amended so the next builder doesn't "fix" conforming code.

**S5 — `phrase:<id>` bone sources can never fire.**
§19: grammar + spec + selfcheck all say lawful; a registry ID mismatch (`phrase:` vs `kineme-phrase:`) makes resolution impossible, silently. Either fix the id or strike the grammar — the current state is a trap for the Motion Core adapter work (#2180 era), which will read the grammar as capability.

**S6 — iPad cost concentration is CPU-side, and one number is unverified on hardware.**
The vortex wet field measures ~6.6 ms/step on sandbox hardware (§39) with its real-device confirmation (#1695) still pending in-code; add the wet-look fullscreen pass (§52), per-frame creature/beast expansion + posing (§§20–24), travel (§18), and particle neighbour loops (§35). GPU-side, the field-body channel's thousands of instances (§33) and fullscreen FX passes (§49) lead. The governor (§4) will shed its way out — at the price of S1's cousin: on the weakest hardware the instrument sheds toward cut 6, the sanctioned freeze, i.e. "never static" fails exactly where the target device is weakest (INFERENCE about likelihood, not a measurement).

**S7 — Clock divergence between the two anchored clocks.**
`kinemeTime` receives the audio rate route; `driverSec` does not (§§11/17). With the `kinemeRate` route assigned and non-zero, shader kinemes and CPU drivers run at different rates — e.g. a moth's hover (driver clock) and its parts' kinemes (kineme clock) sit on different clocks in the same scene. Found by reading both call sites (motion-map audit, older head; structure unchanged at this HEAD); not re-run with the route assigned.

**S8 — Takes: the fine print is honest but real.**
Machine keys recorded as a note, `slowRender` conflating governor state with the artist's PAUSE (§54); retro saves lacking all side-sections (§55); seek = full re-resolve (§54); FX rasterization excluded from the determinism contract (§49); GPU-backend takes are decisions-exact, not outcome-exact (§56). All disclosed in-code — the risk is only that "takes replay exactly" gets quoted without its conditions.

**S9 — Vocabulary collisions as a standing hazard.**
Two "amount" laws ([0,2] bones vs 0..1 drivers), two "gaits" (LOIS_GAITS vs kc-gait/1), three "Lifes" (culture, LIFE dial, Conway CA), two "weathers" (+ a seam named for one of them), four "dishes," three "densities." Each file disambiguates locally; nothing disambiguates globally. S5 is what this hazard costs when it bites.

**S10 — Dead and dormant weight.**
`beastBuilder` (dead), `beastMotion` (stub), `robot`/`lsystem` (no caller), `beastTrails.writeTrail` (placeholder), `queenChannel.hiddenBias` (inert), `fxTrack` family bindings (dead data), `dWobble` (computed, unapplied, and its boil clock is built at 0 with no setter), Dish Life visual mode (dormant), the boil time base generally. Individually harmless; collectively they are the map a future agent will misread.

**S11 — Stale documentation (docs say the opposite of the code).**
`dish-life-on-assets.md` ("Nothing here is built" — all three slices shipped); `figures-spec.md` ("SPEC ONLY — nothing is built"); `strandbeest-epic-spec-2026-10-29.md` ("not filed, not scheduled" — S1–S5 shipped); `kineme-stacking-spec.md` ("Status: spec" — live); `one-force-seam.md` (retirements described, not done; duplicates cap misstated as 256 vs code 64); `motionCore/index.js` + `kinemeSources.js` headers ("NOTHING CALLS THIS YET" — wired); `simBackends.js` header ("the GPU fluid is not wired" — wired); `dish-strata-sketch.md` (live caller "Missing" — wired). The repo's own convention says where doc and code disagree, code wins and the doc is the bug — by that convention these are eight-plus doc bugs, two of which (dish-life, one-force-seam) invert the truth in opposite directions.

**S12 — Mutual awareness (#1183 / #2104): mostly kept, with named blind spots.**
Kept: creature/beast parts are honest CONTENT instances (governor, atlas, takes all see them); the ferrofluid pulls bones/bars and breaks constructs; the culture breathes/fades/births marks; the wet field and the dish medium are genuinely two-way; persona effects funnel into recorded inputs. Blind: the Conway CA (fully); the particle dish ↔ field dish pair (no data path either way); the vortex ↔ culture/fluid pair; GPU kinemes/phrases animate marks with no knowledge of poem or creatures (parts inherit awareness only *after* expansion); GAIT break-up reads the fluid but neither Life nor the poem; the coarse audio path and the band path never read each other; the layer ROTATE spin does not reach creature parts (motion-map probe, older head, untested by selfcheck).

---

## Open questions — where the code's intent is genuinely ambiguous

1. **Dish Life visual mode:** retired in intent (seam slice 4) or kept deliberately as the replay path for legacy stamps? No live producer stamps it, but the draw path is fully maintained code.
2. **#2152 death:** is cell-decay death the accepted reading of "standing on dead ground too long," or is a per-asset dwell timer actually wanted? The two readings need different machinery (S4).
3. **`phrase:<id>` on bones:** fix the registry id so phrases can drive bones (the spec's stated intent), or strike `phrase:` from the bone grammar (the contract code's de facto position)?
4. **`window.__KC_BEAST_ROAM`:** is the roam override folded into the recorded doc (and thus into takes) or is it a live-only back door? Not verified either way in this audit.
5. **ACCUM time base:** should trail decay become per-second (dt-corrected)? That would make 60 Hz and 120 Hz agree — and would change the trail feel on today's 60 Hz machines too. A ruling, not a fix.
6. **The kineme/driver clock divergence (S7):** is the audio rate route *meant* to move only the shader kinemes? If the two clocks are supposed to be one tempo, `driverSec` is missing the route; if they're meant to differ, the difference deserves a name and a doc line.
7. **The boil time base:** `boilStep` is built at 0 in the live context with no setter found, and its only consumer (`dWobble`) is unapplied. Is boil a parked feature or an abandoned one?
8. **GPU sim defaults:** the GPU hosts are all opt-in flags today. Is the #2180 program's intent that they become defaults per device class at some point, or permanent opt-ins? The code supports either; nothing states the end state.

---

## What this audit did not verify

- **Nothing was executed.** No canvas was run, no selfcheck was run, no screenshot taken. Every claim is from reading code, comments, selfcheck *source*, and design docs at the stated HEAD. Behavioural claims that rest on a prior probe (the ROTATE-spin/parts finding, the clock-divergence finding) are labelled with their provenance (motion-map audit, head `2a1c7ba`) and were not re-run.
- **No iPad measurement exists in this report.** Perf figures quoted (~6.6 ms vortex step, ACCUM pass counts) are the code's own cost registrations / header measurements from sandbox hardware. Real-device numbers are, per the code itself, still pending (#1695).
- **Line numbers** are as read at this HEAD and will drift; file paths and symbol names are the durable references.
- **GitHub issue state was not re-checked** for the issues cited (#2152, #2178, #2180, #2252, #2387…); build state claims rest on code evidence, which for the band and scanography is unambiguous (null fields / zero references).

*End of audit. Read-only: no files in the repo were modified; the audit worktree was removed after delivery.*
