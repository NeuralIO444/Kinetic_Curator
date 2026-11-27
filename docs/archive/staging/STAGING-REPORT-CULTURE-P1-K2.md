# Staging report — CULTURE Phase 1, slice K2: the DISH LIFE culture sim

Branch `feat/culture-phase1-k2`, based on origin/main `aefc80b2` (Phase 0 and
Phase 1 K1 merged). Parent programme: `docs/design/culture-phasing.md` Phase 1,
item 2. The parent issue (2187) stays open; the WebGL program umbrella (2180)
stays open.

## What shipped

The CULTURE world (Phase 0's gated dish, Phase 1 K1's fluid medium) now has its
soil: the DISH LIFE culture computes inside the world, on the shared grid,
coupled to the medium.

- **`app/src/engine/cultureWorld.mjs`** (extended) — `createCultureWorld` is
  born carrying a culture from the codebase's Life authority
  (`engine/dishLife.mjs` `createCulture` under `CULTURE_RULE`, the pickup rule
  the live stage runs: B3/S234, 8 states), seeded from the world seed alone
  through the core's own 'dish-life' channel (`seedRandom` at density 0.3), no
  mask and no bedrock — the world has no terrain yet (the dish's fields are
  Phase 3). `stepCultureWorld` steps the culture on every
  `CULTURE_LIFE_STEP_DIVISOR`-th (15th) world step: at the world's 120 Hz that
  is **8 generations/second**, the exact tempo the parent issue states for the
  kernel today ("JS on the shared 96×54 grid, 8 generations/second"). The
  culture's generation is `floor(world.step / 15)` at every instant; it has no
  clock of its own. The world hash now covers the soil (its backend id +
  `cultureHash`). `cultureLifeField(world)` publishes the culture's field
  (level / activity at the shared grid) — the read the #2152 force and Phase
  4's ecology stand on; Life is never drawn.
