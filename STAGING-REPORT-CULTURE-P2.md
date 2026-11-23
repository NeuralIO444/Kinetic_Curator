# STAGING REPORT — CULTURE Phase 2: the solver and collision shapes

Branch `feat/culture-phase2-solver` on origin/main `11bf8e5c` (Phase 0 gate,
K1 fluid, K2 Life, K3 swarm/contacts merged). Parent issue (1598) stays open;
this slice finishes no issue.

## What shipped

- **NEW `app/src/engine/cultureSolver.mjs`** — the world's physics solver,
  pure CPU JS. One step is four movements in a fixed order:
  1. **DETECT** — disc-vs-disc pairs from K3's `cultureContactPairs`
     (canonical all-pairs detector, the only pair source; no spatial hash in
     the world) plus disc-vs-static-AABB detection per body over the dealt
     statics.
  2. **IMPULSE** — mass-weighted normal impulse, approaching pairs only,
     restitution 0. Statics enter the same law at infinite mass.
  3. **PROJECT** — positional correction, 3 iterations: disc pairs split the
     overlap by inverse mass along the detected normal (overlap recomputed
     per iteration); statics are recomputed geometrically per iteration and
     the disc takes the full move; distance links are projected to rest
     length, split by inverse mass; coincident linked endpoints separate
     along the K3 golden-angle normal.
  4. **CLAMP** — the swarm core's max speed (8) re-applied as the final
     movement (see the clamp finding below).
  Exports: `stepCultureSolver(bodies, statics, links)`,
  `createCultureStatics()`, `createCultureLinks()`,
  `cultureSolverHash(statics, links)`; constants
  `CULTURE_SOLVER_RESTITUTION = 0`, `CULTURE_SOLVER_ITERATIONS = 3`,
  `CULTURE_STATICS_CAP = 256`, `CULTURE_LINKS_CAP = 4096`.
- **`app/src/engine/cultureWorld.mjs`** (edited) — the world is born with
  `statics`, `links`, and a `solver: { step }` counter, all empty/zero.
  `stepCultureWorld` runs `stepCultureSwarm` then `stepCultureSolver` inside
  the same cadence branch, then counts the solver step. New dealing doors in
  the world's stamp-door idiom: `addCultureStatic(world, box)` and
  `addCultureLink(world, a, b, rest?)` (rest defaults to the endpoints'
  current distance). Both refuse loudly: full table, inverted or non-finite
  box, self-link, endpoint outside the dealt population, negative or NaN
  rest. `cultureWorldHash` additionally mixes the solver step count and
  `cultureSolverHash(world.statics, world.links)`. Header documents the
  solver paragraph. **No new backend stamp** — the solver is resolver-class
  CPU JS under the Full WebGL standing ruling; the world's law composition
  is unchanged.
- **NEW `app/src/engine/cultureSolver.selfcheck.mjs`** — 9 groups (below),
  registered in `app/selfcheck.manifest` after the cultureSwarm line.
  `package.json` untouched.

## The shape ruling — from the parent issue's own text

Issue (1598) body and comments were read in full before any code. The issue
rules the shape question itself:

> "The dish is a disc engine: every body is a circle, every contact is
> disc-vs-disc. D4 adds exactly one shape pairing: disc vs static AABB…
> Discs stay primary. AABB statics are scenery: infinite mass, no ω, no
> links."

Implemented exactly that: discs are the only dynamic shape; statics are
axis-aligned boxes with infinite mass, no angular state, no links. The
issue's "only where needed / builds when a real scene names the box" gate is
answered by the phasing doc, which names Phase 2 as the build trigger; the
statics table is born empty — no scene has dealt a box yet.

## Design calls (coordinator-visible)

- **Restitution 0.** Spec §3.5 names no value; §2.3's law is "drift,
  collide, gather, and clump." Perfectly inelastic is the simplest stable
  scheme that clumps and can never add energy. A starting constant, tunable.
- **Solver cadence = the swarm's** (divisor 2, 60 steps/s, inside the same
  branch of `stepCultureWorld`). Contacts exist only where the swarm's
  integrator just put bodies; resolving on any other cadence would resolve
  stale or skipped snapshots.
