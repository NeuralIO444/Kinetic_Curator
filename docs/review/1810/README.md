# #1810 — 128-grid sim, fewer solver iterations (measured cost gate)

Issue (verbatim): **"WET: 128-grid sim, fewer solver iterations (measured cost gate)"**
Parent: #1809 (wet-frame service — this slice stands on `gl/wetFrame.mjs`).

## Premise verdict: HOLDS — built

Verified against the code before building: `VORTEX_GRID` 64, `VORTEX_JACOBI`
30, `VORTEX_MAX` 2048, and the `gl/vortex` registration carried `timeMs: 0.5`
under the module header's own admission — "the selfcheck budget, not a
measured fact." No part of the sim already ran at 128.

## What changed

| Constant | Before | After | Source |
| --- | --- | --- | --- |
| `VORTEX_GRID` | 64 | **128** | the issue (one field, one resolution) |
| `VORTEX_JACOBI` | 30 | **20** | the issue (the surveyed engines' convergence point) |
| `VORTEX_MAX` | 2048 | **4096** | re-derived with the grid: 0.5 vortons/cell at the old cap → 0.25/cell at the new one; the issue's named starting point, held by the cost measurement below |
| `gl/vortex` `timeMs` | 0.5 (admitted non-measurement) | **2.7 (measured)** | this gate |
| `gl/vortex` `memoryBytes` | 114,688 | **393,216** | the registration's own formula at the new constants (`128·128·4·5 + 4096·16`) |

Nothing else in the sim changes: fixed dt (1/60) and a fixed iteration count
remain the determinism contract (#806); stepping is still a pure function of
frame state. Two runs of every scripted session below hash-identical at both
grids; `replayGate` / `creatureGate` / `refreshFixtureCheckpoints` green.

## The cost gate (acceptance)

Method: identical scripted sessions against the untouched base and the
changed tree (probe preserved as `probe-grid64.json` / `probe-grid128.json`
beside this file). Two loads: a scripted steady state (the wetFrame-style
session, fed while timing) and the worst case the issue names — the vorton
cap filled and held filled while timing. Median of 5 batches × 60 steps.
**Sandbox numbers** (this VM, shared with a second builder lane — indicative,
not device claims; the #1695 device-harness run on Mac Studio + iPad-class
hardware remains the named later gate, as it was for #1817–#1820).

| Load | 64 / 30 / 2048 | 128 / 20 / 4096 | Ratio |
| --- | --- | --- | --- |
| Scripted steady state | 1.009 ms/step | 2.662 ms/step | 2.64× |
| Vorton cap filled | 1.075 ms/step (cap held at 2046) | 2.719 ms/step (cap held at 4094) | 2.53× |

The issue's own cost model predicted "fewer iterations at 4× the cells ≈
2.7× today's solve work." The measurement (2.53–2.64×) lands **under** that
prediction — the envelope the issue budgeted for is the one the measurement
confirms, so **the pinned fallback order (iterations → cap → resolution) is
not triggered**. The registration now carries the measured value with its
provenance in the notes, per the house convention for CPU costs.

## Field character — finer, not different (the re-pin evidence)

Same scripted input, both grids. S0 = 120 frames, instances only, never
saturates either cap (720 vortons — isolates grid + iterations). S1 = 240
frames with ambient emission (saturates the old cap; reaches 2,388 at the
new one).

| Statistic (S0) | 64 / 30 | 128 / 20 | Δ |
| --- | --- | --- | --- |
| mean speed | 1.4151 | 0.9393 | −33.6% |
| p95 speed | 6.3722 | 5.3845 | −15.5% |
| max speed | 33.790 | 45.995 | +36.1% |
| ∫\|ω\| dA (area-normalized) | 0.08680 | 0.10094 | +16.3% |
| total wet mass (Σ wet) | 103.278 | 108.544 | +5.1% |

(S1 shows the same shape: mean speed −35.2%, ∫\|ω\| +17.7%, total wet mass
+2.8%.)

Every delta has a named physical cause, and the conversions are explicit —
nothing is absorbed silently:

- **Total wet mass is the mask invariant, and it is conserved (+5.1% / +2.8%).**
  A stamp deposits the same mass at any grid. What drops ~4× is the
  *per-cell mean* and the *area coverage above fixed thresholds*
  (coverage ≥0.05: 0.212 → 0.050 in S1) — the same water concentrated in
  ¼ the area, which is precisely the 64-grid bilinear smear the issue calls
  the defect. Point semantics are unchanged: stamp amounts, the clamp, the
  dry factor, and the regime thresholds (damp 0.05 / wet 0.35 / soaked 0.8)
  are point values, untouched.
- **Mean speed falls by a third; peaks and vorticity rise.** 20 damped-Jacobi
  iterations transport the low-frequency (large-scale) modes less far on a
  finer grid — the trade the issue's research names ("buying finer flow
  structure instead of redundant convergence") — while near-vorton gradients
  the 64 splat smeared over 4× the area now resolve (+36% peak speed,
  +16–18% ∫\|ω\|).
- These statistics are pinned as a character case in `vortex.selfcheck`
  (bands ≈1.5× the measured deviation, reasons in the case) so a future
  change that silently halves or doubles the field fails loudly.

## Goldens re-pinned in this PR — each one the resolution change itself

- `vortex.selfcheck` velocity golden: 3932816161 → **2493009798**; the
  Jacobi pin 30 → 20; new pins for grid 128 / cap 4096.
- `wetFrame.selfcheck` final-frame golden (fnv(mask) ^ fnv(vel)):
  2550213434 → **3108730517** — slice A's report names this exact re-pin as
  #1810's. Two degraded-service cases in that suite hardcoded 64-grid cells
  (the stamp's largest-weight cell; the mask byte under a stamp); both now
  **compute** the cell from `stampWet`'s own mapping, so the cases state
  their intent at any grid instead of pinning a resolution by accident.
- The `vortex.selfcheck` mask-advection case hardcoded 64 in its centre-of-
  mass loops; now `state.n`-based, same intent.
- `wetFeed.selfcheck` (7) passes **unmodified** — the feed contract (shader
  sources + recipe gate) does not hash the field.
- ACCUM: see the staging report — the accum suite's verdict on this tree,
  with any golden movement named there.

## Stills

`grid64-wetmask.png` / `grid128-wetmask.png` / `grid64-velocity.png` /
`grid128-velocity.png` — direct data renders (grayscale mask; false-colour
speed) of the same seeded 240-frame session's final field at both grids,
the field-level A/B. The 128 velocity field resolves the vorton wakes the
64 field smears; the 128 mask sits where the paint landed instead of
blooming past it. The **live-look** A/B on the canvas is Matt's review-lane
item per the issue's acceptance — these stills are the honest field data
underneath it, not a substitute for his eyes.
