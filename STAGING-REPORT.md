# STAGING REPORT — #1607 Strata Q Phase 1: quantize the BUILD shelves

**Issue (verbatim):** "Strata Q Phase 1 — quantize the BUILD shelves:
mode rows + stop table"
**Branch:** `feat/1607-strata-phase1-shelves`, based on
`origin/feat/1606-strata-phase0-paper` (0da9a3d6). Local only — no push,
no PR (coordinator publishes). This file replaces the report that was at
the worktree root (#1606's); that report remains in git history. The
"(DEFERRED)" language in the issue is stale — the lane was un-deferred
2026-10-30 and Phase 0's paper is this branch's base.

## What was built

Every continuous value on the BUILD shelves (§1–§4) now renders as a
**mode row**: the param's name + exact live readout over an
OFF · LOW · MID · HIGH TeaMatrix (DS §2 detent amendment, #1606).

- **New component** `app/src/panels/build/te/ModeRow.jsx` — TeaMatrix kin.
  A mode tap writes the authored stop value through the same
  `LAYOUT_PARAM` event every shelf control already used (no write-path
  change; `normalizeLayoutParams` untouched; stored values stay
  continuous). The readout keeps the exact value in amber beside the
  modes; a stored value that is not exactly a stop lights its nearest
  mode and that cell **wears a dot — the off-detent mark** (DS §2.1),
  rendered by a small additive `dot` option on `TeaMatrix`
  (`app/src/panels/build/te/TeaMatrix.jsx`) + `.te-dot` CSS. Lock pips,
  disabled-with-reason gating, and titles behave exactly as ValueButton's
  did.
- **Gesture per D2** — tap the readout opens the exact editor in the
  **#1202 ValueDock** (the value editor's docked seat per Phase 0's
  vocabulary — evolved, not replaced; no third popover). The dock's
  editors are the same SliderEditors as before, now with **double-click
  reset wired**: `SliderEditor` gained an optional `defaultValue`, passed
  through to the RangeRow, and every shelf editor passes its param's
  shipped default (in the editor's own units — percent editors pass
  default×100, tapered editors pass the taper-mapped default).
- **Converted shelves (38 params):** LayoutSliders (COUNT, JITTER,
  DENSITY, GROUND, EDGE, SHADOW, SNAP, WEATHER), SwarmSliders (PARTICLES,
  COHESION, GRAVITY, DAMPING, NOISE SPEED), HypeSliders (CREATURES, BODY,
  TIGHT, METABOLISM), AccumFamily's TrailValue (ECHOES, SCAN, LEAVE /
  TUNNEL / PRISM / FLOW fades, ACCUM FADE, GLOW, WETNESS, TUNNEL, PRISM,
  CURL), AppearanceSliders (CROOKED, SQUASH, GROWTH RATE, BRANCHING),
  MaterialSliders (GLASS ALPHA, PLATE RADIUS, WASH STRENGTH, WASH SPREAD,
  STIPPLE DOTS).
