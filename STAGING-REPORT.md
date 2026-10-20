# STAGING REPORT — #1627 The three reads (LOCAL ONLY — no push, no PR)

Branch: `ember/1627-three-reads` (local only — not pushed, no PR)
Base: verified stack tip `ca9d903e` (#1576 travel kinemes P3)
(This file replaces the P3 staging report at the worktree root; P3's remains in git history — the stack convention.)

Build order per pinned roadmap #1647: **S2 meter → S1 weather → S3 duel**. All three slices built; both kill criteria evaluated on evidence (below). **No new recipe keys were added by any slice** — S2 is measurement, S1's weather is derived state that never enters a recipe, S3 rides existing pick inputs — so the travel stages' strip-proof burden does not grow here. No new panels. The #1183 WEATHER dial, `weatherAir`, and `dishWeather` are untouched, as are Q2/Q3/Q4 (unruled) and dither (#1610).

---

## S2 — The read meter (census family) — BUILT, gate PASSED

**What:** a cheap scale-band measure over the composed still's raster. `readMeter(pixels, w, h)` builds a variance pyramid (ink-energy map = alpha × luminance; ×2/×8 box pyramid): **fine** = mean sq. residual erased by one halving (grain, stipple, dust), **mid** = residual between the ×2 and ×8 levels (second-exposure texture, rhythm, ground), **big** = variance of the ×8 coarse map (silhouette/hero mass). Shares are fractions of total band energy; verdicts are named thresholds on the shares (`BALD_FINE_MAX 0.03`, `MUD_BIG_MAX 0.08`, `TOP_HEAVY_BIG_MIN 0.93`, top-heavy checked first — rationale and measured scale recorded at the constants in `readMeter.mjs`).

**Placement:** Node-side only, on purpose — an in-app params-space approximation could not stay honest (it would be a vibe wearing the meter's name), so there is no in-app meter; the in-app surface is the census readout reshaping measured rows. Corpus scenes are composed through the census's own still pipeline (miner SVG → Resvg at 500 px, the matstill precedent) in `censusReport.readsMetric()`; the formatted census report gains a "three reads" section; `censusReadout.readsView()` reshapes rows for display and stays absent when unmeasured.

**Kill-criterion evidence — separation on the named corpus (measured 2026-10-20, sandbox):**

| scene | marks | big | mid | fine | verdict |
|---|---|---|---|---|---|
| bald (14 flat plate marks, scale 1.0–1.6) | 12 | 0.894245 | 0.089577 | 0.016178 | **bald** |
| mud (400 tiny specks, no silhouette) | 315 | 0.054810 | 0.206504 | 0.738686 | **mud** |
| balanced (3 strata: plate heroes + stipple company + single-dot dust) | 371 | 0.820772 | 0.131683 | 0.047545 | **balanced** |
| top-heavy (3 huge plate marks) | 8 | 0.967640 | 0.027865 | 0.004496 | **top-heavy** |

Margins: fine separates balanced from bald **2.9×** (0.0475 vs 0.0162); big separates balanced from mud **15×** (0.821 vs 0.0548); fine separates mud from top-heavy **164×**; big separates top-heavy from balanced by **+0.147**. The corpus repeats bit-identically. **The kill criterion did NOT fire: S3 has an honest judge, and S3 was built.**

Suite: `src/curator/readMeter.selfcheck.mjs` — **36 checks** (synthetic rasters metering as constructed, corpus separation pinned, readout honesty). Registered in `app/selfcheck.manifest`.

## S1 — Weather (mark-born motes) — BUILT

**What:** `engine/markWeather.mjs` — a seeded, step-clocked mote store (`createMarkWeatherStore`, keyed by scene + seed, locked `TRAVEL_STEP_SEC` banking exactly like travel/surge; spawn rolls are hashes of (seed, step, kind, source index); no clock, no `Math.random`). Motes spawn only from criteria the engine already measures, handed in per frame by the caller:

- **beam** — the sun's highlight/spec pool (`data/light.js` sun: spec × intensity, marks inside `BEAM_RADIUS_SHARE` of the sun); beam motes rise slightly and **die in shadow** (grace `SHADOW_GRACE_STEPS` outside the beam).
- **pressure** — dish-density peaks (`engine/dishDensity.mjs` share ≥ 0.75 under a mark — #1538's measured field).
- **trail** — traveling marks (travel P1–P3: `deformAmt > 0` stretch stamp, or > 6 px from a caller-supplied home).
- **contact** — caller-supplied dish contact points with energy.

Advected by the existing FLOW field (`gl/flowField.mjs` build/sample, the project-seed curl table). **Caps:** `MARK_WEATHER_CAPS { desktop: 240, ipad: 120 }` in `data/quality.js` (the device-budget file, read via `markWeatherCapForDevice`); the cap sheds oldest first. **Governor:** new rung **cut 1.4** in `hooks/governorCuts.js` — ahead of creature count (1.5), travel (1.6), and the quality tier; only edge AA + pixel trim (which cost the picture nothing) precede it. Opt-in via `weatherActive` (a measured spawn source is live: lit sun with spec up, dish on, or travel live — wired in `usePerformanceGovernor.js` with the `weatherShed` store overlay in `globalSlice.js`, doc-load reset included, restore-table entry + honest badge line `weather clear`; the governor event log records it like every cut). Cost registered as `weather/mark-motes` (tier 1 in the registry's shed-first sense; **measured 0.089 ms** median-of-medians at the 240-mote cap, 1 locked step, sandbox — declared `timeMs` set to the measured 0.09).

**Determinism + budget measurements (suite-proven):** 300 frames over an uneven frame-time sequence hash-identical across two fresh stores; 50 ms slices ≡ 100 ms slices (24 steps per 400 ms); a contact-storm population reaches but never exceeds each device cap (240/120); the shed clears every mote on the arriving step, spawns nothing under shed, and banks no shed time. **The kill criterion did NOT fire** — weather holds replay-exact determinism inside the governor budget, so nothing was shed-to-nothing.

Suite: `src/engine/markWeather.selfcheck.mjs` — **46 checks** (A determinism, B source isolation, C shadow, D caps, E shed, F governor order, G cost, H state hygiene). Registered in the manifest. The pinned restore-table order in `hooks/governorCuts.selfcheck.mjs` was re-pinned to include `markWeather` between `renderScale` and `creatureCount` — the same re-pin #1694 and #1574 each made when their rung joined (the comment there now says so).

**Fork (recorded, not invented around):** the mote *render* pass and the liveResolve source-threading are NOT wired. There is no mote draw surface in the renderer today (it draws asset instances; a mote pass is new GL machinery), and `liveResolve.mjs`/`liveLoop.mjs` are one-writer files — the surge precedent (#1576) likewise shipped machinery behind an inert-by-default input until its trigger is ruled. What exists and is proven: the full engine, the governor rung end-to-end (hook + store + badge + restore), and the shed input contract. The remaining wiring is one resolver thread (live sources → `stepMarkWeather`) plus one draw pass for the returned mote list. See Forks.

## S3 — The duel (rides #1483) — BUILT (S2's gate passed)

**What:** `curator/readDuel.mjs` + a seam in `curator/curate.js` — the keeps-fill loop's draft → gate → tilt shape, ridden, not rebuilt; `candidateTray.mjs`'s crown gate is untouched (the duel gates the *pick*, not the crown).

- **Draft:** Davis's pick through the existing `pickCurated` curator (unchanged).
- **Gate:** LOIS judges each candidate's **measured** reads (S2 shares, supplied by the caller — census, miner stills, or a future in-app bake) against the **Queen's anchor**: `anchorFromReads` = the mean read-shares of the kept Looks. No keeps → no anchor → **no duel** (the pick is exactly yesterday's, return shape byte-identical — pinned). Judgment = share-space distance + a demand/throttle naming the band at fault; demands are relative to the anchor band (the bald corpus read sits 72% under the balanced anchor's fine band — named `demand fine`).
- **Tilt:** Davis's pick inside tolerance stands; outside, the pick tilts to the measured candidate nearest the anchor (first of equals — LOIS's convention). The result rides the return as `duel`, and `curatorHint` speaks it (e.g. `duel: tilted — demand fine — bald: no dust, no grain, no motes`); a pick without reads clears the record so no stale judgment is ever quoted.
- **Heat:** the tolerance is #1483's ruled boldness temperature via `effectiveTemp()` (the single source — 0.115 at the floor → 0.2725 at the cap); no new knob; nothing in `loisRank.js`/`taste.js`/`tasteHead.js` changed.

Suite: `src/curator/readDuel.selfcheck.mjs` — **30 checks**, run against the S2 corpus's real measured shares (anchor from the balanced scene; bald demands fine, mud demands big; a cold room tilts the borderline read, a hot room lets it stand). Registered in the manifest. `curate.selfcheck` passes unmodified.

---

## Files touched

**New:** `app/src/curator/readMeter.mjs`, `app/src/curator/readDuel.mjs`, `app/src/engine/markWeather.mjs`, `app/src/curator/readMeter.selfcheck.mjs`, `app/src/curator/readDuel.selfcheck.mjs`, `app/src/engine/markWeather.selfcheck.mjs`, `STAGING-REPORT.md` (this file, replacing P3's per stack convention).

**Edited:** `app/src/curator/censusReport.mjs` (readsMetric + format section), `app/src/curator/censusReadout.mjs` (`readsView`), `app/src/curator/curate.js` (duel seam + hint line), `app/src/hooks/governorCuts.js` (cut 1.4 + restore + badge), `app/src/hooks/usePerformanceGovernor.js` (weather rung wiring), `app/src/state/slices/globalSlice.js` (`weatherShed` overlay + doc-load reset), `app/src/data/quality.js` (`MARK_WEATHER_CAPS`), `app/src/hooks/governorCuts.selfcheck.mjs` (restore-order re-pin, see S1), `app/src/curator/director.selfcheck.mjs` (scheduler-allowlist addition, see Exceptions), `app/selfcheck.manifest` (3 lines appended in place — package.json untouched).

**Not touched:** `weatherAir.mjs` / `dishWeather.mjs` / the WEATHER dial and its law, `candidateTray.mjs`, `loisRank.js`, `taste.js`, `tasteHead.js`, layout-modes / any recipe schema (zero new recipe keys), liveLoop/liveResolve (see Forks), Q2/Q3/Q4 surfaces, dither (#1610).

## Verification

- `npm run build` — green.
- New suites: readMeter 36 ✓ · markWeather 46 ✓ · readDuel 30 ✓.
- Affected families (run individually): census ✓ · censusReadout ✓ · curate ✓ · loisRank ✓ · taste ✓ · effectiveTemp ✓ · candidateTray ✓ · tasteHead ✓ · governorCuts ✓ (after the re-pin above) · governorCreatureShed ✓ · governorHostileScene ✓ · phase6 ✓ · governorEventLog ✓ · costTiers ✓ · travel (685 checks) ✓ · surge (1385) ✓ · parallaxDrift (270) ✓ · weatherAir ✓.
- Full manifest sweep (every manifest line run individually, 2026-10-20): **483 pass / 7 fail of 490 suites**. The 7 failures classify as: the 3 inherited pins (`gl/replayGate`, `gl/creatureGate`, `engine/wingWarp` — wingWarp's log shows the expected pin hash `dc0897fb`, the inherited failure, untouched by this stage), the known sandbox set (`fx/rollSafety` + `gl/accum` — sandbox browser; `kernel/bake/swarmWasm` — cargo missing), and `curator/director` — this stage's one real hit, fixed and re-run green (see Exceptions). All three new suites pass inside the sweep.
- Lint: eslint clean on every touched file.

## Exceptions

1. **`curator/director.selfcheck` — allowlist re-pin (mine, fixed).** The Director suite guards an allowlist of files permitted to reference scheduler identifiers (`effectiveTemp` among them): no UI-surface file may reference the scheduler. `readDuel.mjs` reads `effectiveTemp()` — the brief's own requirement that S3's heat be #1483's temperature from the single source — which tripped the guard. This is the same deliberate pick-path wiring the allowlist already enumerates for `curate.js`/`taste.js`/`roomWidth.js`; `curator/readDuel.mjs` + its selfcheck were added to the list with the reason recorded in place. Re-run: **director.selfcheck 13 checks, green**. (The full sweep above ran before this fix; the suite was re-run individually after it.)
2. The 3 pin suites were not re-recorded and not chased, per the brief. No other exceptions; every other failure in the sweep is in the brief's known set.

## Forks

1. **S1 live render wiring (the one real fork).** Mote drawing + liveResolve source-threading not built — no mote draw surface exists in the renderer, and liveResolve/liveLoop are one-writer files. The engine, governor rung, store overlay, and shed contract are complete and suite-proven; the follow-up is a coordinator-lane thread (live sources → `stepMarkWeather`, one draw pass over the returned motes). Recorded rather than invented around, per the brief's fork rule; it blocks neither S2 nor S3.
2. **S3's in-app caller.** The duel runs wherever measured reads exist (Node-side today: census/miner). The live CURATE press does not yet supply reads — because the meter is honestly Node-only (S2). If/when an in-app raster bake is ruled honest, the seam is `pickCurated(candidates, curator, rng, { reads, anchor })` — no further curate change needed.
3. No other forks: every spawn criterion named in the issue had a live measured source (sun spec pool in `data/light.js`, the dish density field from #1538, travel stretch stamps from #1575, dish contact points as caller input). Q2/Q3/Q4 untouched, per the brief.
