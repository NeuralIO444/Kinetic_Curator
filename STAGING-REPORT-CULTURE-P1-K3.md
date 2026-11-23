# STAGING REPORT — CULTURE Phase 1, slice K3: the swarm/contacts kernel in the world

- Branch: `feat/culture-phase1-k3`, based on origin/main `61c9183c` (Phase 0 gate, K1 fluid, K2 Life culture merged).
- Parent issue: (2188) — kernel sub-program K3. This slice finishes no issue; the parent issues stay open.
- Phasing: `docs/design/culture-phasing.md`, Phase 1 item 3. Spec: `docs/design/physics-creature-foundation-spec.md` §5.4 (stamp honesty).
- Posture: the world stays gated (`cultureDish` off by default); nothing here is wired into the app or the live stage. The live stage's swarm/contacts are untouched and keep working exactly as they do.

## What shipped

**`app/src/engine/cultureSwarm.mjs` (new)** — the world's JS swarm/contacts core (backend `js.swarm.v1`), pure and import-light like its K1/K2 siblings:

- `stepCultureSwarm(bodies, params)` — the cloud-core boids maths of `particles.js` / `gl/swarmSim.mjs` in JS form: two-phase (forces computed from the pre-step state, then integration — the kernel's ping-pong shape), canonical ascending-j all-pairs order, `dtFrames` fixed at 1, the speed clamp, and the cloud wrap at pad 120. Standing values `CULTURE_SWARM_PARAMS` are the shipped cloud core's (`sepR 35, aliR 60, cohR 70, sepW 1.8, aliW 1.0, cohW 1.5, damping 0.95, maxSpeed 8.0`).
- `cultureContactPairs(bodies)` — contact **detection only** (resolution is Phase 2's solver): the predicate and geometry of the shipped detector's oracle (`referenceContacts` in `gl/dishContactsGpu.mjs`) — both radii > 0, `d² < (ra+rb)²`, coincident discs take the deterministic golden-angle normal, canonical order (a ascending, then b). One deliberate difference: no same-stratum skip — the world is a single population, so every overlapping pair is reported.
- `cultureSwarmHash(bodies)` — an FNV-1a fingerprint over step/count/alive/x/y/vx/vy/mass/radius.
- Extent: `CULTURE_SWARM_WORLD_W/H` = 1920×1080 px — the dish is the 96×54 stage grid at exactly 20 px/cell on both axes (a stated starting constant of this slice, tunable later, not inherited law).

**`app/src/engine/cultureWorld.mjs` (edited)** — the world carries the kernel:

- The body table gains `vx`, `vy`, `mass` (born 1), `radius` (born 0), and its own `step` counter. Bodies are still Phase 5's to create; the app's standing population stays 0.
- Cadence: `CULTURE_SWARM_STEP_DIVISOR = 2` — one swarm step per two world steps (60 steps/s at the world's 120 Hz fixed step), driven from `stepCultureWorld` (order: fluid → life → swarm). No clock of its own.
- Stamp door: `world.swarmBackend` is born `js.swarm.v1`; `setCultureSwarmBackend(world, id)` is the single door, validating against `KNOWN_SIM_BACKENDS.swarm` only — the contacts kernel's ids (`js.contacts.v1` / `gpu.contacts.v1`) and every foreign id are refused and leave the stamp untouched. `cultureWorldSimLaw` now composes all three kernels through `simLawFor`: js-exact while every kernel is `js.*`, decisions-exact the moment any names a `gpu.*` id.
- `cultureWorldHash` mixes the swarm stamp and the swarm fingerprint; `cultureSwarmContactPairs(world)` is the world's detection accessor.

**`app/src/gl/cultureSwarmHost.mjs` (new)** — the GPU mirror host, unwired, on the K1/K2 pattern over the shipped kernel (`createGpuSwarm`):

- Pure planner `planCultureSwarmSteps(held, seed, count, targetStep)`: reseeds on no held mirror, a new seed, a **changed population count**, or a target behind the held step; catch-up bounded at 64 steps/call. One deliberate difference from the fluid/life planners: **on reseed, `from = target` and `steps = 0`** — the mirror seeds from the world's table as it stands, because bodies are dealt, not derived from the seed. (A same-count re-deal mid-run is Phase 5's dealing-API/epoch problem, not this slice's.)
- The GL half seeds the kernel from the world's table at seed time, steps in lockstep with `cultureSwarmKernelParams()` (the standing values over the dish extent, bounds `wrap`, no attractor/wind — fields are a later phase), and reads back **synchronously** via `sim.read()` — the shipped swarm kernel has no PBO/fence readback path; that is stated in the module header rather than papered over. `CULTURE_SWARM_HOST_BACKEND = 'gpu.swarm.v1'`. The host never touches the world's stamp or JS state.

**`app/src/gl/parity/swarmSim.html` (additive)** — `window.__kcCultureSwarmHostRun` joins the existing harness functions (the K2 additive-harness precedent): deals a population into a fresh world in the page, steps the world through its own scheduler with the host mirroring every frame, returns both states.

**Suites** (all added to `app/selfcheck.manifest`; package.json untouched):

- `app/src/engine/cultureSwarm.selfcheck.mjs` (8 groups) — the stamp-door matrix (incl. refusal of the contacts ids), cadence as a pure function of world steps across irregular feeds with the fluid/life cadences undisturbed, bit-identical determinism under irregular feeds, hand-computed one-step cases (cohesion-only pair, speed clamp, cloud wrap, dead bodies inert, empty table still counts), the 2,048 cap behaviour, contact hand cases, the oracle relation (below), hash coverage.
- `app/src/gl/cultureSwarmHost.selfcheck.mjs` (7 groups) — the planner, the kernel-parameter mapping, and the three-way cap pin: `CULTURE_BODY_CAP === CONTACTS_CAP_BODIES === 2048 === swarmTextureLayout(2048).n`.
- `app/src/gl/parity/cultureSwarmSim.selfcheck.mjs` — the parity proof (below); skips cleanly when no Playwright browser is installed.

## What under the parent issue was already shipped (not re-done)

Issue (2188)'s live-stage scope shipped on main before this slice, in its own slices: the GPU swarm kernel `gl/swarmSim.mjs` (slices 1a–1i: boids core, wind, chemotaxis, Lévy, Lorenz, drives, heading, spine), the shadow + takeover host `gl/gpuSwarmHost.mjs` (`gpu.swarm.v1`, tier S, decisions-exact, JS authoritative), contact detection `gl/dishContactsGpu.mjs` (slice 2a; `referenceContacts` is the contract/oracle), CPU resolution of recorded pair lists `engine/dishContacts.mjs` (slice 2b), and the contacts cap ladder 350 → 1,024 → 2,048 (ladder step 2 was PR #2295; `CONTACTS_CAP_BODIES = 2048`, `data/quality.js` `maxParticlesGpu: 2048`). Their suites (`parity/swarmSim`, `parity/gpuSwarmHost`, `parity/dishContacts`, `parity/dishContactsResolve`, `engine/contacts`, `gl/dishContacts`, `gl/simBackends`) all pass unmodified in this branch's targeted run. This slice builds only the world-side remainder the phasing doc scopes: the kernel available to the CULTURE world over its body table.

No conflict found between the parent issue, the phasing doc, and §5.4. One scoping note: the issue speaks of the swarm and the contacts as one kernel program; the world's stamp vocabulary keeps them as separate kernel ids (`swarm`, `contacts`) in `engine/kernel/simBackends.js`. This slice names only the **swarm** in the world's stamp composition — the world-side contacts are a pure JS predicate over the same table with no second stepper and no GPU producer in the world yet, so there is nothing for a contacts stamp to describe; the contacts door arrives with a GPU producer in the world, and the refusal of contacts ids at the swarm door is pinned by suite so the boundary is explicit rather than accidental.

## The parity law proved

K0 tier for this kernel, per `gl/swarmSim.mjs`'s own header: the GPU kernel is judged against the JS swarm, not bitwise — float32 vs float64 differ at noise and a swarm is chaotic. The bar is **one-step agreement to float noise (max |Δ| < 1e-3 over x/y/vx/vy)** — the bar `parity/swarmSim.selfcheck` set for the same comparison — then bounded speed / no NaN / character statistics over a long run.

Measured in `parity/cultureSwarmSim.selfcheck` (120 bodies dealt deterministically into a culture world; the JS side advanced **only** through the world's scheduler to swarm step 60; the kernel driven with parameters built in-suite from `CULTURE_SWARM_PARAMS`, independently of the host's mapping):

- One step: kernel vs world JS core max |Δ| = **3.05e-5** (bar 1e-3). The mirror host, seeded from the same birth table and stepped by the world in the page, matches at the same **3.05e-5**.
- 60 steps: both sides finite; speed clamp holds on both sides (max 8.000 vs clamp 8.0); mean speed JS 6.231 vs GPU 6.231; population centroid distance 0.0 px.
- Host lockstep: mirror step equals world swarm step at 1 and at 60; backend reported `gpu.swarm.v1`.

Contacts agreement: the engine suite proves the **world predicate against the shipped oracle** — over a two-stratum split (index parity) of one dealt table, every `referenceContacts` pair is a world pair with matching normal/overlap (< 1e-9), and the world's remaining pairs are exactly the overlapping same-parity pairs (brute-forced in the suite). The GPU detector's own agreement with its oracle remains slice 2a's shipped suite's claim and is not re-proved.

## Design calls (coordinator-tunable defaults, not rulings)

- **Dish extent 1920×1080 (20 px/cell)** — the stage grid is 96×54; a square-cell extent keeps the kernel's pixel radii (35/60/70) meaningful against the grid. Stated in the module header as a starting constant.
- **Detection only, no resolution** — the phasing doc puts the solver in Phase 2; the world's predicate produces the canonical pair list a solver will consume.
- **Contacts unnamed in the stamp this slice** — see the scoping note above.
- **Synchronous host readback** — the shipped kernel's only read path; the header says so.
- **Planner reseed adopts the target** — bodies are dealt, not seed-derived; documented in the host header and pinned by suite group B.

## Verification

- `npm run lint` — 0 errors (11 warnings, all pre-existing in files this slice does not touch; none in slice files).
- `npm run format:check` — clean (prettier `--write` applied to 4 slice files during the ritual).
- `npm run build` — green.
- Targeted suites — 17/17 exit 0: the three new suites; `cultureWorld`, `cultureFluid`, `cultureLife` (Phase 0/K1/K2, **unmodified** — gate-off parity); `cultureFluidHost`, `cultureLifeHost`; `cultureFluidSim`, `cultureLifeSim` parity; and the shipped swarm/contacts neighbours (`engine/contacts`, `gl/dishContacts`, `gl/simBackends`, `parity/swarmSim`, `parity/gpuSwarmHost`, `parity/dishContacts`, `parity/dishContactsResolve`).
- Full manifest sweep — **804 PASS / 3 FAIL over 807 real suites** (manifest `#` comment lines not counted; the 3 new suites are in the 807 and pass). The 3 failures are the standing sandbox-environmental set, A/B-verified against a pristine detached worktree at origin/main in this slice: `engine/kernel/bake/swarmWasm` (exit 1 on both trees), `fx/rollSafety` (exit 1 on both trees), `gl/accum` (fails on both trees — abort exit 134 in this branch's sweep under memory pressure, exit 1 standalone on main; the same heavy browser/native section, and the sweep process itself was OOM-killed by the sandbox after printing its final tally). None of the three touches the culture world or anything in this slice's diff. Sweep log: `sweep-k3.results` / `sweep-k3-failures.log` in the worktree root during staging (scratch, not committed).
- Environment note: this worktree initially had no `node_modules` of its own and tool resolution silently borrowed a sibling checkout's install; `npm install` was run in the worktree's `app/` before lint/format/build so every number above is against this tree's pinned deps.

## Not done, deliberately

- No wiring into the app, the shell seam, or the live stage; the standing population stays 0; gate-off behaviour is byte-identical (Phase 0/K1/K2 suites pass unmodified).
- No contact resolution (Phase 2), no fields/hand (Phase 3), no citizens or dealing API (Phase 5).
- One-writer files untouched: `app/src/gl/liveLoop.mjs`, `app/src/gl/liveResolve.mjs`, `app/src/engine/particles.js` — no seam in any of them was needed; the JS core re-derives the cloud maths in the world's own module, as K1/K2 re-derived theirs.
