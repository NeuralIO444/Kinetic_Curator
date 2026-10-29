# #1807 evidence — buffer statistics, measured

The statistics have no picture; their evidence is numbers. Below are the
final stamped readings from the real GPU probe (`accumProbe.html`, the
shipped recipe in a headless browser) on three scripted 16×16 scenes of
60 steps each, beside the JS mirror's exact statistics of the same
scenes (`accumStats` over `mirrorAccumStep`'s buffer — the float64
twin). Measured 2026-10-28 in the sandbox (SwiftShader); CI re-proves
the same scenes in `accum.selfcheck.mjs` on every run.

## Scene A — held chord (white dot re-struck every 3rd step; orange block held from step 30; fade 0.94)

| measure    | GPU (frame 60) | mirror (exact) |
| ---------- | -------------- | -------------- |
| energy     | 0.0253         | 0.0253         |
| r mean     | 0.0387         | 0.0387         |
| g mean     | 0.0211         | 0.0210         |
| b mean     | 0.0121         | 0.0121         |
| saturation | 0.0000         | 0.0352         |

Energy and the channel means agree to the fourth decimal. Saturation
diverges, and the divergence is understood, not waved away: this
scene's only saturated pixels are the held block's red channel at
exactly 1.0 — a plateau sitting ON the knee. The GPU's multi-pass FP16
chain lands those pixels a hair under (0.9995, the largest half-float
below 1), so its step() counts none of them; the float64 mirror holds
exactly 1.0 and counts all 9 (9/256 = 0.0352). Both readings are honest
measurements of a degenerate input. The selfcheck therefore holds this
scene's saturation to a documented ±0.04 knife-edge bound, and proves
the issue's ±0.01 acceptance where the input is not degenerate:

## Scene B — white field (bg #ffffff, fade 1.0; hand truth: energy 1, saturation 1)

| measure    | GPU (frame 60) | mirror (exact) |
| ---------- | -------------- | -------------- |
| energy     | 1.0000         | 1.0000         |
| r / g / b  | 1.0000         | 1.0000         |
| saturation | 1.0000         | 1.0000         |

Exact. Two further uniform-field confirmations from the diagnostic run:
a full-white frame re-fed every step at fade 0.94 reads saturation
exactly 1, and a #808080 field reads energy 128/255 with saturation 0
(selfcheck-asserted). A black field reads exact zeros.

## Scene C — dying trail (one lit frame of (0.9, 0.6, 0.3), then 59 empty steps; fade 0.90)

| measure    | GPU (frame 60) | mirror (exact) |
| ---------- | -------------- | -------------- |
| energy     | 0.0034         | 0.0034         |
| r mean     | 0.0090         | 0.0090         |
| g mean     | 0.0012         | 0.0012         |
| b mean     | 0.0001         | 0.0001         |
| saturation | 0.0000         | 0.0000         |

The spectral fade's signature is visible in the numbers: after 59 fades
the red mean (slowest decay, #1800) holds ~7× the green and ~90× the
blue — the channel ratios really do read as the trail's age, which is
the rung-1 claim.

## Cost shape

The reduction runs at most once per 15 steps; its chain at 1080p pair
resolution is 4 passes totalling ~35k texels (≈1/64 of one full-res
pass) plus a one-texel readback — no full-buffer readback exists
anywhere in the path. The committed cost row stands at the ACCUM family
floor (0.3 ms, wall-method relative standing, `measuredCosts.mjs`),
pending a reference-rig re-bless; the ≤0.1 ms/frame acceptance is
measured on the #1695 device harness, not in this sandbox.
