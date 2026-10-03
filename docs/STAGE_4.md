# Stage 4 — agents on the GPU

**Status:** SPEC ONLY. No build, no issue, no pull request for the move. Written for Matt's approval — plain language, no code.

**Name.** [ROADMAP_V1.md](ROADMAP_V1.md) already uses Stage 4 for the v1.0 release. That stage stands. This note is the engine step after [STAGE_3.md](STAGE_3.md): transform feedback, once both fields are proven. It does not replace the release stage.

## Gate

This does not open until Stage 3 is live on the default loop. Scent deposits, diffuses, and decays. Swarm and trail sample one wind texture. Until that sentence is true, agents stay on the CPU and this file is a note.

## What it is

The integrator moves to the GPU. Position, velocity, and the seed fingerprint advance in a transform-feedback pass, or in a texture ping-pong if feedback is the wrong tool. One step. The CPU loop stops being the writer.

The hard part is not the draw. About ten readers still live on the CPU: neighbors, contacts, scent, leak, spine, morph-adopt, MOD, smear, FIELD/FEED, breed. Each one either moves onto the GPU with the agents, or reads back. A reader left on the CPU against a GPU writer is a split brain. That is the bug this spec exists to forbid.

WebGL2 only. WebGPU waits until this pass is not enough. No second pipeline.

## Determinism

CPU composition is deterministic. GPU least-significant bits are not, and they vary by vendor. The still path and the live path must agree within a written tolerance, or the GPU step is opt-in and the default stays the CPU integrator.

Same seed, same bake time, same fingerprints. Exports pass bake time, never `Date.now()`. A held loop does not walk the phase. Reruns match within the tolerance. A different seed diverges.

The tolerance is a number in the pull request, measured on the default loop, not a hope. If the number cannot be met, the pass does not become the default.

## Amount

No flag, or amount 0, means today's CPU integrator. Byte-identical. The GPU step is skipped, not run and multiplied by zero.

Above 0, the GPU step is the writer. The CPU arrays are a mirror for the readers that have not moved yet. The mirror is a readback, labeled as such, with its cost in the registry. It is not a second integrator.

## Governor

One registry entry for the pass, tier 1, with a real measurement before it merges. A shed pins the agents to the last CPU mirror and stops the GPU step. It does not reseed. Recovery continues from the held pose. If the measurement cannot ride tier 1, the pass does not ship as the default.

## What it is not

- Not Stage 3. The fields stay. This only moves the writer.
- Not the v1.0 release stage in the roadmap. Share links, the export bundle, and the version bump are that stage.
- Not a new panel, not a fifth track, not a second physics world.
- Not pressure-solve fluid, not a raymarched SDF, not weighted blended order-independent transparency. Those stay out.
- Not WebGPU.

## Build order

1. Parity note and tolerance, measured, before any reader moves.
2. One reader per pull request. Neighbors first, because everything else hangs off them. Breed last.
3. Default flips to the GPU step only after the readers that remain have a readback and the tolerance holds on the default loop.

## Acceptance

- Amount 0 matches today's frame.
- Same seed reprints within the written tolerance.
- Freeze holds the pose. Resume does not pop.
- No CPU reader writes against the GPU step.
- A shed pins and keeps the seed.
- Agents are still on the CPU until Stage 3 is signed.
