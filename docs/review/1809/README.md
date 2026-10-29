# #1809 slice A — wet-frame service: evidence

**Premise verdict: HOLDS.** Verified against code + git history before
building: no wet-frame service existed under any name (no module, no
references); `noteWetFrame`'s only caller was liveLoop, gated on
`accumulation && !perfTier1`; the slot was destroyed on ACCUM toggle-off
and on ACCUM fault; `docs/WET_ENGINE.md` (Phase A) and the issue's own
slicing prescribe exactly this extraction. The dish consumes no field
today — its wetness is per-contact-pair scalars (`src/engine/
dishMedium.mjs`) plus grip-step counters (`dishLinks.mjs`) — so slice B
(the dish migration) is a real migration, not a re-point, and stays the
issue's own next slice (review lane, per the issue).

## What shipped

`app/src/gl/wetFrame.mjs` — `createWetFrameService()`: session-owned
field, need-based per-frame consumer requests, one-transport freeze
input, governor shed policy (degraded stamps-only service for consumers
that accept it; named stand-down for those that don't), regime
thresholds (`WET_REGIMES` / `wetRegimeAt`), and per-frame mode reporting
(`wetMode` / `wetShed` on every result — a shed is named, never silent).
liveLoop now requests the field for ACCUM through the service with the
exact inputs it always passed `noteWetFrame`, and no longer destroys
the field on toggle or fault; the frame result carries the wet mode.
`vortex.mjs` gained one exported helper, `ensureVortex` (the slot
lifetime rule, extracted verbatim — its selfcheck is unchanged-green).

## Preservation proof (the Phase A acceptance)

`wetFrame.selfcheck` case 1 runs a 60-frame scripted session (30 live
frames → 5 frozen → 5 at wetness 0 → 10 resumed → 5 at a new seed → 5
at a new size) through both the pre-service path (`noteWetFrame` on a
caller slot) and the service, asserting per frame: wetStep / wetGain /
wetAmount strictly equal, wetVel / wetMask byte-equal. The full-step
path *is* `noteWetFrame` against the service's slot, so equality is by
construction; the check pins the service's policy layer (gate, reset,
hold) against the sim's own outputs so a future policy edit cannot
drift silently.

- Final-frame golden (fnv(mask) ^ fnv(vel), unsigned): **2550213434** —
  re-pins only when the sim changes (#1810).
- Service stats over the session: births 3 (initial + seed + size),
  full steps 50, held frames 5 — the frame profile the gate promises.
- Toggle continuity (case 4): a run with a 10-frame consumer-off gap
  serves byte-identical outputs to an uninterrupted run at every served
  frame; across the gap: 0 steps, 0 rebirths, field standing.
- Existing goldens untouched: `vortex.selfcheck` (19 checks, incl. the
  `hashVelocity` golden 3932816161) and `wetFeed.selfcheck` (7) pass
  unmodified.

## Degraded service (contract-proven, first consumer is slice B's dish)

Under `shed: 'perfTier1'` with `degradedOk`: stamps land (a stationary
mark's largest-weight cell rose by >0.1 through the shed), a stamp-free
frame dries every cell by exactly `VORTEX_WET_DRY` (float-exact over
all 4096 cells), pre-existing vortons neither move nor decay (ring
bytes identical), the sim step counter does not advance, and no
velocity is published (`wetVel` null, `wetGain` 0) while the mask and
amount stay current. Without `degradedOk` the consumer is stood down
with `wetMode: 'shed'` and the field is not even born.

## Measured cost (sandbox VM, shared with a second builder — indicative)

Scripted session, 1000×700, 24 moving marks, 240 frames, two runs:

| path | ms/step |
|---|---|
| direct `noteWetFrame` (pre-service) | 1.43 / 1.98 |
| service full step | 1.09 / 1.37 |
| service degraded step (stamps + dry) | 0.19 / 0.40 |
| service idle frame (no consumer) | 0.02 / 0.01 |

The service adds no measurable overhead to the step it wraps (same
call path; differences are machine noise). The field's cost stays
registered once as `gl/vortex` (tier 1) — the registered `timeMs: 0.5`
predates this slice and is, by its own header, a selfcheck budget, not
a measurement; the real-device measurement and re-registration belong
to #1810's cost gate at the 128 grid. Sandbox numbers above are CPU
sim time only, on a loaded VM — not a device claim.

## Not in this slice (by the issue's own slicing)

- **Slice B — dish on the shared field** (#1809's second slice):
  dish grip/pressure reads and contact stamps migrate to the field.
  Per the issue it re-pins dish selfchecks where the field source
  legitimately changes values and its behaviour goldens are judged in
  the review lane — it is not full-auto material.
- Resolution 128 + Jacobi 20 + vorton-cap re-derivation: #1810.
- Pigment compartments + Kubelka-Munk: #1811 (the compartments will
  live in this service's field, as the issue's Relations require).
- Edge darkening: #1812. Wet-look pass: #1813 (first regime-threshold
  consumer). WET layer interaction: #1814. Warm-up exports: #1815 —
  the `vortex.mjs` live-only header stands until that slice.
