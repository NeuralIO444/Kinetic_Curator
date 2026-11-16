# K2 — culture ↔ fluid coupling in shader space

Status: slice 1 shipped (#2206, GPU culture kernel, parity-exact vs JS). Slice 2 design below.

## Ruling (Matt, 2026-11-16)

Fluid→culture births are decided **fully in-shader**: no CPU births, no per-frame readback of either field.

## Consequence to carry forward

K1 S1 stamped born cells as a Tier D input so the culture chain stayed exact on any device. With births decided in the shader that record no longer exists, so for a take recorded with the GPU path:

- The culture is **Tier S** (the recording device's sim outcome), not decisions-exact. The take stamps `simBackends.culture` with a GPU backend id (a new `gpu.life.v1`), and its `simLaw` follows the stamps (K0).
- Replay on a device without that backend cannot reproduce the culture from decisions. It needs either the recorded culture field (a sparse cell snapshot, as K1 did for the fluid, at the cost of a readback at record time only) or the JS culture with the take marked non-exact. **Ruled (Matt, 2026-11-16): record a sparse culture snapshot**, the K1 `dishFluidCells` pattern (a readback while recording only; replay exact on any device, JS culture stays the reference). Recording needs a readback even though live play does not.
- The JS culture stays the reference (R4). Everything below runs behind a flag, OFF by default.

## Slice 2 plan

1. Shader-space coupling: culture pass samples the fluid density texture (birth floor 0.25) with a seeded per-cell hash draw; fluid coupling reads the culture field texture; both one-frame-behind as today (lag preserved, no feel change).
2. Generation cadence: keep the 8 gens/s accumulator on the CPU clock; the GPU runs N passes per frame.
3. Governor shed = skip passes, as `SHED_STEPS` does today.
4. Parity: **byte-identical**, not statistical. The shader runs the kernel's own integer hash (`hashBase` + the same avalanche in uint32), so given the same density the births match `injectFluidBirths` cell for cell every generation (`parity/cultureSim.selfcheck.mjs`). Only the compare against the chance is float32. A real float32 fluid field can still differ from the JS field's doubles, so a live GPU-fluid + GPU-culture pair is Tier S, as ruled.

## Shipped

- 2a (#2215): `createGpuCulture().births(...)` + generation counter; wired to nothing.
- 2b (next): culture generations on the GPU in `liveLoop` behind a flag (OFF), plus the recorded sparse culture snapshot.
