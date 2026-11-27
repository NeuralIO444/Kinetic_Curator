# STAGING REPORT — #2104 Q2 second half: line work takes the ink

**Status: STOPPED AT SURVEY — no code built. One classification question for Matt (listed in §5, in the order to ask them).**

- Branch: `kc-2104-ink`, based on `origin/main` at `ea4ebfa7` (verified after fetch — the head the brief named; the material slice PR #2174 is its tip commit).
- Worktree: `~/workspace/kc-2104-ink`; `npm install` run in `app/`.
- The ruling (issue #2104, comment 6874295763, verbatim): *"while a world stands, the drawn line work — the cell library's lines (line-boil included) and stroked lines generally — draws in the standing world's ink. Fills keep the palette; the poem's letters are not the ink's business; the UI text-contrast ink is untouched, as ever. When no world stands, line work draws exactly as it does today."*
- This report is the only file this branch adds. No product code, no selfcheck, no shader was touched, because the survey (§2–§4) found that **what counts as "line work" is genuinely ambiguous in this codebase, every candidate reading changes visible behaviour differently, and the ambiguity sits inside the ruling's own named example** (the cell library). The brief's stop rule applies: write the ambiguity down, hand back without guessing. Screenshots are owed with the build, once the classification is ruled — there is no "after" build to shoot yet, and the "before" state is base itself.

## 1. What the survey covered

Every place a line's colour is decided on the stage:

1. **Marks (asset instances)** — the stage's main drawing path. `engine/buildPlacements.js` + `engine/kernel/color/index.js` (`assignColor`, asset-blind: colour comes from palette swatches by placement strategy) → item `color`/`accent` → `gl/sceneContract.js` `toInstance` (`tint: hexColor(item.color)`) → atlas bake → `gl/renderer.mjs` packers → `gl/shaders.mjs` QUAD_FS.
2. **The cell library** — the strip assets of `data/cellKinemes.js` (`ASSET_CELL_KINEME`: `mic_dial`, `mic_chevrons`, `mic_specbar_h`, `mic_specbar_v`, `mic_wave`, `line_squiggle_01` on line-boil, `line_squiggle_02` on wave-roll). These are ordinary instances (path 1) whose atlas cell holds a frame strip; step 4 already binds their line-boil to the world's clock in the renderer.
3. **The pattern stratum** — `pattern/patternSource.js` rasterizes pattern layers from `patternPalette(palette)` (swatches + bg + the palette's `ink` field); glyph-board ops (`pattern/glyph.js`, `pattern/engine.js`) mix stroked ops (`seg`, `ring`) and filled ops (`disc`, `poly`, `lens`) under one dealt per-tile role colour from the pattern colour walk.
4. **Region instances** — `gl/renderer.mjs` `expandRegionInstances`: a mark expands into a remainder + one instance per detected region (region records carry a stroke-shape test, `data/regionKinemes.js` `isStrokeRegion`), but expansion happens only for governor-selected region-animated marks, and every region instance inherits the mark's tint. Not a general line-colour path.
5. **DOM/UI drawing** — e.g. `curator/davisSigil.js` (2D-canvas strokes in a persona colour), component SVGs using the CSS `var(--ink)`. UI, not stage line work; the ruling's UI carve-out covers it.

The poem's letters are instances of letterform assets (path 1) — see the census in §3: letterform assets paint the ink slot with fills only, so the ruling's poem carve-out is consistent with every reading below and is not part of the ambiguity.

## 2. The architecture constraint (why the consumer cannot be per-element)

The live renderer cannot colour a stroke differently from a fill **within one asset instance**, and no consumer slice in this issue's family can change that:

- The atlas (live: `gl/liveAtlas.mjs`; stills: `gl/atlas.mjs`) bakes each asset's SVG with the ink slot (`var(--ink)`) as ONE mask and the accent slot (`var(--accent)`) as a second mask. QUAD_FS composes exactly: `color = inkA * v_ink + accA * v_accent + vec3(t.b)`, where `v_ink` is the instance's single tint and `t.b` is the base-grayscale mask for literal colours. All four texture channels carry meaning (R ink mask, G accent mask, B base, A alpha) — there is no free channel for a stroke sub-mask.
- Splitting the ink mask into stroke/fill sub-masks would be a texture-format + shader + parity change across both bakers and every golden that renders through them — a renderer-architecture build, not a consumer at a seam (compare the sibling slices: the Q1 blend is one helper at the `livingMotion` floor; the Q2 material consumer is one helper at `buildSceneContract`'s sun spread; step 4's ground/finish/boil are renderer reads of `contract.world` at existing seams).

So any buildable consumer recolours **whole instances**: an instance whose asset is "line work" takes `world.ink` as its tint while a world stands; every other instance is untouched. The entire question is the classification — and that is where the ruling's words and the library's facts diverge.

## 3. The census (measured on this head, `data/assets/index.js`, 985 assets)

Paint structure of each asset's ink slot (`stroke="var(--ink)"` vs `fill="var(--ink)"` in the asset SVG):

| ink-slot paint | assets | what they are |
|---|---|---|
| fill only | 813 | solid marks, glyphs, stamps — and **all letterform assets** (poem letters: fill-only, zero exceptions) |
| stroke only | 107 | pure line drawings: squiggles, outlines (`geo_circle_02`), rings/orbits (`rad_rings_01`), wireframes, Haeckel line plates |
| **both stroke and fill** | **46** | mixed drawings — §4 |
| no ink slot | 19 | accent-only / literal-colour assets (the crystalline set) |

Also: **44 assets paint strokes in the accent slot** (`stroke="var(--accent)"` — dashed connectors, needles, veins), a second population of "stroked lines" the ruling does not mention.

## 4. Where every candidate classification breaks

**(a) Category `linework`** (38 assets). Misses 72 of the 107 stroke-only assets (the geometric outline variants, radial rings/orbits, flora vines — all pure stroked lines that would keep dealt palette colours, against "stroked lines generally"), and includes 3 mixed assets. The category is curatorial, not geometric.

**(b) The existing trait rule** (`data/assetFacets.js` TRAIT_TAG_RULES: `line` ⇔ elong ≥ 0.6 ∧ stroke ≥ 0.6, over the baked traits in `data/assetDescriptor.js`). Excludes `mic_dial` (elong 0.018 — it is a round dial) and `mic_specbar_h/v` (fill trait 0.753 — the bars are filled rectangles), both cell-library assets; includes `stamp_num_01` (stroke trait 0.838 — a badged number, which #2150 ruled is graphics/signage, and whose fill is a digit).

**(c) Strict paint rule** (ink slot painted ONLY by strokes → line work). Clean for the 107 + the squiggles, but the ruling's own named family breaks it — **the cell library contains every paint class**:

| cell-library asset | ink strokes | ink fills | accent strokes |
|---|---|---|---|
| `line_squiggle_01` (line-boil) | 1 path | 0 | 0 |
| `line_squiggle_02` (wave-roll) | 1 path | 0 | 0 |
| `mic_wave` | 2 | 0 | 0 |
| `mic_chevrons` | 2 | 0 | 1 |
| `mic_dial` | 9 (ring + ticks) | **1 (the hub dot)** | 1 (the needle) |
| `mic_specbar_h` / `mic_specbar_v` | **0** | **5 (filled bars)** | 0 |

Under (c), `mic_dial` — a ring and ticks, the dial of the cell library — keeps its dealt colour over one r=4 filled hub dot, and the spec bars (filled bars, no strokes at all) can never be "lines". Under the opposite rule (any ink stroke ⇒ the whole asset takes the ink), the 46 mixed assets' **fills** take the ink too, against "fills keep the palette": the biosynthetic network drawings (`bio01`–`bio11`: stroked edges + filled node dots), `flora_sprig_01` and the flora set (stroked stem, filled bud), `rad_rings_02` (stroked rings, filled centre), `line_arrow_01/02` (stroked shaft, filled head), the riso stamps, `hae_coral_01`, `stamp_num_01`, `stamp_label_02`, `mrk_beast_01`. A dominance threshold (stroke share of the drawing ≥ some named constant) is a fourth rule, and the threshold itself is unruled — the mixed set is a continuum (`bio08`: 14 stroked elements, 17 filled), so any cut is a feel call wearing a number.

**(d) Patterns.** The glyph boards' stroked segs/rings are literally stroked lines drawn on stage, coloured by the pattern system's own dealt colour walk (one role colour covers a tile's stroked AND filled ops together). The ruling never mentions the pattern stratum, and step 4 bound only its clock — but "stroked lines generally" does not exclude it either. Including patterns recolours the entire bottom stratum's line work; excluding them leaves the stage's most line-dense surface in dealt colours. Unstated either way, and visible either way.

**(e) Accent-slot strokes.** If line work takes the ink, do the 44 assets' accent-painted strokes (e.g. `mic_dial`'s needle, the experimental assets' dashed connectors) also take it, or are they "the palette" (the accent is a palette colour) and stay? The ruling speaks of the ink slot's line work only by implication. Visible on common assets.

## 5. The questions for Matt (one at a time, in this order)

1. **The mixed drawings**: when one asset draws with both strokes and fills in its ink slot (46 of 985 — the dial's hub dot, the network drawings' node dots, a sprig's bud, an arrow's head), does the whole asset draw in the world's ink, or does it keep its dealt colour whole? (Per-element separation is not buildable in the current renderer — §2 — so the answer is per-asset, one way or the other.)
2. **The spec bars**: `mic_specbar_h/v` are filled bars with no strokes — are they "the cell library's lines" for this ruling, or not lines at all?
3. **Accent strokes**: do stroked lines painted in the accent slot take the world's ink too, or only ink-slot line work?
4. **The pattern stratum**: is the glyph boards' stroked line work in scope, or does the ruling cover stage marks only?

Questions 2–4 only bind if question 1's answer makes them live (e.g. if mixed assets keep their dealt colour whole, the dial/specbar questions decide the cell library's own fate and still bind). They are listed so the coordinator can put them one at a time, per Matt's standing rule — not as a bundle for the builder to decide.

## 6. The seam I would build on, once ruled (unbuilt)

For the coordinator's line order — the build, when the classification exists, is small and follows the sibling slices' discipline:

- A single-homed predicate over the asset library (paint-structure census like §3's, computed from the asset SVGs and pinned by a selfcheck census, the way `deriveLineInk` is a stated rule over palette data) in a data module — never a category or trait proxy (§4a/b).
- Consumption renderer-side at the pack seam (`gl/renderer.mjs` `packInstanceData` and its candidate twin), reading `contract.world` exactly as step 4's boil/finish reads do: while a world stands, a line-classified instance's packed ink is `world.ink`; no world → the dealt tint, same values, same contract, same hash. The contract itself is untouched (tint stays the dealt colour), so replayGate/creatureGate/allEraGolden see byte-identical contracts in every state, and takes re-derive the same frame from their recorded world.
- Selfchecks pinning: world stands → line instances pack `world.ink`, fill instances keep tint, poem-letter instances keep tint; no world → pack output identical to base; the classification census pinned by count and by named exemplars (squiggle in, disc out, the ruled mixed verdict pinned either way).

## 7. Verification

None run — no code was built, by the brief's own stop rule. The base tree is untouched except this report (see the git proof in the handoff). The publish ritual (decisive suites, manifest sweep, lint, format:check, build, before/after screenshots) runs with the build once the classification is ruled.

---

# BUILD — appended after Matt's rulings (2026-11-14)

## 8. The rulings, as given

All four §5 questions were ruled by Matt on issue #2104, 2026-11-14: Q1 (comment 6885709859) mixed stroke+fill assets keep their dealt colour whole — only stroke-only takes the ink. Q2 (6885717226) `mic_specbar_h/v` are NOT lines. Q3 (6885721723) accent-slot strokes keep their colour — the ink governs the ink slot only. Q4 (6885727268) patterns ARE in scope, same law, the TILE as the unit. Consolidated law: while a world stands, a unit (asset instance / pattern tile) whose ink-slot painting is strokes only takes the standing world's `ink`; fills, mixed units, accent lines, poem letters and UI are untouched; no world → exactly the pre-ink behaviour.

## 9. The seam as built

- **The predicate** — `app/src/data/inkPaint.js` (new): the paint-structure census of §3 as a module. `inkPaintStructure(svg)` counts `stroke="var(--ink…)"` / `fill="var(--ink…)"` occurrences in an asset's SVG string and classifies stroke-only / fill-only / mixed / none; `INK_PAINT_CENSUS` computes it over the whole library at module load; `inkPaintOf(id)` / `isStrokeOnlyInkAsset(id)` answer per asset, fail-closed ('none' → dealt colour kept) for unknown/custom ids. Never a category or trait proxy (§4). Poem letters are fill-only by construction (all 36 letterforms + every stamp face), so the poem carve-out holds without a special case.
- **Marks, live path** — `app/src/gl/renderer.mjs`: one helper, `effectiveInk(it, frameInk)`, is the single effective-ink decision. `renderFrameInto` sets a closure `worldInk` from `contract.world.ink` (null when no world); the per-layer `cellFrame` spreads `ink` only while a world stands (step 4's boilFps discipline); `packInstanceData` packs `effectiveInk` as the instance tint AND keys its baked-combo cell lookup by it; `expandRegionInstances` resolves region combos by the effective ink; `drawMeshes` resolves cell + tint the same way. The contract is never mutated — instance tints stay the dealt colour.
- **Marks, stills path (the candidate twin §6 named)** — the stills bake decides colours at bake time (`gl/atlas.mjs` substitutes the combo's real colours; the shader's mask recombination runs only under `u_liveTint`). So `app/src/gl/parity/glDriver.mjs` collects bake combos by the same law (`comboInk(contract, it)`: the contract's world ink for stroke-only instances, the dealt tint otherwise) at both collection sites (single frame and ACCUM sequence union). Packer key and bake key are the same decision, so the two paths cannot disagree.
- **Patterns** — `app/src/pattern/glyph.js` gains `STROKE_OP_TYPES` (ring, seg) + `isStrokeOnlyOps(ops)`, classified from a tile's BUILT ops, never its mark name (a capsule builds either 3 filled discs or one fat seg — only the ops know). `app/src/pattern/patternSource.js` threads the ink as a trailing optional parameter through `frame()` / `patternKey()` / `staticKey()` / `patternPixels()` / `patternBytesGL()`; `applyGlyphInk()` recolours a stroke-only GLYPH tile at plan build (its `rgba` + `roles` for every role the tile paints with via `motifRoles`, `used` recomputed; the ground never moves). Both keys spread `['I', ink]` ONLY while an ink rides, so world-less keys are byte-identical to base. The renderer passes its closure `worldInk` as the frame call's ink argument. The other modes (FIELD/QUILT/TIDES/REWRITE/BLOCKS/PICTURE) were determined from the code to have no stroke/fill op structure — their units are flat colour cells, fills by construction — and are untouched.
- **Boundaries determined, not invented**: the SVG parity reference (`gl/parity/reference.mjs`) contains no world consumption at all (zero mentions of `world` — no ground, grain, boil or ink), so it stays out of scope exactly as it was for steps 1–4. The live atlas keys cells by asset (mask bake), so the live path needed no bake change — the packer tint is its colour decision.

## 10. Files touched

- `app/src/data/inkPaint.js` — NEW: the paint-structure predicate + census.
- `app/src/data/inkPaint.selfcheck.mjs` — NEW: structure function (incl. Q3 accent-blindness), census pin {985 total, 107 stroke-only, 813 fill-only, 46 mixed, 19 none}, exemplars both sides of every ruling, the poem-face sweep.
- `app/src/gl/worldInk.selfcheck.mjs` — NEW: the pack seam (5 asset classes; only stroke-only packs the world ink; accents frozen; every other float identical; contract instances never mutated; strip-asset interaction; the stills combo-key behaviour — ink-baked cell found under a world, dealt bake awaited without one) + the pattern seam (changed pixels are exactly the ink colour and live only in stroke-only tiles; key behaviour; FIELD untouched).
- `app/src/gl/renderer.mjs` — `effectiveInk` + packer/expansion/mesh consumption + `worldInk` closure + cellFrame ink spread + pattern frame ink argument.
- `app/src/gl/parity/glDriver.mjs` — `comboInk` at both bake-combo collection sites.
- `app/src/pattern/glyph.js` — `STROKE_OP_TYPES`, `isStrokeOnlyOps`.
- `app/src/pattern/patternSource.js` — ink threading + `applyGlyphInk`.
- `app/src/pattern/patternRender.selfcheck.mjs` — ONE source pin re-pinned at full strength: the renderer's frame-call shape gains the ink argument (the pin's own narration extended: "and, since #2104 Q2, the standing world's ink").
- `app/selfcheck.manifest` — the two new suites, one line each beside `world.selfcheck`.

## 11. Verification evidence

- **New suites**: `inkPaint.selfcheck` OK (census reproduced exactly: 985 assets — 107 stroke-only, 813 fill-only, 46 mixed, 19 none; exemplars `line_squiggle_01/02`, `mic_wave`, `mic_chevrons`, `geo_circle_02`, `rad_rings_01` IN; `mic_dial`, `bio08`, `rad_rings_02`, `stamp_num_01`, `line_arrow_01` OUT as mixed; `mic_specbar_h/v`, `geo_tri_01` OUT as fill; every letterform + stamp face fill-only). `worldInk.selfcheck` OK (pack seam incl. the stills combo-key pins; pattern seam: seed-1234 GLYPH board, changed pixels exactly `toRgba(ink)` and only inside stroke-only tiles; world-less frame + keys byte-identical).
- **Decisive suites, re-run on the final tree**: world, sceneContract, replayGate, creatureGate, allEraGolden, cellKinemePlayback, regionLines, regionPlayback, glyph, patternRender (22 checks, incl. the re-pinned frame-call shape), rasterFast, canon, response, composite — all PASS.
- **Full manifest sweep** (continue-on-error loop over all 680 manifest commands): **676 PASS, 4 FAIL**, each failure accounted for:
  - `swarmWasm` — fails identically on a clean `ea4ebfa7` checkout (exit 1 both trees). Sandbox-environmental.
  - `rollSafety` — fails identically on base (exit 1 both trees). Sandbox-environmental.
  - `accum` — dies by signal on BOTH trees in this sandbox (base: SIGABRT exit 134; this tree: V8 heap OOM abort, exit 134; in the sweep it was signal-killed under the same memory pressure). Never reaches an assertion on either tree; CI arbitrates, per the standing sandbox note.
  - `liveLoop.dishFluid` — a live-frame MEDIAN assertion ("the body left as fully as it arrived"), load-sensitive: it failed in the sweep while other browser suites ran concurrently on the same box, and once more under post-restart load; run serially on a quiet box it PASSES on this tree (2 of 2) and on base (2 of 2). The slice's changes are colour-only and gated on a standing world, which this suite never sets. Verdict: intermittent load flake, evidenced — not a defect of this change.
- **Lint**: 0 errors (11 pre-existing warnings, none in touched files). **format:check**: clean. **Build**: green (`npm run build`, exit 0; no @resvg error — no new eager imports were added to the entry graph: `inkPaint.js` imports only the asset catalogue, and the renderer already imports data modules).
- **Source-shape pins**: `grep` of the selfchecks for the touched files found one standing pin on the old pattern frame-call shape (`patternRender.selfcheck`); re-pinned at full strength (§10). All other suites naming the touched files pass unmodified.


## 12. Screenshots

`~/workspace/goals/kinetic-curator-generative-art-instrument/hidden_files/ink-shots/{before,after}.png` — one fixed scene rendered through the parity candidate path by the base tree (before) and this tree (after): a GLYPH pattern board under a content layer, a world standing with ground `#101014` and ink `#b400ff` (praystation's own derived line ink). Before: line work in dealt yellow/teal/pink. After: every stroke-only unit — squiggles, rings, the circle outline, the board's line tiles — has taken the ink and reads as the magenta itself (their accent centre dots remain, per Q3); suns, X badges, letters, triangles and the spec bar keep their colours exactly. Measured diff: 16,642 of 700,000 pixels changed (2.38%), and every changed pixel lands on the ink colour family (183–184, 0, 204–205 after the display curve). A probe render with ink `#00ff00` (not a deliverable) made the reach visible directly, and an isolated six-instance `rad_rings_01` render showed every ring in the ink with only the accent centre dots keeping their colours.

## 13. Visible-change verdict

VISIBLE, as ruled: while a world stands, line work on stage — marks and glyph-board line tiles — draws in the world's ink. Fills, mixed drawings, accent lines, poem letters and UI are unchanged, and a world-less stage is byte-identical to base (replayGate / creatureGate / allEraGolden green; world-less pack output and pattern keys byte-identical by selfcheck).

