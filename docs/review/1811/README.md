# #1811 — two-compartment pigment with Kubelka-Munk mixing

Evidence for the pigment slice of the WET spine, built on the #1810 branch
(128 grid). All numbers below are from `probe.json` / `probe-cost.json` in
this folder, produced by scripted sessions against the code in this branch —
nothing here is estimated or drawn by hand.

## Premise (checked before building)

The field had **no pigment at all**: `vortex.mjs` state was omega, psi,
vx, vy, wet + vortons, and its own header deferred the work ("pigment
mixing itself is slice 5 and is not in this module"). The only "Kubelka"
in the tree was a comment in `accum.mjs` naming what the wet composite's
colour average is **not** ("cheap pigment mix. Not Kubelka-Munk") — a
display-side blend, not field pigment. #1809's review README stages the
compartments for this issue. Premise holds; nothing was re-implemented.

## What shipped

- **`app/src/gl/pigmentKM.mjs`** — pure Kubelka-Munk colour math. A colour
  deterministically derives a reflectance spectrum over 8 bands
  (400–700 nm) from fixed R/G/B primary basis spectra (per-band normalized,
  so white and greys reconstruct exactly); K/S follows the single-pigment
  inversion R∞ = 1 + K/S − √((K/S)² + 2K/S). Mixtures are the finite-layer
  KM solution over a paper backing, concentration-weighted. The same pure
  derivation yields per-pigment character — density ρ, staining/lift
  resistance ω, granulation γ — from pinned, documented heuristics, cached
  per colour.
- **Two compartments in `vortex.mjs`** — `pigS` (suspended: advects with
  the velocity field, semi-Lagrangian) and `pigD` (deposited: **no
  advection path exists for it**), each RGBA: premultiplied colour + total
  density. Stepped in Curtis's order after the water move:
  MovePigment → TransferPigment. Settling ∝ suspended density × the
  pigment's deposition rate (density × granulation over the paper grain);
  lift ∝ wetness² × (1 − stain resistance) — fresh water pulls deposit
  back into suspension. Both moves are computed from start-of-transfer
  values and applied together, so transfer conserves the per-cell total
  exactly. Stamping follows the inkwash asymmetry: water adds (clamped),
  **pigment adds** — and a stamp onto a cell holding another colour
  _mixes_: the stored colour becomes the KM mixture's colour.
- **Publication** — `noteWetFrame` / the wet-frame service carry
  `pigStep` / `pigDep`: a pack whose rgb is each cell's deposited-layer
  KM reflectance (finite layer at the cell's own density over paper) and
  whose alpha is its density. A field with no coloured marks never
  creates pigment (`pigmentLive` stays false): the step is then the
  pre-pigment code path untouched, and both standing goldens
  (velocity hash, wet-frame golden frame) hold **unre-pinned**.
- **First consumer (ACCUM)** — a pigment variant of the wet fade
  (`FADE_PIG_FS`, string-derived like the other wet variants, so the
  cost-tier program list is unchanged) multiplies the faded buffer by
  the deposited reflectance: the buffer's light is absorbed by the
  deposited layer's KM-computed reflectance — the issue's law, not a
  Beer-Lambert exponent. The CPU mirror carries the same term; a
  bare-paper pack is a byte-exact no-op, and the recipe gate drops the
  pack whenever `pigStep ≠ 1`. The dish is untouched: grip stays water;
  the pack doubles as the backstage stain read.
- **Degraded service** still stamps pigment from tinted instances and
  runs the transfer (settling/lift are local); only advection waits for
  the full sim, exactly as the shed's contract already states for water.

## The mixture test (the acceptance case, by name)

Blue (0.10, 0.25, 0.85) + yellow (0.95, 0.80, 0.10), equal concentrations,
one layer over paper (`probe.json → mixture`):

|                            | R     | G         | B     | reading                 |
| -------------------------- | ----- | --------- | ----- | ----------------------- |
| KM mixture (this code)     | 0.165 | **0.560** | 0.253 | living green            |
| naive average (RGB lerp)   | 0.525 | 0.525     | 0.475 | grey                    |
| stored pigment colour (R∞) | 0.165 | 0.560     | 0.253 | same green              |
| 25 blue / 75 yellow        | 0.272 | 0.698     | 0.168 | yellow-green            |
| 75 blue / 25 yellow        | 0.117 | 0.460     | 0.390 | blue-green              |
| blue + red 50/50           | 0.196 | 0.249     | 0.169 | darker than both inputs |
| red + yellow 50/50         | 1.000 | 0.217     | 0.110 | orange                  |

The selfcheck (`pigmentKM.selfcheck`, check 3 by name) asserts the green
band with saturation ≥ 3× the naive average's — a density-averaging
implementation fails it by construction. The same mixture appears in the
field: blue and yellow wash discs stamped into the sim, settled, and read
back through the deposited pack (`still-deposited-reflectance.png` —
rendered from the pack bytes, not drawn):

| sample                    | reflectance               | alpha |
| ------------------------- | ------------------------- | ----- |
| blue-only                 | (0.102, 0.247, 0.863)     | 1     |
| yellow-only               | (0.988, 0.800, 0.098)     | 1     |
| **overlap**               | **(0.161, 0.518, 0.251)** | 1     |
| co-located deposit colour | (0.165, 0.534, 0.241)     | —     |

## Field character (pinned sessions, measured)

| behaviour                                                    | measured                                                                            | asserted in                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------ |
| transfer conservation, one 2.0 stamp, 600 steps, no flow     | total 2.0 → 2.0000004 (drift 0.00002 %); suspended → 0.00002, deposited → 1.99998   | vortex.selfcheck               |
| deposited centroid, 600 stirred steps (stirring 650 px away) | drift **0.005 cells**                                                               | vortex.selfcheck (< 0.5)       |
| suspended burst in an established vortex, 40 steps           | displacement **12.76 cells** vs 0.011 unstirred                                     | vortex.selfcheck (> 5 / < 0.5) |
| lift: deposit rewetted hard for 120 frames                   | deposited 5.54 → 2.67 (−52 %)                                                       | vortex.selfcheck (< 0.7×)      |
| determinism                                                  | identical tinted sessions → identical `hashPigment`; freeze holds both compartments | vortex.selfcheck               |
| pigment absent                                               | compartments all-zero, `pigmentLive` false, goldens unmoved                         | vortex + wetFrame suites       |

Character derived per colour (from `probe.json`): blue ρ 0.98 / ω 0.47 /
γ 0.16; yellow ρ 0.54 / ω 0.37 / γ 0.14; black ρ 1.20 / ω 0.76 / γ 0.43;
white ρ 0.35 / ω 0.15 / γ 0.37 — darker pigments denser and more
stain-resistant, as the heuristics intend. Spectrum round-trips: white
and greys exact; saturated colours within 0.01 per channel.

## Cost (registration)

`gl/vortex` re-registered: **timeMs 6.6** (was 2.7), memoryBytes
**1,376,256** (was 393,216 — the old formula also undercounted the
pre-existing state: it omitted the wet plane pair and the vorton
scratch; the new ledger counts 7 grid planes + 3 pigment RGBA arrays +
ring and scratch). Method and raw batches in `probe-cost.json`: on
identical scripted sessions, the pigment-absent step measures
2.12 / 2.52 ms (the #1810 path, unchanged) and the pigment-live step —
pigment across ~58 % of the field, the sim's worst case and the #1810
registration convention — 6.93 / 6.28 ms (medians of batch medians, two
runs). Sandbox numbers on a shared VM; device confirmation stays with
the #1695 harness, as #1810 already recorded. Memory for the two
compartments proper: 2 × 128² × 16 B = 0.5 MB, the issue's own figure
(the third array is the advection scratch).

Per-step work is bounded by the pigment's occupied region (tracked as a
bounding box, re-derived from the field each step), and the resample
reuses the wet pass's scratch discipline — a session with no coloured
marks pays nothing at all.

## Simplifications, named (Curtis-lite where the issue allows)

- The water's capillary step stays the shipped mask diffusion (the issue
  sanctions this); pigment does not diffuse laterally — in still water a
  wash stays where it landed, which the acceptance scenes rely on.
- Advective resampling blends the premultiplied channels linearly
  (ordinary semi-Lagrangian numerical diffusion); KM mixing governs
  stamping and every colour the field _reports_ (deposited reflectance
  is computed by the KM layer formula, never a lerp).
- A cell holds one colour (the mixture's own colour) rather than a
  per-pigment concentration vector — the compartments' contents are
  therefore exactly what the reflectance pack shows. Per-pigment
  concentrations inside a cell are a possible later refinement; nothing
  in #1812/#1813 asks for them (both read the deposited layer's density
  and reflectance, which this serves).

## Handed on

- **#1812** (edge darkening) reads the deposited density + its gradient —
  `pigD` alpha and the pack's alpha channel are its substrate; the
  accrued-darkening channel is that slice's to add.
- **#1813** (wet-look) uses the deposited reflectance — the pack's rgb.
- **#1815** (warm-up exports) owns export-level reproduction — this slice
  pins the field-level half (identical sessions, identical compartment
  hashes) and leaves the vortex header's live-only paragraph for #1815
  to retire, as that issue's text directs.
