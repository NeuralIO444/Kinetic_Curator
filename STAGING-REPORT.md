# STAGING-REPORT — #1435 R4: waveform lines (strips + stroke-aware bend)

Branch `ember/1435-region-lines`, stacked on stage 3 (`81be4a3a`). Local
only — no push, no PR. Contract: issue #1435 as filed, as amended by
Matt's 2026-10-15 ruling comment (6193457312) — lines animate along their
length and bend, simple programmatic motion, stroke-aware, the parked
quad-wide shader stroke-warp stays parked.

## What shipped

**Track 1 — the squiggles roll (authored strips through the C-wire).**
`line_squiggle_01` and `line_squiggle_02` are strip assets now, exactly
like the five micro-HUD strips from stage 1: all frames bake contiguously,
the renderer consults the strip table only when it supplies the frame
clock, shed pins the canonical frame.

- New file `app/src/data/assets/assets-line-strips.js` (`LINE_STRIPS`).
  Frame 0 of each strip is the asset's own `svg` **verbatim**, so its bake
  is bit-identical to the pre-R4 single-cell bake (pinned per-row in the
  new suite, against a re-derived pre-R4 bake).
- Frames 1..N are the same wave translated along the stroke: squiggle_01
  rolls 7 frames × 8 units = its 56-unit wavelength (kineme `line-boil`,
  2.8 s); squiggle_02 rolls 8 × 4 = its 32-unit wavelength (`wave-roll`,
  3.2 s). Frames × step = exactly one wavelength, so the loop wraps
  seamlessly — pinned on the GPU: the render at t = period is
  byte-identical to t = 0. Each frame draws every hump intersecting the
  coverage window, capped so ink never comes within ~6 units of a frame
  edge (the mic_wave mip rule); consecutive frames are exact translates of
  each other over the covered band (pinned on rasters).
- `cellKinemes.js`: two new cell kinemes + the two assignments;
  `stripFramesFor` now reads one merged table (micro + line strips), so
  both atlas bakers, the pack, and R3's strip exclusion in the family
  defaults all see the lines without special cases.

**Track 2 — lines travel along their length and BEND (procedural, per the
ruling).** No shader change, no new subsystem: the bend is a pack-time
extension of stage 2's own region expansion, riding the existing osc
kineme evaluation.

- `kinemes.js`: one new library kineme, `bend` — {kind: 'osc', period:
  3.6, amp: 6}. Its **id is the signal**: a region assigned `bend` asks to
  be subdivided (documented at the entry).
- `regionKinemes.js`: the stroke rule, pure record geometry —
  `isStrokeRegion(record)`: bbox long axis ≥ 28 asset units AND ink fill
  (area / bbox area on the canonical raster) ≤ 0.30; `bendSlicesFor` =
  clamp(round(long / 14), 3, 8). A solid bar measures fill ~1.0 and can
  never qualify; a squiggle measures 0.15–0.24.
- `regionDefaults.js`: R3's linework default becomes per-region — stroke
  regions default to `bend`, the rest keep `bob`. Strip assets stay
  excluded (the strip owns their motion; the two squiggles left the
  region-assignment census for that reason, below).
- `sceneContract.js`: for a *selected* (slot > 0) region whose assigned
  kineme is `bend` AND whose record is a stroke, the contract emits
  `regionAnim.bend = { [assetId]: { [regionId]: slices } }`. The key
  exists only when some region bends, so untouched scenes' contracts (and
  hashes) are unchanged; placements never move (pinned). The validator
  checks the map fail-closed (integer slices in [3, 8], region present in
  the slot table). Budget 0, tier-2 freeze, tombstones, and an artist's
  override to another kineme all remove the bend — pinned. `bend`
  assigned to a non-stroke (e.g. a petal) animates the region whole,
  exactly like rock: the subdivision is gated on geometry, not on the id
  alone.
