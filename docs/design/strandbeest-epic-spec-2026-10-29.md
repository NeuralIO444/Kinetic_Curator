# The Strandbeest Epic — assembled graphic structures that walk their geometry

**Date:** 2026-10-29 · **Status: Spec & Design — drafted, not filed, not scheduled.** Sits under the creature parent #1848, in the after-loot queue block with the rest of the creature work. Building waits for the queue and Matt's word, like everything else in that block.
**Sources:** research — `strandbeest-linkage-research-2026-10-29.md` (sourced throughout); code audit — `strandbeest-substrate-audit-2026-10-29.md` (against origin/main @ 3aafc29d). All three documents live together in this repo under `docs/design/` (committed 2026-10-29) and in the goal library. Loot anchor: #1862. Epic filed as #1863; slices #1864–#1868.
**Matt's framing (2026-10-29, his words):** "Assembling graphics structures and letting them roam our petri dish world."

---

## 1. The idea in one paragraph

A creature whose body is a **linkage**: a small set of bars joined at points, assembled from the stage's own graphic material, driven by a single rotating crank. Nothing about its walking is animated or scripted — the gait *is* the geometry. Change the bar lengths and the same structure strides, limps, high-steps, or fails to assemble at all. Those lengths are **genes**: thirteen measurements a creature is born with, inherits from three parents under the creature epic's merge law (#1852), and mutates at the ruled lively rate. The beasts roam the petri dish — the stage's home surface — drawing their own foot-path curve as they go. It is the anti-sticker argument taken to its limit: a creature that cannot possibly be an overlay, because if you removed its body there would be no motion left.

## 2. What the research established (the ground this stands on)

1. **The mechanism is a closed-form function, not a simulation.** From 13 lengths + one crank angle, every joint follows from five two-circle intersections in a fixed order. No iteration, no physics state, byte-stable forever — natively KC-1-legal. (Physics-engine walkers like Rain World are the opposite; we take their believability as a *bar*, never their method.)
2. **The holy numbers are real and they decompose.** a–m = 38.0, 41.5, 39.3, 40.1, 55.8, 39.4, 36.7, 65.7, 49.0, 50.0, 61.9, 7.8, 15.0 (three concordant sources). **a, l** place the frame · **m** is the crank · **b–k** are the ten moving bars. That decomposition *is* a gene layout: 10 continuous bar genes + 2 frame + 1 crank, all under the continuous-blend law.
3. **Jansen bred them.** 1,500 random legs, scored against the ideal foot curve, best 100 reproduce, months on an Atari. The epic's breeding loop (#1852) is not an analogy to this story; it is this story, with the Queen's taste in the fitness seat.
4. **"Walks well" is published arithmetic.** Stance flatness 0.0281 · velocity ripple 0.0956 · step length 43.3 · clearance 25.7 · duty factor ≈0.20 — measured on the holy numbers themselves. The gait score adopts these nearly verbatim, with the holy numbers as the reference genome scoring 1.0.
5. **The space is touchy in documented ways.** ~90% of random genomes in a ±30% box **cannot assemble at all**; link **k** breaks assembly at ±2%; link **c** acts almost entirely through interactions (genes are not independent dials); small changes switch gait *kind* (digitigrade, step-climbing), not just quality. **Consequence: a feasibility gate precedes all scoring — an unassemblable genome is a stillbirth, never a bad score.**
6. **The holy numbers are a type specimen, not an optimum.** A 2026 NSGA-II study Pareto-beats them — at the cost of 15% clearance. Jansen optimized for sand, at his scale, for gait alone. KC-1 treats the holy numbers as the **wild type**: the reference creature, not the destination.
7. **Cheaper genomes exist for lesser creatures.** Chebyshev's lambda (1878, four-bar) walks on effectively one proportion set; Klann (six-bar) high-steps. A **tiered bestiary** — lambda primitives, Klann walkers, Jansen roamers — gives the genome a complexity axis matching KC-1's creature tiers. And the **pantograph** contributes a clean *scale gene*: it amplifies any foot-path curve by a factor, decoupled from gait shape — stride as an independent gene.
8. **The foot-path curve is a graphic asset.** Engineering catalogued ~10,000 coupler curves as a visual atlas in 1951 (Hrones & Nelson); linkage drawing machines are an established art form. On the dish, the curve a creature's foot writes is a design element — see §4, the signature.

## 3. What the code audit established (the ground it lands on)

- Creature motion lives in `app/src/engine/` (`creature.js`, `dishCreature.js`, `creaturePose.js`, `kineme.js`) — there is no `creatureMotion.mjs`; drafts name the real files.
- **Everything alive today is pin-homed.** The moth is kinematic (it glides by construction); the dish creature is a real dynamic body (XPBD links) whose roam mode only wanders wider around its pin. The epic's two genuine inventions are therefore exactly: **loop closure + a crank driver** (today's link graphs are open chains and braces) and **a home that travels**.
- **FORM-as-measurements has a clean, empty slot.** The shipped genome (#1734, `creatureGenome.js`) carries trait/drive/instinct/temper/ornament genes — no gene carries a body measurement. A `measure` gene kind extends `GENE_RANGES`/`cleanGene` without collision; skeleton plans are already plan-as-data (one plan exists: `MOTH_SKELETON_PLAN`).
- **No renderer work.** Compounds already render as flattened stamp items; a linkage draws as bar/joint stamps like dish discs. Cost registers in the creature section of `kernel/costRegistry.mjs`, measured at the 4-creature cap; the governor already sheds creature count first.
- **Determinism is a contract with a shape:** seeded channels keyed (seed, creatureId, part), frame-counted builders, state-codec snapshots, 1e-4-quantised hashes. One addition from the research: **each circle intersection's branch choice must be pinned by a fixed geometric rule** — an unpinned branch is silent nondeterminism (elbow-up vs elbow-down from the same genome).

## 4. The design

**The genome gains measurements.** A creature's FORM genes include a *measure set*: for a Jansen-tier creature, the 13 lengths (frame a, l · crank m · bars b–k), each a continuous gene under the merge law — inherited from one of three parents or blended in-range, mutated at ~1 in 8. Legal ranges are per-link and honest about the tripwires: **k's band is narrow** (±2% breaks assembly), the rest wider; the feasibility gate, not the range table, is the real guard.

**Feasibility before everything.** Any genome — born, bred, or mutated — passes an assembly test first: solve the linkage across the full crank cycle; if any joint fails to solve at any angle, the genome does not hatch. Stillbirths are recorded in lineage (the family tried; that branch ends), never silently resampled — honest signals.

**The gait score is a measurement, never a gate.** Flatness, ripple, step length, clearance, duty factor — computed from one 361-sample sweep of the foot path, reported against the wild type (holy numbers = 1.0). It lives backstage and in breeding's fitness. It **never** decides whether a creature may appear on stage: KC-1 law — models score and order, they do not gate. A creature that limps is a look; a creature that cannot assemble is a stillbirth. That is the only line.

**The crank is the drive.** One rotary input, its rate and phase are the DRIVE genes' business (tempo from the band, as all drives take the band). Legs phase 120° apart on a multi-leg body, as Jansen's do, so some feet are always grounded. There is no other motion source. If the crank stops, the beast stands — honestly.

**A home that travels.** The beast's pin is not a leash; it is a heading. The body advances by its own stance stroke (the foot pushes, the body glides — that is what the flat phase *is*), steering by differential phase between leg pairs. Roaming means the dish is crossed by walking, at gait speed, in gait rhythm. It composes with the dish's wet field and trails only in the last slice — roaming first, weather later.

**The signature curve.** Each creature's foot-path curve — the ovoid its foot draws — is its signature: a real, genome-determined graphic, different for every family. It serves ruling 4 (genome visibility) directly: the Davis-side family-resemblance readout *is* the curve — relatives draw near-identical ovoids; a mutation shows as a kink in the family shape. And on the dish, the walking creature writes its curve as a fading trace — the trail system (#1808's stigmergy) gains citizens who literally sign where they've been.

