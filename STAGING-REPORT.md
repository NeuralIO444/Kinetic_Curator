# STAGING REPORT — #1490 STIMULI: FX feedback warp (spectral path P4) (LOCAL ONLY — no push, no PR)

Branch: `ember/1490-feedback-warp` (local only — not pushed, no PR)
Base: verified stack tip `6f6fc387` (travel P1–P3 + the three reads)
(This file replaces the #1627 staging report at the worktree root; theirs remains in git history — the stack convention.)

**What was built:** the MilkDrop move from #1482's decision 5, as its own stage. The FX strata read the spectrum and the previous-frame feedback (the ACCUM recipe — the instrument's only previous-frame machinery) is warped by the music: **zoom from bass deviation** (the core's relative mode), **rotation from attenuated mids** (MilkDrop's `mid_att`), **decay mapped into 0.92–0.985**, **treble to chromatic aberration (prism) and grain** (the glow pass's stipple/chroma, lifted headroom-relative). One new pure module, one new FX item kind as the amount's address, one governor rung, and a three-line seam in the live loop's ACCUM step. No new panels (the item rides the existing FX rack editor), no new layout key, no contract key, no extra render pass.

---

## The core — `app/src/gl/spectrumWarp.mjs` (new)

- **`createSpectrumWarp()`** — the driver. Owns a per-bin attenuated state (`att`, 128 Float32 bins) stepped from the spectrum core's `smooth` levels with one frame-rate-independent exponential per bin (τ = 600 ms, the core's own coef form, dt clamped 0..200 ms like the core, silence snapped to exactly 0 with the core's SNAP). Derives per frame: `bassDev` (mean of the core's per-bin `rel` over the bass bins — centres < 250 Hz, the meter's sub+bass edges — **gated on bass actually sounding**: silent bass reads deviation 0, so a stale 6 s average can never hold the zoom off identity), `attMids` (500–2000 Hz), `attTreble` (≥ 4000 Hz), `attAll`, and `keep` = 0.92 + 0.065 × attAll.
- **`applySpectrumWarp(p, warp, amount)`** — the recipe combinator, sibling of `accum.applyAudioEnvelope` with the same contract (pure; null/zero amount returns the input field-for-field). Zoom and spin **add** onto the recipe's own transform (the artist's TUNNEL slider and the band envelope keep their say), decay **blends** keep toward the warp target by amount, treble lifts prism (≤ +0.0015 UV) and grain (optics lifted headroom-relative, recomputed through accum's `opticsDerived` — exported from accum.mjs for this, its only change there). Hard clamps: zoom ∈ [0.95, 1.05], spin ∈ [−0.05, 0.05], prism ∈ [0, 0.004], keep ∈ [0, 0.99]; `assertRecipeFinite` passes on hostile inputs.
- **`feedbackWarpAmount(layers, shed)`** — the amount's read: the largest `feedbackWarp` amount among visible FX layers, 0 when absent/0/hidden/shed, fail-closed on junk.

**Per-bin smoothing proof (suite §B):** the attenuated state is per bin and private to this pass — a hot bin's neighbours stay **exactly 0** after repeated steps (a block-smoothed variant, computed inline in the suite, leaks and would fail); an alternating hot/silent bin pattern survives 30 frames; the core's state arrays are byte-unchanged after a step (read, never written — spectrumMarks and every other consumer still see the unsmoothed analysis); 2×50 ms ≡ 1×100 ms to Float32 storage.

**Relax-to-neutral (suite §C/D):** at silence the driver returns bassDev 0, att* exactly 0, keep exactly 0.92 — so `applySpectrumWarp` at full amount changes **only** keep (blended to the band floor): identity warp, decay only, never frozen mid-zoom, exactly the brief's neutral.

## The address — why there is no dial and no new key

The amount lives on the FX stratum's existing item-param surface: an FX layer effect `{ kind: 'feedbackWarp', params: { amount } }` (`app/src/fx/fxFilters.js`: catalog entry with amount 0..1 def 0, EF-2 Distort rack slot, add-menu, `KIND_FACE` in efRackTile). Consequences, all suite-proven (§A):

- **Off-state documents never serialize it** — no `DEFAULT_LAYOUT_PARAMS` entry (asserted), `normalizeLayoutParams({})` invents nothing (asserted), and a scene contract built without the item contains no warp string at all (asserted). The key exists only inside a document that carries the item, where FX params have always lived.
- **No extra pass** — the kind registers **no GL shader** (`compileFxShaders` returns [] for it, asserted) and its SVG builder is the identity pass-through (asserted), with the live-only limit stated on the item, in the builder, and here: a baked export has no live spectrum to warp by — the spectrum COLOUR precedent (spectral-path.md P3). The warp's shader surface is the accum fade pass's *existing* transform branch, fed new uniform values.
- **Cost id** — `hooks/sceneCost.js` maps the kind to `gl/spectrum-warp` (its suite's both-ways coverage now passes; the suite's registration imports gained the module, its own stated convention).

## The live seam — `app/src/gl/liveLoop.mjs` (3 touch points)

1. One driver instance per loop (beside the ACCUM session state).
2. In `buildFrame`, beside the spectrum-marks read: `feedbackWarp = feedbackWarpAmount(s.layers, !!s.feedbackWarpShed)`, carried on the frame object like `accumAudio`.
3. In the ACCUM step, after `applyAudioEnvelope`: `if (feedbackWarp > 0) rp = applySpectrumWarp(rp, warpDriver.step(readSpectrum(), clampedDtMs), feedbackWarp);`

Amount 0 never steps the driver and never touches the recipe. The warp's only audio input is `readSpectrum()` — the spectrum core's state, which during a take is stepped from the recorded section by spectrumLive's playback path. **Determinism proof (suite §E):** a 240-frame analysis sequence warps identically across two fresh core+driver runs (exact deepEqual), and the take's path end-to-end — record 32-bin rows the way the take does (`quantizeSpectrum`), play them back through the real `beginSpectrumPlayback`/`stepSpectrumPlayback`/`readSpectrum` calls — produces an identical warp sequence on two independent playbacks, with the warp demonstrably live in playback (keep leaves the floor).

## Shed placement — cut 1.45, and why the laws all hold

Final governor order around the new rung: … renderScale (1) → **markWeather (1.4)** → **feedbackWarp (1.45)** → **creatureCount (1.5)** → travel (1.6) → quality (2) …

- "Sheds before body counts" — the warp (1.45) precedes the creature count (1.5) and the count clamp (5). ✔
- "Weather still dies before marks" — cut 1.4 is untouched and still precedes the warp; the warp is a finish, weather is the finer sacrifice. ✔
- "Creature count still sheds at 1.5" — its rung, code and label are unmoved; 1.45 slots *before* it without renumbering anything. ✔

Suite §F walks the full ladder under pressure and pins the sequence `[renderScale ×3, markWeather, feedbackWarp, creatureCount, creatureCount, travel, …]`. The rung is opt-in (`feedbackWarpActive`: item up + ACCUM on + not perfTier1 — no feedback buffer, no warp to shed), so callers that never raise it walk the pre-#1490 ladder exactly (asserted). Wiring: `feedbackWarpShed` overlay in `state/slices/globalSlice.js` (+ doc-load reset in `applyProject`, the other rungs' pattern), hook wiring in `usePerformanceGovernor.js` (active/shed/restore + deps), restore-table entry in `governorCuts.js`, badge line `feedback warp off` in `shedSummary`. **Event log:** `feedbackWarp` is not in `SHED_STEPS` — the table is known-incomplete (it also lacks 1.4/1.5/1.6) and was **not** "fixed"; the hook's existing guarded pattern (`recordCutEvent` drops kinds the log doesn't know) covers the new kind, the suite asserts the guard and both hook cases are present in the source, and the shed/restore/badge all happen regardless.

## Cost

Registered at the module: `gl/spectrum-warp`, **tier 1**, memoryBytes 0 (no pass, no texture, no FBO — four uniforms' worth of numbers into a recipe that already runs). `timeMs` declared 0.01, erring up: the CPU step **measured 0.002–0.003 ms/step** (per-step hrtime, median of 7 runs of 2000-step medians over a hot state, sandbox node 2026-10-20 — at timer resolution, so the honest statement is "a few microseconds"; the suite benches and prints it every run, asserting only the declared class). iPad: the step is 128 exponentials + 3 band means; the GPU increment is zero; the rung sheds it before the population under pressure.

## Byte-identity proof (the headline acceptance)

The three pin suites were run before and after this stage, untouched and un-re-recorded:

| suite | before (base tip `6f6fc387`) | after this stage |
|---|---|---|
| `engine/wingWarp` | FAIL — resolver rest pin: actual `dfb2915f` vs pinned `dc0897fb` | FAIL — **actual still exactly `dfb2915f`** |
| `gl/replayGate` | FAIL — firstMismatchFrame actual 0 | FAIL — **actual 0, same assertion, same shape** |
| `gl/creatureGate` | FAIL — firstMismatchFrame actual 0 | FAIL — **actual 0, same assertion, same shape** |

The failures are the inherited travel-key state from the brief; this stage moved none of them by a byte. Structural reasons, suite-asserted in §A: no layout default key, no contract key, no recipe key, no FX chain step, and the recipe combinator is a field-for-field identity at amount 0 / null warp.

## Files touched

**New:** `app/src/gl/spectrumWarp.mjs`, `app/src/gl/spectrumWarp.selfcheck.mjs` (88 checks), `STAGING-REPORT.md` (this file, replacing #1627's per stack convention).

**Edited:** `app/src/gl/accum.mjs` (`opticsDerived` exported + comment — nothing else), `app/src/gl/liveLoop.mjs` (imports, driver, frame field, gated accum-step seam), `app/src/fx/fxFilters.js` (kind def, EF-2 slot, menu, identity SVG builder), `app/src/fx/efRackTile.mjs` (tile face), `app/src/hooks/governorCuts.js` (cut 1.45 + restore + badge), `app/src/hooks/usePerformanceGovernor.js` (rung wiring + log-guard comment extended to 1.45), `app/src/state/slices/globalSlice.js` (`feedbackWarpShed` overlay + doc-load reset), `app/src/hooks/sceneCost.js` (kind → `gl/spectrum-warp`), `app/selfcheck.manifest` (1 line appended — package.json untouched).

**Selfcheck re-pins (deliberate, each commented in place — the suites are designed to force the decision):** `hooks/governorCuts.selfcheck.mjs` (restore-table order gains `feedbackWarp` between `markWeather` and `creatureCount` — the same re-pin #1694/#1574/#1627 each made), `fx/fxFilters.selfcheck.mjs` (add-menu pin gains `feedbackWarp`), `fx/efRackTile.selfcheck.mjs` (the ≤1-control list gains `feedbackWarp` — "must be added here on purpose"), `hooks/sceneCost.selfcheck.mjs` (registration-import list gains the warp module).

**Not touched:** the spectrum core/live/marks modules, the renderer, sceneContract, any layout-param defaults or bounds, the pin suites and their fixtures, Q2/Q3/Q4, #1567, #1627 S1.

## Verification

- `npm run build` — green. ESLint clean on every touched file.
- New suite: `gl/spectrumWarp` — **88 checks green** (A address/off-identity, B per-bin, C mapping/neutral, D recipe composition, E replay determinism, F governor order, G cost + bench print 0.0025 ms).
- Affected families (run individually): spectrum core/live/marks ✓ · spectrumRecord ✓ · accum inventory/seam/guard ✓ · governorCuts ✓ · governorCreatureShed ✓ · governorHostileScene ✓ · governorEventLog ✓ · costTiers ✓ · sceneCost ✓ (after the mapping above) · fxFilters ✓ (after re-pin) · fxShaders ✓ · fx.upSlots ✓ · efRackTile ✓ (after re-pin) · markWeather ✓ · phase6 ✓ · mlxExport ✓ · sceneContract ✓ · liveResolve.determinism ✓ · projectDocument ✓ · overlayRoundtrip ✓ · layerOrder ✓ · undoLayers ✓ · director ✓ · grainFinish ✓ · bridge/fxUniforms ✓.
- `gl/accum` — all node-side recipe/mirror checks pass, then the suite **aborts (exit 134) in its headless-browser section**: the known sandbox browser signature from the brief (baseline-proven both ways). This stage's accum.mjs diff is the `export` keyword on `opticsDerived` plus a comment — shown in the diff, incapable of the abort.
- Full manifest sweep (every manifest line run individually, 2026-10-20): **490 pass / 6 fail of 496 suites**. The 6 failures are exactly the brief's known set: the 3 inherited pins (`gl/replayGate`, `gl/creatureGate`, `engine/wingWarp` — shapes unchanged, see the pins table), the known sandbox set (`fx/rollSafety` browser signature, `gl/accum` browser abort, `engine/kernel/bake/swarmWasm` missing cargo). The new suite passes inside the sweep. No other failure is mine.

## Exceptions

1. **Three deliberate selfcheck re-pins** (governor restore order, FX add-menu, EF ≤1-control list) + one registration-import addition (sceneCost) — listed under Files touched, each commented in place with its reason. No golden was weakened; no pin suite was re-recorded.
2. `gl/accum` sandbox-browser abort — classified above, not chased, per the brief's known state.

## Forks

1. **Exports/stills do not warp.** The warp is live-only (its input is the live/recorded spectrum; `renderAccumSequence` takes no spectrum). This matches the spectral path's own stated limit for COLOUR ("live-path only… stated on the section") and the item's hint says so. If Matt wants warped stills, the follow-up is one opts field on `renderAccumSequence` carrying a recorded spectrum section — the driver's step is already pure and replay-proven, so that PR is plumbing, not design.
2. **No dedicated STIMULI dial.** The amount's address is the FX item (the brief's binding interpretation: ride the FX item-param surface; a layout key would have moved the resolver pins, which the brief forbids). The SPECTRUM section in STIMULI is unchanged; if Matt wants a STIMULI-side amount as well, it must write the FX item's param (the layer-editor path), not a layout key — recorded here so the next stage doesn't re-derive the constraint.
3. No other forks: every scope checkbox has a built, suite-proven mechanism — FX strata read the spectrum (amount + live seam), zoom/spin/decay/treble mappings (suite §C/D), per-bin smoothing in the feedback pass only (§B), a cost tier the governor sheds before body counts (cut 1.45, §F), byte-identical when off (pins table + §A).
