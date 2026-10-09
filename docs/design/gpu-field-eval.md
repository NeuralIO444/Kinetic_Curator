# DESIGN (deferred) — GPU field evaluation

## Goal

Evaluate dish fields (noise flow, scent, CA density) on the GPU via
transform feedback in WebGL2 now, with a WebGPU path later.
10–100× field resolution: fields are the most parallelizable part of
the kernel, and dense fields are what make weather-as-fields (dish
slice 4) and full-resolution flow visualization affordable on
iPad-class GPUs.

## Why later (deferred)

You cannot port free functions to the GPU — you port modules with
declared boundaries. The field registry (kernel research idea #3)
must exist first: one registered field module = one shader pair, and
the registry's `reads`/`writes` tell the runner exactly which
buffers go up and come back. SoA must exist first: the runner needs
flat position columns in and flat field-value columns out, with no
repacking. And the dish field contract (§1: fields are pure
functions of seed, x, y, t — no pixel readback) is the portability
guarantee; anything that violates it isn't GPU-portable by
construction. On hardware: transform feedback works in iPad Safari's
WebGL2 today, so v1 has no WebGPU dependency; WebGPU in the WebView
is the later upgrade, not a blocker.

## Proposed architecture

New home: `app/src/gl/fields/`.

- `fieldCommon.glsl.js` — shared GLSL: hash and noise primitives
  that match the JS implementations (`field/index.js`,
  `field/scent.js`). Bit-match where feasible; where GPU float
  behavior can't match CPU, the divergence is documented with a
  measured tolerance, never silent.
- Per-field shaders, e.g. `noiseField.glsl.js`, `scentField.glsl.js`,
  `caField.glsl.js` — one pair per registered field module.
- `fieldRunner.js` — transform-feedback runner: uploads the SoA
  position columns, runs the field shader, and either keeps results
  on the GPU for the render pass or reads back when the CPU needs
  values (marks sampling on CPU per the dish's no-new-GPU-passes
  guardrail — readback is the honest cost, budgeted per field).
- Registry integration: field modules optionally declare
  `gpu: { vertexShader, varyings }`; the runner dispatches
  registered GPU fields and falls back to JS for the rest.
- `FIELD_BACKEND = 'js' | 'gpu'` — every GPU field keeps its JS
  implementation forever. Default is `'js'`. A
  `fieldParity.selfcheck.mjs` compares GPU vs CPU output within the
  documented tolerance on a fixed fixture.
- WebGPU path (later): same module boundary, `*.wgsl.js` alongside
  the GLSL; the runner abstracts backend, modules don't care.

## Dependency on the dish core

The field registry is the port boundary, and the dish's field
purity rule is the portability proof. The governor's `costTier`
per field tells you which fields are worth porting first (port the
top of the shed list — profile, don't guess). Weather-as-fields
(dish slice 4) is the first consumer that actually needs this.

## Effort

XL. Shader ports + parity harness + fallback paths + the
readback budgeting. The fiddliest of the five designs.

## Risks

- **Determinism: GPU fields are NEVER in the byte-identical path.**
  GPU float precision differs from CPU and between GPUs; this is
  physics, not a bug. Rule, enforced by the backend flag: stills
  and bakes always use CPU fields. GPU eval is an explicitly
  non-deterministic performance path for live performance only.
- **Byte-identical law.** Default stays `'js'`; `'gpu'` is opt-in
  per session and must never be persisted into a recipe silently
  (persist it only as an explicit, visible flag — or don't persist
  it at all in v1).
- **iPad thermal throttling.** Sustained GPU field eval will
  thermally throttle on iPad; frame pacing must never depend on
  readback timing. Treat the GPU path as best-effort throughput
  with the CPU fallback as the timing reference.
- **Parity-harness maintenance.** Every field change needs its
  shader twin updated; the parity selfcheck fails CI if they
  drift — which is the point, but it's ongoing tax.

## Unlocked after it

Dense flow fields at full resolution; CA at interactive rates;
weather-as-fields at a fidelity the CPU path can't afford; and a
clean WebGPU migration later (same module boundary, new backend).
Also the first honest answer to "what does KC-1 look like when the
iPad GPU does the heavy lifting."
