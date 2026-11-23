# CULTURE — a physics-creature foundation for KC-1 (draft spec)

> **Status: SPEC COMPLETE — design conversation 2026-11-19; final rulings 2026-11-22. Nothing in this document is built yet; building follows the phasing on Matt's order.**
>
> This draft records the direction Matt ruled during the design conversation that followed the audit of KC-1's 52 motion and animation systems. Decisions in **Ruled** are Matt's. Items in **Proposed** are Ember's recommendations and remain proposals until Matt rules on them. Items in **Open questions** have not been decided.

## 1. The idea

KC-1's next motion foundation is **CULTURE**: one shared, top-down 2-D physics world in a dish. The name holds both meanings at once — a living culture grown in a dish, and a society of creatures. Everything in that world is creature-based. A physics engine supplies contact, collision, momentum, and jointed movement; a behaviour architecture in the spirit of Joshua Davis's HYPE framework attaches reusable behaviours and drives to objects; and Disney's 12 principles of animation supply the feel layer — especially squash and stretch, anticipation, follow-through and overlapping action, slow in and slow out, arcs, secondary action, timing, and exaggeration. Creatures are assembled bodies whose behaviour can include flocking, hunger, breeding, clumping, and growing. The point is not to add another isolated animation system. It is to give the stage one living world in which bodies sense, affect, feed, reproduce, change, decay, and are reused.

## 2. Ruled

### 2.1 This is the new foundation

- This is a **new foundation, not a sandbox experiment**.
- It is the direction that eventually replaces KC-1's fragmented dish, creature, and ferro motion systems.
- Building remains paused until Matt separately orders it.

### 2.2 Legacy motion becomes loot and recipes

- Useful or cool behaviour from the old motion systems is not thrown away.
- Legacy behaviour is kept as **loot** and reapplied on the new foundation as **recipes or presets**.
- The foundation is the base. A recipe or preset tweaks its settings so the world can feel like an older animation system without restoring that system as a separate motion architecture.

### 2.3 The world is the dish from above

- The dish is viewed **from above**.
- There is **no gravity** and no floor-based falling or piling.
- Bodies drift, collide, gather, and clump in the plane because fields, drives, and physical interactions move them.

### 2.4 Creatures are assembled compound bodies

- A creature is **assembled**, following the WetLab creature record: head, limbs, and attach points.
- Physics moves the assembled creature as one **compound body**.
- Its parts are jointed and can swing, drag, lag, and settle through the body rather than being animated as an unrelated sticker.
- The creature aesthetic remains graphic and assembled — an interesting hierarchy of graphic-design elements, more layout than literal animal — rather than creatureoid, humanoid, or bugoid realism.

### 2.5 Creatures eat beats

- The food web is **beats**: rhythm and audio energy.
- The band plays, and the creatures feed on the playing.
- Hunger is therefore tied to the musical life of the stage rather than to an unrelated resource dropped into the world.

### 2.6 The Queen is the zookeeper

- The **QUEEN** is the zookeeper of the dish and the persona who tends the creature world.
- Her audible beats are the feeding.
- The Queen's hands are the hands that work in the world.

### 2.7 The Governor manages the zookeeper

- The **GOVERNOR** is the manager of the zookeeper.
- The chain is:

  **GOVERNOR manages → QUEEN keeps → creatures live**

- The Governor **never touches the dish himself**.
- He directs the Queen; he does not become a second direct actor inside the world.

### 2.8 The Lab makes creatures; the Zoo keeps them

The persona casting for creature creation is:

- **CURATOR directs the Lab.**
- **KINETIC assembles bodies from parts.**
- **DAVIS writes the recipes.**
- **LOIS is the gate.**

A **recipe** is a named bundle of:

- creature drives;
- physics dials;
- 12-principles seasoning.

A creature is **instilled with a recipe at birth**. Body plus recipe gives the creature its temperament. Bred creatures inherit a blend of their parents' recipes.

