# STAGING REPORT — #2497 (Stress 2026-11-24 A20)

**Issue (verbatim title):** "Stress 2026-11-24 A20: STIMULI modulation-matrix spinbuttons show [invalid] rounding mismatches"
**Branch:** feat/2497-a20 · **Base:** d605f92a (current main) · **Verdict shape: (a)** — stored values are lawful; only the field's declared validation law disagreed with them. One-line fix at the shared point (the one spinbutton every route row renders), plus an invariant pin.

## What was filed

P06 STIMULI → MODULATION MATRIX. Route 2: slider 0.15, spinbutton **[invalid] 0.154**. Route 3: slider 0.10, spinbutton **[invalid] 0.098**. Later routes showed clean values (0.45, 0.4, 0.35) after a look deal changed SCALE to 30%.

## Mechanism — the exact arithmetic

The flagged rows are routes 2 and 3 of the **shipped default table** (`app/src/gl/audioRoutes.mjs`, `DEFAULT_ROUTES`):

- Route 2: bass → `render.scale`, depth stored as the product **0.55 × 0.28 = 0.15400000000000003**
- Route 3: level → `render.scale`, depth stored as the product **0.35 × 0.28 = 0.098**

For `render.scale`, `routeDepthRange` (`app/src/data/audioRoutes.js`) declares **min −3, max 3, step 0.01**. The panel (`ModMatrix.jsx`) displays `shown = round4(depth)` — "0.154" / "0.098" — and bound that same grid step onto the row's `<input type="number">`.

A number input's `step` is a **validation contract**, not just an arrow increment: the browser flags `validity.stepMismatch` whenever (value − min) / step is not an integer.

- Route 2: (0.154 − (−3)) / 0.01 = **315.4** → stepMismatch → the accessibility tree's `[invalid]`
- Route 3: (0.098 − (−3)) / 0.01 = **309.8** → stepMismatch → `[invalid]`
- The clean values are exact grid multiples: 0.38 → 338, 0.45 → 345, 0.4 → 340, 0.35 → 335 — which is why only the two product routes ever flagged.

The slider beside them is a range input with the same step: the browser **sanitizes its value to the grid**, so it read 0.15 / 0.10 — the "disagreement" in the filed evidence is the two controls applying the grid differently: the slider silently snaps, the field displays the true value and then condemns it.

Reproduced natively in Chromium (Playwright, exact filed attributes): `step=0.01` → 0.154 and 0.098 both `valid: false, stepMismatch: true`, 0.38 valid; the range input sanitizes 0.154 → "0.15". No app code computes `[invalid]` — it is the browser's native validity, surfaced by the agent-UI snapshot.

## The true invariant

**A route depth is a continuous value.** Every authority in the codebase agrees:

- The one trust boundary, `sanitizeAudioRoutes`, clamps a depth to the target's ±ceiling (`ROUTE_TARGETS[target].clamp[1]`) and **never quantizes** — and it round-trips the filed floats byte-exact (pin group 3).
- The default table itself ships off-grid products (the two filed cells).
- The field's own `onChange` accepts any finite typed number; AUTO/RETUNE and DAVIS write computed depths through the same boundary.

The step grid is the **slider's stepping law** (how far a drag or arrow moves), mistakenly reused as the spinbutton's validation law. Branch (b) — quantizing storage to the grid — was rejected: it would rewrite the shipped defaults (0.154 → 0.15), silently round values a performer types, and change what values are reachable, which the brief forbids. Branch (c) does not arise: the precision law is defined and consistent everywhere except this one attribute.

## Precedent

`PersonaTunePanel.jsx` — the instrument's other float spinbuttons — declares **`step="any"`** on its number inputs (two sites) for exactly this reason: a continuous value carries no step grid. GovernorTunePanel omits `step` (integer-stepped fields); BehaveReadout pairs `step="0.01"` with a value it formats to exactly 2dp, so its displayed values are always on-grid. The matrix was the only surface whose stored values could lawfully leave its declared grid.

## Fix

`app/src/panels/stimulus/ModMatrix.jsx` — the route depth spinbutton now declares `step="any"` instead of `step={range.step}`, with a comment stating the law. Nothing else changes:

- **min/max stay bound** — range validation is untouched; an out-of-range value still fails (Chromium probe: 3.5 under `step="any"` → `rangeOverflow: true`, still invalid). Validity was corrected, not suppressed.
- **The slider keeps `step={range.step}`** — its stepping/snapping behaviour is unchanged, as is every value a performer can reach (typing already accepted any finite value; it still does).
- Display is unchanged: the field still shows `round4(depth)`.

One honest trade, recorded for the review: with `step="any"`, the spinbutton's native arrow buttons step by the browser default (1) instead of the grid step. The precision paths — typing and the slider — are untouched; this is the same trade PersonaTunePanel already ships.

## Pin

`app/src/panels/stimulus/modMatrixDepth.selfcheck.mjs` (manifest-registered after `stimuliAuto`), 5 groups:

1. **Filed cells, exact** — stored floats (0.15400000000000003, 0.098), displayed strings ("0.154", "0.098"), grid-step mismatch proven for both, clean values (0.38/0.45/0.4/0.35) proven on-grid, declared step is the continuous law.
2. **Panel source** — spinbutton declares `step="any"`, keeps `min`/`max`/`value={shown}`, no longer binds `range.step`; the RangeRow slider still receives `step={range.step}`.
3. **Storage** — the sanitizer round-trips both filed floats byte-exact.
4. **Sweep** — for every route target: defaults, new-route and AUTO starter depths, shipped-product values, and a 251-point ladder across each target's full range — displayed text parses back to the stored value at display precision (≤ 5×10⁻⁵, measured values in every assertion message) and validates clean.
5. **Bounds still bite** — the sanitizer clamps at the same ceiling the field declares; range attributes remain on the field.

**Discrimination (demonstrated, scratch worktree removed):** on pristine base d605f92a the pin fails in group 1 — `the spinbutton must declare the continuous law (declared: grid) for stored 0.15400000000000003`. On this branch: **5/5 groups pass**.

## Verification

- Pin: PASS (5 groups). Neighbours — every suite that reads `ModMatrix.jsx` or the audio-route family: `data/audioRoutes`, `gl/audioRoutes`, `stimuliAuto`, `masterGain`, `patternAudio`, `routesStartEmpty`, `bandFeed`, `casingInCss`, `trioLive`, `loisLines`, `agentUi/uiRegistry` — **11/11 PASS**.
- `runSelfcheck.selfcheck` (manifest consistency): OK. Full manifest sweep not run — no shared module changed (only the panel leaf, the new pin, one manifest line); the complete reader set of the touched file was run instead.
- e2e: `routes-matrix.spec.js` drives this field (fill/assert value only) — no validity or step expectations to re-pin; unchanged behaviour for its flows.
- `npm run format:check`: clean. `npm run lint`: 0 errors (11 pre-existing warnings, none in touched files). `npm run build`: exit 0 ("✓ built in 8.52s").
- One-writer files untouched (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js`).

## Lane recommendation

**Review lane.** The change is one attribute, but its effect is performer-visible: the depth fields stop flagging lawful values, and the spinbutton arrows' step size changes (see the trade above). Matt's eyes should confirm the matrix reads clean on the default table — Routes 2 and 3 showing 0.154 / 0.098 with no invalid state.
