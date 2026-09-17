# VORTEX RWB — preset & palette notes (#178)

A shippable preset recreating the reference aesthetic (kaleidoscopic vortex
of red/white/blue striped ribbons warped by a flow field — concentric wavy
bands radiating from a tight central spiral, on white) using only existing
systems. No engine changes, no new assets, no new layout modes.

## Where the brief was followed — and where iteration overruled it

The issue brief said *mode: Perlin Flow, stripe/line assets weighted HIGH*.
Both were tried and rejected on visual evidence (15 iterate/render cycles):

- The engine's `flow` sampler is a horizontal sine-wave band, not a Perlin
  flow field — it cannot produce a vortex or a tight central spiral.
  The Perlin-flow *warp* the brief wanted is present as `displacement`
  (fBm noise, `displacement: 130`, `noiseFreq: 0.006`).
- Thin line/stripe assets at any rotation produced spaghetti or confetti,
  never the reference's thick continuous ribbons. Dense overlapping soft
  blobs, painted by `paletteShift: 'band'`, marble into continuous wavy
  bands — that is what evokes the reference.
- `mode: 'fibonacci'` won over `radial`: the phi-spiral distribution gives
  the tight dense center and, with `band` coloring, concentric RWB rings.
  `mirror: true` supplies the kaleidoscopic symmetry.

## Palette — `vortex-rwb` (catalog, `app/src/data/palettes.js`)

Sampled from the reference via median-cut quantization (center-cropped to
dodge the AI-smudge corner artifacts) plus strongest-pixel sampling for the
saturated reds/blues:

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#da4a5b` | crimson red (ribbon) |
| 2 | `#f2f3f8` | off-white ground / ribbon separator |
| 3 | `#4595f0` | medium blue (ribbon) |
| 4 | `#f2f3f8` | off-white (repeat — doubles the band rhythm) |
| 5 | `#da4a5b` | crimson red (repeat — ribbons stay consistent) |

Ground (`bg`): `#f2f3f8` off-white. Catalog ink: `#8c1f2e`.

**Catalog vs user library:** same reasoning as KILN COLUMNS — the studio
export path resolves palettes through `resolvePalette(id)` with no
user-library `extra`, so the catalog is the shippable home; the palette
stays exportable and round-trips through project JSON.

## Preset — `VORTEX RWB` (`app/src/data/presets.js`, group `classic`)

- **mode:** `fibonacci` — phi-spiral placement gives the tight dense center;
  `band` coloring paints it as concentric RWB rings (center→edge: red,
  white, blue, white, red).
- **assets:** `organic` category, effectively the three clean soft blobs
  (`org_blob_01/02/03` — no accent dots baked in). Dense overlap marbles
  them into continuous ribbon bands. See the deliverable project JSON for
  the exact `enabledAssets` map.
- **params:** `count: 640, scale: [1.3, 2.2], rotate: [0, 0],
  alpha: [80, 100], zTiers: 3, jitter: 18, density: 100, bleed: true,
  recolor: true, mirror: true, overlap: true, blendMode: 'normal',
  lifeDrift: 0.04, displacement: 130, noiseFreq: 0.006, behave: 'cruise'`
  (count 640 honored at high/final; quality caps step it down at balanced —
  bands stay continuous at all tiers, verified at balanced 360 and
  uncapped 640.)
- **Evolve/audio:** off — `lifeDrift: 0.04` (near-still), no audio params set.

## Deliverable

- `docs/vortex-rwb-final.png` — RENDER FINAL, 2100×1470, seed **21**.
- `docs/vortex-rwb-project.json` — the exact project (seed **21**).

Regenerate with:
`node app/src/gl/exportStill.mjs docs/vortex-rwb-project.json --out out.png --res 2100x1470 --uncapped`.

## Verification

- `npm run lint` — clean.
- `npm run selfcheck` — all suites OK (incl. `palettes.selfcheck`).
- `npm run build` — passes.
- **Round-trip:** project JSON → render is byte-identical for the same
  seed (verified by re-render hash match).
- **Seed stability:** seeds 3, 7, 11, 21, 42 all read as a wavy RWB
  ribbon vortex; 21 chosen for the most even band warp. The look is not
  seed-lucky.
- **Quality scaling:** rendered at balanced (360 mirrored) and uncapped
  (640) — bands stay continuous in both.

## Honest assessment

Evokes the reference's *feel* — flowing ribbon vortex, tight dense center,
RWB bands on white, mirrored symmetry. Notable gaps: the engine's
5-slot band cycle gives 5 wide bands where the reference has ~7 thinner
ones, and the center is a solid red core rather than a tight spiral of
interleaved threads (no per-radius asset control exists in the preset
system). Both are documented limits, not bugs.
