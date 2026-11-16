# K3 — costing the GPU swarm (#2188)

Status: **costing pass for Matt's review** (no code). K3's own issue and K0 §K both say this comes before any build: the integration scheme, the neighbour search, the cap, and what happens to the three selfchecks K0 left for it. Facts below were read from `engine/particles.js` and K0, not remembered. Anything I could not measure here is marked **unmeasured**.

## 1. What the swarm actually is

- `engine/particles.js` is 2,252 lines: one `ParticleSystem` (SoA typed arrays), `init` / `update` / `getItems`. It is the swarm _and_ the hype organisms. (K3's issue says `gl/particles.js`; K0 already corrected that.)
- Per step each particle runs: boids separation / alignment / cohesion over a uniform-grid neighbour set (~25 neighbours, the file's own header), plus behave-driven forces: curl wind, point-wind (seek / flee / scatter / cruise), chemotaxis, Lévy flights, Lorenz phase, cling, drives and leak accumulators — each gated by a behave-eased gain (`organisms/behaveEase.mjs`).
- Separate pass: `dishContacts.mjs` runs cross-strata contacts on a shared grid. It reads and writes swarm particles and is **not** part of the swarm kernel.
- State that must survive: `snapshotState` / `restoreState` (`particlesSnapshot.mjs`), the Lorenz re-entry reseed (#710), per-agent uniqueness channels (#558: phaseOffset, driftMul, speedMul, noiseSeed, mass — all from seeded hashes).
- Cap today: 350 (the issue). Not enforced in the engine file I read; it is set by the caller (**not traced** — a build-time item).

## 2. Disposition of what K0 left for K3

| Selfcheck                           | What it pins                                                                                         | Disposition                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `particles.lorenzReseed`            | Re-entering lorenz restarts the _same_ phase state from seed (#710)                                  | **Survives unchanged, as a decision.** The seed → phase-state map is hash-derived, so it stays CPU-side and is _uploaded_ to the GPU state on entry. Test the upload equals today's values.                                     |
| `particles.uniqueness`              | Per-agent channels come from seeded hashes, never the clock; sibling phase divergence is statistical | **Survives unchanged.** These are init-time seeds uploaded as static textures. Nothing numeric moves.                                                                                                                           |
| `particles.seekFleeSwarm`           | The chips act (mean distance orders seek < cruise < flee); cruise == scatter bit-identical           | **Becomes a property test.** Ordering stays valid on the GPU. "Bit-identical" does not (Tier S): keep it as the shader-side check that cruise and scatter share one code path (same uniforms ⇒ same output on the same device). |
| `particles.selfcheck` + `reference` | SoA == pre-SoA reference, every field                                                                | **Keep while the JS swarm exists** (K0). For the GPU swarm: bounded speed, no NaN, and alignment / cohesion / separation statistics inside a band at matched seed and count.                                                    |

## 3. Integration scheme — recommendation

Semi-implicit Euler per frame substep, state in float textures (position+velocity as RGBA32F ping-pong, one texel per particle), one fullscreen-quad fragment pass per substep. Same scheme the CPU uses (it already integrates on the loop's `dtSec`), so character carries over; no new numerics to tune.

Transform feedback is the alternative. It needs no texture-state plumbing, but it is awkward for gather-style neighbour reads and gives no advantage at these counts. **Recommend texture state.**

## 4. Neighbour search — recommendation

WebGL2 has no compute shaders or atomics, so the CPU's counting-sort grid does not port. Options:

1. **All-pairs in the fragment shader.** Each particle loops over every other and tests the radius. Cost is N² pair tests per substep: 350² ≈ 0.12 M, 2,048² ≈ 4.2 M, 4,096² ≈ 16.8 M. A single simple-loop pass of that size is well inside what an iPad-class GPU runs in a frame, but **unmeasured** — I can only run software GL here.
2. **GPU grid via scatter.** Bin particles into a cell texture with point sprites, K occupants per cell over K passes. More code, and the cell cap `K` is a new behaviour edge.

**Recommend all-pairs up to ~2,048, measured on stage hardware before anything is raised, and revisit the grid only if the measured ceiling is below the cap Matt wants.** This is also the one place the WebGPU spike (#2184) said WebGPU would clearly win; the recommendation there was to stay on WebGL2 unless this misses the budget.

## 5. Cap

Do not raise it in the first slice. The proposal for Matt: build the GPU swarm at the current 350 for matched-capture parity, then raise in steps (350 → 1,024 → 2,048) with a frame-profile capture on the stage iPad at each step. The raise is a _feel_ change, so it is Matt's merge.

## 6. Recorded vs per-device (K0's split, applied)

- **Decisions (Tier D, recorded):** the behave id and gains, attractor position, seed, counts, Lorenz re-entry, per-agent seeds — all inputs today and unchanged.
- **Sim outcomes (Tier S, recording device's):** positions and velocities. The swarm's chain contribution today is the `items` the resolver emits; under a GPU swarm those items come from a readback (or the field is consumed post-contract). **Open for K3 slice 1:** which of the two. This is the same S2-style question K1 answered with a recorded sparse input; the swarm's items are denser (350+ × position), so the cheaper answer is probably _post-contract presentation of GPU positions, with the recorded swarm limited to decisions_. Needs Matt's ruling before it is built, because it changes what a take replays.

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
4. **Contacts, design rulings (Matt, 2026-11-16, resolving §11's open decisions).**
   - (a) ONE unified GPU body table across strata, with a stratum-id column.
   - (b) The density field (#1412) is rebuilt on the CPU from the recorded contact list.
   - (c) The flaky KIN e2e got its own fix PR (#2231, merged).
   - (d) Order: contacts slice 2a, then the swarm WIRING slice (flag OFF), then contacts 2b-2d.

## 10. Shipped

- **Slice 1a** (`gl/swarmSim.mjs`): the swarm core on the GPU, standalone and wired to nothing. Boids separation / alignment / cohesion (all-pairs), the point attractor (seek / flee = its seekGain sign), semi-implicit Euler with dt-correct damping, the speed clamp, wrap (cloud) and bounce (organism) boundaries; RGBA32F state ping-pong, mass static. One step from the same state agrees with the real `ParticleSystem` to float noise (≤ 1e-4 in position, with the JS wind injected to zero); over 350 particles × 300 steps: no NaN, speed ≤ clamp, seek < cruise < flee, boundaries hold. Selfcheck: `parity/swarmSim.selfcheck.mjs` (real GL; skips with no browser).
- **Slice 1b**: the cloud swarm's point wind. No new GLSL port was needed — the field twin (`gl/fields/fieldCommon.glsl.js`, the exact `permTableFor` bytes as an R8UI texture) already holds `noise3D`; the kernel reuses it. Per particle: `noise3D(x·f + offX, y·f + offY, nt + seedOffset·1e-4)` → angle, a second sample at +200 → shape; `windMul` is 1 off-organism. One step from live state with the real noise agrees with `ParticleSystem` (≤ 4.5e-4; wind-off differs by ~1, so it is not a no-op).
- **Slice 1c**: the curl wind (`curl2`: four 3-octave fBm samples, eps 0.5, via `kcFbm3D`) and the `windMul` uniform (cloud 1; organism `wind × profile.wind`). One step with `windMode: 'curl'` agrees with `ParticleSystem` (≤ 3.9e-4). `windMul` ≠ 1 is wired but only exercised at 1 here.
- **Slice 1d**: chemotaxis. The scent field stays JS-owned (a 64×36 grid, deposit / diffuse / decay unchanged); the caller uploads its cells as an R32F texture (`setScent`), and the kernel ports `sample` (cell-centred bilinear, clamp 0..4) and the central-difference `gradient`, adding `gradient × gain / mass`. The force it adds matches the JS gradient to 1e-5. **Open: deposits** — mold deposits from particle positions each frame, so a fully-GPU colony needs either a position readback or an in-shader splat; that is a design choice for the wiring slice, not made here.
- **Slice 1e**: Lévy flights. The draws use the kernel's own integer hash in-shader (`hashBase(seed, CH.dyn)` as a uniform + the same avalanche as K2's births), keyed by the per-agent phase-staggered 45-frame flight epoch, so the GPU draws the same flights as `particles.js`. Force agrees with the JS draws to 2e-4 relative (the float32 `u` is the only divergence); strongest flight seen 9.0, so the heavy tail is exercised.
- **Slice 1f**: Lorenz (#583). Per-agent attractor state rides a second colour attachment (ping-ponged beside the position state); the shader does `lorenzAdvance`'s RK2 step (σ 10, β 8/3, ρ clamped 1..60, dt = 0.006 × dtFrames) and steers by the normalised velocity × gain / mass. `seed({lorenz})` takes the caller's seeded state (`lorenzSeed`), `readLorenz()` reads it back. State after 60 steps matches the JS integrator to 1.2e-5; the force to 5e-6. Not wired: the #710 reseed-on-entry and the #722 eased `lorenzGain` are the caller's (the wiring slice).
- **Slice 1g**: drives (#287) and leak. Energy / curiosity-drive state and the pigment working copy ride two more colour attachments. Per step: energy drains at the metabolism rate, +0.0012 in company, + scent feeding (the uploaded grid); the curiosity walk draws from the kernel hash (`step·131071 + 104729 + i`); a drive > 0.001 adds a noise detour (the +500 / +7.3 sample); hunger raises the cohesion weight; vigor (0.45 + 0.55·energy) scales the whole steering sum. Leak drifts each agent's pigment toward its cohesion-neighbour mean at `leak·0.004·dt`. Matches the JS formulas (energy / walk 3e-8, feeding 3e-8, detour force 8e-4, pigment 8e-6 on a 0–255 scale). **Documented divergence:** the JS leak updates in place (a later agent sees an earlier agent's already-drifted pigment); the GPU reads last step's values for every agent. The difference is one `kk` (≤ 0.5 %) of a neighbour gap per step. Also not wired: the 'slow cadence' that rewrites `color[]` from the pigment.
- **Contacts slice 2a**: `gl/dishContactsGpu.mjs`, detection only (no state change, flag OFF, not wired). A pure packer flattens the enrolled strata into ONE unified body table with a stratum-id column, in the CPU pass's canonical order. An all-pairs fragment pass (one fragment per body scanning higher indices, the same predicate as `runDishContacts`: different strata, both masks admit both groups, both discs positive, d² < (ra+rb)²) emits per-body slots (3 per MRT pass, 6 by default) plus a count; the host decodes a compact `{a, b, nx, ny, overlap}` list in canonical (a, b ascending) order. Excess beyond the slots is reported as `overflow`, never silent. Readback is PBO + fence, polled (the `gpuFluidHost` pattern); `detect()` is the sync form. Pinned: the oracle names exactly the bodies the real CPU pass moves; the GPU pair set is exact against the oracle (moderate density, masks, coincident, overflow); normal and overlap agree to float32 noise (coincident normals ~2e-4: the golden-angle argument is float32 in the shader). **Cost is unmeasured** (software GL; all-pairs cost belongs with the cap-ladder measurement on the stage iPad, #2183).
- **Wiring slice (shadow)**: `gl/gpuSwarmHost.mjs`, hooked in `liveResolve.swarmItems` (+ a GL getter registered by `liveLoop`). OFF unless a layer asks: layout param `gpuSwarm`, `window.__KC_GPU_SWARM`, or `?gpuSwarm=1` (Matt's rulings, 2026-11-16: CPU mirror for scent deposits and breeding; flag = layout param + URL override). When on, each eligible layer's pre-step state goes to the GPU kernel, one GPU step runs under the SAME params, and after the JS step the two are compared; **the JS swarm stays authoritative and nothing the GPU computes reaches the screen or the take**. Eligible = a plain cloud swarm the kernel fully covers (no organism, no dish contacts, no mod steering, cruise/seek/flee); anything else is skipped and counted. Why a shadow and not a takeover: in `ParticleSystem.update` the dish contacts inject impulses BETWEEN the force loop and integration, and the kernel does force+integrate in one step, so it cannot replace the JS step until contacts are on the GPU (2b). Stats (`getGpuSwarmShadowStats()`): frames, skipped-by-reason, GPU ms avg/max (step + readback), worst position/velocity drift. This is the stage-hardware cost measurement (#2183) with real inputs. Pinned: one-step agreement to float32 noise over a real `ParticleSystem` (30 frames), contacts layers skipped, flag off by default. Also: the harness static server now serves `.json` modules (the engine imports them).
- **Not yet:** cling (rides the contact pass), breeding, contacts, heading and spine integrators, any wiring or flag. **Cost is unmeasured** (software GL only; the all-pairs loop's real cost needs the stage iPad, #2183).

## 11. `dishContacts` on the GPU — sizing and slice plan (2026-11-16)

Ruling 9.3 puts `dishContacts` on the GPU with its contacts stamped as a recorded input. Read against `dishContacts.mjs` (731 lines), that is much bigger than a swarm force, so it is sized here before any code.

**What the pass is.** One shared counting-sort grid over every enrolled _stratum_ (several `ParticleSystem`s), one cross-strata pair pass in canonical order (stratum, then index). Per pair: mass-weighted depenetration (always); a bounce impulse when both strata's modes are impulse modes; the medium (#1413 cling, #1595 friction, #1596 spin torque Δω); and side effects: `feedDishDeform` (per-body dent), `noteDishContactStamp` (press stamps drained into the wet field), `buildDishDensity` (per-cell counts published as a field), trail and ecology enrolment.

**Why it is not a one-slice port.**

1. _Strata._ The GPU swarm today is ONE system (one state texture). The pass spans several; a GPU pass needs the strata resident together (a shared body table with a stratum id) before it can run.
2. _Order._ The CPU result depends on canonical visit order (sequential, in place: a later pair sees an earlier pair's push). A GPU pair pass is parallel (reads last state). The match is therefore NOT byte-exact; it is a documented, property-tested law (no overlap beyond epsilon, momentum, mass weighting), like the swarm's own parity — and ruling 9.3's stamp makes that safe: the _recorded_ contact list, not the pass, is what the resolver replays.
3. _Outputs are many._ Pose/velocity/omega deltas, plus deform, wet stamps, density, trails, ecology. Of these, only the **stamp list + density field** feed the resolver/look; the rest are live-column state of the strata.

**Proposed slices (each behind the same OFF flag, K1 pattern).**

- **2a. Contact detection → stamp list.** All-pairs (or the shared grid, if 2.9.2's measurement demands it) over a unified body table → compact list of `{a, b, nx, ny, overlap}` per frame, read back through the existing PBO + fence path (`gpuFluidHost` pattern). Pure planner + GL half + property tests. No state change yet.
- **2b. Resolution on the GPU.** Depenetration + bounce + medium (cling, friction, spin) as a pass over the same body table; parity = properties against `runDishContacts` on identical bodies (not bitwise).
- **2c. Stamped recording.** The contact list rides the resolve input as a recorded sparse input (`dishContactStamps`, K1 `dishFluidCells` pattern: packed typed arrays, identity-preserving), so a replay of a GPU-contacts take applies the recorded contacts exactly.
- **2d. Side effects.** `feedDishDeform` / wet stamps / density derive from the recorded list on the CPU side (they are cheap, sparse, and already consume `session` state), so they do not need a GPU port at all.

**Open decisions (not blocking 2a):**

1. Unified body table across strata vs one pass per stratum pair — recommended: one table with a stratum-id column.
2. Whether `session.density` (the per-cell field #1412 publishes) is rebuilt on CPU from the recorded list (recommended) or read back from the GPU grid.
3. The cap ladder (ruling 9.2) and the contacts all-pairs cost must be measured together on the stage iPad (#2183): contacts is all-pairs over _every_ stratum, so it is the term that decides whether a grid is needed.