- `renderer.mjs` (`expandRegionInstances`): a bend region expands into N
  slice instances instead of one — sub-windows of the region's own cell
  (the existing `cellUvWindow` split along the long axis; a vertical
  mirror-split for tall regions), slice geometry = the region's placement
  rect cut N ways, each slice carrying the region's kineme slot and
  phase = region phase + j/N. The phase stepping is what makes the wave
  **travel**: each slice sits at a different point of the osc cycle, so
  the stroke articulates along its length. Slot-0 regions never slice
  (the pack's own guard, behind the contract's); the collapse shed keeps
  the exact pre-R2 single-quad path.
- **Stroke-aware by construction**: R1's partition means a region's cell
  contains only that region's ink, so subdividing the stroke's cell can
  only ever move the stroke. A non-stroke sharing the mark is packed as
  its own ordinary instances and does not bend (GPU-pinned: the centre
  dot of `line_target_01` is byte-still while its ring bends).

**Re-bake.** `regions.generated.js` + the bake report regenerated. The
diff is only `regionKinemes` values: the two squiggles' blocks are gone
(strip exclusion), linework stroke regions flipped bob → bend, nothing
else moved. New census: **292 regions assigned across 72 assets** (was
294 / 74): floral 15 regions / 53 assets, radial 26 / 150, linework 89
regions / 31 assets — of linework's 89, **35 bend + 54 bob** (measured
scan; bend defaults exist nowhere outside the line family, pinned).

## Measured evidence (real WebGL2 renders, 400×280)

New suite `regionLines` (registered in `app/selfcheck.manifest`):

- Roll: squiggle_01 cell 0→1 = **1,794 px** moved; squiggle_02 = **1,668
  px**. One period wraps byte-identically; shed (freeze doc) at mid-roll
  = cell 0 byte-identically. (Stage 1's cellKinemePlayback, whose strip
  loop now covers both lines, measures 1,389 px / 1,423 px in its own
  tint combo and re-verified all five mic strips at stage-1 numbers.)
- Bend on `line_squiggle_03` (single stroke region, 7 slices): t=0.9 vs
  rest = **617 px**; t=1.8 vs t=0.9 = **653 px** (the pose travels, it is
  not a static bend); rest parity of the whole bend path vs the pre-R2
  render = **0.469 %** of pixels (bar < 10 %); same-time renders
  byte-identical (determinism); one bend period (3.6 s) wraps exactly;
  shed collapse byte-identical to the pre-R2 path.
- Stroke-awareness on `line_target_01` (ring = bend, centre dot and
  inner held still): ring bbox motion = **1,265 px**, centre-dot bbox
  motion = **0 px**.
- Node pins: frame 0 verbatim + raster-exact translation between frames;
  strip frame-0 bake bit-identity per row; the stroke rule on real
  records (incl. the boundary case `hae_flagella_01` fill exactly 0.30 →
  stroke); the contract map for defaults / budget 0 / freeze / overrides;
  validator rejection of bad bend maps; pack slice tiling (UV windows
  tile the region cell exactly, phases step 1/N, pivots advance), slot-0
  stand-down, shed = bare pack.

Neighbours re-verified with stage-identical numbers: regionPlayback rest
parity 0.646 %, petal diffs 119/110/64/119 px, budget-1 motion 321 px vs
1,216 px at full budget — the bend machinery did not disturb R2 playback.

## Suite results

- New: `regionLines` — green (Node + GPU), also green inside the sweep.
- Lane neighbours green: regionPlayback, regionAssignment,
  cellKinemePlayback, cellKinemes, kinemes, kineme (after re-pin, below),
  regionBake, regionMattes, regionSlots, overlay, ingest, census,
  censusReadout, sceneContract, micro-HUD strips (after re-pin, below).