- **The coupling (fluid → culture)** — before each generation, the medium's
  published density (`cultureFluidDensity`, the fluid's last completed state —
  the dish's one-step-behind read discipline) deals births into the culture
  through the established #1997 seam (`engine/dishFluidCouple.mjs`
  `injectFluidBirths`) at the world's standing coupling strength
  `CULTURE_COUPLING = 0.5` (the COUPLE dial's own default — see design call 2),
  drawn from the seeded stream at the world seed. The deal is a pure function
  of (culture, density, strength, seed), so the JS path stays js-exact.
- **Stamps** — the culture carries its own kernel stamp from the simBackends
  vocabulary on the world: `lifeBackend`, born `js.life.v1`.
  `setCultureLifeBackend(world, id)` is the only door: it validates against
  `KNOWN_SIM_BACKENDS.culture` and recomputes `world.simLaw` through
  `simLawFor` in the same motion, composing with the fluid door — `js-exact`
  while both kernels run in JS, `decisions-exact` the moment either names a
  `gpu.*` backend.
- **`app/src/gl/cultureLifeHost.mjs`** (new) — the GPU half, shaped on
  `gpuCultureHost.mjs` / `cultureFluidHost.mjs`: a pure planner
  (`planCultureLifeSteps` — reseed on a new seed or a backward target, bounded
  catch-up of 64 generations per call, never an overshoot) and a GL host
  (`createCultureLifeHost`) that mirrors the world's culture on the existing
  GPU kernel (`gl/cultureSim.mjs`, `gpu.life.v1`): it seeds from the world's
  birth grid recomputed pristine (the same `seedRandom` fill, never read out
  of the live JS grid), steps in lockstep with `world.life.gen`, and reads the
  grid back asynchronously (PBO + fence, newest completed read, discarded
  across a reseed). Its readbacks are stamped `gpu.life.v1`. **The coupling is
  dealt in shader space**: the caller hands `frame(world, fluidTex)` the fluid
  mirror's texture (`cultureFluidHost.fluidTexture()`, RG32F, density in G)
  and the host deals the birth deal in shader space before each generation —
  both fields GPU-resident, no per-frame CPU readback of either field, the
  parent issue's coupling shape. Handed no texture, the mirror runs the
  uncoupled culture (the gpuCultureHost posture). Nothing creates the host
  yet — OFF by default in the strongest sense; wiring it to a consumer (and
  naming its backend on the world) is a later slice.

## The Life rule set, as the parent issue scopes it

The issue scopes the kernel as it stands today: "The DISH LIFE culture kernel
(today: JS on the shared 96×54 grid, 8 generations/second, governor-shed via
SHED_STEPS)". The rule set is the codebase's: the Generations-family automaton
of `engine/dishLife.mjs` under `CULTURE_RULE` — birth on 3, survival on
2/3/4, 8 states (alive + decay tail + dead; a cell that fails to survive ages
through the decay states instead of vanishing, and decaying cells never count
as neighbours and cannot be reborn until dead), no wraparound at the rim,
blocked cells (glass / bedrock) never alive and never counted. The world
carries no mask and no bedrock, so the blocked half of the rule is dormant in
the world until Phase 3 gives the dish terrain. The governor-shed half of the
issue's sentence belongs to the live stage's frame budget (SHED_STEPS bounds
generations per resolver frame); inside the world the fixed-timestep
scheduler is the budget — generations are whole world steps, and an over-long
feed drops whole steps counted in `droppedSteps`, never silently.

## What this did NOT do

- No change to the live stage: the gate-off path is untouched (Phase 0's and
  K1's suites pass **unmodified**, byte-parity groups included), and gate-on
  the shell still feeds the world exactly as Phase 0/K1 left it —
  `useCultureWorld.js` is unchanged. No one-writer file was touched
  (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js` are not in the diff).
- No change to the already-shipped live-stage K2 work under the same parent
  issue (slice 1: `gl/cultureSim.mjs` + its byte-exact parity; slice 2b:
  `gl/gpuCultureHost.mjs`, `dishLifeStage.hostSeed()`, the `dishCultureCells`
  recording path): all untouched, all suites green. What remained of the
  parent issue for the CULTURE line was the world-side soil; that is this
  slice.
- **The reverse coupling direction is not wired in the world** (design call
  3): the culture's level does not yet bias the world's fluid feed. The
  world's `stepFluid` call is exactly K1's, so the medium keeps the character
  K1 proved.
- No rendering of the soil, no solver, no bodies, no terrain: Life computes
  underneath and publishes its field, per the #2152 law — it is never drawn.

## Verification

New suites (all in `app/selfcheck.manifest`):

- `engine/cultureLife.selfcheck.mjs` — 8 groups: birth at the shared grid
  seeded from the world seed (alive 1,586 of 5,184 at seed 42, the 0.3
  density class); rule correctness hand-computed under CULTURE_RULE (a
  blinker rotates with decay tails at its ends, a block stands, a lone cell
  decays 2→7 over six generations then dies — all stepped by the world's own
  scheduler with the medium held at zero density); step consumption
  (`life.gen == floor(world.step / 15)` asserted at every point of a
  600-chunk irregular feed; the fluid cadence undisturbed); JS-path
  determinism bit-for-bit; the coupling proven three ways (inert at zero
  density — byte-identical to the uncoupled culture over 40 generations; a
  bare culture dealt the seam by hand from the world's published density at
  the world's strength and seed reproduces the world's culture cell-for-cell
  at every generation; the coupled culture departs from the uncoupled one by
  3,310 cells — the medium is born inoculated at V 0.85, far over the birth
  floor, so births land from the first generation); a two-sim-minute soak
  (960 generations: lawful states, alive 2,168 / decaying 1,330 at seed 42,
  the published field honest against the state grid); gate-off inertness;
  simLaw honesty at both kernel doors, composed.
- `gl/cultureLifeHost.selfcheck.mjs` — 5 groups over the pure planner.
- `gl/parity/cultureLifeSim.selfcheck.mjs` — the GPU kernel against the
  world's JS reference, seeded from a culture world's birth grid, the JS side
  advanced only through the world's scheduler, the GPU dealing births in
  shader space from the world's own density sequence (one density texture per
  generation — `__kcCultureBirthsSeqRun`, added to the existing
  `gl/parity/cultureSim.html` harness). **The law is exact equality, every
  generation** (the culture is integer state; K2 slice-1 precedent): byte-
  identical at all 40 generations, plus a zero-density control. The one
  documented boundary — the shader's birth-threshold compare is float32 (see
  `CULTURE_BIRTH_FS`), so a draw within ~2^-24 of its chance could flip — is
  guarded by measurement, not hope: the suite first asserts every candidate
  draw of the run lands more than 1e-5 from its threshold (measured closest:
  2.62e-5, seed 20261122), two orders past the compare window.

Targeted neighbours, all green: cultureWorld (Phase 0, unmodified),
cultureFluid, cultureFluidHost, dishLife, dishLifeStage, dishFluidCouple,
dishLifeCoupling, dishCultureCells, gpuCultureHost, simBackends, and the
parity neighbours cultureSim + cultureFluidSim.

Publish ritual: lint 0 errors (11 warnings, all pre-existing, none in touched
files) · format:check clean · production build green.

**Full manifest sweep: 801 PASS / 3 FAIL over all 804 real suites** (log:
`sweep-culture-p1-k2.log` in the worktree root; real suites only — the
manifest's 5 `#` comment lines are not counted as suites). The three failures
are the known sandbox-environmental set, each A/B-proven this session against
a pristine detached worktree at origin/main with identical results:
swarmWasm (exit 1 on both — the sandbox cannot reproduce the Rust wasm
build), rollSafety (exit 1 on both), accum (abort, exit 134 on both — the
sandbox WebGL path). None is this slice's.

## Design calls made (coordinator-visible)

1. **Cadence divisor 15** (8 generations/second): the tempo the parent issue
   states for the kernel today, not a new tempo invented for the world. CPU
   cost ≈ 1.4 s of wall per two sim-minutes for the whole world (fluid +
   culture) on the JS path, measured in the soak.
2. **One standing coupling constant** (`CULTURE_COUPLING = 0.5`) drives the
   world's birth seam: on the live stage a single COUPLE dial drives the
   coupling and the kernel sanitizes an unspecified dial to 0.5; the world
   has no performer dial yet, so it stands at that 0.5 until a later phase
   hands it one. The seed density (0.3) is likewise the core's own default —
   the density class the #1923 spike proved the pickup rule grows from.
3. **The reverse coupling (culture level → fluid feed) is deferred, on
   purpose.** The parent issue scopes the coupling as two-way, and the live
   stage carries both directions (stepFluid's culture input; the births
   seam). In the world this slice wires the direction the coordinator's
   brief names — the medium's density into the culture, via
   `cultureFluidDensity` — and leaves the level→feed direction for a later
   slice, for two recorded reasons: (a) it changes the medium's evolution,
   so K1's parity suite (the world's fluid against the GPU kernel under the
   kernel defaults) would stop comparing like with like and needs a
   generation-segmented culture-input run of its own; (b) on the GPU side
   it needs the culture's level published as a texture the fluid mirror
   reads (the gpuFluidHost pattern), which no world host publishes yet.
   Wiring it is a slice, not a side effect. Flagged here rather than chosen
   silently, per the brief.
4. **`world.grid.cells` is not mirrored from the culture.** Phase 0's grid
   stays the shared soil grid, all-dead at birth, exactly as its suite pins
   it; the culture's state lives in `world.life` and publishes through its
   field — the same publication contract every dishLife consumer already
   reads. Phase 4 (the soil as ground) owns how the ecology reads the
   ground; it can read `cultureLifeField` without this slice pre-deciding a
   second, mirrored copy of the state.
5. **The GPU host ships unwired**, mirroring the K1 host's posture: the
   world is not rendered yet, so a live GPU consumer would be cost without a
   reader. The host, its planner and its parity proof land now so a later
   phase wires a proven mirror, not a sketch.
