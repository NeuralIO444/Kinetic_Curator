# Detent Budget — planning document

*Planning only. Not commissioned. No code. 2026-09-18.*
*Scope-freeze note: this is a parked design doc, not a build order. Nothing here ships until Matt says so.*

## 0. The idea in one paragraph

Sliders stop being continuous and snap to **detents** (4–8 chunky positions, synth-style). Each detent of each costly slider has a **measured GPU/CPU cost**. There is one visible **budget**: pushing a slider toward an expensive detent spends budget, and the *other* costly sliders' top detents grey out in real time — choose your battles. If the machine starts struggling, the Showrunner governor **clicks the budget down** (fewer detents available everywhere); when it recovers, detents come back. The product promise: **the instrument never chugs — it gets more limiting instead.** Constraint is legible in the hands, not a black box.

This is the governor-as-curator thesis made tactile, and the interactive form of two already-planned roadmap items: **R4** (show the tape running out — budget depletion in the PLAY readout) and **R3** (the BudgetKnob ceiling the governor defends).

---

## 1. Core mechanic

### 1.1 Detents

- Detents are defined in slider-01 space and mapped through the existing `taper.js` tapers (round-trip contract preserved) — detents land where the eye says they should, not at naive linear splits.
- Even detent counts per Matt's steer: GLOW 6, COUNT 8, FX/post blur radius 6, PARTICLES 6, DENSITY 4. Cheap sliders get detents for *feel* only (FADE 6, TUNNEL 4, PRISM 4 — zero budget weight).
- Stored values stay in physical units. A detent-snapped value is just a value that happens to sit on the grid — presets, projects, recipes, and the render manifest keep working unchanged in format.

### 1.2 Per-detent cost model

`costTiers.mjs` today gives one number per effect at one worst-case knob position. We need cost as a *function of slider position*, but only where position actually moves cost:

| Slider | Cost vs position | Verdict |
|---|---|---|
| GLOW (accum optics) | blur σ = 5·o, mip-chain LOD — strongly position-dependent | measure curve |
| COUNT | placement count → vertex/build work | measure curve |
| FX/post blur radius | ~590ms @ 40px vs ~10ms @ small — the steepest cost cliff | measure curve |
| PARTICLES | CPU sim scales with count | measure curve |
| DENSITY | keep-probability → effective placement count | measure or derive from COUNT |
| FADE, TUNNEL, PRISM, SCALE/ROTATE/ALPHA, JITTER, LIFE, stimulus | flat (buffer ping-pong / UV math / scalar) | no measurement; detents are feel-only |

How: extend `createCostMeasurer` to run **all** contract cases per effect using the existing PR #245 sweep infra (no new harness). Commit as `detentCosts.mjs`. CI gate stays max-only — curves are budget data, not gate input. Caveat: all numbers are headless-harness ratios until the M3 calibration runbook (#298) runs — ratios are fine for *ordering* detents, not for sizing the budget.

### 1.3 The global budget