- **Exemptions kept as value buttons** (Phase 0's closed list): SCALE /
  ROTATE / ALPHA dual ranges and DIVERGENCE in LayoutSliders; PLATE
  CENTRE X/Y (position class) in MaterialSliders via an `exempt` flag on
  its `btn()` helper. HUE stays the dial inside CHIAROSCURO.

## The stop table — home and shape

`PARAM_STOPS` in `app/src/data/layout-modes.js`, immediately after
`PARAM_SPEC` (the home the issue names). One entry per shelf param:

```js
count: { stops: [10, 120, 240, 800], atlas: true },
damping: { stops: [0.95, 0.93, 0.89, 0.83], identity: true },
accumulationFade: { stops: [1, 3, 5.4, 20], taper: { kind: 'halfLife', minFrames: 1, maxFrames: 40 } },
```

- `stops` — the four detent values in OFF · LOW · MID · HIGH **effect
  order** (identity-class rows descend numerically on purpose: damping
  LOW→HIGH runs toward more friction; glassAlpha toward more
  attenuation, OFF = 1 = full rolled alpha kept).
- `identity: true` — OFF is the param's neutral, never its range floor
  (damping 0.95, glassAlpha 1, washSpread 1 — each ruled in a comment).
- `atlas: true` — law rule 7 flag on the ATLAS_AFFECTING shelf counts
  (count, particleCount, body).
- `taper` — the curve descriptor the stops were authored against, where
  one exists (accumulationFade half-life; GLOW power; WETNESS power —
  see the #1882 note). Stops themselves are stored in physical units;
  the selfcheck verifies their spread in taper space.
- The pure mode math (nearest mode, ties to the lower mode, exact vs
  off-detent) lives in `app/src/panels/build/te/modeStops.mjs`
  (`stopsFor`, `modeStateFor`) — the component's pure half, in the
  shiftLayer.mjs / ShiftRows.jsx pattern.

Every shipped default is one of its stops (0.6 cohesion = HIGH, 0.78
glass = MID, 1.05 plate radius = MID, 2.5 stipple = MID, 5.4 fade = MID,
0.95 damping = OFF), so a mode tap can always return to Matt's tunes.

## Re-pins (each with its cause)

1. **`e2e/cache-verify.spec.js`** (budgeted) — the opener selector
   `.te-value-btn` → `.te-mode-readout` for COUNT, with the comment
   rewritten: per D2 the test now opens the docked **exact editor** via
   the readout and drives its RangeRow as before (mode buttons only
   write authored stops, so the exact editor is the only surface that
   can set an arbitrary COUNT — which is what the test exists to prove
   reaches the cache).
2. **Tour wording** (the budgeted "helpCopy interaction wording" — the
   interaction copy lives in the tour, which helpCopy derives from):
   `src/data/tour.js` step `slider` body: "Drag any BUILD slider…" →
   "Tap a BUILD mode row — OFF · LOW · MID · HIGH — or tap its number
   for the exact value…". Step id/title unchanged (derived copy stable).
   No helpCopy.js entry described the shelf interaction, so no entry
   changed; `helpCopy.selfcheck` passes unmodified.
3. **New selfcheck** `src/panels/build/te/modeStops.selfcheck.mjs`
   (budgeted) + one manifest line after `shiftLayer.selfcheck.mjs`.
   11 checks: census exactness, exemptions absent, law clauses
   (default-is-a-stop, OFF per class, range bounds, atlas flags,
   taper-space spread), the mode math (incl. the dice case: wetness
   0.37 → MID, off-detent), and shelf wiring pins.
4. **No other re-pins needed.** Suites that source-pin the touched files
   all pass unmodified — notably `spawn.selfcheck` (pins HypeSliders'
   `btn('CREATURES', 'creatures'` shape and the editor's
   `min={0} max={4} step={1}` text — both preserved verbatim),
   `unlockTree.selfcheck` (pins the exact disabledReason census across
   the five shelf files — all strings preserved), `chiaroscuro.selfcheck`
   (AppearanceSliders still carries no `hueRotate`), `casingInCss`,
   `motionGlyph`, `foldInCensus`, `rangeRow`, `helpCopy`.

## Premise checks (stop-rule)

- **Phase 0 paper on base** — TRUE. plan.md carries the "Phase 0 paper"
  section (editor vocabulary, stop-table law, closed exemptions);
  DESIGN_SYSTEM.md carries the §2 detent amendment + §2.1 BUILD
  amendment, both citing #1606.
- **~48 shelf values** — TRUE as a census: 38 mode-row params + 3 dual
  ranges + DIVERGENCE + ROTATE SPIN (inside the dual's editor) + 3
  MotionTiles + HEROES ≈ the QA count. The stop table covers the 38.
- **The dock's current shape** — TRUE, with one discovery: the dock
  editor's double-click reset was **inert** on this base — SliderEditor
  never passed a `defaultValue` to its RangeRow, so D2's "reset survives
  inside the editor" did not hold anywhere in the dock. Wiring it is
  part of this build (above), not a premise failure.
- **Census not UI-coupled** — TRUE (QA §6; `paramCensus` iterates
  PARAM_SPEC; untouched).
- **§④ as #1632 leaves it** — the CHIAROSCURO shelf surface is the
  button; AppearanceSliders + MaterialSliders quantized as above.

## Scope boundaries (flagged, not built)

- **MotionTiles (flap / breath / wind)** — NOT converted. They are not
  ValueButtons and don't use the dock; the tile glyph *is* the value
  display (#716, pinned by motionGlyph.selfcheck). The Phase 0 paper's
  closed exemptions list neither exempts nor schedules them; plan.md
  parks their disposition with Phase 2. Converting them is a design
  decision, not a Phase 1 mechanic — flagged for the coordinator.
- **MixBar** — NOT converted. It is a transient crossfade scrubber over
  `state.voiceMix` during a voice MIX, not a stored shelf param (no
  PARAM_SPEC entry, nothing to author stops against).
- **CHIAROSCURO section-editor tenants** (SunControls' RangeRows, the
  MapRow AMOUNT value button) — NOT converted. They live inside the
  section editor, not on the §④ shelf; SUN X/Y are exempt position
  params regardless. If the law is read to reach inside the section
  editor, that is a separate call — flagged.
- **Bipolar sign cell** — no bipolar param exists on the Phase 1 shelves
  (the only one, phylloDivergence, is exempt); the sign cell is a
  Phase 2 catalog surface (gain / tempTint / grade). Not built.

## ⚠ #1882 interaction (coordinator: compose at publish)

PR #1882 (open, not on this base) adds a power taper to the WETNESS
slider in AccumFamily.jsx (per its brief:
`wetTaper = getTaper('power', {min:0, max:1, exp:2})` on the WETNESS
TrailValue). This build converts that same TrailValue to a ModeRow. The
two compose cleanly **if** the taper lands as an editor/display mapping
only:

- The stop entry for `accumulationWetness` was authored in exactly that
  taper's space (physical stops [0, 0.15, 0.45, 1] = slider
  0 / .39 / .67 / 1), and the entry records the descriptor.
- Mode taps write physical stop values — taper-independent.
- When composing: TrailValue keeps its current signature on this branch
  (no `taper` prop on WETNESS today). #1882's hunk adds the prop; the
  merged TrailValue must pass the taper to the editor exactly as #1882
  does, and the editor's reset target for WETNESS resolves to
  `wetTaper.toSlider(0) = 0` automatically through the existing
  taper-aware line in TrailValue. AccumFamily.jsx is the only file the
  two branches both touch.

## Verification

- `modeStops.selfcheck` — 11/11.
- Pin-sensitive suites run individually, all green: spawn, unlockTree
  (13 groups), chiaroscuro (10), foldInCensus (11), helpCopy,
  casingInCss, motionGlyph, rangeRow (7), shiftLayer.
- Full manifest sweep — 538 manifest commands run (continuing past
  failures; Playwright chromium installed first, so browser sections
  ran at full counts). Two failures, both proven environmental and
  neither in touched territory:
  - `src/gl/accum.selfcheck.mjs` — aborted (exit 134, sandbox heap)
    inside the sweep; solo re-run with
    `NODE_OPTIONS=--max-old-space-size=3072` on this tree: **83/83,
    exit 0**. The build touches no gl code.
  - `src/fx/rollSafety.selfcheck.mjs` — exit 1 in the sweep; solo
    re-runs on this tree and on the pristine Phase 0 base (0da9a3d6)
    fail identically — same throw at rollSafety.selfcheck.mjs:231,
    outputs identical modulo the node PID. Base-identical.
  - `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` — excluded from
    the continuing sweep after the first `npm run selfcheck` stopped
    there; verified separately: fails identically on this tree and
    the pristine base (`build-wasm.sh --verify` — no cargo in the
    sandbox). Base-identical.
  - Everything else passed, including the new modeStops suite (11/11).
- e2e `cache-verify.spec.js` (the re-pinned spec) — attempted in the
  sandbox: the re-pin itself works (the readout tap opens the dock;
  the range locator resolves to the visible COUNT editor, value 300),
  then `setRange`'s `slider.evaluate` hits the 120 s test timeout.
  The pristine Phase 0 base with the ORIGINAL spec fails at the same
  call with the same timeout — base-identical sandbox page stall,
  not a re-pin failure. CI's e2e-smoke job is authoritative.
- `npm run build` — green. `npm run lint` — 0 errors (11 pre-existing
  warnings, none in touched files). `npm run format:check` — clean
  (prettier --write applied to the one new selfcheck file only).
- Dice-acceptance: a stored in-between value renders identically (no
  write path changed anywhere) and displays nearest-mode + dot —
  asserted in modeStops.selfcheck (wetness 0.37, count 373, damping 0.91).

## Files touched

- `app/src/data/layout-modes.js` — PARAM_STOPS added (data only;
  normalize/validate/write paths untouched).
- `app/src/panels/build/te/ModeRow.jsx` — NEW.
- `app/src/panels/build/te/modeStops.mjs` — NEW (pure half).
- `app/src/panels/build/te/modeStops.selfcheck.mjs` — NEW + manifest line.
- `app/src/panels/build/te/TeaMatrix.jsx` — additive `dot` option.
- `app/src/panels/build/te/editors.jsx` — SliderEditor `defaultValue`.
- `app/src/panels/build/te/ValueButton.jsx` — header comment only.
- `app/src/panels/layout/LayoutSliders.jsx`, `SwarmSliders.jsx`,
  `HypeSliders.jsx`, `AppearanceSliders.jsx`, `MaterialSliders.jsx`,
  `AccumFamily.jsx` — shelf conversions.
- `app/src/styles/panels.css` — `.te-mode*` + `.te-dot`; `.te-cell`
  gains `position: relative`.
- `app/src/data/tour.js` — one step body reworded.
- `app/e2e/cache-verify.spec.js` — opener re-pin.
- `app/selfcheck.manifest` — one line.
