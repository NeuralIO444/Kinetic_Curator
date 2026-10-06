# PATTERN — procedural 2D geometric quilt generator (spec)

**Status:** spec draft, 2026-10-05. Not filed, not queued — scope lock holds.
**Reference:** Matt's photo 2026-10-05 — bold flat-color geometric tessellation: nested diamonds, medallions, hexagons, stripe fields, dot grids, pinwheels, bullseyes, leaf rows, one isometric cube hero tile, dark navy grout between tiles.

## What it is

A new CONTENT-track generator (KIN family) that procedurally synthesizes tessellated geometric pattern fields in the reference style. Every render is a quilt: a grid of square tiles, each running one motif, all drawn from the active palette. Seed-stable, resolution-independent, cheap to render.

## Modes

Two composition modes, one engine:

**QUILT** (reference 1) — dense maximalist tessellation. Full palette, grout lines, hero 2×2 tiles, motifs bleed to tile edges. Wallpaper that performs.

**GLYPH** (reference 2 — "Neo Geometric" mural) — strict grid (default 5×4), one bold centered mark per tile, 2–3 colors per tile max, limited global palette (4–6 hues drawn from the active palette's strongest roles), generous negative space, hairline or zero grout. Poster, not wallpaper. Each tile reads as an icon at a glance — built for the STAGE at distance.

**FIELD** (reference 3 — "Seamless Geometric Pattern") — each tile is itself a small *repeating* micro-pattern: stripe stacks, triangle fields, plus-sign grids, zigzag rows, diamond lattice, concentric arcs, pinstripes, ray bursts. Tiles are seamless — every micro-pattern wraps at the tile edge (designed on a torus), so the whole field can pan/zoom infinitely with no visible seams. No grout at all; tiles butt-joint into one continuous textile. The VJ move is slow drift across the field, not shuffling it.

**ESCHER** — true interlocking tessellation à la M.C. Escher. Start with a base grid (square or hexagon); each edge gets a seeded bezier "bump" function; the bump is replicated across edges by a symmetry op — translation (opposite edges share the curve), rotation (90°/180° about a vertex or midpoint), reflection (mirror across an axis). Because edge pairs are complementary *by construction*, tiles interlock with mathematically zero gaps. Each tile is filled from the palette in alternating figure/ground roles so the creatures emerge. DRIFT becomes *Metamorphosis*: the bumps slowly morph, one tiling breathing into another.

Mode is a track-level switch, persisted per track. SHUFFLE re-seeds within the current mode.

## Tile vocabulary (from the reference)

1. Nested diamond — concentric rotated squares, 3–4 levels
2. Medallion — star/polygon center with ring
3. Hexagon nest — concentric hexagons
4. Stripe field — horizontal / vertical / diagonal, 2-color
5. Dot grid — polka on solid ground
6. Triangle fan / pinwheel
7. Bullseye — nested rings
8. Leaf / feather rows
9. Solid block — breathing room, no motif (negative space is a motif)
10. Cube — isometric cube, reserved for hero tiles

Glyph-mode marks (reference 2 — one per tile, centered, high negative space):
11. Sunburst — radiating lines from a disc
12. Pixel cluster — blocky tetromino arrangement
13. Slashed circle — ring with diagonal bar
14. Squiggle — continuous wave band
15. Chevron — single or stacked
16. Bolt — lightning polygon
17. Interlock — overlapping rings / vesica
18. Eye — almond with triangle pupil
19. Knot — crosshair loop
20. Capsule — stacked discs / pill stack
21. Slab — beveled parallelogram
22. Arrows — directional chevron run
23. Crossed disc — circle with X

Field-mode micro-patterns (reference 3 — repeating, seamless, designed on a torus):
24. Stripe stack — horizontal bars, 2–3 widths
25. Triangle field — grid of solid triangles
26. Plus grid — evenly spaced crosses
27. Zigzag rows — chevron bands
28. Diamond lattice — interlocking diamond grid
29. Concentric arcs — radiating arc bands
30. Pinstripes — fine diagonal lines
31. Ray burst — radial ticks from tile corner
32. Bar stack — vertical bars, varied widths
33. Nested diamond bands — expanding diamond outlines

## Composition (QUILT)

- Grid of square tiles, DENSITY 4–12 across (default 8).
- Each tile: one motif + local color assignment from the active palette.
- Dark grout lines between tiles (color follows palette's darkest role; width = GROUT).
- HERO tiles: 2×2 feature tiles (cube, medallion) at HERO probability — the eye needs somewhere to land.
- MIX controls motif entropy: low = ordered rhythm (alternating stripe/dot), high = full chaos quilt.

## Composition (GLYPH)

- Fixed-aspect grid, default 5 cols × 4 rows; DENSITY scales both axes.
- One mark per tile, centered, sized to ~60% of tile — negative space is the design.
- Palette restricted to 4–6 hues (strongest roles of the active palette); each tile uses at most 3.
- No hero tiles — every tile is equal weight. The rhythm comes from mark variety, not scale.
- Motion: marks pulse/scale subtly in sequence (a wave across the grid, phase-offset); at high DRIFT, marks swap glyphs on the BEAT clock.

## Composition (FIELD)

- Grid of square tiles, default 6×6; DENSITY scales both axes.
- Each tile runs one micro-pattern, drawn seamless — pattern functions are periodic in tile space, so edges wrap perfectly.
- No grout: tiles butt-joint into a continuous field. The tile grid itself should be invisible; only the micro-patterns read.
- Palette: full active palette allowed, but each tile uses at most 3 hues — restraint is what makes it textile, not noise.
- Motion: slow infinite pan across the field (DRIFT controls speed/direction); at high DRIFT, per-tile micro-patterns crossfade on the BEAT clock. SHUFFLE re-seeds pattern assignment, never interrupts the pan.

## Composition (ESCHER)

- Base grid: SQUARE or HEX (triangular parked for v1).
- Master tile: the base polygon with each edge replaced by a seeded bezier bump (params: BUMP amplitude, EDGE_SEED).
- Symmetry op per track: TRANSLATE / ROTATE / REFLECT — applied to edge pairs so every shared edge is complementary. Gap-free by construction, not by tuning.
- Fill: alternating figure/ground from two palette roles (FIGURE_GROUND controls the contrast pair); a third accent role marks tile centers at low density.
- SHUFFLE re-rolls edge functions + symmetry assignment. DRIFT morphs bump control points continuously — one tiling breathes into another (*Metamorphosis*).
- Params: GRID, BUMP (0–100%), EDGE_SEED, SYMMETRY, FIGURE_GROUND, MORPH (drift speed, reuses DRIFT).
- Acceptance: render the field, sample the tile-boundary pixels — zero background-colored pixels inside the field bounds (gap-free assert); same seed = identical tiling; fills palette-conformant.

## Palette behavior

Colors come only from the active KC-1 palette — PATTERN never invents hues. Roles: ground (darkest, grout + stripe grounds), brights (motif fills), accents (centers, dots). A 37-palette instrument already speaks this language; PATTERN just tiles it.

## Parameters (artist units, all MOD-routable)

| Param | Range | Default | Notes |
|---|---|---|---|
| DENSITY | 4–12 tiles | 8 | tiles across |
| MIX | 0–100% | 55% | motif entropy |
| SEED | — | random | SHUFFLE = new quilt |
| GROUT | 0–12px | 4px | gap width |
| HERO | 0–100% | 25% | 2×2 feature tile probability |
| DRIFT | 0–100% | 20% | motion amount (below) |

## Motion (never static — the house rule)

- Slow per-tile rotation on pinwheels/medallions, phase-offset so the field breathes rather than spins.
- Hue cycle across accent roles at low DRIFT; at high DRIFT, motifs morph (diamond ↔ hexagon) on a slow clock.
- SHUFFLE re-seeds the quilt; quantize to BEAT bar when BEAT is running — the pattern drop lands on the one.

## Layer-system fit

- CONTENT track (KC-x). Rides the FX fold (TEAR across a quilt is the money shot) and MATH tone ops (HUE ROTATE re-keys the whole palette at once).
- Keep/favorite + taste: PATTERN renders are first-class keeps; the taste model learns motif/palette preference for free.
- Persistence: seed + params in the project document like any other track.

## Performance

Tile motifs are flat shapes — 2D canvas or a single fragment shader, trivially 60fps on M-series at 4K. No atlas rebake on SHUFFLE (exclude from macro learn like other rebake params).

## Acceptance (measurable)

- Renders all 10 motifs across a seed sweep (no empty/degenerate tiles).
- Same seed + params = pixel-identical quilt (seed stability).
- Every fill color sampled from the active palette (palette conformance — assert in eval).
- SHUFFLE latency < 100ms at 8×8 on M-series.
- 60fps sustained with DRIFT at 100% (Perf HUD, no SwiftShader excuses — verify on Matt's Mac).

## Out of scope (parked)

- Hex/triangle grids (square tiles only for v1 — the reference is square-tile).
- Importing SVG motifs.
- Per-tile manual editing (that's a different instrument).

---

## LOIS pass (9-rule lens)

1. **Be noticed:** a full-bleed quilt needs no introduction — biggest pattern wins, no thumbnail timidity.
2. **Be simple:** ten motifs, six knobs. If it needs a manual, it's wrong.
3. **Be honest:** flat color, hard edges — no fake texture, no bevel lies.
4. **Know the product:** it's wallpaper that performs — the SHUFFLE is the product, not the tile.
5. **Command:** SHUFFLE is a stage button, not a menu item. One tap, quantized to the beat.
6. **Poetry in the ordinary:** grout lines — the negative space is doing half the work. Respect it.
7. **Disobey:** every VJ tool does particles and noise. Nobody does the quilt. Good.
8. **Team:** palette does the color, BEAT does the timing, taste does the learning — PATTERN does none of their jobs.
9. **Take the risk:** ship square tiles only. The hex-grid version is fear dressed as completeness.
