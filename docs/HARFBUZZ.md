# HarfBuzz — deferred

*Not an implement ticket. Not spine. Not a system chip.*

Letters as assets, after the body exists. Same DLC contract as `dlc/pack-01-the-cuts`.

See also: [TWO_PLANES](TWO_PLANES.md), [path/06-library](path/06-library.md), [SHELL_BRAND](SHELL_BRAND.md).

## Verdict

HarfBuzz is the right engine **if** a string is DNA. It is the wrong engine for moths. Do not load `hb.wasm` in `liveLoop.mjs`. Do not add a TYPE system.

Latin A–Z plates do not need it. Arabic / Devanagari / marks do.

## What shaping is

Unicode run + font → glyph IDs + advances + offsets. Ligatures, contextual forms, mark attach. Not line-break, not raster, not hinting.

Web: `harfbuzzjs` v1.x (HarfBuzz 14, WASM, `font.glyphToPath(gid)` → SVG). `three-text` wraps HB + hyphenation + tessellation — **do not import**. `libharfbuzz-gpu` (Slug) is experimental; ignore.

## Honest pipeline (when we bother)

```text
Studio only:
  string + subset face
  → harfbuzzjs.shape()
  → unique gids → glyphToPath → existing SVG ingest
  → comboKey bake (needs spine B skip-missing)
  → flock / grid / HYPE as usual

Perform:
  plays those assets. No WASM on the loop.
  New string = new wipe on the downbeat, not a per-frame reshape.
```

Atlas key stays `asset|ink|accent`. Optional later: `face|gid|wght` as the asset id.

## Cost

- Font bytes are tape. Subset with `hb-subset`.
- New string → missing cells → hitch unless B has landed.
- `"NIGHT"` → `"MIGRATION"` is a new gid list. Do not morph placement identity.
- SNAP / golden hashes stay on pre-baked plates. Live-shaped strings are live-only.

Shape on **arm**, bake, wipe. Never `shape()` on LIFE or every frame.

## Pack shape (Letterpress, later)

1. One or two licensed faces, subset.
2. Studio field: type a line → write overlay SVGs into the project.
3. Perform show slots hold those assets.
4. Optional: reshape when MIX starts (`startBeat`), never mid-wipe.

Latin-only first pack can skip HB and ship Illustrator outlines.

## Do not

- `hb.wasm` in the live loop or Perform plane.
- `three-text` / Rive / GSAP SplitText as a second renderer.
- TYPE chip that is grid + Arial.
- HarfBuzz-in-the-font WASM shapers.
- Kinetic chrome (BPM / TAPE FULL stay tabular).
- Start this while #387 is open.

## Unblock list (all must be true)

- Spine B present (skip missing cell).
- Spine E + T1 (wipe on the downbeat).
- Studio plane exists so WASM stays off Perform.
- Matt wants a letter pack, not a title card in AE.
