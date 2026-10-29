# #1876 — footprint stamps + suspended diffusion: review evidence

Issue: "WET: footprint stamps + suspended diffusion — washes must form
at rest (grid-dots defect)". Everything here is sandbox-measured (node,
this VM); CI is authoritative for the suites. The defect and its proof
are the 2026-10-29 diagnosis (goal library,
`hidden_files/wet-dots-diagnosis-2026-10-29.md`); the BEFORE column
below was reproduced on this tree before the fix, byte for byte
(centre 42.8893 vs midpoint 0.0000, autocorr 0.648, packed centre cell
(29, 78, 137, 255)).

## What shipped (all in `app/src/gl/vortex.mjs`)

1. **Footprint stamps.** `emitFromInstances` now stamps water +
   pigment over the mark's drawn quad, not the 2×2 cells at its
   centre: semi-axes `99.75 × |scaleX|`, `99.75 × |scaleY|` scene units
   (QUAD_VS: `au ∈ [-49.75, 149.75]`, centred on the 100-box, UVs span
   the whole quad), rotated by the instance's contract rotation. The
   kernel is a separable plateau — full weight across the quad's face,
   cosine falloff across the outer fifth of each semi-axis — with the
   weights normalised to sum 1, so **a stamp delivers exactly its
   point-stamp load, spread over the footprint** (water included). The
   selfcheck proves conservation on one emit (footprint vs point
   totals equal to 1e-6 relative) and the geometry (anisotropic scale;
   rotation 90° turns the extents). Instances with no usable scale —
   or a footprint smaller than a field cell — take the pre-#1876 point
   splat byte-for-byte: the field cannot know their size, and every
   pinned session in the suites is one of those.
2. **Suspended diffusion.** Inside `movePigment`, after advection, a
   pairwise-conservative exchange diffuses the **suspended**
   compartment only (`PIGMENT_DIFFUSE = 0.002` of the neighbour
   difference per step, all four channels by the same operator, work
   bounded to the occupied box + 1). It runs even at zero velocity —
   the wash's rest transport. The deposited compartment is never
   diffused: deposited pigment still never moves laterally.
3. **The worked-film gate.** Diffusion mixes only pairs touching a
   cell a stamp touched since the last step (a new `Uint8Array` state
   plane, `wetWork`, marked by every stamp applier and cleared by
   `stepVortex`). Reason, measured below: ungated diffusion erodes
   #1812's drying signature. With the gate, a film that is only drying
   strands its pigment exactly as the shipped doctrine has it, and
   the #1812 suite passes with **zero re-pins**.

The degraded shed path (wetFrame) stamps footprints too — stamps land
under the shed by its contract — but runs no diffusion there, as
before: transport is what the shed sheds, and diffusion is transport.

## The acceptance measurement (probe.json)

266 stationary marks, 51.4-unit pitch, wetness 0.85, 900 steps, real
wet-frame service; instances carry the scale the live contract always
carries (scale 0.26 ≈ a quad one module wide; the diagnosis probe's
instances carried none — corrected here and noted in probe.json):

| | centre | midpoint | ratio | radial rings 0–4 | max |
|---|---|---|---|---|---|
| before (point stamps) | 42.89 | 0.0000 | ∞ | 47.5 / 3.7 / 0.01 / 0 / 0 | ~74 |
| after, stationary | 1.76 | 1.37 | **1.28** | 1.83 / 1.71 / 1.60 / 1.45 / 1.15 | 3.96 |
| after, drifting | 0.22 | 0.22 | 1.00 | flat 0.21–0.23 | 0.25 |

The drifting control the issue cites is ~1.2; the stationary wash now
sits at 1.28 with a smooth radial falloff and no saturated cores (124
cells over density 3, vs 1,044 saturated cells before). Robustness:
scale 0.5 → ratio 0.90, radial flat ±12%, no hot cells; scale 0.13
(sparse small marks) → each mark is a dab its own size (peak 5.97, not
74) and midpoints stay bare, as paint would leave them; 1800 steps →
ratio 0.72, the wash over-levels slowly but never re-lattices
(probe.json has the full table). The selfcheck carries the same
acceptance in miniature (5×5 grid, direct field): point stamps ratio
in the thousands, footprint stamps 1.33.

## Why the kernel is a plateau, and why D = 0.002 (the tuning record)

