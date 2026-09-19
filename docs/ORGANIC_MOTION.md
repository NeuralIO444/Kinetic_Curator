# Organic motion — smoother, heavier live animation

*Review of main as of 2026-09-19 (`653a66a`). Plan, not a patch. Companion to [BIO_DRIVES_PLAN.md](BIO_DRIVES_PLAN.md), [DAVIS.md](DAVIS.md), [SHOWRUNNER.md](SHOWRUNNER.md).*

The instrument already has a real motion stack: one WebGL loop, a SoA boid integrator, audio ballistics, voice MIX, palette dissolve, morph ease. The remaining mechanical feel is not a missing FX pass. It is **frame-rate-coupled physics**, **a single-sine life LFO**, **raw audio into scale**, and **mid-morph integer pops**.

Standing bars, same as bio-drives: systems that build systems, no new panel, and the Oxman gate — *does it grow, or does it stamp?* Smoothness that is a blur shader is a stamp. Smoothness that is a clock and a spring is a system.

## 0. Ground truth

Verified against `app/src` on main:

- **`gl/liveLoop.mjs`** — rAF loop reads Zustand + `lifeRef` directly. No React per GL frame. Breath, zoom, and pan are applied to instance coords on the CPU before `renderFrameInto`. Atlas bake holds the last frame. ACCUM swell is a 2s sine from wall-clock.
- **`gl/liveResolve.mjs`** — live swarm calls `ParticleSystem.update(..., Date.now(), ...)`. Field / feed patches clamp hops to `HOP_MAX_PX = 4`. Pause and the governor's `slowRender` freeze the integrator.
- **`engine/particles.js`** — Euler step with **implicit dt = 1**. Velocity: `(v + a) * damp`. Caps: `MAX_SPEED_CLOUD = 8`, `MAX_SPEED_MOTH = 1.65`, `MAX_TURN_DEG = 10` per tick, `BOUNCE = 0.62`. Clouds wrap; organisms bounce. Rotation snaps toward velocity heading. Bio-drives (`energy`, `drive`, scent, graze) already modulate forces — they sit on a frame-locked integrator.
- **`engine/organisms/behave.js`** — weight rows only (`cruise / flock / orbit / scatter / mold`). No new force types needed for feel work.
- **`hooks/useCanvasLife.js`** — `lifeT` is React state. Breath is one sine at `0.8` and one at `0.35`. `scaleMul` / `alphaBoost` read **raw** `beatPulse` and bands. `frameLock` ticks life at 30Hz while GL can still run at 60.
- **`gl/audioBallistics.mjs`** — the right envelope follower (25ms attack / 320ms release / `x²`). Used on the ACCUM mapping path. **Not** wired into `useCanvasLife`.
- **`hooks/useMorphEvolve.js`** — cubic ease-in-out, then `.toFixed(3)` every frame. `count` / `particleCount` / `jitter` / `density` **round mid-morph**. Help copy is honest: seed and palette still snap unless VJ MIX is on.
- **`data/voices.js`** — numbers lerp; enums / assets snap at `t = 0.5`. Palette tokens lerp in sRGB hex.
- **`gl/paletteMix.mjs`** — two-deck GPU dissolve with smootherstep. The model to copy.
- **`layoutSlice.js`** — `motionSmoothing` defaults true and is **never read by the renderer**. A dead feel knob.

Already good, do not rebuild: palette dissolve, ACCUM swell envelope, silence-is-a-no-op on audio, index-stable kernel, bio-drive columns, velocity smear while ACCUM is active (`attachVelocities`).

## 1. Why it reads mechanical

| Symptom | Cause |
|---------|--------|
| Flock speed and weight change when FPS drops | Damp, turn, flap, and bounce are per-frame, not per-second. `0.95^30 ≠ 0.95^60`. |
| Agents steer like steppers | Heading snaps to `atan2(vy, vx)` or clamps 10°/frame. |
| The plate inhales as one object | Global `sin(lifeT * 0.8)` with no per-agent phase. |
| Hits click scale/alpha | Raw pulse into `useCanvasLife`; ballistics never reach the visible gesture. |
| Morph stutters population | Integer params round every tick; agents spawn/die mid-ease. |
| Voice MIX pops geometry | `mode` / `behave` / assets cut at the midpoint. |
| 30Hz stair on breath | `frameLock` updates `lifeRef` at half the GL rate. |
| Tab-switch jumps the flow field | Noise time is `Date.now()`, not loop time. |

Determinism is not the enemy. Hash-keyed noise and contacts can stay. Only the **clock** should be real time (live) or a recorded tick (bake / video).

