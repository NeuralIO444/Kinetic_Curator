# #1812 — edge darkening on drying: review evidence

Issue: "WET: edge darkening on drying (the signature, no state machine)".
Everything here is sandbox-measured (node, this VM); CI is authoritative
for the suites.

## What shipped

One new field channel on the shared wet state (`app/src/gl/vortex.mjs`):
`pigEdge`, the accrued edge-darkening excess per cell. The displayed
density of the deposited layer is `deposited × (1 + pigEdge)`, applied
inside `packPigmentDeposited` — the deposited pack every reader already
consumes — so the ACCUM fade, the future #1813 wet-look pass and the
backstage stain read all see the darkened rim from the day they read the
pack. Pigment that never darkened packs byte-identically to #1811.

The accrual runs inside the sim's step, after MovePigment and
TransferPigment (Curtis order: the stage acts on the deposit the same
step settled). A cell accrues

    Δ = EDGE_DARKEN_K · |∇d| · (band overlap / band width),  K = 1.35

where `|∇d|` is the central-difference gradient of the deposited density
at field resolution and the band overlap is how much of the **damp
band** — wetness 0.35 → 0.05, the WET regime thresholds the service
already names — the cell's wetness fell through this step. A complete
dry through the band accrues exactly `K · |∇d|` (the issue's formula);
a partial fall accrues proportionally; a cell that stays wet, rises, or
never enters the band accrues nothing. The accrual is capped at
`EDGE_DARKEN_CAP = 2`; rewetting and drying again accrues again, up to
the cap. The constants are recipe constants in `vortex.mjs`, pinned by
selfcheck — no panel slider.

**No state machine**: there is no wet/drying/dry enum and no drying
timer. The step snapshots the wetness plane before it runs (one scratch
copy, pigment-live steps only) and the stage compares values — drying
is arithmetic on two numbers, not a phase a cell is *in*. Previous
wetness is read, never stored as a regime.

**Degraded parity**: under the shed the mask dries by one fixed factor
per frame, so the degraded path calls the same accrual with the
previous wetness reconstructed from that factor — deposits darken on
schedule under the shed exactly as on the full path (selfcheck-pinned).
Darkening is local arithmetic; like transfer it stays under the shed
rather than freezing with advection.

**State honesty**: `pigEdge` is field state like the compartments —
allocated in `createVortex`, counted in the cost registration (memory
1,376,256 → 1,507,328 bytes: two new planes), hashed by
`hashEdgeDarkening` next to `hashPigment`, carried by the field export
(plain data on the state object; the export/held-frame carve-out and
`dishWet` untouched). Identical sessions accrue identically
(selfcheck-pinned); freeze steps accrue nothing.

## The acceptance wash (probe.json, still-edge-darkening.png)

A scripted single wash — blue disc, radius 6 cells, stamped wet at 1.0,
settled by direct transfer, then dried by steps until the field's max
wetness fell below 0.04 (401 steps):

| read | deposited | accrued | displayed |
| --- | --- | --- | --- |
| centre | 0.991 | 0.008 | 0.999 |
| rim (E/W/N/S) | ≈0.99 | ≈0.60 | ≈1.59 |

Displayed ratio rim/centre = **1.586** — inside the issue's ~1.5–2×
expectation; the centre's displayed density moved 0.8% (tolerance read:
unchanged). The same wash held wet for 300 steps accrues **exactly
zero**. Rim accrual over five dry cycles (rewet between):
0.596 → 1.194 → 1.792 → 2.000 (cap) → 2.000.

The still renders displayed density as darkness — deposited alone
(left) vs with the accrued rim (right): the ring is the signature, the
centre is the same grey. (The pack's alpha clamps at 1 and this wash
sits at that clamp, so the ratio is read on displayed density; the
rim's packed reflectance also darkens measurably — selfcheck asserts a
≥10 summed-byte luminance drop at the rim vs the accrual-zeroed pack,
centre bytes within 1–2.)

## Cost (probe-cost.json)

A/B on the #1811 cost session (tint on every mark, ~56% occupied):
base medians 3.87 / 3.71 ms/step, this build 4.32 / 3.85 — the stage
adds ~+0.3 ms/step, **inside the registered 6.6 ms figure**, which
stands (it was measured on a busier VM; re-registering downward on a
quieter machine would understate the governor's worst case). The
pigment-absent path never snapshots and never accrues: byte-identical,
cost-identical.

## Decisions recorded

- **The stage lives in the deposited pack, not the #1813 pass.** The
  issue names the deposited layer as the effect's home ("display
  density"); #1813's wet-look reads the same pack when it lands, so
  one home serves every reader — the #1069 lesson (a capability on one
  render path only) applied in advance.
- **Band-proportional accrual** rather than all-or-nothing band exit:
  on the full path a cell crosses the 0.30-wide band over ~140 steps
  (the dry factor is 0.998/step); a trigger armed anywhere inside the
  band would fire at an arbitrary depth. Proportional accrual makes
  the completed dry equal the issue's formula and keeps the degraded
  path — which jumps the band in ~250 single-factor frames —
  consistent by construction.
- **Wetness fall is measured, never remembered**: the snapshot is
  scratch, overwritten every pigment-live step; nothing about regimes
  persists.