- Unit: cost units (1 unit = 1× median measured ms — GPU-independent, portable).
- Derived from the **BudgetKnob ceiling** (FULL / SHOW / LEAN, already built): budget = Σ(detent cost at each costly slider's default) × multiplier (FULL 1.5, SHOW 1.0, LEAN 0.6). A new costly slider later auto-sizes the budget; no magic constants.
- **Two halves, different rules:**
  - *Proactive (performer-driven, deterministic):* pushing slider A up recomputes every other costly slider's available max detents from `(positions, budget)`. Same inputs → same outputs, no state, **no oscillation possible, no hysteresis needed**. Lowering any slider *always* works and frees budget.
  - *Reactive (governor-driven):* sustained effFps < 28 (reuse existing 1600ms sustain + 8000ms cooldown) steps the budget down in notches (100 → 75 → 50); sustained ≥ 30 steps it back up. **Separate thresholds, never shared** — the #259 permanent-shed-trap lesson applies verbatim. Regrowing the budget restores *available* detents only; it never moves a slider's current value.
- Flap guard: ≥3 shed/restore cycles per kind in trailing 120s → hold the lower budget and log.
- New governor cut kind between quality-tier and asset-thinning, with a `GOVERNOR_RESTORE_CUTS` entry, `SHED_STEPS` number, `shedSummary` label, X-ray row, and event-log records. The pure `nextGovernorCut` shape was designed for exactly this.

### 1.4 Shed rule (deterministic)

When the budget shrinks, detents are removed from the **most expensive currently-set detents first**. Constraints: never below detent index 1; never the slider currently being touched (queued until release); never FREE/CHEAP sliders' availability. Pure function of `(positions, budget)` — the X-ray view can show the exact computation.

---

## 2. Blast radius

- **Governor** — new cut kind + restore entry; reuses 28/30 thresholds.
- **Slider UI** (`RangeRow`, `taper.js`) — `detents`/`maxDetent` props, snap in `onChange`; PrintDesk POST chips get it free (same component).
- **Param firewall** (`PARAM_SPEC`/`validateLayoutParams`) — detent metadata + cap enforcement at the funnel covers sliders, recipes, project loads, randomize, morph/evolve targets.
- **Presets** — load as-authored (decision required, §6 Q3). Over-budget → red meter + "what would give" hints, never silent rewrite.
- **Audio** — no path change. Optics can't exceed the slider ceiling (#273) → audio respects detent caps automatically. Audio never steals detents on a transient; sustained breach handled by the reactive half. Meter shows an AUDIO segment.
- **Capture/export** — add `detentMap: "db/1"` to the manifest render spec. `edition_hash` churns for old projects by design (hashes exist to catch render-changing changes).
- **Davis engine** — morph/evolve/randomize targets quantized to detent grids. Not optional: off-grid engine output contradicts the instrument.
- **Undo** — no change (snaps are value changes; availability changes aren't).
- **X-ray / TapeCounter / MasterBar** — budget row + the segmented budget meter (this *is* TE-roadmap R4).
- **Help copy** — new DETENTS/BUDGET topic.
- **KC-1** — v1: single global budget (per-track budgets multiply complexity; the flat "track tax" is the later generalization).

**Explicitly untouched:** shader code, render math, existing shed order, `.github/workflows/`, project JSON schema, the watchdog.

---

## 3. Slider classification

**COSTLY** (detents + budget weight + measured curves): GLOW · COUNT · FX/post blur radius · PARTICLES · DENSITY.
**CHEAP** (detents for feel only, zero budget weight): FADE · TUNNEL · PRISM · SCALE/ROTATE/ALPHA · JITTER · NOISE SPEED · layer opacity · LIFE · stimulus · DAVIS timing.
**FREE** (no detents, no budget): palette mix seconds · physics sliders (several dead/neutered per the slider audit — classify after fixes land) · HUE ROTATE (broken per audit — fix first).

---

## 4. Where else "coarser, never slower" applies

- **FX slot count vs per-FX quality** (#341: 4 slots/track) — FITS. Discrete slots × per-FX detent quality is the same budget math on a different axis. Blur radius detents are the highest-leverage single application.
- **KC-1 track arming** — FITS, flat-tax model. Arming a track costs a flat budget chunk; MOD/FIELD/FEED patch strength gets detents. Single global budget for v1.
- **Asset resolution** — NEEDS THOUGHT. Needs multi-res atlas bakes for unclear gain. Park.
- **Capture resolution/framerate** — DOESN'T FIT. Capture is progress-driven, not realtime; it already has explicit res choices.
- **PrintDesk POST chips** — FITS for feel, not budget (export-time; governor coupling meaningless).
- **Palette mix / crossfade, layer opacity** — DON'T FIT budget (flat/~free cost).

---

## 5. Keeping it non-punitive — concrete UX rules

1. **The budget meter is always visible in the PLAY readout** — segmented bar: UI spend / AUDIO spend / headroom. The "why" is visible at the moment of limitation. Without this, cut the idea.
2. **Never reduce the available detents of the slider being touched.** Pointer-down freezes availability; queued click-downs apply on release.
3. **Greyed detents stay visible with a reason** (*"over budget — lower GLOW to unlock"*), never hidden. The limit is performed, not concealed.
4. **Reactive click-down only on sustained breach** (1600ms sustain, 8000ms cooldown, 28/30). No instant reactions to transients.
5. **Lowering any slider always works.** Only expensive moves are constrained.
6. **The ceiling is the performer's.** LEAN/SHOW/FULL via the BudgetKnob — the instrument never imposes LEAN unasked. Choosing FULL mid-set is the legitimate escape hatch.
7. **Presets load as-authored.** Over-budget → red meter + hints, never silent rewrite.

**Hard lock vs soft lock (Matt's taste call):** hard lock recommended — greyed detents can't be selected, period; the escape hatch is the BudgetKnob ceiling (a *chosen* constraint, tactile, never auto-cleared). Soft lock (selectable, governor sheds elsewhere) never stops the performance but reintroduces the black box this idea kills.

---

## 6. Phasing (dependency order, each an off-ramp)

- **P1 — Detent infrastructure (M).** `taper.js` steps option; `RangeRow` detent props; firewall enforcement; Davis engine quantized. No governor coupling. Shippable alone as performability UX — if Matt hates detents as a feel, stop here with no governor entanglement.
- **P2 — Cost curves + the meter (M).** Sweep all contract cases for the 5 costly effects; commit `detentCosts.mjs`; segmented budget meter in PLAY; proactive availability recompute. Needs the M3 runbook (#298) for honest budget numbers.
- **P3 — Governor coupling (L).** Reactive budget notches with hysteresis + sustain + cooldown + flap guard; new cut kind; mid-gesture protection; preset over-budget UX.
- **P4 — Polish (S).** Help-copy topic; TE naming pass; preset "what would give" hints; audio attribution segment.

## 7. Open questions

1. Hard lock on greyed detents (recommended, FULL as escape hatch) vs soft lock?
2. Should FULL/SHOW/LEAN map to fixed budget numbers, or auto-size to the machine's measured sustainable rate?
3. Preset over budget: load as-authored with red meter (recommended) vs clamp on load?
4. Per-track budgets for KC-1 in v1, or single global budget with a flat "track tax" (recommended)?
5. Detents on cheap sliders too (feel), or only the costly five (budget)?

## 8. Dependencies & risks

- **#298 M3 calibration:** budget *numbers* want real silicon; harness ratios suffice for ordering.
- **Slider-audit fixes:** HUE ROTATE broken, physics dead zones — classify after fixes land.
- **Risk — the "spreadsheet instrument":** meter + greys dominating attention. Mitigation: one segmented bar, quiet greys, tooltip reasons; PLAY stays glanceable.
- **Risk — preset shock:** beloved preset loading red-metered on weaker hardware. Mitigation: rule 7 + hints; red is information, not a block.
- **Not in scope:** predictive cuts, per-effect manual shed toggles, GOV TUNE resurfacing, FX-cull resurrection, new panels.
