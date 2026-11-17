# WetLab ladder: from shape to living rig (spec)

Status: **SPEC ONLY — nothing is built.** Ordered by Matt on 2026-11-16 ("Spec this out, ask questions"). All
eleven questions in §9 were ruled the same evening. Builds on [`wetlab-deal-engines-spec.md`](wetlab-deal-engines-spec.md)
(the KIN/CUR engines, shipped as #2237–#2262) and does not reopen it.

## 0. Matt's words (2026-11-16)

> The order of operation is simple shape, assets, complex shape, recipes, and then once those recipes are built,
> those can be rigged up under the creatures, beasts, mobiles, Game of Life, Voronoi, liquid, etc.
>
> I want the wet lab to be very fun to build these graphic creatures. Almost like Spore. Fun through exploration.
> It starts with easy things, and then people can quickly modify things to make more advanced things as they get
> more comfortable with it.

## 1. The idea in one paragraph

The WetLab becomes a **ladder of five rungs**. On every rung the artist does the same two moves: **KIN** deals a
wide hand, **CUR** narrows around a pick. Whatever they keep on one rung becomes the material of the next. A
first-time artist sees one lit rung (SHAPE) and one button (KIN); three keeps open the next rung. Like Spore, the
thing you make is alive the moment it exists: it moves in the hand, not later on the stage.

## 2. The rungs

| # | Rung | What a candidate is | Built from | Comes alive as | Exists today |
|---|---|---|---|---|---|
| 1 | **SHAPE** | one simple drawing | the library + the artist's own assets | breathes (scale/rotate idle) | the library; no adapter |
| 2 | **ASSET** | a complex shape: 2–6 kept shapes composed | kept SHAPEs | parts settle into place | `AssetStudioModal` composes by hand; no adapter |
| 3 | **RECIPE** | a part tree with anchors (`hierarchy.js` RECIPE) | kept ASSETs | assembles from root out | `hierarchy.js` expands recipes; no builder |
| 4 | **CREATURE** | a creature record | recipes as body and parts | walks / gaits | creature adapter + strip (#2240–#2262) |
| 5 | **RIG** | a recipe or creature under a rig kind | kept RECIPEs and CREATUREs | the rig runs | beast (#2248, #2258); others below |

**Rig kinds (rung 5).** Each is its own adapter and its own ruling, built in this order (Q6):

1. **Beast** — Jansen linkage. Exists with KIN/CUR; first job is to accept a kept recipe as its body art.
2. **Mobile** — hanging balanced figure. `mobileFigure` record kind exists (#2119).
3. **Game of Life** — a recipe stamped as cells. `engine/ca-engine.js` exists.
4. **Voronoi** — a recipe tiled into cells. `placement.js` has a voronoi placement.
5. **Liquid** — a recipe carried by the dish fluid. `engine/dishFluid*.mjs` exists.

**Not checked:** whether Game of Life, Voronoi and Liquid can take a recipe as their mark today. Each rig step
starts by checking, and stops there with a note if the seam is not there.

## 3. The engines on every rung

Each rung is one **adapter** behind the existing seam (`{scopes, defaultScope, deal, near, gate, read, key}`).
The engines do not change. Per rung:

- **deal** draws from the kept items of the rung below (rung 1 draws from the library).
- **gate** drops what cannot be drawn or exceeds the budget (`HIER_GLOBAL_BUDGET`, `HIER_MAX_DEPTH`).
- **near** is "swap one part for a close one, or nudge one number": the same move as Modify (§5).
- **read** is the measured read already used: LOIS (cost), DAVIS (novelty), TE (completeness).
- **key** is a hash of the candidate, so a hand is a pure function of (seed, rung, press counter, kept set).

Hand sizes stay KIN 6, CUR 3.

## 4. The screen

```
┌─ WET LAB ────────────────────────────────────────────────────────────┐
│ SHAPE ●●● ─ ASSET ●○○ ─ RECIPE ░ ─ CREATURE ░ ─ RIG ░               │  rung rail (Q3)
├──────────────────────────────────────────────────────────────────────┤
│                         [ live stage area ]                          │  the pick, alive
├──────────────────────────────────────────────────────────────────────┤
│ [WEAK] [KIN] [CUR]                                  HAND 07  ◂ ▸     │  the strip, as today
│ [tile][tile][tile][tile][tile][tile]                                 │  every tile moves (Q2)
│ KEPT ▪▪▪▫▫▫…                                       CLEAR UNKEPT     │  the rung's shelf
└──────────────────────────────────────────────────────────────────────┘
```

- **The rung rail** runs across the top, Spore-style stages. A rung's three pips fill as you keep (●). A locked rung
  is dimmed (░) and says what opens it, in four words or fewer: "KEEP 3 SHAPES".
- **Opening a rung** (Q1, Q4): keeping the third item on a rung opens the next, for this artist, in every project.
  The rail lights the new rung once, with no sound, toast or number. That is the whole reward.
- **Every tile is alive** (Q2): shapes breathe, assets settle, recipes assemble, creatures walk, rigs run. Under
  reduced motion each shows its still pose (DS rule 7).
- **The shelf** shows what this rung has kept. It is the material the next rung deals from.
- **Hand N** with ◂ ▸: hands are deterministic, so any hand re-deals identically. Revisiting is free.

## 5. Modify: easy first, deep later (Q5)

One tap on a kept tile opens **two quick tools** in place:

- **Swap** — tap a part of the tile; a strip of 3 near parts (the `near` move) slides up; tap one to swap.
- **Nudge** — one dial for the selected part: size, then angle on a second turn.

The **deep editor** (genome timeline, hand edits, breed, attach points: today's WetLab panel) stays one more tap
away and is unchanged. Easy is what you see first; deep is never hidden, only not first.

## 6. First run (Q7)

No text walls, no tips. On a brand-new artist:

1. Only SHAPE is lit. KIN is the only lit button and pulses once (the existing armed outline).
2. The first press deals 6 breathing shapes; the first lands on the stage (as KIN does today, #2250).
3. Tap a tile to keep it. The pip fills.
4. Third keep: ASSET lights on the rail. Nothing else happens.

The test of the first run: a new artist has a kept ASSET in under 60 seconds without reading a word. Measured by
an e2e that runs the path with a clock, not guessed.

## 7. Game feel, and its limit (Q8)

The fun is **discovery**: every press is a new hand, every keep opens more of the world, and everything you make
is alive. There are **no points, scores, streaks, XP, levels, rarity tiers, badges, confetti or "new best"
toasts**. This keeps the standing rulings: "shimmer is a readout, not a reward" (`SHIMMER_UI_PLAN.md`) and "a
readout that gamifies Curator fights Perform" (`SHELL_BRAND.md`). The rail's pips are counts (TE, rule 2); the
reads are measurements (rule 3).

## 8. Build order (one PR each, after this spec merges)

1. **Rung model.** Pure: rung list, unlock rule (keep 3), per-artist unlock store, selfcheck. No UI.
2. **Rung rail UI.** The rail on the WetLab with locked/open states; SHAPE and CREATURE wired to what exists.
   Review lane (screenshots, localhost URL, "Review this").
3. **SHAPE adapter + breathing tiles.** KIN/CUR on simple shapes; the shelf.
4. **ASSET adapter.** Deals compositions of kept shapes; settles into place.
5. **RECIPE adapter.** Builds `hierarchy.js` recipes from kept assets; assembles in the tile.
6. **Creatures take recipes.** The creature adapter deals from kept recipes as well as the library.
7. **Modify: Swap + Nudge.**
8. **First-run path + its 60-second e2e.**
9. **Rigs, one PR each, in §2 order:** beast takes recipes → mobile → Game of Life → Voronoi → liquid.

Out of scope: the stage's own KINETIC and CURATOR (step 5 of the engines spec stays Matt's call), and the
one-writer files `liveLoop.mjs`, `liveResolve.mjs`, `particles.js`.

## 9. Rulings (Matt, 2026-11-16 — all taken as recommended)

1. **Reference:** Spore — build from simple parts, see it alive at once.
2. **"Game of Life for Roni":** Game of Life and Voronoi, two rig kinds.
3. **Game feel:** exploration, no scores. The readout-not-reward rule stands.
4. **Progression:** rungs open as you use them.
5. **Unlock:** keeping 3 on a rung opens the next.
6. **Alive:** every rung moves at once, in the hand.
7. **Layout:** a rung rail across the top.
8. **Memory:** opened rungs are per artist, forever.
9. **Modify:** one tap gives Swap a part + Nudge; the deep editor stays one tap further.
10. **First rig:** Beast.
11. **First run:** yes, guided by the rail itself, no text.

## 10. Risks and unknowns

- **Where "per artist" is stored (checked 2026-11-16).** KC-1 has no account store, but it has a per-viewer
  preference pattern: a pure model with an injected, never-throwing `localStorage` (`dishFluidChip.model.mjs`, key
  `kc.dishFluid.v1`, "never part of a saved project"). The rung unlocks follow it (`kc.wetLabLadder.v1`). The limit:
  it is per browser profile, not per person, and cleared storage re-locks the rungs. That is acceptable for an
  unlock, which is a nicety and not data.
- **Overlap with the constructs ruling (not reconciled).** `constructs-spec.md` §8 (Matt, 2026-11-16, #2259) rules
  that the dealt pool becomes primitives, and that a complex shape *is* a recipe: a construct of 12–16 primitives
  assembled by a style's grammar. This ladder's rungs 2 and 3 (ASSET: 2–6 kept shapes composed; RECIPE: a
  `hierarchy.js` part tree) may be the same thing as the construct, and rung 1's pool should be primitives, not the
  ~985-asset library. This spec does not pick. Steps 1–3 do not depend on it; step 4 starts by reconciling the two,
  and may collapse ASSET and RECIPE into one CONSTRUCT rung. That would be Matt's ruling.
- **ASSET vs `AssetStudioModal`.** The studio already composes assets by hand. Whether the ASSET adapter writes
  the same record format, or a new one, is not checked. Step 4 starts there.
- **Breathing every tile costs frames.** Six live tiles per hand on every rung, plus the stage. Needs a measured
  budget (the governor's cost tiers), not a guess; a starved tile falls back to its still pose.
- **Rig seams** for Game of Life, Voronoi and Liquid are unchecked (§2).
- **The 60-second test** assumes cultivation per hand is fast; `kineticBirths.mjs` bounds a hand of 3 at 24 draws,
  a hand of 6 on every rung needs its own measured bound.

## 11. What this spec does not do

No code, config or behaviour changes. It does not change the KIN/CUR engines, the creature record format, the
breeding law, the stage, or the take.

## 12. Phase 2 rulings (Matt, 2026-11-16 late — all taken as recommended)

These amend the sections above where they differ.

1. **Scope of phase 2:** the rung rail and the SHAPE rung (build steps 2 and 3).
2. **Four rungs, not five.** ASSET and RECIPE become one **CONSTRUCT** rung, matching `constructs-spec.md` §8
   (a complex shape is a recipe built from primitives). The ladder is SHAPE → CONSTRUCT → CREATURE → RIG. §2's table
   rows 2 and 3 and build steps 4 and 5 collapse into "CONSTRUCT adapter" (`engine/constructAssembler.js` exists).
3. **Existing artists start open.** A project that already holds kept creatures or beasts opens every rung. A
   brand-new artist starts at SHAPE only.
4. **SHAPE deals primitives only:** the Canon styles' construct vocabularies
   (`constructVocabularyIds`, `CONSTRUCT_STYLE_IDS` in `engine/constructRules.js`), not the whole library.
5. **One style per hand.** The scope pill picks a style, or ANY (the press picks the style). Kept shapes then fit
   the one-style-per-construct ruling.
6. **Keep goes to the rung's shelf, saved in the project.** The CONSTRUCT rung will deal from the SHAPE shelf. The
   lead shape of a KIN hand also lands on the stage, as KIN creatures do (#2250).
7. **The rail shows one rung at a time.** Tapping a rung shows only that rung's strip; the creature strip sits under
   CREATURE and the beast strip under RIG.

Phase 2 is cut into issues, one fix per PR; each issue names its files, its selfcheck, and what it must not touch.

## 13. Phase 3 rulings: the CONSTRUCT rung (Matt, 2026-11-17 — all taken as recommended)

**Correction first.** The question put to Matt said a construct is "2 to 4 primitives". The code says otherwise:
`assembleConstruct` (`engine/constructAssembler.js`) builds a record of `CONSTRUCT_MIN_PARTS`–`CONSTRUCT_MAX_PARTS`
= **12–16 parts**, drawn with repeats from one style's vocabulary, and needs only one vocabulary piece that carries an
ATTACH point. The rulings below read with that in mind.

1. **KIN builds from the artist's kept shapes only.** The vocabulary of a construct is the SHAPE shelf's shapes of one
   style — never the rest of that style's vocabulary.
2. **Too few: say so.** If no style has at least 2 kept shapes, KIN is disabled with one line: "KEEP 2 SHAPES OF ONE
   STYLE". (The assembler would run on 1; 2 is the design floor, so a construct is never one shape repeated.)
3. **Alive: pieces settle into place.** Each part starts a little apart from its join and slides home, then rests;
   hover replays it. Under reduced motion the tile shows the settled construct.
4. **Keep goes to the construct bank** (`bankConstruct`, #2284) and fills a CONSTRUCT pip. The lead of a KIN hand
   lands on the stage, as on the other rungs — *if* a banked construct tile can be turned on for the stage today.
   Not checked: `constructRecords` says tiles "are drawn from them, never saved". The strip's issue checks first.
5. **CUR changes one thing.** Three neighbours of the last kept construct, each with one primitive of its vocabulary
   swapped for another kept shape of the same style. ("One join" changes need a record-level edit the assembler does
   not offer; not in this phase.)
6. **SHAPE shelf tiles grow to 44 px** (the touch target).
7. **The "BANK · + BEAST" footer shows only under RIG**, with the beast strip.

## 14. Phase 4 rulings: creatures built from constructs (Matt, 2026-11-17 — all taken as recommended)

Phase 3 (the CONSTRUCT rung, issues #2297–#2301) is built by smaller models and reviewed. Phase 4 joins the ladder end to
end: the CREATURE rung builds from what the artist kept below it.

1. **A construct can be a body or a part.** Bodies come from the creature adapter's pool (`ctx.library` in
   `deal/creatureAdapter.mjs`); parts are dealt by Davis onto the bones from the parts pile (`expandCreatureInstances`,
   `engine/creatureRig.js`).
2. **Bodies: the ladder once it holds 3.** With 3 or more banked constructs, KIN's bodies come only from them. With
   fewer, the library fills in as today. (`LADDER_BODY_FLOOR = 3`.)
3. **Parts: kept constructs and kept shapes join the pile automatically,** in the WetLab, whether or not they are on
   the stage. The stage's own pile is unchanged.
4. **Kept shapes are parts, never bodies.**

**Not checked** (each issue checks first, and stops with a comment if it fails):
- Whether a construct tile (`constructTile` in `engine/constructAssembler.js`) reads as a body: `attachPointsFor` must
  find head and limb points on its svg, and the cultivate gate must pass it.
- Whether a creature with a construct body or construct parts draws the same on the stage as in the WetLab. The stage
  deals parts from what is on the stage; a construct that is not on the stage cannot ride there. This phase is the
  WetLab only; stage parity is a ruling for later.

