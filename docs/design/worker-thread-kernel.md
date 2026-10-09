# DESIGN (deferred) — Worker-thread kernel

## Goal

Run the kernel simulation off the main thread. Main thread keeps
React/UI and the WebGL render loop; a worker owns the dish instance
and runs placement plus the per-frame step, shipping transferable
buffers to the renderer. The iPad smoothness story: the UI thread
never janks on a heavy sim frame.

## Why later (deferred)

Three prerequisites, all open today:

1. **SoA buffers.** Transferables must be flat typed arrays. Today's
   object graphs would cross the boundary via structured clone, whose
   cost defeats the entire purpose. SoA first, worker second.
2. **Kernel purity.** The kernel research found `field/scent.js`
   importing `registerCostTier` from `gl/costTiers.mjs` — a kernel→gl
   dependency. The worker cannot import the render layer, directly
   or transitively. Idea #9 (invert to a kernel-local cost registry
   that gl reads) must land first, and the whole kernel needs a
   "no DOM, no gl, no React" lint gate before the worker is real.
3. **Fixed execution order.** The worker's step function is the dish
   §4 order (ground → features → samplers → fields → marks →
   weather). That order has to exist before the worker can run it.

## Proposed architecture

New home: `app/src/engine/kernel/worker/`.

- `kernel.worker.js` — worker entry. Owns one dish instance. Runs
  `dish.step(dt, events)` per frame. Writes results into one of two
  frame-buffer sets (double-buffered SoA columns).
- `protocol.js` — the message contract, versioned:
  `INIT { seed, recipe, params }` → `READY`,
  `STEP { frame, dt, events[] }` → `FRAME { buffers, transfers }`,
  `SET_PARAM { key, value, frame }`, `SNAPSHOT { atFrame }`.
  Every input event carries a **frame index, never wall-clock time** —
  cross-thread timing is quantized or determinism dies.
- `kernelClient.js` (main thread) — posts `STEP`, receives `FRAME`,
  hands the transferred ArrayBuffers to `gl/liveResolve.mjs` with
  zero copy. Owns the fallback: `runInline: true` runs the same
  step function on the main thread (dev, tests, no-Worker
  environments) — one code path, two hosts.
- Frame pacing: worker steps on rAF-driven messages from the main
  thread (main thread stays the clock owner — avoids two clocks
  drifting). Backpressure: if the worker hasn't returned `FRAME`
  for frame N, the renderer re-presents frame N−1 once, then sheds
  (governor tiers apply — a slow worker frame is a shed signal,
  not a freeze).
- Audio: `audioEnergy` and friends are analyzed on the main thread,
  quantized per frame, and posted as data in `STEP.events`. The
  worker never reads live audio (extends the idea #22 discipline:
  aggregate draws must not depend on unlogged history).

## Dependency on the dish core

The dish module contract is what makes the worker tractable: every
module declares `reads`/`writes`/`costTier`, so the transfer manifest
— exactly which dish keys cross the thread boundary per frame — is
derivable from the registry instead of hand-maintained. The dish's
purity rule (§2, pure functions where possible) is the worker-safety
rule. Seeded RNG discipline (§2, streams via ctx) is what keeps the
worker bit-identical to inline mode.

## Effort

L. The protocol, the double-buffering, and the determinism
selfchecks are the work; the sim code itself mostly moves.

## Risks

- **Determinism across the boundary.** Two failure modes: wall-clock
  leaking into events (mitigated: frame-indexed protocol, asserted
  by a selfcheck that rejects events without frame numbers), and
  structured-clone of anything non-transferable (mitigated: protocol
  asserts every `FRAME` payload is in the transfer list; a clone
  fallback throws in debug builds).
- **Byte-identical law.** Worker output must be bit-identical to
  inline output. `kernelWorker.selfcheck.mjs` runs N frames both
  ways from the same seed and compares hashes — this selfcheck is
  the gate, not a nice-to-have.
- **Debuggability.** Worker stack traces and breakpoints are worse.
  Keep `runInline: true` as the debug default; the worker is a
  deployment mode, not the dev loop.
- **iPad WebView workers.** Verify Worker + transferables in the
  target WebView before committing — no surprises late.

## Unlocked after it

True main-thread isolation (the UI budget stops competing with the
sim budget); headroom for heavier dish slices; replay becomes
natural (the event stream already exists — log it); and the
sim can later move to a second worker pool or offscreen canvas
without re-architecting.
