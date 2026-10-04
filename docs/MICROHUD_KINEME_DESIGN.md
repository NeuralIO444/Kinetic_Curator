# MICRO-HUD × KINEME — motion design spec

**Status:** SPEC ONLY. No build, no issues, no PRs. Written for Matt's approval — plain language, no code. Scope locked in #705; this doc does not re-scope it. Depends on #781 (Build A instance kinemes and Build C cell kinemes, both merged).

## Concept recap

The 20 micro-HUD ornaments (#697) are static SVG marks. This spec gives them motion through KINEME (#781) — the motion library — not through the asset system. Dots pulse, reticles blink, arrows rock, dial needles sweep, chevrons chase, spec bars chase, waveforms scroll. Everything else stays exactly as it is today.

## What this IS

Motion lives in kineme, never on the asset. That is the whole design, and it is the lesson of #699/#782: the frame-strip approach baked animation into the asset format (`sub` fields, `__fN` atlas cells) and only animated in the opt-in render worker — on the default in-thread loop nothing moved. It was reverted. This spec does the opposite:

- **Instance kinemes** (Build A, already merged): the GPU moves the whole mark in QUAD_VS (spin/rock/pulse/blink/bob). Assets stay plain static SVG. A per-project `assetKineme` map (asset id → kineme id) says who moves. No asset fields.
- **Cell kinemes** (Build C, data merged, unwired): motion *inside* one mark via a baked UV strip. The asset id never changes; only the UV window moves. Parts stay static; the strip is a bake-time artifact.

**The one rule (from #705, non-negotiable):** every ornament animates on the default in-thread loop, in the worker, AND in exports. If it doesn't move in all three, it doesn't ship.

## Ornament inventory — the mapping

20 ornaments. 6 get instance kinemes, 5 get cell kinemes, 9 stay static. One new asset (the needle). No new fields anywhere.

### Instance kinemes (Build A) — the whole mark moves

| Ornament | Kineme | Kind | Why this one |
|---|---|---|---|
| `mic_dotgrid_5` | `pulse` | pulse (scale thump, 1.6s) | dot → pulse; the 25-dot grid breathes as one mark |
| `mic_dotgrid_3` | `pulse` | pulse | dot → pulse; the 3×3 grid breathes as one |
| `mic_plus` | `pulse` | pulse | reads as a dot-like mark; same family |
| `mic_crosshair` | `blink` | blink (duty 0.5, 1.0s) | reticle blink — the targeting read |
| `mic_target` | `blink` | blink | target-lock blink |
| `mic_arrow` | `rock` | osc (±18°, 2.4s) | directional nudge; the arrow leans into its heading |

All six already exist in the `KINEMES` library (`pulse`, `blink`, `rock`). No new kinds. Copies are phase-offset by the shader's per-instance phase (`a_inst4.w` from `kinemePhase(seedOffset, key)`) — two dot grids never thump in lockstep.

### Cell kinemes (Build C) — motion inside the mark

| Ornament | Cell kineme | Cells | Period | What the strip shows |
|---|---|---|---|---|
| `mic_dial` | `dial-sweep` | 8 | 4.0s | dial face + needle at 8 angles (cell 0 = today's needle) |
| `mic_chevrons` | `chevron-chase` | 4 | 1.6s | accent on chevron 1, 2, 3, then all-ink (rest beat) |
| `mic_specbar_h` | `spec-chase` *(new)* | 8 | 2.0s | 3-bar accent window sliding left→right, wrapping |
| `mic_specbar_v` | `spec-chase` *(new)* | 8 | 2.0s | 3-bar accent window sliding top→bottom, wrapping |
| `mic_wave` | `wave-scroll` | 6 | 2.4s | waveform translated 4 units/cell (one full zigzag period per loop — seamless) |

`dial-sweep`, `chevron-chase`, and `wave-scroll` already exist in `CELL_KINEMES`. `spec-chase` is the one new cell kineme this spec adds (8 cells, 2.0s period — same shape as the others).

### Static — the unchanged path

`mic_bracket_tl/tr/bl/br`, `mic_ticks_h`, `mic_ticks_ring`, `mic_label`, `mic_tag`, `mic_cropmarks`. Framing and registration marks. They are not in either registry, get no `assetKineme` mapping, and render bit-identical to today. Motion on a crop mark would be noise, not life.

## Instance kinemes — how they attach

Build A is fully wired (sceneContract → 16-slot `u_kineme` uniform table → QUAD_VS kinds). What #705 adds is the **default map**: which micro-HUD ornaments move out of the box.

**Where the defaults live.** A `DEFAULT_ASSET_KINEME` map in `kinemes.js`:
```js
// micro-HUD defaults (#705). Per-project; the user can clear any entry.
{ 'mic_dotgrid_5': 'pulse', 'mic_dotgrid_3': 'pulse', 'mic_plus': 'pulse',
  'mic_crosshair': 'blink', 'mic_target': 'blink', 'mic_arrow': 'rock' }
```
The store initializes `assetKineme` with these defaults (merged under any project-document values, which win). Clearing an entry (`setAssetKineme(id, null)`) returns that ornament to the static path. No UI in v1 — the store entry point exists; the DAVIS perform surface arrives later.

**Phase.** Free from the existing machinery: `kinemePhase(seedOffset, key)` per instance, evaluated in the shader. Copies of `mic_dotgrid_5` pulse on decorrelated phases. Deterministic — same seed, same phases.

**Amounts.** Build A kinemes have no per-kineme amount knob (the amp is baked into the library entry: pulse ±12%, blink duty 0.5, rock ±18°). The master control is the Director RATE knob: RATE scales the kineme clock, RATE 0 freezes the motion. That is the v1 contract — per-kineme amounts are a follow-on, not this spec.

**Cost.** The KINEME_TABLE_MAX is 16 slots; the six mappings use 3 distinct kineme ids (pulse, blink, rock) → 3 slots. Zero atlas cost (no new cells). The shader skips kineme math for slot-0 instances — static marks never enter the branch.

## Cell kinemes — how the strip works

Build C's data (`cellKinemes.js`: `CELL_KINEMES`, `cellIndexAt`, `cellUvWindow`) is merged but has no consumers — `packInstanceData` already honors `it.cellIndex`/`it.cellCount`, but nothing sets them. This spec wires it end to end.

**The strip.** For each of the 5 mapped assets, the atlas cell becomes a horizontal strip of n sub-cells (n = the cell kineme's `cells`). The asset id never changes; the strip is a bake-time artifact. Per frame, the instance's UV rect is rewritten to the current cell window (`cellUvWindow`). Cell 0 is always the canonical frame — pixel-identical to today's single-cell bake.

**Where strips come from.** The generator (`scripts/gen-micro-hud.mjs`) emits a second file, `app/src/data/assets/assets-micro-hud-strips.js`:
```js
// Generated — edit the generator, not this file.
export const MICRO_HUD_STRIPS = {
  'mic_dial': [svgCell0, ..., svgCell7],   // 8 cells
  'mic_chevrons': [...],                    // 4 cells
  'mic_specbar_h': [...],                   // 8 cells
  'mic_specbar_v': [...],                   // 8 cells
  'mic_wave': [...],                        // 6 cells
};
```
Each entry is a complete 100×100 viewBox SVG string. The generator composes them from parts (below). Same "edit the generator" discipline as the assets file.

**The registry (not on the assets).** `cellKinemes.js` gains:
```js
export const ASSET_CELL_KINEME = {
  'mic_dial': 'dial-sweep',
  'mic_chevrons': 'chevron-chase',
  'mic_specbar_h': 'spec-chase',
  'mic_specbar_v': 'spec-chase',
  'mic_wave': 'wave-scroll',
};
```
The selfcheck asserts no `asset` key inside `CELL_KINEMES` entries (already true) and that every registry value names a real cell kineme.

**Baking (both bakers).** There are two atlas bakers that must agree geometrically: `atlas.mjs` (Node/resvg, offline/stills) and `liveAtlas.mjs` (browser/canvas, live loop). Both gain the same strip path: when the combo's asset is in `ASSET_CELL_KINEME`, bake the strip (n × CELL_PX wide, no internal gutters — the half-texel UV inset handles edge filtering; strip cells are near-identical so residual bleed is invisible) instead of the single `asset.svg`. The `cells` map stores the whole-strip UV rect; `packInstanceData` subdivides it per instance.

**Per-frame wiring.** In `sceneContract.js` (where instances are finalized, next to the Build A kineme block), for each instance whose asset is in `ASSET_CELL_KINEME`:
- `inst.cellCount = ck.cells`
- `inst.cellIndex = cellIndexAt(kinemeTime + kinemePhase(inst.seedOffset, inst.key) * ck.period, { period: ck.period, cells: ck.cells, shed })`
- `shed` pins cell 0 (the existing `cellIndexAt` contract) on governor shed.

The motion clock is `kinemeTime` (the anchored Director RATE clock) — so RATE 0 freezes the chase, freeze holds the current cell, and the phase offset keeps copies out of lockstep. Deterministic per (seed, time).

**Strip contents, per ornament.**

- **Dial (8 cells).** The generator composes face (dial without needle, without hub) + needle rotated to `[29°, 74°, 119°, 164°, 209°, 254°, 299°, 344°]`. Cell 0 = 29° = today's needle angle (the `(50,50)→(68,32)` line), so the static frame is bit-identical. The needle part points straight up (12 o'clock) in its own definition; the generator rotates it per cell.
- **Chevrons (4 cells).** Cells 0–2: accent on chevron 1, 2, 3 respectively (ink on the others). Cell 3: all ink — the rest beat. The chase reads as a sweep with a breath between loops.
- **Spec bars (8 cells).** The 3-bar accent window slides one bar per cell and wraps: cells show the accent block at positions 0–2, 1–3, …, 6–0(wrap), 7–1(wrap). Same construction for horizontal and vertical (the strip content differs per asset; the `spec-chase` kineme is shared).
- **Wave (6 cells).** The zigzag has a 24-unit period (peaks at x=30,54; troughs at 42,66). Each cell translates the wave 4 units left; 6 cells = 24 units = one full period = a seamless loop. The generator draws the wave extended beyond both edges (x −30…130, baseline extended) so every shifted view stays fully covered — no empty edges mid-scroll.

**The needle-only part asset.** The one allowed exception. `mic_needle`: a standalone catalog asset — needle pointing up from center plus hub:
`<line x1="50" y1="50" x2="50" y2="14" stroke="var(--accent)" stroke-width="5"/><circle cx="50" cy="50" r="4" fill="var(--ink)"/>`
It is usable on its own (a clock-hand mark) AND is the generator's part for composing the dial strip. The dial face without needle is a generator-internal part, not a catalog asset — the issue only allows the needle.

## The three loops

- **Default in-thread loop** (`liveLoop.mjs`): builds the scene through `sceneContract` with `kinemeTime` → instances carry `cellIndex`/`kineme` → `packInstanceData` → QUAD_VS. Both kineme kinds animate here. This is the loop #699 failed — the acceptance is explicit because of it.
- **Worker** (`renderWorker.js` / `workerLiveLoop.js`): same `sceneContract` path, same `kinemeTime` (anchored clock). Identical behavior by construction.
- **Exports** (`useMediaExport.js`): readback from the live loop. Video exports capture successive frames as `kinemeTime` advances — the chase animates across exported frames. Stills capture one frame: the ornament frozen at whatever cell/phase the loop held. Deterministic per seed for the v1 drivers; for Build A/C the still is "the living moment," same as the live canvas.

**Verification (live pixel diff).** Render the scene at `kinemeTime` t₀ and t₁ (one cell period apart), read back pixels, diff: animated ornaments must differ above threshold, static ornaments must be bit-identical. Same harness for all three loops (the worker and export paths reuse the loop's readback).

## Static path

Ornaments in neither registry (the 9 static ones, plus any mapping the user clears) take the unchanged path: `kineme` slot 0, `cellIndex` null → the shader never enters the kineme branch, `packInstanceData` uses the full cell rect. Bit-identical to today — the hard gate, same as the v1 drivers' amount-0 rule.

## No new asset fields — where everything lives instead

| What | Where | Why not on the asset |
|---|---|---|
| Instance motion assignment | `assetKineme` in the store / project document (+ `DEFAULT_ASSET_KINEME` in `kinemes.js`) | per-project, user-clearable; #699 put motion on assets and died there |
| Cell motion assignment | `ASSET_CELL_KINEME` in `cellKinemes.js` | module registry; assets stay plain static sources |
| Strip cell art | `assets-micro-hud-strips.js` (generated) | bake-time artifact, not asset metadata |
| Needle part | `mic_needle` catalog asset (the one exception) | it IS an asset — a usable mark, not a field |
| Motion parameters | existing kineme clocks (`kinemeTime`) and library amps | no per-ornament params invented |

## Freeze / shed / stills

- **Freeze** holds `kinemeTime` → instance kinemes hold their pose, cell kinemes hold their cell. Resume continues. No pop.
- **Governor shed** pins cell kinemes to cell 0 (the canonical frame) via the existing `shed` param; Build A instances hold via the frozen clock. One registry entry for the kineme system (already declared: `gl/kineme`).
- **Stills** capture the held moment. The v1 seed-derived still instant (`kinemeStillSec`) applies to the CPU drivers; Build A/C stills are the live frame at capture — faithful, not canonical.

## What this is NOT

- Not the asset system. No `sub` fields, no `__fN` cells, no per-asset motion storage. #699 is not resurrected.
- Not a new render feature. No new shader attributes (the per-instance UV rect and kineme slots already exist), no new passes, no new textures.
- Not per-kineme amounts for Build A/C. The library amps and the Director RATE knob are the controls in v1.
- Not a kineme editor UI. The `setAssetKineme` store entry point exists; the DAVIS perform surface arrives later.
- Not the 9 static ornaments. They stay still on purpose.

## Resolved decisions (from #705, locked)

1. **Motion through KINEME, not the asset system** — #699's approach stays reverted.
2. **Instance: dot → pulse; blink/rock where one ornament reads right as one** — the table above.
3. **Cell: dial sweep, chevron chase, spec-bar chase, wave scroll** — the table above.
4. **Three-loop acceptance** — in-thread, worker, exports, all verified by live pixel diff.
5. **Copies phase-offset** — shader phase for Build A, `kinemePhase` offset for Build C.
6. **Static ornaments keep the unchanged path** — the 9 framing marks.
7. **No new fields on the assets** — registries and maps live outside the asset definitions.
8. **One asset exception: the needle-only part** — `mic_needle`, usable standalone and as the strip part.

## PR slices

Three stacked slices. Each: acceptance check first, watch it fail, smallest implementation, green, commit. Do not file until Matt says build.

**Slice 1 — instance kinemes (`hud-kineme-a`).**
`DEFAULT_ASSET_KINEME` in `kinemes.js`, store init merge, `sanitizeAssetKineme` coverage. *Acceptance:* selfcheck proves the 6 mappings resolve to real library kinds, phases decorrelate across copies (two instances, same asset, different `kinemePhase`), clearing a mapping returns the static path; live pixel diff on the in-thread loop (t₀ vs t₀+0.8s) shows the 6 ornaments moved and the 9 static ones didn't.

**Slice 2 — cell data (`hud-kineme-c-data`).**
`spec-chase` in `CELL_KINEMES`, `ASSET_CELL_KINEME` registry, generator emits `mic_needle` + `assets-micro-hud-strips.js` (5 strips), registry selfchecks. No baker changes yet — data only. *Acceptance:* selfchecks prove every registry value names a real cell kineme, every strip has the right cell count, dial cell 0's needle angle matches today's blob, the wave strip loops seamlessly (cell 5 → cell 0 translation = one zigzag period), chevron cell 3 is all-ink.

**Slice 3 — cell wiring (`hud-kineme-c-wire`).**
Strip path in both bakers (`atlas.mjs`, `liveAtlas.mjs` — identical geometry), per-frame `cellIndex`/`cellCount` in `sceneContract`, shed pins cell 0. *Acceptance:* full suite green; three-loop live pixel diff (in-thread, worker, export readback) — dial/chevrons/specbars/wave differ across a period, static ornaments identical; two copies of `mic_dial` show different cells at the same instant (phase offset); freeze holds the cell; a still captures a single cell.

## Decisions (Matt, 2026-10-03)

1. **Dial sweep: full 360°.** (Agreed with recommendation.)
2. **Cell kinemes: always-on, no v1 toggle.** (Agreed with recommendation.)
3. **All 9 static ornaments stay static.** (Agreed with recommendation.)
4. **Chevron 4th cell: accent flash, not the all-ink gap.** (Overruled the recommendation — Matt wants the flash.)
5. **Wave scroll: along the longest direction**, not fixed left-to-right — the scroll follows the waveform's long axis.

## Open questions for Matt

1. **Dial sweep: full 360° rotation, or a gauge arc (e.g., 270° sweep back-and-forth)?**
   *Recommend: full 360°.* The 8 stepped cells make it read as a charming boiled instrument, not a clinical gauge. A back-and-forth arc needs a ping-pong cell order — real follow-on material if the full rotation feels wrong.

2. **Cell kinemes always-on, or per-project toggle like `assetKineme`?**
   *Recommend: always-on for v1.* The sweep/chase/scroll are intrinsic to those five ornaments (like the boil is intrinsic to the brush). A per-project off switch is a small follow-on once the DAVIS kineme UI exists.

3. **The 9 static ornaments: keep them all static?**
   *Recommend: yes.* Brackets, rulers, labels, and crop marks are framing — motion there would be noise. (If any single one tempts you, `mic_ticks_ring` with a slow `spin` is the only candidate I'd name.)

4. **Chevron chase rest beat: all-ink gap cell, or an all-accent flash?**
   *Recommend: the gap.* Cell 3 all-ink gives the chase a breath between loops; a flash would read as an alarm.

5. **Wave scroll direction: left-to-right or right-to-left?**
   *Recommend: left-to-right* (the wave appears to flow forward, like a signal trace). One constant flip if it feels backwards.
