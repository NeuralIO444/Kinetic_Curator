# STAGING REPORT — CULTURE Phase 3, slice B: the hand as a current, and the dish talks back

Branch `feat/culture-phase3b-hand-current` on origin/main `fd467681` (Phase 3A merged).
The parent issue (2153) stays open; the parent issue (2178) stays open; the parent umbrella (1183) stays open.
This report is the builder's record for the coordinator's QA loop. Nothing here is merged.

## What shipped

Three named components, all inside the gated culture world:

1. **The hand as a current** — NEW `app/src/engine/cultureHand.mjs` (the currents
   table, the spec reading, the step, the fingerprint) + the performer door
   `dealCultureHandCurrent` in `cultureWorld.mjs` + NEW suite
   `cultureHand.selfcheck.mjs` (8 groups) and one manifest line.
2. **The reverse coupling K2 deferred** — `stepCultureWorld` now hands
   `stepFluid` the culture's published field at the standing coupling strength;
   the GPU fluid host mirror is fed the same inputs.
3. **The magnet growth bias 3A flagged as owed** — the fluid step also reads
   the Queen's dealt magnets (`cultureFieldMagnets` in `cultureFields.mjs`),
   weighted per field; the kernel pair (JS + GLSL) gained an optional
   per-magnet weight, absent = 1 everywhere it is not dealt.

