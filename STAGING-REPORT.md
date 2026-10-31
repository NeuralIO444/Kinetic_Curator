# STAGING REPORT — WETNESS slider power-2 taper

Matt's report (2026-10-30, his words): on the wetness slider "0 to 0.1 there is a sharp jump and the rest of the slider just makes it ugly." He asked what the fix is called (a taper — the slider→value mapping curve) and said "lets try it."

## Change (one file: app/src/panels/layout/AccumFamily.jsx)

- `wetTaper = getTaper('power', { min: 0, max: 1, exp: 2 })` beside the existing fadeTaper/glowTaper (#274 shared taper module, app/src/components/taper.js — the same mechanism GLOW already ships with).
- WETNESS TrailValue now passes `taper={wetTaper}`; its hover title gains one sentence naming the curve.
- Nothing else. Stored params stay physical — taper.js's standing contract: only the slider position is remapped at the panel→state boundary, so renders for any stored wetness value are byte-identical to before. Saved looks, sweeps, census and voices all see the same numbers they always did; only the drag feel changes.

Mapping (value = position²): wetness 0.1 sits at ~32% travel (was 10%), the wet regime 0.35 at ~59%, soaked 0.8 at ~89%. Full 0–1 range kept — no GLOW-style range cap, because the wet regimes are real stops across the whole scale.

## NOT done

- No other slider touched. TUNNEL/PRISM/CURL stay linear (no report against them).
- No engine change: liveLoop/liveResolve/particles untouched; wetFrame regimes unchanged.

## Verification (coordinator, composed tree on origin/main db31a36c)

- taper.selfcheck: OK (5 tapers, round-trip + spot checks)
- casingInCss.selfcheck: ok · helpCopy.selfcheck: OK (the two suites that read AccumFamily.jsx)
- `npm run lint`: 0 errors · `npm run format:check`: clean
- `npm run build`: exit 0
- `npx prettier --check src/panels/layout/AccumFamily.jsx`: clean

One note for the record: on a macOS/Node 22 sandbox, `dishWet.selfcheck`
fails a platform-dependent golden (actual 1422259026 vs expected
2258814921). It reproduces byte-identically on pristine `origin/main`
at db31a36c, so it is pre-existing and unrelated to this PR — CI's
ubuntu selfcheck job is authoritative and is green.

Review lane: Matt merges. His check is the drag itself — WETNESS should creep through the delicate low end instead of jumping, with soaked still reachable at the top of the travel.

## Composition note (coordinator, 2026-10-30, rebase onto Phase 1)

Strata Q Phase 1 (#1607, PR #1884) merged while this PR waited in the
review lane and converted WETNESS to a mode row. The taper composed
exactly as Phase 1's builder specified: Phase 1 authored the
accumulationWetness stops [0, 0.15, 0.45, 1] in this taper's space and
TrailValue already routes a `taper` prop through the exact editor
(toSlider on open, toParam on change, reset default mapped through the
taper). This PR now adds only the `wetTaper` definition and the
`taper={wetTaper}` prop on the WETNESS row — the mode taps write
physical stops as before; the square curve governs the exact editor's
slider, which is where fine wetness control now lives. Matt's check is
unchanged in spirit: open WETNESS's editor and drag — the low end
creeps instead of jumping.
