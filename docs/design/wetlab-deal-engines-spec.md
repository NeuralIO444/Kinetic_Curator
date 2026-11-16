# WetLab — KINETIC and CURATOR as shared deal engines; auto-generate creatures (#2232)

Status: **SPEC ONLY — nothing is built.** Ordered by Matt on 2026-11-16 (§0); all six questions in §9 were ruled
by him the same day, as recommended. Lane: review (UI). Paths are under `app/src/`. Every "today" claim was read on `main` @ `01eb532`;
nothing was run. Where I did not verify something, the text says "not checked".

## 0. The order (Matt, 2026-11-16, dictated)

- The WetLab is too many menus, hunting and packing. He wants an **auto-generate**: quickly make creatures, then
  modify them.
- Put the two top-left buttons, **KINETIC** and **CURATOR**, on the WetLab (he suggested the bottom).
- A new button in the **user section** opens the WetLab in a **default empty state**. **KINETIC** is the wide one: it
  grabs from any of the assets. Once the artist picks, they **funnel down to CURATOR**, which grabs fewer assets and
  is more fine-grained.
- Hand-picking stays; it is the existing path.
- **Break the two out into separate engines**, so other editors can use them. Today it is only a stage thing; he can
  only imagine the WetLab using it, but wants the engineering left open. "Let's try it out."

This re-orders the deferred "Studio labs" pile (`CLAUDE.md`) for this item only.

## 1. What is there today

**KINETIC on the stage.** `panels/layout/KineticButton.jsx` runs a tap through a heat router
(`panels/layout/kineticHeat.mjs`, pure): a fresh tap is a LOOK pass, the next warm tap a VOICE pass, further taps a
CURATOR pass, hammering reaches CHAOS. A scope pill cycles OFF → WEAK → MED → KOZ (`state/kineticScope.mjs`, pure
data): the ceiling over every tap, from the 19 curated 4-shape sets up to the whole library. The passes themselves
(`lookPass`, `voicePass`, `curatorPass`) are pure functions of `(state, rng)` in `state/kineticSweep.mjs`. They are
_applied_ by store actions (`kineticLookPass` in `state/slices/layoutSlice.js`) that are welded to the stage:
chapters, the world record, the poem, pattern layers, one undo step.

**CURATOR on the stage.** `panels/layout/CuratorBar.jsx` rolls `CURATE_CANDIDATES = 8` scenes and keeps the pick of
`pickCurated(candidates, curator, rng, …)` (`curator/curate.js`): taste-guided, fed by a seeded stream, optionally
gated by LOIS's measured reads. It never invents a candidate; it only picks and shapes.

**The WetLab.** `panels/WetLab.jsx` (1395 lines) opens **per asset**: `WetLab({ assetId, onClose })`, launched by
`openLab(id)` in `panels/AssetPoolPanel.jsx`. Its rail has modes (`assemble`, `breed`, `genome`, …). The assemble
path is: pick a shape, set or accept its ATTACH points, pick look/voice strands (the Strand Bank), assemble, then
breed from three chosen parents (with tag/kit filters) and cultivate. Seed comes from `state.seed`
(`assembleCreature` in `state/slices/globalSlice.js`).

