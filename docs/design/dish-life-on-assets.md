# DISH LIFE on the assets — spec (#2152)

Status: **spec for Matt's yes.** Nothing here is built. Rulings in: Matt 2026-11-12 ("I like what it is doing. I just want it to do it to the assets on the stage."); 2026-11-16 answers: assets are **born / die / change by neighbours**; they are **driven by the culture beneath them** (the dish grid keeps running; assets read it, they are not a second automaton); **spec first, then one slice**.

## What exists (verified on main)

- `engine/dishLife.mjs` — the culture: a 6-state Generations automaton (0 dead, 1 alive, 2..5 decaying) on the 96×54 dish grid; locked/held marks are bedrock.
- `engine/dishLifeStage.mjs` — two modes. **Visual** (idle ≥ 8 s): dissolves the scene and draws cells as placement items. **Field** (persistent, Stage Coupling Phase 1, #1994): same culture, **never draws**, publishes `level` / `activity` on `publishedField`.
- `engine/dishLifeCouple.mjs` — Phase 2 read side: marks **swell/shrink** (scale), glyph breath depth, pattern drift, TIDES, backgrounds, all as bounded modulation behind one coupling dial (0 = off), folded to 0 by the governor's CULTURE HELD. Never vanishes a mark.

So today Life touches assets only as a gentle tint/scale nudge or, when idle, by replacing the picture. Nothing is born or dies _on the assets while you perform._

## The proposal: a LIFE consumer on the field seam

One new read-side consumer in `dishLifeCouple`'s family, same laws, same seam (it reads `publishedField`, writes nothing back):

| Cell under the mark                          | The asset                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **alive** (1)                                | drawn as dealt                                                                                                                          |
| **decaying** (2..5)                          | **fades** (alpha and scale ease down through the decay states; the culture already ages cells, so the fade is free and has tails)       |
| **dead** (0, for the whole decay)            | **gone** (not drawn)                                                                                                                    |
| a cell **newly alive with no mark**          | a **born** asset: a copy of the nearest dealt mark's asset (the existing `nearestMarks` assignment), seated at the cell, capped         |
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
2. **Born:** live empty cells hatch copies of the nearest dealt mark. **Re-cut 2026-11-16, see "Slice 2, re-cut" below** (cap 256, share rule, nearest the parent first; the tint step is dropped).
3. **Cycle ease + shed:** the roll ease and the governor's ordering of what sheds first.

## Acceptance (from the issue, made checkable)

- [ ] Dial > 0: assets on stage visibly fade out and vanish where the culture dies, and new ones appear where it is born (slice 2), not only tint/backdrop
- [ ] Dial 0: byte-identical frames (golden)
- [ ] A take replays identically; still equals live (golden over a recorded field stamp)
- [ ] Held/locked/pinned marks and the poem never change
- [ ] CULTURE HELD reads as the uncoupled frame

## Slice 2, re-cut: births are copies of real marks (Matt, 2026-11-16)

Status: **spec for the build that follows it.** Slice 1 is on main (#2234). This section replaces the slice 2 row and the "born" and "changes state" rows of the table above. Rulings in: the unification ruling (`one-force-seam.md`, "Unification": copies are real marks, cap **256**, copies' ink at most **half** the dealt ink, copies shed first, dealt > copies > forces) and Matt's answer of 2026-11-16 night to the one open question: **births land nearest their parent first.**

### What you see

With the LIFE dial up, wherever the culture is alive on an empty patch of the dish, a **copy of the nearest dealt mark** appears there. The copies grow outward from the dealt marks, ring by ring, so each asset reads as multiplying into the space around it. A copy lives exactly as long as the cell under it: it fades and shrinks as the cell decays and is gone when the cell is dead. Dealt marks keep fading and dying as in slice 1.

### The law (one frame, no memory)

| Question                 | Answer                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where can a birth land?  | A dish cell whose culture is alive or still decaying, with **no dealt mark standing in it**, and not on held / locked terrain.                                                                                                                                                                              |
| Which mark is copied?    | The **nearest dealt mark that is still visible** (measured across the dish grid). The poem, terrain and other copies are never parents.                                                                                                                                                                     |
| Which births come first? | **Nearest their parent first** (Matt, 2026-11-16). Ties go to the lower cell number, so the order is the same every frame and every replay.                                                                                                                                                                 |
| How many?                | At most **256 × the LIFE dial**. Raising the dial lets the rings spread farther.                                                                                                                                                                                                                            |
| How much ink?            | Births stop as soon as the copies' total ink would pass **half** the visible dealt marks' ink (ink = size × size × opacity). When Life kills most of the dealt marks, the copies thin with them.                                                                                                            |
| How does a copy look?    | Its parent exactly (asset, colour, rotation, material, the kineme's scale and turn on the parent that frame), at **0.6 ×** the parent's size and **0.7 ×** its opacity (both confirmed by Matt, 2026-11-17), then faded and shrunk by the cell's own decay. Always smaller and quieter than the dealt mark. |
| Where is it drawn?       | In its **parent's own layer**, after that layer's dealt marks, so the layer's blend and finish apply to it as to any mark there.                                                                                                                                                                            |
| Other forces?            | The ferrofluid leans a copy exactly as it would lean a mark standing there (order 2 of the seam). The ferrofluid never copies a copy.                                                                                                                                                                       |
| Under load?              | **Copies shed first:** at the governor's first shed step all births are gone while the dealt marks' fade still runs; CULTURE HELD then folds the fade too.                                                                                                                                                  |
| Idle Life picture?       | While the old idle Life picture is on screen there are no births (it retires in a later slice).                                                                                                                                                                                                             |

### Dropped from the first cut

- **The neighbourhood tint step.** The unification ruling says copies have the same look as dealt marks, so a copy never takes a colour its parent does not have.
- **Cap 64**, replaced by 256 and the share rule.

### Laws it keeps

- **Off = identical.** LIFE dial 0: byte-identical frames, no work.
- **Old takes replay unchanged.** The live loop stamps a marker (`dishFieldBorn`) beside the LIFE dial; a take recorded before this slice lacks it and replays with fade-and-die only.
- **Replayable.** A pure function of the published culture, the dial and the frame's marks. A take replays bit for bit; a still equals live.
- **Nothing edited in place.** Copies are extra items for that frame only; the layers' own arrays are untouched.

### Known and left for slice 3

A birth arrives on a culture generation, so a copy appears in one step rather than easing in, and at the cycle roll the picture re-seeds. Slice 3 (cycle-roll ease) owns both.

### Acceptance (this slice)

- [ ] LIFE up: copies of the stage's own marks appear on live empty ground beside their parents, never a new shape
- [ ] Never more than 256, never more than half the dealt ink, every copy smaller and quieter than its parent
- [ ] LIFE 0, the marker absent, and the first shed step are each byte-identical to slice 1
- [ ] Held / locked / pinned marks and the poem are never copied and never covered
- [ ] The same stream replays identically

## Slice 3: the cycle roll eases back in (Matt, 2026-11-17)

Status: **built with this section.** Matt's ruling: at the cycle roll the stage **eases back in** (declined: snapping back on the bar line; growing back ring by ring from the survivors).

When the field culture re-seeds (every cycle roll, and a "seed from stage" press), the field stage keeps the level grid the old culture stood at. For the first **4 generations** of the new seed (about half a second), every consumer reads a straight blend from that old grid to the new one: generation 0 reads the old grid exactly, generation 4 the new one. So dead marks fade back up, marks the new seed leaves dead fade out, copies fade the same way, and the coupling scale eases too. The culture itself is untouched: only what the consumers read is blended.

- **Off = identical.** The first wake has nothing to ease from; outside the 4-generation window every frame is exactly what it was.
- **Old takes replay unchanged.** The live loop stamps `dishFieldEase` beside the field stamp; a take recorded before this slice lacks it and keeps its pop.
- **Replayable.** The grid is part of the stage state: a replay seek-back keeps it, and a snapshot taken inside the window carries it, so a still or a take that starts mid-ease eases exactly as live.
