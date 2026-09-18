# Governor × Teenage Engineering — gap analysis, headroom, polish roadmap

*Plan only — no code. September 17, 2026. Grounded in main (`b5e2996`) plus PR #285 (`fix/264-265-governor`, open — restoration honesty + the corrected GPU-binding predicate; this plan coordinates with it and duplicates nothing). Feature freeze is in effect: everything below is refinement of the existing governor, no new features, no new panels.*

The manifesto already says it: *"The governor is the curator. Not a safety valve — a taste… Teenage Engineering builds the instrument; the enforcer asks 'what can we afford?'"* (`docs/MANIFESTO.md`). The governor is the most TE thing in the codebase in principle. In practice it still behaves like a failsafe wearing a TE costume. This report closes that gap.

---

## 1. TE-alignment gap analysis

What TE actually means for an instrument control: deliberate constraints as aesthetic (OP-1's 4-track tape), limits performed honestly *and* playfully, tactile controls, hard limits you choose. Against that bar:

### G1. Two overlapping honest indicators — the honesty is fragmented
`ShedBadge` lives in the footer (`App.jsx:249`): `⚠ shed · res 75% · assets thinned`. The MasterBar carries four separate pills: PERF PAUSED (watchdog), MOTION HELD (cut 6), RENDER FAULT (#266), LOAD SHED (tier 1) — plus the Q meter showing the tier and an FPS bar (`MasterBar.jsx:260-335`). Every one of these is honest. None of them agree on being *the* readout. A TE instrument has one tape counter, not five. The performer has to assemble the governor's state from three locations.

### G2. The constraint is all-or-nothing — `autoQuality` is a boolean
`QualityRow.jsx`: AUTO ON / AUTO OFF. Either the governor imposes cuts on its own schedule, or the performer flies blind with no governor at all. TE devices offer named limits you *choose* (4 tracks, 6 minutes of tape). The single TE-flavored control in the whole governor is the 30FPS frame-lock (`MasterBar.jsx:347-358`) — user-chosen, never auto-cleared, tactile button. It is the model citizen; everything else about the governor is imposed rather than chosen.

### G3. The ladder is invisible until it bites
The governor acts after `SUSTAIN_MS = 1600ms` below the shed floor (`usePerformanceGovernor.js`). There is no pre-shed signal — no "tape running out". The performer learns the budget existed at the moment it's cut. The event log and X-ray guide view exist precisely to make the governor legible, but both are dev-only (`import.meta.env.DEV`, `GovernorTunePanel.jsx`, `GovernorXrayPanel.jsx`). In production the governor is a black box with honest exit signs.

### G4. Clinical naming on the shed stages
The ladder's own labels (`governorCuts.js`): `resolution → 75% (dynamic render scale)`, `quality → BALANCED`, `asset thinning — highest-cost assets drop first`, `count clamp (live only) → 120`, `motion frozen (slowRender)`. Engineering strings. The pills are halfway there (MOTION HELD has voice; LOAD SHED doesn't). TE performs its limits with character — the constraint is part of the show, not a log line.

### G5. Quality tiers are technical, not creative
HIGH / BALANCED / PERF, and the MasterBar Q meter reads `Q HIGH AUTO`. A performer choosing a set doesn't think "balanced" — they think in show terms. The tiers are soft ceilings for interactivity (`data/quality.js`), but they're presented as spec-sheet entries, not as chosen constraints.

### What's already TE-right (don't touch)
- The 30FPS frame-lock: chosen, tactile, never auto-cleared. The template.
- Cut ordering as a contract: pixels before visible things, FX never culled (`governorCuts.js`). Deliberate limitation, honestly ordered.
- Render-only overlays that never serialize into project JSON: the governor never rewrites the performer's work.
- PR #285's restoration contract (`GOVERNOR_RESTORE_CUTS`, `qualityShedFrom`, `slowRenderSource`): a shed that can't un-shed is a trap, not a constraint.

---

## 2. Tech headroom assessment

### Where the cost actually is (measured, `gl/effects/measuredCosts.mjs`)
Harness-measured at 512×512, worst-case params — absolute ms are headless-harness numbers, **ratios** are what matter:

| effect | ms | note |
|---|---|---|
| accum/blur | 595.5 | the monster |
| builtin/blur | 590.5 | the monster's twin |
| everything else (16 effects) | 8.8 – 30.7 | grain 25, rgbSplit 26, displace 31, … |

**Blur is ~25–30× the cost of any other single effect.** Tier 2 ("quality scalers": turbulence octaves, blur radii) is where the GPU cost actually lives. The ACCUM chain passes are individually cheap (add 19, feed 23, fade 16, echo 16, copy 9, over 10, down 3.5) but numerous — the chain as a whole is the second cost center.

### What the ladder doesn't exploit
1. **No step targets blur/octaves directly.** They shed only inside whole quality-tier steps (octaves 3→2→1 via the tier). The single most expensive knob on the instrument has no dedicated cut — it's bundled with everything else in the tier.
2. **A coarse cliff between cut 1 and cut 2.** The resolution ladder bottoms at 0.33, then the next step is a full quality-tier drop. Asset thinning is binary (on/off). The count clamp is one step (70%, floored at 80). There is no graduated middle — it's full-res-or-tier-drop.
3. **The governor is purely reactive.** It acts 1.6s *after* the floor breaks. The cost registry + event log + measured costs contain everything needed to show budget depletion *before* the cut — but nothing reads them that way in production.
4. **All cost knowledge is harness-relative.** `measuredCosts.mjs` was blessed on the CI headless harness (`measuredAt: 2026-09-17`). The CI gate works on ratios-to-median, which is GPU-independent by design — but whether blur-vs-ACCUM ranks the same on Matt's M3 (the actual performance hardware) is unverified. The MLX cost-model weights and the Mac Studio runbook are still pending. The governor may be shedding the wrong thing first on the one machine that matters.

### What's genuinely cheap (don't "optimize")
- FX compositing: 10–50× headroom, correctly never shed (#192 killed the FX-cull ladder — do not resurrect it).
- Tier 3 cosmetic ops (invert, posterize, scanlines…): ~10–25ms each, shed-last is correct.
- Audio modulation: effectively free scalar math (tier 0).

### Single biggest headroom finding
**Blur/octaves dominate measured GPU cost by an order of magnitude, yet the ladder has no step that targets them — and every cost number the governor reasons from was measured on a headless harness, not the M3.** Real-machine calibration (Matt's runbook / `measure-costs` on the Mac Studio) is the cheapest big win in the governor's future: it may re-rank what "shed first" means on the performance hardware, and it either justifies a blur-first intermediate cut or proves the quality-tier step covers it.

---

## 3. Refinement roadmap (polish only, ordered)

Each item refines the existing governor. Nothing here is a new feature, a new tab, or a new panel — everything lives in the existing MasterBar/PLAY/OUTPUT surfaces.

### R1. One budget readout — the tape counter
Merge the ShedBadge, the four pills, and the Q meter's AUTO state into a single PLAY readout: one BUDGET meter in the MasterBar showing the current constraint state with the existing honest pills' semantics. The footer badge and the scattered pills retire into it. This is G1 fixed, and it's pure presentation — the ladder, thresholds, and event log don't change. (Coordinates with #177, which owns the full indicator design — this is the polish pass on that design, not a competing one.)

### R2. Name the shed stages like an instrument, not a log
Rewrite the shed labels (`shedSummary`, event-log labels, pill copy) with character: stages get performed names in the TE voice. Zero behavior change — the same cuts fire in the same order; they just read like the instrument talking, not the console. Cheapest item on this list; do it first. (G4.)

### R3. One honest performer-facing knob: the budget you choose
The 30FPS frame-lock is the template. Add exactly one knob beside it: a chosen performance budget (the existing quality tiers, renamed as deliberate creative constraints — e.g. FULL / SHOW / LEAN instead of HIGH / BALANCED / PERF) that the governor then *defends*, replacing the AUTO ON/OFF boolean with a chosen ceiling. The governor's job changes from "impose cuts" to "hold the budget you set" — which is the TE inversion, and it's a refinement of the existing `quality` + `autoQuality` controls in `QualityRow.jsx`, not a new surface. (G2, G5.)

### R4. Show the tape running out — budget depletion in the PLAY readout
Extend the existing FPS meter with a headroom readout driven by the cost registry + measured costs: how much of the chosen budget the current scene costs, so the performer sees the shed coming instead of being surprised by it. Refinement of the existing meter, not a new panel; the dev-only X-ray stays dev-only. (G3.)

### R5. Real-machine cost calibration
Run `measure-costs` on the M3 Mac Studio and re-bless `measuredCosts.mjs`; run the MLX cost-model runbook for the weights. Process, not code — but it may re-rank the shed order on the performance hardware and it settles the blur-first question in §2 with data instead of harness ratios. Do this before any ladder-step tuning.

### R6. (After R5, only if the data says so) A blur-first intermediate cut
If M3 measurement confirms blur/octaves dominate on real silicon, add one ladder step between the resolution floor and the quality-tier drop that sheds blur radii / turbulence octaves directly — the most expensive knob gets its own deliberate step instead of riding the tier. This is ladder refinement, not a new mechanism; if the data doesn't support it, kill it.

---

## 4. Killed as out-of-freeze (do not build)

- **A new governor panel or tab.** The X-ray and GOV TUNE stay dev-only; the performer gets the PLAY readout (R1/R4) and the one knob (R3). Anything needing a new surface fails the 7→4 consolidation.
- **Predictive/auto-shedding "AI governor."** Pre-emptive cuts are new behavior, not polish. R4 shows the depletion; the ladder still acts on its proven reactive contract.
- **Per-effect manual shed toggles for the performer.** The ladder owns shed order (that's the contract); handing the performer individual kill-switches is a new control surface and a new way to misconfigure a show.
- **Surfacing GOV TUNE to production.** Dev-only by design. The one-knob rule (R3) stands.
- **Resurrecting the FX-cull ladder.** Killed in #192 for cause (the silent-cull trap); FX compositing has 10–50× headroom. Do not touch.
- **New quality tiers or new ladder rungs beyond R6.** The ladder's order is the contract; R6 is the single evidence-gated exception.

---

## Sequencing

R2 (naming) → R1 (one readout) → R3 (the knob) → R4 (depletion meter) → R5 (M3 calibration, Matt's runbook) → R6 (only on data). R2–R4 are pure presentation/polish and compose with PR #285's restoration work; R5 is Matt's machine time; R6 is the only item that touches ladder behavior, and it's gated on measurement.
