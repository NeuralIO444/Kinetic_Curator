# STAGING REPORT — #1431 KINEME Build C playback (Stage 1, per-region animation lane)

- **Issue:** #1431 — wire the cell kinemes (`app/src/data/cellKinemes.js`, #781) into the renderer.
- **Branch:** `ember/1431-cwire` on base main `c05c1b73`. **Local commits only — no push, no PR** (local-stack staging rule).
- **Worktree:** `~/workspace/kc-1431-build`.

## Files touched, per commit

1. **feat (bake)** — `app/src/data/cellKinemes.js`, `app/src/gl/atlas.mjs`, `app/src/gl/liveAtlas.mjs`
   - `cellKinemes.js`: new `stripFramesFor(assetId)` — the one source of truth for a playable strip (kineme assignment + frame data + cell count must agree; mismatch fails closed to the plain single-cell bake).
   - `atlas.mjs` / `liveAtlas.mjs`: strip-aware bake + slot packing (mirrored in both bakers).
2. **feat (wiring)** — `app/src/gl/sceneContract.js`, `app/src/gl/renderer.mjs`
   - `sceneContract.js`: `cellKinemesShed(doc)` export; `cellShed: true` emitted only while shed; motion-time forwarding fix in `kinemeFields`.
   - `renderer.mjs`: `packInstanceData` 4th parameter; renderer `cellShed` state; `renderLayerInstances` passes the frame clock to both pack call sites; `gl/cell-kineme` cost tier registered (tier 0).
