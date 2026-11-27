# STAGING REPORT — CULTURE Phase 3, slice A: the Queen's fields and the ferro force

Branch `feat/culture-phase3-fields` on origin/main `59791100` (Phase 2 merged).
The parent issue (2178) stays open; the parent umbrella (1183) stays open.
This report is the builder's record for the coordinator's QA loop. Nothing here is merged.

## What shipped

- **NEW `app/src/engine/cultureFields.mjs`** — the standing-fields core. Two
  tables (the fields table, cap 64; the field-request log, cap 256), the one
  spec reading every door shares (`normalizeCultureFieldSpec`), the field step
  (`stepCultureFields`), and the FNV-1a fingerprint (`cultureFieldsHash`) in
  the cultureSolverHash discipline. The one kind dealt is the **magnet**
  (kind 0): a point attractor with a position, a strength, and a gaussian
  reach (default radius = the fluid kernel's `MAGNET_RADIUS` at the dish's
  width, ≈163 px; default strength 0.3 velocity/step at density 1, falloff 1).
- **`app/src/engine/cultureWorld.mjs`** — the world is born with both tables
  empty; `stepCultureWorld` runs the field step on the swarm's cadence,
  immediately **before** the swarm's integrator (forces first → the core
  integrates, its damping and speed clamp spending field-given velocity like
  any other → the solver resolves). The Queen's doors live here, in the stamp
  doors' refuse-loudly idiom: `dealCultureField`, `moveCultureField`,
  `retireCultureField`, `requestCultureField`, `resolveCultureFieldRequest`.
  `cultureWorldHash` now folds `cultureFieldsHash(fields, fieldRequests)` in
  whole. No new backend stamp: the fields are resolver-class CPU JS, like the
  solver, and the world's law composition is unchanged (suite-pinned js-exact).
