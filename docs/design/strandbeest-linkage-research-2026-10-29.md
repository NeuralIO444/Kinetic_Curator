# Strandbeest / Jansen Linkage — Research for the Creature Epic

**Date:** 2026-10-29 · **Status:** research only — no code, no issues. Prepared for the assembled-creatures epic (#1848 parent; loot #1862). Established fact is cited inline; anything that is my synthesis for KC-1 is labelled **[synthesis]**.

---

## Bottom line for the epic

1. **The mechanism is a closed-form function, not a simulation.** Given the 13 lengths and one crank angle, every joint position follows from five two-circle intersections in a fixed order — no iteration, no physics solver, no accumulated state ([Wang 2026](#sources)). That makes it natively KC-1-legal: a pure, seeded, byte-stable function of (genome, crank angle). Physics-engine walkers (Rain World, Sims, Soda Constructor) are the opposite — iterative solvers whose output is not guaranteed bit-stable; the design should take their *look*, not their *method*.
2. **The genome really is 13 numbers, and they decompose cleanly.** a–m = 38.0, 41.5, 39.3, 40.1, 55.8, 39.4, 36.7, 65.7, 49.0, 50.0, 61.9, 7.8, 15.0 ([Wikipedia](#sources)). Of these, **a and l place the frame pivot**, **m is the crank**, and **b–k are the ten moving bar lengths**. A FORM gene set of ~10 continuous measurements + 2 frame + 1 crank maps exactly onto KC-1's "continuous genes may blend in-range" law.
3. **Jansen found the numbers the way #1852 proposes to breed.** 1,500 random legs → score each by how closely its foot path approaches the ideal walking curve → best 100 reproduce → months of generations on an Atari ([Jansen's own account](#sources)). The epic's breeding loop is not an analogy to the Strandbeest story; it *is* the Strandbeest story, with the Queen's taste as the fitness function.
4. **"Walks well" is measurable with published metrics and published baselines.** Stance flatness, stance velocity ripple, step length, ground clearance, and duty factor are all defined and computed in the literature for the holy numbers themselves — flatness 0.0281, ripple 0.0956, step 43.3, clearance 25.7, duty factor ≈ 0.20 ([Wang 2026](#sources)). These can be adopted nearly verbatim as the epic's gait score / selfcheck material.
5. **The parameter space is touchy in specific, documented ways.** Link **k** is feasibility-limiting — ±2% can make the leg fail to assemble at some crank angles. Link **c** acts mostly through interactions with other lengths, so genes are **not** independent dials ([Wang 2026](#sources)). And merely perturbing lengths produces *qualitatively different gaits* (digitigrade, obstacle-avoidance, step-climbing…) from the same topology ([Nansai et al. 2015](#sources)). Breeding design must include an assembly-feasibility test and must expect gait *kind* to change, not just gait *quality*.
6. **The holy numbers are not sacred — they are one point on a front.** A 2026 NSGA-II study Pareto-dominates them (better flatness *and* ripple *and* durability) with every length changed by ≤29% — but only by accepting 15% less ground clearance ([Wang 2026](#sources)). Jansen optimized gait alone, for sand, at his scale. KC-1's creatures should treat the holy numbers as the *type specimen* (the "wild type" genome), not as a target to converge on.
7. **Cheaper genomes exist for lesser creatures.** The Chebyshev lambda (1878) walks with a four-bar and effectively one proportion set; the Klann (1994) with six bars and a spikier, higher-stepping gait. A tiered bestiary — lambda primitives, Klann walkers, Jansen roamers — gives the genome a complexity axis that matches the creature tiers KC-1 already thinks in. **[synthesis]**
8. **The foot-path curve is a graphic asset in its own right.** Engineering treated coupler curves as a visual catalog a century before software (Hrones & Nelson's 1951 atlas of ~10,000 curves), and linkage drawing machines are an established art form. On the dish, the creature's trace — the curve its foot writes — can be the design element, not a debug view. **[synthesis, on cited precedents]**

---

## 1. The Jansen linkage, precisely

### The mechanism

The leg is a planar, single-degree-of-freedom mechanism. One crank rotates about a fixed centre O; every other joint is unactuated and its position is *uniquely defined* by the crank angle ([Wikipedia, Jansen's linkage](#sources)). Counting rigid bodies: a crank plus a linkage forming **seven moving rigid bodies connected by ten revolute joints**; with the ground link, the Grübler count gives 3(8−1) − 2·10 = **1 DoF** ([Wang 2026](#sources)). Popular descriptions say "eleven bars" (the physical leg is cut from eleven tube lengths, and two groups of bars form rigid triangles, which is why the rigid-body count is lower than the tube count). Two legs share one crank as a mirrored pair, so a single shaft drives a whole beast ([Giesbrecht 2010, via Wikipedia](#sources)). Beasts phase their leg pairs 120° apart so some feet are always grounded ([Veritasium summary of Jansen](#sources)).

### The holy numbers

Jansen's published proportions (dimensionless; he built at many scales):

| a | b | c | d | e | f | g | h | i | j | k | l | m |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 38.0 | 41.5 | 39.3 | 40.1 | 55.8 | 39.4 | 36.7 | 65.7 | 49.0 | 50.0 | 61.9 | 7.8 | 15.0 |

([Wikipedia](#sources); identical table in [Wang 2026](#sources) and in [Jansen's own published account](#sources).) Sources variously call these the "eleven", "twelve", or "thirteen holy numbers" — the count differs because some include the crank and frame dimensions and some don't. The 13 values above are the complete set; nothing else is needed to build the leg.

**What each controls** — from the standard kinematic model, in which the crank centre is O = (0,0) and the second frame pivot is G = (−a, −l), the crank tip is J₁, and the remaining joints are solved in chain ([Wang 2026](#sources)):

- **m (15.0)** — the crank radius. J₁ = O + m·(cos θ, sin θ). The sole input; scales the drive.
- **a (38.0), l (7.8)** — *frame geometry*: the horizontal and vertical offset of the second ground pivot G from the crank centre. These two fix where the leg hangs from the body.
- **j (50.0), b (41.5)** — crank tip J₁→J₂, and frame G→J₂: the first rocker pair, driven directly by the crank.
- **e (55.8), d (40.1)** — J₂→J₃ and G→J₃: the second rocker pair off the frame.
- **k (61.9), c (39.3)** — J₁→J₄ (the long diagonal from the crank tip) and G→J₄: these position J₄, the joint that carries the foot assembly.
- **f (39.4), g (36.7)** — J₃→J₅ and J₄→J₅: the lower joint J₅.
- **h (65.7), i (49.0)** — J₅→F and J₄→F: the foot point F is the apex of the rigid triangle J₄–J₅–F. h is the longest bar in the leg.

### The flat-foot property

The foot path is an ovoid coupler curve with two regimes: a **long, nearly straight, nearly constant-velocity ground stroke** (stance), then a **fast, high return arc** (swing). Jansen's own description: "When the toe reaches the end of the base, the leg is lifted whereupon it rapidly describes the other two sides of the triangle" — he conceived the target curve as *triangular*: flat base, quick return ([Jansen via Ward Cunningham's wiki](#sources)). Measured on the holy numbers: step length 43.3, peak ground clearance 25.7, and a duty factor of ≈ 0.20 under the strict definition "fraction of the cycle the foot spends in the lowest 15% of its height range" ([Wang 2026](#sources)). The stance works because during it the foot moves backward relative to the body at almost constant height and speed, so the body glides forward without bobbing — the property every walking-linkage designer since Chebyshev has been chasing (§4).

### How Jansen derived the proportions

Per Jansen's own account ([strandbeest.com, mirrored at Ward Cunningham's wiki](#sources)): he generated **1,500 legs with rods of random length** in a computer program, assessed which of them **approached the ideal walking curve**, selected the **best 100**, and awarded them "the privilege of reproduction"; the process ran for **months** (on an Atari, per multiple accounts — [Dedece](#sources), [Veritasium summary](#sources)) until it produced the leg of *Animaris Currens Vulgaris*, the first beast to walk. The narrative history adds the design insight that preceded the search: late in 1991 he realized a *single* crank at the hip could drive the whole leg, reducing the problem to finding the right ratios among 13 lengths — a space far too large for brute force, hence evolution ([Dedece](#sources)). Two honest caveats: (a) the surviving accounts are Jansen's own retellings and vary in detail (1990 vs 1991 start; "eleven" vs "thirteen" numbers); the 1,500 → 100 selection structure is consistent across all of them. (b) The fitness criterion was *one* thing — closeness of the foot path to the ideal curve (flat stance, clearance, no cusps) — not energy, not durability, not looks ([Wang 2026](#sources), intro).


---

## 2. Simulating it

### The math: five circle intersections, in order

Because the mechanism has exactly 1 DoF, forward kinematics is a *chain of two-circle intersections* — each joint is the intersection of two circles centred on already-known joints, with a fixed branch choice ([Wang 2026](#sources), eqs. 1–3; the same "circle intersection method" underlies Patnaik & Umanand's bond-graph model):

```
J₁ = O + m·(cos θ, sin θ)
J₂ = circ(J₁, j;  G, b)
J₃ = circ(J₂, e;  G, d)
J₄ = circ(J₁, k;  G, c)
J₅ = circ(J₃, f;  J₄, g)
F  = circ(J₄, i;  J₅, h)     ← the foot
```

where circ(P₁, r₁; P₂, r₂) is the branch-selected intersection of the two circles. This is *closed form*: no Newton iteration, no constraint solver, no state carried between frames. The crank angle is the only input; θ(t) is the drive. (A UC Berkeley CS184 student implementation independently arrived at the same structure — a "resolution function" p(q) over a single generalized coordinate, computing each point once its two constraints are known, in a fixed resolution order — [CS184 project](#sources).)

### Cost

**[synthesis — arithmetic from the published equations, not a benchmark]** One leg at one crank angle costs five circle intersections ≈ five square roots and on the order of a hundred flops. A 12-leg beast costs ~60 intersections per frame — noise against KC-1's 2.0 ms/frame creature budget. Scoring a whole genome (the foot path over a full cycle) at the literature's standard 361 crank samples costs 1,805 intersections — still trivial; the 2026 NSGA-II study ran population 100 × 80 generations × 361 samples ≈ 2.9 million leg evaluations as a routine desktop optimization ([Wang 2026](#sources)). Jansen needed months on an Atari; the same search is now an interactive-time operation. For rendering, the entire joint table for a cycle can be precomputed once per genome and replayed — the gait is periodic by construction.

### Named implementations and references

- **Wikipedia's Jansen's linkage page** links working demos: a **GeoGebra** construction and **2D and 3D Shadertoy** implementations — the fastest way to see the solver in a browser ([Wikipedia](#sources)).
- **Amanda Ghassaei** (MIT) built linkage-design tooling around this mechanism — a planar-linkage optimization tool inside a simple physics engine, code on GitHub — and her thesis work re-ran Jansen-style optimization in Mathematica, finding *families* of good solutions rather than one point ([Ghassaei apps](#sources)).
- **Johannes van der Horst** re-implemented the walker with a physics engine + genetic algorithm (7 free variables), selecting for smooth gait at acceptable torque, then cut physical parts to verify ([van der Horst](#sources)).
- **Boris Ingram's** DIY-walkers work optimized the linkage against five explicit criteria (see §3) and produced an extremely long-stride variant ([DIY Walkers](#sources)). (Note: this Ingram — a person, with a GA — is the only "Ingram/Inglis"-adjacent name in the walking-linkage literature; see §4.)
- A **Maple worksheet** animating one leg, two legs, and a six-leg beast from the published lengths circulates via MaplePrimes ([MaplePrimes, via search](#sources)).

### What breaks when the proportions are perturbed

- **Assembly failure.** A candidate genome may not assemble at all: if any circle pair fails to intersect at some crank angle, the leg has no configuration there. In the NSGA-II study only **~10% of random designs in a ±30% box were feasible** ([Wang 2026](#sources)). Any breeding system needs a feasibility test *before* gait scoring — an unassemblable genome is a stillbirth, not a bad walker.
- **k is the tripwire.** Link k (the long diagonal, crank tip → J₄) is "the feasibility-limiting member: ±2% already breaks assembly at some crank angles" ([Wang 2026](#sources)). In gene terms: k has a narrow legal band around any working value.
- **Interactions dominate.** A Sobol variance analysis (±10% box) found link **c** acting *almost entirely through interactions* (first-order index S₁ = 0.15 vs total-effect S_T = 0.85), and c and k together dominating output variance; all other lengths contributed marginally to that (wear) output ([Wang 2026](#sources)). The generalizable fact: the mapping from lengths to behaviour is strongly coupled — you cannot tune one gene and predict the result.
- **Gait *kind* changes, not just quality.** Nansai et al. showed that small, deliberate variations of the link lengths make the *same topology* produce different gait patterns — digitigrade locomotion, obstacle avoidance, jam avoidance, step climbing, drilling ([Nansai et al. 2015](#sources)). Near the holy numbers, the space is dense with different *species* of walk.
- **The stride/lift/flatness levers** (topology-level, from the chain in §1 — **[synthesis]** from the published equations): stride length scales with overall size and is stretched mainly by the J₄-driving geometry (k, c, and the frame a, l); foot lift and the shape of the return arc live in the foot triangle (f, g, h, i); stance flatness is set by how the upper rockers (b, d, e with frame a, l) carry J₄ through the grounded phase. Ghassaei's sub-linkage analysis adds one empirical rule: hinge-rod-to-crank-rod ratios above 1 and a larger crank radius tended to help her target locus ([Ghassaei thesis](#sources)).

### Determinism flags (KC-1 house rules)

- **Closed-form kinematics: compliant.** Pure function of (lengths, θ); identical inputs give identical outputs on any machine, forever. This is the approach the design should take.
- **Branch selection must be pinned by rule.** Each circ() has two intersections; the solver must choose by a fixed geometric rule (e.g. signed-area sign per joint, as used in the reconfigurable-gait literature to keep the assembly on one branch). An unpinned branch is a silent nondeterminism: the same genome could render elbow-up on one path and elbow-down on another.
- **Physics-engine creatures: non-compliant as a runtime method.** Sims' creatures, Rain World, and Soda Constructor all integrate iterative physics; results vary with step order and float behaviour, and none offers byte-stable replay. Fine as offline *search* (with a pinned seed and a recorded result — exactly Jansen's own workflow), not fine as the stage runtime.

---

## 3. The gait-quality metric

If FORM genes are measurements, "walks well" must be a number computed from the foot path F(θ) over one crank cycle. The literature converges on a small set of quantities. All are computable from ~360 samples of F(θ) — one forward-kinematic sweep.

| Metric | Definition (computable) | Holy-number value | Source |
|---|---|---|---|
| **Stance flatness** | RMS (or max) deviation of foot height y from its stance-phase mean, over the stance samples; lower = flatter | **0.0281** | [Wang 2026](#sources) |
| **Stance velocity ripple** | Variation (std/mean) of the foot's horizontal velocity during stance; lower = the body glides instead of surging | **0.0956** | [Wang 2026](#sources) |
| **Step length (stride)** | Horizontal distance the foot travels during stance (extreme-to-extreme of the grounded stroke) | **43.3** | [Wang 2026](#sources) |
| **Ground clearance** | Max foot height above the ground line during swing | **25.7** | [Wang 2026](#sources) |
| **Duty factor** | Fraction of the cycle in stance — Wang's operational version: foot within the lowest 15% of its height range | **≈ 0.202** | [Wang 2026](#sources) |
| **Effective stride rate η** | Effective (usable) stride ÷ total horizontal extent of the foot path; higher = less wasted motion | **85.55%** (TJL) | [Komoda-lineage comparison](#sources) |
| **Crossing degree ζ** | A path-shape index comparing the foot locus against the ideal (mm at paper scale) | **22.402** (TJL) | [same](#sources) |

Wang's composite gait error, ready to adopt as a template: **f₁ = ½ · (flatness / flatness_Jansen) + ½ · (ripple / ripple_Jansen)**, with hard constraints that step length, clearance, and duty factor each stay ≥ 0.85 × the Jansen value, and infeasible (non-assembling) designs rejected outright ([Wang 2026](#sources), §5). Normalizing to the holy numbers = 1.0 gives the epic a built-in reference genome: every creature's gait can be reported as "flatness 0.9× wild type" etc.

Other published fitness ingredients, for a richer score:

- **Ingram's five**: total link length (smaller = lighter), maximum stride length, mean foot-point velocity, **standard deviation of foot-point velocity** (the flatness of *speed*, cousin of ripple), foot lift height ([DIY Walkers](#sources)).
- **van der Horst's**: smoothness of joint rotation + required crank torque kept acceptable ([van der Horst](#sources)).
- **Energy proxies**: crank-torque integral over the cycle, and the "specific resistance" (energy per unit distance per unit weight) used in the multibody comparison of Chebyshev/Klann/Jansen ([Komoda & Wagatsuma, via ResearchGate](#sources)). For KC-1 these matter less as physics than as *character*: a high-torque genome is a strained, effortful walker — a DRIVE-adjacent readout. **[synthesis]**
- **No cusps**: Jansen's original search also required the foot path to have no cusps (sharp reversals) — a smoothness/legibility condition on the curve itself ([Wang 2026](#sources), intro).
- **Assembly feasibility** as gate zero (see §2): ~90% of random genomes in a ±30% box fail it.

**[synthesis] A KC-1 gait score, assembled from the above:** gate on assembly over 360 samples → report the five Wang numbers normalized to wild type → combine flatness + ripple as the headline "grace" score, keep stride and clearance as *identity* numbers (a long-striding, high-stepping creature is not worse, it's a different animal — the Pareto lesson of §0.6 is that single scores hide trade-offs; Wang's front traded clearance away for flatness, and a curator may not want that trade). The score's honest use in the epic is threefold: (1) a *viability floor* in breeding (below it, the child doesn't walk, it's a sculpture); (2) a *readout* — the shimmer could literally encode flatness/ripple so lineage is visible as gait quality; (3) *selfcheck material* — the wild type must reproduce its five published numbers.


---

## 4. Sibling linkages and precedents

### Klann linkage (Joe Klann, US patent 6,260,862; 1994)

A **six-bar** single-DoF leg (vs Jansen's eight rigid links). Klann designed it to mimic a spider's gait; it became the toy "Mechanical Spider" mechanism. Its foot path has a flatter bottom than a simple crank but a more pointed, higher return than Jansen's — in the three-way multibody comparison (Chebyshev vs Klann vs Jansen), the **Klann shows strong obstacle capability at the highest energy cost**, the four-bar the least torque, and Jansen the balanced, biomimetic middle; all three share the same stance/swing acceleration character ([Liu et al., comparison](#sources); [Komoda & Wagatsuma](#sources)). As a *generative* mechanism: fewer genes (six lengths), a smaller and hardier design space, a gait that reads as *stepping* rather than *gliding*. Bad at: the long flat glide; its stance is shorter and its motion spikier. Good KC-1 candidate for skittering, insectile creatures. **[synthesis on cited facts]**

### Chebyshev lambda / the Plantigrade Machine (1878)

The ancestor. A **four-bar** whose coupler point traces a curve with a near-straight, near-constant-velocity segment for **over half the cycle**, staying within 1% positional tolerance of the ideal line; proportions (unit a): crank a, rocker 2.5a, coupler 2.5a + 2.5a extension, frame 2a. Chebyshev exhibited four of them as a walking "Plantigrade Machine" at the 1878 Paris Exposition Universelle ([Wikipedia, Chebyshev lambda linkage](#sources)). As a generative mechanism: the genome is essentially **one scale number** — the design space is tiny, robust, and almost impossible to break, which is precisely its limit: the gait family is narrow (a dignified, even, plantigrade tread; no drama in the return arc). It is the right mechanism for *primitive* creatures — the Marks-chapter end of the book, creatures that barely walk and do it honestly. **[synthesis on cited facts]**

### Pantograph (and a note on "Inglis")

A pantograph is not a gait generator but a **motion transformer**: coupled to any path-generating linkage, it reproduces that linkage's coupler curve **amplified by a fixed factor n and rotated by an angle β** at the output point ([MDPI Appl. Sci. 2024](#sources)). Roboticists pair it with a four-bar (e.g. Hoecken's) so a small, well-behaved mechanism drives a big leg ([TCSME self-adaptive leg](#sources)); Hirose's 3D pantograph leg (TITAN series) went further and made the foot translate in pure Cartesian x/y/z, so the *mechanism does the kinematics* and control becomes trivial — the same philosophical move as Jansen, one level up. As a generative element: a pantograph is a **scale gene** — it decouples *gait shape* (owned by the base linkage genome) from *gait size* (one continuous number), which is exactly the separation a breeding system wants: inherit the walk from one parent, the size from another. **[synthesis on cited facts]**

**On "Inglis":** no mechanism by that name exists in the walking-linkage literature I could find — searches return only the generic eight-bar family and unrelated results. The plausible referent is **Boris Ingram**, whose GA software optimized Jansen foot trajectories (cited in the kinematic literature and documented at [DIY Walkers](#sources)). The epic's drafts should not cite an "Inglis linkage"; if a fourth sibling is wanted, the honest candidate is the **Stephenson/eight-bar family** (TrotBot and Strider live there — eight-bar legs with heel/toe extensions, developed in the same DIY-walkers community).

### Games and art projects: assembled parts, emergent gait

- **Karl Sims, *Evolving Virtual Creatures* (SIGGRAPH 1994).** Genotype = a directed graph describing both morphology (articulated 3D blocks) and a neural controller; body and brain co-evolved in a rigid-body physics sim, fitness = locomotion (swimming, walking, jumping, following) ([Sims 1994](#sources)). The lessons are double-edged and directly on-point for #1852: evolution *does* find locomotion nobody designed — but it mostly finds exploits (tumbling, levering, swimming strokes), and **walking was the hardest behaviour to evolve**. An unconstrained morphology space spends its creativity on falling over cleverly. Jansen's fixed topology + measurement genes is the opposite bet, and the historical record says it's the bet that produces *walking*.
- **Spore (Maxis, 2008).** The commercial proof that part-assembly → gait synthesis works as a *product*: the animation system reads leg count, leg lengths, and bodily symmetry, computes a "walking ratio," derives footfall rhythm from it, and folds in torso/head dimensions — any creature a player assembles walks, immediately, in the editor, reacting live as parts are added ([IEEE Spectrum, "Engineering Spore"](#sources)). The equally important lesson is the tuning cost: Maxis maintained a menagerie of test creatures and iterated the rules against the failures ("it works for these seven, but for these two the legs look weird") — a curated corpus of edge-case bodies is part of the system, not an afterthought. **[facts cited; the corpus point is Wright's own account]**
- **Rain World (Videocult, 2017).** Creatures are "a bunch of points in space connected at certain distances," drawn as a paper doll over the constraint skeleton — no keyframed animation anywhere; lizard legs find their footing by IK over the simulated body, and behaviour (memory, personality traits, self-preservation) rides on top ([Game Developer](#sources)). It is the best existing demonstration that *constraint geometry + simple drives reads as alive* — the exact anti-sticker quality the epic wants. It is also the cautionary tale for KC-1's determinism law: the aliveness comes from an always-running physics integration, which the epic cannot adopt as a runtime (see §2 flags). Take the *structure* (bodies as point/constraint graphs with graphics skinned on top — a description that also fits an SVG linkage creature verbatim), not the integrator.
- **Soda Constructor / Sodaplay (2000).** User-assembled spring-and-muscle mass models that walk (or flail) in a 2D physics sandbox — the folk-art end of the same idea, and a reminder that *assembly as play* predates the tooling: people will spend hours tuning a creature's body just to watch it move. (Listed as a related work on [Wikipedia's Theo Jansen page](#sources).)

---

## 5. Mapping to a 2D graphic world

### What survives, unchanged

**The side view.** The Jansen linkage is already planar and already a drawing: thirteen lengths, eight links, one rotating crank. In KC-1's terms a leg is an SVG-native object — bars as graphic strokes/shapes, joints as nodes — that needs no translation at all, only a skin. A "linkage creature" on a stage in profile is the mechanism *itself*, performing. The Strandbeest reads as graphic design even in photographs because its beauty is the geometry; in a 2D graphic world that stops being a metaphor.

**The crank as the drive.** KC-1's law is drives, not scripts. The linkage is the purest drive in the building: one rotation in, an entire gait out, with stance/swing timing, foot speed, and body glide all *consequences* rather than authored events. Band energy → crank rate is a one-line drive mapping, and phase offsets between legs (Jansen's 120°) are constants, not choreography. **[synthesis]**

### The top-down reading

**[synthesis]** On the petri dish (top-down), two honest readings exist:

1. **The dish as the linkage plane.** Lay the mechanism flat into the dish's plane: the creature *is* a drawn linkage crawling across the disc, its "feet" tracing paths on the surface. Nothing about the math changes (the solver is 2D either way); what changes is the fiction — the ground line becomes the dish surface, and the foot path becomes a *track laid down on the dish*, which composes directly with the stigmergy/trail work (#1808): a roaming creature that quite literally writes its gait onto the shared field, in pigment, where other creatures cross it.
2. **Profile creatures on a dish stage.** Keep the side view and let the dish be the world they roam *in* (position/heading on the dish, linkage in profile locally). This preserves the iconic silhouette and the flat-foot drama; roaming = translation + turning of the whole profile rig, with stride length and crank rate determining actual travel speed (they are the same number computed two ways — a nice honesty check: the creature moves at the speed its feet say it moves).

What does **not** survive: the wind, the sand, the 3D frame's self-support. A graphic creature owes no physics debts — but per §2, that is a feature: closed-form kinematics was always the compliant core.

### The foot-path curve as a design element

The precedent base here is stronger than "debug visualization":

- **The coupler-curve atlas as pattern book.** Hrones & Nelson's *Analysis of the Four-Bar Linkage* (MIT, 1951) published **~10,000 coupler curves** as a visual catalog from which engineers *browsed* for a motion the way a designer browses typefaces ([literature review, Virginia Tech](#sources)). A genome's foot path is a *portrait* of that creature — unique, deterministic, drawable — and a bestiary page of foot-path curves is a legitimate design surface (this is also, not incidentally, what Jansen's GA was browsing).
- **Linkage drawing machines as art.** Joe Freedman's Cycloid Drawing Machine and DuoGraph — hand-cranked gear/linkage machines whose adjustable fulcrums and interchangeable gears produce non-repeating geometric drawings, described by their maker as "more like an engine turning lathe" than a Spirograph ([Interesting Engineering](#sources)) — establish the genre: a mechanism whose *trace* is the artwork. University drawing-machine projects likewise pair a 1-DoF linkage pen with a rotating platter to draw cycloidal figures ([UT Austin RMD](#sources)).
- **The track in the sand.** A Strandbeest's footprints are the gait made visible as a pattern on the beach — the trace is part of the work's iconography in nearly every photograph of it. On KC-1's dish, where trails and pigment are already first-class (the WET consumer set), the foot-path trace is not an overlay: it's the creature *depositing evidence* — which is the stigmergy thesis in one image. **[synthesis]**

**Design consequence [synthesis]:** give every creature two graphic identities — the *body* (the linkage, skinned in its Look) and the *signature* (its foot-path curve, drawable in the WetLab, in the Book, and as the trail it lays on the dish). The signature is free: it's already computed for the gait score (§3). It is also the natural visual for ruling 4's family-resemblance readout — related creatures' curves visibly rhyme.

---

## Sources

- Jansen's linkage — Wikipedia (mechanism, 1-DoF, holy-number table, GeoGebra/Shadertoy demos, Giesbrecht thesis): https://en.wikipedia.org/wiki/Jansen%27s_linkage
- Wang, J. (2026), *Durability-Aware Multi-Objective Optimization of the Jansen Linkage*, arXiv (preprint — kinematic chain eqs., gait metric definitions and holy-number baselines, NSGA-II setup and results, k-feasibility and Sobol sensitivity). Note: a recent preprint, not peer-reviewed; its kinematic model is independently standard, its optimization results are its own: https://arxiv.org/html/2606.22129
- Jansen's own account of the evolution (1,500 legs → best 100 → reproduction), mirrored from strandbeest.com at Ward Cunningham's wiki: http://ward.bay.wiki.org/strandbeest.html
- Dedece Blog, *StrandBeests by Theo Jansen* (1991 single-crank insight; 1,500 → months on the Atari; holy numbers): http://www.dedeceblog.com/2015/04/13/strandbeests-by-theo-jansen/
- Veritasium, *12,419 Days of Strandbeest Evolution* (summary: 1990 program, 1,500 combinations, 120° leg phasing): https://www.getrecall.ai/summary/veritasium/12419-days-of-strandbeest-evolution
- Likens (2011), on the Strandbeest's materials and leg construction: https://julianvossandreae.com/wp-content/uploads/2010/03/2011_03_Likens.pdf
- Nansai et al. (2015), *On a Jansen leg with multiple gait patterns for reconfigurable walking platforms*, Advances in Mechanical Engineering (small length changes → digitigrade / obstacle-avoidance / jam-avoidance / step-climbing gaits): https://www.researchgate.net/publication/277606519_On_a_Jansen_leg_with_multiple_gait_patterns_for_reconfigurable_walking_platforms
- Ghassaei, A. — apps and linkage-optimization tooling (code on GitHub); thesis optimization of the leg: https://amandaghassaei.com/apps/
- UC Berkeley CS184, *Strandbeest Simulation* (reduced-coordinate solver, resolution order): https://dreekfire.github.io/184-Project/
- van der Horst, J., *Optimising a Jansen walker with genetic algorithms* (physics + GA, torque/smoothness fitness): https://vdhorst.ca/portfolio/optimising-a-jansen-walker-with-genetic-algorithms/
- DIY Walkers — Strandbeest category (Boris Ingram's five optimization criteria; long-stride variant): https://www.diywalkers.com/blog/category/strandbeest
- Klann linkage — Wikipedia (six links, patent, comparison with Jansen): https://en.wikipedia.org/wiki/Klann_linkage
- Chebyshev lambda linkage — Wikipedia (1878 Plantigrade Machine, proportions, >half-cycle straight segment within 1%): https://en.wikipedia.org/wiki/Chebyshev_lambda_linkage
- Liu et al., *Multi-Objective Optimization of the Chebyshev Lambda Mechanism* (three-way comparison: four-bar least torque, Klann strong obstacle capability at higher energy cost, Jansen smooth/biomimetic with sensitive parameters): https://www.researchgate.net/publication/366889123_Multi-Objective_Optimization_of_the_Chebyshev_Lambda_Mechanism
- Komoda & Wagatsuma et al., *Kinematic analysis of a novel planar six-bar bionic leg* (effective stride rate η = 85.55% and crossing degree ζ = 22.402 for the Jansen leg; specific-resistance comparisons): https://www.researchgate.net/publication/333767348_Kinematic_analysis_of_a_novel_planar_six-bar_bionic_leg
- Pantograph amplification (factor n, rotation β) — *Mechanism for Walking Robots*, Applied Sciences 2024: https://mdpi-res.com/d_attachment/applsci/applsci-14-08919/article_deploy/applsci-14-08919.pdf
- Hoecken four-bar + pantograph self-adaptive leg, Trans. CSME: https://cdnsciencepub.com/doi/10.1139/tcsme-2017-0010
- Sims, K. (1994), *Evolving Virtual Creatures*, SIGGRAPH '94 (abstract: morphology + neural control co-evolved; fitness per behaviour): https://www.bibsonomy.org/bibtex/1cd1801c683ccc8502dcd112c079a5283/brazovayeye?lang=en
- *Engineering Spore*, IEEE Spectrum (walking ratio from leg count/length/symmetry; footfall rhythm; test-creature menagerie): https://spectrum.ieee.org/engineering-spore
- *Crafting the complex, chaotic ecosystem of Rain World*, Game Developer (points + distance constraints, paper-doll cosmetics, no keyframes): https://www.gamedeveloper.com/design/crafting-the-complex-chaotic-ecosystem-of-i-rain-world-i-
- Hrones & Nelson atlas (~10,000 coupler curves, 1951), via a kinematic-synthesis literature review (Virginia Tech): https://vtechworks.lib.vt.edu/server/api/core/bitstreams/3111595a-2892-437f-874a-590ee17b6c57/content
- Freedman's DuoGraph / Cycloid Drawing Machine (adjustable fulcrum, interchangeable gears, non-repeating drawings): https://interestingengineering.com/innovation/draw-infinite-geometric-designs-duograph
- UT Austin Robot Mechanism Design — drawing machines background (pantograph and cycloid drawing machines; geared five-bar + rotating platter): https://cloud.wikis.utexas.edu:443/wiki/spaces/RMD/pages/51055023/Introduction+and+Background+-+SF