Legacy feels can return as DAVIS recipes on the new foundation.

LOIS ranks recipes and creatures. She never builds. Her praise is the quality bar. Breeding rights were suggested during the conversation as a possible consequence of LOIS's praise, but that consequence was **not separately ruled**.

### 2.9 Death returns the body to the dish

- A dead creature's body **decays in the dish**.
- Its limbs can be **looted by other creatures in the dish**.
- Body parts therefore circulate through the ecology instead of disappearing at death.

### 2.10 A looted limb attaches

Ember proposed the attachment rule and socket/upkeep limits as one recommendation, and Matt accepted it:

- A looted limb **attaches** to the looter; the looter wears it and its body changes.
- Attach sockets are limited by the looter's body plan.
- Every carried limb costs **fat upkeep**.
- A looted limb keeps its **original look**, making its provenance visible.

## 3. Proposed

> **Everything in this section is an Ember recommendation awaiting Matt's ruling. None of it is decided law.**

### 3.1 Beats land as morsels

**Proposal:** Each beat lands as a morsel at a place in the dish, near the source that played it. Creatures can move toward it, compete for it, consume it, and clump around fresh drops.

Under this proposal:

- uneaten morsels decay;
- a dense passage creates a visible feeding event;
- quiet passages are lean times;
- in silence, creatures live from stored fat and slow down rather than freezing;
- moving in the pocket could improve digestion or yield, but synchrony would be a seasoning rather than the base feeding mechanic.

This spatial model would make hunger legible to an audience: feeding becomes something that can be seen happening somewhere in the dish.

### 3.2 Population tiers: bodies everywhere, full drives only for creatures

**Proposal:** Every mark admitted to the dish receives a physics body, but only assembled creatures receive the full creature drives.

That means ordinary marks can:

- occupy space;
- collide;
- drift;
- be pushed or gathered;
- participate physically in the one world.

Assembled creatures additionally can:

- hunger and feed;
- flock and clump as drives rather than only as physical outcomes;
- breed;
- grow;
- loot and attach limbs;
- carry a recipe and a life history.

This keeps the stage's whole material population inside one physics world without making every mark a full animal.

### 3.3 Breeding mixes body parts as well as recipes

**Proposal:** A child is assembled from both parents' body parts as well as from a blend of both parents' recipes.

Under this proposal:

- body inheritance and temperament inheritance are separate channels;
- a child's visible form can show both parents;
- recipe blending supplies variation in drives, physics feel, and animation seasoning;
- breeding costs fat, so only sufficiently fed creatures breed;
- the resulting economy closes the loop: beats become fat, fat supports upkeep and breeding, and new bodies enter the ecology.

The recipe blend itself is ruled in §2.8. Mixing the parents' physical parts and charging fat for breeding remain proposals.

### 3.4 Growth is XP earned by living

**Proposal:** Growth is governed by experience points earned through a creature's life rather than by food alone or by an unconditional age clock.

Possible XP sources include:

- eating beats;
- looting and attaching a limb;
- surviving a lean period;
- breeding;
- other significant life events.

When XP crosses a threshold, a growth event occurs. The thresholds and roll weights live in the tuning table. **The table rolls the growth event**, choosing among outcomes such as:

- larger body;
- a new attach socket;
- a stronger drive.

Possible XP boosts include:

- praise from LOIS;
- moving in the pocket.

All numerical values — XP awards, thresholds, roll weights, boost multipliers, and upkeep costs — should remain named tuning-table values. They may be proposed through the table but must not be silently edited into law.

### 3.5 Build the engine in-house on a fixed timestep

**Proposal:** Use an in-house fixed-timestep physics simulation, growing from KC-1's existing physics work rather than adopting a boxed engine that fights the takes system.

The motion audit found frame-counted and per-frame behaviour that makes the same performance feel different at different refresh rates. A fixed simulation step would address that divergence at its root:

