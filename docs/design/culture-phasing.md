# CULTURE — build phasing (2026-11-22)

Companion to `physics-creature-foundation-spec.md`. The spec is the law; this
document is the build order for the bundled program Matt authorized fully auto
on 2026-11-22 ("work on this list fully auto… lets clear the list and then we
can iterate later").

**Posture.** Slices build one at a time in the eval loop (build → QA review →
CI) and merge on QA-clean + green CI. CULTURE grows **behind a gate** (ruled
2026-11-22): a stage dish-mode switch, off by default. The live stage is
untouched until a deliberate takeover; citizens immigrate slice by slice.
Matt iterates on merged results afterwards.

**The bundle.** Dish ring: #1183, #1598, #2178, #2153, #2186, #2187, #2188
under the WebGL program #2180. Citizenry ring: #1863, #2109, #2168, #2331,
#2332, #2342–#2344. Kept out (adjacent, not bundled): #1796 (pattern
interface, not a merge), #2252 (a Look), #2337/#2373 (constructs' own line),
#2181 (decoration GPU presentation).

## Phase 0 — The gate and the empty dish

New foundation work under the #1183 umbrella; no single issue owns it.

- A dish-mode gate on the stage, off by default. Gate off: the stage is
  byte-identical to today — contracts, takes, and rendering unchanged.
- Gate on: the dish world exists — one world state, the shared grid, and a
  fixed-timestep simulation scheduler (the §3.5 proposal adopted as the
  build choice: sim advances in fixed increments, rendering presents the
  simulated state).
- Acceptance: gate-off parity proofs; gate-on empty dish stepping at the
  fixed rate; world-step determinism selfchecks in the manifest.

## Phase 1 — Kernels: the sims move to the GPU

In dependency order — each is the next one's medium:

1. **K1 (#2186)** — dish fluid (Gray-Scott) as a GPU simulation: the dish's
   medium.
2. **K2 (#2187)** — DISH LIFE culture as a GPU simulation, coupled to the
   fluid in shader space: the soil the dish grows in (§5.2).
3. **K3 (#2188)** — recorded swarm physics as a GPU simulation: bodies in
   the medium. Its cap ladder step 2 (2,048 contacts bodies) already landed
   via PR #2295 on the coordinator's recorded estimate.

Every kernel carries its `simLaw` stamp honestly per spec §5.4. #2180 stays
open as the program umbrella; its remaining workstreams outside this bundle
(notably #2181) are not CULTURE phases.

## Phase 2 — The solver and shapes (#1598)

- Collision shapes on the shared grid: disc vs static AABB, only where
  needed (#1598).
- The in-house solver: assembled compound bodies, joints, contacts resolved
  on the 2,048-body table Phase 1 sized. Bodies collide, clump, swing, and
  drag per the spec's body law (§2.4).
- Acceptance: solver selfchecks; stochastic suites run repeatedly before
  being called green.

## Phase 3 — Fields and the hand

- **Ferro as a force (#2178)** — field-gated bone pull on small whole
  assets, per its standing rulings (toward the magnet, field-gated; clean
  break, no legacy takes).
- **The Queen's field ownership** (spec §4 Q4): she places and moves the
  dish's standing fields under the Governor's direction; recipes and
  personas may only request.
- **The hand as current (#2153)** — finger painting built dish-side: hand
  input enters as a current field creatures feel, never a body (§4 Q3).
  The on-device camera proof is Matt's and tracked separately; it does not
  block this phase.

## Phase 4 — The soil (Life as ground)

Implements the §5.2 ruling on the Phase 1 K2 sim: living ground feeds the
ecology (fertility, decay, creature fortune); dead ground kills, per the
#2152 law — a creature standing on dead ground withers on the decay timing
in the defaults table below. Life is never drawn.

## Phase 5 — Citizens

- **Motion Core (#2109)** — one API for kineme, creatures, and beasts
  (break-up, stacking, phrases, figures): CULTURE's behaviour layer.
- **Rig spawning (#2168)** — the moth and the dish creature become pure
  rig, dealt from the stage: the Lab's casting path into the dish.
- **Gait (#2331, #2332)** — rig/beast/glyph adapters; the TASTE → QUEEN
  damp step with the LOIS break-up veto.
- **First citizen** — the dish creature (coordinator's recommendation:
  prove the world end to end on the simplest native body; the moth follows
  as flagship). Matt confirms or redirects.
- **Strandbeest (#1863)** — the epic's assembled walking structures land
  as a CULTURE body phase; the epic closes when this phase lands, as does
  #2109.
- **Test drives (#2342–#2344)** — the WetLab verification line for
  citizens: Canon gaits on the beat, moods from DRIVE genes, baby preview.

#1183 closes when this phase lands: one world, citizens living in it,
behind the gate.

## Phase 6 — The ecology turns on

The rules layer, on living citizens:

- Feeding: beats land as morsels (§3.1); creatures eat beats (§2.5).
- Fat accounting, starvation, and **predation** (§4 Q1 — death comes by
  starvation and predation; age and upkeep failure stay out).
- Death, decay, limb looting and attaching (§2.9, §2.10 — sockets limited
  by body plan, upkeep per carried limb, looted limbs keep their look).
- Breeding (§3.3 — body parts mix as well as recipes) and growth (§3.4).
- Lab casting per take (§4 Q2): KINETIC assembles, DAVIS writes recipes,
  LOIS gates; no standing zoo is inherited.

## Build-time defaults (coordinator's, tunable in iteration)

Stated under the fully-auto authorization; each is a starting constant,
not a ruling, and iteration may retune any of them:

| Constant | Default |
|---|---|
| Sim step | 120 Hz fixed (two substeps per 60 Hz frame) |
| Sensory range | 3 body-lengths, per-drive multipliers allowed |
| Fat per beat morsel | +10 |
| Upkeep | 1 fat/sec per body + 0.5 fat/sec per carried limb |
| Starvation | death at fat 0 sustained 5 s |
| Dead-ground kill | wither over 4 s standing on dead ground |
| Decay | body persists 30 s, limbs lootable throughout |
| Breeding eligibility | fat ≥ 60 and growth stage ≥ 2 |
| Predation | kill on contact when attacker fat < 30 and size ratio ≥ 1.2 |

## Not in this program

Takeover (retiring the gate, making the dish the stage) is a separate,
deliberate step after Matt's iteration pass — not a phase here.
