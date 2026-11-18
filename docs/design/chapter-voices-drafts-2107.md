# Chapter voices — drafts for techno, pixel and organic (#2107)

Status: **drafts for Matt's yes.** Nothing is wired. Ruled 2026-11-18 on #2107: Claude drafts the voices the three new chapters still need to reach the deck floor of **8 voices**. Matt's word lifts the authoring freeze for these voices only.

Why organic gets 6, not 3: `voiceDeck.selfcheck` requires every style Look group to have **at least six family voices** with no two sharing a mode + motion. Organic's five existing voices are promoted, not family voices, so it needs six family voices of its own once it has looks.

| Style | Voices today | Drafted | Total |
|---|---|---|---|
| Techno | 2 (`dark-glass`, `noise`) | 6 | 8 |
| Pixel | 1 (`abacus`) | 7 | 8 |
| Organic | 5 (`flow`, `ca`, `dla`, `eden`, `voronoi-cells`) | 6 | 11 |

They are **family voices**, the same compact form as the eight style families already in `data/voiceDeck.js` (`VARIANTS`). One row is `[id, title, vibe, mode, motion, palette, count, trail, cost tier]`, and the wardrobe is drawn from the style's own assets the way every family's is. Landing them also gives each of the three Canon styles a voice `pairing`, which sets the asset categories its wardrobe draws from:
- techno → `geometric`, `scanlines`, `stamps`
- pixel → `stamps`, `dots`
- organic → `organic`, `biosynthetic`

Every id is checked unique against the current 72 voices. Only existing modes, motions (`still · drift · flow · flock · orbit · scatter · mold`) and palettes are used.

## Techno: the readout as ornament

| Voice | Mode · motion | Palette | Count | Trail | Tier | Vibe |
|---|---|---|---|---|---|---|
| **Telemetry** (`telemetry`) | rails · flow | TRANSIT | 300 | off | light | Numbers stream past in strict lanes: the dashboard reading itself out loud. |
| **Cockpit** (`cockpit`) | grid · still | TRANSIT | 220 | off | light | Brackets and needles locked to the grid, ticking over while nothing moves. |
| **Sleeve** (`sleeve`) | stratified · still | TRANSIT | 360 | off | light | The back of a record sleeve: icons stacked to the edge, not one wasted inch. |
| **Warehouse** (`warehouse`) | radial · orbit | GLITCH | 240 | short (4f) | medium | Marks circle the floor at a steady tempo, lit for a moment and gone. |
| **Carrier Wave** (`carrier`) | flow · drift | GLITCH | 280 | off | light | The signal before the message: a sweep across the field, again and again. |
| **Test Card** (`test-card`) | circlepack · still | TRANSIT | 120 | off | light | The calibration chart: every shape in its box, waiting for the broadcast. |

## Pixel: the counted square

| Voice | Mode · motion | Palette | Count | Trail | Tier | Vibe |
|---|---|---|---|---|---|---|
| **Sprite Sheet** (`sprite-sheet`) | grid · still | GLITCH | 200 | off | light | Every frame of the walk laid out in rows, square for square. |
| **Bit Rot** (`bit-rot`) | random · drift | COMPRESSION | 260 | off | light | Blocks slip a row at a time, the file going soft at the edges. |
| **Scanline** (`scanline`) | stratified · flow | GLITCH | 300 | off | light | The CRT pass: squares lit in bands, top to bottom, forever. |
| **Macroblock** (`macroblock`) | gaussian · drift | COMPRESSION | 180 | short (4f) | medium | The keyframe missed: big blocks smear where the motion should be. |
| **Pixel Swarm** (`pixel-swarm`) | random · flock | GLITCH | 220 | off | medium | A flock drawn at 16 × 16: every bird a counted square. |
| **Save Point** (`save-point`) | poisson · still | GLITCH | 40 | off | light | A few bright pixels, far apart, holding still until you come back. |
| **Game of Life** (`game-of-life`) | ca · still | COMPRESSION | 300 | off | light | Squares born and dying by four rules on the grid. |

## Organic: grown, not drawn

| Voice | Mode · motion | Palette | Count | Trail | Tier | Vibe |
|---|---|---|---|---|---|---|
| **Hyphae** (`hyphae`) | colonize · still | GROWN | 160 | off | light | Threads under the soil, reaching food by the shortest living route. |
| **Tide Pool** (`tide-pool`) | poisson · drift | TIDEPOOL | 90 | off | light | Blobs drift in a shallow pool, bumping and settling. |
| **Slime Mould** (`slime-mould`) | random · mold | GROWN | 200 | long (8f) | medium | The forager that maps a city: marks crawl toward food and leave a trail. |
| **Lichen** (`lichen`) | eden · still | GROWN | 140 | off | light | Slow crusts spreading across stone, a millimetre a year. |
| **Kelp Bed** (`kelp-bed`) | flow · flow | TIDEPOOL | 120 | off | light | Fronds leaning together in one long current. |
| **Spore Cloud** (`spore-cloud`) | gaussian · scatter | GROWN | 220 | short (4f) | medium | A puff of spores scatters, settles, and begins again. |

