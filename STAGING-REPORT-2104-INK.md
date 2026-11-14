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
