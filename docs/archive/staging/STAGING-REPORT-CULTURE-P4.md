# STAGING REPORT — CULTURE Phase 4: the soil (Life as ground)

Branch `feat/culture-phase4-soil` on origin/main `dfbd9c6` (Phase 3B merged).
No issue owns this slice. The parent issue (2152) stays open; the parent umbrella (1183) stays open.
This report is the builder's record for the coordinator's QA loop. Nothing here is merged.

## What shipped

One named component, inside the gated culture world:

- **NEW `app/src/engine/cultureSoil.mjs`** — the soil: the ground reading (`cultureSoilCell`,
  `cultureSoilLiving`, `cultureSoilSample`), the dead-ground kill (`stepCultureSoil`), its state
  (`createCultureSoil`) and its fingerprint (`cultureSoilHash`); constant `CULTURE_SOIL_WITHER_S = 4`.
- **`app/src/engine/cultureWorld.mjs`** — the world carries `world.soil` (one wither clock per body
  slot, the kill count, the soil's step); `stepCultureWorld` runs the soil LAST on every world step;
  two read doors for Phase 5/6: `cultureSoilAt(world, x, y)` and `cultureSoilWither(world, i)`;
  `CULTURE_SOIL_WITHER_STEPS = 480` (4 s at the 120 Hz clock); `cultureWorldHash` folds
  `cultureSoilHash` in whole; header gains THE GROUND paragraph.
- **NEW `app/src/engine/cultureSoil.selfcheck.mjs`** (9 groups) + one manifest line after cultureHand.

One-writer files untouched (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js` are not in the diff).
`package.json` / `package-lock.json` untouched (node_modules symlinked, no install). No new backend
stamp; the world's law composition is unchanged (js-exact, suite-pinned).

## The law this builds (quoted)

- Spec §5.2, Matt 2026-11-22: "**Life is the soil.** The CULTURE dish grows in the #2152 Life layer:
  living ground feeds the ecology — fertility, decay, and creature fortune read it — and dead ground
  kills, exactly as the #2152 ruling already provides. The Life layer is not a separate system running
  beneath a different world; it is this world's ground."
- The parent issue 2152, mechanism ruling (2026-11-12): "**Life is never drawn.** … What reaches the
  stage is only its effect"; kill ruling: "dead ground kills. Something standing on dead ground too long
  withers and is gone; populations genuinely die out in the dead zones."
- Phasing defaults table: "Dead-ground kill — wither over 4 s standing on dead ground"; sim step 120 Hz.

## Design calls (coordinator-style, recorded)

1. **The ground is the K2 culture's published field, nothing else.** The soil reads `world.life.field`
   only (level per cell), never the culture's working grids, and never writes the culture. The world's
   old `grid.cells` (all-dead Uint8Array from Phase 0) is left untouched: writing it would duplicate
   the field and change nothing but the hash. The soil holds no copy of the ground.
2. **Dead ground = level 0 exactly (the automaton's dead state). Decaying ground still lives.** Under
   CULTURE_RULE a cell rots through 6 decay states before it is dead; a rotting colony still has life
   in it (level > 0), so it does not kill. This keeps the kill a reading of Life's own vocabulary
   rather than a new threshold constant.
3. **A body stands on the cell under its centre.** Discs are ≤ 9 px against 20 px cells; a footprint
   rule (any/all cells under the disc) would add a tuning question nobody asked. Recorded so iteration
   can revisit.
4. **Beyond the grid is dead ground** (a body in the swarm's 120 px wrap pad stands on no soil). This is
   the culture core's own RIM law ("cells beyond the grid are dead", dishLife.mjs). Divergence noted:
   the Queen's fields clamp to the edge cell for the *density gate*; that is a medium read, this is the
   soil's own law, and the soil follows the soil's rim.
5. **"Sustained" — one living step restarts the clock.** The 4 s is consecutive standing on dead ground;
   a step on living ground resets the clock to 0. The phasing table's starvation line reads the same way
   ("sustained 5 s"), and it is what makes *dead zones* mortal rather than every maze: measured on the
   world's culture (seed 7, after 10 s), ~30% of cells are dead at any moment but they flicker —
   over 60 s, 1,209 of 5,184 cells (23%) held a dead run ≥ 32 generations (4 s). A cumulative or
   slow-recovery clock would kill bodies in the living maze too; that is a harsher law than ruled.
6. **The soil runs on EVERY world step (120 Hz), last in the step.** The tasking states the kill at the
   world's step: 4 s = 480 world steps, `soil.step == world.step` always. Running last means the soil
   judges where bodies actually stand after the swarm and solver moved them, against the culture's last
   completed generation (at a step where a generation completes, that generation).
7. **The read discipline (one-step-behind).** The soil reads published state only — the last completed
   generation, never a working buffer, never a generation still to come; its verdict reaches every mover
   one step behind (a body killed at step s is first absent from the swarm, contacts, solver, fields and
   hand at s + 1). The read door reads the same published face, so a citizen asking between steps sees
   exactly the ground the kill law judged. The lattice oracle (suite group 5) pins this step for step and
   bites both a soil-before-the-life-branch ordering and a stale one-generation-old snapshot.
8. **Death is `alive = 0`, the clock clears, the kill is counted. Nothing else.** Every system already
   reads the alive flag (swarm, contact dealer, solver incl. links, fields, hand), so a withered body is
   gone everywhere without touching any of them. Corpses (persisting 30 s, looting), cause-of-death
   records, and resurrection are not built — corpse decay is Phase 6. A dead body carries no clock, so
   a later dealing that re-uses a slot starts clean.
9. **The readings** (the read door Phase 5/6 calls, all from the published field, a fresh object):
   `living` (level > 0); `level`; `fertility` = mean level over the cell's 3×3 Moore neighbourhood —
   Life's own neighbourhood — rim cells counting dead, over all nine; `decay` = 1 − level (0 on alive
   ground, rising through the decay states, 1 on dead); `fortune` = fertility on living ground, −1 on
   dead ground (the one signed reading — the kill's sign). These are readings, not laws: no consumer
   reads fertility/decay/fortune yet (feeding, fat, starvation, predation, corpse decay, breeding are
   Phase 6). `cultureSoilWither(world, i)` reads a body's clock over the span (0..1).
10. **Not built: the force's other verbs.** The parent issue lists drift toward living ground /
    thinning / growth as still-open spec questions; only the kill is ruled. The soil writes no velocity.
11. **Read door refuses loudly** (house idiom): a non-finite point is refused (a silent dead reading
    would be a lie); `cultureSoilWither` refuses an index outside the dealt population.
12. **Hash discipline.** `cultureSoilHash` (FNV-1a, the cultureHandHash discipline) covers soil.step,
    soil.killed, the dealt-prefix length and every dealt body's clock; `cultureWorldHash` folds it in
    whole, appended after the hand. No suite pins an absolute world-hash golden (all are twin-equality /
    inequality), so no golden moved.
13. **Resolver-class, no stamp.** CPU JS, a pure function of world state, js-exact. The GPU swarm mirror
    (gl/cultureSwarmHost.mjs) mirrors the swarm only, like the fields/hand/solver; the soil stays JS.

## Re-pins

**None.** Every prior suite passes unmodified. Checked deliberately: the kill only fires after 480
sustained dead-ground steps, and no existing suite steps a populated world that long (longest: the
swarm determinism run ≈ 1.9 s of sim; the solver's linked triangle 144 steps; parity 120 steps), and
the soil writes nothing but alive flags — so no existing trajectory moved.

## Verification

- **New suite `cultureSoil.selfcheck` — 9/9 groups, ×3 runs** (≈7 s):
  1. born with the world: clocks 0, `soil.step == world.step` across irregular feeds, no stamp, an empty
     table kills nothing;
  2. the ground reading hand-computed (alive / decaying-still-lives / dead-beside-living; 3×3 fertility;
     corner rim; cell edges 19.999→0, 20→1; beyond-grid and NaN are dead with the exact dead reading);
  3. the read door: the published field cell for cell over a matured world, read-only (world hash
     unchanged), fresh objects safe to hold, loud refusals;
  4. the wither law's exact timing: alive at 479, gone at 480, clock cleared, killed counted; the dead
     never rise; living and last-decay-state ground never wither; one living step restarts (a fresh 479
     survives, a fresh 480 kills); the wrap pad kills; dead-dealt bodies are never judged;
  5. the read discipline in a real world: 209 resting bodies (a 100 px lattice, beyond every boids
     radius, so none moves) over 30 s of a living soil, against an independent oracle reading the
     published field after every whole world step — every clock and every alive flag equal, step for
     step; 54/209 withered; the run is asserted to include ground reviving on a generation step (so the
     ordering is exercised);
  6. never drawn: the soil module imports only the dish extent (no GL, render or DOM); 960 soil steps
     over 50 bodies change no position/velocity/mass/radius bit and no field/culture bit;
  7. gone from every mover: a withered disc leaves the contact list, and no swarm, hand current or solver
     moves it, while its living neighbour is stirred;
  8. determinism: twin worlds (lattice + 60 seeded movers, 1,500 irregular feeds) bit-identical through
     36 withering deaths, the soil inside the world hash; the hash covers one clock and the kill count;
  9. gate-off inertness: no standing world; the soil is a world instance's state, never a singleton.
- **Mutation tests (each applied alone, suite re-run, reverted; all 12 bite):**
  | Mutation | Caught by |
  |---|---|
  | kill at `> 480` instead of `>= 480` (off by one) | g4 "gone on the 480th sustained step" |
  | no clock reset on living ground | g4 "one step on living ground restarts the clock" |
  | decaying ground counted dead (`level >= 1`) | g4 "living ground keeps its bodies" |
  | rim clamps to the edge cell instead of dead | g2 "(-0.001, 500) stands on no cell" |
  | clock not cleared on death | g4 "a dead body has no clock" |
  | fertility = the single cell's level | g2 "fertility: the 3×3 mean level" |
  | soil moved BEFORE the life branch (one generation stale at boundaries) | g5 "body 0 clock at step 15" |
  | soil reads a snapshot taken at the step's start (stale field) | g5 "body 0 clock at step 15" |
  | soil on the swarm cadence (every 2nd step) | g1 "one soil step per world step" |
  | soil hash not folded into the world hash | g8 "the hash covers a single wither clock" |
  | read door accepts non-finite points | g3 "refuses (NaN, 1)" |
  | wither span 5 s | g1 "wither over 4 s" |
- **Neighbours, unmodified and green:** cultureWorld 5/5, cultureFluid 6/6, cultureLife 8/8,
  cultureSwarm 8/8, cultureSolver 9/9, cultureFields 9/9, cultureHand 8/8; parity cultureFluidSim,
  cultureSim, cultureLifeSim, cultureSwarmSim; host suites cultureFluidHost 5/5, cultureLifeHost 5/5,
  cultureSwarmHost 7/7.
- **Lint:** 0 errors (11 warnings, all pre-existing in untouched files; the three touched files lint
  clean). **format:check:** clean. **Build:** green (pre-existing dynamic-import warnings only).
- **Full manifest sweep (3 parallel): 809 PASS / 2 FAIL over 811 real suites** (810 → 811 by this
  slice's one suite). Log: `sweep-culture-p4.log` at the worktree root (committed), A/B appended. The
  two failures, each A/B-verified this session against a pristine detached worktree at origin/main
  `dfbd9c6`, re-run alone: **rollSafety 1/1** (identical output — headless `page.evaluate: Target
  crashed`, the standing sandbox failure); **accum** rc 137 in the sweep (SIGKILL under 3-parallel
  memory pressure — not the standing 134) but **0/0 alone on both** (87 cases OK). **swarmWasm**, the
  third standing environmental failure, passed in the sweep and alone on both (0/0) this session. None
  touches this diff.
- **Live stage byte-identical with the gate off** (probe: a fresh resolver per mode, 60 frames at
  1000/60 ms each, sha256 over the JSON of every frame's resolved layers; plus sha256 of
  `serializeProject` over the default store state — `cultureDish` defaults false), A/B against a
  pristine detached worktree at origin/main `dfbd9c6`, identical on both and stable across two runs:
  - scatter ×60 `790826a1…842ec3`; grid ×60 `2b86ae62…ff7dd8`; swarm ×60 `9a068d05…ef33d002c7278`;
    swarm-scatter ×60 `e7d50793…bbd927d4`
  - all modes `e853fb6a95dd48123ac40c5a1447b958e9c07145e10bff6a829b13187915a78c`
  - serializeProject (gate off) `9d7d6f7dd7d7f870022a337d1abf110d22516e39cf35038c2b341557497552fd`

## Open questions (none blocking)

- The force's remaining verbs on the parent issue (drift toward living ground, thinning, growth) are
  unruled and unbuilt; the soil only reads and kills.
- Body footprint (centre vs disc) and the sustained-reset reading are tunable calls (5, 3 above),
  flagged for Matt's iteration pass.
- Phase 6 will decide what fertility/decay/fortune actually *do* (feeding yield, corpse rot rate, …);
  the readings are shaped to be read, not yet consumed.

## Next slice (Phase 5, not built here)

Citizens: Motion Core, rig spawning, gait, the first citizen. Citizens call `cultureSoilAt` /
`cultureSoilWither` for the ground they stand on; the kill already applies to whatever bodies they are
dealt as.