## 2. The six changes that survive the bar

### 2.1 Time-correct integration — the substrate

- **What:** pass `dtSec` from `liveLoop` → `liveResolve` → `ParticleSystem.update`. Clamp to ~8–50ms so a tab-switch does not explode the step. Convert authored per-frame constants to per-second at 60Hz reference:

  ```js
  const dt = Math.min(0.05, Math.max(0, dtSec));
  const dampNow = Math.pow(Math.pow(damp, 60), dt * 60);
  vx[i] = (vx[i] + ax[i] * dt * 60) * dampNow;
  const maxTurn = (MAX_TURN_DEG * Math.PI / 180) * (dt * 60);
  ```

  Same treatment for bounce, flap phase, scent step, energy drain. Stop passing `Date.now()` as sim time.
- **Touchpoint:** `particles.js` update signature; one clock in `liveLoop.mjs` (`performance.now()`). Studio bake already thinks in step counts — live should too.
- **Better later:** fixed 1/60 (or 1/120) inner step with an accumulator. Display frame stays pointer-responsive; sim stays deterministic. Live and `studio.py video` share a clock.
- **Gate:** until dt is real, every easing tweak still wobbles when the governor sheds.

### 2.2 Critically damped heading — bodies, not steppers

- **What:** exponential (or spring) smoothing on heading instead of snap-to-velocity.

  ```js
  function dampAngle(cur, target, lambda, dt) {
    let d = target - cur;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return cur + d * (1 - Math.exp(-lambda * dt));
  }
  ```

  Cruise / flock: `lambda ≈ 8–14`. Scatter / moth flap: higher, plus a small hash-keyed wander on the *desired* heading. Bank `scaleX/Y` a few degrees from yaw rate so turns lean.
- **Touchpoint:** the rotation block already in the integration loop. `MAX_TURN_DEG` stays as a **deg/second** limit, not deg/frame.
- **Peppered:** `motionSmoothing` becomes the global lambda scale. The knob already exists; wire it.
- **Gate:** one function, every organism. No new force type.

### 2.3 Layered life, driven from the GL loop

- **What:** stop `setLifeT` every frame. Drive `lifeRef` from the loop. Breath is incommensurate layers plus lag, not one LFO:

  ```js
  const raw =
    0.55 * Math.sin(t * 0.73) +
    0.30 * Math.sin(t * 1.19 + 1.7) +
    0.15 * Math.sin(t * 0.29 + 4.1) +
    0.08 * noise2(t * 0.15, seed);
  ```

  Critically damp `breathScale` / `breathRot` toward that target (`ζ ≈ 1`, `ω ≈ 6–10` for body, faster for glow). Offset each agent with the existing `seedOffset` column so the field does not inhale as one object.
