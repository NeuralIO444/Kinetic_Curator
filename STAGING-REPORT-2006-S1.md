# STAGING REPORT — #2006 slice 1: the shadow review

**Issue:** feat(field): the review loop — LOIS and DAVIS judge the landed poem, and the ladder repairs the middle
**Slice:** 1 of 5 — shadow review only (spec §4.1; design ground §§3.1–3.4, §3.9)
**Branch:** `feat/review-loop-shadow-2006` · **Base:** origin/main `8e85f860` (#2005 clean plate via PR #2009; #2003 RAY GUN via PR #2007 beneath it)
**Status:** built, verified, NOT pushed (coordinator publishes). Nothing acts, nothing speaks: no adjustment, no re-deal, no CUT, no ticker line, no UI change of any kind. MegaMind untouched; no backend ask (slice 1 verdicts are `backend: 'rules'` by design).

---

## What was built

| File | Change |
|---|---|
| `app/src/curator/fieldReview.mjs` | NEW — the measure module + rules verdict table + exemption table + `reviewLanding` (the banked-record producer) |
| `app/src/state/slices/layoutSlice.js` | `fieldReview` session state beside `fieldGateRefusal`; `landPoem` banks the record on every fresh landing (HOLD carries it by; refusal/silence bank null); the CURATOR press banks its own (`stream: 'press:<n>'`); the four KINETIC passes thread the record through their commits (with the commit's own seed/pool where the commit changes them); `redealPoem` runs the deal with review off and clears the record when the form moves |
| `app/src/curator/fieldReview.selfcheck.mjs` | NEW — the slice's one suite (17 checks): hand-computed measure fixtures, verdict + exemption tables, store-path wiring pins, and the census |
| `app/selfcheck.manifest` | +1 line registering the suite |

## The measure set, as built

All four measures are pure functions of the **built item list** — the exact list `buildPlacements` returns for the landing's active layer (mirror and glass ordering already applied), rebuilt at deal time from the commit's own inputs (see premise translation T4). Boxes are axis-aligned, ignoring rotation — the stillborn gate's own simplification.

| # | Measure | Source data + formula | Gate (TUNABLE) |
|---|---|---|---|
| M1 | Self-overlap | Form items = built items keyed `field-<poetId>-<pieceId>-<j>` (mirror copies `-mx`/`-my`/`-mxmy` included). A glyph's ink box: half-width `(stampWidthEm(assetId, ch) · em / 2 / form.aspect) · canvasW`, half-height `(em / 2) · canvasH` — placement's rulers, the plate zone's formulas. M1 = Σ per-glyph pairwise ink intersections (capped per glyph at its own area) ÷ total form ink area | `REVIEW_MAX_SELF_OVERLAP = 0.05` |
| M2 | Mark cover | Non-form items in the same list; a mark's box is its asset box as drawn, ±50 × `scale` / ±50 × `scaleY` around its centre (QUAD_VS: `c = (au − 50) · scale` over the 100-unit asset box). Only marks **later in the list** (drawn over the glyph) count — see translation T2. Same capped-sum share of form ink | `REVIEW_MAX_MARK_COVER = 0.5` (spec §3.5's example line) |
| M3 | Coverage | Total form ink area (mirror copies' ink included — it landed) ÷ `canvasW · canvasH` | `REVIEW_MAX_COVERAGE = 0.35` · `REVIEW_MIN_COVERAGE = 0.0015` |
| M4 | Crop | Share of form items whose ink box crosses the dish boundary by more than `REVIEW_CROP_TOLERANCE_PX = 1` | `REVIEW_MAX_CROP = 0` |

Gate values are the spec's stated values where §3.2/§3.5 gives one (M2), stated initial values where it gives none (M1, M3 both bounds, M4) — all marked TUNABLE in code, all calibrated against below.

## The verdict table

First failing gate in measure order names the verdict; nothing failing is clean. Slice 1 never emits `cut`; `rung` is always `null`.

| Order | Condition | Verdict |
|---|---|---|
| 1 | `m1 > selfOverlap` | `janky` / gate `selfOverlap` |
| 2 | `m2 > markCover` | `janky` / gate `markCover` |
| 3 | `m3 > coverageMax` | `janky` / gate `coverage` |
| 4 | `m3 < coverageMin` | `janky` / gate `coverageLow` |
| 5 | `m4 > crop` | `janky` / gate `crop` |
| — | none | `clean` |

**Exemptions (Matt's rulings):** a landed form that is plated, raygun-treated, whispered, or banked as a keeper (`isPoemKept`) banks `{ verdict: 'exempt', exempt: '<reason>', measures: null }` — marked, never judged. Held forms never reach the review (HOLD passes deals by and carries the standing record). Re-deals are never reviewed.

**Record shape** (spec §3.4, in `fieldGateRefusal`'s discipline — top-level session state, written on the deal commit, never serialized, never undo-managed):
`{ verdict: 'clean'|'janky'|'exempt', gate, exempt, measures: {m1,m2,m3,m4}|null, gates: {…frozen gate values}, backend: 'rules', rung: null, seed, stream }` — `stream` names the exact seeded stream the deal drew from (`poem:<deal index>`; `press:<press>` for the CURATOR press, which does not advance `poemDeal`). Any verdict re-derives from its banked measures + gates (pinned in the suite, the loisJudge provenance idiom).

## The census (this slice's product)

From `fieldReview.selfcheck`, seeded corpora of real deals through the store's real deal paths, records collected on reference change so one landing is never counted twice. Every banked verdict in both corpora was re-derived from its record inside the suite.

**Census A — ordinary rooms** (seeds 201–260 × CURATOR press / look pass / voice pass / curator pass / voice pass): **152 landings, 152 judged, 0 exempt.**
Verdicts: **141 clean, 11 janky — all 11 `markCover`.**

| Measure | Observed | Gate | Margin |
|---|---|---|---|
| M1 max | 0.0000 | 0.05 | never fires without mirror (see census B) |
| M2 max | 0.7374 | 0.5 | a real tail crosses: 11/152 landings (7%) |
| M3 range | 0.0292 – 0.0548 | 0.0015 – 0.35 | ~19× above the floor gate, ~6.4× below the ceiling — both bounds sit in open space |
| M4 max | 0.0000 | 0 | no crops; structural (the gate keeps form ink on-dish, mirror reflects in-dish) — the census confirms the prediction |

**Census B — mirror rooms** (seeds 301–320, `mirror: 'x'` document state, CURATOR press): **20 landings, 20 judged.** Verdicts: **9 clean, 11 janky (6 `markCover`, 5 `selfOverlap`).** M1 max **0.3435** — the mirror is M1's manufacturer, exactly as spec §3.2 says (echo/mirror/layer scale are stage-made; of those, mirror is the one that acts on form items in the built list).

**Calibration finding #1 (for slices 2/3): the mirror's mark-cover floor sits AT the M2 gate.** In mirror-x rooms M2 ranged **0.4152 – 0.5000+**: a mirrored mark twin draws over its sibling half of the dish, so ~half the poem carries a mark box over it *by construction*, and the 6 `markCover` verdicts in census B were decided within float dust of the structural 0.5. A shipped gate at exactly 0.5 makes mirror rooms a coin flip; slice 3's tuning should either lift the gate above the mirror floor or read mirror landings' M2 net of the mirrored twin share. The gate is NOT moved in this slice — the brief fixes slice 1's gates at their stated values and makes the census the evidence.

**Calibration finding #2:** no exempt landings occurred in either corpus (plates need the solo room at its stillest; neither corpus stands in it). The exemption table is pinned instead with real dealt forms at the module level (a real `fieldDealReport` plate deal banks `exempt/'plate'` through `reviewLanding`; raygun/whisper/kept likewise on real forms).

## Premise checks & translations (spec → this tree)

- **P1 — `fieldGateRefusal` shape: as specced.** Top-level session-only state in `layoutSlice.js` ("Session-only, never serialized"), `{ reason, poetId, pieceId } | null`, written by every deal commit. `fieldReview` mirrors the discipline exactly.
- **P2 — #2003 raygun seam + #2005 plate register/zone: as merged, as expected.** `buildPlacements`' FIELD block (lines ~772–856) sanitizes the form, draws `raygun ? rayGunForm(form, form.raygun) : form`, and applies plate zone suppression to non-form items (`PLATE_ROOM_ALPHA 0.15`, `PLATE_ZONE_PAD_EM 0.75`, ink half-width from `stampWidthEm`). The review reads the same built list downstream of both.
- **T1 — the deal paths are two, not one.** Poems land via `landPoem` (all four KINETIC passes + `redealPoem`) AND via the CURATOR press's inline `fieldDealReport` in `curateUnlocked`. Both bank records; the press's stream is named `press:<n>` because it deals off `press + 0x30000` and never advances `poemDeal`.
- **T2 — M2 reads draw order (the one real translation).** The spec's literal reading (every mark in the list) saturates: on a 240-deal probe corpus its median was **0.93** and max **1.0** — mark asset boxes tile a busy dish while the poem still draws sovereign (form items append last in overlap rooms, scale-sort among marks elsewhere). No gate separates honest deals from jank under that reading. "Covered" is therefore read as a draw-order fact — only marks later in the built list (drawn over the glyph) cover it; the same corpus then spreads (median 0, p90 ≈ 0.25, tail to 1.0) and census A's gate tail is real signal (11/152), not saturation.
- **T3 — no ink ruler exists for marks.** `stampWidthEm` measures stamps; marks are atlas assets. A mark's box is therefore its asset box as drawn (QUAD_VS spans the 100-unit asset box at ±50 × scale), which overstates ink where a cell carries transparent margin — uniformly across builds, which is what a census-calibrated gate absorbs. Form glyphs use the exact ink rulers.
- **T4 — the review measures the COMMITTED build.** The landing is rebuilt with the commit's inputs: landed params, the commit's seed and pool where the commit itself changes them (`kineticRoll` rolls both in the same commit it deals — `landPoem` gained `buildSeed`/`buildEnabledAssets` for exactly this; look/voice passes pass their commit's pool), the resolver's pool assembly mirrored line-for-line from `liveResolve` (citizen + poem-only exclusions by id, weight overrides, shape-mix `mixWeight`), `getQualityCaps(state.quality)`, `growthTick 0`, `caGrid` as the commit would see it. Per-frame ephemera are excluded by design — life drift, breath overrides, kineme/travel/surge/parallax, dish-ground nudge, governor sheds (`assetThin`, perf-tier mirror-off, clamp overrides): a verdict depending on them could not be re-derived from its banked record (spec §3.8). The jank family Matt hit (mirror, layer ranges, hero scale, mark traffic) is entirely in the committed build.
- **T5 — swarm landings bank nothing.** In live swarm modes (`swarm`/`hype`/`murmuration`) the renderer never calls `buildPlacements` (the resolver routes to `swarmItems`), so a landing there has no built item list in the renderer's own terms. `fieldReview` stays null rather than banking a verdict about a build that never happens. Pinned in the suite (a `hype` landing deals a form, banks no record).
- **T6 — "strata echo" is not a form-item producer on this tree.** Spec §3.2's M1 note names a benign echo overlap; no echo path exists in `buildPlacements` (grep-verified), and form-item scale is set by `em` alone (strata ranges move marks, not glyphs). In the built list, M1's manufacturers are mirror (census B) and nothing else observed. Matt's original case — the poem overprinted through stage treatments — is caught by M1 (mirror) and M2 (treatments/marks drawn over) jointly; census A's 11 janky landings are that family on real deals.

## Re-pin account: NONE

No existing suite was re-pinned. Ordinary deals are byte-identical:

- placement census **560,366 passed, 0 failed** (unchanged)
- golden placement hash **e892d112b20d92b6…** (unchanged)
- `fieldBattery` replay **15 checks passed** (byte-identical)
- the suite's own replay pin: a CURATOR press replays bit-for-bit in landed params AND banked record

## Verification

- New suite: `fieldReview.selfcheck` — **17 checks passed** (~5 s), census output as transcribed above.
- Neighbouring suites run directly by file, all green: fieldDeal 5 · fieldPlate · fieldLiveDeal 9 · fieldSilence · poemRow 16 · rayGun 19 · fieldDirector 11 · fieldEval 6 · fieldKana · fieldKanji · fieldLatin · fieldStampPath · roundWiring 5 · loisCut 5 · trioAcceptance · goldenPlacement OK.
- Full manifest sweep (continue-on-error loop over `selfcheck.manifest`, 617 lines): **614 pass, 3 fail — all three failures pre-existing sandbox-environment failures, none caused by this change.** `swarmWasm` (needs `cargo`, absent from the sandbox PATH — direct cause shown). `rollSafety` and `gl/accum`: re-run against a fresh detached worktree at clean main `8e85f860` — `rollSafety` dies in its browser/GL section there too (`page.evaluate: Target page, context or browser has been closed`), while on this branch its "300 seeded chaos rolls" section — the one that drives `kineticRoll` + the shadow review 300 times — passes and the same browser section crashes the sandbox Chromium (`Target crashed`); `accum` aborts natively (exit 134) on clean main with the identical stack signature as on this branch. CI's selfcheck-browser job installs the pinned browser and is authoritative for those suites.
- `npm run format:check` — clean (prettier applied to the two touched source files). `npm run lint` — 0 errors (11 pre-existing warnings elsewhere; eslint on the three touched files is silent).
- e2e sweep: `fieldReview` / `reviewLanding` appear nowhere in `e2e/` (47 specs) — the change gives no existing word new meaning; the only new vocabulary is the session key and the record's fields, both invisible to the specs' surfaces.

## Files

- `app/src/curator/fieldReview.mjs` (new)
- `app/src/curator/fieldReview.selfcheck.mjs` (new)
- `app/src/state/slices/layoutSlice.js` (+93/−7)
- `app/selfcheck.manifest` (+1)
- this report
