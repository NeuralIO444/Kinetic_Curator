# STAGING REPORT — #1808 slice 1: the trail grid read (ACCUM as memory, rung 2)

Builder staging record, branch `feat/1808-stigmergy` (local only — not pushed, no PR; the coordinator verifies and publishes). This file replaces the report that was at the worktree root (#1805's, which landed with PR #1829); that report remains in git history.
Issue: #1808 "ACCUM as memory, rung 2: creatures steer on the trail field (stigmergy)". No comments on the issue; the body is the whole contract. Base: origin/main 2eb2e360 (includes #1805 age buffer; #1807 rung 1 / PR #1831 still in CI at build time — not depended on).

## Premise verdict: TRUE for the issue, with one correction and one recorded gate

- **No creature reads the ACCUM trail field today.** Grep-verified: the
  only consumers of the age/colour buffer are the AgeReadout debug view
  and the still CLI's `--age-out`. Nothing in `engine/` or `curator/`
  reads `readAge`/`ageBuffer` for motion.
- **Correction to the issue's framing, recorded honestly:** a stigmergy
  system already exists — `engine/dishTrails.mjs` (#1415, petri dish
  C3): organisms climb gradients of their *own* deposit field, a CPU
  substrate they write themselves. It is not the ACCUM light buffer and
  not the creatures of the creatures spec. #1808's premise — creatures
  reading the **ACCUM buffer** spatially — is unbuilt, and the two
  fields stay distinct by design (one is deposits, the other is light).
- **Dependencies:** the issue requires rung 1 and/or the age buffer
  landed. The age buffer HAS landed (2eb2e360); rung 1 (#1807,
  PR #1831) has not — this slice depends only on what is on main. The
  derivation is source-agnostic, so rung 1's readback path and this
  grid compose when both are in; no rework needed either way.
- **Determinism:** preserved by construction. No creature code, no
  resolver input, no take path changes in this slice. The grid's stamp
  is the buffer's own step count (steps since CLEAR, counted inside
  `createAccum`) — a function of the step sequence, never a wall clock.

## Scope decision (first-class): slice 1 only — the issue slices itself, and slice 2 is gated

The issue's Scope section prescribes three slices. This build is
**slice 1, complete**: grid derivation + backstage view + selfcheck
probes. Slices 2–3 are NOT bundled, for two recorded reasons:

1. The issue's own acceptance carries a **feel gate on slice 2**: "slice
   2 does not leave the runway without Matt playing it (review lane,
   his merge, per standing rules)." Steering feel is exactly the class
   the full-auto arm does not cover. Slice 2 needs Matt's eyes before
   it is built to merge, and slice 3 follows slice 2's verdict.
2. House rule: one slice per PR (the #1806 slices 1–3 pattern on this
   same shelf).

Flagged for the coordinator: if slice issues are wanted for the
remainder (the #1832–#1834 pattern), slice 2 = "one drive:
ember-following on the moth, drive-integrated, capped, look-declared;
non-collapse + replay tests" and slice 3 = "the sign flip: fresh-light
avoidance, Davis-declared per look; second creature type only if
slice 2 plays well (Matt decides)".

## What shipped (plain language)

The trail buffer can now be *read as a map*: a coarse 32-wide grid of
cells, each reporting how much light it holds, its average colour, and
— because the age buffer landed — the age of the light that dominates
it. A backstage view (`?debug=trailgrid`, beside the AGE view) shows
the grid live as a thumbnail of the buffer with its measured headline
numbers. Nothing performs differently; no creature steers yet. The map
exists, is proven accurate, and is stamped so a future steering
consumer can label how stale its read is.

## Files (11)

- `app/src/gl/trailGrid.mjs` (new) — the pure derivation:
  `trailGridDims` (32 cols, rows from aspect = 32×22 at pair aspect),
  `deriveTrailGrid` (per cell: mean energy, channel means, dominant age
  = light-weighted mean age of living pixels, AGE_VOID where none;
  float64 throughout, the mirror's precision), `sampleTrailGrid`
  (nearest measured cell, clamped, buffer space), `summarizeTrailGrid`
  (peak cell, lit fraction, mean age). Stamp passthrough.
- `app/src/gl/trailGridLive.mjs` (new) — the AGE-wire pattern:
  `DEBUG_TRAILGRID` (`?debug=trailgrid`), `setTrailGridReader`,
  `readTrailGridFrame()` (snapshot → derive; failures degrade to null).
- `app/src/gl/accum.mjs` — `readTrail()` on the ACCUM object (colour
  readback from the current target + the age field via #1805's
  readback, factored into one `readAgeField` both methods share) and
  the step counter behind the stamp (reset in `begin()`, incremented
  only when a step lands). No pass, shader, or recipe change.
- `app/src/gl/liveLoop.mjs` — the grid readout named as an age-buffer
  consumer (`ageBuffer: DEBUG_AGE || DEBUG_TRAILGRID`; no consumer, no
  allocation — #1805's law), reader registered beside the AGE one and
  cleared at session end. Four small hunks, all additive.
- `app/src/curator/TrailGridReadout.jsx` (new) — the backstage view:
  polls ~4 Hz, paints cells in their mean colour, header carries dims,
  stamp, peak cell + its dominant age, lit %, mean age.
- `app/src/App.jsx` — import + flag-gated mount beside AgeReadout.
- `app/src/gl/trailGrid.selfcheck.mjs` (new, 7 cases) +
  `app/selfcheck.manifest` (+1 line).
- `docs/ACCUM.md` — one surgical section (the trail grid).
- `docs/review/1808/README.md` — measured evidence (comet table + map).
- `STAGING-REPORT.md` — this file, replacing #1805's at the root.

## Verification

- **trailGrid.selfcheck: 7/7 green** — dims; hand-computed cells exact
  (incl. the light-weighted age (0.9·1 + 0.1·3) = 1.2 case and the
  colour-present/age-void cell); **acceptance**: scripted two-block
  scene through the JS mirror — every cell vs an independent
  box-filter reference of the mirror's buffer (energy/means < 1e-9,
  void pattern identical), analytic ages within one frame (block A
  ≈ 29 frames, block B ≈ 9 frames at dt 1/30), the spectral proxy
  agreeing (older cell's b/g below the fresher cell's); colour-only
  fallback (identical energies, void ages, ratios carried); sampler
  clamp; empty buffer invents nothing; the backstage wire pinned by
  source assertions.
- **Gates green:** creatureGate OK, replayGate OK,
  refreshFixtureCheckpoints OK, performanceCreatures OK (recorded
  takes replay byte-identical — the slice touches no input they carry).
- **accum.selfcheck: OK (67 cases)** solo at raised heap, on the final
  bytes after all edits.
- **Source-pin neighbours for every touched shared file, green:**
  davisShift, dishPins, dishPressure, formation, limbs, roomWidth,
  refineMutate, setLive, audioBus (App.jsx/liveLoop readers);
  accum.seam, accumGuard, accum.inventory (accum.mjs).
- **Full manifest sweep:** attempted with a tolerant driver; under the
  second builder's concurrent load it worked through the manifest's
  first half in ~21 min and was stopped at the in-sweep accum run —
  the known default-heap artifact (#1806/#1807 recorded the same;
  accum solo at raised heap is green above). Its tally was lost with
  the stop, so coverage stands on the enumerated runs: every suite
  pinning a touched file, all gates, plus a back-half sample —
  wetFeed, costTiers, mlxExport, trailMode, trioLive, clockRecord,
  stressRecord, exportStill, all green; livingMotion failed under
  load and passed its solo re-run (both results stated, per house
  rule). CI remains authoritative for the sandbox pair (swarmWasm —
  no cargo; rollSafety).
- **Build green** (`npm run build`, ✓ built in ~4 s); prettier applied
  to every touched file (only the new selfcheck needed formatting; the
  manifest is not a prettier-parsed file).
- **Measured evidence** (`docs/review/1808/README.md`): a comet laid
  through the mirror reads back exactly as a trail should — head cell
  energy 1.0000 at age 0.000 s, ages rising monotonically down the tail
  to 1.485 s, b/g falling 1.000 → 0.161 in step with the true ages.

## Costs, stated plainly

- **No new GPU pass, shader, or target** — no cost tier registered
  (the readback reuses readAge's pattern; the derivation is CPU math
  on a snapshot, outside the GPU cost model).
- **Derivation ≈ 37 ms at pair size** (1600×1100, fully lit worst
  case; ~45 ms under the second builder's load) in this sandbox. In
  this slice its only caller is the backstage readout's ~4 Hz poll,
  and the live readback it feeds on is pair-resolution RGBA float
  (~28 MB) per poll — debug-only costs, on the record. A steering
  consumer's cadence (the issue prescribes throttled, frame-stamped
  reads) and its device-harness budget are slice 2's acceptance to
  prove; if the full-res derivation is too heavy there, the honest
  paths are a dead-pixel skip (exact — dead pixels contribute zeros)
  or rung 1's GPU reduction readback when it lands. Not assumed here.

## What I deliberately did NOT build

- **No steering** (slices 2–3) — see the scope decision above; the
  moth drive, the sign flip, the non-collapse soak and the 2,000-frame
  steering replay test all belong to the gated slices.
- **No governor shed for steering** — there is nothing to shed yet;
  it arrives with the drive it sheds (slice 2's acceptance).
- **No grid in the take/recorder system** — the grid is derived state,
  recomputed from the buffer; recording it would be a second source of
  truth. Slice 2's replay test will pin that derivation-from-buffer
  replays exactly.
- **No change to dishTrails** — the petri organisms' deposit field is
  a different substrate (see the premise correction); unifying them is
  not this issue's ask.
