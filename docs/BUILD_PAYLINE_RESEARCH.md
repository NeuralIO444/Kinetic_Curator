# BUILD payline system — research & design

**Date:** 2026-10-07
**Status:** research/spec only — KC-1 build halt in force since 2026-10-05
**Applies KC-1 DS** (rule 2: discrete → TE, continuous → Davis)
**Mockup:** `~/workspace/kc-topbar-mockups/build-paylines.html`

## 1. What exists today

### SHAPES mixer — CAST section (BuildPanel ②)
- **#733 — 4-state LED chips** (`ShapesShelf.jsx`, `layoutSlice.js#cycleShapeLevel`):
  tap cycles off → 1 → 2 → 3 → off, shown as three pips under the label.
- **Cap:** `SHAPE_MIX_MAX = 4` chips on at once (`voices.js:416`). A fifth
  tap is refused — no-op, never evicts. The refusal *is* the visible
  constraint (already TE behavior).
- **Pool = union** of the on-chips' shape sets; `shapeLevels` carries
  intensities that the placer weights by (`shapeMixIds`, `liveShapeLevels`).
- **Never empty:** the last chip can't go off (at 3 it stays 3) — an empty
  pool renders nothing.
- **Single-axis contract:** shapes only. Never touches layout/motion/colour.

### LAYOUT tiles — BUILD section ①
- `CompositionTiles.jsx`: 14 tiles (12 stub modes + DLA + Eden), **single-select**
  (`mode === m.id`). No mixing, no weights.

## 2. The payline concept

The chip grid is the reel window. A payline is a named geometric pattern
across it, borrowed 1:1 from the slot-machine payline card:

| Lines | Pattern |
|-------|---------|
| 1–3   | the three rows |
| 4–5   | the two diagonals (X) |
| 6–7   | V and inverted-V, full width |
| 8–9   | zigzags |

Chips keep their 1–3 pip weights (untouched #733). A payline goes **hot**
when **3+ consecutive chips from the line's left anchor are lit** —
slot-authentic: paylines pay left to right. Lighting chips mid-line without
the anchor leaves the line cold.

A hot payline is a **blend recipe**: those chips, weighted by their pips,
blended along the line. Multiple hot lines stack (union, like today's pool).
The payline turns ad-hoc mixing into named, armed, recallable patterns.

## 3. KC-1 DS application

Everything in the payline system is discrete, so it renders **TE throughout**:
- Arming a line: red marker, labeled 1–9 (discrete).
- Hot vs. cold: solid red wire vs. dim dashed wire (discrete).
- Pip weights: unchanged #733 pips (discrete).
- The 4-chip refusal: unchanged (discrete, visible constraint).
- Anchor rule: the leftmost chip of an armed line gets a subtle amber edge —
  it is the most valuable chip on the grid while armed.
- The wire overlay shows the game honestly: filled red dots for the
  consecutive run, hollow where the run breaks.
- Blend readout lists hot lines with pip-weighted recipes, sorted by weight.
- No amber glow anywhere — a blend recipe is data and reads like data.

## 4. LAYOUT paylines — phase 2, engine flag

Payline-blending *layout modes* needs engine support: layouts are
single-select all the way down today. SHAPES ships paylines now (the mixer
exists); LAYOUT waits on multi-layout blending in the engine. Do not
spec LAYOUT paylines as UI-only work — the blend has to be real.

## 5. Open questions for Matt
1. Is the left-to-right anchor rule the right game, or should any 3+ lit
   chips on a line go hot (simpler, less slot)?
2. Should hot paylines auto-name their recipes into the HITS setlist
   (a hot line = a capturable vibe)?
3. LAYOUT phase 2: is multi-layout blending desirable at all, or should
   layouts stay single-select forever?

## 6. References
- Code: `app/src/panels/layout/ShapesShelf.jsx`, `CompositionTiles.jsx`,
  `app/src/state/slices/layoutSlice.js` (`cycleShapeLevel`),
  `app/src/data/voices.js` (`SHAPE_MIX_MAX`, `shapeMixIds`, `liveShapeLevels`)
- Issues: #733 (shape mixer), #1121 (KC-1 DS contract)
- Mockup: `~/workspace/kc-topbar-mockups/build-paylines.html`
