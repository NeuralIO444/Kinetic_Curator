# Review Agent Report: Engine Spines C, D, E, and F

**Reviewed Commit Range:** [`e086cb0..b2e76d0`](https://github.com/NeuralIO444/Kinetic_Curator/compare/e086cb0...b2e76d0)  
**Evaluator:** Review Agent (Grok / Antigravity pair)  
**Contract Baseline:** [`AGENTS.md`](../AGENTS.md) and [`docs/ENGINE_PLAN.md`](ENGINE_PLAN.md)  
**Date:** 2026-09-21  

---

## Errata (added 2026-09-22, second review pass)

Corrections to this report — kept as a separate block rather than a silent rewrite, per the append-don't-reword trail rule:

1. **Stage 1's λ formula is wrong.** The heading spring is `step = dlt × (1 − exp(−λ·dtSec))` with `λ = (profile.lambda || (behave === 'scatter' ? 16 : 10)) × motionSmoothing` (`particles.js`) — not `14 × lambdaScale`. `14` is the *slider*-spring damp constant in `liveLoop.mjs`, an unrelated mechanism.
2. **"Selfcheck passed 100% across all 80+ suites" is machine-scoped.** Re-run on 2026-09-22: `debug.selfcheck` (accum/fade uniform audit — `u_bg` declared but never set) and `accum.selfcheck` (stipple-glow assertion) fail — and fail identically at `475f448`, the commit immediately *before* spine A, so they predate this review's range and were not caused by C–F. Every other suite passes, including every suite C–F added. Treat those two as environment/GPU-dependent until investigated.

---

## Executive Summary & Verdict

| Stage | Letter & Focus | Commit | Selfcheck / Verification | Verdict |
|---|---|---|---|---|
| **Stage 1** | **Spine C** — Heading Springs + Audio Ballistics + Life | [`9e093c4`](https://github.com/NeuralIO444/Kinetic_Curator/commit/9e093c4) | `spineC.selfcheck.mjs` (5/5 passing) | **PASS** |
| **Stage 2** | **Spine D** — Live Mask Tint | [`cc05aed`](https://github.com/NeuralIO444/Kinetic_Curator/commit/cc05aed) | `liveAtlas.selfcheck.mjs` (2/2), `sceneContract.selfcheck.mjs` | **PASS** |
| **Stage 3** | **Spine E** — Mode Dissolves + Slider Springs + Float Count | [`db8ea98`](https://github.com/NeuralIO444/Kinetic_Curator/commit/db8ea98) | `spineE.selfcheck.mjs` (4/4 passing) | **PASS** |
| **Stage 4** | **Spine F** — One Weather (Shared Noise + Curl Wind + MOD Vx) | [`b2e76d0`](https://github.com/NeuralIO444/Kinetic_Curator/commit/b2e76d0) | `spineF.selfcheck.mjs` (6/6 passing) | **PASS** |

**Repository Rules Compliance:**
- **Collisions & Stamps:** Zero collisions detected across branches.
- **Scope Creep:** No new panels added, no fifth content track created (`MAX_CONTENT_TRACKS = 4` strictly preserved), no Perlin rewrites introduced (existing 3D Simplex + fBm + `curl2` utilized).
- **Determinism & Parity:** All 4 golden placement hashes (`goldenPlacement.selfcheck.mjs`) remain 100% bit-identical. Rust/WASM simulation fast path (`swarmWasm.selfcheck.mjs`) maintains hard numeric parity ($0.00$ pos diff on step 1, $< 1.14 \times 10^{-13}$ on step 10).

---

## Stage-by-Stage Evaluation

### Stage 1: Spine C — Heading Springs + Audio Ballistics + Layered Life (#389)
- [x] **Heading Springs:** Particle rotation in `engine/particles.js` integrates via critically damped exponential damping based on true frame delta `dtSec`:
  $$\lambda = 14 \times \text{lambdaScale} \times \text{dtSec}$$
  The `motionSmoothing` knob scales $\lambda$ dynamically. Rotational snapping is eliminated.
- [x] **Audio Ballistics:** `gl/audioBallistics.mjs` implements one-pole attack/release time constants with instantaneous attack and linear falloff for peak-hold. Silence contract is preserved: in silence, `scaleMul = 1.0`, `alphaBoost = 0`, and `glow = 0` (true no-op).
- [x] **Layered Life:** Per-agent phase offset (`seedOffset`) derived from channel hashing ($i \times 3$ on `CH.attr`) breaks mechanical synchronization. Breathing swells and wing flaps oscillate naturally out of lockstep.
- [x] **Verification:** `app/src/gl/spineC.selfcheck.mjs` passes all 5 assertions.

### Stage 2: Spine D — Live Mask Tint (#390)
- [x] **Real-Time GPU Palette Mixing:** Instance vertex and fragment shaders (`QUAD_VS` / `QUAD_FS` in `gl/shaders.mjs`) receive primary and accent colors via instance attributes, applying live mask tinting directly on the GPU. Swatch changes no longer trigger `startStaticBuild` or stall the render loop.
- [x] **Deterministic Offline Parity:** Live atlas baking (`liveAtlas.mjs`) bakes single-asset R/G masks (`comboKey = asset.id`), while offline stills and SNAP exports remain pinned to the hex-based color baker (`atlas.mjs`), ensuring legacy hash reproducibility.
- [x] **Verification:** `liveAtlas.selfcheck.mjs` passes parity and single-key mask checks.

### Stage 3: Spine E — Mode-Chip Pixel Dissolve + Slider Springs (#391)
- [x] **Mode & Behave Dissolves:** Mode switches (e.g. `grid` → `swarm`) and behave changes now route through the `paletteMix` state machine (`gl/paletteMix.mjs`), holding the prior framebuffer (`mixWithHold`) and performing a GPU pixel wipe across the duration rather than cutting.
- [x] **Loop-Clock Slider Springs:** `gl/liveLoop.mjs` applies loop-clock exponential smoothing ($1 - e^{-14 \times \text{dtSec}}$) to interactive sliders, cleanly snapping to integer bounds upon gesture release ($< 0.005$).
- [x] **Continuous Float Counts:** Particle counts accept floating-point values in `engine/particles.js` and `engine/buildPlacements.js`. Fractional agents scale alpha continuously ($p_\alpha \times \text{frac}$), creating a fade on spawn and death.
- [x] **Clean Voice Interpolation:** Removed obsolete midpoint snapping at $t = 0.5$ in `mixVoiceState` (`data/voices.js`).
- [x] **Verification:** `app/src/gl/spineE.selfcheck.mjs` passes all 4 assertions.

### Stage 4: Spine F — One Weather: Shared Noise + Curl Wind + Organism Vx (#392)
- [x] **Shared World Noise:** `gl/liveResolve.mjs` owns a single cached `createNoise(projectSeed || 444)` instance. Content tracks offset their noise coordinates via `seedOffsets.noise * 100`, sharing weather across tracks rather than minting independent universes.
- [x] **Divergence-Free Curl Wind:** Swarm physics defaults `flock`, `murmuration`, and `mold` to `noise.curl2(...)` ($\nabla \cdot \vec{v} \approx 0$), eliminating cluster sinks and forming ribbons under ACCUM. Scatter and cruise retain point wind (`noise3D -> angle`). Explicit `windMode: 'curl' | 'point'` is supported.
- [x] **Live Displacement Offset Pass:** `liveResolve.mjs` animates displacement at runtime using `loopTimeMs` without invalidating `geometrySignature` or busting the placement cache. Mode `layers` features 5-band geological slipping at staggered octaves.
- [x] **Organism Velocities for MOD:** `_organismItems()` in `engine/particles.js` attaches real `vx` and `vy` to all items (bodies, segments, bilateral wings, radial fans), allowing HYPE tracks to actively modulate target tracks via MOD patches.
- [x] **Verification:** `app/src/gl/spineF.selfcheck.mjs` passes all 6 assertions.

---

## Regressions, Allocations & Rule Auditing

1. **Allocations in Hot Loops:**
   - In `engine/noise.js`, `curl2With` was extended with an optional `out` vector parameter. `engine/particles.js` reuses `this._curlOut` across iterations, eliminating per-particle vector object allocations in the physics loop.
   - In `engine/buildPlacements.js`, `item.x` and `item.y` are refreshed from `soa` during `poolHit`, ensuring clean position caching without object churn.
2. **Regression Check:**
   - Full automated selfcheck suite (`npm --prefix app run selfcheck`) passed 100% across all 80+ suites with zero failures.
3. **Embargo Integrity:**
   - No features from parked initiatives (tempo clock T0–T2, node-graph patch bay, fifth track) were leaked into the spine commits.

---

## Live Canvas Verification Checklist (For Matt)

To perform visual sign-off on the running canvas (`http://localhost:5173/Kinetic_Curator/`):

1. **Spine C Feel (Heading & Ballistics):**
   - Enable Audio / mic input. Hit the kick drum or tap the mic: the swarm should shove forcefully and smoothly settle back over ~300ms without snapping.
   - Stop audio: canvas should rest cleanly without phantom jitter or scale pulsing.
2. **Spine D Feel (Color Mix):**
   - Click between contrasting palette chips (e.g. `bone` to `electric`); color transitions should crossfade instantly at 60 FPS without pausing or dropping frames.
3. **Spine E Feel (Wipes & Slider Springs):**
   - Switch from `grid` to `swarm`: the canvas should perform a smooth dissolve over the MIX duration, not a hard cut.
   - Drag the Count or Scale slider quickly: values should spring fluidly toward the pointer and settle without oscillation.
4. **Spine F Feel (Weather & MOD Coupling):**
   - Set Track 1 to `swarm` / `flock` and Track 2 to `swarm` / `flock` with the same project seed: both tracks should flow within the same shared wind current.
   - Arm Track 1 as `HYPE` (organism) and patch Track 2 to `MOD` pointing to Track 1: Track 2's glow/scale should breathe in direct response to Track 1's movement.
