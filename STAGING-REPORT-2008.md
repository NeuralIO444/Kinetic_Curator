# STAGING REPORT — #2008 Riso glyph expansion

Builder staging report. Branch `feat/riso-2008`, base `dcd4132e` (current main at dispatch).
Local commits only — no push, no PR. Spec: `riso-glyph-expansion-spec-2026-11-07.md`
(contract) + research note `riso-glyph-expansion-loot-2026-11-06.md`. Issue #2008 body +
its 2026-11-07 scoping comment read before building; #2038 read as standing strata law.

## What was built

1. **Generative icon grammar** — `app/src/engine/risoGrammar.mjs`.
   A kit of 8 primitive marks (disc, ring, target, plus, cross, pixel, arc, wedge)
   composed by 6 seeded rules (single, pair, stack, orbit, grid, frame) into icons.
   The grammar's composition quantities are named constants: anchors 25/50/75
   (referenced by the rules wherever a coordinate equals one — centre, stack
   triple, orbit corners), size/stroke tiers, rotation detents 0/90/180/270,
   max 5 parts, accent-slot probability 0.22, stack-triple probability 0.5,
   frame outer size 34, inset coords 28/72 (pair/grid), stack-pair coords
   32/68, orbit satellites 3 + a span of 2, canonical seed 2008, set size 24,
   set-count max 256, grammar version 1 (see the QA fix note below for the
   pass that named the last of these). The numerals left in the module are
   structural, not quantities: array indexes, the per-rule size-tier caps
   passed as `drawPart` arguments, the kit builders' geometry formulas, and
   the set-hash algorithm's own constants. Integer-only geometry, so composed SVGs are byte-stable by
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

## QA fix (post-QA pass)

- **The nit:** independent QA found this report's constants wording overstated
  the tree — `RISO_ANCHORS` was exported but never used (the rules hard-coded
  their coordinates, including the 28/72 and 32/68 pairs that are not anchors),
  `RISO_MAX_PARTS` was census-only, and the accent-slot probability 0.22 and
  the frame rule's outer size 34 were bare literals. Determinism was never
  affected.
- **What changed (values untouched, no output byte moved):** the rules now
  reference `RISO_ANCHORS` wherever a hard-coded coordinate already equalled
  one of its values (centre 50, the stack triple 25/50/75, the orbit corners);
  the remaining quantities are named constants — `RISO_ACCENT_SLOT_PROBABILITY`
  (0.22), `RISO_FRAME_OUTER_SIZE` (34), `RISO_INSET_COORDS` (28/72, pair/grid),
  `RISO_STACK_PAIR_COORDS` (32/68), `RISO_STACK_TRIPLE_PROBABILITY` (0.5),
  `RISO_ORBIT_SATELLITE_MIN`/`SPAN` (3, +2), `RISO_SET_COUNT_MAX` (256) — and
  the frame's rotation now reads `RISO_ROT_DETENTS[0]`. No coordinate or
  probability value changed. Verified after the change: the risoGrammar suite
  is green and the canonical-set fingerprint is identical to before the fix —
  djb hash 4138279804, sha256 b94de4e3c5581d2f5386e0a981716e265296825ef7e43fb2f4b69e76fa5455f7.
- **The wiring question is parked with Matt, not fixed here:** QA's major
  finding — the icon-field dealer has no live tenant in the running app — is a
  design decision, not a defect this pass may settle. No wiring was attempted.
  The question has been posted as a comment on the issue itself (the four
  options: a Riso field Look, a tenant on an existing pattern track, a new
  pattern mode only if the dealing needs one, or accepting the module as
  staging with the wiring as its own follow-up) and waits on Matt's ruling.
  The overprint finish is fully live either way.

## Wiring (option 1 — Riso field Look)