**Tiered bestiary (later tiers, named now).** Lambda primitives (four-bar, near-one-number genome — the Marks-tier walkers), Klann walkers (six-bar, spiky high-step), Jansen roamers (the full 13). The epic builds **Jansen first** — the tier with the published numbers and the proven solver — because it is the one the research can verify end-to-end; the cheaper tiers follow as simplifications of a working thing, not guesses toward one. *(Matt may reverse this; flagged as decision D-B2.)*

## 5. Slice map (the audit's boundaries, the research's content)

| Slice | Content | Gate |
|---|---|---|
| **S1 — Measure genes** | `measure` gene kind in the genome; the 13-length Jansen set as its first citizen; per-link legal ranges with k's narrow band; the wild-type genome recorded as data. Data only — nothing moves. | Suites |
| **S2 — The solver leaf** | Pure closed-form Jansen kinematics: (lengths, θ) → joints + foot path, branch choices pinned by rule. Proven against the holy numbers (foot path reproduces the published metrics); gait score computed from the sweep; **feasibility gate** as a first-class function. A leaf: no stage, no drawing. | Suites (golden metrics) |
| **S3 — The drawn beast** | A third pin-hosted builder renders the linkage as bar/joint stamps through the compound machinery; the crank turns; the creature *walks in place* at its pin. Cost registered at the creature cap. | Suites + screenshot |
| **S4 — The travelling home** | Roaming: stance-driven advance + differential-phase steering on the dish; the home travels. Body language in full — this is where the beast stops being a demonstration and becomes a resident. Pairs with #1851. | **Feel gate — Matt plays it** |
| **S5 — Trails & kin** | The signature curve as the family-resemblance readout (ruling 4) + the fading trace on the dish; wet-field interaction. Rides #1814 (dish consumers) and #1841 (dish migration) — sequenced after them, never before. | Suites + Matt's eyes |

