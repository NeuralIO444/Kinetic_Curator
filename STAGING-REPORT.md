# STAGING REPORT — #1876 footprint stamps + suspended diffusion

**Issue (verbatim):** "WET: footprint stamps + suspended diffusion —
washes must form at rest (grid-dots defect)"
**Branch:** `feat/1876-footprint-stamps` on origin/main 582250fd.
Local only — no push, no PR (coordinator publishes). This file
replaces the report that was at the worktree root (#1813's); that
report remains in git history.

## Premise / diagnosis recap

Matt's 2026-10-29 screen recording: with WETNESS up, the wash resolves
into a lattice of dark-cored dots. The diagnosis (goal library,
`hidden_files/wet-dots-diagnosis-2026-10-29.md`) proved the dots are in
the field data: every mark stamped water + pigment as a point (2×2
bilinear splat at the centre, instance scale never read), suspended
pigment spread only via vorton flow, stationary marks shed no
vortons, no diffusion term existed, and the deposited layer never
moves laterally — so each stationary mark left one saturated deposit
dot. I reproduced the diagnosis on this tree before touching anything
(centre 42.8893 vs midpoint 0.0000, autocorr 0.648, packed centre
(29, 78, 137, 255), 1,044 saturated cells) — the numbers match the
report exactly.

## What shipped (plain language)

All in `app/src/gl/vortex.mjs`:

1. **Marks now stamp the area they draw.** A mark's water and pigment
   land over its whole quad — sized by the instance's scale (semi-axis
   99.75 × scale, the quad the renderer draws per QUAD_VS in
   shaders.mjs), turned by its rotation, with a plateau profile (full
   across the face, soft only at the rim). The total load is unchanged
   — the same paint, spread over the mark instead of stacked on its
   centre (the suite proves the totals match to 1e-6).
2. **Suspended pigment now diffuses.** Inside the pigment move stage,
   neighbouring cells exchange a small fraction (0.002) of their
   suspended-pigment difference each step — pairwise, so nothing is
   created or destroyed. It runs at rest (zero flow included), which
   is what lets a wash form under stationary marks. The **deposited**
   layer still never moves sideways — that rule is by design and
   stands.
3. **Diffusion only mixes a film that's being worked.** A pair of
   cells exchanges only if a stamp touched one of them since the last
   step. This gate exists because measurement demanded it (below): a
   wash that is only *drying* must strand its pigment — that's
   #1812's edge-darkening doctrine — and ungated diffusion measurably
   eroded it. Marks that carry no scale (tests, legacy callers) keep
   the old point stamp exactly; the live contract always carries
   scale. Under the governor's shed, stamps land over footprints but
   diffusion does not run — transport is shed as a unit, as before.

## Before / after (the acceptance scenario)

Real wet-frame service, 266 stationary marks at the measured
51.4-unit pitch, wetness 0.85, 900 steps; instances carry scale
0.26 (a quad one module wide — see the instrument note below):

- centre/midpoint deposited ratio: **~43 (midpoint exactly 0) → 1.28**
  (the drifting control is ~1.2);
- radial profile: 47.5 / 3.7 / 0.01 / 0 / 0 → **1.83 / 1.71 / 1.60 /
  1.45 / 1.15** — a wash, no cores;
- max deposited density ~74 → **3.96**; saturated cells 1,044 → none
  (124 cells over 3.0, all in the wash body);
- drifting marks: ratio 1.00, profiles flat — moving character
  unchanged; total pigment conserved (50,271.7 of 50,274 stamped);
- #1811's KM mix holds: overlap deposits the living green, centre
  colour (0.166, 0.530, 0.242) vs (0.167, 0.532, 0.241) pre-fix;
- robustness: scale 0.5 → ratio 0.90, flat ±12%; scale 0.13 → marks
  are dabs their own size (peak 5.97, not 74), midpoints bare as
  paint leaves them; 1800 steps → ratio 0.72 (over-levels slowly,
  never re-lattices). Full tables: `docs/review/1876/`.