**The creature engine already has a "KINETIC + CURATOR" inside it.** `engine/kineticBirths.mjs` (#2037) pre-breeds a
_hand_ of candidate children (`deriveBirthHand`, `KINETIC_BIRTH_HAND_SIZE = 3`, bounded by
`KINETIC_BIRTH_HAND_DRAWS = 24`), drops the stillborn ones through the cultivate gate (`cultivationNote`), and lets
the trio score and order the survivors (`scoreBirthChild`, `orderBirthHand`; ordering only, it never vetoes). It is
pure and clock-free; randomness is string-keyed hashing of `(seed, press, attempt)`, not a shared stream. Breeding
needs `BREED_PARENTS = 3` parents (`engine/creatureBreed.js`), so it cannot start from an empty bank.

So: the wide deal, the gate and the taste order exist for creatures. What does not exist is a way to run them from
the lab, and a seam that lets anything other than the stage reuse the stage's press machinery.

## 2. The seam: two engines and one adapter

Two pure modules, new directory `deal/`, no store, no React, no clock (a press passes `now` in, as `KineticButton`
does today):

- **`deal/kineticEngine.mjs` — the wide engine.** Owns the scope ladder (ordered ceilings with labels), the press
  run, and the heat routing when a host wants it. `press(adapter, run, scope, seed)` returns a _hand_ of candidates.
  It reuses `kineticHeat.mjs` and the `kineticScope.mjs` cycle by import; it does not copy them.
- **`deal/curatorEngine.mjs` — the narrow engine.** `narrow(adapter, hand, curator, rng, opts)` scores, gates and
  picks. It never adds a candidate to a hand it was given; for the fine-grained step it asks the adapter for
  _nearby_ candidates (`near`) and then does the same scoring. Same law as `pickCurated` and `orderBirthHand`:
  taste orders and picks, it never deals into a hand it was handed and never vetoes what the gate passed.

**The adapter** is the only thing a host writes. All members are pure:

| member                      | job                                                                      |
| --------------------------- | ------------------------------------------------------------------------ |
| `scopes`                    | the ordered ceilings, with labels (what "wide" means in this editor)     |
| `deal(scope, ctx)`          | the wide deal: returns candidates for a seed + press                     |
| `near(candidate, cap, ctx)` | the fine deal: candidates that differ from one by at most `cap`          |
| `gate(candidate, ctx)`      | hard viability (creatures: the cultivate note reads viable)              |
| `read(candidate, ctx)`      | measured reads and scores for the curator (creatures: `scoreBirthChild`) |
| `key(candidate)`            | the stable id (ties break on it, as `orderBirthHand` does)               |

A host applies a pick itself (the stage through its store action, the lab through `bankCreature`). The engines never
write state. That is what keeps them reusable: an editor needs an adapter and a button, nothing else.

**Recommendation (stage).** Do not refactor the live stage in the first build. The engines ship with the creature
adapter and a synthetic test adapter. A _stage adapter_ that re-homes `lookPass` / `voicePass` / `curatorPass` is a
later, optional slice, proven byte-identical by the existing KINETIC selfchecks, and only on Matt's order. The
instrument that is running does not carry the risk of the experiment.

## 3. The creature adapter

- **Founders (empty bank).** Breeding needs three parents, so from nothing KINETIC deals _assemblies_: a body shape
  from the dealable library, its points from `attachPointsFor(asset, assetAttach)` (`engine/autoAttach.js`, the
  shape's AUTO points when the artist set none), look and voice dealt from the seed by `assembleCreature`.
- **Wide ladder (ruled, Q1).** OFF: founders from the curated 4-shape sets (`CURATED_SETS`). WEAK: founders from
  the whole dealable library. MED: also breed from the bank once it holds three. KOZ: as MED with the mutation
  rate raised. The numbers other than the existing `MUTATION_RATE` are named constants, not scattered. Founders whose shape has no
  usable head or limb points are skipped at OFF and WEAK and allowed at KOZ (ruled, Q3).
- **Gate.** `cultivationNote` must read viable; a stillborn candidate dies in the hand and is counted, as today.
- **Read.** `scoreBirthChild` (LOIS cost and warnings, Davis novelty, TE completeness) is the creature `read`. The
  taste persona may reorder, as `pickCurated` does.
- **Near (the CURATOR funnel).** From the selected creature: its own hand mutations (`handMutateValue`,
  `handEditRecord` in `engine/creatureBreed.js`) and breeds with it, each within a stated cap. Fewer candidates than
  the wide deal, all close to the pick.
- **Determinism.** No `Date.now`, no `Math.random`. Draws are string-keyed hashes of `(project seed, lab press
counter, attempt)`, the `kineticBirths.mjs` pattern, so no change to the kernel's `CH` ids. A hand is a pure
  function of `(seed, press counter, bank fingerprint, scope)`: nothing new is stored to be able to re-derive it.
  Lab presses must not touch the stage's undo or the stage's seed.

## 4. The WetLab surface

- **Entry (ruled, Q2).** A new button in the pool panel's **user** section opens the WetLab with no asset. Today `WetLab` takes
  an `assetId`; the empty state needs a null-safe path through the whole panel (not checked line by line; the build's
  first step is a selfcheck that mounts it with none).
- **The strip.** Along the bottom: `[ scope pill ] [ KIN ] [ CUR ]` (the pill is the top bar's, ruled, Q1), the same three controls and the same
  `ExpandLabel` short/full pattern as the top bar, so they read as the same buttons.
- **KIN** deals a hand of 6 creatures (ruled, Q5) onto the stage area as tiles (`CreatureMiniature`). Press again
  for another hand. Nothing is banked by dealing.
- **Pick = bank + seed (ruled, Q4).** Tapping a tile banks it (the existing `bankCreature`; a full bank of 64 refuses with a
  note rather than evicting, as the beast does) and makes it the CURATOR's subject. Untouched tiles vanish on the
  next KIN. This is the answer to "too much packing": one tap, not a menu.
- **CUR** narrows around the pick: a small hand of 3 (ruled, Q5) of near creatures, gated and ordered by the trio.
  Tap one to bank it and funnel again.
- **Modify** is the existing lab, untouched: genome timeline, hand edits, breed, the strand bank, attach points.
  The strip sits on top of it; it replaces none of it.
- **Hand-picking** stays exactly as it is.

## 5. Other editors

The engines are written for any editor that can say what a wide deal, a gate and a near neighbour are. Candidates
I can name from the panel list are the motif studio (`AssetStudioModal.jsx`), the region picker
(`RegionPicker.jsx`) and the pattern tools. **I did not check whether any of them has a gate or a measure that fits**;
none is specced here, and each would need its own adapter and its own ruling. The spec's only commitment is that
the seam does not mention creatures.

## 6. Build order (one PR each, after rulings)

1. **Engines + contract suite.** `deal/kineticEngine.mjs`, `deal/curatorEngine.mjs`, and a synthetic adapter that
   pins determinism, the "never adds, never vetoes" law and tie-breaking. Pure; automatic lane; new suite in
   `app/selfcheck.manifest`.
2. **Creature adapter.** Founders, hand, gate, read, near, built on `kineticBirths.mjs` and `creatureBreed.js`
   (reused, not copied). Pins: same inputs → same hand; stillborns never appear; bank cap refuses; empty bank deals
   founders; under three parents never breeds. Automatic lane.
3. **WetLab shell.** The empty-state entry, the strip with KIN, tiles, tap-to-bank. Review lane: screenshots, the
   localhost URL, a "Review this" list.
4. **CUR funnel.** `near` + the narrow pass + the cap. Review lane.
5. **(Later, optional) the stage adopts the engines.** Only on Matt's order.

Out of scope: the stage's behaviour, the take recorder, the Studio labs pile beyond this item, any change to
`liveLoop.mjs`, `liveResolve.mjs` or `particles.js` (one-writer files).

## 7. Risks and unknowns

- The empty-state path through a 1395-line panel written around one asset: size unknown until step 3.
- `bankCreature` and the 64-record cap: a fast KIN-and-tap session can fill the bank; the refusal note must be
  readable, and the artist needs a cheap way to clear (the one-tap "clear unkept", Q4).
- Cultivation per candidate costs time. `kineticBirths.mjs` bounds its walk at 24 draws for a hand of 3; a hand of 6
  needs its own bound, measured, not guessed.
- Shapes without usable ATTACH points produce a creature without a head or limbs; the TE read marks it down, but
  Q3 rules which scopes may deal them.
- Persona taste on creatures: `scoreBirthChild` names LOIS, Davis and TE, but I did not check what the persona
  `curator` object (`curator/curate.js`) would read from a creature record. Step 2 starts by checking.

## 8. What this spec does not do

No code, config or behaviour changes. It does not change the stage's KINETIC or CURATOR, the creature record format,
the breeding law, or the take.

## 9. Rulings (Matt, 2026-11-16 — all six taken as recommended)

1. **The ladder in the lab:** reuse the top bar's four-state scope pill (OFF / WEAK / MED / KOZ), mapped as in §3.
2. **The entry:** a "WetLab" button in the pool panel's user section opens it empty; today's per-asset open stays.
3. **Founders without head or limbs:** skipped at OFF and WEAK, allowed at KOZ.
4. **Pick semantics:** tap = bank + make it the CURATOR's subject, with a one-tap "clear unkept".
5. **Hand sizes:** KIN 6, CUR 3, as named constants tuned in the build.
6. **The stage adapter:** the stage's KINETIC and CURATOR stay exactly as they are until Matt orders a change.

With these ruled, the build follows §6 in order, one PR per step, each stopping where the rulings stop.