- `npm run build` — green.
- **Full manifest sweep, run solo: 424 suites, 420 pass.** The four
  non-green, each explained:
  - `swarmWasm` — known base-identical sandbox failure (no cargo; the
    wasm verify cannot run here).
  - `accum` — known base-identical sandbox failure (V8 OOM, SIGABRT).
  - `rollSafety` — SIGKILL after 873.6 s: **stage 3's documented harness
    ceiling (a)** (sandbox memory ceiling vs region-atlas weight; stage
    3's solo run SIGKILLed identically after its assertions passed, and
    the stage-2 tree passes solo). Cited, not re-diagnosed; nothing
    weakened.
  - `phase6` — `ERR_STRING_TOO_LONG` in `glDriver.buildRenderPayload`
    (whole-library atlas as one base64 string past V8's limit): **stage
    3's documented harness ceiling (b)**, identical signature and call
    site; the live app never builds whole-library scenes. Cited, not
    re-diagnosed.

## Re-pins (each with its measured justification)

- `kinemes.selfcheck` + `gl/kineme.selfcheck` — the library id list gains
  'bend' (the new kineme is the change under test); bend's entry pinned
  {osc, 3.6, 6}.
- `cellKinemes.selfcheck` — the animated-asset set gains the two
  squiggles; line-boil (7/2.8/7) and wave-roll (8/3.2/8) pinned.
- `regionAssignment.selfcheck` — linework asset count 33 → 31 and total
  assigned 294 → 292 (the two squiggles are strips now — R3's own strip
  exclusion); synthetic stroke/bar records pin bend vs bob by the
  geometry rule; the synthetic IMPORT case now yields 10 bob + 2 bend
  because the 12-cap merge unions two records into long sparse shapes
  that measure as strokes — each asserted value is computed from the
  geometry rule itself, not copied from the output.
- `cellKinemePlayback.selfcheck` — two honest fixes: its mid-strip probe
  time landed exactly on a cell boundary for odd cell counts (FP floor
  3.9999…→3); the probe is now the middle cell's centre (identical probe
  for even counts, all mic numbers unchanged). Its strip-table identity
  assert now reads the union of both strip files.
- `assets-micro-hud-strips.selfcheck` — scoped to the strips its own file
  owns (the registry outgrew the file in R4); the line strips carry the
  same two pins in regionLines.

## Judgment calls (flagged plainly)

1. **The "waveform asset" is `line_squiggle_02`.** The library has no
   asset literally named waveform; the acceptance's `line_squiggle` maps
   to `line_squiggle_01`, and squiggle_02 — the library's other sine-wave
   line — is the second strip. (`mic_wave` already ships as a strip
   since stage 1.)
2. **The bend is a pack-time slice subdivision**, not authored frames and
   not a shader warp: it reuses stage 2's region expansion and the
   existing osc evaluation — no new subsystem, no new shader pass — per
   the ruling's "simple" guard. The alternative reading (authored frames
   only) covers the roll but cannot bend arbitrary lines.
3. **Stroke-gate constants** (long axis ≥ 28 units, fill ≤ 0.30, slices
   round(long/14) clamped [3, 8], bend osc 3.6 s / ±6°): chosen from the
   measured library scan — solids measure fill 1.0, squiggles 0.15–0.24;
   `line_spiral_01` (fill 0.35) stays a bob, honestly on the far side of
   the gate. One boundary case sits exactly on the line
   (`hae_flagella_01`, fill 0.30 → bend); the rule is ≤ and it is pinned
   as such.
4. **`bend` is also assignable to whole marks** (assetKineme / the region
   picker list it automatically, like every kineme). On a whole mark it
   behaves as the gentle osc it declares; the subdivision only engages
   for stroke *regions*. Noted, not hidden.
5. The R4 ruling's spec amendment is recorded in
   `docs/research/per-region-animation-spec-2026-10-12.md` §R4 (shipped
   note) in this stage's docs commit.

Coordinator calls left open (as in stage 3, not decided here): the two
sandbox harness ceilings (rollSafety memory, phase6 driver string) recur
identically; CI on the Mac runner is the authority for both.