**Instrument note (read before re-measuring):** the diagnosis probe's
instances carried **no scale**, so on any build they take the point
path. The fix keys the footprint off the scale the live contract
always supplies — a re-run of the unmodified diagnosis probe will
still show dots, by design. Add `scaleX`/`scaleY` to its instances
(0.26 for a module-wide quad) and it reads the numbers above; the
method is spelled out in `docs/review/1876/probe.json`, and the
vortex selfcheck carries the same scenario in miniature (5×5 grid,
ratio: point stamps in the thousands → footprint stamps 1.33).

## Tuning record (why these exact shapes — details in docs/review/1876/)

- Centre-peaked stamp kernels (biweight ellipse/square, feathered
  top-hat) were measured and rejected: they starve the quad's own rim,
  and once diffusion is strong enough to compensate, the lift gradient
  (lift ∝ wet²) sorts pigment wet→dry and the lattice returns as rim
  rings / corner sinks (ellipse at D = 0.1: ratio 0.12). The plateau
  is the coverage the renderer draws.
- Ungated diffusion at D = 0.002 eroded #1812's scripted dry
  (edge-to-centre ratio 1.6 → 1.15; centre accrual 0.0204 vs its
  0.02 pin). Wetness-coupled pair rates (min/max) moved the failure
  rather than fixing it. The worked-film gate removed the cause, and
  the interim centre-accrual re-pin taken during development was
  **reverted** — #1812 passes at its original pins.
- D = 0.002 is the measured middle: footprint alone leaves ratio
  ≈ 2.1; 0.002 → 1.28; 0.003 → 0.95; #1811's lift case passes at
  0.002 and fails at 0.004, bounding it from the other side.

## Verification (this sandbox; CI is authoritative)

- `vortex.selfcheck`: **39 passed** (34 pre-existing + 5 new #1876
  cases: conservation/spread, quad geometry + rotation, diffusion
  conservation + worked-film stranding, the acceptance grid in
  miniature, constants pin).
- `wetFrame.selfcheck`: 15 passed · `wetLook.selfcheck`: 16 passed ·
  `composite.selfcheck`: 15 passed · `accum.selfcheck`: **83 passed**
  (solo, `NODE_OPTIONS=--max-old-space-size=3072`) ·
  `costRegistry.selfcheck`: OK · `liveLoopSwell.selfcheck`: OK.
- `npm run build`: green.
- Source-shape pins: grepped all selfchecks for assertions naming
  the touched files — only vortex/wetFrame/wetLook suites touch this
  territory (qaRegression's "vortex" hit is a palette id); all run
  above. No other module references the new symbols.
- Cost (docs/review/1876/probe-cost.json): same-session A/B on the
  #1811 bench — pigment-live +0.3–0.5 ms/frame vs base, pigment-
  absent unchanged.

## Re-pins (each with its cause — the complete list)

1. **`gl/vortex` memoryBytes 1,507,328 → 1,523,712** (registration in
   vortex.mjs + the formula in vortex.selfcheck): +16,384 B is the
   new `wetWork` byte plane, counted exactly as #1812 counted its
   planes.
2. **timeMs: measured, pin stands at 6.6** — the A/B delta is the
   size #1812 recorded inside this figure; the selfcheck comment and
   registration notes now carry the #1876 A/B.
3. **No golden hashes re-pinned. No #1811/#1812 behaviour pin
   changed** (the one interim re-pin was reverted, above).

## Notes for the coordinator

- **PR #1875 (#1815) rebase:** it edits vortex.mjs header/doctrine
  text; this build also adds a header paragraph (after #1812's) and
  constants-block text. Both are additive; a textual conflict at
  rebase is possible in the header region but should resolve by
  keeping both paragraphs.
- New state (`wetWork`) is a plain `Uint8Array` on the vortex state —
  it rides the existing state object like `pigEdge`/`_wetPrev`; no
  serialisation surface was touched.
- Nothing added to DEFAULT_LAYOUT_PARAMS; no manifest change (the
  vortex suite was already wired; no new suite files).
