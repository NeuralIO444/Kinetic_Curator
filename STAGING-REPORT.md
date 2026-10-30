# STAGING REPORT — #1608 Strata Q Phase 2: quantize the strata block editors

**Issue (verbatim):** "Strata Q Phase 2 — quantize the strata block editors"
**Branch:** `feat/1608-strata-phase2-blocks`, based on
`origin/feat/1607-strata-phase1-shelves` (0e8ad17e). Local only — no push,
no PR (coordinator publishes). This file replaces the report that was at
the worktree root (#1607's); that report remains in git history. The
"(DEFERRED)" language in the issue is stale — the lane was un-deferred
2026-10-30 and Phase 0's paper + Phase 1's component are this branch's base.

## What was built

Every bare RangeRow inside the strata blocks is now a mode row — Phase 1's
`ModeRow` component, extended with a **block seat** (`variant="block"`:
label · modes · exact readout on one line, in the flex place the slider
held) — plus the shelf tiles Phase 1 parked with this phase. One mode-row
component, two seats; no second component was invented.

- **Strata-composite rows** (LayerStack.jsx): WET (0..cap — stops authored
  for the full 0..1 range, scaled by the track's wet ceiling exactly as
  the slider's max was; readout keeps its `.layer-opacity-readout`
  address and % truth), PATCH strength ×3 (FEED/MOD/FIELD — one authored
  table; the row gains the exact readout the bare slider never showed),
  DISH bounce / repel / tempo (stops in PARAM_STOPS — they are layout
  params; only their rows live in blocks).
- **FX param rows** (FxEffectEditor, LayerStack.jsx): every param of
  every FX_EFFECT_DEFS kind renders a mode row from `FX_PARAM_STOPS`.
- **MATH param rows** (MathEffectEditor.jsx): every param of every
  MATH_EFFECT_DEFS op renders a mode row from `MATH_PARAM_STOPS`; the
  per-knob MOD selector (a discrete control) is untouched beside it.
- **PATTERN editor** (PatternEditor.jsx): density / mix / grout / hero /
  drift / movers are mode rows from `PATTERN_STOPS`; their dock editors
  keep the editor's percent space — percent in the UI, fractions in the
  store, exactly as before. The `kin` selector row is discrete and stays.
- **MotionTiles in BUILD** (HypeSliders.jsx): flap / breath / wind are
  mode rows via the shelf's `btn()` pattern (flap longhand — see re-pins),
  stops added to PARAM_STOPS. Gating strings, locks, and write paths are
  byte-identical.
- **The exact editor** for every block row is the value editor's docked
  seat (D2): tap the readout → the #1202 ValueDock with a SliderEditor at
  the param's own range/step, its shipped default wired as the
  double-click reset target — the reset the bare sliders' `onReset`
  used to serve.
- **Data law holds:** no write-path changes anywhere. Mode taps write the
  authored stop through the same bus events the sliders used
  (LAYOUT_PARAM / LAYER_SET_OPACITY / LAYER_PATCH / FX_EFFECT_SET_PARAM /
  MATH_EFFECT_SET_PARAM / PATTERN_PARAM); stored values stay continuous;
  dice/curator/governor untouched. Block summaries still show exact
  values in amber — `strataSummary.mjs` is untouched and its suite passes
  unmodified.

## Where the catalog stop tables live

- `app/src/panels/build/blockStops.mjs` (NEW) — `WET_STOPS` +
  `wetStopsForCap`, `PATCH_STRENGTH_STOPS`, `FX_PARAM_STOPS`,
  `MATH_PARAM_STOPS`, `PATTERN_STOPS`, keyed `${kind}.${param}` for the
  catalogs, with `fxStopsFor` / `mathStopsFor` / `patternStopsFor`
  lookups. Entry shape mirrors PARAM_STOPS (`{ stops, identity?,
  inverse?, bipolar? }`).
- `app/src/data/layout-modes.js` — PARAM_STOPS grows by the six layout
  params Phase 2 quantized: flap / breath / wind (hype family section)
  and contactRestitution / contactRepel / dishTempo (a new CAST section).
- The sign math is pure and lives with Phase 1's mode math:
  `bipolarStateFor` / `bipolarValueFor` in
  `app/src/panels/build/te/modeStops.mjs`.

## The sign cell (Phase 0 paper, stop-table law rule 6)

Bipolar catalog params — exactly rule 6's list: `gain.exposure`,
`lift.offset`, `tempTint.temperature`, `tempTint.tint`,
`hueRotate.degrees` (MATH) and `grade.hue` (FX). Their tables store
unsigned magnitudes `[0, low, mid, high]`; the row renders a `−`/`+`
TeaMatrix pair at its left. Tapping a magnitude applies it under the
row's current sign; tapping the sign cell flips the sign at the current
magnitude (a nonzero value negates through the same SET_PARAM event).
OFF is true 0 under either sign — `bipolarValueFor` never returns −0.
At exactly 0 the cell shows the *armed* sign (component-local state: the
sign the next magnitude tap will take); a stored nonzero value's own
sign always wins for display. A dice-written −1.5 on gain lights MID,
off-detent, sign `−`.

Class rulings applied beyond Phase 0's four named identity params, each
by the law's own definitions and flagged in the table comments:
`channelMix.r_to_r` and `levelsFixed.white` are identity class (the
shipped default IS the value at which the param contributes nothing —
red passes as red; levels untouched), OFF = the default, detents in
effect order. `posterize.levels` and `quantize.steps` are `inverse`
(rule 4: fewer = stronger, so OFF is the least-effect end and the stops
descend in effect order). Pure settings (seed, radii, thresholds,
density, roundness) follow Phase 1's plateRadius precedent: authored
stops ascending from the floor.

## MotionTiles + MixBar decisions (with grounds)

- **MotionTiles (flap / breath / wind) — CONVERTED.** Grounds: they are
  stored layout params in PARAM_SPEC with ranges and shipped defaults —
  the law applies honestly, with authored stops, default-is-a-stop, and
  magnitude-class OFF (at 0 each contributes nothing: no beat, no swell,
  no wind). Phase 0's exemptions list is closed and does not name them;
  tracker ruling D1 scopes the law to "shelves, block editors, tiles,
  MIX bar". The one cost is #716's glyph-as-display in BUILD; the
  MotionTile component and its glyph math remain live in STIMULI (the
  `life` tile), which the DS detent amendment does not reach.
- **MixBar — STOPPED under the premise rule, not converted, not silently
  exempted.** Grounds (code facts): MixBar is a transient crossfade
  scrubber over `state.voiceMix` that exists only while a voice MIX is
  in flight. It holds no stored param (no PARAM_SPEC entry, no catalog
  entry), has no shipped default, persists nothing, and its position is
  a *progress through a transition* that auto-advances — there is
  nothing to author a stop table against, and detents would break the
  scrub gesture that is the control's whole purpose. The stop-table law
  governs param controls; this is not one. The slider stays exactly as
  shipped, and `blockStops.selfcheck` pins that it stays (a recorded
  stop, not an oversight). If Matt wants the MIX position quantized, it
  needs a ruling of its own — flagged for the coordinator.

## Premise checks (stop-rule)

- **Catalog counts** — MATH = 12 ops, as the issue states. **FX = 14
  kinds, not 13**: `feedbackWarp` (#1490) joined FX_EFFECT_DEFS after
  QA counted 13 (2026-10-15). The issue's operative words are "*every*
  FX param (from FX_EFFECT_DEFS…)"; the build covers all 14 kinds
  (feedbackWarp's `amount` included) and the census suite pins the
  table against the live catalog so the next addition fails loudly.
  Recorded here rather than stopped: the count was stale, the intent
  unambiguous, and stopping would have left a param unquantized.
- **Composite rows as described** — TRUE, plus one the issue's list
  predates: the DISH group carries a third knob, TEMPO (`dishTempo`),
  as a bare RangeRow in the same block. Acceptance ("no bare RangeRow
  remains on the BUILD surface except Phase-0-named exemptions")
  requires it, so it is quantized with its siblings.
- **Phase 1's component API** — TRUE: ModeRow / modeStops / PARAM_STOPS
  / the dock all as the Phase 1 report describes; DockProvider wraps the
  whole BUILD panel (LayerStack included), so block rows open the same
  dock. Phase 1's open flag (the CHIAROSCURO section-editor tenants —
  SunControls' RangeRows, the MapRow AMOUNT button) is outside this
  issue's named surface (strata blocks), and SUN X/Y are exempt position
  params regardless; not touched.
- **No one-writer file is needed** — liveLoop.mjs / liveResolve.mjs /
  particles.js untouched.

## Re-pins (each with its cause)

1. **`e2e/fx-row-opens-editor.spec.js`** (budgeted) — the WET drive:
   `.strata-composite input[type=range]` no longer exists. The spec now
   taps the WET readout to open the exact editor in the value dock and
   drives the dock's slider (the Phase 1 cache-verify pattern), then
   presses Escape before the block-tap steps — the open dock overlays
   the panel's right edge, which the first run of the re-pin proved by
   timing out on the DUP click. Header comment updated ("wet slider" →
   "wet row"). **Passes in the sandbox** (31.5 s).
2. **`e2e/pattern-controls.spec.js`** (cause: same conversion) — exact
   values set via a `setExact` helper (readout tap → dock slider, with
   an Escape first because the open dock covers the next row's readout);
   the grout/hero honesty test now asserts on the readout button (name,
   disabled state, reason in its title) and forces a mode tap through
   the DOM to prove the disabled guard refuses it; the 44px test now
   measures the detent form (buttons ≥43px as before; mode cells +
   readouts ≥29px — the 44px law is RangeRow's per DS §2.1, the detent
   cell's shipped height is 30px from Phase 1). **6/6 pass in the
   sandbox.**
3. **`e2e/pattern-tides.spec.js`** (same cause) — movers' disabled state
   + reason asserted on the readout button; drift set via the dock.
   **Passes in the sandbox.**
4. **`e2e/patch-diag-interval.spec.js`** (same cause) — its render-churn
   source was `.strata-block input[type="range"]` (the opacity slider).
   It now taps the WET row's LOW/HIGH mode cells alternately — the same
   LAYER_SET_OPACITY write at the same super-1 Hz rate the test exists
   to survive; the interval assertion is unchanged. **Passes in the
   sandbox.**
5. **`patternEditor.selfcheck`** (budgeted) — the RangeRow count pin
   (6) becomes mode-row pins (density's own ModeRow + the five pctRow
   calls); the tone-loop pin is dropped with the RangeRows it scanned;
   the grout/hero disabled pins re-express against pctRow's options
   object (same strings, same order); the "percent in the UI, fractions
   in the store" pin now names pctRow's shared `setParam(id, key, v /
   100)`. All other checks (modes, density range on the dock editor,
   the dash readout, no native input, casing, LayerStack pins) pass
   unmodified.
6. **`motionGlyph.selfcheck`** (cause: the MotionTiles disposition) —
   the "#716 the four motion keys wear the tile" pin's BUILD half is
   re-pinned: flap/breath/wind assert as mode rows in HypeSliders and
   no `<MotionTile` remains there; the STIMULI `life` tile pin and the
   glyph-math test pass unmodified.
7. **`modeStops.selfcheck`** (extension, budgeted) — the PARAM_STOPS
   census grows by the six Phase 2 layout params, named as a separate
   BLOCK_LAYOUT_CENSUS list so a seventh cannot slip in silently; the
   default-is-a-stop check iterates the union. Every other law check
   covers the new entries through its generic loops, unmodified.
8. **New selfcheck** `src/panels/build/blockStops.selfcheck.mjs`
   (budgeted) + one manifest line after modeStops. 10 checks: the three
   catalog censuses against the live defs, the law clauses per entry
   (range, default-is-a-stop incl. every PATTERN mode default, OFF per
   class), the identity/inverse/bipolar census sets, WET cap scaling,
   PATCH's 0.16, the sign math, and the surface pins (mode rows in the
   three editors, no RangeRow left in them, tiles converted, MixBar's
   recorded stop).
9. **No other re-pins.** Notably `unlockTree.selfcheck` passes
   unmodified — flap is written longhand in HypeSliders because its
   gate reason is long enough that prettier wraps an object property
   (the census reads reason strings per line; a JSX attribute is never
   wrapped — the same form the MotionTile prop had). `rangeRow`,
   `spawn`, `foldInCensus`, `casingInCss`, `helpCopy`, `efRackTile`,
   `wetSoak`, `wetCeiling`, `feedsAccumSurface`, `strataSummary` all
   pass unmodified.

## Verification

- New/extended suites: `blockStops` 10/10, `modeStops` 11/11,
  `patternEditor` 6/6, `motionGlyph` 2/2.
- Full manifest sweep (Playwright chromium installed first, so browser
  sections ran at full counts): **537 pass / 3 fail**, the three proven
  environmental and none in touched territory:
  - `src/gl/accum.selfcheck.mjs` — aborted (exit 134, sandbox heap)
    inside the sweep; solo re-run with
    `NODE_OPTIONS=--max-old-space-size=3072` on this tree: **83/83,
    exit 0**. The build touches no gl code.
  - `src/fx/rollSafety.selfcheck.mjs` — fails identically on this tree
    and on the pristine Phase 1 base (0e8ad17e): same throw at
    rollSafety.selfcheck.mjs:231, outputs identical modulo the node PID.
  - `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` — fails identically
    on the pristine base (`build-wasm.sh --verify` — no cargo in the
    sandbox).
- e2e in the sandbox (vite preview + Playwright chromium):
  `fx-row-opens-editor` PASS, `pattern-controls` 6/6 PASS,
  `pattern-tides` PASS, `patch-diag-interval` PASS.
  `cache-verify` (Phase 1's spec, unmodified here) hits the 120 s
  timeout at its `setRange` evaluate — proven base-identical on my own
  run: the pristine Phase 1 base (0e8ad17e) in this sandbox fails at
  the identical call (`setRange`, spec.js:45:16 ← 105:9, same
  `locator.evaluate` timeout). A sandbox page stall, not the refactor —
  the four dock-driving specs above exercise the same readout→dock→
  slider path live and pass. CI's e2e-smoke job is authoritative.
- `npm run build` — green. `npm run lint` — 0 errors (11 pre-existing
  warnings, none in touched files). `npm run format:check` — clean
  (prettier --write applied to touched code files only).
- Dice-acceptance: a stored in-between catalog value renders identically
  (no write path changed) and displays nearest-mode + dot under its own
  sign — the math is pinned in blockStops.selfcheck (gain −0.4 →
  LOW-magnitude, off-detent, sign −).

## Files touched

- `app/src/data/layout-modes.js` — PARAM_STOPS +6 entries (data only).
- `app/src/panels/build/te/ModeRow.jsx` — block seat + sign cell
  (shelf behavior unchanged).
- `app/src/panels/build/te/modeStops.mjs` — bipolarStateFor /
  bipolarValueFor added.
- `app/src/panels/build/blockStops.mjs` — NEW (the catalog tables).
- `app/src/panels/build/blockStops.selfcheck.mjs` — NEW + manifest line.
- `app/src/panels/build/LayerStack.jsx` — WET / PATCH / DISH /
  FxEffectEditor conversions.
- `app/src/panels/build/MathEffectEditor.jsx` — param-row conversion.
- `app/src/panels/build/PatternEditor.jsx` — six-row conversion.
- `app/src/panels/layout/HypeSliders.jsx` — flap / breath / wind tiles
  → mode rows.
- `app/src/styles/panels.css` — `.te-mode-block` family (+ readout
  min-height for target parity).
- `app/src/panels/build/te/modeStops.selfcheck.mjs` — census extension.
- `app/src/panels/build/patternEditor.selfcheck.mjs`,
  `app/src/components/motionGlyph.selfcheck.mjs` — re-pins (above).
- `app/e2e/fx-row-opens-editor.spec.js`, `app/e2e/pattern-controls.spec.js`,
  `app/e2e/pattern-tides.spec.js`, `app/e2e/patch-diag-interval.spec.js`
  — re-pins (above).
- `app/selfcheck.manifest` — one line.