One-writer files untouched (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js`
are not in the diff). `package.json` untouched; the 1-line package-lock churn
from `npm install` was reverted, matching the K3/P2/3A slices. No new backend
stamp; the world's law composition is unchanged (js-exact, suite-pinned with
currents dealt and stepped).

## Component 1 — the hand as a current (the parent issue 2153, dish-side)

The ruling that decides the shape, spec §4 Q3 verbatim: "**What is the
performer's hand in the zoo?** — **A force, never a body.** The hand stirs and
scatters; finger painting (#2153) enters the dish as a current the creatures
feel, not as a physical object they collide with." The issue's own direction
(Matt, 2026-11-12): "**The finger paints into the dish.** Hand tracking …
makes the fingertip a hand in the dish: painting the wet field, laying scent
and trails, pushing marks — the instrument answers the stroke with its own
systems." The phasing doc's Phase 3 assignment: "hand input enters as a
current field creatures feel, never a body (§4 Q3). The on-device camera
proof is Matt's and tracked separately; it does not block this phase."

Design calls (coordinator's direction, recorded):

- **The door is the performer's own.** The current does NOT go through the
  Queen's standing-field doors and is NOT a persona request — the user's own
  hand outranks personas, the override law KC-1 holds everywhere. The Queen's
  spec reading still refuses the 'current' kind by name (suite-pinned in
  cultureHand group 5, alongside her deal and request doors refusing it), so
  nothing half-deals the hand through her table. The current lives in its own
  table in `cultureHand.mjs`; `dealCultureHandCurrent` is its only write path.
- **Spec:** `{ x, y, vx, vy, radius?, strength?, lifeSteps? }` — position plus
  the flow as ONE vector (direction and speed together: the stroke's own
  motion), a reach, a strength, a life. A zero or non-finite flow is refused:
  a current with no direction is not a current. Defaults: radius = the
  standing field reach (the magnet's radius at the dish's width, ≈163 px);
  strength 0.5 velocity/step at falloff 1 (brisker than the magnet's 0.3 — a
  stir is an act, not weather; the swarm clamp stays the ceiling either way);
  life 30 current steps = 0.5 s at the 60 steps/s cadence (a flick).
- **Mechanics:** on the swarm's cadence, after the Queen's fields and before
  the swarm's integrator (standing forces first, the performer's hand last
  among forces — the override's place — then the core integrates, then the
  solver resolves). Each living current, in dealt order: ages one step; if
  its age has passed its life it retires BEFORE pushing (a current pushes on
  exactly its dealt life of steps); otherwise its centre **advects with its
  flow** (a gust travelling the way the fingertip moved), then pushes from the
  new centre. The push is **along the flow's direction at every point in the
  reach** — a stream, not a sink — with the dish's gaussian falloff
  exp(−(d/R)²). A body exactly on the centre is pushed like any other: no
  singularity (the magnet's on-point skip exists because its direction is
  body-relative; the current's is not). Strength is constant while the current
  lives; not divided by mass (the fields' weather discipline); **not gated on
  the medium's density** — the gate is the ferro law (the field gathers where
  the medium stands); the hand stirs the bodies directly, which is what
  "stirs and scatters" says.
- **Slot reuse, a recorded divergence from the fields table:** a retired
  current's slot is re-dealt (first retired slot, else append, else refuse at
  the cap of 64 living gestures). Fields never reuse indices because a take
  may name a field for its whole life; a gesture leaves no such record, and
  an append-only table would size itself by a performance's length, not by
  the hand. The deal order is a pure function of the table's active flags, so
  determinism is untouched (twin-world hash equality is suite-pinned).
- **The hash:** `cultureWorldHash` folds `cultureHandHash` in whole — a
  living current's full gesture; a retired slot contributes only its flag
  (its residue can steer nothing but a future slot choice, which the flags
  already decide).
- **Force, never a body, suite-pinned (group 6):** a hand step changes no
  position bit; the contact dealer over discs straddling a current returns
  exactly the disc pairs; the table has no mass/radius columns to collide
  with. Born empty, dealt only through the door; the shell seam stays a seam
  (no live wiring — the world is gated and unpopulated).

**Issue 2153: already answered / scoped out, with the issue's own words.**
The comment of 2026-11-12 records Matt's answers: (1) "What a stroke writes:
all three, behind modes" (wet, scent, marks); (2) "The hand: index finger
only. Pinch lifts the pen."; (3) "Strokes are recorded in the take and replay
exactly."; (4) "The hand conducts too, while it paints." Scoped OUT of this
slice, per the tasking and the issue's own acceptance lines: the device side
(MediaPipe tracking, camera permission, the WebView story — "Builds when Matt
orders it; one slice, his review lane"; the on-device proof is Matt's); the
take's input-stream recording (a shell/takes concern — the gated world
records no takes yet, and the door's dealt spec is exactly the recordable
unit when it does); and the stroke modes' writing surfaces (WET frame, ACCUM
trails, scent are live-stage systems — this slice is the dish-side force
consumption the CULTURE phasing assigns to Phase 3, the "pushing marks" verb
of the issue's list, in the one world the marks will live in). The program
note on the issue (2026-11-14) — "finger painting writes into the dish
fields. Under the kernel sub-program (issues 2186/2187) those fields become
GPU-resident textures, so the paint input path will land on textures when
this builds" — is about the input path's landing surface and changes none of
the above; the world-side consumption built here is writer-agnostic: whoever
deals a stroke (a tracker today, a recorded stream at replay) deals the same
spec through the same door.

## Component 2 — the reverse coupling (culture → fluid)

K2 wired fluid → culture births and deliberately left the reverse direction
to this slice. The stage has carried it all along — the parent issue's own
survey of what exists: "Coupling: the culture raises the fluid's feed; the
fluid's density biases the culture's births (engine/dishFluidCouple.mjs);
reads are published state, one frame behind." The world now matches.

- **Mechanism:** the kernel's standing law, untouched — `stepFluid`'s culture
  bias (feed += `CULTURE_FEED_GAIN` 0.02 × couple × level; kill −=
  `CULTURE_KILL_DROP` 0.008 × couple × level, floored at `FERRO_KILL_MIN`):
  living culture raises the medium's feed and lowers its kill where it
  stands, so the fluid grows toward the living culture — §5.2's soil feeding
  its medium back.
- **Strength:** `couple = CULTURE_COUPLING` (0.5), the world's ONE standing
  coupling constant — the same value the birth seam reads. On the live stage
  one COUPLE dial drives both directions; the world keeps that shape (K2's
  design call 2, extended, not revised).
- **Cadence / read discipline:** the read happens on every fluid step
  (divisor 2, 60 steps/s), handing `world.life.field` as it stands at that
  moment — the level the last completed generation published, held between
  generations exactly as the stage holds a published field for a frame's
  steps. The fluid branch runs before the life branch inside a world step,
  so at a step where both fire the fluid reads the PREVIOUS generation: the
  dish's one-step-behind discipline, the same read the forward coupling
  makes. The flow dial is not passed (the kernel default stands — the
  medium's character is otherwise the one K1 proved).
- **js-exact preserved:** the composition is a pure function of world state;
  every determinism suite (twin worlds, irregular feeds, world hash) passes
  unmodified. The cultureFluid character soak passes UNMODIFIED too: after
  two sim-minutes the coupled medium's mean V is 0.3207, inside the standing
  band (0.1, 0.45) the K1 suite pins.

## Component 3 — the magnet growth bias (the parent issue 2178)

3A's design call 2 flagged this as genuinely owed: "On the live stage,
stamped magnets bias the kernel's feed/kill (the dark phase grows toward a
magnet). In the world, K1 deliberately stood the medium unbiased…" The issue
body's kernel survey says it in one line: "magnets bias feed/kill so the dark
phase grows toward a magnet and stands there." Now dealt in the world:

- **Mechanism:** `stepCultureWorld` hands `stepFluid` the magnet list built
  by `cultureFieldMagnets(fields)`: the fields table's ACTIVE magnet fields,
  in dealt order, capped at the kernel's `MAX_MAGNETS` (8 — the ceiling the
  GPU mirror's uniform array is sized by; the bias reads the first magnets
  dealt, the kernel's reading everywhere; the body pull has no such cap and
  still reads the whole table). Positions are dish-normalized from body
  space. A retired field biases nothing; a zero-strength field is inert here
  as it is in the pull.
- **Per-field strength → weight:** each entry carries `w = strength /
  CULTURE_FIELD_MAGNET_STRENGTH`, so a default-strength field weighs exactly
  1 — a stage magnet — and a stronger field biases proportionally harder.
  The dial stands at `CULTURE_FIELD_FLUID_PULL = 0.7`, the kernel's own
  standing default (the sanitizeFluidDial / stepFluid default): the world's
  per-field variation rides in the weights, not the dial, because the world
  has no PULL dial — the field's dealt strength IS its pull (3A's design
  call, carried through).
- **Aspect:** `aspectHW = CULTURE_WORLD_ASPECT_HW` = 1080/1920 = 0.5625, the
  dish's own aspect, so the bias falloff is round in body space like the
  fields' own gaussian — not the stage canvas's 0.7; the world is not the
  canvas.
- **Kernel support (additive, default-preserving):** `magnetFieldAt` sums
  `w · exp(−(d/R)²)` with w read as 1 when absent or non-finite;
  `sanitizeMagnets` preserves a finite w (clamped ≥ 0) and otherwise returns
  exactly the {x, y} shape it always has; the GLSL kernel gained the parallel
  `u_magnetW` uniform array and `fluidStepUniforms` the parallel weights.
  Every existing caller is weightless, hence bit-identical: the whole
  dishFluid family (dishFluid, dishFluidCouple, dishFluidPull, dishFluidStage,
  dishFluidChannel, dishFluidDuplicates, dishFluidRender) and the stage-1 GPU
  parity suite pass UNMODIFIED.
- **Evidence (parity suite, node side):** at 60 fluid steps, the
  magnet-weighted density mass is 27.21 in the no-magnet world and 30.38 in
  the same-seed world with one dealt magnet — the dark phase masses toward
  the magnet; and the magnet world's fluid hash differs from the control's.

**Issue 2178: already done / still queued.** Channel 2 (bone pull) and the
GPU field-body channel shipped on the stage in PR #2190; 3A dealt the pull's
world side. Still queued on the issue as written, untouched here: channel
1's body at stage scale and channel 3's finer kernel grid (stage-side
presentation, a different surface from the gated world). Open question 3
(two forces on one bone) was answered by the one-force seam for the stage
(fixed order, culture first, fluid second); in the world the composition is
the step order itself — fields, then the hand, then the integrator, then the
solver — and this slice adds the world's second body-force (the hand) in
exactly that fixed place.

## The one re-pin, said loudly

**`app/src/gl/parity/cultureFluidSim.selfcheck.mjs` is re-pinned — its
scenario, not its tolerances.** The K1 scenario ran BOTH sides under "no
magnets, no culture field, dial defaults"; the world's law has now genuinely
changed (components 2–3), so that scenario would prove a law the world no
longer runs. The re-pinned suite: the JS side still advances ONLY through the
world's scheduler; the GPU side runs through a new segmented session API in
the harness page (additive — `__kcFluidRun` is untouched and the stage-1
suite passes unmodified), each segment fed the culture level the world's
fluid actually read for it (segments split at generation boundaries, the
one-step-behind read made explicit), the world's magnet list, and the
standing pull/couple/aspect. Tolerances are NOT re-pinned: float noise
< 1e-3 at 60 steps, character (mean V within 15%) at 600. Two node-side
proofs pin the wiring itself: the world's medium is **bit-identical** to the
bare kernel fed the recorded segment inputs (the world wires precisely those
inputs), and **differs** from the old bare law (the coupling is real).
Measured under the new law: 60 steps max |ΔV| **8.34e-7** / |ΔU| 8.64e-7;
600 steps max |ΔV| **9.66e-6**, mean V **0.2034 on both sides**; the magnet
run max |ΔV| **8.94e-7**. No other suite was modified: every Phase 0–3A suite
passes unmodified (below), including the K2 life parity suite — byte-identical
cultures at all 40 generations under the NEW density sequence, its birth-draw
margin guard re-measured at 2.72e-5 (bar 1e-5).

## Verification

- **New suite:** `cultureHand.selfcheck` 8/8 groups green, ×3 runs.
- **Neighbours, unmodified and green:** cultureWorld 5/5, cultureFluid 6/6
  (soak above), cultureLife 8/8, cultureSwarm 8/8, cultureSolver 9/9,
  cultureFields 9/9; the dishFluid family (7 suites); the three Host suites;
  parity cultureFluidSim (re-pinned, above), cultureLifeSim, cultureSwarmSim,
  and the stage-1 fluidSim suite.
- **Lint:** 0 errors (11 warnings, all pre-existing in untouched files).
  **format:check:** clean (prettier applied to the two new files).
  **Build:** green (one pre-existing dynamic-import warning, same as 3A).
- **Full manifest sweep: 807 PASS / 3 FAIL over 810 real suites** (manifest
  `#` comment lines not counted; the count grew 809 → 810 by this slice's one
  suite). Log kept at `sweep-culture-p3b.log` in the worktree root. The 3
  failures are the standing sandbox-environmental set, each **A/B-verified
  this session** against a pristine detached worktree at origin/main
  `fd467681` with identical exit codes: swarmWasm 1/1, rollSafety 1/1,
  accum 134/134. None touches this diff. (The sweep wrapper was OOM-killed
  after printing its final tally line — the log is complete at 810/810
  suites with the tally line inside it, the same wrapper behaviour 3A saw.)

## Next slice (Phase 4, not built here)

The soil as a force on citizens: living ground feeds the ecology and dead
ground kills, read off `cultureLifeField` — the published face this slice's
couplings now also feed. The hand's remaining verbs from the parent issue
(wet and scent writing, conducting) land with their stage surfaces and the
shell's input path, not in the world.