- **Compound bodies scoped as discs + distance links at the solver layer**
  (§2.4's joints; the D3 mechanism). Assembling compound bodies from WetLab
  rigs and dealing them into the world is rig spawning — Phase 5 (parent
  issue 2168) — scoped OUT here explicitly, not silently. The link table and
  its projection law are this slice's compound-body deliverable.
- **Divergence from the parent issue, flagged not hidden:** the issue says
  friction/spin at a box contact reuse D1/D2's machinery. That machinery
  (`dishMedium.mjs` / `dishSpin.mjs` via `dishContacts.mjs`) lives in the
  legacy strata pass, which the culture world does not enrol; the world body
  table has no ω column and no per-body wetness. In the world, the issue's
  underlying claim holds in the only form available: the normal-impulse law
  does not care that one side is a box (statics enter the same two passes at
  infinite mass), and tangential response is the swarm core's damping. No ω
  column was added — the "only where needed" discipline.

## The clamp finding (found by verification, not assumed)

With the solver first wired into the world step, the K3 parity suite
(`gl/parity/cultureSwarmSim.selfcheck.mjs`) failed one check: "long run: the
speed clamp holds — JS 8.014, GPU 8.000." Sequential pair impulses compound
slightly past the core's clamp. Fixed by re-applying the core clamp as the
solver step's final movement — a world-level invariant — NOT by weakening
the suite. The parity suite passes unmodified.

One suite assertion was corrected during development, with the cause
recorded in the suite: the resting-clump group first asserted the detector
reports zero pairs after settling — impossible, since the detector reports
any positive overlap and float32 columns cannot hold exact touching. The
assertion now bounds every reported pair's overlap to the same <1e-3
tolerance the settle check uses.

## Verification

- **Solver suite: 9/9 groups green, run 3×.** Born empty + cadence + no
  stamp; parity (no contacts ⇒ swarm alone bit-for-bit; unreached statics
  inert with contacts present); hand-computed contacts (equal-mass head-on →
  both v = 2 exactly, positions 97.5 / 117.5 exactly touching, momentum 8
  conserved exactly; unequal zero-momentum pair → both stop; separating pair
  gets no impulse but is depenetrated); resting 6-disc clump settles (max
  overlap < 1e-3, velocities exactly 0); energy (120 solver-only steps, KE
  never gained, clamp holds; direct clamp case (6,8) → speed 8, direction
  preserved); disc-vs-AABB (face stop with tangential velocity kept,
  receding, corner exit, centre-inside exit through the minX face to x = 90
  exactly, resting fixed point); links (stretch/compression settle to rest,
  centroid unmoved; linked triangle holds within 5% through 72 world steps
  after a shove; door refusals); determinism (irregular feeds → identical
  world hash; a 1px static shift changes the hash); caps (statics 256 +
  links 4096 fill-and-refuse; a full 2,048-body table solves finite).
- **Gate-off parity:** Phase 0/1 suites pass UNMODIFIED — cultureWorld,
  cultureFluid, cultureLife, cultureSwarm, cultureFluidHost,
  cultureLifeHost, cultureSwarmHost, parity cultureFluidSim, parity
  cultureLifeSim, parity cultureSwarmSim (after the clamp fix above).
- **Lint:** 0 errors (11 warnings, all pre-existing in untouched files).
  **Format:** `format:check` clean (prettier applied to the new suite and
  cultureWorld.mjs; suites re-verified green after formatting).
  **Build:** green (one pre-existing INEFFECTIVE_DYNAMIC_IMPORT warning).
  The 1-line package-lock churn from `npm install` ("license": "MIT") was
  reverted, matching the K3 slice's handling.
- **Full manifest sweep: 805 PASS / 3 FAIL over 808 real suites**
  (continue-on-error loop over `app/selfcheck.manifest`; log kept at
  `sweep-culture-p2.log` in the worktree root). The 3 failures are the
  standing sandbox-environmental set, each A/B-verified this session against
  a pristine detached worktree at origin/main `11bf8e5c` with identical exit
  codes: `swarmWasm` 1/1, `rollSafety` 1/1, `accum` 134/134 (abort). None of
  the three touches anything in this diff.