- simulation advances in consistent increments;
- rendering interpolates or presents the simulated state;
- a take's recorded inputs and checkpoints retain a stable meaning across displays;
- creature behaviour does not speed up merely because a display runs at 120 Hz instead of 60 Hz.

This is an engineering recommendation, not yet a ruled implementation choice.

## 4. Rulings on the former open questions (Matt, 2026-11-22)

The questions that stood open in the 2026-11-19 draft are all ruled:

1. **What kills besides starvation?** — **Predation.** Creatures can kill each other. Death therefore comes by starvation and by predation. (Age and upkeep failure were considered and not chosen; they are out unless Matt reopens them.)
2. **How does a take seed its starting population?** — **The Lab casts fresh each take.** KINETIC assembles the bodies, DAVIS writes the recipes, LOIS gates the cast. A take does not inherit a standing zoo population.
3. **What is the performer's hand in the zoo?** — **A force, never a body.** The hand stirs and scatters; finger painting (#2153) enters the dish as a current the creatures feel, not as a physical object they collide with.
4. **Who controls dish fields under the new foundation?** — **The Queen owns the fields.** She places and moves the dish's standing fields under the Governor's direction; recipes and personas may only request.

Other details — including the exact physics solver, collision shapes, behaviour scheduler, sensory ranges, fat accounting, decay timing, breeding eligibility, and growth tables — remain build-time specification work, now unblocked by the rulings above.

## 5. Relation to existing law

### 5.1 One dish and mutual awareness

This foundation is an architectural expression of KC-1's existing one-dish direction and the mutual-awareness law associated with issues #1183 and #2104. Systems should not each maintain a private world and merely draw near one another. They share one world, one population of bodies, and physical consequences that other systems can sense and affect.

### 5.2 Life underneath the dish

Issue #2152 rules that Life is never drawn: it computes underneath and reaches the stage as an invisible force.

**Ruled (Matt, 2026-11-22): Life is the soil.** The CULTURE dish grows in the #2152 Life layer: living ground feeds the ecology — fertility, decay, and creature fortune read it — and dead ground kills, exactly as the #2152 ruling already provides. The Life layer is not a separate system running beneath a different world; it is this world's ground.

### 5.3 Type exclusivity

Type exclusivity still holds. Letters, numbers, and glyphs are not solo stage assets and do not become creatures merely because the new foundation gives stage material physics bodies. Type continues to route through the poem system under its existing law.

The proposed population tiers in §3.2 concern marks admitted to the dish; they do not repeal the glyph exclusion or make letterforms a creature population.

### 5.4 Takes, determinism, and the Full WebGL ruling

The foundation must preserve the takes system's distinction between what is decided, simulated, recorded, and replayed.

Under the existing Full WebGL direction:

- takes remain deterministic at the decision/contract level;
- simulation kernels may be GPU-resident;
- where a simulation outcome is per-device, the take must carry the applicable `simLaw` stamp — `js-exact` or `decisions-exact` — honestly;
- GPU or physics results needed for exact replay must be recorded as inputs rather than silently assumed to reproduce identically on another device.

The proposed fixed timestep in §3.5 is intended to reduce avoidable frame-rate divergence. It does not erase the simLaw obligation.

## 6. Summary of the ruled shape

The ruled foundation is:

- one dish, viewed from above;
- no gravity;
- assembled compound creature bodies;
- HYPE-style behaviours and drives;
- the 12 principles as the animation-feel layer;
- beats as food;
- the Queen as zookeeper;
- the Governor as the Queen's manager, never touching the dish;
- a Lab where the Curator directs, Kinetic assembles, Davis writes recipes, and Lois gates;
- creatures instilled with recipes at birth;
- death, decay, and limb looting;
- looted limbs attaching under socket and upkeep limits;
- the old motion systems preserved as loot and re-expressed as recipes or presets on the new base.

**End of spec. The specification is complete as of 2026-11-22. Build phasing lives in `culture-phasing.md` (companion doc); the build was authorized fully auto by Matt on 2026-11-22.**
