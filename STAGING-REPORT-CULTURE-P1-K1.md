# Staging report — CULTURE Phase 1, slice K1: the dish fluid kernel

Branch `feat/culture-phase1-k1`, based on origin/main `07c76ee6` (Phase 0 merged).
Parent programme: `docs/design/culture-phasing.md` Phase 1, item 1. The parent
issue (2186) stays open; the WebGL program umbrella (2180) stays open.

## What shipped

The CULTURE world (Phase 0's gated, empty dish) now has its medium: the dish
fluid, living inside the world and stepped by the world's own clock.

- **`app/src/engine/cultureWorld.mjs`** (extended) — `createCultureWorld` is born
  carrying a Gray-Scott field from the codebase's math authority
  (`engine/dishFluid.mjs` `createFluid`/`stepFluid`), seeded from the world seed
  alone (`fluidSeedKey(seed, 0)` — no wake, no magnets). `stepCultureWorld` steps
  the fluid on every `CULTURE_FLUID_STEP_DIVISOR`-th (2nd) world step, so at the
  world's 120 Hz the medium runs at 60 steps/s — the exact tempo the live
  dish-grid fluid instance already runs at (480 steps/s stamp rate over
  `FLUID_GRID_STEP_DIVISOR` 8). The fluid's step count is `floor(world.step / 2)`
  at every instant; it has no clock of its own. The world hash now covers the
  medium (its backend id + `fluidHash`). `cultureFluidDensity(world)` publishes
  the dark-phase density at the shared grid — the read K2 will consume.
- **Resolution call** — the issue names native resolution as this slice's costing
  question. The world's fluid runs at the shared stage grid, 96×54, which IS the
  fluid grid (`FLUID_GRID_COLS × FLUID_GRID_ROWS` = `STAGE_COLS × STAGE_ROWS`):
  the medium maps onto the soil cell-for-cell with no resampling, and K2's
  shader-space coupling reads it at identity. No rise above 96×54 in this slice.
- **Stamps** — the fluid carries its own kernel stamp from the simBackends
  vocabulary on the world: `fluidBackend`, born `js.gs.v1`.
  `setCultureFluidBackend(world, id)` is the only door for changing it: it
  validates against `KNOWN_SIM_BACKENDS.fluid` (unknown ids, and other kernels'
  ids, are refused) and recomputes `world.simLaw` through `simLawFor` in the same
  motion — `js-exact` while the fluid runs in JS, `decisions-exact` the moment a
  `gpu.*` backend is named. `cultureWorldSimLaw(world)` exposes the composition.
- **`app/src/gl/cultureFluidHost.mjs`** (new) — the GPU half, shaped on
  `gpuFluidHost.mjs`: a pure planner (`planCultureFluidSteps` — reseed on a new
  seed or a backward target, bounded catch-up of 64 passes per call, never an
  overshoot) and a GL host (`createCultureFluidHost`) that mirrors the world's
  medium on the existing GPU kernel (`gl/fluidSim.mjs`, `gpu.gs.v1`): it seeds
  from the world's initial condition recomputed pristine (never read out of the
  live JS field), steps in lockstep with `world.fluid.step` under the same kernel
  defaults the world's `stepFluid` runs, and reads density back asynchronously
  (PBO + fence, newest completed read, discarded across a reseed). Its readbacks
  are stamped `gpu.gs.v1`. Nothing creates the host yet — OFF by default in the
  strongest sense; wiring it to a consumer (and naming its backend on the world)
  is a later slice, the gpuFluidHost 4a posture.

## What this did NOT do

- No change to the live stage: the gate-off path is untouched (Phase 0's suite
  passes unmodified, byte-parity groups included), and gate-on the shell still
  feeds the world exactly as Phase 0 left it — `useCultureWorld.js` is unchanged.
  No one-writer file was touched (`liveLoop.mjs`, `liveResolve.mjs`,
  `particles.js` are not in the diff).
