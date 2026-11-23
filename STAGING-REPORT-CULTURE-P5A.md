# STAGING REPORT — CULTURE Phase 5, slice A: the first citizen, the dish creature

Branch `feat/culture-phase5a-dish-creature`, built on origin/main `da8f50e` (Phase 4 merged, #2464) and rebased onto
`d674493` (#2465, a kinetic-panel slice that touches none of this diff) before publishing.
No issue owns this slice. The parent issue (2109) stays open; the parent issue (2168) stays open; the parent umbrella (1183) stays open.
This report is the builder's record for the coordinator's QA loop. Nothing here is merged.

## What shipped

Four named components inside the gated culture world, plus the gate pinned:

1. **The assembled body plan** — NEW `app/src/engine/cultureBody.mjs` (KINETIC's bench): the dish plan,
   `assembleCultureBody` (head, spine, born limbs, one tree of joints, declared sockets, a look per part),
   `cultureBodyRestPose`, and `cultureBodyFaults` (the reading LOIS gates on).
2. **Motion Core's CULTURE seam** — NEW `app/src/engine/cultureMotion.mjs` (the parent issue 2109): the one
   behaviour API citizens use — SENSES → DRIVES (a frozen registry: wander, ground, rim) → FEEL (the 12
   principles as seasoning) → FORCES (velocity on the citizen's own bodies). The recipe's shape and bounds
   (`normalizeCultureRecipe`), `CULTURE_PRINCIPLES` (all twelve accounted for), and the look as a Motion Core
   source, `culture:feel` (registered lazily, at the first cast).
3. **Rig spawning — the Lab's casting path** — NEW `app/src/engine/cultureLab.mjs` (the parent issue 2168 on the
   CULTURE foundation): `curatorCast` / `curatorAudition` (CURATOR directs and stages), `kineticAssemble`,
   `davisWrite`, `loisGate` (she gates and ranks; never builds), the dish creature's native recipe and the
   default cast sheet (three dish creatures).
4. **The citizens in the world** — NEW `app/src/engine/cultureCitizens.mjs` (the table, the step, the seam
   rehome, the hash, the layout read, a debug-only SVG preview) and `app/src/engine/cultureWorld.mjs`: the world
   carries `world.citizens`; `castCultureTake(world, sheet?)` is the Lab's only door (once per world);
   `cultureCitizenAt(world, i)` is the read door; the step runs the citizens' muscle after the Queen's fields and
   before the hand, and rehomes citizens across the wrap seam after the swarm and before the solver;
   `cultureWorldHash` folds `cultureCitizensHash` in whole (appended last).
5. **The gate, pinned** — `app/src/hooks/useCultureWorld.js`: the effect's body is now the exported
   `runCultureShell(on, seed, host)`; gate ON casts the world at birth (citizens immigrate through the gate).
   NEW `app/src/hooks/useCultureWorld.selfcheck.mjs` pins it from both ends — QA's `if (!on)` → `if (false)`
   mutation now bites.
6. `app/src/engine/kernel/rng.js` registers the three new string channels (`culture-cast` spatial,
   `culture-recipe` noise, `culture-wander` noise) per the #1238 rule.

Four new suites (cultureMotion 6 groups, cultureLab 7, cultureCitizens 9, useCultureWorld 4), four manifest lines
after cultureSoil. One-writer files untouched (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js` are not in the
diff). `package.json` / `package-lock.json` untouched (node_modules symlinked). No new backend stamp; the world's
law composition is unchanged (js-exact).

## The law this builds (quoted)

- Spec §2.4: "A creature is **assembled**, following the WetLab creature record: head, limbs, and attach points.
  Physics moves the assembled creature as one **compound body** … rather than being animated as an unrelated
  sticker … more layout than literal animal — rather than creatureoid, humanoid, or bugoid realism."
- Spec §2.8: "CURATOR directs the Lab. KINETIC assembles bodies from parts. DAVIS writes the recipes. LOIS is
  the gate. A **recipe** is a named bundle of: creature drives; physics dials; 12-principles seasoning. A creature
  is **instilled with a recipe at birth**." "LOIS ranks recipes and creatures. She never builds."
- Spec §2.10: "Attach sockets are limited by the looter's body plan." / "A looted limb keeps its original look."
- Spec §4 Q2: "**The Lab casts fresh each take.** … A take does not inherit a standing zoo population." Q3: the
  hand is "a force, never a body". Q4: "The Queen owns the fields … recipes and personas may only request."
- Spec §5.2 / Phase 4: Life is the soil; dead ground kills.
- Phasing defaults: sim step 120 Hz; sensory range 3 body-lengths.
- The parent issue 2109: "Nothing in the resolver, the renderer, or the loop knows a creature exists"; a pose
  delta from rest; the anchor law.

## Design calls (coordinator-style, recorded)

1. **A citizen's parts are ordinary bodies; its joints are ordinary links.** The cast door appends each body's
   parts as contiguous slots in the world's one table (head first) at the rest pose, still, at its part radii and
   the recipe's masses, and deals its joints through the existing link door at their declared rests. The swarm,
   the Queen's fields, the hand, the solver and the soil do not know a creature exists — they move, pull, push,
   join and judge discs. Nothing in those modules changed.
2. **The dish plan is the legacy dish creature, looted (§2.2).** Head 27 px, spine 22/19/16/13, link rests by the
   legacy overlap rule (rA + rB) × 0.82, two limbs of three discs (10/7/4.5 — the legacy limb's root/middle/tip
   classes) hung from the head's two sockets at ±115°, swept back. Chain links only: the solver's links have no
   stiffness column, so the legacy skip-one braces (stiffness 0.85) have no honest translation — see call 7.
3. **Sockets are declared, not used.** Four per dish body, cap 4: `head.l` / `head.r` born occupied by its own
   limbs, `spine.1.l` / `spine.1.r` born free. Looting and attaching are Phase 6; this slice only declares so
   Phase 6 has a body plan and a cap to read.
4. **The look is data per part, never drawn on the stage.** A shape from a four-mark vocabulary (ring, square,
   bar, dot) and a tone ROLE (main, ink, accent — never a hex; the palette is the stage's). The dish body:
   a ring head, ink squares down the spine, an accent dot at the tail, bar limbs with accent dot tips. LOIS's body
   reading refuses a body with fewer than three distinct shapes as "a sticker". There is no render path in the
   world, so the only drawing is a debug SVG function (`cultureCitizensDebugSvg`) the app never imports — it was
   used to eyeball the layout for this report and draws no text. No user-visible copy is added; recipe / part
   names are internal identifiers, unsigned, never rendered.
5. **The muscle swims the whole body, follow-the-leader.** The head is pushed along the citizen's heading; every
   other living part is pushed toward its parent, its stroke lagged by its depth (FOLLOW-THROUGH / OVERLAPPING
   ACTION — the stroke ripples down the body); each limb tip is paddled across the heading, left/right mirrored.
   First build pushed the head only: because the solver's projection is positional (it never writes velocity),
   dragged parts kept their own flock velocities and the body drifted wherever the parts' boids sums pointed —
   creatures crossed the rim and withered tail-first in the wrap pad. Velocity only; never divided by mass (the
   fields' weather discipline), so the muscle composes with the Queen's fields and the hand in one place.
6. **Citizens are heavy (mass in the swarm core's units, a cloud mote = 1).** The swarm core divides its flocking
   by mass; at mass 1 an 11-disc body is a mini-flock that self-propels at the speed clamp and ignores its own
   muscle. The recipe's physics dials put the head at 60 and the spine at 20 (the legacy 3:1 ratio, follow-through
   lightening the tail to ~14), bounds [4, 120] / [2, 60]. The flock still nudges a citizen; the Queen's magnet and
   the hand (not mass-divided) still move it plainly (suite group 5: +51 px toward a magnet in 2 s, +134 px along a
   current in 0.5 s).
7. **Muscle TONE stands in for the braces.** A part folding tighter than its brace to its grandparent
   (0.92 × the two joints' rests) pushes off it by tone × (1 − d/brace) — the body holding its line, written as
   velocity like every muscle. A physics dial (native 0.6, bounds [0, 1.5]).
8. **The 12 principles, all accounted for** (`CULTURE_PRINCIPLES`): eight are seasoning dials with a runtime
   meaning — timing (strokes of 72 swarm steps = 1.2 s), slow in/out (the stroke envelope's exponent),
   anticipation (a recoil in the stroke's first 20 %), arcs (the turn rate, 0.22 → 0.02 rad/step), follow-through
   & overlapping action (tail lightness + the stroke's ripple lag), squash & stretch (look: stretch along the
   segment by surge, volume kept; the recoil squashes), secondary action (the head's breath), exaggeration
   (multiplies squash, anticipation, breath). Four are not per-step dials and are not faked into numbers:
   staging → CURATOR's placement, straight-ahead/pose-to-pose → the simulation, solid drawing → KINETIC's assembly
   and per-part look, appeal → LOIS's praise.
9. **Drives for this slice: wander, ground, rim.** No hunger/feeding/predation drive — those are Phase 6 and the
   recipe reading refuses an unknown drive by name. *wander*: a smooth seeded value noise of the citizen's own
   life (two strokes per knot). *ground*: probes the published soil in 8 directions × {⅓, ⅔, 1} of the sensory
   range (3 body-lengths ≈ 500 px), weighted nearer-first, and leans toward the best fortune; urgent on dead ground,
   silent on full fertility. *rim*: inward within 2 body-lengths of the border, 1 at the border (1 body-length let
   a turning body's momentum carry the head across in one seed of three; at 2, 20 seeds × 60 s showed zero
   overshoot). Recipes weigh them; the desire's strength (≤ 1) scales every push.
10. **The Lab casts fresh, once per world.** `castCultureTake` refuses a second cast in the same world ("the Lab
    casts fresh each take"); a new take is a new world (the shell already rebuilds on seed). A cast is checked
    whole against the body/link ceilings before anything is written. The engine never casts on its own — a world
    is born uncast; only the shell (gate ON) or a suite casts.
11. **CURATOR auditions 16 candidates per slot; LOIS ranks; the best admitted wins** (ties to the earlier).
    Candidates are placed inside a 1.5 body-length staging margin with a seeded heading; KINETIC scales the plan in
    [0.9, 1.1]; DAVIS leans each native dial by ≤ ±15 % inside bounds (timing whole steps) and deals a birth stroke
    phase. LOIS's hard faults: the body's own, the recipe reading's, head on dead ground, any rest-pose part outside
    the dish, a head within 2 body-lengths of an earlier cast head. Her praise = ½ fertility under the head +
    ¼ graphic range (distinct shapes / 4) + ¼ temperament (1 − mean normalised distance from the native); bar 0.5.
    A slot with no admitted audition is refused and recorded; the cast goes on (seed 11's third slot, for one).
    Breeding rights from her praise were not ruled (§2.8) and are not built; praise is recorded on the citizen.
12. **A citizen is its head.** The only killer in the world today is the soil. When the soil withers the head,
    the citizen is dead, cause `'soil'`, seen one step behind (at the next citizen step — the dish's read
    discipline); its muscle stops and its age/heading freeze. A withered non-head part is simply gone from every
    mover (the solver already skips links to dead bodies); the citizen lives on. A dead citizen's surviving parts
    stay in the table as passive bodies (§3.2's tier) — persistence, decay and looting are Phase 6.
13. **One body across the seam.** The swarm wraps each disc alone at its 120 px pad; a jointed body straddling the
    seam would be yanked across the dish by its own links. After the swarm and before the solver, each citizen's
    living parts more than half a wrap span from its anchor (first living part, head first) move back by exactly
    one span. Positions only. The rim drive keeps citizens off the seam; this is the guarantee.
14. **The force order.** Queen's fields → citizens' muscle → the hand (last, the override's place) → swarm →
    rehome → solver → soil. Velocity adds commute up to float rounding, so the order is a stated convention, not a
    law a suite can bite; twin-world determinism pins whatever order ships.
15. **Motion Core: the look is a registered source, registered lazily.** `culture:feel` (family `driver`, time
    base `seconds` — the citizen's life in sim seconds; `TIME_BASES` is pinned by motionCore.selfcheck, so no new
    base was added), cost tier `culture/citizen-feel` tier 0, measured 0.009 ms per swarm step at the default cast
    of three (sandbox median; the whole world step is 0.15 ms cast vs 0.14 ms uncast). It obeys the anchor law —
    every term eases in over 0.5 s from birth, so a born citizen is at rest. Registration happens at the first
    cast, so a session whose gate never opens has registries exactly main's (probed: 23 motion sources and 56 cost
    tiers, identical hashes on both).
16. **The gate's shape.** `useCultureWorld` keeps its contract; its effect body moved into `runCultureShell`
    (exported) so a node suite can drive it with a fake frame host. Gate OFF for every value but exactly `true`.
    The cleanup clears only its own world (the original `ref.current === world` guard, now keyed on the standing
    world). A source pin asserts the hook hands the shell the store's own `cultureDish === true` and seed.
17. **Hash discipline.** `cultureCitizensHash` (FNV-1a, the cultureSoilHash discipline) covers the citizen step,
    the cast flag, deaths, and per citizen its plan, scale, slots, birth step, every recipe dial (canonical order),
    praise, seed, birth phase, heading (bit-exact), age, alive, died step and cause. Parts' motion is already the
    swarm hash's; joints the solver hash's. No suite pins an absolute world-hash golden, so none moved.

## Re-pins

**None.** Every prior suite passes unmodified. The world's step gained two calls that are bit-exact no-ops over an
empty citizen table (suite group 1 replays the Phase 4 step order independently — 60 movers, a magnet, a hand
current, 600 steps — and matches every column, the soil clocks and the world hash bit for bit).

## Verification

- **New suites, all green ×3 runs:** cultureMotion 6/6, cultureLab 7/7, cultureCitizens 9/9 (≈8 s),
  useCultureWorld 4/4.
- **Mutation tests (each applied alone, the named suites re-run, reverted): 23/23 bite.**
  | Mutation | Caught by |
  |---|---|
  | hook gate `if (on !== true)` → `if (false)` (QA's finding) | useCultureWorld g1 |
  | hook selector loosened (`!== undefined`) | useCultureWorld g4 |
  | cast door: no once-per-world refusal | cultureCitizens g2 |
  | rehome dropped from the world step | cultureCitizens g3 (the muscle-less twin is yanked across the seam) and g6 alone |
  | rehome sign flipped | cultureCitizens g3, and g6 alone |
  | head death never seen | cultureCitizens g4 |
  | death recorded one step early | cultureCitizens g4 |
  | citizens hash not folded into the world hash | cultureCitizens g7 |
  | citizens hash omits the heading | cultureCitizens g7 |
  | parts pushed away from their parents | cultureMotion g5, cultureCitizens g3 |
  | turn not limited by the arc rate | cultureMotion g5 |
  | anticipation pushes forward | cultureMotion g4 |
  | feel pose breaks the anchor law | cultureMotion g6 |
  | rim drive silenced | cultureMotion g3, cultureCitizens g3 |
  | ground drive leans toward dead ground | cultureMotion g3 |
  | sensory range 2 body-lengths | cultureMotion g3 |
  | LOIS admits dead ground | cultureLab g5 |
  | CURATOR takes the first admitted, not the best | cultureLab g6 |
  | a two-shape sticker passes | cultureLab g2 |
  | cast ignores the recipe masses | cultureCitizens g2 |
  | feel source registered eagerly at import | cultureMotion g6 |
  | muscle on the head only | cultureCitizens g3 |
  | DAVIS leans past his ±15 % | cultureLab g4 |
- **Neighbours, unmodified and green:** cultureWorld, cultureFluid, cultureLife, cultureSwarm, cultureSolver,
  cultureFields, cultureHand, cultureSoil; parity cultureFluidSim, cultureSim, cultureLifeSim, cultureSwarmSim;
  host suites cultureFluidHost, cultureLifeHost, cultureSwarmHost; motionCore, kinemeSources, rigSources,
  figurePose; kernel/rng (+ scratch); costTiers; gait; constructAssembler; groundSnap.
- **Lint:** 0 errors (11 pre-existing warnings in untouched files). **format:check:** clean. **Build:** green.
- **Full manifest sweep (3 parallel): 813 PASS / 2 FAIL over 815 suites** (811 → 815 by this slice's four).
  Log: `sweep-culture-p5a.log` at the worktree root (committed), A/B appended. The two failures, each A/B-verified
  this session against a pristine detached worktree at origin/main `da8f50e`, re-run alone: **rollSafety** 1/1
  (identical output — headless `page.evaluate: Target crashed`, the standing sandbox failure); **accum** rc 137 in
  the sweep (SIGKILL under 3-parallel memory pressure) but 0/0 alone on both (87 cases OK). **swarmWasm**, the
  third standing environmental failure, passed in the sweep. None touches this diff.
- **After the rebase onto `d674493`:** the 33 manifest suites matching culture / motionCore / kernel/rng /
  costTiers and #2465's own suites (kineticHeat, topbarLegibility, kineticScope, kineticSweep) re-run green; lint,
  format:check and build re-run green; the live-stage probe below re-run against a fresh detached worktree at
  `d674493` — every hash identical to the `da8f50e` run.
- **Live stage byte-identical with the gate off** (the Phase 4 probe: a fresh resolver per mode, 60 frames at
  1000/60 ms each, sha256 over the JSON of every frame's resolved layers; plus sha256 of `serializeProject` over
  the default store state — `cultureDish` defaults false), A/B against pristine detached worktrees at origin/main
  `da8f50e` and, after the rebase, `d674493` — identical on all:
  - scatter ×60 `790826a1…842ec3`; grid ×60 `2b86ae62…ff7dd8`; swarm ×60 `9a068d05…002c7278`;
    swarm-scatter ×60 `e7d50793…bbd927d4`
  - all modes `e853fb6a95dd48123ac40c5a1447b958e9c07145e10bff6a829b13187915a78c`
  - serializeProject (gate off) `9d7d6f7dd7d7f870022a337d1abf110d22516e39cf35038c2b341557497552fd`
  - registries after importing the shell hook and the live resolver: 23 motion sources `3dba1833…`, 56 cost
    tiers `d1d2d69e…`, identical on both.
- **Behaviour probe (gate-on world, not the stage):** over 20 seeds × 60 s every cast citizen stayed inside the
  dish (zero overshoot) and none withered; head path ≈ 85–125 px/s (≈ 0.6 body-lengths/s); a muscle-less twin
  drifts < ⅓ of that.

## Open questions (none blocking)

- Feel numbers (masses, thrust 0.35, stroke 1.2 s, tone 0.6, rim 2 body-lengths, the look vocabulary) are
  starting constants for Matt's iteration pass, all in the bounds table / native recipe.
- A dead citizen's surviving parts stay as passive bodies until Phase 6 rules what a corpse does (persist 30 s,
  decay, loot). Alternative: retire the whole body at death. Recommendation: keep — it is the least that Phase 6
  has to undo.
- The cast size (three dish creatures) is CURATOR's default sheet; a performer dial for it is not in this slice.

## Next slices (not built here)

- **B — the moth** (the flagship second citizen): a second body plan through the same Lab door and recipe shape.
- **B/C — gait** (the parent issues 2331, 2332): the creature/beast/glyph adapters compose with `culture:feel`
  through Motion Core; the TASTE → QUEEN damp step and the LOIS break-up veto.
- **C — Strandbeest** (the parent epic 1863) as a CULTURE body phase; **test drives** (2342–2344).
- **Phase 6** reads what this slice declares: sockets (looting/attaching), `praise`, `cause`/`diedStep`, the
  soil readings (fertility/fortune) for feeding and growth.
