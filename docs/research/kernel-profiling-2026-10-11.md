# Kernel field profiling pass (2026-10-11)

Closes the question #1299 asked ("lock the crate order") and decides #1316.
Measured on the Mac Studio (Apple M2 Max), Node 22 for JS, headless Chromium
(ANGLE / Metal) for GPU. Median of 9 runs after 3 warmups. Scripts were
throwaway; the numbers below are the record.

## JS reference cost per call (ms)

| Lanes | noise (fBm, 3 oct) | scent sample | ca sample |
|------:|-------------------:|-------------:|----------:|
| 1,024 | 0.16 | 0.06 | 0.05 |
| 4,096 | 0.53 | 0.21 | 0.05 |
| 16,384 | 2.05 | 0.29 | 0.16 |

Per-frame, not per-lane: scent `step()` (64x36 diffuse + decay) is 0.18 ms;
`makeCaField` pre-blur is 0.08 ms and happens once per grid, not per frame.

## What already shipped (from the PRs, not re-measured here)

- `kc-fields` (#1332): noise batch 1.45x faster than JS (4,096 lanes);
  scent step ~28x (0.18 ms -> ~0.01 ms). Bit-identical on every lane tested.
- `kc-neighbor` (#1331): bit-identical RNG streams and neighbor loop.

## GPU round trip, noise field (transform feedback + readback)

Includes the harness's base64 in/out, so it overstates the real cost a little:

| Lanes | JS | GPU round trip |
|------:|---:|---------------:|
| 1,024 | 0.16 | ~0.5 |
| 4,096 | 0.53 | ~0.5 |
| 16,384 | 2.05 | ~0.9 |

The GPU path has a fixed floor of roughly 0.5 ms (upload, dispatch, sync
readback). It breaks even near 4k lanes and is about 2x faster at 16k.

## Conclusions

1. **Scent and ca on the GPU: do not port.** Their whole JS cost at 16k lanes
   (0.29 ms and 0.16 ms) is below the GPU's fixed floor, so a port cannot win
   and would add a second implementation plus a measured tolerance to carry.
   #1316 is closed as "measured, not worth it" on this data. Reopen only if a
   consumer ever needs these fields at lane counts far above 16k.
2. **Noise on the GPU is the only field with a case**, and only at 4k+ lanes.
   It already has its twin (#1336). Whether to enable it is a product call
   (`FIELD_BACKEND` stays `'js'`), not an engineering gap.
3. **Rust order is settled and finished.** Noise, then scent, then neighbor,
   all landed or in review. There is no remaining crate to schedule.
4. **Absolute savings are small.** Everything above totals a couple of
   milliseconds per frame at the largest tested lane count; the wins matter
   mainly for the worker/shed budget, not for a 60 fps frame by itself.

## Caveats

- JS timings are Node/V8 and the live app runs the same engine in the
  browser, but a WebKit (iPad) run was not done. JSC may rank differently.
- GPU numbers are one machine's GPU. SwiftShader (CI) is far slower and is
  correctly not used for any of this.