- No rendering of the medium, no solver, no bodies, no soil coupling: the fluid
  stands unbiased — no magnets (the dish's fields are Phase 3) and no culture
  level input (the soil coupling is K2, the next slice).
- No change to the already-shipped live-stage K1 work (slices 1–4c under the
  same parent issue): `gl/fluidSim.mjs`, `gl/gpuFluidHost.mjs`, the resolver seam
  and its stamps are all untouched. What remained of the parent issue for the
  CULTURE line was the world-side medium; the seam doc's other open item, the
  stage-hardware readback measurement (issue 2183), is Matt's hardware step and
  stays open.

## Verification

New suites (all in `app/selfcheck.manifest`):

- `engine/cultureFluid.selfcheck.mjs` — 6 groups: birth at the shared grid
  seeded from the world seed; step consumption (`fluid.step ==
  floor(world.step / 2)` asserted at every point of a 600-chunk irregular feed);
  JS-path determinism (identical irregular feeds reproduce the medium and the
  world bit-for-bit; the cadence boundary is exact — an off-cadence world step
  leaves the medium untouched); a two-sim-minute stability soak (7,200 fluid
  steps: finite, in [0, 1], mean V 0.079 → 0.234, standing coral character);
  gate-off inertness (no standing world, the medium exists only inside a created
  world); simLaw honesty (JS ⇒ `js-exact`, GPU ⇒ `decisions-exact`, unknown
  backends refused with the stamp left untouched).
- `gl/cultureFluidHost.selfcheck.mjs` — 5 groups over the pure planner.
- `gl/parity/cultureFluidSim.selfcheck.mjs` — the GPU kernel against the world's
  JS reference, seeded from a culture world's birth field, the JS side advanced
  only through the world's scheduler. **Tolerance law** (Tier S, K0): float32 GPU
  vs float64-computed/float32-stored JS — short runs agree to float noise, max
  |Δ| < 1e-3 on both phases at 60 steps (the K1 stage-1 precedent for this kernel
  pair at this grid); long runs are chaotic reaction-diffusion and are judged on
  character, mean V within 15% at 600 steps, plus both fields finite and in
  [0, 1]. Measured here: |ΔV| max 8.9e-7 at 60 steps; at 600 steps mean V
  0.1352 on both sides.

Targeted neighbours, all green: cultureWorld (Phase 0, unmodified),
dishFluid, dishFluidStage, dishFluidCouple, dishFluidCells, gpuFluidHost,
simBackends.

Publish ritual: lint 0 errors (11 warnings, all pre-existing, none in touched
files) · format:check clean · production build green.

**Full manifest sweep: 803 PASS / 3 FAIL over all 806 manifest commands** (logs:
`sweep-culture-p1-k1.log` + `sweep-culture-p1-k1-part2.log` in the worktree root;
the first run was cut by a sandbox runtime restart at 492 recorded suites and
resumed over the remainder — coverage verified line-by-line against the
manifest). The three failures are the known sandbox-environmental set, each
A/B-proven against a pristine detached worktree at origin/main with identical
results: swarmWasm (exit 1 on both), rollSafety (exit 1 on both), accum (abort,
exit 134 on both — the sandbox WebGL path). None is this slice's.

## Design calls made (coordinator-visible)

1. **Cadence divisor 2** (60 steps/s): tempo parity with the proven live
   dish-grid instance rather than a new tempo invented for the world. CPU cost
   ≈ 0.11 ms per fluid step ≈ 6.6 ms per sim-second on the JS path.
2. **The GPU host ships unwired**, mirroring gpuFluidHost slice 4a's posture:
   the world is not rendered yet, so a live GPU consumer would be cost without a
   reader. The host, its planner and its parity proof land now so K2 wires a
   proven mirror, not a sketch.
3. **`setCultureFluidBackend` as the single stamp door**: backend and law live
   in two fields a caller could desync; the setter makes the desync
   unrepresentable through the public surface.
