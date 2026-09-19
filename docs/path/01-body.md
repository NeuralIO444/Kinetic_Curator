# 01 — Body

*The moth has mass. If it does not, nothing else is an instrument.*

Issues: #387 A, #389 C. Research: `particles.js`, `liveResolve.mjs`, `audioBallistics.mjs`, ORGANIC_MOTION §2.

## What exists

- SoA swarm + organism integrator. Damp / turn / flap are **per frame**, not per second. `update(..., Date.now())` for noise time.
- `MAX_TURN_DEG = 10` per tick. `motionSmoothing` default true, **unread**.
- `processBallistics({rms,flux,beatPulse}, dtMs)` exists. Silence snaps to 0. Wired first at ACCUM `applyAudioEnvelope`, **not** at visible `scaleMul` / `alphaBoost`.
- Life breath is one sine, pushed into the document from React ~30 Hz.
- Governor sheds FPS. Body changes character when it does.

## Research take

HYPE, OP-Z, and every analog visualist instrument share one rule: the creature does not get lighter when the room is expensive. Games solved this in the 2000s (`dt`, critically damped springs). KC-1 still uses Euler-at-60-assumed. That is why it feels like a demo on a bad frame and a different animal on a good one.

Ballistics without visible destination is a unused muscle. Hits that only bloom ACCUM do not shove the flock. Davis's live work reads as *bodies taking a punch*.

## Plan

1. `dtSec` from the loop. Per-second damp/turn/flap. Locked 60 Hz hashes match today (#387).
2. Heading spring. `motionSmoothing` = lambda. `MAX_TURN_DEG` becomes deg/s (#389).
3. `processBallistics` on the life path. Silence still 0.
4. Life phase owned by the loop; `seedOffset` per chest. Stop `setLifeT`.

## Sticky test

Night Migration at 30 fps and 60 fps is the same bird. A kick shoves, then settles. Tab-away does not teleport the field.

## Do not

WASM, compute particles, a motion panel, fixed-timestep accumulator in the same PR as A.
