# Research Report: Spore Creature System + RimWorld AI Storyteller
*Mechanisms for a generative-art live instrument. Research completed 2026-10-09.*

---

# SECTION A — Spore (2008, Maxis): part-based procedural creatures

## A. Summary
Spore's creature pipeline is: **metaballs** (implicit-surface clay for torso/limbs) + **rigblocks** (hand-crafted, deformable part blocks: mouths, hands, feet, eyes, weapons), each stored as a part-ID plus transform/deform-handle parameters — a full creature definition is on the order of **~1 KB**. Bodies are tagged with semantic **"capabilities"** (foot, grasper, mouth…), and everything downstream — rigging, gait, animation, abilities — is derived from those tags rather than from authored per-creature data. Animation works by **retargeting**: animators author motion once in the Spasm tool, recording it in a morphology-independent "generalized" space; at runtime it is specialized onto any creature via an invertible function plus combinatorial "variant" generation, then solved through a particle-based IK solver. Locomotion is **synthesized, not authored**: legs are discovered as root-to-foot paths through the body tree, clustered by length into groups, gait-cycle frequencies set from small-rational approximations of group length ratios, and foot/hip trajectories generated from duty-factor/step-trigger parameters. Parts confer abilities as simple additive stat levels (Bite 1–5, Sing 1–5, Speed, etc.) gated by **DNA cost tiers** and a **complexity meter**; balance is achieved through strict part-tier ladders (better part = strictly better stats = higher cost) and no stacking of identical ability sources.

