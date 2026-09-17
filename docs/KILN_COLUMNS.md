# KILN COLUMNS — preset & palette notes (#179)

A shippable preset recreating the reference aesthetic (stacked lathe-like
organic segments, per-segment color drift, dusty matte palette) using only
existing systems. No engine changes, no new assets, no new layout modes.

## Palette — `kiln-columns` (catalog, `app/src/data/palettes.js`)

Sampled from the reference via median-cut quantization:

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#7496a1` | dusty teal |
| 2 | `#4d7182` | slate blue-gray |
| 3 | `#d9d4d3` | cream / off-white |
| 4 | `#224655` | deep navy (anchor) |
| 5 | `#a27a84` | dusty rose |
| 6 | `#e95f63` | ember coral (reference's lower-ground accent) |

Ground (`bg`): `#a27a84` dusty rose. Catalog ink: `#224655`.

**Catalog vs user library:** the issue draft said "user palette", but the
studio export path (`studio/render.mjs`) resolves palettes through
`resolvePalette(id, overrides)` with no user-library `extra` — a
localStorage-only palette would silently fall back to praystation on export.
The catalog is the shippable home; the palette stays exportable and
round-trips through project JSON.

## Preset — `KILN COLUMNS` (`app/src/data/presets.js`, group `classic`)

- **mode:** `rails` — 6 fixed vertical rails, items spread along the height.
  This is the columnar structure; no vertical-bias hack needed.
- **paletteShift:** `zone` (tried `band` — it striped horizontally because
  `t` tracks height in rails mode; `zone` beats against the 6-rail cycle and
  drifts color per segment, matching the reference).
- **assets:** `organic` category only; the reference project enables the 12
  round ones (5 blobs, 2 blob outlines/dotted, 2 drops, kidney, lobe).
  Petals/leaves/pods off.
- **params:** `count: 520, scale: [0.8, 2.0], rotate: [-14, 14],
  alpha: [45, 85], zTiers: 4, jitter: 26, density: 110, bleed: false,
  recolor: true, mirror: false, overlap: true, blendMode: 'soft-light',
  lifeDrift: 0.04, displacement: 0, behave: 'cruise'`
  (`count` is the "steps" control — more shapes per rail = finer,
  more continuous columns. Quality caps apply: 520 honored at high,
  420 at balanced.)
- **Evolve/audio:** off — `lifeDrift: 0.04` (near-still), no audio params set.

## The last 10%: layer blend

The preset system only writes `layoutParams`, so per-item `soft-light` is
the closest it can express — that renders glassier/pastel. The reference's
dusty matte melt comes from **layer-level** `soft-light` (one click on the
layer's BLEND control, or `layerBlendMode: 'soft-light'` in project JSON).
The preset's description says so; the deliverable project below uses it.

## Deliverable

- `docs/kiln-columns-final.png` — RENDER FINAL, 980×1470 portrait.
- `docs/kiln-columns-project.json` — the exact project (seed **7**).

Portrait note: the engine's placement space is fixed 1000×700 (frozen), so
the portrait is a 2:3 center crop of the 2100px-wide high-res render —
towering columns, no re-composition. Regenerate with:
`node studio/render.mjs docs/kiln-columns-project.json --out kiln.svg`.

## Verification

- `npm run lint` — clean.
- `npm run selfcheck` — 23 suites OK (incl. `palettes.selfcheck`).
- `npm run build` — passes.
- **band vs zone:** rendered both; zone kept (see above).
- **Davis LFO color check:** `--ramp hueRotate=0:180` at progress 0/0.5/1 —
  100% of sampled pixels geometry-stable, ~75% color-shifted. The preset
  cycles color without disturbing the still composition.
- **Round-trip:** project JSON → save → reload → render is pixel-identical
  for the same seed.
- **Seed stability:** seeds 7 and 21 both read as stacked melting columns;
  the look is not seed-lucky.
