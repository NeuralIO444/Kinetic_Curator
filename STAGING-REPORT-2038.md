# Staging report — issue #2038

**Issue title (verbatim):** "Strata rebuild — one content layer, patterns pinned to the bottom, stipple + per-stratum rotation"

**Branch:** `feat/strata-rebuild-2038` at origin/main `d5632279`. Built in the dedicated worktree `~/workspace/kc-2038-build`. Not pushed, no PR — the coordinator publishes after independent QA.

**Commits:**

- `8be6e638` — feat(strata): the strata rebuild (47 files, +1548/−240)
- `4d41098b` — gl: rotateCopy turns clockwise as the stage sees it (drive-found sign fix, see §5)

No unruled fork was found in the issue body or comments; the comments are linkage notes only (Studio Assistant scope, the Canon set queued behind) and neither is build scope here.

---

## 1. Ruling by ruling

### Ruling 1 — ONE content layer; order PATTERNS/GLYPHS → one CONTENT → FX → MATH

- `MAX_CONTENT_TRACKS` is now **1** in both homes (`state/slices/layersSlice.js` and its mirror in `state/projectNormalize.js`), with a #2038 comment block recording the change under the #1609 history.
- New `canonicalStrataOrder(layers)` in `state/layerOrder.js`: a stable band partition — pattern (0) < content (1) < fx (2) < math (3). `addLayer` seats its result through it, and the load door re-seats through it (see §2).
- `canTrade` tightened to **exact type equality**. Previously two strata of adjacent bands could trade in one case, which let a pattern climb past content; with one stratum per band the order is now fixed, and the panel's ▲▼ move grouping in `LayerStack.jsx` is grouped by exact type for the same reason (patterns move among patterns only).

### Ruling 2 — Patterns pinned to the bottom, LOCKED

- The canonical re-seat runs at load (normalize) and at birth (addLayer), so a pattern can never sit above the content stratum in any state the app holds. CHAOS arms in `layoutSlice` were audited: they never construct content layers, and pattern births already inserted below the lowest content track; comment wording in `pattern/patternRoll.js` updated to the new law, mechanism unchanged.
- Verified live: `addPatternLayer()` on the boot stack produced the order `[pattern, content, fx]`.

### Ruling 3 — Field-mod stays in the CHIAROSCURO editor

