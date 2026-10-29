# Strandbeest epic — code substrate audit (2026-10-29)

Audited tree: `origin/main` @ `3aafc29d` (feat(gl): two-compartment pigment #1811, PR #1845), via scratch worktree `~/workspace/kc-strand-audit`. Read-only; no code changed.

Epic under audit: **Strandbeest creatures** — graphic structures assembled from the asset pool + WetLab ATTACH points, locomotion emerging from linkage geometry (FORM genes as *measurements*), roaming the petri dish. Parent #1848 · assembler #1849 · body language #1851 · loot #1862.

## Premise correction (read first)

**`app/src/gl/creatureMotion.mjs` does not exist on current main** — no file by that name anywhere in the repo, nothing imports it. Creature motion lives in `app/src/engine/`: `creature.js` (the moth), `dishCreature.js` (the dish family), `creaturePose.js` (band posture), `kineme.js` (the living-motion floor both families read). Any epic draft that names `gl/creatureMotion.mjs` as the integration point is pointing at a file that was never built; the real seams are below.

---

## Q1 — Creature motion today

**What exists.** Two creature families, both *resolver-side builders* constructed once in `app/src/gl/liveResolve.mjs` (lines 570–571: `createCreatureBuilder({ skinning: true })`, `createDishCreatureBuilder()`). Each `append(input, entries, pool, motionFor, groundFor)` adds flat stamp items to the **top content layer's items**; the renderer never learns creatures exist. Per-pin data rides the resolver input, stamped by the formation channel onto the *next* frame's input (`curator/formationLive.js` → `dishPins / dishFormed / dishHosted / dishLimbs / dishTraits / dishPressure / dishGenomes`).

- **The moth (`engine/creature.js`) is kinematic/analytic — it glides, by construction.** Position = pin + `hoverPose()` offset: anchored sine waves on the kineme driver clock (`HOVER` constants: hzX 0.09 / hzY 0.12 / hzTilt 0.15, reach 0.06 of the small canvas side at DRIFT 1), measured from rest so frame 0 sits exactly on the pin. Wing beat = `flap · sin(2π · loopTimeMs / flapMs)` (1700 ms loop clock). No velocity, no integration, no state except grow-in ages and second-pair growth. Posture comes from `engine/creaturePose.js`: a pure blend of four poses (open / neutral / withered / flourish) over the band reader's smoothed stress, emitted as parameter deltas (dirDeg, scales, `chainCurlDeg`, dim).
- **The dish creature (`engine/dishCreature.js`) is the one dynamic body — and it is still pin-homed.** Per pin, a tiny particle system (head + 4 spine discs + limb chains) integrated per resolver frame: the head is *spring-steered toward the pin's hover point* (`headPull 0.085`, `headDamp 0.8`); body discs follow through declared XPBD links (`engine/dishLinks.mjs` `solveDishLinks` — Gauss–Seidel in declaration order, λ per-step only); heading derives from head velocity / spine direction and turns toward target at 0.18/frame. Loot gates already extend it: facing toward curl-flow + attractor (#1732), bounds reflection (#1731), ALife modes hover/roam/school/rest (#1736 — `MODE_EFFECTS`: roam = reach ×1.8, school = ride downstream). Even "roam" only widens the wander around the home pin; the spring always pulls back.
- **The ruled motion primitives** live in `engine/kineme.js` + `data/kinemes.js`: the anchored driver clock (`driverSec`), amounts (breath/drift/pulse), patterns (DRIFT/SWELL/THUMP/ORGANIC/CADENCE). Both families read the same floor via the resolver's `motionFor(top)` context — locus = the pin, cadence = the driver clock, orient = hover tilt / heading law. Any new locomotion must read this clock, never wall time.

**Seam / collision for a linkage model.**
- *Clean seam:* a third builder with the identical append contract (input-gated, per-pin state, `snapshotState`/`restoreState`, items out flagged `_creature: true`) slots beside the two families in `liveResolve.mjs`. The dish family's compound machinery is the closer relative: a linkage **is** a declared-link graph, and `dishLinks.mjs` already solves declared links `{a, b, rest, stiffness}` with rests as *declared data, never latched from live positions*.
- *Collision 1 — loop closure + a driver.* Today's link graphs are open chains plus skip-one braces. A Jansen linkage is a **closed-loop** graph driven by one rotating crank: it needs loop-closure links and a per-frame angular driver input the solver contract doesn't yet express.
- *Collision 2 — the pin is home.* Both families assume the creature's locus is a formed pin (formation allocates: first formed pin hosts the dish creature, the rest host moths — `dishHosted`). A self-propelled roaming body breaks the home assumption itself: either the home must travel (new formation semantics) or the epic accepts pin-anchored walking-in-place / wander-radius locomotion for its first slices.
- *Collision 3 — hosting exclusivity.* A third family needs an allocation rule against `dishHosted` (which pin, decided by `curator/formation.js`, recorded in the take).

**Blast radius.** `liveResolve.mjs` is a named **one-writer file** (repo AGENTS.md) — wiring a builder there is serial, coordinator-owned work. Formation input additions touch `curator/formation.js`, `formationLive.js`, `spawnState.js` and their suites (`formation`, `dishPressure`, `limbs`, `spawn` selfchecks).

---

## Q2 — The dish

**What exists.** "The dish" is two distinct substrates:

1. **The resolver dish** (`gl/dishGround.mjs`, `createResolverDish`): the ground a layer rests on — `ground / groundRoles / groundCell`. Creatures consume it via `groundTreatment()` (GROUND lean, EDGE nudge, SNAP, halo-from-tile) so a creature *sits in the picture* instead of reading as a sticker. Both families already take it.
2. **The swarm particle dish** (`engine/particles.js`, 2,202 lines + `dishContacts.mjs` shared grid, `dishCoalesce`, `dishDeform`, `dishPigment`, `dishDensity`, `dishTrails`): every swarm stratum enrols in **one shared dish session** per frame (`liveResolve.mjs` ~lines 304–507). This is the petri dish as a physics population: contacts, coalescence, pigment, density, and a trail substrate (`dishTrails.mjs`, #1415) ticked by the resolver.

**Dish creatures** are placed only at formed pins (formation's decision, replayed from the take), born disc-by-disc (`stagger 6`, `growFrames 30`), updated inside the builder (predict → XPBD solve → draw), and drawn as ordinary items — three stamps of `org_blob_01` per disc (rim / body / gloss core) plus the head's eye.

**The wet field's dish consumers — the #1814 set is future, not present.** `gl/wetFrame.mjs` (the #1809 service) publishes the field (wet mask + velocity, pigment packs since #1811, `WET_REGIMES` damp/wet/soaked) under a need-based gate — but slice A wired **exactly one consumer: ACCUM, via `liveLoop.mjs`**. The dish migration is #1809 slice B (issue #1841, review lane), unwired: today the swarm dish does not read the wet field, and no creature does. Likewise the trail grid (`gl/trailGrid.mjs`, #1808 slice 1) is currently a **backstage debug readout only** (`gl/trailGridLive.mjs`: "nothing consumes the grid for steering in this slice"); the particle dish's own `dishTrails` is a substrate, not a steering input.

**Seam / collision.** "Roaming the dish" in existing terms = the dish family's hover-wander + roam mode, inside the resolver-dish's ground treatment. A Strandbeest that *walks the dish, crosses the wet field, and reads trails* needs two things that don't exist yet: (a) the #1841 wet-field dish migration (or its own wet consumer registration in `wetFrame`'s need-gate), and (b) a steering consumer for a trail grid. The epic should treat wet/trail interaction as a **late slice riding #1814/#1841**, not a foundation.

**Blast radius.** `particles.js` is also a one-writer file; enrolling a new body kind in the shared dish session touches `liveResolve.mjs`'s enrol block + `dishContacts` suites. The resolver-dish path (ground treatment) is free — both families already consume it.

---

## Q3 — Form representation

**What exists.** A stage item's form is a **flat stamp record** — `{x, y, scale, scaleY, rotation, alpha, assetId, color, accent, key, zTier, seedOffset, glass}` plus optional payloads (`mesh`, `engrave`, `_creature`) — produced by the resolver from layout params (`data/layout-modes.js`: `DEFAULT_LAYOUT_PARAMS` + `normalizeLayoutParams`). That file carries a standing warning (the #1804 note): **a new default key in layout params diverges every recorded take** (the #1638 replay gates hash resolver output). New creature data must ride input fields or creature records, never layout defaults.

**Measurement sets — a small vector of numbers that determines a body — already live in three places:**

1. **Skeleton plans (`engine/skeleton.js`).** A plan *is data*: `MOTH_SKELETON_PLAN = { spineSegments: 4, chains: [{id, root, dirDeg, sweepDeg, totalLen, lenFrac: [0.4, 0.33, 0.27]}…] }`. `buildSkeleton()` derives every bone from plan + attach landmarks + pose, with seeded per-bone length jitter (`0.92 + 0.16·stream`) on the `'skeleton'` RNG channel; the left half is built, the right is `mirrorBone()` — bit-exact by construction. **Only one plan exists**; the builder is explicitly plan-generic ("other types are other plans over this same builder").
2. **The creature genome (`engine/creatureGenome.js`, #1734).** A gene list `{kind, id, value, stage, mutate, dup, cut}`: a protected `plan` gene, `trait` genes (the moth's `TRAIT_RANGES`: spread/wing/body/swatch), plus drive / instinct / temper / ornament genes; `crossover()` at gene boundaries, `mutateGenome()` copy errors with named rates (`MUTATION = {point .12, dup .04, cut .04}`), `sanitizeGenome` clamping everything (`MAX_GENES 48`). Genomes ride the input as `dishGenomes`; breeding lives in `curator/creatureBreeding.js`. **But no gene carries a body measurement**: traits *scale* a fixed plan — `lenFrac`, `dirDeg`, disc radii are plan constants, not genes. FORM-as-measurements is a genuine extension with a clean seam (`GENE_RANGES` + `cleanGene` + a new gene kind), not a collision.
3. **Dish-compound declarations (`engine/dishCreature.js`).** `DISH_RADII` / limb radii sets, rests *derived* from radii × birth-stamped trait — measurements declared as data, links computed, never latched.

**Linkage body: sibling of the skeleton, not a replacement.** The skeleton is a kinematic *tree*, rebuilt statelessly each frame from plan + pose; it cannot express loop closure (chains root on the spine and never rejoin), and it carries no integrator state. A linkage body is a closed-loop constraint graph with per-frame state — the dish family's shape, not the moth's. What the epic should reuse from the skeleton system is its *discipline*: plan-as-data, seeded jitter on a named channel, mirror-exactness, and the 1e-4-quantised hash (`skeletonHash`).

**Blast radius.** A `measure` gene kind touches `creatureGenome.js` + `creatureBreeding.js` + `spawnState.js` and the genome/breeding suites; plan parameterization touches `skeleton.js` + `creature.js`'s `MOTH_SKELETON_PLAN` consumers (fan layout pins to bind-pose bones — `featherFan` goldens are pinned to the unflexed skeleton, so plan changes re-pin fan goldens).

---

## Q4 — Drawing structures

**What exists.** Compound graphics are drawn as **more items, never as a compound object**: `engine/hierarchy.js` `expandHierarchy()` flattens a part tree into the same stamp shape ("the renderer never learns a hierarchy exists"; depth capped, `HIER_MAX_DEPTH 4`). The moth = body + 2–4 wings + feather-fan parts (counts from `featherFan.js` `FAN_COUNTS`), all instanced asset stamps in the renderer's structural item pass. The dish creature = 3 stamps per disc + eye. Two per-item *payload* paths exist beyond stamps: `item.mesh` (wing warp — `gl/renderer.mjs` ~lines 1167/1226/1340, a dedicated mesh program binding vertices to skeleton bones) and `item.engrave` (spine joints packed by `engraveBody.mjs`).

**Could a drawn linkage render through existing machinery? Yes — by the stamp path, which is both families' precedent.** Bars = thin asset stamps positioned/rotated/scaled between joint positions computed CPU-side per frame (exactly how dish discs get their rotation from neighbour positions); joints = small stamps at the vertices. No renderer change, no new GL pass. The mesh path exists as an alternative but is a much larger blast radius (new program surface + renderer suites) with no need the stamp path doesn't meet at creature counts.

**Cost / governor.** Cost registration is `registerCostTier` in `engine/kernel/costRegistry.mjs` — creatures live in an **append-only creature section** (`engine/creature-feather-fan`, `creature/engraving`, `creature:glitch`), each measured at the **4-creature cap** by `gl/resolverProbe`; GL passes register in `gl/costTiers.mjs`. The item budget is global (`HIER_GLOBAL_BUDGET 2000`): a linkage's bars + joints spend from the same budget as plumage. The shed law already names creatures: the governor ladder sheds **creature count first** (`hooks/governorCuts.js` creatureShed rung, #1694 Q2; suite `hooks/governorCreatureShed.selfcheck.mjs`), and the pool citizen (`curator/creatureCitizen.js`: `CREATURE_ASSET_ID`, `mothsAllowed` / `dishAllowed`, the still-assets set) governs how many creatures may exist at all. A linkage sim registers one new cost entry (declared sim cost at cap, measured by resolverProbe) and sheds by the existing creature-count rung.

**ATTACH inheritance.** `attachPointsFor(asset, assetAttach)` (via `engine/autoAttach.js` + `engine/assetAttach.js` roles) already feeds both families: moth wings root on body attach points; dish limbs grow **only** from L-marked points (directions from the box centre), H names the head/root. A linkage assembled from asset shapes + ATTACH points inherits this wholesale — roots, head, and limb sites are already artist data.

**Blast radius.** Stamp-path drawing touches no renderer code. The selfcheck field is wide: **30 lines of `app/selfcheck.manifest` match creature/skeleton/dish** (suites include `engine/creature`, `dishCreature`, `skeleton`, `hierarchy`, `featherFan`, `wingWarp`, `creaturePose`, `creatureGenome`, `creatureBreeding`, `gl/creatureGate`, `performanceCreatures`, `kernel/creatureCost`, `governorCreatureShed`, `liveResolve.determinism`). House warning applies: several curator suites regex-pin the *source text* of shared files — grep the selfchecks for every file a slice touches and run those suites too.

---

## Q5 — Determinism surface

**The contract both families obey, stated in their headers and enforced by suites:**
- Pure function of (resolver input sequence, the builder's own frame count). **No clock, no `Math.random`.** Time is the anchored loop time (`loopTimeMs`) or a frame index; the builder counts every `append`, formed or not.
- All chance is `engine/kernel/rng.js` — `hashU01` / `rngForIndex` on **named channels** with document `seedOffsets` stream groups (spatial / color / asset / noise). Creatures ride the `'hierarchy'` and `'skeleton'` channels, keyed `(seed, creatureId, partId)`.
- **Input gating:** every behaviour newer than a take rides a *new input field the old take doesn't carry* (`dishHosted`, `dishGenomes`, `creatureFacing`, `creatureBounds`, `creatureAlife`…); absent field = byte-identical old behaviour. Bandless input = pose `null` = pre-S5 bytes.
- **State is checkpointable (#1367):** builders expose `snapshotState` / `restoreState`; dish-creature birth states (positions, velocities, growth, links) ride `engine/kernel/stateCodec.mjs`'s typed-array codec, all-or-nothing restore. XPBD's λ **never leaves the step** (`dishLinks.mjs` header: warm-start state would be checkpoint state — ruled out by design).
- **Cross-device trig:** ECMAScript trig is only implementation-approximated, so published geometry is quantised — `skeletonHash` quantises to 1e-4 before FNV-1a hashing. Spine A's law stands behind all of it: hash-match at locked 60 Hz dt.

**What a per-frame linkage integration must respect:** step in resolver frames at fixed dt (never wall dt); derive every random choice from a seeded channel keyed by (seed, creatureId, part); keep step-local solver state (λ) out of checkpoints; snapshot *all* integrator state (joint positions + velocities + crank phase) through the state codec; quantise any hashed or published geometry to 1e-4; gate the whole family behind a new input field so pre-epic takes replay byte-identical; and add nothing to `DEFAULT_LAYOUT_PARAMS`.

---

## Epic shape implications — the slice boundaries the code itself suggests

1. **Measurements as genes (data only, no motion).** A `measure` gene kind in `creatureGenome.js` (ranges + sanitize + crossover/mutation honouring it) and/or a parameterised skeleton-plan record, stamped at birth like traits. This is #1849's data slice, extended — and it's where the unruled MATERIAL/PATTERN stub-gene recommendation also lands, since the gene-kind list is the seam. *No stage behaviour changes; old takes byte-identical by the input-gate law.*
2. **The linkage leaf (pure solver, no stage).** A `dishLinks` sibling: a closed-loop link graph + one crank driver, frame-stepped, seeded, snapshot-able through the state codec. Proven in selfcheck against the Jansen proportions (the #1862 holy numbers as a fixture: the foot path closes flat, the gait period matches the crank) before anything draws it.
3. **The third builder (pin-hosted, stamp-drawn).** A new builder in `liveResolve.mjs` behind a new input gate + a formation allocation rule vs `dishHosted`; body drawn as bar/joint stamps through the item path; one `registerCostTier` entry measured at cap; sheds by the creature-count rung. Walking *at* the pin (wander-radius locomotion) is this slice's honest scope.
4. **Body language / roam (the feel gate — pairs with #1851).** Travelling-home semantics (the target moves; the spring follows a walker, not a pin), heading from linkage velocity, band pose feeding the crank cadence through the kineme floor. This is the slice Matt's eyes gate.
5. **Wet + trail roaming (last, dependency-named).** Wet-field consumption rides #1841's dish migration / #1814's consumer set; trail-following needs a steering consumer for the trail grid that does not exist yet. The epic should name these as dependencies, not promise them in slices 1–4.

**One-line verdict:** the substrate is unusually ready — declared-link solver, plan-as-data bodies, a gene record with a measurement-shaped hole in it, a stamp renderer that draws any compound, and a determinism contract with a named gate for exactly this kind of addition. The two real inventions the epic must make are *loop closure with a crank* (Q1) and *a home that travels* (Q1/Q2); everything else is composition of shipped machinery.