- **NEW `app/src/engine/cultureFields.selfcheck.mjs`** (9 groups) + one
  manifest line. `package.json` untouched. One-writer files untouched
  (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js` are not in the diff).

## The Queen-ownership asymmetry, enforced structurally

Spec §4 Q4 is not a convention here; it is the shape of the code:

- The fields table has exactly **one write path**: the Queen's doors in
  cultureWorld.mjs. There is no exported mutator on the table itself, and
  `stepCultureFields` only reads it.
- `requestCultureField` (the only door recipes/personas get) validates the
  spec through the same normalizer a deal uses — the log can hold no request
  the Queen could not deal — and writes **only** to the request log. Suite
  group 3 proves the inertness, not just asserts it: with a request pending,
  the fields count is 0 and a dealt body's trajectory is bit-identical to a
  control world that never heard the request.
- `resolveCultureFieldRequest` is the only path from request to field. Apply
  deals the stored spec **verbatim** (defaults were filled at request time,
  so the log is the record); decline deals nothing, ever. A spent request
  cannot be resolved twice (refused). Applying against a full fields table
  refuses loudly and leaves the request pending (group 9).
- "Under the Governor's direction" (§2.7: the Governor manages, never
  touches the dish) is what the door shape means: direction arrives as calls
  to the Queen's doors because there is no other hand to write through.
- Indices are never reused or shifted: retiring clears an active flag and
  the slot stands, so a recorded field index can never come to name a
  different field (group 7).

## The ferro force: pull law and field-gating evidence

The pull law is Matt's ruling on the parent issue (2026-11-15): **toward the
magnet, field-gated**. Implemented exactly:

- **Direction** — the unit vector from the body to the magnet, the magnet
  model the fluid kernel already carries (a placed point the field gathers
  around).
- **Gate** — the pull at a body scales with the fluid's published density at
  the body's own cell (`cultureFluidDensity`, the K1 medium, read at its
  last completed state — the dish's one-step-behind discipline, the same
  read the culture coupling makes). No fluid, no pull.
- **Falloff** — the kernel's own magnet shape, exp(−(d/R)²) over the field's
  radius; multiple magnets compose additively (the kernel's reading).
- **Not mass-divided** (design call, below): the field is the dish's
  weather; mass speaks through contacts, not through the medium.

Evidence (suite group 4, hand-computed at the field step): a body one radius
from a strength-0.4 magnet in a density-1 cell gains exactly 0.4·exp(−1)
toward the magnet and nothing sideways; density 0.5 gives exactly half;
density 0 gives exactly zero; the diagonal case matches the unit-vector law
to 1e-7; a body exactly on the magnet and a dead body feel nothing; two
coincident magnets add. Group 5 repeats the gating against the world's real
seeded medium: wet cell pulls (velocity and position toward the magnet),
dry cell with a two-cell moat feels exactly nothing after a fluid step.

Fields are never bodies (group 6): the fields table carries no mass and no
alive columns (its `radius` is the field's reach, not a contact disc); the
contact dealer over a pair straddling a magnet returns exactly the one disc
pair; the solver's state is untouched by any field; and a settling pair
under a strong magnet in dry country settles bit-identically to its control.

## Step order / cadence call

Fields step on the **swarm's cadence** (divisor 2, 60 steps/s),
`fields.step == floor(world.step / CULTURE_SWARM_STEP_DIVISOR)`, inside the
same world step, **immediately before** `stepCultureSwarm`. Why: fields are
forces on bodies, and bodies integrate only on that cadence — stepping
fields at 120 Hz would double-apply against the integrator; stepping after
the integrator would let the solver resolve contacts from velocities the
field had not yet informed, and the field's push would sit unclamped for a
step. Before the integrator, the core's damping and speed clamp treat
field-given velocity exactly like boids-given velocity, so the Phase 2
clamp invariant (no body leaves a world step faster than the core allows)
holds for field pushes too, with no new clamp code.

## Design calls (coordinator-visible)

1. **The current/flow kind is scoped out to slice 3B.** The spec's field
   vocabulary names exactly one more field — the hand's current (§4 Q3, the
   parent issue 2153) — and the tasking assigns it to the next slice. This
   slice deals the magnet plus the general machinery (kind column, per-kind
   dispatch in the step, the shared spec normalizer) so 3B adds a kind, not
   a system. The doors refuse an unknown kind by name — including 'current'
   and 'hand' (suite-pinned), so nothing can half-deal the hand early.
2. **A dealt magnet does not bias the fluid's growth in this slice.** On the
   live stage, stamped magnets bias the kernel's feed/kill (the dark phase
   grows toward a magnet). In the world, K1 deliberately stood the medium
   unbiased and proved its character in that state; the pull law's gating is
   a *read* of the medium as it stands. Rewiring `stepFluid` to take the
   Queen's magnets changes the medium's evolution and K1's parity basis, and
   deserves its own slice with its own parity proof rather than riding in
   silently on this one. Flagged here, not hidden: if the coordinator wants
   the growth bias in the world, it is a small, separate follow-up.
3. **Acceleration is not divided by body mass.** The swarm's own forces are
   per-mass; the field is environmental (like the cloud's boundary law,
   which is also not per-mass). Every world body is mass 1 at birth today,
   so the choice is unobservable in the app; it is recorded so iteration
   tunes it knowingly. Strength is stated in velocity/step at density 1.
4. **Removal retires; it never compacts.** See the asymmetry section —
   index stability is worth more than slot reuse at cap 64.
5. **No new stamp.** Fields are world-side JS by the solver's resolver-class
   discipline; `cultureWorldSimLaw` is untouched and the suite pins the
   world law at js-exact with fields dealt, moved, and resolved.

## Issue 2178: already-done / superseded / in conflict

Read in full (body + all comments) before coding.

- **Already done on the live stage (not redone):** channel 2 (bone pull)
  and the GPU field-body channel shipped in PR #2190; the one-force seam
  (PR #2235) then unified the stage's forces. None of that is this slice's
  surface: this slice is the **world side** — the same pull law standing in
  the gated culture world, on the world's body table, behind the gate.
- **The pull law applied here is the issue's own ruling** (comment of
  2026-11-15: toward the magnet, field-gated; direction from the kernel's
  magnet model; strength gating on the published density at the body's
  position). Open question 3 (two forces on one bone) was answered by the
  one-force seam for the stage (fixed order, culture first, fluid second);
  in the world the composition is the step order itself — fields before the
  integrator, the solver after — and no second body-force exists in the
  world yet to compose against.
- **Scoped out of this slice, per the tasking:** channel 1's fragment grain
  and channel 3's finer grid (stage-side, still queued on the issue as
  written); the hand as current (Phase 3B); the world-side culture→fluid
  reverse coupling K2 deferred (Phase 3B/4). The issue's "no new dials
  beyond PULL" line is honoured: the world's magnet strength is the field's
  own dealt property (the world's PULL, per-field), not a new performer dial.
- **No conflict found** between the issue's rulings and the phasing doc's
  Phase 3 assignment; the one divergence of emphasis (fluid growth bias) is
  design call 2 above.

## Verification

- **New suite:** `cultureFields.selfcheck` 9/9 groups green, ×3 runs.
- **Neighbours, unmodified and green:** cultureWorld, cultureFluid,
  cultureLife, cultureSwarm, cultureSolver; parity cultureFluidSim,
  cultureLifeSim, cultureSwarmSim (the K3 world-vs-GPU parity holds with the
  field step in the composition — no fields dealt there, and the empty table
  is a bit-exact no-op, suite group 2); the three Host suites.
- **Lint:** 0 errors (11 warnings, all pre-existing in untouched files).
  **format:check:** clean. **Build:** green (one pre-existing
  dynamic-import warning, same as Phase 2). The 1-line package-lock churn
  from `npm install` was reverted, matching the K3/P2 slices.
- **Full manifest sweep: 806 PASS / 3 FAIL over 809 real suites** (manifest
  `#` comment lines not counted; the count grew 808 → 809 by this slice's
  one suite). Log kept at `sweep-culture-p3a.log` in the worktree root. The
  3 failures are the standing sandbox-environmental set, each **A/B-verified
  this session** by the builder against a pristine detached worktree at
  origin/main `59791100` with identical exit codes: swarmWasm 1/1,
  rollSafety 1/1, accum 134/134. None touches this diff. (The sweep wrapper
  was OOM-killed after printing its final tally line; the log is complete
  at 809/809 suites with the tally line inside it.)

## Next slice (Phase 3B, not built here)

The performer's hand as a current (the parent issue 2153, dish-side
consumption — the hand enters as a field creatures feel, never a body,
§4 Q3) and the world-side culture→fluid reverse coupling deferred by K2.