- **Touchpoint:** `useCanvasLife.js` keeps a 4–10Hz React tick for meters only. The loop owns the springs.
- **Composes with:** bio-drives swell (#287) — energy already wants to scale breath amplitude. This is the missing clock for that line.
- **Gate:** life that is a sine is a stamp. Life that is layered noise + a spring grows.

### 2.4 Ballistics on the *visible* audio path

- **What:** run `processBallistics` on `{ rms, bass, mid, flux, beatPulse }` with loop dt **before** `scaleMul` / `alphaBoost` / glow. Keep the ACCUM silence-is-zero contract.
- **Mapping:** envelope *level* → scale / glow; envelope *velocity* → flap / smear. Attack becomes a shove, not a resize.
- **Voices:** peak-hold + short release for HYPE / Chrome Parade; exponential + 400–800ms release for MURM / Deep Water. Defaults stay `attackMs: 25`, `releaseMs: 320`, `curve: 'exponential'`.
- **Touchpoint:** one follower state beside the live loop; `useCanvasLife` reads the shaped sample. No new slider if voices pin the curve.
- **Gate:** the follower already exists. Wiring it is the work.

### 2.5 Morph without quantization pops

- **What:** drop `.toFixed(3)` while `t < 1`. Do **not** round `count` / `particleCount` until the morph lands. Keep a float target; fade alpha on agents that will vanish. Reuse `mixEase` from `paletteMix.mjs` (smootherstep) instead of only cubic.
- **Voice MIX:** for `blendSeconds`, crossfade two resolved layers rather than snapping `mode` / `behave` / assets at 0.5. Night Migration (4s) and Deep Water (10s) suddenly feel finished. Token lerp that is not a GPU dissolve should move in OKLab or linear light, not sRGB hex.
- **Touchpoint:** `useMorphEvolve.js`, `mixVoiceState` in `voices.js`. Seed snaps stay a performance gesture.
- **Gate:** a morph that respawns the cast every few frames is a stamp of the destination. A morph that eases population is a dissolve.

### 2.6 Soft edges — collisions, wraps, hops, smear

Cheap perceived smoothness. No new renderer.

| Current | Organic |
|---------|---------|
| `BOUNCE = 0.62` instant flip | Lose normal speed with restitution, keep tangent; 1–2 frames of squash on `scaleX/Y`. |
| Cloud wrap ±120px | Fade alpha out near the edge, respawn faded in — or a 16px torus blend. |
| `HOP_MAX_PX = 4` | Keep the cap (stops teleports); ease the residual with the heading spring. |
| Contact depenetration in one pass | Split correction over 2–3 steps; impulse only on approaching `vn` (events already gate on `vn < 0`). |
| Attractor gain `8` | Soft well: force `∝ r / (r² + r0²)` so the cursor is a tide. |
| Velocity smear ACCUM-only | 0.5–1.5px quad stretch on the live path; `attachVelocities` already tracks `vx/vy`. |
| Breed / die pops | Newborns already start `alpha = 0` — lerp alpha and scale over 200–400ms. Deaths fade. |

Governor: shed resolution and count **before** motion freeze. If integration must freeze, keep life springs running. Frozen sim + live breath looks broken.

Atlas bake: keep drawing motion on existing combos while new ones bake, or prefetch combos when a morph starts. Holding the whole frame is a hitch.

## 3. Killed

- **A motion tab / easing graph editor.** Kitchen sink. Feel knobs that exist (`motionSmoothing`, ballistics, morph duration, lifeDrift) get wired; no new surface.
- **Per-agent IK, cloth, or a second physics world.** The integrator is the one body. Heading springs and contact already occupy space.
- **Motion blur as a fullscreen FX.** A stamp. Quad smear along `vx/vy` is the system version and already half-built.
- **Abandoning determinism.** `Math.random` / `Date.now` in the force pass would break bake hashes. Hash-keyed wander on desired heading is enough chaos.
- **Rewriting behave profiles.** Weights are fine. The clock and the heading are the problem.

## 4. Sequencing

1. **dt + exponential damp / turn** in `particles.js`; thread clock from `liveLoop` → `liveResolve`. Selfcheck: behaviour hashes at a locked 60Hz dt must match today's implicit step.
2. **Ballistics on life scale / alpha / glow**; move `lifeRef` off React.
3. **Heading spring + per-agent phase**; wire `motionSmoothing`.
4. **Morph without mid-lerp integer rounding; dual-layer voice dissolves.**
5. Soft walls, fade spawn / death, live-path smear.

First PR is step 1 + 2. That alone turns a stepper flock into a heavy fluid flock without touching look or seeds.

## 5. Acceptance

- [ ] Dropping from 60fps to 30fps does not change flock speed, turn tightness, or damping weight.
- [ ] A tab-switch gap does not jump the noise field or freeze a follower mid-value.
- [ ] Audio hits shove, then settle; silence is still a true no-op.
- [ ] Breath is readable as a field, not a metronome. Agents are slightly out of phase.
- [ ] Morph / voice MIX never pops `particleCount` mid-ease. Seed may still snap.
- [ ] `motionSmoothing` changes feel on stage.
- [ ] Bake / video at a fixed timestep still hash-matches the same seed + step count.
- [ ] No new panel. Governor cost model unchanged unless smear becomes a pass (then declare a tier).

## 6. File map

| File | Role |
|------|------|
| `app/src/gl/liveLoop.mjs` | Own the clock; write `lifeRef`; pass `dtSec`. |
| `app/src/gl/liveResolve.mjs` | Stop `Date.now()`; forward dt; keep `HOP_MAX_PX` as a cap. |
| `app/src/engine/particles.js` | dt integration, heading spring, fade spawn/death. |
| `app/src/engine/organisms/behave.js` | Unchanged except possible `lambda` column later. |
| `app/src/hooks/useCanvasLife.js` | Meters only; no per-frame `setLifeT`. |
| `app/src/gl/audioBallistics.mjs` | Already the follower — call it from the loop. |
| `app/src/hooks/useMorphEvolve.js` | No mid-lerp rounding; reuse `mixEase`. |
| `app/src/data/voices.js` | Dual-layer dissolve for enums. |
| `app/src/gl/velocitySmear.mjs` | Enable on the live quad, not only ACCUM. |
| `app/src/state/slices/layoutSlice.js` | `motionSmoothing` becomes live. |
