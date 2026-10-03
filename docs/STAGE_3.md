# Stage 3 — the field that remembers

**Status:** SPEC ONLY. No build, no issue, no pull request for the field. Written for Matt's approval — plain language, no code.

Today's FLOW is a snapshot. A 32×32 curl is sampled from the project seed and held still. The swarm reads it. The trail reads it. Nothing writes back. Stage 3 is the surface the picture writes into.

Companions, do not fork them: [ENGINE_PLAN_GEN2.md](ENGINE_PLAN_GEN2.md), [BIO_DRIVES_PLAN.md](BIO_DRIVES_PLAN.md), [ROADMAP_V1.md](ROADMAP_V1.md), [ACCUM.md](ACCUM.md).

## What it is

Two GPU grids, in the order the roadmap already named. One writer. The ACCUM buffer stays the visible ink. These grids are the invisible memory under it.

**Field 1 — scent.** A full-frame ping-pong pair. Each frame: deposit where the marks are, then diffuse and decay. Read last frame, write this frame, swap. Leak writes scent. Mold reads the slope and steers. Graze can eat it. The field is not drawn. A debug view may show it. The picture never has to.

**Field 2 — shared wind.** Spine F's curl becomes one texture every track samples, including the swarm. It starts from the project seed, same as today's 32×32 table. It may then be advected by itself, so the wind can curl the wind. That is the step the current wire refuses.

The pattern is the ACCUM feedback loop, not a new particle system. gpu-io-style kernels are the reference, not a dependency.

## What amount means

Scent amount 0 means today's render. No deposit pass, no decay pass, no texture read. The noise is skipped, not multiplied by zero. Wind amount 0 keeps the current FLOW wire: the static seed table, or the legacy hash when FLOW is 0.

Above 0, deposit strength and decay rate are the two knobs. Decay 1 clears the field in a frame. Decay 0 holds it until CLEAR. CLEAR wipes the scent pair and both ACCUM buffers. One gesture.

## The time path

One loop clock, the same one kineme and the sequencer already use. Deposit and decay advance only while that clock advances. Freeze holds the field. Resume continues from the held frame. No reseed, no pop.

The still path evaluates the same passes up to a seed-derived instant, then bakes. Same project, same still. A reseed is a new field. No moment-scrubbing in v1.

## Governor

One registry entry for the pair, tier 1, with a real measurement before it merges. A full-frame 16-bit pair is the heavy thing. Shedding drops the passes and pins the field. It does not reset the seed. Recovery resumes from the held texture. If the measurement says it cannot ride tier 1, it does not ship at that resolution. Half-res is the shed, not a second design.

## What it is not

- Not a replacement for the FLOW wire. The 32×32 table stays the amount-0 path.
- Not LEAVE. LEAVE holds visible stamps. Scent is invisible residue.
- Not kineme. Kineme moves marks. This moves memory under them.
- Not a second physics world. Agents stay CPU and sample the texture. Neighbors, contacts, spine, and breed keep reading CPU state until a later note says otherwise.
- Not pressure-solve fluid, not Gray-Scott, not WebGPU. Those stay on the beyond-v1 list.

## Build order

1. Scent pair: deposit, diffuse, decay, amount 0 byte-identical, CLEAR wipes it. Mold may tap the slope only after the pair is proven.
2. Shared wind texture: swarm and trail sample the same texture. Self-advection is a separate pull request, after the sample is signed.
3. Transform feedback only after both fields are live on the default loop.

## Acceptance

- Amount 0 matches today's frame.
- Freeze holds the field. Resume does not pop.
- The same seed reprints the same still.
- A shed loses the passes and keeps the seed. Recovery continues the held texture.
- No new panel. No fifth track. Agents still on the CPU.

## Open until Matt says otherwise

- Scent stays invisible. A debug view is allowed. A drawn pheromone layer is not this spec.
- Half-res is the shed if the measurement fails tier 1. It is not the default.
- Self-advection of the wind is field 2's second pull request, not its first.