Matt ruled 2026-11-09: the field becomes **a Riso field Look the performer
can pick** (option 1 of the four posted on the issue). This section is that
wiring, built on the rebased branch (base 1e4fdad8, the merged #2034).

### What was wired where

- **The Look** (`app/src/data/presets.js`): `RISO FIELD` (`riso-field`),
  group `riso` (label "Riso", appended to `PRESET_GROUPS`), appended LAST in
  `COMPOSITION_PRESETS` so every filtered dealing deck keeps its pre-wiring
  order byte-for-byte. It is an **authored preset, not a style look**: the
  style groups are design families of 4+ recipes (a standing law in
  `data/styleLooks.selfcheck` — ≥4 looks per group, no shared mode inside a
  group, every look pairing its own style), and this is a single functional
  Look; forcing it into `STYLE_LOOKS` would have broken all three sub-laws.
  Params ride the normal recipe: count 120 (the field count), scale
  [0.8, 1.6] (its midpoint centres the icons' dealt scale), alpha [70, 100]
  (the top is the field's ink), mode grid, palette pairing LITHOGRAPH.
  The picker surface is the existing one — the Look appears under its group
  in the LOOKS menu exactly like every other Look; no new prose surfaces.
- **The deal** (`app/src/engine/buildPlacements.js`): at the seam where the
  FIELD form joins, when the layer's resolved preset is `riso-field`, the
  layer's pool marks are replaced wholesale by `dealRisoField` items — so
  mirror, materials and the tail treat the icons as ordinary citizens of
  the layer, and an armed FIELD form still appends after them. The deal is
  a pure function of recorded inputs: the **layer seed** deals the
  arrangement, the recipe count is the field count, the canvas is the
  stage's. One adaptation, stated plainly: the dealer's own `assetId` is
  consumable only at the canon seed (the catalogue was baked for seed 2008
  alone), so the wiring re-addresses each dealt `iconIndex` through
  `risoIconId(RISO_CANON_SEED, …)` — the icon selection is the deal; the
  asset id is the catalogue address of that icon. Colours come from the
  layer's own palette/strategy (`assignColor`), alpha from the top of its
  alpha range — the FIELD form's exact discipline. The replaced list is
  never stashed into the placement cache's item pool (its items are not
  SoA-slot-indexed; the FIELD form's aliasing law).
- **The breathing** (`app/src/gl/liveResolve.mjs`): the resolver owns one
  breath state per riso layer (`risoBreathByLayer`) and hands it to
  buildPlacements as an ephemeral input `risoBreath = { state, dtSec,
  driver }` — never in the geometry signature, the cultureScale deal.
  `dtSec` is the frame's recorded delta (0 on a slowRender frame — a held
  frame holds the breath); `driver` is the recorded beat drive
  (`input.beatDrive`, 0 when no beat is stamped — the floor, so the field
  keeps breathing gently in silence, #721). Never a wall clock. The state
  prunes against documentIds like warpPhase, disposes with the resolver,
  and rides the snapshot as an OPTIONAL key (`risoBreath`, present only
  while a riso layer's state exists — pre-wiring snapshots restore with a
  fresh breath, the spawn precedent; `checkResolverSnapshot` validates the
  shape when present).
- **The exclusions** (`app/src/state/kineticScope.mjs`,
  `app/src/engine/creatureBreed.js`, `app/src/engine/creatureAssembler.js`):
  the shared id constant `RISO_FIELD_LOOK_ID` lives in
  `engine/risoField.mjs`. The med/koz decks deal from the catalogue minus
  the picker-only id (`ROLL_LOOKS`); the off/weak decks' `ORIGINAL_LOOKS`
  exclude it by id as well (as an authored preset it is not a style look,
  so the style-membership filter alone would have left it in). Chapter
  decks intersect the scope decks (`chapterScopeDeck`), so chapters are
  covered by the same exclusion. The creature dice — the breed mutation
  deck and the assembler's default-pick deck — filter it out; the
  assembler's validity set stays the full catalogue, so a record carrying
  the Look because the performer picked it (WetLab/strand pickers) remains
  lawful. The overprint finish is untouched.

### Verification

- **New suite** `app/src/gl/risoFieldLook.selfcheck.mjs` (registered in
  `app/selfcheck.manifest`), 13 probes, all passing:
  - catalogue citizenship: resolvable, valid composition id, last in the
    catalogue, own picker group, not a style look;
  - the gate: picked → every item a canon catalogue icon with `riso:*`
    keys, count = the recipe count; not picked (3 other Looks) → zero riso
    items; a different layer seed deals a different arrangement of the same
    canon catalogue;
  - anchored rest: with no breath input, items are byte-identical to
    `breatheFieldAt(deal, freshState)`; two identical builds byte-identical;
  - **determinism probe**: two fresh resolvers over a recorded 60-frame
    conversation (50 ms steps; beat drive 0 for 10 frames, then 1) produce
    byte-identical item hashes on all 60 frames; frame 0 equals the
    anchored deal exactly; driven frames move icons off the anchor;
  - **snapshot probe**: snapshot at frame 30 carries `risoBreath` (1 entry)
    and validates; a fresh resolver restored from it continues frames
    30–59 byte-identical to the uninterrupted run; a non-riso scene's
    snapshot carries no `risoBreath` key;
  - **exclusion probes**: no scope deck (off/weak/med/koz) contains the id
    (med/koz = catalogue − 1); no chapter deals it at any scope (every
    chapter × 4 scopes); **300 scoped KINETIC look passes never land it**
    (and dealt 30+ distinct other looks — the roll still rolls); **800
    creature-dice probes** (400 assembly defaults + 400 hand mutations)
    never deal it (20+ distinct other looks each); the dealable pool still
    holds zero riso assets.
- **Neighbour suites** run directly by file: the riso family (grammar,
  field, finish, bake), buildPlacements, styleLooks, chapters, kineticSweep,
  kineticScope, chapterWalk, chapterNarrow (+wiring), creatureBreed,
  creatureAssembler, liveResolve, liveResolve.determinism, genomeTimeline,
  strandBank — all green. **Dice/timing-adjacent suites 10× each** (the new
  suite, kineticSweep, kineticScope, chapterWalk, creatureBreed,
  creatureAssembler, liveResolve.determinism): **70 runs, 0 failures**.
- **Re-pins (all catalogue-growth or new-reader only, each commented at
  the pin)**: `styleLooks.selfcheck` census 69→70 looks / 15→16 groups /
  menu 69→70 (STYLE_LOOKS stays 36 — the Look is authored); its
  dealt-pool render check gains a named stricter exception for this one
  Look (every rendered mark must be a canon riso icon — the field is the
  one Look whose marks are not pool-drawn, by design); `chapters.selfcheck`
  Now-chapter look sum 69→70; `creatureAssembler.selfcheck`'s stage-reader
  allowlist gains the new suite (a test reader, the established pattern).
- **Full manifest sweep** on the composed tree: **639 suites, 636 pass,
  3 fail — exactly the standing base-identical sandbox set** (swarmWasm,
  rollSafety, accum). Nothing else moved.
- **format:check clean; lint 0 errors** (11 pre-existing warnings);
  **build clean**.
- **Headless drive** (vite preview + route interception from `kc.local`,
  the established sandbox pattern; footer build `bf55dc75`): opened the
  LOOKS picker, clicked **RISO FIELD** under the **Riso** group label;
  store composition read `riso-field` on 8/8 samples over 3.2 s; frames
  advancing; **0 frame errors, 0 page errors**. Screenshot:
  `kc2008-riso-field-drive.png` in this worktree — the field stands on
  stage in the standing palette (rings, crosses, squares, triangles —
  grammar icons, no letterforms), and the BUILD panel shows the Look's own
  recipe live (BUILD riso-field, COUNT 120, SCALE 0.8–1.6, ALPHA 70–100%).
  Drive note: a pick made before the boot deal settles can be overwritten
  by the opener landing late (first attempt read a boot-dealt look); the
  final drive waited for a settled boot composition first — app behaviour,
  not a wiring fault.

### Honest limits

- The field replaces the layer's content on the placement path; if a
  performer switches a riso layer's mode to a swarm mode, the swarm branch
  deals its particles instead (mode is a separate performer control, as
  with every Look).
- A riso layer whose pool is fully disabled returns no items (the
  buildPlacements empty-pool early return) — the pool is untouched by
  picking the Look, so this needs a deliberate emptying.
- Breath replay across a take is exact for the recorded frame deltas and
  beat-drive stamps; the state also rides snapshots, so a restored take
  continues exactly (probed above).
- Feel is Matt's call as always: density at count 120 is the dealer's own
  Martens density; nothing here tunes it.