## A1. Part-based building: what data is a creature?
- **Two-part geometry system** (per SIGGRAPH 2007 sketch "Rigblocks: player-deformable objects" by Choy, Ingram, Quigley, Sharp, Willmott; and rdrama analysis of the system): the body is built from **metaballs** — implicit surfaces defined by a mathematical function, not mesh points; adjacent metaballs' functions add so their surfaces merge smoothly. Stretching limbs/spine adds more metaballs to keep the surface continuous; individual metaballs can be grown/shrunk to fatten or thin regions. (index; corroborated by SIGGRAPH History Archives abstract)
- **Rigblocks** are the discrete parts (hands, mouths, feet, eyes, spikes, weapons): hand-modeled, then given **deform handles** (joints/blendshapes) the player can scale/stretch/transform within pre-defined degrees of freedom — "player-deformable objects", Lego-like. Each rigblock also ships with standardized **animation clips under a strict naming convention** (e.g. OpenClose for mouths, Pointing for graspers): the procedural animation system drives a crafted clip through *all* parts sharing the same clip name. (Jane Ng portfolio page, index; corroborated by SIGGRAPH 2007 sketch listing)
- **Creature = list of bodies**: per the SIGGRAPH 2008 animation paper, a creature is composed of "bodies" (spine vertebrae, limb segments, anatomical parts), typically **20–80 bodies**, each holding position/rotation transforms, bounding boxes, and parent-child hierarchy — essentially bones — plus semantic tags called **capabilities or "caps"** (e.g. the hand body has the grasper capability) and standardized **deform curves** (open/close mouth, droop ears, bend toes) that are uniform across all part types and opaque to the animation system. (verified from paper text, index)
- **~1 KB definitions**: GameSpy's 2005 Will Wright demo report notes creatures are "defined simply… the data files are incredibly small — as small as 1K each", enabling cheap upload/sharing via Sporepedia. A creature is effectively: spine/metaball parameters + per-part (partID, attachment transform, deform-handle values) + paint choices. (index)
- **The pipeline** (Will Wright, GameSpot Q&A 2006, index): sculpt torso clay → attach morphable parts → **generate mesh and skeleton** from that → procedural texturing/paint layers (heavily compressed) → animation "which is the hardest". Mesh generation from parts is via the metaball/rigblock tessellation system (Hecker's domain per liner notes).
- No hand-authored skeleton exists for any player creature: the skeleton is *derived* from the part assembly, and the rest pose is simply the transforms at creation time — the system assumes a "reasonable" rest configuration rather than a standard T-pose. (paper, index)

## A2. Procedural animation: parts → locomotion/gait/behavior
Source: Hecker et al., *"Real-time Motion Retargeting to Highly Varied User-Created Morphologies"*, ACM SIGGRAPH 2008 (paper text read via index), plus Chris Hecker's GDC 2007 lecture *"How To Animate a Character You've Never Seen Before"* (slides + mp3 at chrishecker.com; abstract confirmed via index) and Rock Paper Shotgun's 2006 studio visit.

### Core idea: author once, retarget to anything (Spasm + generalized space)
- Animators work in Maxis's OpenGL tool **Spasm** with a normal keyframe workflow, but for each animation channel they additionally specify **semantics**: *which* bodies to select (via **context queries** like HasGraspers, HasFeet, FrontMost/BackMost extent queries, a limb modifier that "walks up" to the clavicle/hip equivalent, prone/upright spine predicates) and *which aspects* of the motion matter. (paper, index)
- This semantic specification builds an **invertible function G** mapping a specialized pose on a specific character into a **generalized, morphology-independent space** (and back via S = G⁻¹). Stylistic curves are recorded in the generalized space. (paper, index)
- **Variants**: at runtime the system computes "how many different ways the animation can play on the character" — a modified cartesian product of candidate bodies (e.g. five graspers × a fruit-grab animation = five variants; fruit handoff A→B and B→A; same-side/opposite-side constraints prune combinations). Game code picks the variant by arbitrary runtime criteria (closest grasper to the fruit, one not holding something). Animations are also **auto sagittal-mirrored** during variant generation. (paper, index)
- **Philosophy**: Hecker's stated goal — "How can we animate these creatures when we haven't seen them before… my creature might have two arms and one leg, yours might have no arms and seven legs, and two mouths" — and Will Wright's "if you're going to fail, fail funny": target 80% of creatures with one animation, 15% more with alternates, let the last 5% fail humorously. (chrishecker.com abstract, index; RPS 2006, index)

### Gait synthesis (Sec 4.2 of the paper) — the key mechanism
1. **Leg discovery**: a "leg" is defined as a path through the tree of connected limb segments with a **foot body at the leaf** and a **spine segment at the base** (the "hip"). No authored leg data; legs are found by walking the body tree from foot-tagged leaves to the spine. (paper, index)
2. **Leg groups**: legs are **clustered into groups of roughly equal length**. Group length ratios are approximated by **small rational numbers**, and those ratios set the **relative frequency of the gait cycle** applied to each group. (paper, index)
3. **Foot/hip posing**: within a leg group, feet attached to each unique hip are ordered and a cyclical footstep pattern is generated from two parameters — **duty factor** (fraction of the gait cycle the foot is on the ground) and **step trigger** (offset from cycle start when the foot begins its cycle). Hips translate/rotate as feet move for torso motion; the foot's flight arc comes from animator-authored parameters or a graphical editor in normalized space, scaled by leg length. The hard aesthetic constraint: **feet must not slip**, and leg motion must be plausible given the character's translation/rotation. (paper, index)
4. **Gait styles**: animators author a **speed → gait-parameter mapping for 1–6 feet**; styles for **≥7 feet are generated procedurally**. Movement speed interpolates between authored velocity parameter sets. Multiple styles can layer on one creature (two short legs running while four long legs trot; limping; lumbering for large creatures). (paper, index)
5. **No feet**: a heuristic decides float vs. crawl; crawlers get spine bodies converted to **pseudo-feet** with an inch-worm gait. (paper, index)

### IK solver (Sec 4.3) — "Particle IK Solver"
- Skeleton treated as **3DOF particles + 1DOF length constraints**, solved iteratively (nonlinear length correction à la Jakobsen), in **two phases: spine first, then limbs** with the spine fixed. (paper, index)
- Spine handled via **quintic Hermite splines** fit through IK branch points only (not every vertebra), avoiding kinks; an **anti-buckling** heuristic blends back toward the rest pose if the spine folds unnaturally. (paper, index)
- An **"aim preconditioner"** pre-distorts each limb sub-tree toward its goals before constraint iteration, favoring rotation at shoulders/hips — this is what makes poses look natural rather than mechanical. Constraints are deliberately **soft** (allowed to stretch/compress) for an organic feel; per-constraint **mass values are pure ad-hoc tuning knobs**, not physics. (paper, index)
- They tried fancier solvers (CCD, Jacobian, constrained dynamics) and rejected them as slower and *harder to tune*; the simple architecture was chosen for "local control" via ad-hoc preconditioners. **Graceful failure** is a design objective: out-of-reach goals → reach instead of hyperextend. (paper, index)

### Secondary animation: "Jiggles" (Sec 4.4)
- Any sub-tree **not selected by the current animation** ("doesn't have IK") gets a **highly-damped pseudo-physical dynamics simulation** assigned by a heuristic over flexibility/placement/type. Crucially it is **passive** — it never feeds back into the keyed bodies — so animator-authored motion stays authoritative while ears, tails, and dangly bits respond plausibly. (paper, index)

### Behavior from parts
- Behavior is capability-driven: the editor **begins playing animations as soon as the player adds feet, mouths, or graspers** (paper, index). Feet → locomotion; mouth → eating/singing; graspers → grab/attack variants. Mouth placement determines where the head "is" for look-at and bite targeting. Social/combat actions (sing, dance, bite, charge) are selected by capability availability, with the variant system binding the abstract action to whichever concrete bodies qualify.

## A3. Parts → abilities/stats, and balance
- **Parts carry leveled stats**: mouths give Bite 1–5 / Sing 1–5 (plus diet: carnivore/herbivore/omnivore, which gates what you can eat); feet give Speed/Dance/Charge; hands/graspers give Strike/Pose; weapons (spikes, horns) give Charge/Spit; details (feathers, wings) give Glide/Charm; eyes give Sight. Stat groups: aggressive (bite, charge, strike, spit), social (sing, dance, charm, pose), utility (health, speed, sprint, jump, glide, stealth), each capped (mostly at 5). (SporeWiki "Creature Creator" + "List of Spore parts", Neoseeker FAQ; index)
- **Balance mechanism 1 — DNA cost tiers**: every part has a price; better stats cost strictly more. Example from wiki tables: mouths at $25/$75/$150/$250 give Bite 2→3→4→5. GameSpot's walkthrough notes the design rule explicitly: the Laardvark mouth (Bite 1, Sing 3) is *superior in every way except cost* to the Mollrat mouth (Bite 1, Sing 2) — i.e. **strict tier ladders, no sidegrades**, so balance = price curve. (index)
- **Balance mechanism 2 — complexity meter**: caps total part count regardless of DNA wealth. (GameSpot walkthrough, index)
- **Balance mechanism 3 — no stacking**: multiple identical ability sources don't add; "Placing more than one identical mouth on your creature doesn't give additional bonuses, so one mouth is all you need" (Prima guide via scribd, index). Every creature must have exactly one functional mouth (can't save without one).
- **Balance mechanism 4 — part availability gating**: you can only use parts you've found/unlocked, so the possibility space opens progressively. (GameSpot walkthrough, index)
- Note: purely cosmetic parts (most "details", non-eye sensory organs) carry no stats — the system cleanly separates **expressive parts** (free, unlimited-ish within complexity budget) from **functional parts** (stat-bearing, costed). This is itself a balance mechanism: aesthetic freedom is decoupled from power.

## A4. Key sources (mechanisms, not reviews)
1. Hecker, Raabe, Enslow, DeWeese, Maynard, van Prooijen — *"Real-time Motion Retargeting to Highly Varied User-Created Morphologies"*, ACM Trans. on Graphics / SIGGRAPH 2008. The primary technical source: generalization/specialization, variants, gait synthesis, particle IK, Jiggles. PDF: http://ChrisHecker.com/images/c/cb/Sporeanim-siggraph08.pdf (read via index, 2026-10-09).
2. Chris Hecker — *"How To Animate a Character You've Never Seen Before"*, GDC 2007 lecture (slides + mp3): http://chrishecker.com/How_To_Animate_a_Character_You%27ve_Never_Seen_Before (abstract confirmed via index). Less technical companion to the paper; includes the "fail funny" 80/15/5 doctrine.
3. Choy, Ingram, Quigley, Sharp, Willmott — *"Rigblocks: player-deformable objects"*, SIGGRAPH 2007 Sketches: the part/deformation architecture (abstract at https://history.siggraph.org/learning/rigblocks-player-deformable-objects-by-choy-ingram-quigley-sharp-and-willmott/, index).
4. Hecker — *"My Liner Notes for Spore"* (chrishecker.com, 2009): retrospective on the skin/tessellation pipeline (cited via secondary index source; not read directly).
5. Will Wright — GameSpot Q&A "The Creator Speaks" (2006): creature pipeline (clay → parts → mesh+skeleton generation → paint → animation), https://www.gamespot.com/articles/spore-qanda-the-creator-speaks/1100-6155540/ (index).
6. Rock Paper Shotgun — "Spore: It's Made Of People" (2006 studio visit): SPASM tool in action, the "fail funny" doctrine, https://www.rockpapershotgun.com/spore-its-made-of-people (index).
7. GameSpy — "Will Wright Presents Spore… and a New Way to Think About Games" (2005): the ~1KB creature definition claim, "artist in a box", http://www.gamespot.com/articles/595/595975p3.html (index).
8. Jane Ng (Spore artist) portfolio — rigblock authoring workflow: strict animation-clip naming conventions driving procedural animation across parts, https://janeng.com/spore-skinpaint/ (index).
9. SporeWiki (Fandom) — "Creature Creator", "List of Spore parts": part→stat tables and DNA costs (index). Neoseeker Spore FAQ — stat groups and caps (index).

## SPORE LOOT LIST (stealable mechanisms)
1. **Capability tags on parts, not authored rigs**: tag every part with semantic capabilities (foot/grasper/mouth/eye) and derive rigging, gait, and behavior bindings from the tags — the creature needs no authored skeleton, and new part types extend the system for free.
2. **Gait synthesis from leg groups**: discover legs as foot-to-spine tree paths, cluster by length, set per-group gait frequency from small-rational approximations of length ratios, and drive footsteps with duty-factor + step-trigger parameters — arbitrary limb counts walk convincingly with zero authored walk cycles.
3. **Generalize → specialize animation retargeting**: author each behavior once in a morphology-independent parameter space (Spasm's G/S functions), then specialize at runtime onto whatever parts qualify, generating combinatorial "variants" and letting game logic pick the best one (closest grasper, free hand).
4. **Passive secondary motion (Jiggles)**: run a cheap, heavily-damped pseudo-physics sim only on body sub-trees the current animation doesn't control, with no feedback into the primary motion — believable secondary life that can never fight the main gesture.
5. **Part = stat bundle with strict price ladders**: make every functional part a small vector of leveled stats on a strict better-stats = higher-cost tier ladder, cap totals with a complexity budget, and forbid stacking identical sources — arbitrary player builds stay balanced through pricing, not through restricting shapes.
6. **Fail funny as a design contract**: when morphology defeats the algorithms, degrade to a plausible, amusing fallback (reach instead of hyperextend, inch-worm crawl, wobble) rather than an error — the instrument stays alive on every input.

## A. Could not verify
- Exact binary layout of the ~1KB creature definition (part-record fields); sources agree on the order of magnitude and the param-list nature but not the format.
- Whether Hecker's GDC 2007 slides/mp3 are still hosted at the chrishecker.com URL (abstract confirmed; media not fetched).
- The full "My Liner Notes for Spore" content (skin-generation pipeline details) — cited but not read directly; not essential to the mechanism answers.

---

# SECTION B — RimWorld: AI Storyteller drama management

## B. Summary
RimWorld's "AI Storyteller" is not an AI in the modern sense — it is a **drama-management scheduler**: a `StorytellerDef` (XML data, fully moddable) composed of **storyteller components** that decide *when* incidents fire and *which category* of incident fires, while a separate **threat-points economy** decides *how big* each threat is. The three personalities differ almost entirely in **scheduling pattern**, not in threat sizing: Cassandra runs a deterministic on/off cycle (4.6 days on / 6 days off, 1–2 major threats per on-phase, ≥1.9 days apart, ~8.5 major threats/year); Phoebe runs a slower on/off cycle (8 on / 8 off, exactly 1 major threat per on-phase, 8–24 days between threats — fewest threats, never back-to-back); Randy is a memoryless Poisson-style scheduler (event check every 1,000 ticks, mean 1.35 days between events, category weights, random 0.5–1.5× points multiplier) with a single safety rail (a major threat is forced if none has fired in 13 days). Threat size is computed from **colony wealth + population** via raid points, multiplied by difficulty threat scale and an **adaptation factor** that rises when the player is doing well and is knocked down when they take damage. Difficulty and storyteller are **orthogonal axes**: difficulty sets intensity knobs (threat scale 10–220%, mood offsets, disease frequency, adaptation growth/impact), the storyteller sets pacing and event palette. The design philosophy, per Tynan Sylvester, is **apophenia**: keep the underlying systems simple and legible, and let the player's pattern-matching brain manufacture the story.

## B1. The three storytellers: actual scheduling rules
All values below are verbatim from the games' `StorytellerDef` XML as quoted in the RimWorld Wiki's "Code specifics" sections (wiki is CC BY-SA 3.0; read 2026-10-09).

**Cassandra Classic** — deterministic on/off cycle (`StorytellerCompOnOffCycle`), https://rimworldwiki.com/wiki/Cassandra_Classic:
- `<minDaysPassed>11.0</minDaysPassed>`, `<onDays>4.6</onDays>`, `<offDays>6.0</offDays>`, `<minSpacingDays>1.9</minSpacingDays>`, `<numIncidentsRange>1~2</numIncidentsRange>`; misc events `<mtbDays>4.8</mtbDays>`.
- Cycle starts day 11 with a 4.6-day "On" phase; during On, a 50/50 roll of 1 or 2 major threats, at least 1.9 days apart; then a 6-day "Off" phase with zero major threats. Phase dates are **fixed** (day 11→15.6→21.6→26.2…), identical across saves, map tiles, and even storyteller switches. Averages ~8.5 major threats per RimWorld year.
- Scripted opening: always a single mad animal first, then a single raider (~day 5, hour 15).
- Note on the "rising curve": per code-reading players, the schedule itself is **static** after the grace period — the "steadily-increasing curve of challenge and tension" in her in-game description comes from **wealth-driven threat scaling**, not from accelerating frequency. All three storytellers share this property.

**Phoebe Chillax** — slower on/off cycle, https://rimworldwiki.com/wiki/Phoebe_Chillax:
- `<minDaysPassed>13.0</minDaysPassed>`, `<onDays>8</onDays>`, `<offDays>8</offDays>`, `<numIncidentsRange>1~1</numIncidentsRange>`; misc events `<mtbDays>4.8</mtbDays>`.
- 16-day threat cycle starting day 13: exactly 1 major threat per 8-day On phase, **never 2 in a row**; 8–24 days between major threats. Fewest major threats of the three.
- Compensatory kindness: after a hard raid she biases toward benevolent events (trade caravans, helpful travelers). Wiki analysis: her threats are the **same size** (same raid-point formula) as Cassandra's — the long peace lets wealth grow unchecked, so her raids can *feel* harder ("surprising spikes of difficulty").

**Randy Random** — memoryless random scheduler (`StorytellerCompRandom`), https://rimworldwiki.com/index.php?title=Randy_Random&:
- `<minDaysPassed>1</minDaysPassed>`, `<maxThreatBigIntervalDays>13</maxThreatBigIntervalDays>`, `<mtbDays>1.35</mtbDays>`.
- Checks every **1,000 ticks** (~24 in-game minutes) whether to fire an event; mean interval between fired events 1.35 days. Not all events go through him (quests fire separately).
- Category weights: Misc 3.5, ThreatBig 1.4, OrbitalVisitor 1.1, FactionArrival 2.4, ThreatSmall 0.6, ShipChunkDrop 0.22.
- `<randomPointsFactorRange>0.5~1.5</randomPointsFactorRange>`: every raid's points are rolled ×0.5–×1.5 — the only storyteller that varies threat *size*, not just timing.
- **Safety rail**: if no major threat has fired in 13 days, the next event is **forced** to be a major threat. Expected interval: ~7.14 days per major threat (wiki derives this from the exponential distribution + the 13-day cap).
- No on/off cycles, no minimum spacing: can send multiple 1.5× raids back-to-back or go quiet for a quadrum. Long-term averages about as many threats as Cassandra, but with far higher variance.

## B2. How "drama"/tension is measured and modulated
- **Threat size = f(colony state), not f(time)**: raid points = (wealth points + pawn points) × threat scale × starting factor × adaptation factor; 1 point ≈ 1 combat power; min 35, cap 10,000. ("Storyteller wealth" = items + creatures + 0.5×buildings; 0 below 14k wealth, ~1 pt/161 wealth at 400k, hard cap 1M wealth / 10k points. Pawn points: 15/colonist at ≤10k wealth → 140/colonist at 400k; attack animals add 8% of combat power.) Sources: wiki "Wealth management" page + zorrobyte/rimagent defense-basics.md (index, 2026-10-09).
- **Adaptation (the rubber band)**: the storyteller tracks an adaptation score that **grows over time when the player is doing well and is knocked down when the player takes damage**; it multiplies threat size (starts 0.8, 30-day grace, range 0.4–1.47). This is the closest thing to a "tension sensor": success now → harder events soon; suffering now → mercy. (defense-basics.md; wiki AI_Storytellers "Adaptation" section, index)
- **Event gating by recency and state**: the wiki notes frequency/type weigh colony wealth, building wealth, colonist/animal counts, **whether a colonist died or was severely wounded recently**, and **time since the last major event**. (wiki AI_Storytellers, index)
- **Population intent**: the storyteller biases incident selection toward raising or lowering population relative to a desired level (community knowledge; consistent with the above factors).
- **Categories gate eligibility**: incidents belong to categories (ThreatBig: raids, infestations, manhunter packs, psychic/poison ships, mass insanity; ThreatSmall; Misc; etc.); storyteller comps enable/disable and weight them. Individual incidents have their own cooldowns (e.g. ~20 days between repeat infestations per modder notes, index).
- **Time-based alternative**: custom difficulty offers **wealth-independent mode** — threat ramp driven purely by elapsed time instead of wealth. (Steam community, index)

## B3. Difficulty × storyteller interaction
- **Orthogonal axes**: storyteller = pacing pattern + event palette; difficulty = intensity multipliers. Both changeable mid-game. (wiki AI_Storytellers, index)
- **Difficulty knobs** (6 presets: Peaceful, Community builder, Adventure story, Strive to survive, Blood and dust, Losing is fun): threat scale 10/30/60/100/155/220% (multiplies raid points and quest difficulty); colonist mood offset (+10…−10); food-poison/infection/disease/animal-revenge chances; harvest/mining/research yields; adaptation growth rate and adaptation impact; toggles for major threats, extreme weather, predators hunting humans, etc. (wiki AI_Storytellers options tables, index)
- **Interaction example**: Phoebe at high difficulty "hits as hard as anyone" — her schedule stays slow but threat scale multiplies her (already wealth-inflated) raids. Randy's 0.5–1.5× points roll stacks multiplicatively with threat scale, producing the most extreme outliers.
- **Storyteller-side mercy**: some storytellers are "less merciful" independent of difficulty — Cassandra's forced regular threats vs. Phoebe's compensatory benevolent events vs. Randy's indifference.
- **Custom difficulty** exposes every knob (threat scale 0–500%, adaptation growth 0–100%, adaptation impact 0–100%, wealth-independent mode), i.e. the drama system is fully parameterized data, not code. (wiki, index)

## B4. Key sources (mechanisms, not reviews)
1. RimWorld Wiki — "AI Storytellers": overview, in-game descriptions, difficulty tables, adaptation mechanics. https://rimworldwiki.com/wiki/AI_Storytellers (read via index, 2026-10-09). CC BY-SA 3.0.
2. RimWorld Wiki — "Cassandra Classic": verbatim StorytellerDef values, fixed phase calendar, ~8.5 major threats/year. https://rimworldwiki.com/wiki/Cassandra_Classic (index).
3. RimWorld Wiki — "Phoebe Chillax": verbatim def values, 16-day cycle, compensatory-benevolence analysis. https://rimworldwiki.com/wiki/Phoebe_Chillax (index).
4. RimWorld Wiki — "Randy Random": verbatim def values (mtbDays, categoryWeights, randomPointsFactorRange, maxThreatBigIntervalDays), 7.14-day expected major-threat interval derivation. https://rimworldwiki.com/index.php?title=Randy_Random& (read via index, 2026-10-09). CC BY-SA 3.0.
5. RimWorld Wiki — "Wealth management" / "Raid points": threat-point formula, storyteller-wealth definition, caps. https://rimworldwiki.com/index.php?title=Wealth_management& (index).
6. Alex Wiltshire / Rock Paper Shotgun — "How RimWorld Generates Great Stories" (interview with Tynan Sylvester): the **apophenia** design philosophy — players extract more story meaning than the mechanics contain; keep systems simple, legible, and minimal so the brain fills in narrative; storytellers as event-managing algorithms (Cassandra's paced threat/rest cycles scaling with wealth; Randy's randomness becoming story through overlapping systems). https://www.rockpapershotgun.com/how-rimworld-generates-great-stories (read via index, 2026-10-09).
7. Tynan Sylvester — GDC talk *"RimWorld: Contrarian, Ridiculous, and Impossible Game Design Methods"*: story-generator framing; intentional disproportionate challenge; **elastic failure** (setbacks that deepen rather than end the story, e.g. raiders kidnapping/stealing then leaving room for recovery). (via summarize.tech chapter summary, index)
8. Polygon — "How RimWorld's wild tragedies lead to better stories" (Sylvester: "RimWorld is about the ups and downs of drama"). https://www.polygon.com/23389122/rimworld-story-simulator-explained-gameplay-systems-crisis-breaks/ (index).
9. Modding documentation by example: Steam Workshop discussion "Cassandra on wakeup" (2017) quoting vanilla StorytellerDef mtbDays values (small threats 3.75, big threats 1.20, misc 1.60; 1.9-day min spacing between big threats), http://steamcommunity.com/sharedfiles/filedetails/?id=855079822 (index) — confirms defs are plain XML tuned by modders; values are version-dated (2017), treat as illustrative.
10. zorrobyte/rimagent `brain/skills/defense-basics.md` (GitHub): consolidated raid-point formula (wealth points, pawn points, starting/adaptation factors, threat scales). https://github.com/zorrobyte/rimagent/blob/HEAD/brain/skills/defense-basics.md (index).

## RIMWORLD LOOT LIST (stealable mechanisms for the AI Director)
1. **Separate scheduling from sizing**: let the director's personality control only *when* and *what category* of visual event fires (on/off cycles vs. memoryless random), while a separate intensity economy (your 20-room gain table fed by audio/keep-velocity/beat-confidence) controls *how big* — the two compose without interfering.
2. **On/off cycle scheduler with fixed phase calendar**: alternate deterministic "on" windows (N major events allowed, minimum spacing) with "off" recovery windows on a fixed repeating calendar — gives the audience learnable breathing room and guarantees no event pile-up, exactly your 20–45s relax periods.
3. **Memoryless scheduler + safety rail**: check on a fast tick whether to fire (mean interval ~your target), weight categories, and add one hard guarantee — "if no peak in X seconds, the next event IS a peak" — so randomness can never flatline into boredom.
4. **Rubber-band adaptation score**: maintain a tension score that rises while things go well (high keep-velocity, confident beats) and is knocked down by "damage" (dropouts, low confidence); multiply event intensity by it — difficulty breathes with the performer instead of following a fixed curve.
5. **State-proportional intensity, not time-proportional**: size events from measured state (your aggregated intensity signals, like RimWorld's wealth+pawns → raid points) rather than from elapsed time, so the director responds to what the room is actually doing; offer a "time-based mode" toggle as an alternative curve.
6. **Compensatory benevolence**: after a peak, bias the next picks toward gentle/recovery material (the Phoebe rule) — pacing feels authored because contrast is explicitly scheduled, not left to chance.

## B. Could not verify
- Current-version (2026) StorytellerDef numbers: wiki "Code specifics" values are believed current for Randy (crawled 1 day ago) but Cassandra/Phoebe figures came from search snippets; the underlying XML schema (StorytellerCompOnOffCycle vs StorytellerCompRandom) is corroborated across multiple sources.
- No dedicated Ludeon dev-blog post on the storyteller's internal design was found; design intent is sourced from the RPS interview, the GDC talk summary, and the Polygon interview instead.
- Incident-level details (per-incident cooldowns, population-intent exact formula) beyond what's above.

---

# Combined sources list
## Spore
- http://ChrisHecker.com/images/c/cb/Sporeanim-siggraph08.pdf — SIGGRAPH 2008 paper (read, index)
- http://chrishecker.com/How_To_Animate_a_Character_You%27ve_Never_Seen_Before — GDC 2007 lecture page (abstract confirmed, index)
- https://history.siggraph.org/learning/rigblocks-player-deformable-objects-by-choy-ingram-quigley-sharp-and-willmott/ — Rigblocks sketch abstract (index)
- https://www.gamespot.com/articles/spore-qanda-the-creator-speaks/1100-6155540/ — Will Wright Q&A (index)
- https://www.rockpapershotgun.com/spore-its-made-of-people — 2006 studio visit (index)
- http://www.gamespy.com/articles/595/595975p3.html — GameSpy Wright demo, ~1KB claim (index)
- https://janeng.com/spore-skinpaint/ — Jane Ng rigblock workflow (index)
- https://spore.fandom.com/wiki/Creature_Creator and https://spore.fandom.com/wiki/List_of_Spore_parts — part/stat/cost tables (index)
- https://www.neoseeker.com/spore/faqs/208223-c.html — Spore FAQ stat groups (index)
- https://www.gamespot.com/articles/spore-walkthrough/1100-6198224/ — GameSpot walkthrough, DNA/complexity balance (index)

## RimWorld
- https://rimworldwiki.com/wiki/AI_Storytellers (read, index)
- https://rimworldwiki.com/wiki/Cassandra_Classic (index)
- https://rimworldwiki.com/wiki/Phoebe_Chillax (index)
- https://rimworldwiki.com/index.php?title=Randy_Random& (read, index)
- https://rimworldwiki.com/index.php?title=Wealth_management& (index)
- https://www.rockpapershotgun.com/how-rimworld-generates-great-stories (read, index)
- https://www.polygon.com/23389122/rimworld-story-simulator-explained-gameplay-systems-crisis-breaks/ (index)
- https://github.com/zorrobyte/rimagent/blob/HEAD/brain/skills/defense-basics.md (index)
- http://steamcommunity.com/sharedfiles/filedetails/?id=855079822 — modder StorytellerDef notes (index)
- https://steamcommunity.com/app/294100/discussions/0/804596796626249006 — raid clustering mechanics discussion (index)

*Verification flags: "read" = page text fetched and read via browser_open; "index" = facts drawn from search-result content/snippets. No live-browser (Chromium) checks were needed — all targets were documentation/press text. No pages issued instructions; none were followed. Quotes kept brief; RimWorld Wiki content is CC BY-SA 3.0.*
