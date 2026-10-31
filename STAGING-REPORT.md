# STAGING REPORT — #1798 Loot: merged-cell blocks (Colour Block) → PATTERN BLOCKS mode

**Branch:** `feat/1798-merged-cell-blocks` off `origin/main` (9deca870). Local only — no push, no PR (coordinator publishes). Review lane: Matt judges feel and merges.

## What shipped

A fifth PATTERN mode, **BLOCKS**, built as a peer of TIDES (#1797, the sibling loot mode from the same artist): `app/src/pattern/blocks.js` (pure engine) + registration in `state/patternTrack.js`, `pattern/patternSource.js`, `pattern/ground.js`, a mode hint + honest disabled DRIFT in `panels/build/PatternEditor.jsx`, a Composition (BLOCKS) section in `docs/PATTERN_SPEC.md`, a new selfcheck (12 checks), a new e2e spec, and two coverage extensions (patternRender, rasterFast).

The generator, per the issue's two moves:

1. **Merge before you colour.** A seeded pass walks the grid row-major; at each free cell a MIX appetite draw decides whether a merge is attempted; attempts place a drawn polyomino over the anchor and keep the first that fits. Vocabulary is the reference's: single, bars 2–4, 2×2 square, L tromino, L tetromino, T tetromino, plus pentomino (all rotations generated, none hand-listed).
2. **Colour once per block.** One flat colour per merged block from the palette's non-ground swatches. Greedy in deal order + a bounded repair pass: touching blocks never share a colour unless the block's neighbours already use the whole pool (the selfcheck proves that structural claim, not a fuzzy rate).
3. **The series is the same generator re-dealt.** Nothing changes but the seed; SHUFFLE is the mode's motion. A deal is a still.

Grid: cols = 2 × DENSITY (default density 10 → 20 across, TIDES' mapping), rows fill the frame. Gaps: every block is inset 0.085 of a cell on each side facing another block or the frame edge, outer corners rounded at 0.24 of a cell — squircle blocks on a ground lattice. Ground sampler (#1183) support included: marks lean toward the block colour under them.

## Design choices (all Matt-overruleable)

1. **A new mode, not a QUILT merge pass.** The issue says "most naturally QUILT", but QUILT's atom is the motif tile (3 hues, heroes, grout, rotation); BLOCKS' atom is a flat merged block. TIDES set the precedent that a Karlen loot with a different atom ships as its own mode beside QUILT. Mode id `BLOCKS`; the spec section carries the reference's name ("Colour Block").
2. **Colour rails = QUILT's `paletteRoles`, not the GLYPH/TIDES weight-ranked pool.** First cut rode `glyphRoles`; its top-6-by-weight cut left the lattice **purple** on the factory palette (the near-black ranked out). The reference lattice is black and its palette is wide, so BLOCKS takes ground = the palette's darkest swatch and pool = all other swatches. (The purple-lattice renders from the first cut were regenerated; the shipped screenshots are the black-lattice ones.)
3. **MIX = merge appetite** (per-anchor probability of attempting a merge). MIX 0 is exactly the plain per-cell grid — the honest "before" picture from the same generator; mean block size grows monotonically with MIX (measured across seeds: 1.00 @ 0, >1.1 @ 0.25, ~1.8 @ 0.55, ~2.35 @ 1.0).
4. **The gap is the mode's own constant; the track GROUT is not read.** Matches TIDES (its gutter is internal, `TIDES_FILL`). Making GROUT live for BLOCKS is a small follow-up if Matt wants the knob; it would need the editor's "Quilt only" reason re-worded and the pattern-controls e2e re-pinned.
5. **DRIFT has no clock in this cut** — the deal never moves. The editor disables DRIFT for BLOCKS with the reason on the row ("Still deal — a BLOCKS deal is a still — SHUFFLE re-deals it"), `patternKey` excludes time for BLOCKS, and pixels are asserted identical at any DRIFT/t. Open door if Matt wants motion later: a slow re-deal, or a field read à la TIDES.
6. **Not dealt by KIN/CURATOR** (`PATTERN_DEAL_MODES` unchanged), hand-picked only — same as TIDES, so every existing seeded deal and replay deals what it always did.
7. **Defaults are existing detents**: density 10 and mix 0.55 are already PATTERN_STOPS stops, so `blockStops.mjs` needed no change. Cost tier 0 declared at registration (`pattern/blocks`); measured 30–40 ms for a fresh 1000×700 still in the sandbox, declared 60.

## Files

- NEW `app/src/pattern/blocks.js` — engine: vocabulary, merge pass, colour pass, sampler, raster, ground-sampler cell, cost registration.
- NEW `app/src/pattern/blocks.selfcheck.mjs` — 12 checks (manifest-registered).
- NEW `app/e2e/pattern-blocks.spec.js` — UI: mode writes through, density follows to 10, DRIFT/movers disabled with reasons, SHUFFLE re-deals; takes the review screenshots.
- `app/src/state/patternTrack.js` — PATTERN_MODES + BLOCKS; PATTERN_FIELD_LIKE + BLOCKS; per-mode defaults.
- `app/src/pattern/patternSource.js` — buildGrid + still-frame routing + patternKey time exclusion.
- `app/src/pattern/ground.js` — gridFor + patternGround branches (kept in step with patternSource).
- `app/src/panels/build/PatternEditor.jsx` — MODE_HINT, MIX hint clause, DRIFT disabled for BLOCKS.
- `app/src/pattern/patternRender.selfcheck.mjs` — "every mode" loops extended to BLOCKS (node pixel checks + the GL rendered-frame loop). Coverage added, nothing re-pinned.
- `app/src/pattern/rasterFast.selfcheck.mjs` — frames-equal-reference loop extended to BLOCKS with its reference branch. Coverage added.
- `app/e2e/pattern-track.spec.js` — live-loop survival sweep extended to BLOCKS (cause: the list enumerates modes).
- `docs/PATTERN_SPEC.md` — Modes entry, Composition (BLOCKS), Parameters + Motion rows.
- `app/selfcheck.manifest` — +1 line (blocks suite).

## Re-pins (each with its cause — nothing weakened, no check deleted)

1. `state/patternTrack.selfcheck.mjs` — `PATTERN_DEFAULT_DENSITY` deep-equal gains `BLOCKS: 10`. Cause: #1798 adds the mode (the pin enumerates per-mode defaults).
2. `panels/build/patternEditor.selfcheck.mjs` — the mode whitelist gains `'BLOCKS'`. Cause: #1798 (the pin enumerates the editor's modes, as it did for TIDES #1797).

## Verification

- blocks.selfcheck: 12/12 — partition exact-cover + vocabulary membership on 15 seed/mix combos; the vocabulary actually deals (incl. square/L/T/plus); MIX appetite incl. MIX 0 = all singles and monotone growth; colour-once-per-block + pool-exhaustion-only conflicts; palette-only pixels; lattice seams/frame edge/rounded corners; replay law incl. DRIFT-stillness and patternKey stillness; raster ≡ sampler; ground sampler ≡ pixels; cost median inside the declaration.
- Every suite naming a touched file, run individually: patternTrack 17 ✓, tides 12 ✓, patternRoll 7 ✓, elements 10 ✓, rasterFast 8 ✓, patternEditor 6 ✓, blockStops 10 ✓, groundNudge ✓, groundSnap ✓, dishGround ✓, patternAudio 7 ✓, creature ✓, accumFeed ✓, contactShadow ✓, liveResolve.determinism ✓, performanceFile ✓, resolveTap ✓, patternRender 28 ✓ (incl. GL BLOCKS frame parity in headless Chromium), costTiers ✓ (in sweep).
- Full manifest sweep, run in segments (the runner halts at first failure): **543 suites accounted for — 540 pass in-run**, including blocks.selfcheck in-manifest and kineticSweep (the ~1.5% flake #1822 did not fire). The 3 failures are all environmental, each proven:
  - `swarmWasm` — sandbox has no `cargo`; fails identically on pristine `origin/main` (base-identical).
  - `fx/rollSafety` — Playwright "Target crashed" in the sandbox browser; fails identically on pristine `origin/main` (base-identical, same signature).
  - `gl/accum` — JS heap OOM at the default 2 GB in the parallel segment; re-run solo with `NODE_OPTIONS=--max-old-space-size=3072`: **OK, 83/83 cases**.
- e2e: pattern-blocks ✓ (real UI, 17 s), pattern-tides ✓, pattern-controls 6/6 ✓. pattern-track: all modes incl. BLOCKS draw without faulting; the spec's final page-error audit fails on `ERR_TUNNEL_CONNECTION_FAILED` (a sandbox-proxy resource fetch) — **identical failure on pristine `origin/main`** (base-identical, environmental; CI's network is authoritative).
- format:check clean (prettier --write applied to the flagged files, code only); lint 0 errors (11 warnings, pre-existing); build ✓.

## Visual evidence (~/workspace/kc-1798-shots/)

- `live-canvas-blocks.png` — the REAL app (captured by the e2e spec, factory palette, KC marks hidden): BLOCKS on the canvas, black lattice, one colour per merged block.
- `live-editor-blocks.png` — the real editor: BLOCKS chip active, density 10, mix 55%, the rows BLOCKS ignores (grout/hero/drift/movers) disabled with dash readouts.
- `before-mix0-unmerged.png` / `after-mix055-merged.png` — engine renders (`patternPixels` → PNG, labelled as such) of the same seed + palette with merging off vs on: the merge-first difference, isolated.
- `redealt-seed-babe.png` — a second seed at MIX 0.55: the series point (same generator, fresh permutation).

## Not done / open doors (deliberately, slice 1)

- No DRIFT behaviour (choice 5); GROUT not read (choice 4); concave corners of L/T blocks stay square (only convex outer corners are rounded); no numbered-series exhibit view (the issue's presentation idea — the re-deal exists; a side-by-side series is later presentation work); KIN/CURATOR never deal it (choice 6).
