# STAGING REPORT — #1795 PATTERN PICTURE

Branch `feat/pattern-picture` (from origin/main `50992226`). Local commits only — not pushed, no PR.
Issue: "PATTERN: picture pattern — an image sampled into a grid of shapes (roadmap)".

## What was built, in plain language

A seventh PATTERN mode, **PICTURE**, beside QUILT / GLYPH / FIELD / TIDES / REWRITE / BLOCKS. It turns a
picture into the pattern: the image is sampled into a grid of cells, and each cell is drawn as one bold
mark whose **size, turn and colour come from that part of the picture** — bright areas get big marks,
dark areas get small ones, each cell's colour is the nearest colour in the active palette. It works out
of the box on a bundled seed picture (Matt's about portrait, baked into a small data grid), and the frame
path accepts an imported still's pixels the same way. It moves like GLYPH does: DRIFT pulses the marks,
and the per-element kinemes (spin / rock / pulse / blink / bob) ride individual cells. Everything else —
density controls, SHUFFLE, the DROP bar gate — is the existing machinery, untouched.

## The design calls, as implemented

Matt's three rulings on the issue (his comment on #1795, 2026-11-05), implemented as ruled:

1. **Source image: imported stills only + bundled seed; no live stage-frame recursion.** An image is
   data — `{ id, w, h, rgb }` (w·h·3 bytes) — threaded as an optional argument through
   `patternSource.frame()` / `patternPixels()` / `patternBytesGL()` / `patternKey()`; every other mode
   ignores it, and with no image the mode samples the bundled seed (`src/pattern/pictureSeed.js`: the
   repo's own `src/assets/about-matt-ciaglia.jpg`, centre-cropped to 4:3, downsampled to 64×48 RGB,
   committed as data; generator recipe kept at `app/scripts/gen-picture-seed.py`). The image's `id`
   enters the frame cache keys for PICTURE only, so other modes' keys are byte-identical to before.
   Nothing was added to the pattern block: it still has exactly its eleven fields (pinned by
   patternTrack.selfcheck), and the image is a frame input the way the palette is.
2. **Tone mapping: full.** The cell's tone (luminance of its mean colour) drives SCALE first — linear,
   0.30 of the mark box at black to 1.25 at white (bright = mass, on the palette's dark ground) —
   ROTATION as a quarter-turn pose read off the tone's quarter band, turned by a seed offset — and
   COLOUR snapped to the active palette: MARK = the pool swatch nearest the cell's mean colour, CUT =
   nearest of the rest, ACCENT = nearest of what remains, on GLYPH's restricted role set
   (`glyphRoles`). Every painted colour is an exact palette string; the mode never invents a hue.
3. **Cell geometry: the existing controls.** Square cells filling the frame, `cols = 2 × DENSITY`
   (TIDES' / BLOCKS' mapping), DENSITY default 10 → 20 across; no new grid UI.

### Two calls the builder had to make (flagged, not silent)

- **The shape pool is GLYPH's thirteen constructed marks, not the stage asset pool.** The issue says
  "a shape from the asset pool", but the stage pool's assets are SVG strings baked to GL sprites for
  the stage renderer; they cannot enter the pure CPU Uint32 raster that patternSource, the worker,
  stills, exports and the selfchecks all share, and baking a second mask pipeline would be exactly
  the parallel system the brief forbids. Inside PATTERN, the rasterizable shape pool is GLYPH's marks
  (#1041) — so PICTURE composes those, and the picture decides how they are dealt. Rotation follows
  GLYPH's rail for the same reason (seeded static poses in quarter turns); continuous turning is the
  kinemes' job, and PICTURE rides those per cell. If Matt wants the stage pool here, that is a
  mask-baking project of its own, not a flag in this PR.
- **No in-app image-import UI.** There is no existing rail that persists an imported image into a
  project (the pattern block's shape is pinned at eleven fields), so this PR builds the complete
  engine seam — the frame call takes the image — plus the editor mode chip so the mode works on the
  bundled seed. A file-picker that decodes a still into `{ id, w, h, rgb }` and holds it with the
  track is follow-up work that needs its own storage decision; it was not invented here.

### Registration choices (sibling precedent)

- **Not in `PATTERN_DEAL_MODES`** — hand-picked only, like TIDES / REWRITE / BLOCKS, so every existing
  seeded KIN / CURATOR deal and replay deals exactly what it always did (proven in the suite: 400
  seeded deals never return PICTURE, and the deal pool is still exactly QUILT / GLYPH / FIELD).
- **Not field-like** — PICTURE has discrete elements (cells with marks), so KIN / MOVERS stay live in
  the editor and in the frame path (`pictureMoverMap` is GLYPH's mover map, cell for cell).
- **MIX** is mark entropy in GLYPH's sense: low MIX keeps one seeded hero mark across the whole
  picture; high MIX draws each cell's mark freely. Default MIX 0.55, the family default.
- **Cost tier declared at registration**: `registerCostTier('pattern/picture', { tier: 0, timeMs: 25 })`
  in `picture.js`, the sibling form. Measured in the suite: a moving 1000×700 frame, median of 30 =
  **6.73 ms** in this sandbox.
- **Ground sampler (#1183)** wired like BLOCKS: `pictureCellAt` — a cell's main colour is its snapped
  MARK colour, so marks resting on a PICTURE ground lean toward the picture's colour at that cell.
  The ground channel has no image argument, so it reads the bundled seed picture (the mode's default).

## Files touched

New:
- `app/src/pattern/picture.js` — the mode: sampler, assignment, fast + reference rasters, mover map, ground cell, cost registration.
- `app/src/pattern/pictureSeed.js` — the bundled seed picture as committed data (generated, see above).
- `app/src/pattern/picture.selfcheck.mjs` — the new suite (14 checks), registered in `app/selfcheck.manifest`.
- `app/scripts/gen-picture-seed.py` — the seed bake's recorded recipe (authoring-time only, PIL).
- `app/e2e/pattern-picture.spec.js` — the mode driven through the real UI (modelled on pattern-blocks).

Wired:
- `app/src/state/patternTrack.js` — PICTURE in `PATTERN_MODES`, density/MIX defaults; deal pool untouched.
- `app/src/pattern/patternSource.js` — the image argument, grid build, still + moving dispatch, mover map, PICTURE-only key extension.
- `app/src/pattern/ground.js` — gridFor + patternGround branches for PICTURE.
- `app/src/panels/build/PatternEditor.jsx` — mode hint, MIX and DRIFT hint text (chips render from `PATTERN_MODES`; kin/movers rows stay live because the mode is not field-like).
- `docs/PATTERN_SPEC.md` — Modes list entry, Composition (PICTURE) section, Parameters table, Motion bullet.

## Re-pins (each one is the registration being real, in the sibling style)

- `app/src/state/patternTrack.selfcheck.mjs` — `PATTERN_DEFAULT_DENSITY` deep-equal gains `PICTURE: 10`.
- `app/src/panels/build/patternEditor.selfcheck.mjs` — the offered-modes list gains PICTURE.
- `app/src/pattern/patternRender.selfcheck.mjs` — both mode sweeps (node-side every-mode frame proof, and the GL rendered-frame proof) gain PICTURE.
- `app/src/pattern/rasterFast.selfcheck.mjs` — the reference-path sweep gains a PICTURE branch (fresh-built grid + reference raster + mover map) and PICTURE in its mode list.
- `app/e2e/pattern-track.spec.js` — the live-loop survival sweep gains PICTURE.

NOT re-pinned, deliberately: `PATTERN_DEAL_MODES` (still exactly QUILT / GLYPH / FIELD — asserted in
the new suite), the pattern block's eleven keys, `PATTERN_FIELD_LIKE`, and the density/mix stop tables
in `blockStops.mjs` (PICTURE's defaults — density 10, mix 0.55 — are already stops).

## Suites, with real counts

Decisive suites run directly by file (after the final prettier pass):
- `picture.selfcheck` — **14 checks passed** (registration + deal pool, cost tier, seed image, sampler,
  tone→scale, tone→rotation, palette snap incl. a pixel-level palette audit, pool sourcing, replay law
  incl. image-in-key, fast == reference pixel-for-pixel incl. kineme movers, kineme rails, the picture
  reads (bright cells paint > 1.5× the mark pixels of dark cells), ground agreement, cost budget).
- `patternTrack.selfcheck` — 17 passed · `patternEditor.selfcheck` — 6 passed · `rasterFast.selfcheck`
  — 8 passed · `patternRender.selfcheck` — 22 passed (includes the headless-Chromium GL proof for
  PICTURE) · `tides` 12 · `blocks` 12 · `glyph` 30 · `patternRoll` 7 — all passed.

Full manifest sweep (continue-on-error over all 605 commands in `app/selfcheck.manifest`):
**602 passed, 3 failed** — and all three failures are sandbox-environment, proven base-identical on a
clean origin/main (`50992226`) worktree:
- `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` — fails with "cargo not found on PATH" (no Rust
  toolchain in this sandbox). Identical on clean main.
- `src/fx/rollSafety.selfcheck.mjs` — headless Chromium "Target crashed" inside the GL parity driver
  after all node-side checks pass. Identical on clean main.
- `src/gl/accum.selfcheck.mjs` — Node heap OOM (~2 GB) in the GPU probe section. Identical on clean
  main (same OOM, same native stack).

`npm run format:check`: **passes on the whole tree** ("All matched files use Prettier code style") —
prettier --write was run on the six touched files that needed it; no unrelated file was reformatted
(the spec doc's new sections follow its existing style). `npm run lint`: exit 0 — 0 errors, 11 warnings,
all pre-existing in files this build never touched (App.jsx, FavoritesTray, ShelfView, DataExportRow,
LootRow); the build's files are warning-free. The new e2e spec loads and lists under Playwright
(not run here — e2e runs in CI).
