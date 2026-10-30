# STAGING REPORT — #1610 Strata Q Phase 4: EF-4 dither kind, grain family

**Issue (verbatim title):** "Strata Q Phase 4 — EF-4 dither kind, grain family"
**Branch:** `feat/1610-strata-phase4-dither`. Local only — no push, no PR
(coordinator publishes). This file replaces the report that was at the
worktree root (#1609's); that report remains in git history. The
"(DEFERRED)" language in the issue is stale — the lane was un-deferred
2026-10-30 and Phases 0–3 are this branch's base.

**Base deviation, recorded:** the dispatch named
`origin/feat/1609-strata-phase3-skeleton` as the base, but that branch was
never pushed — `git ls-remote origin` has no such ref (Phase 3 was built
local-only under the local-stack rule). This worktree is based on the
identical **local** ref `feat/1609-strata-phase3-skeleton` @ `14cf6dd9`,
which is the Phase 3 commit itself (stack: 14cf6dd9 ← 41db04c5 Phase 2 ←
64b6fdaa Phase 1 ← dfc7d420 Phase 0). Nothing else about the dispatch
changed.

## What was built

**Dither is a real EF-4 Finish kind** — ordered Bayer dithering in the
grain family, end to end on every surface a sibling kind touches:

- `src/fx/fxFilters.js` — the catalog def (`cell` 1–8 step 1 def 2,
  `amount` 0–1 step 0.05 def 0.5, label "Dither"); `GRAIN_FAMILY_KINDS`
  becomes `['grain', 'dither']`; the EF-4 rack seat lists dither in
  `kinds` and its `stubs` shrink to `['stipple']` — stipple stays a stub,
  only dither ships. The SVG builder `buildDither` joins BUILDERS: an
  honest approximation in the grade/halo line — a discrete
  feComponentTransfer one-bit cut per channel blended by amount via
  feComposite arithmetic; amount 0 emits the identity pass-through;
  `cell` has no SVG analog and the comment says so. (A GL-only kind
  would be *dropped* by sanitize on the print path — the weave would
  silently print smooth.)
- `src/gl/effects/fxShaders.mjs` — `FX_DITHER_FS` + descriptor +
  registry entry, cost tier 3 (pure ALU, no taps). The threshold is the
  **shared stage**: `curator/roomDither.js`'s `BAYER4` / `orderedLevel`,
  the matrix the deferred ROOM codec faces quantize through (#1560 §09)
  — one pipeline, two tenants, and the code comment says so where the
  codec lane will find it. GLSL ES 3.00 has no portable
  constant-array indexing in this codebase's idiom, so the rank is
  rebuilt from bits — `r = ((x0^y0)<<3) | (y0<<2) | ((x1^y1)<<1) | y1`,
  `t = (r + 0.5) / 16` — which reproduces BAYER4 exactly (pinned below).
  Levels are fixed at 2: this kind *is* the one-bit finish; posterize
  owns multi-level cuts. Premultiplied plate discipline like grain
  (#748): the straight colour is quantized and re-premultiplied, alpha
  untouched, so the weave never paints outside the plate.
- `src/gl/renderer.mjs` — the renderer's synced local copy of
  `GRAIN_FAMILY_KINDS` gains dither (the parity harness serves only
  `src/gl/`, so the constant is duplicated by design and fxFilters'
  selfcheck regex-pins the two copies equal). That one line is the
  whole render wiring: the finish chain is selected by family
  membership, so dither now runs post-ACCUM through the existing bridge
  like grain. **No one-writer file was touched** (liveLoop.mjs /
  liveResolve.mjs / particles.js untouched; no wiring need arose).
- Census/registration, one line each in the house pattern:
  `hooks/sceneCost.js` (`dither: 'fx/dither'`), `gl/effects/
  measuredCosts.mjs` (hand-added measured row, #1022 precedent for
  pure-ALU tier-3 passes), `fx/efRackTile.mjs` (tile face DTH/dither),
  `gl/mlx/declaredCostTiers.json` (tier 3 — see "caught by the sweep").
- `panels/build/blockStops.mjs` — Phase 2 stop tables for the new
  params, authored per Phase 0's law: `dither.cell` stops `[1, 2, 4, 8]`
  (a *setting* — pattern pitch, the halo.radius precedent: stops ascend
  from the floor, never centred on the default); `dither.amount` stops
  `[0, 0.5, 0.75, 1]` (identity class, OFF = 0). Both shipped defaults
  (2, 0.5) are stops; the blockStops census requires the rows and its
  law checks validate them.
- `panels/build/LayerStack.jsx` — the add path's "planned:" note now
  reads "planned: stipple" only. Dither is **not** added to
  FX_MENU_KINDS: like grain and scanlines it is picked through the FX
  layer's own editor (`availableFxKinds` reads the rack kinds — exactly
  the path Phase 3 leaves), never the roll menu.

## Parity measurement (the acceptance number)

New suite `src/fx/dither.selfcheck.mjs` (7 checks, one manifest line):

- **Reference:** the shared stage itself — `roomDither.orderedLevel`
  applied per channel at 2 levels over a seeded Look (deterministic
  PRNG, seed 0x1610; 96×64 raster: horizontal gradient + radial blob +
  flat bands, tones at every level).
- **Candidate:** the shader's math transcribed 1:1 (bit-formula
  threshold, premultiplied cut, amount mix).
- **Result: 0 / 6144 differing pixels (0.000%) at cell sizes 1, 2 and
  3** — diffed under `gl/parity/diff.mjs` DEFAULT_POLICY, the house bar
  (Matt's rule: under 10% differing pixels passes). The bit formula is
  additionally pinned cell-by-cell against BAYER4 (all sixteen cells,
  plus mod-4 wrap). No parity-corpus scene was added: the template
  family's standing precedent is that none of its nine kinds carries
  one — SVG/GL divergence there is structural, and corpus scenes pin
  byte-level agreement this family never claims.
- The suite also pins: amount 0 identity / amount 1 pure one-bit /
  linear mix between; premultiplied discipline (transparent stays
  transparent, rgb never exceeds plate alpha); sanitize re-seating
  (dither after a non-grain kind fires onMove with `['dither']`;
  grain+dither keep relative order silently); the add path
  (`availableFxKinds` offers dither, never stipple, never twice);
  sanitize clamps (cell 99→8, amount −1→0); the SVG prim shape.

## Premise results (verified against this base before building)

All premises in the issue held; its line numbers are stale, its facts
are not. `GRAIN_FAMILY_KINDS = ['grain']` stood at fxFilters.js:242 with
EF-4 `stubs: ['dither', 'stipple']` at :264; sanitize's family-last
enforcement present; Phase 3's add path is LayerStack's FxEffectEditor
over `availableFxKinds` with the literal note "planned: dither,
stipple"; the shared stage `BAYER4`/`orderedLevel` exists in
`curator/roomDither.js` from #1560; renderer.mjs splits FX chains
pre/fin by the family list and runs the fin chain post-ACCUM. One
premise sharpened by recon: the blockStops census auto-requires stop
rows for **every** FX_EFFECT_DEFS param, so dither's stops were never
optional. No item hit the stop-rule.

## Re-pins (each with its cause)

1. `src/gl/accum.seam.selfcheck.mjs` — the `#820` pin
   `GRAIN_FAMILY_KINDS == ['grain']` becomes `['grain', 'dither']`,
   test renamed ("the finish family — grain, plus dither since
   #1610"). Cause: #1610 adds the family's second kind; the seam
   property the suite guards (family members run in the finish chain,
   after ACCUM, never inside the keep loop) is unchanged.
2. `src/gl/effects/fxShaders.selfcheck.mjs` — the sorted
   FX_SHADER_KINDS expectation gains `'dither'`; the check is renamed
   from "all Phase-2 kinds" to "all template kinds" (it has outgrown
   the name through four additions now). Cause: #1610 registers the
   tenth template kind.

**Caught by the sweep, fixed in-build (not a re-pin):** the first full
sweep failed `gl/mlx/mlxExport` — "shader sources for \"dither\" but no
declared tier". The MLX export censuses every template kind against
`gl/mlx/declaredCostTiers.json`, a registry the recon greps missed.
Fixed by declaring dither at tier 3 with rationale, matching the
registerCostTier declaration; the suite now passes at 28 effects (base:
27, green — the failure was this change's, and it is gone).

## Verification

- **Touched-file pin sweep:** every selfcheck naming a touched file
  was grepped out and run — fxFilters (51 cases), fxShaders (15),
  blockStops (10), accum.seam (7 pass), efRackTile (6 pass), sceneCost,
  costTiers, grainFinish, fxUniforms, deferredStubs, shelfCensus,
  shelfDisk, voiceDeck, canvasSizes, spectrumWarp, costDataset,
  shelfDiskRun, mlxExport — all green.
- **Full manifest sweep** (Playwright chromium installed first, so
  browser sections ran at full counts): **537/541 passed.** The four
  failures, each dispositioned:
  - `engine/kernel/bake/swarmWasm` — fails **identically on the
    pristine Phase 3 base** (build-wasm.sh --verify; the sandbox has
    no cargo toolchain). Environmental.
  - `fx/rollSafety` — fails on **both** trees inside the headless-GL
    render section (mine: "framebuffer incomplete"; base: "Target
    crashed" — the sandbox's Chromium GL harness, same section). Every
    logic check passes identically on both trees. Environmental.
  - `gl/accum` — heap-aborted inside the sweep (exit 134, the known
    sandbox behaviour); run solo with
    `NODE_OPTIONS=--max-old-space-size=3072`: **OK, 83/83, exit 0** —
    the full count, browser sections live.
  - `gl/mlx/mlxExport` — mine; fixed (above); green at 28 effects.
- `npm run format:check` — clean on the final tree (no prettier writes
  needed). `npm run build` — exit 0.
- Known flakes not encountered this run: kineticSweep (#1822) passed
  in-sweep; pattern-controls e2e is CI-side, not in this sweep.

## Not built / out of scope

Stipple remains a stub (the issue ships dither only). No new menu
surface, no corpus scene, no one-writer edits — dither inherits the
finish chain purely by family membership, which is the design working
as Phase 3 left it.
