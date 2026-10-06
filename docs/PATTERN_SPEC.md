# PATTERN — procedural 2D geometric quilt generator

**Status:** spec revised by Matt, 2026-10-05. Filed as #1039–#1042, queued to build.
**Reference:** Matt's photo 2026-10-05 — bold flat-color geometric tessellation: nested diamonds, medallions, hexagons, stripe fields, dot grids, pinwheels, bullseyes, leaf rows, one isometric cube hero tile, dark navy grout between tiles. Glyph and field references are the other two composition targets.

## What it is

A CONTENT-track generator (KIN family) that procedurally synthesizes tessellated geometric pattern fields in the reference style. Every render is a quilt: a grid of square tiles, each running one motif, all drawn from the active palette. Seed-stable, resolution-independent, cheap to render.

v1 ships three modes on one engine. ESCHER is specified and parked.

## Modes

Three composition modes, one engine. Mode is a track-level switch, persisted per track. SHUFFLE re-seeds within the current mode. It does not change mode.

**QUILT** (reference 1) — dense maximalist tessellation. Full palette, grout lines, hero 2×2 tiles, motifs bleed to tile edges. Wallpaper that performs.

**GLYPH** (reference 2 — "Neo Geometric" mural) — strict grid (default 5×4), one bold centered mark per tile, 2–3 colors per tile max, limited global palette (4–6 hues drawn from the active palette's strongest roles), generous negative space, hairline or zero grout. Poster, not wallpaper. Each tile reads as an icon at a glance — built for the STAGE at distance.

**FIELD** (reference 3 — "Seamless Geometric Pattern") — each tile is itself a small repeating micro-pattern: stripe stacks, triangle fields, plus-sign grids, zigzag rows, diamond lattice, concentric arcs, pinstripes, ray bursts. Tiles are seamless — every micro-pattern wraps at the tile edge (designed on a torus), so the whole field can pan/zoom infinitely with no visible seams. No grout at all; tiles butt-joint into one continuous textile. The VJ move is slow drift across the field, not shuffling it.

GLYPH and FIELD are not MIX extremes of QUILT. MIX cannot produce negative space or edge-wrapping. They are mode switches.

**ESCHER — parked, not v1.** True interlocking tessellation. Specified below so it is not reinvented later. Do not build it until FIELD's torus assert is green. Hex grids stay parked with it. v1 is square tiles only.

## Tile vocabulary

Quilt motifs (reference 1):

1. Nested diamond — concentric rotated squares, 3–4 levels
2. Medallion — star/polygon center with ring
3. Hexagon nest — concentric hexagons (drawn inside a square tile; this is not a hex grid)
4. Stripe field — horizontal / vertical / diagonal, 2-color
5. Dot grid — polka on solid ground
6. Triangle fan / pinwheel
7. Bullseye — nested rings
8. Leaf / feather rows
9. Solid block — breathing room, no motif (negative space is a motif)
10. Cube — isometric cube, reserved for hero tiles

Glyph marks (reference 2 — one per tile, centered, high negative space). Construction is in Composition (GLYPH). Names here are the vocabulary, not the draw spec:

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

Field micro-patterns (reference 3 — repeating, seamless, designed on a torus). A motif that cannot wrap is not a field motif:

24. Stripe stack — horizontal bars, 2–3 widths
25. Triangle field — grid of solid triangles
26. Plus grid — evenly spaced crosses
27. Zigzag rows — chevron bands
28. Diamond lattice — interlocking diamond grid
29. Concentric arcs — radiating arc bands, periodic
30. Pinstripes — fine diagonal lines
31. Ray burst — radial ticks on a repeating corner lattice, not a single corner (a single-corner burst fails the torus assert)
32. Bar stack — vertical bars, varied widths
33. Nested diamond bands — expanding diamond outlines, periodic

No cross-mode motif morph in v1. Nested diamond and nested square may share a level parameter later. Diamond ↔ pinwheel is not a morph.

## Composition (QUILT)

- Grid of square tiles. DENSITY 4–12 across (default 8).
- Each tile: one motif + local color assignment from the active palette.
- Motifs may paint to the tile rect. Grout is a separate overlay, not a clip that eats the motif.
- Grout color follows the palette's darkest role. Width is GROUT, a fraction of tile size.
- HERO tiles: 2×2 feature tiles (cube, medallion). Placement is not an independent coin flip.
  - Eligible cells are the coarser lattice: every other 2×2 block.
  - HERO is the probability an eligible block becomes a hero.
  - Cap: at most `floor(cols / 4)` heroes.
  - No adjacency. If a candidate touches an accepted hero, skip it.
- MIX controls motif entropy inside the quilt vocabulary: low = ordered rhythm (alternating stripe/dot), high = full chaos quilt. MIX does not leak glyph or field motifs in.

## Composition (GLYPH)

Poster, not wallpaper. Each tile is an icon. The read at STAGE distance is the acceptance test: a mark is a success if it is identifiable as a silhouette at 64px tile size.

### Grid

- Default 5 cols × 4 rows. DENSITY scales both axes and keeps the 5:4 aspect. DENSITY 4 → 5×4. DENSITY 8 → 10×8. DENSITY 12 → 15×12. Cols = `round(5 * DENSITY / 4)`, rows = DENSITY. Clamp cols to 4–16, rows to 3–12.
- Square tiles. The grid letterboxes inside the frame. Unused frame is the ground role, not a stretched tile.
- No hero tiles. No 2×2. Every tile is equal weight. HERO is ignored.
- GROUT default 0. If GROUT > 0 it is a hairline in the ground role, still a fraction of tile size, still an overlay. It never eats the mark box.

### Mark box

- One mark per tile, centered on the tile center.
- At DRIFT 0 the mark's axis-aligned bounds sit inside a box of 60% of tile size (30% inset on each side). Stroke caps and miter joins count. A mark that kisses the 60% box fails.
- DRIFT may scale the mark up to 72% of tile size. It may not leave the tile rect. Pulse is toward the center, never a translation.
- Rotation is a seeded static pose, not motion. Allowed poses: 0°, 90°, 180°, 270°, plus the mark's own authored diagonal (slash, bolt, squiggle). No continuous spin. QUILT owns rotation.
- Marks are flat fills and uniform strokes. No gradients, no bevels, no texture, no fake 3D. Slab's "bevel" is a second flat polygon in a second role, not a lighting model.

### Palette inside GLYPH

- Global set is the 4–6 strongest roles of the active palette, ranked by role weight already on the palette. PATTERN does not pick hues. If the palette has fewer than 4 roles, use all of them.
- Roles inside a tile, max 3:
  - GROUND: tile fill. One ground for the whole grid, the darkest of the restricted set. Not counted against the per-tile cap of 3 motif colors.
  - MARK: primary fill or stroke.
  - CUT: knockout or second shape (pupil, slash, inner ring). Optional.
  - ACCENT: a third shape, used on at most one sub-element (disc center, arrow head). Optional.
- A tile with only MARK is legal. A tile with four motif roles is not.
- Neighbor rule: orthogonal neighbors do not share the same MARK role. If the restricted set has only one non-ground role, the rule is waived and variety comes from mark identity instead.
- MIX controls mark entropy, not color entropy. Low MIX repeats a 2-mark rhythm (sunburst / crossed disc). High MIX draws uniformly from the 13 marks. Color assignment is a separate seeded walk that obeys the neighbor rule.

### Mark construction

All geometry is in tile-local units, tile size = 1, origin at center. Box limit is ±0.30 at DRIFT 0.

| Mark | Draw | Roles |
|---|---|---|
| Sunburst | Disc r=0.10. 12 rays, length 0.18, stroke 0.015, from r=0.12. Ray count is fixed so it reads as a sun, not a dial. | MARK disc, CUT rays |
| Pixel cluster | 4×4 cell grid inside ±0.22. One tetromino (I, O, T, L, S, or the skew) seeded, plus 0–2 orphan cells. Cells are axis-aligned, gap 0.02. | MARK cells |
| Slashed circle | Ring r=0.20, stroke 0.04. Diagonal bar from (−0.16,−0.16) to (0.16,0.16), stroke 0.045, round caps. Bar is a stroke, not a clip. | MARK ring, CUT bar |
| Squiggle | One cubic wave, 1.5 periods, amplitude 0.08, across y=0, stroke 0.05, round caps. Endpoints inside the box. | MARK stroke |
| Chevron | One or two V's, stroke 0.05, opening 0.28, point at center. Stack gap 0.08 if two. Seed picks count and up/down/left/right. | MARK stroke |
| Bolt | 6-vertex lightning polygon, filled, width 0.16, height 0.40, centered. Vertices are a fixed template, not a random walk, so it stays a bolt. | MARK fill |
| Interlock | Two rings r=0.14, centers at (−0.08,0) and (0.08,0), stroke 0.035. Vesica is the overlap, not a third shape. | MARK both rings, same role |
| Eye | Almond from two arcs, width 0.40, height 0.18. Triangle pupil, height 0.10, pointing up or down by seed. | MARK almond, CUT pupil |
| Knot | Circle r=0.16, stroke 0.03, plus a crosshair of two strokes through center, length 0.28, stroke 0.03. Not a Celtic weave. | MARK circle, CUT cross |
| Capsule | 3 stacked discs r=0.07, vertical, gap 0.02, or one pill (stadium) of height 0.36, width 0.16. Seed picks stack vs pill. | MARK fill |
| Slab | Parallelogram, width 0.36, height 0.22, shear 0.08. Optional second polygon offset by 0.04 in a second role, flat, no lighting. | MARK face, ACCENT offset |
| Arrows | 3 chevron heads in a row, gap 0.04, each width 0.12. Direction is the seeded pose. | MARK fill |
| Crossed disc | Filled disc r=0.18. X of two strokes, length 0.28, stroke 0.035, in the ground role so it knocks out. | MARK disc, CUT (ground) X |

Degenerate ban: stroke width never below 0.012 of tile size. A mark with zero area after rasterization at 64px is a failed seed, not a legal solid-block. GLYPH has no solid-block mark. Empty tiles are a bug.

### Motion

- DRIFT is a phase-offset scale pulse only. Phase = tile index in row-major order, one full wave across the grid.
- Scale = `1 + 0.2 * DRIFT * sin(phase + t)`. At DRIFT 100% the mark reaches 72% of tile size at the peak and 48% at the trough. Bounds stay inside the tile rect.
- No per-mark rotation over time. No glyph crossfade inside DRIFT. A glyph swap is SHUFFLE. If DROP is on, that swap lands on the bar.
- The grid itself does not pan. FIELD owns pan.

### Stage read

- Built for distance. At a 1920-wide frame and DENSITY default, a tile is ~384px. The mark must still read at a 64px tile (stage thumb, LED wall far seat).
- Stroke-only marks (squiggle, chevron, knot) use the minimum stroke above so they do not vanish at 64px.
- Filled marks (bolt, slab, capsule, crossed disc) are the distance anchors. MIX must not be able to assign a grid of only hairline marks. At least one filled mark per 8 tiles, seeded, even at high MIX. If the vocabulary draw comes up stroke-only past that quota, replace with bolt, slab, capsule, or crossed disc.

### GLYPH acceptance

- Default grid is 5×4. DENSITY scales both axes and preserves 5:4 within the clamps.
- Every tile has one mark from the 13. No empty tiles. No quilt motifs leaking in.
- At DRIFT 0, every mark's bounds are inside the 60% box, including caps.
- At DRIFT 100%, no mark pixel lies outside its tile rect.
- Per tile: at most 3 motif roles. Global: at most 6 roles, all from the active palette.
- Orthogonal neighbors do not share a MARK role unless the restricted set has one non-ground role.
- At least one filled mark per 8 tiles.
- Same SEED + params = identical assignment and identical frame at DRIFT 0.
- Pose is from {0, 90, 180, 270} plus the mark's authored diagonal. No other angles.

## Composition (FIELD)

- Grid of square tiles, default 6×6. DENSITY scales both axes.
- Each tile runs one micro-pattern, drawn seamless. Pattern functions are periodic in tile space, so edges wrap.
- No grout. Tiles butt-joint into a continuous field. The tile grid is invisible; only the micro-patterns read. GROUT is forced to 0 in this mode.
- Palette: full active palette allowed, but each tile uses at most 3 hues.
- Motion: slow infinite pan across the field. DRIFT controls speed. Direction is a seeded angle, stable for the seed. SHUFFLE re-seeds pattern assignment and does not interrupt the pan.

## Composition (ESCHER) — parked

Do not implement in v1. Recorded so the parked line cannot be re-litigated as forgetfulness.

- Base grid: SQUARE only, if it ever ships. HEX stays parked. Triangular stays parked.
- Master tile: base polygon, each edge replaced by a seeded bezier bump (BUMP amplitude, EDGE_SEED).
- v1-of-ESCHER symmetry is TRANSLATE only: opposite edges share a curve, one reversed. Gap-free by construction.
- ROTATE and REFLECT need an explicit edge-pairing table and a winding-order fill. They are a later cut. Pixel asserts at low resolution hide sliver gaps; do not ship them on faith.
- Fill: alternating figure/ground from two palette roles (FIGURE_GROUND). A third accent role may mark centers at low density.
- SHUFFLE re-rolls edge functions. DRIFT morphs bump control points (Metamorphosis). That morph is ESCHER's own motion, not QUILT's.
- Acceptance, when built: supersampled tile-boundary pixels contain zero ground-colored pixels inside the field; symmetry op round-trips (edge A complement equals edge B); same seed = identical tiling; fills palette-conformant.

## Palette behavior

Colors come only from the active KC-1 palette. PATTERN never invents hues. Roles: ground (darkest, grout + stripe grounds), brights (motif fills), accents (centers, dots). A 37-palette instrument already speaks this language. PATTERN just tiles it.

GLYPH further restricts to the 4–6 strongest roles. FIELD and QUILT may use the full active palette, with the per-tile cap of 3 hues on FIELD.

## Parameters (artist units, all MOD-routable)

| Param | Range | Default | Notes |
|---|---|---|---|
| MODE | QUILT / GLYPH / FIELD | QUILT | Track-level. ESCHER not in the enum until unparked. |
| DENSITY | 4–12 tiles | 8 (QUILT), 5×4 (GLYPH), 6 (FIELD) | Tiles across. GLYPH: cols = round(5 * DENSITY / 4), rows = DENSITY, clamped. |
| MIX | 0–100% | 55% | Motif entropy inside the current mode's vocabulary. |
| SEED | uint32 | stored integer | Project document persists it. SHUFFLE writes a new integer. "Random" is not a value. |
| GROUT | 0–8% of tile | 3% QUILT, 0 GLYPH, 0 FIELD | Fraction of tile size, not pixels. Resolution-independent. |
| HERO | 0–100% | 25% | QUILT only. Probability on the coarser lattice. Capped, no adjacency. Ignored in GLYPH and FIELD. |
| DRIFT | 0–100% | 20% | Intensifies the mode's own motion. Does not swap motifs. |
| DROP | off / on | off | Separate gate. When on, and BEAT is running, SHUFFLE quantizes to the bar. High DRIFT does not imply DROP. |

## Motion (never static — the house rule)

DRIFT means one thing per mode. It does not also mean hue cycle, motif morph, and beat swap.

- QUILT: slow per-tile rotation on pinwheels and medallions, phase-offset, so the field breathes rather than spins. Amount = DRIFT.
- GLYPH: phase-offset scale pulse across the grid. Amount = DRIFT. Scale `1 + 0.2 * DRIFT * sin(phase + t)`, peak 72% of tile, trough 48%, never leaves the tile rect. No rotation over time. Construction and the filled-mark quota are in Composition (GLYPH).
- FIELD: pan speed across the torus. Amount = DRIFT. Direction is seed-stable.
- Accent hue cycle is not DRIFT. It is a MATH tone op (HUE ROTATE) on the palette. PATTERN does not re-key color.
- Motif morph (diamond ↔ hexagon) is parked. No shape interpolator in v1.
- SHUFFLE re-seeds assignment inside the current mode. If DROP is on and BEAT is running, the reseed lands on the bar. The pattern drop is the product.

## Layer-system fit

- CONTENT track (KC-x). Rides the FX fold (TEAR across a quilt is the money shot) and MATH tone ops (HUE ROTATE re-keys the whole palette at once).
- Keep/favorite + taste: PATTERN renders are first-class keeps. The taste model learns motif/palette preference for free.
- Persistence: MODE, seed, and params in the project document like any other track.

## Performance

Tile motifs are flat shapes — 2D canvas or a single fragment shader, trivially 60fps on M-series at 4K. No atlas rebake on SHUFFLE (exclude from macro learn like other rebake params).

## Build order

1. FIELD. Ten periodic functions, each proven on a torus before any other mode shares the draw list.
2. QUILT. Same draw path, plus grout overlay, hero lattice, edge-bleed.
3. GLYPH. Separate draw list, centered, palette cap, no hero.
4. ESCHER stays parked.

## Acceptance (measurable)

- Renders every motif in the active mode across a seed sweep. No empty or degenerate tiles.
- Same SEED + params = pixel-identical frame at DRIFT 0 (seed stability). SEED is the stored integer, not a hidden RNG state.
- Every fill color sampled from the active palette (palette conformance — assert in eval). GLYPH uses at most 3 roles per tile and at most 6 globally.
- FIELD: right-edge samples equal left-edge samples, bottom equals top, at 1× and 2× tile size, difference 0 after rasterization. Ray burst included.
- QUILT: hero tiles do not overlap and do not touch. Count ≤ `floor(cols / 4)`. Grout color is the darkest role. Grout is an overlay.
- GLYPH: see Composition (GLYPH) acceptance. 5:4 grid, 60% box at DRIFT 0, tile rect at DRIFT 100%, ≤3 roles per tile, ≤6 global, neighbor MARK rule, ≥1 filled mark per 8 tiles, pose set locked.
- SHUFFLE latency < 100ms at 8×8 on M-series. No atlas.
- 60fps sustained with DRIFT at 100% (Perf HUD, on Matt's Mac, no SwiftShader).
- ESCHER asserts are not v1 gates.

## Out of scope (parked)

- ESCHER, including hex base grids, rotation symmetry, and reflection symmetry.
- Hex/triangle tile grids. Square tiles only. A hexagon drawn inside a square tile is in scope; a hex grid is not.
- Importing SVG motifs.
- Per-tile manual editing (that is a different instrument).
- Cross-motif shape morphs.
- Pixel grout. Grout is a fraction of tile size.

## LOIS pass (9-rule lens)

1. **Be noticed:** a full-bleed quilt needs no introduction — biggest pattern wins, no thumbnail timidity.
2. **Be simple:** three modes, eight knobs, ten motifs per mode. If it needs a manual, it's wrong.
3. **Be honest:** flat color, hard edges — no fake texture, no bevel lies. Gap-free means gap-free, not antialiased.
4. **Know the product:** it's wallpaper that performs — the SHUFFLE is the product, not the tile.
5. **Command:** SHUFFLE is a stage button, not a menu item. One tap. DROP quantizes it to the beat. DRIFT does not sneak a second button in.
6. **Poetry in the ordinary:** grout lines — the negative space is doing half the work. Respect it. In FIELD, the grout is gone on purpose; the wrap is the negative space.
7. **Disobey:** every VJ tool does particles and noise. Nobody does the quilt. Good.
8. **Team:** palette does the color, BEAT does the timing, taste does the learning — PATTERN does none of their jobs.
9. **Take the risk:** ship square tiles only. The hex-grid version is fear dressed as completeness. ESCHER is the same fear with a better name. Park it.
