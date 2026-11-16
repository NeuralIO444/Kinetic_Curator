# K3 — costing the GPU swarm (#2188)

Status: **costing pass for Matt's review** (no code). K3's own issue and K0 §K both say this comes before any build: the integration scheme, the neighbour search, the cap, and what happens to the three selfchecks K0 left for it. Facts below were read from `engine/particles.js` and K0, not remembered. Anything I could not measure here is marked **unmeasured**.

## 1. What the swarm actually is

- `engine/particles.js` is 2,252 lines: one `ParticleSystem` (SoA typed arrays), `init` / `update` / `getItems`. It is the swarm *and* the hype organisms. (K3's issue says `gl/particles.js`; K0 already corrected that.)
- Per step each particle runs: boids separation / alignment / cohesion over a uniform-grid neighbour set (~25 neighbours, the file's own header), plus behave-driven forces: curl wind, point-wind (seek / flee / scatter / cruise), chemotaxis, Lévy flights, Lorenz phase, cling, drives and leak accumulators — each gated by a behave-eased gain (`organisms/behaveEase.mjs`).
- Separate pass: `dishContacts.mjs` runs cross-strata contacts on a shared grid. It reads and writes swarm particles and is **not** part of the swarm kernel.
- State that must survive: `snapshotState` / `restoreState` (`particlesSnapshot.mjs`), the Lorenz re-entry reseed (#710), per-agent uniqueness channels (#558: phaseOffset, driftMul, speedMul, noiseSeed, mass — all from seeded hashes).
- Cap today: 350 (the issue). Not enforced in the engine file I read; it is set by the caller (**not traced** — a build-time item).

## 2. Disposition of what K0 left for K3

| Selfcheck | What it pins | Disposition |
|---|---|---|
| `particles.lorenzReseed` | Re-entering lorenz restarts the *same* phase state from seed (#710) | **Survives unchanged, as a decision.** The seed → phase-state map is hash-derived, so it stays CPU-side and is *uploaded* to the GPU state on entry. Test the upload equals today's values. |
| `particles.uniqueness` | Per-agent channels come from seeded hashes, never the clock; sibling phase divergence is statistical | **Survives unchanged.** These are init-time seeds uploaded as static textures. Nothing numeric moves. |
| `particles.seekFleeSwarm` | The chips act (mean distance orders seek < cruise < flee); cruise == scatter bit-identical | **Becomes a property test.** Ordering stays valid on the GPU. "Bit-identical" does not (Tier S): keep it as the shader-side check that cruise and scatter share one code path (same uniforms ⇒ same output on the same device). |
| `particles.selfcheck` + `reference` | SoA == pre-SoA reference, every field | **Keep while the JS swarm exists** (K0). For the GPU swarm: bounded speed, no NaN, and alignment / cohesion / separation statistics inside a band at matched seed and count. |

## 3. Integration scheme — recommendation

Semi-implicit Euler per frame substep, state in float textures (position+velocity as RGBA32F ping-pong, one texel per particle), one fullscreen-quad fragment pass per substep. Same scheme the CPU uses (it already integrates on the loop's `dtSec`), so character carries over; no new numerics to tune.

Transform feedback is the alternative. It needs no texture-state plumbing, but it is awkward for gather-style neighbour reads and gives no advantage at these counts. **Recommend texture state.**

## 4. Neighbour search — recommendation

WebGL2 has no compute shaders or atomics, so the CPU's counting-sort grid does not port. Options:

1. **All-pairs in the fragment shader.** Each particle loops over every other and tests the radius. Cost is N² pair tests per substep: 350² ≈ 0.12 M, 2,048² ≈ 4.2 M, 4,096² ≈ 16.8 M. A single simple-loop pass of that size is well inside what an iPad-class GPU runs in a frame, but **unmeasured** — I can only run software GL here.
2. **GPU grid via scatter.** Bin particles into a cell texture with point sprites, K occupants per cell over K passes. More code, and the cell cap `K` is a new behaviour edge.

**Recommend all-pairs up to ~2,048, measured on stage hardware before anything is raised, and revisit the grid only if the measured ceiling is below the cap Matt wants.** This is also the one place the WebGPU spike (#2184) said WebGPU would clearly win; the recommendation there was to stay on WebGL2 unless this misses the budget.

## 5. Cap

Do not raise it in the first slice. The proposal for Matt: build the GPU swarm at the current 350 for matched-capture parity, then raise in steps (350 → 1,024 → 2,048) with a frame-profile capture on the stage iPad at each step. The raise is a *feel* change, so it is Matt's merge.

## 6. Recorded vs per-device (K0's split, applied)

- **Decisions (Tier D, recorded):** the behave id and gains, attractor position, seed, counts, Lorenz re-entry, per-agent seeds — all inputs today and unchanged.
- **Sim outcomes (Tier S, recording device's):** positions and velocities. The swarm's chain contribution today is the `items` the resolver emits; under a GPU swarm those items come from a readback (or the field is consumed post-contract). **Open for K3 slice 1:** which of the two. This is the same S2-style question K1 answered with a recorded sparse input; the swarm's items are denser (350+ × position), so the cheaper answer is probably *post-contract presentation of GPU positions, with the recorded swarm limited to decisions*. Needs Matt's ruling before it is built, because it changes what a take replays.

## 7. Proposed slices

1. **Standalone GPU swarm kernel + property tests** (no wiring), at 350, behaviours in the order of simplest first: cruise / scatter / seek / flee, curl wind, then chemotaxis, Lévy, Lorenz, cling. Parity here is statistical, per K0.
2. **Character captures** against the JS swarm at matched seed and count (judged by eye, K0).
3. **Wiring behind a flag** (OFF), per the K1 pattern.
4. **Cap raise**, measured.

## 8. Questions for Matt

1. **§6:** recorded swarm = decisions only, positions presented post-contract (recommend), or record a position stream like K1's field?
2. **§4/§5:** OK to build all-pairs and measure before choosing a grid, and to raise the cap only in measured steps (350 first)?
3. **`dishContacts`:** stays JS and out of K3 until the swarm kernel exists (recommend), or in scope now?

Nothing changes in the product from this document.

## 9. Rulings (Matt, 2026-11-16)

1. Swarm take = **decisions only**; positions presented post-contract.
2. **All-pairs, measure first**; cap raised only in measured steps (350, then 1,024, then 2,048). Grid only if the measurement demands it.
3. **`dishContacts` moves to the GPU too** (not left on JS). It is therefore in scope: it needs its own slice after the swarm kernel, and a contacts readback or GPU-side consumer must be designed; the contacts feed the resolver, so this crosses the K0 R3 seam and needs the same stamp-or-post-contract decision K1 had.
   Ruled (Matt, 2026-11-16): the contacts are **stamped as a recorded input** (a small list per frame, as K1), not made post-contract. The resolver stays exact; the look follows the recording device.

## 10. Shipped

- **Slice 1a** (`gl/swarmSim.mjs`): the swarm core on the GPU, standalone and wired to nothing. Boids separation / alignment / cohesion (all-pairs), the point attractor (seek / flee = its seekGain sign), semi-implicit Euler with dt-correct damping, the speed clamp, wrap (cloud) and bounce (organism) boundaries; RGBA32F state ping-pong, mass static. One step from the same state agrees with the real `ParticleSystem` to float noise (≤ 1e-4 in position, with the JS wind injected to zero); over 350 particles × 300 steps: no NaN, speed ≤ clamp, seek < cruise < flee, boundaries hold. Selfcheck: `parity/swarmSim.selfcheck.mjs` (real GL; skips with no browser).
- **Not yet:** wind (curl and point noise — needs a GLSL port of `noise.js`), chemotaxis, Lévy, Lorenz, cling, drives, leak, breeding, contacts, heading and spine integrators, any wiring or flag. **Cost is unmeasured** (software GL only; the all-pairs loop's real cost needs the stage iPad, #2183).