Two measured dead ends, kept here so they are not re-tried:

- **Centre-peaked kernels** (biweight over the inscribed ellipse;
  separable biweight over the square; a feathered top-hat): all leave
  ratio either ≫ 1 (midpoints starved — the kernel's own rim is at
  ~3% of peak, so the quad's rim and corners get almost no source) or,
  once diffusion is strong enough to fill the gaps, **invert** the
  lattice: the transfer stage's lift (∝ wet²) makes wet cells
  recycle their deposit while dry cells keep everything that settles,
  so pigment sorts wet → dry and the deposit re-forms as rim rings
  and corner sinks (ellipse, D = 0.1: ratio 0.12, radial rings 3–4 at
  ~4.1 vs centre 0.49; plateau at D = 0.005: ratio 0.64 and falling).
  A stamp's
  coverage is its face — the plateau is the shape that matches what
  the renderer draws, and the only one whose source field is flat
  enough for the lift gradient to leave alone.
- **Ungated diffusion at any strength that matters** erodes #1812: in
  the suite's scripted dry (700 steps, no stamps), lifted rim pigment
  random-walks off the rim cliff; the edge-to-centre displayed ratio
  fell 1.6 → 1.15 (D = 0.002) and the wash centre accrued 0.0204
  against its 0.02 pin. Wetness-coupled variants (pair rate ∝ min or
  max of the pair's wet) only moved the failure around (min starves
  the acceptance midpoint — a dry cell cannot bootstrap its own
  filling; max still erodes the rim to 1.28). The worked-film gate is
  the principled cut: in this model suspended pigment has only ever
  moved when the water is worked or flowing (vorton advection);
  diffusion is the worked film's mixing, and a drying film strands —
  which is #1812's own doctrine, not a new exception.

D sweep at the acceptance geometry (plateau kernel, stamps every
step): footprint alone (D → 0) leaves ratio ≈ 2.1; **0.002 → 1.28**;
0.003 → 0.95 (past level); 0.005 → 0.64. 0.002 is the middle the
issue asked for — enough to close to the drifting control, not
enough to blur moving washes (drift ratio/profiles/totals unchanged
in band) or to break #1811's lift balance (its suite case passes at
0.002 and fails at 0.004, which bounds the constant from the other
side).

## Interactions and pins

- **#1811 KM**: the blue+yellow overlap still deposits the living
  green — centre colour (0.166, 0.530, 0.242) vs pre-fix (0.167,
  0.532, 0.241); its density is unchanged because the case's marks
  are scale-less (point stamps) and its settle steps run no stamps
  (gate closed). Grand totals conserve exactly (16.80 stamped, 16.80
  in field).
- **#1812**: zero re-pins. The one re-pin taken during development
  (centre accrual 0.02 → 0.03) was reverted once the gate removed
  its cause; the suite passes at the original pins.
- **Golden hashes**: untouched. `hashVelocity` 2493009798 stands
  (velocity derives from vortons only). Pigment-free sessions: the
  pigment stages still skip outright until the first pigment stamp,
  and scale-less sessions are byte-identical to the pre-#1876 build.
- **Cost** (probe-cost.json): memoryBytes 1,507,328 → 1,523,712 (the
  wetWork byte plane), formula updated in the registration and the
  selfcheck. timeMs pin **stands at 6.6**: same-session A/B on the
  #1811 bench measures +0.3–0.5 ms/frame (the #1812 precedent —
  +~0.3 ms recorded inside the figure); pigment-absent unchanged.

## Simplifications, named

- The footprint is the drawn **quad**, not the asset's ink coverage:
  the field is CPU-side and the atlas is GPU-side; the quad is the
  coverage the renderer itself draws. An asset that inks only its
  middle will stamp a wider wash than its visible ink — bounded by
  the quad, and the same bound the renderer's own effects (glass,
  plate, wash bodies) already use.
- Diffusion is isotropic and per-step; the field's cells are
  anisotropic (7.87 × 5.51 units), so the physical diffusion length
  differs by axis by the cell aspect — the same anisotropy the
  advection resample already lives with.
- Marks centred off-canvas whose footprints overlap the field now
  stamp their on-field part (load renormalised onto it); the point
  path drops such stamps whole. Live instances are on-stage by
  construction, so this is a boundary note, not a behaviour change.