- Verified, no change made or needed: this rebuild does not touch the field-mod pointer or the CHIAROSCURO editor. The Oct 16 reversal (#1609, shipped #1632) stands.

### Ruling 4a — FX stipple, built for real

- `fx/fxFilters.js`: `FX_EFFECT_DEFS.stipple` (label "Stipple"; params `cell` {1..8, step 1, default 3} and `amount` {0..1, step 0.05, default 0.5}); the EF-4 rack now offers it and **`stubs` is empty** — the "planned: stipple" note is gone from the editor UI. Stipple joins the grain family (`GRAIN_FAMILY_KINDS = ['grain','dither','riso','stipple']` in both fxFilters and the renderer's local mirror, which the fxFilters selfcheck pins in sync).
- Design: stipple is a **dot screen**, distinct from dither's Bayer weave and from the Materials stipple (#1549). Each screen cell (size `cell`) thresholds the tone at the cell's dot radius: per channel, a one-bit cut where the pixel's distance from the cell centre falls inside `sqrt(tone/π)` scaled by `amount`; alpha untouched; `amount` 0 is the identity. The SVG fallback (`buildStipple`) is the honest-approximation twin, mirroring buildDither's comment discipline.
- GL: `FX_STIPPLE_FS` + descriptor in `gl/effects/fxShaders.mjs` (cost tier 3). Registrations the sweep requires, all added: `hooks/sceneCost.js` cost id, `gl/effects/measuredCosts.mjs` measured entry (hand-added per the #1610 precedent), `gl/mlx/declaredCostTiers.json` tier entry, `panels/build/blockStops.mjs` stops for both params, `fx/efRackTile.mjs` tile face (STP).
- Verified live: adding stipple to the FX stratum visibly re-renders the frame as a fine halftone dot screen (25.8% frame diff at eco quality; screenshot inspected — dot grid breaks up marks and background alike).

### Ruling 4b — Per-stratum rotation 0/15/45/90

- New pure module `state/stratumRotation.js`: detents `[0, 15, 45, 90]`; the `rotation` key is **present on a layer only while non-zero** (absence = 0 — the feedsAccum/wetSoak byte-stability discipline, so unrotated documents serialize byte-identically to before). Non-detent values sanitize to 0 (dropped, never clamped); the string `'45'` coerces.
- Store: new `setLayerRotation(id, rotation)` action, wired end-to-end (eventBus `LAYER_SET_ROTATION` → registry → wireEventBus → actions → applyAction → store), undoable as a layers change. `duplicateLayer` carries the detent; normalize assigns `rotation` last so the round trip is byte-stable. UI: a ROTATE ModeRow (stops 0/15/45/90) in every stratum's expanded block in `LayerStack.jsx`.
- **Semantics — one law per stratum type:** a stratum's own contribution renders in a frame rotated θ° clockwise (stage convention) about the stage centre.
  - *Content:* marks are rigidly rotated at resolve (`rotateItems`: positions rotate about the centre and each item's own rotation gains θ; coalesce fields rotate too via `rotateFields`).
  - *Pattern:* the field texture is turned at composite time (`rotateCopy`).
  - *FX/MATH:* the wrap is seeded with the composite turned −θ, the effect chain runs in that turned frame, and the result is turned back +θ — picture geometry is untouched; only the effect's own field (e.g. an rgbSplit fringe direction) turns. Grain-family finish steps turn the same way at the finish seam.
- The scene contract carries the detent on layer entries and wrap entries only when non-zero, and `assertSceneContract` rejects any non-detent rotation.
- `liveLoop.mjs`: the accum finish path now routes through the renderer's `applyFinishChains` so rotated finish chains work there too; unrotated chains run the identical calls as before.

### Ceilings

- MATH/FX 4-active ceilings untouched (`MAX_FX_EFFECTS = 4`, `MAX_MATH_OPS = 4`); one FX track and one MATH track as before.

## 2. Migration law for pre-rebuild documents

**Law: trim on load, said out loud — never refusal** (house precedent: the #1609 skeleton trim). A document carrying two content strata loads with its **first** content stratum kept; each surplus stratum trims **by name** into `trims`, surfaced as `doc.layerTrims` → the pipeline-notices load receipt + a `console.warn`. After trimming, the stack is re-seated to the canonical order with its own warn.

Every restore door (project files, autosave, bundles, recipe stacks, takes) funnels through `parseProject → normalizeLayers`, so one door migrates everything. A patch addressed to a trimmed stratum survives as data but sanitizes to `to: null` (inert), exactly like a patch to a missing layer.

**Proof (selfchecks, fixtures are pre-rebuild-shaped):**

- `state/strataRebuild.selfcheck.mjs` (new, 14 checks): two-content fixture keeps the first, names the second in trims; parseProject receipt carries `layerTrims`; an interleaved stack re-seats patterns to the bottom.
- `projectDocument.selfcheck`: the #456 patch fixture's target trims by name (`layerTrims = ['content stratum "B"']`) and the patch row survives inert; a legacy 4-content Look loads as the first stratum only, trims naming Beta/Gamma/Delta (those names belong to the legacy-Look fixture, not the #456 one).
- `busChain.selfcheck` (14 checks): the recorded session fixture (PT-1/KC-1/FX 1/KC-2/M 1) loads migrated to `[PT-1, KC-1, FX 1, M 1]`, KC-1's patch survives, the stale KC-2 patch sanitizes inert.
- `recipeStack.selfcheck` (10 checks): a two-content carrier compacts to a stack holding one content stratum — the first — with no snapshot for the trimmed track.

## 3. Suites and sweep

**New suites** (registered in `app/selfcheck.manifest`):

- `src/fx/stipple.selfcheck.mjs` — **5 checks PASS** (def/rack/stubs-empty; grain-family seating; descriptor↔def parity + SVG compile + amount-0 identity; a JS transcription of the shader pixel: centre on, corner off, on-area ≈ π·tone/2; amount blend + alpha untouched).
- `src/state/strataRebuild.selfcheck.mjs` — **14 checks PASS** (cap 1 in both modules; migration fixture; parseProject receipt; canonical order stability; canTrade matrix; store refuses a second content stratum; rotation sanitize/store/duplicate/load round-trips byte-stable; rotateItems geometry — (110,50) on 200×100 at +90° → (100,60), i.e. right-of-centre lands below centre; contract detent + rejection of 30/12; pattern never active).

**Order/dice-sensitive suites** (strataRebuild, layerOrder, diceLanding): 5 consecutive runs each, **15/15 PASS**.

**Full manifest sweep** (continue-on-error loop): **626 pass / 16 fail**. Of the 16, **13 re-verified green on the final tree** (sceneCost, foldInCensus, blockStops, accum.seam, feedsAccumSurface, fxFilters, dither, fxShaders, composite, wetSoak, mlxExport, efRackTile, and livingMotion — its sweep failure was a wall-clock floor-cost budget, 3.07ms vs 2ms, under parallel load; solo on an idle machine it passes 15 checks). The **3 remaining fails are the standing sandbox-environment failures with exact base signatures**: swarmWasm (build-wasm.sh: cargo not found on PATH; no rust/** touched), rollSafety (exit 1 after exactly 5 [ok] lines, Chromium killed), accum (exit 134 native abort after exactly 69 [ok] lines). CI is authoritative for those three.

**Re-pins** — every one reconciled to the new law at full strength with the cause in the test comment; none weakened silently: projectDocument, layerOrder (12 checks), patternTrack (17), layersPlusPattern, undoLayers, busChain, diceLanding, recipeStack, tapeBudget, layerRows (5), foldInCensus (11), feedsAccumSurface (12), wetSoak (31), dither (7 — now pins stubs empty + stipple offered), fxShaders (15 — census includes stipple), accum.seam (7 — finish-path pin follows the applyFinishChains routing), composite (15 — RENDERER_PROGRAMS census is now eight, including 'rotcopy').

**e2e** (rewritten; not run locally — CI e2e-smoke is authoritative): `patch-row.spec.js` now pins the honest single-content behaviour (see §6.i); `patch-diag-interval.spec.js` churns the wet ModeRow on the standing KC block with the interval assertion unchanged; `fx-row-opens-editor.spec.js` section (3) now expects ADD to fall forward to FX once the content cap is reached. A grep of all of `e2e/` for other two-content/KC-2/stipple references found none.

**Format / lint / build:**

- `npm run format:check` in `app/`: **clean** ("All matched files use Prettier code style!") after formatting the seven files the build touched.
- Lint: **0 errors**; 11 warnings, all pre-existing in untouched files (react-hooks/exhaustive-deps).
- `npm run build`: succeeds; the drive build's footer read `build 4d41098b`'s predecessor `8be6e638` during the drive (footer = `git rev-parse --short HEAD`).

## 4. Live drive (sandbox Chromium, static dist + Playwright)

Verified live on the built app:

- Footer build hash matched the commit under test.
- `addLayer()` on the boot stack: content count stays **1**.
- `addPatternLayer()`: order becomes **[pattern, content, fx]** — patterns pinned to the bottom, live.
- Stipple: visible halftone dot screen across the frame (§1, ruling 4a).
- Rotation changes alter the presented frame substantially (12.8% pixel diff on a static scene with 0.00% idle drift; ~26% sustained diff with accumulation in play); zero page errors throughout (one `ERR_TUNNEL_CONNECTION_FAILED` console line is sandbox proxy noise on an external fetch, not an app error).

## 5. The drive found a real bug: rotateCopy's turn direction

The first committed version sampled with the pair `(cos, −sin)`, which turns the image **counterclockwise** on screen — the comment's v-axis reasoning was wrong (`v_cuv.y = 1 − stageY`, because GL textures are y-up, so the flips do not cancel that way). Caught by a standalone WebGL2 harness driving the **exact** `ROT_COPY_FS` + uniform pair through the renderer's own chain (paint a mark right of centre → turn → present): with `(cos, −sin)` the mark landed above centre; with the corrected `(cos, +sin)` it lands **below centre at +90°** and above centre at −90° — the same clockwise law the CPU `rotateItems` geometry check pins. Fixed in `4d41098b`; renderer and shader comments now carry the correct derivation. After the fix, composite (15), strataRebuild (14) and accum.seam re-ran green and prettier is clean on both files.

**Honest limit:** the full live scene in sandbox software GL (~1 fps, watchdog shed cuts, accumulation blending) is too unstable to visually certify the turn direction frame-to-frame — CW/CCW pixel-diff scores on the radial boot scene were statistically tied. The direction is therefore pinned at unit level on both paths (CPU geometry + the GL harness), and the coordinator's drive on real hardware is the place for an eyeball confirm.

## 6. Deviations, disclosed

1. **PATCH is unreachable by design under ruling 1.** A patch needs a second content stratum (`patch.to` can never validate with one), so cross-stratum patching is dead in any post-rebuild document. The UI already handles this honestly — the PATCH row reads "PATCH needs a second KC track" and both selects disable — and the rebuilt `patch-row.spec.js` pins exactly that. The cross-layer feed/mod machinery stays in the resolve path, inert for migrated documents (their patches sanitize to `to: null`). This is the ruling's own arithmetic, not a shortcut: with one content layer there is nothing lawful for PATCH to point at.
2. **studio/render.mjs** (dev-only parity reference, not shipped code): FX rotation there is the SVG sandwich — the filter runs inside nested counter-rotated groups. SVG filter-space semantics are the reference path's known softness; shipped stills are GPU. The module imports cleanly and the diff is a surgical 14/3 (an earlier wholesale prettier pass over that file was reverted; `studio/` is outside `app/`'s format scope).
3. **Rotation sampling is NEAREST** (all frame targets are NEAREST-filtered): a turned stratum keeps the instrument's crisp-pixel edge rather than gaining a bilinear blur. Deliberate.
4. **The trim warn text still cites #1609** ("trimmed to the fixed skeleton (#1609)"): the trim discipline is #1609's; only the cap value is #2038's. The layerOrder suite pins exactly one `/#1609/` warn, and the #2038 re-seat has its own separate warn naming this issue.

## 7. What was NOT touched

- Canon (#2044–#2049), top-bar legibility (#2050), Studio Assistant: linkage only, no build scope, per the issue's comments and the lane ruling.
- Field-mod / CHIAROSCURO editor (ruling 3).
- `MAX_FX_EFFECTS` / `MAX_MATH_OPS` ceilings; package.json (selfcheck registration went in the manifest, per repo AGENTS.md).

## 8. QA-fix addendum (post-QA, two findings fixed on top)

Independent QA passed the build's claims but measured two real defects; both are fixed in commits on top of the staging head (`a8057670`, `511f3ecf`), without rewriting history.

1. **GL rotation turned in normalized UV, not stage pixels** (`a8057670`). `ROT_COPY_FS` rotated `v_cuv − 0.5` with no aspect term, so texture-path strata (pattern composite turn, FX/MATH wrap seed/turn-back, finish chains) delivered a squashed angle: QA measured a mark 100px right of centre on a 1000×700 stage landing at 10.6° for the 15° detent, 35° for 45°, and non-rigid radii at 90°. Direction was correct (QA re-derived it); only angle/radius fidelity was wrong. Fix, as QA specified: the shader now rotates pixel-space offsets — `c = (v_cuv − 0.5) * u_res`, the same (cos, sin) matrix, sample at `r / u_res + 0.5` — with `u_res` added to the rotcopy upload list and `rotateCopy` passing `dstTarget.w/h`. The renderer/shader comments now state the pixel-space law. Pinned in `strataRebuild` (3 new checks, 17 total): a 1:1 JS transcription of the shader asserts landings against `stratumRotation.rotatePoint` at 15/45/90 on 200×100 and 1000×700 frames with radius preserved, and the −θ/+θ sandwich composes to the identity (picture geometry untouched); the transcription was verified to reject the old formula (8–43px misses on QA's probe).

2. **The ROTATE row's slider editor offered values the data law silently erases** (`511f3ecf`). The open editor was a `SliderEditor` (0–90, step 15) that also offers 30/60/75; those hit `sanitizeStratumRotation` → 0 and delete the rotation key. The detents are non-uniform, so no slider step can offer only detents. Fix: the open editor is the `StepperEditor` fed `stops={STRATUM_ROTATIONS}` — −/+ move to the adjacent detent via the new `steppedStopValue` in `modeStops.mjs` (clamped at the ends; an off-stop value lands on the first stop in the step direction; the stepper's uniform-step behaviour without stops is unchanged). Pinned in `layerRows` (2 new checks, 7 total): stepping from 0 walks exactly `STRATUM_ROTATIONS`, the old slider's 30/60/75 land on detents, and source pins hold the ROTATE block to the detent stepper with no `SliderEditor` left on the row.
