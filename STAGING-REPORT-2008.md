# STAGING REPORT — #2008 Riso glyph expansion

Builder staging report. Branch `feat/riso-2008`, base `dcd4132e` (current main at dispatch).
Local commits only — no push, no PR. Spec: `riso-glyph-expansion-spec-2026-11-07.md`
(contract) + research note `riso-glyph-expansion-loot-2026-11-06.md`. Issue #2008 body +
its 2026-11-07 scoping comment read before building; #2038 read as standing strata law.

## What was built

1. **Generative icon grammar** — `app/src/engine/risoGrammar.mjs`.
   A kit of 8 primitive marks (disc, ring, target, plus, cross, pixel, arc, wedge)
   composed by 6 seeded rules (single, pair, stack, orbit, grid, frame) into icons.
   All grammar quantities are named constants (anchors, size/stroke tiers, rotation
   detents 0/90/180/270, max 5 parts, canonical seed 2008, set size 24, grammar
   version 1). Integer-only geometry, so composed SVGs are byte-stable by
   construction. Icons are marks only — no primitive can render a letterform, no
   `<text>` is ever emitted; the typography two-pole law is untouched.
2. **Catalogue materialization** — `app/src/data/assets/assets-riso.js` recomputes
   the canonical set from the grammar at module load (nothing authored) and
   `app/src/data/assets/index.js` appends it to `ASSETS` on the FIELD-stamp road
   (the kana/kanji/Latin/serif/ornament/plate precedent): catalogue members the
   census and the stage atlas resolve, excluded by id from chapters
   (`CHAPTER_UNDEALT`), the KINETIC roll (`NEVER_DEALT`), the pool panel
   (`poolDescriptors`), the dice filter, and the placeable pool
   (`liveResolve` POEM_ONLY set). `ASSETS_AUTHORED` is untouched (312, pinned).
   A new asset family `riso` (style grunge — a print family) was registered in
   `data/assetStyle.js` so no library record falls through to `imported`.
3. **Icon fields + cluster-disperse breathing** — `app/src/engine/risoField.mjs`.
   `dealRisoField` deals a dense Martens grid (seeded jitter, icons drawn from the
   composed set) with each placement assigned to its nearest of 5 seeded cluster
   centres; placements carry the buildPlacements item shape. Breathing is a Davis
   behaviour in the kineme-driver shape: anchored (t=0 displacement exactly 0),
   driven by a caller-supplied standing-driver level smoothed with a 2.5 s time
   constant, and relaxing toward a floor of 0.15 — never zero — with the phase
   advancing on the field's own clock, so a dropped driver relaxes the field
   instead of freezing it (#721). No new pattern mode was added (scope fence held;
   the dealer is a pure module, see Limits).