## Rows (exact, ready to paste into `VARIANTS`)

```js
  techno: [
    ['telemetry', 'Telemetry', 'Numbers stream past in strict lanes: the dashboard reading itself out loud.', 'rails', 'flow', 'transit', 300, ACCUM_OFF, 'light'],
    ['cockpit', 'Cockpit', 'Brackets and needles locked to the grid, ticking over while nothing moves.', 'grid', 'still', 'transit', 220, ACCUM_OFF, 'light'],
    ['sleeve', 'Sleeve', 'The back of a record sleeve: icons stacked to the edge, not one wasted inch.', 'stratified', 'still', 'transit', 360, ACCUM_OFF, 'light'],
    ['warehouse', 'Warehouse', 'Marks circle the floor at a steady tempo, lit for a moment and gone.', 'radial', 'orbit', 'glitch', 240, accum(4, 0.05), 'medium'],
    ['carrier', 'Carrier Wave', 'The signal before the message: a sweep across the field, again and again.', 'flow', 'drift', 'glitch', 280, ACCUM_OFF, 'light'],
    ['test-card', 'Test Card', 'The calibration chart: every shape in its box, waiting for the broadcast.', 'circlepack', 'still', 'transit', 120, ACCUM_OFF, 'light'],
  ],
  pixel: [
    ['sprite-sheet', 'Sprite Sheet', 'Every frame of the walk laid out in rows, square for square.', 'grid', 'still', 'glitch', 200, ACCUM_OFF, 'light'],
    ['bit-rot', 'Bit Rot', 'Blocks slip a row at a time, the file going soft at the edges.', 'random', 'drift', 'persona-menkman', 260, ACCUM_OFF, 'light'],
    ['scanline', 'Scanline', 'The CRT pass: squares lit in bands, top to bottom, forever.', 'stratified', 'flow', 'glitch', 300, ACCUM_OFF, 'light'],
    ['macroblock', 'Macroblock', 'The keyframe missed: big blocks smear where the motion should be.', 'gaussian', 'drift', 'persona-menkman', 180, accum(4, 0.05), 'medium'],
    ['pixel-swarm', 'Pixel Swarm', 'A flock drawn at 16 by 16: every bird a counted square.', 'random', 'flock', 'glitch', 220, ACCUM_OFF, 'medium'],
    ['save-point', 'Save Point', 'A few bright pixels, far apart, holding still until you come back.', 'poisson', 'still', 'glitch', 40, ACCUM_OFF, 'light'],
    ['game-of-life', 'Game of Life', 'Squares born and dying by four rules on the grid.', 'ca', 'still', 'persona-menkman', 300, ACCUM_OFF, 'light'],
  ],
  organic: [
    ['hyphae', 'Hyphae', 'Threads under the soil, reaching food by the shortest living route.', 'colonize', 'still', 'persona-oxman', 160, ACCUM_OFF, 'light'],
    ['tide-pool', 'Tide Pool', 'Blobs drift in a shallow pool, bumping and settling.', 'poisson', 'drift', 'tidepool', 90, ACCUM_OFF, 'light'],
    ['slime-mould', 'Slime Mould', 'The forager that maps a city: marks crawl toward food and leave a trail.', 'random', 'mold', 'persona-oxman', 200, accum(8, 0.04), 'medium'],
    ['lichen', 'Lichen', 'Slow crusts spreading across stone, a millimetre a year.', 'eden', 'still', 'persona-oxman', 140, ACCUM_OFF, 'light'],
    ['kelp-bed', 'Kelp Bed', 'Fronds leaning together in one long current.', 'flow', 'flow', 'tidepool', 120, ACCUM_OFF, 'light'],
    ['spore-cloud', 'Spore Cloud', 'A puff of spores scatters, settles, and begins again.', 'gaussian', 'scatter', 'persona-oxman', 220, accum(4, 0.05), 'medium'],
  ],
```

## What landing them takes (after the yes)

- Add the rows and the three `pairing` lists. The voice deck grows 72 → 91, so the voice-deck hash pins re-pin (`canonMotion`, `canonSettings`), and so do the deck counts (`kineticScope`, chapters `now`).
- The creature dice deal a Voice gene from the deck the way they deal a Look. The new voices stay off those dice (the #2107 looks precedent), so every seeded creature keeps its voice.
- Looks and voices land in **one** PR: the looks can't land alone, because the same guard fails any style Look group without its six family voices. Re-pins also include the FIELD review census (`fieldReview*`, which samples every look).
- Then the chapter entries (#2107's original ask): Organic after Bauhaus, Pixel after Memphis, Techno after Grunge.
