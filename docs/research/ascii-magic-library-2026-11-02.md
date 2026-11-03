# ASCII Magic — animated ASCII art library (loot / research)

Filed 2026-11-02. Source: an Instagram reel by @animmaster_studio (frontend-animation
account, posted 2026-11-02) touring a site titled "Animated ASCII art library"; the
reel gates its link behind a comment ("LIB"). Identification as ASCII Magic is by
feature match — site title, a Landscapes category, per-piece player + an Export tab
showing the generating JavaScript — high confidence, not confirmed through the
gated link.

## What it is

- **Library:** https://www.ascii-magic.com/ascii — 734 animated ASCII pieces in 24
  categories (landscapes, cities, 3D shapes, loaders, games, charts…), MIT licensed.
- **Repo:** https://github.com/kailashsr38/ascii-magic-art — `npx ascii-magic-art`
  browses/plays the catalog in a terminal; `npm install ascii-magic-art` for code use.
- **Shape of a piece:** one small dependency-free ES module exporting `meta` and a
  `create()` that returns `draw(t)` — a function from seconds to a frame of text,
  with an optional colour layer keyed into `meta.palette`. Pieces can be redrawn in
  other looks (halftone dots, classic ASCII, numbers, binary, blocks) with size and
  density controls.
- **Surfaces:** a `<ascii-art piece="…">` web component (one script tag, plays only
  while on screen, holds a still for reduced-motion), terminal playback, and exports
  to GIF, 1080p/4K video, and PNG wallpaper.

## Why it's filed (KC-1 relevance)

- Character-grid imagery is FIELD's neighbourhood: KC-1's FIELD letters are baked
  `typ_*` stamps rendered onto the dish, so this is **reference, not a drop-in** —
  the 2026-10-31 font ruling stands (baked stamps, no live text runtime). Nothing
  here proposes changing that.
- The transferable thinking: a whole scene family expressed as deterministic
  `draw(t)` frame functions over a character grid, with the *look* (charset,
  density, palette) factored out of the *scene*. If an ASCII-texture Look or a
  glyph-density content source is ever designed, this catalog is the first place
  to study how far the idiom stretches — reflections, landscapes, 3D forms.
- Also a nice terminal toy in its own right for the Mac: `npx ascii-magic-art`.

## Verdict

Loot-grade reference. No issue filed; pull it into a design pass only if a
text-grid Look ever enters scope.