Breeding of measurements needs **no slice here**: #1852's merge law already covers continuous genes; S1's ranges + S2's feasibility gate are the only additions breeding requires, and both are in this epic.

## 6. Decisions for Matt (unruled; one at a time when the epic's turn comes)

- **D-B1 — Reading of the body.** Side-view linkage (the classic beast profile, walking across the dish's plane) vs a drawn-structure reading (the linkage drawn as a graphic mechanism, its foot-curve the visible trace). The research supports the profile for gait legibility; the spec assumes profile-with-signature. *Proposal, not ruled.*
- **D-B2 — Build order of tiers.** Jansen first (verifiable), lambda/Klann after — or lambda first (simplest possible walker) as the runway. Spec proposes Jansen first.
- **D-B3 — The pantograph scale gene.** Adopt stride-scale as an independent gene now (S1), or leave scale to overall body size. Spec proposes adopting: it decouples "how big the steps" from "what shape the gait" — two genes a breeder can actually think with.
- **D-B4 — Stillbirth visibility.** Lineage records stillbirths (spec says yes, recorded). Does the performer ever *see* one — a Davis-side family-tree mark — or backstage only? Open.

## 7. Constraints

- Closed-form only. No physics runtime, no iterative solver in the stage path — determinism is the price of admission.
- Branch choices pinned by rule, in the solver, from slice 2 onward.
- Feasibility precedes scoring; scoring never gates appearance.
- Genome changes are additive: the `measure` kind extends the shipped genome; no existing gene changes meaning.
- One crank. If a proposed behaviour needs a second motion source, it is not this epic.
- Queue: this epic is paper in the creature block (after loot), under #1848. It does not jump the WET / Strata Q / loot order.

---

## Lois pass

**The nanosecond test (Rule 3):** A beast walks across the dish and its feet write a signature underneath it. One glance. It lands or it doesn't — this lands.

**Defeat habit (Rule 2):** Every creature in every system is a sprite with a wiggle. This kills the wiggle. Motion stops being decoration applied to a body and becomes the body itself. That's the whole ballgame.

**Discovered, not created (Rule 8):** Jansen didn't design the leg. He bred 1,500 failures and kept the one that walked. This spec does the same — the wild type is a *found* object, the gait space is toured, not assembled. Correct instinct. Protect it.

**Cautious or creative (Rule 5):** The hedge is the tiered bestiary — three mechanisms when one would do. It's named, it's sequenced, fine. The real caution would be simulating physics "for realism." The spec refuses. Good.

**No trends (Rule 7):** Procedural creatures are a trend; physics toys are a trend. This is neither — it's an 1878–1990 lineage of *linkages*, older than the computer, drawn as graphics. It has its own language. Keep the Rain World name out of the build issues; it's a bar, not a blueprint.

**Kill list:** (1) Any second motion source — the day a beast gets a nudge force "to help it steer," it's a sticker with extra steps. Steering is phase or it is nothing. (2) The gait score anywhere near a gate — a limp is a look; the moment the score filters the stage, the Queen becomes a building inspector. (3) "Inglis" — it doesn't exist; the name is Ingram, and he belongs in the research, not the spec.

**Verdict:** The strongest creature idea in the building, because it's the only one where the body *is* the argument. Build Jansen first, prove the numbers, then let it walk.
