# Authoring assets for Kinetic Curator

The live tab is not Illustrator. You draw *there*, ingest *here*. Canon 137 never receive session files.

## What an asset is

- Geometry in a **100×100** (or square) viewBox
- Fill uses `var(--ink)` and optionally `var(--accent)` — the instrument recolors
- One motif per file. Compounds (Haeckel plates, moth wings) are several shapes in one `<g>`, tagged compound
- No live text, no linked rasters, no filters, no `foreignObject`

## Illustrator export

1. New file, **100 × 100 px**, artboard = motif bounds.
2. Draw with **fills / strokes as attributes**, not a Graphic Style sheet if you can avoid it. Ingest now strips `<style>`, so class-based fills may flatten to empty.
3. Recolor: set fills you want as accent to `#e0245e` (or `#ff2d95`). Ingest rewrites those to `var(--accent)`. Everything else should be `#fff` / currentColor / black that you are happy to become `--ink`.
4. **File → Export → Export As → SVG**
   - Styling: **Presentation Attributes** (not Internal CSS)
   - Font: convert to outlines if you must ship a letterform; otherwise skip type
   - Images: **off** / embed is still rejected
   - Decimal: 2–3 is enough
5. Drop or **IMPORT** on P02. Tile appears as `user:…`, **off**. Enable when you want it on the plate.
6. Save the **project** — overlay lives in project JSON, not in `app/src/data`.

## Haeckel / moth traces

Trace public-domain plates. Do not drop a JPEG of a book page. Compounds stay attachments; they will not enter a blend ladder.

## What we will not add in the live tab

Path editing, pen tool, boolean ops, gradient stops. Replace the SVG (re-IMPORT over the tile, or delete + ingest) if the drawing is wrong.
