# DISH LIFE on the assets — spec (#2152)

Status: **spec for Matt's yes.** Nothing here is built. Rulings in: Matt 2026-11-12 ("I like what it is doing. I just want it to do it to the assets on the stage."); 2026-11-16 answers: assets are **born / die / change by neighbours**; they are **driven by the culture beneath them** (the dish grid keeps running; assets read it, they are not a second automaton); **spec first, then one slice**.

## What exists (verified on main)

- `engine/dishLife.mjs` — the culture: a 6-state Generations automaton (0 dead, 1 alive, 2..5 decaying) on the 96×54 dish grid; locked/held marks are bedrock.
- `engine/dishLifeStage.mjs` — two modes. **Visual** (idle ≥ 8 s): dissolves the scene and draws cells as placement items. **Field** (persistent, Stage Coupling Phase 1, #1994): same culture, **never draws**, publishes `level` / `activity` on `publishedField`.
- `engine/dishLifeCouple.mjs` — Phase 2 read side: marks **swell/shrink** (scale), glyph breath depth, pattern drift, TIDES, backgrounds, all as bounded modulation behind one coupling dial (0 = off), folded to 0 by the governor's CULTURE HELD. Never vanishes a mark.

So today Life touches assets only as a gentle tint/scale nudge or, when idle, by replacing the picture. Nothing is born or dies *on the assets while you perform.*

## The proposal: a LIFE consumer on the field seam

One new read-side consumer in `dishLifeCouple`'s family, same laws, same seam (it reads `publishedField`, writes nothing back):

| Cell under the mark | The asset |
|---|---|
| **alive** (1) | drawn as dealt |
| **decaying** (2..5) | **fades** (alpha and scale ease down through the decay states; the culture already ages cells, so the fade is free and has tails) |
| **dead** (0, for the whole decay) | **gone** (not drawn) |
| a cell **newly alive with no mark** | a **born** asset: a copy of the nearest dealt mark's asset (the existing `nearestMarks` assignment), seated at the cell, capped |
| neighbourhood count (2 vs 3 live neighbours) | **changes state**: the born/surviving mark swaps between the asset's own variants it already has (tint step), never a new look invented |

Born marks are extra placement items on the top content layer, the way visual mode already draws cells (`cultureItems`, `MAX_CELL_ITEMS`). **Nothing is edited in place**: layers keep their arrays, so dial 0 or a touch-release restores the dealt scene exactly.

## Laws it inherits (the four-part admission test)

- **Seeded / replayable:** a pure function of (published field, dial, mark). Stateless: no per-asset memory, the decay states carry the history. Take replay and stills equal live (the field is a recorded stamp; a GPU culture enters as the recorded cells, #2187).
- **Sheddable:** effective coupling folds to 0 under CULTURE HELD, so the frame is the uncoupled frame, whole.
- **Lock-respecting:** held/locked/pinned marks are bedrock: never faded, never copied, as everywhere. FIELD form items (the poem) are out of reach by construction.
- **Off = identical:** dial 0 → byte-identical output and no work. The performer raises it; no new toggle (the Phase 2 on-switch ruling).
- **Log-accountable:** the acting strength is stamped on the resolver input each frame it acts, like the other consumers.

## Decisions I need from Matt (each has my default)

1. **A new dial or the existing coupling dial?** Default: a **separate LIFE dial** in the same chip (0 = off), so you can have the gentle swell without deaths. Lower risk: nobody's existing look changes.
2. **Do deaths really vanish a mark?** Default: **yes**, fully gone at the end of the decay (your acceptance says born / die, not only tint). The "never silent canvas" floor stays true because the culture keeps the whole dish moving; one dead patch is not a dead stage.
3. **Cycle roll.** The field re-seeds from the scene every 24 / 48 / 96 generations, so every dealt mark is alive again at the roll. Default: **ease the roll** (fade back in over a few generations) so marks do not pop.
4. **Birth cap.** Default **64 born marks**, lowest-cost first; the governor sheds births before it sheds anything else.
5. **Where it lives in the UI.** Default: a **LIFE** row beside the existing DISH LIFE coupling dial; no new panel.

## Slices (one PR each, your review between)

1. **Fade and die:** marks over decaying/dead cells fade and vanish. No births. Pure `cultureLifeFactor` + applier + selfcheck + live capture. (The smallest thing that shows "assets live and die".)
2. **Born:** newly alive cells hatch nearest-asset copies, capped; neighbourhood tint step.
3. **Cycle ease + shed:** the roll ease and the governor's ordering of what sheds first.

## Acceptance (from the issue, made checkable)

- [ ] Dial > 0: assets on stage visibly fade out and vanish where the culture dies, and new ones appear where it is born (slice 2), not only tint/backdrop
- [ ] Dial 0: byte-identical frames (golden)
- [ ] A take replays identically; still equals live (golden over a recorded field stamp)
- [ ] Held/locked/pinned marks and the poem never change
- [ ] CULTURE HELD reads as the uncoupled frame