3. **test** — `app/src/gl/cellKinemePlayback.selfcheck.mjs` (new), `app/selfcheck.manifest` (one line).
4. **docs** — `docs/research/per-region-animation-spec-2026-10-12.md` (verbatim copy of the lane's founding spec, per the issue).
5. **docs** — this report.

## How the wiring works

**The bake (the precondition the issue doesn't spell out).** Before this stage, the strip frames (`MICRO_HUD_STRIPS`) had **no consumer anywhere** and both atlas bakers baked only the asset's single `svg` — so the pack wiring alone would have had nothing to sample. A strip asset now bakes **all its frames side by side into one wide raster** (frame *i* translated *i* frame-widths right, frames **contiguous with no internal gutter**, because `cellUvWindow` splits the cell rect evenly and a gutter would land inside every window but the first). Frame 0 occupies exactly the texels — and the viewBox segment — the pre-change single-cell bake used. Layout is **slot packing**, mirrored in both bakers: an entry consumes *n* consecutive stride-432 grid slots (strips), or 1 slot (everything else); a strip that doesn't fit the row's remainder wraps whole to the next row. **An atlas with no strips lays out byte-identically to before** (same cols, same cell rects) — pinned in the new suite.

**Motion time.** The live loop's doc already carries `kinemeTime` from the anchored kineme clock (rate changes re-anchor, pause/freeze stop it). `buildSceneContract` previously forwarded `kinemeTime` only alongside a non-empty instance-kineme table — a strip-only scene would have sat on cell 0 forever. It now forwards the time whenever the doc carries a finite one; a doc without `kinemeTime` still gets no key, so motionless contracts and their hashes are unchanged. The renderer reads `contract.kinemeTime` into its frame state exactly as before.

**The pack seam.** `renderLayerInstances` builds one frame clock per layer render — `{ motionTime: kinemeTime, shed: cellShed }` — and passes it as the new optional 4th argument to both `packInstanceData` call sites (normal batches and isolated runs; layer-mask bakes flow through the same function, same frame). Inside `packInstanceData`, only when a clock is supplied **and** `stripFramesFor(it.asset)` resolves: `cellIndexAt(motionTime, { period, cells, shed })` picks the cell and `cellUvWindow(cell, idx, cells)` rewrites the instance's UVs. Everything else falls through untouched — including the legacy producer `cellIndex` branch (kept with its exact arithmetic). **Callers that pass no clock never consult the strip table: their packed output is byte-identical to before** — every existing selfcheck caller uses the 3-arg form.

**Shed.** New predicate `cellKinemesShed(doc)` mirrors `spectrumMarksShed` exactly — the tier-2 rung: `doc.perfTier1 && quality === 'performance'`. `buildSceneContract` emits `cellShed: true` only when shed (key omitted otherwise, preserving contract shape/hashes); the renderer stores it per frame; `cellIndexAt(..., shed)` returns 0. Exports/stills docs carry no governor state, so they never shed. Note the freeze nuance: a full motion freeze (governor cut 6, pause/hold) stops the kineme clock, so strips **hold their current cell**; pin-to-cell-0 engages with the tier shed. That is the honest reading of "shed/freeze pin cell 0" given the house clock design — flagged here as a judgment call.

**Determinism.** Cell choice is a pure function of motion time: no `Math.random`, no wall clock anywhere in the path. Same time → same frame, byte-identical (suite-proven).

## Measured evidence (new suite: `src/gl/cellKinemePlayback.selfcheck.mjs`)

The suite follows the house pattern of `src/gl/kineme.selfcheck.mjs` (Node pins + real WebGL2 renders through the parity driver `renderViaGL`; the Playwright browser **is** present in this sandbox, so the GPU section ran — it was not skipped).

**Pixel motion — cell 0 → cell 1, differing pixels in a 400×280 frame, one mark at scale 2.5:**

| asset | kineme | differing px |
|---|---|---|
| mic_dial | dial-sweep | **1086** |
| mic_chevrons | chevron-chase | **894** |
| mic_specbar_h | spec-chase | **360** |
| mic_specbar_v | spec-chase | **307** |
| mic_wave | wave-scroll | **1911** |

mic_dial cell 0 → cell 4 (needle opposite): **1324 px**. One full period wraps to the **byte-identical** frame; the same motion time renders byte-identically twice; a non-strip mark (geo_tri_01) is byte-identical at any motion time.

**Node pins:** for all 4 kinemes — `cellIndexAt` walks every cell in one period, wraps at the period, pins 0 under shed, wraps negative time; `cellUvWindow` windows tile the cell exactly with v untouched; pack-level UVs equal `cellUvWindow(cell, cellIndexAt(t))` across a time sweep for all 5 strip assets (float32 tolerance); no-clock pack = full cell; non-strip pack byte-identical with/without the clock; contract keys (`kinemeTime` forwarding, `cellShed` only on the tier-2 rung).

## Shed pixel-identity — the honest numbers

Three measurements, in increasing strength:

1. **Within the new code (suite-pinned):** the shed render is **byte-identical** to the cell-0 render, and to a no-clock render.
2. **At the bake (suite-pinned):** frame 0's 400×400 texels are **bit-identical** to the pre-change single-cell bake — all 400 rows compared exactly against the old `bakeCombo` recipe re-derived in the suite.
3. **Against the true pre-change render (one-off cross-version probe, not a suite):** I rendered the same mic_dial scene with the actual base-commit code (scratch worktree at `c05c1b73`, removed after) and compared against this branch's shed render. **980 of 112,000 px differ (0.88% of frame) at 400×280; 4,389 of 700,000 (0.63%) at 1000×700; total alpha identical (178,500,000 both).** A non-strip control asset rendered byte-identically across the two trees, so the delta is solely the strip sampling.

**Judgment call, flagged plainly:** the residual in (3) is the sub-texel drift inherent to the issue-prescribed `cellUvWindow` math: it splits the strip's inset rect *evenly*, so each window spans 400 − 1/n texels instead of a frame's true 399-texel inset span — a misalignment of at most (n−1)/n texel (≤0.875 texel for n=8, ≈0.44 px at 400×280), zero at the strip's left edge, which flips hard-edge pixels while conserving total ink exactly. No uniform-split layout can make every frame texel-exact; making shed strictly bit-identical to the pre-change render would require a per-frame window seam in the pack instead of `cellUvWindow` over the strip rect — a deviation from the issue's prescribed design that I did **not** take unilaterally. The measured delta is far inside the repo's <10% parity bar. If Matt wants strict bit-identity, that's the follow-up decision.

## Test results (exact)

- **New suite** `src/gl/cellKinemePlayback.selfcheck.mjs`: **PASS**, all sections (selection/windows/table, bake, pack, contract, GPU) — GPU section ran, not skipped.
- **Neighbourhood (17 suites): all PASS** — `data/cellKinemes`, `data/kinemes`, `gl/atlas.skip`, `gl/atlasKeyGuard`, `gl/liveAtlas`, `gl/sceneContract`, `gl/kineme`, `gl/kinemeRateAudio`, `gl/costTiers`, `gl/glassBevel`, `gl/exportStill`, `gl/phase6`, `engine/dishDeform`, `engine/plateBody`, `engine/washBody`, `engine/stippleBody`, `engine/glassBody`.
- **`npm run build`: PASS** (vite, 4.77s).
- **Full manifest sweep** (continue-past-failure runner, solo, 421 suites): **419 pass / 2 fail**. The 2 failures are the known base-identical sandbox environment failures, unrelated to this change: `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` ("cargo: not found" — no Rust toolchain in the sandbox) and `src/gl/accum.selfcheck.mjs` (V8 OOM abort, SIGABRT — the known sandbox memory limit). No other suite failed.

## Judgment calls (all flagged, none hidden)

1. **Bake design** (above): full-size contiguous frames + slot packing in both bakers; rejected squished-slices (mushy dial at 400/n px wide; cell 0 wouldn't be today's bake) and per-frame gutters (break the even-split math). Internal gutters are safe to omit because strip ink is measured well inside frame edges (dial ink ≈ texels 124–276 of 400), so mip box-filtering across a frame boundary never reaches ink.
2. **Shed rung = tier 2**, mirroring spectrum marks (the closest sibling: a marks-level extra on the same ladder rung). Cell strips cost no extra pass; shedding them is about visual quiet, like the marks.
3. **`kinemeTime` forwarding change** in `kinemeFields` (above): required for strip-only scenes; live contracts that pass a time now carry the key even with no instance kinemes — the renderer already read it as 0-equivalent when absent, and motionless docs are untouched.
4. **Freeze holds the current cell** (clock stops); only the tier shed pins cell 0. See "Shed" above.
5. **Shed bit-identity**: shipped the prescribed `cellUvWindow` seam and reported the measured cross-version delta (above) instead of rearchitecting for bit-exactness.
6. **`stripFramesFor` fail-closed**: assignment/frame-data/cell-count disagreement → plain bake + no pack subdivision, rather than garbage UVs.
7. **Cost tier** `gl/cell-kineme` registered at tier 0 (work happens inside the existing quad pass at pack time; the frames' atlas cost is the kinemes' declared `costCells`).

## Out of scope (later stages)

R2 #1433 (region playback), R3 #1434 (assignment), R4 #1435 (waveform strips) — untouched. No changes to `liveLoop.mjs`, shaders, or the strip data files. Nothing pushed; no PR opened — this stage stages locally for the coordinator's publish step.