4. **Riso overprint finish** — `app/src/engine/risoFinish.mjs` (CPU reference over
   straight RGBA bytes + `RISO_GLSL`), registered as the template FX kind `riso`
   (`gl/effects/fxShaders.mjs`), catalogued in `fx/fxFilters.js` with an SVG print
   approximation (`buildRiso`), and joined to `GRAIN_FAMILY_KINDS` in both
   `fx/fxFilters.js` and `gl/renderer.mjs`, so the renderer splits it out of the
   FX chain and runs it post-composite over the finished frame via the standing
   `applyFinishChains` path (#520 Phase 2). Two passes: the frame and itself
   misregistered by a ruled shift detent (0–4 px, down-right), multiplied in
   straight space, mixed by amount. Amount 0 returns the source byte-identical
   in both mirrors. Dials are detented FX params (amount 0–1 step 0.05 def 0;
   shift 0–4 step 1 def 2) with block stops (`panels/build/blockStops.mjs`),
   a rack face (`fx/efRackTile.mjs` RSO), a cost-id mapping
   (`hooks/sceneCost.js` → `fx/riso`), a hand-declared governor tier
   (`gl/mlx/declaredCostTiers.json`, tier 3) and a measured-cost floor entry
   (`gl/effects/measuredCosts.mjs`, the #1022/#1610 hand-added precedent for
   pure-ALU tier-3 passes — re-bless on a real GPU).

## Survey findings + the two flagged questions

**Stamp-bake survey.** Both bakers rasterize an SVG fragment looked up by asset
id: offline `gl/atlas.mjs` (resvg, pinned font) from the static `ASSETS` map;
live `gl/liveAtlas.mjs` from `mergePool(ASSETS, customAssets)`. Overlay
(`user:`) assets prove the pool is extensible; the FIELD poem packs prove the
catalogue-member-but-never-dealt road. A composed icon in the exact asset shape
therefore instances identically to a deck stamp — proven by `risoBake.selfcheck`
through the real `bakeAtlas` (cells, ink bboxes, mixed deck+composed bakes,
byte-identical rebakes).

**(a) Stored vs recomputed — RECOMPUTED.** On the RAY GUN precedent
(`poets/rayGunForm.js`: the record is stored, the blast is recomputed on every
draw, never cumulative): a composed icon is a pure function of (grammar version,
seed, index), so the durable artefact is the seed, not SVG strings. Storing SVGs
in takes/documents would bloat them and could drift from the grammar. The one
materialization (the canonical catalogue set) is itself recomputed at module
load, and the grammar suite pins it deep-equal to a fresh recomputation.

**(b) Finish placement — FX grain-family kind (neither Look-level nor a new
chip).** The strata debate the spec worried about was resolved by #2038
(PATTERNS/GLYPHS pinned bottom → ONE CONTENT → FX → MATH). Grain and dither
already establish that a stage-wide finish lives as an FX-stratum kind that the
renderer extracts and runs over the finished frame: it reorders nothing, joins
nothing, and speaks for no stratum. Placing riso there follows that precedent
exactly and does not collide with any #2038 ruling, so no question was posted
on the issue. The DISH LIFE chip tradition the spec cites — dials with honest
ranges and detents — is honoured through the FX param detents + block stops.

## Verification

- **New suites** (registered in `app/selfcheck.manifest`):
  `risoGrammar` 8 checks (census pins; byte-level determinism, canonical set
  hash 4138279804 pinned; recompute discipline), `risoField` 7 checks (deal
  determinism; anchored rest; driver-drop relaxes-never-freezes, incl. 120 s of
  silence still moving at the floor), `risoFinish` 7 checks (byte-identity at
  zero at every detent; determinism at detents; multiply law; mirror parity),
  `risoBake` 4 checks (same-path bake integration).
- **Repeated runs:** grammar/field/finish suites run 10× consecutively — all
  green every run (the dice/driver-adjacent discipline).
- **Full manifest sweep** (continue-on-error over all 638 commands): 622 pass,
  16 fail on first pass. 13 of the 16 were this build's ripples, each fixed and
  re-verified green individually (list below). The remaining 3 —
  `swarmWasm`, `rollSafety`, `accum` — are the standing sandbox set, proven
  base-identical against a fresh detached worktree at origin/main (same three
  fail there, untouched by this change). One further sweep failure,
  `livingMotion`, was a perf-budget timing flake under concurrent load
  (2.47 ms vs 2 ms budget while the sweep, lint and build ran in parallel);
  standalone it passes (15 checks).
- **Lint:** `npm run lint` — 0 errors (11 pre-existing warnings, none in
  touched files). **Format:** `npm run format:check` — clean (11 touched files
  formatted). **Build:** `npm run build` — succeeds.

## Golden movement — itemised, each with cause

1. `state/allEraGolden` — first-render hash `48f77588…` → `60466dad…`.
   Cause: catalog growth only (the 'all' pool is the full catalog; +24 riso
   records, 753 → 777 assets). Proven on the #1854/#2005 pattern before
   re-pinning: with only the `ASSETS_RISO` spread removed, the suite
   reproduces `48f77588…` exactly (753 assets, 25619 svg bytes).
2. Catalogue-arithmetic pins (+24, messages updated, meaning unchanged):
   `poets/fieldKana`, `poets/fieldKanji`, `poets/fieldLatin`,
   `poets/fieldPlate`, `data/chapters`, `assets/regionBake`,
   `panels/assetPool` (exclusion mirrors extended by exactly the riso set).
3. FX-family pins (additive kind, seam properties unchanged):
   `gl/accum.seam` (GRAIN_FAMILY_KINDS gains 'riso'), `gl/effects/fxShaders`
   (template kind census gains 'riso'), `state/rollPool` (family census:
   'riso' excluded from roll reachability — it is FIELD-dealt only, beside
   'creature').

No existing deck, asset record, or take fixture was edited. No golden moved
for any reason other than the additive catalog/FX growth above.

## Newly-meaningful word/value sweep

`grep e2e/` for `riso` (and the new kind generally): no hits — no spec used
the word as a free string (the word existed only as a tag synonym for 'print'
on two experimental assets). All selfchecks enumerating FX kinds, grain-family
membership, asset counts, families, or cost ids were found by the full sweep
and re-pinned above; suites asserting rack faces, block stops, scene cost,
cost tiers, and MLX tier coverage each gained their riso entry in production
code (not just the pin) where the contract demanded one.

## Honest limits

- **The field dealer is a pure module, not yet wired into the live resolver.**
  Wiring it as a stage layout would mean a new pattern/layout mode, which the
  spec's scope fence forbids without a flagged question; the placements it
  deals are in the exact item shape the stamp machinery consumes, and the bake
  suite proves the icons instance through the real atlas path. The follow-up
  (a RISO field Look or a pattern-track tenant) is Matt's call at the feel gate.
- **The finish's GPU pass is verified by mirror-parity pins, not by a GPU
  render in this sandbox** (the CPU reference carries the determinism
  contract; the GLSL zero-branch and multiply law are pinned against it).
  Its measured-cost entry is the hand-added floor per the #1022/#1610
  precedent, to be re-blessed by `npm run measure-costs` on a real GPU.
- **Feel is unverified** — icon fields and the finish are looks; per the spec
  they go to Matt's review lane on real frames at phone + desktop widths.
  Nothing here was pushed or PR'd.
