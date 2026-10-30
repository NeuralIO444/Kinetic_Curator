# #1841 — WET slice B: dish migration onto the wet-frame service: evidence

Issue (verbatim): **"WET slice B: dish migration onto the wet-frame
service (of #1809) — REVIEW LANE"**. The dish's wet quantities read
from — and its contacts stamp into — the shared wet field through
the service, replacing the dish's private wet bookkeeping (per-pair
wetness scalars enrolled from the knob, grip verdicts gated on the
knob's curves). The dish's physics keeps its own solver; what
changes is where "how wet is it here" comes from: one answer,
instrument-wide. Behaviour goldens are Matt's eyes (review lane);
this file is the mechanics evidence.

## Premise check (before building)

Verified against main @ 302f738a: the wet-frame service exists with
the contract slice A designed (`createWetFrameService`, `frame()`
with consumers / shed / degradedOk, `field()`, regimes); the dish
consumed no spatial field (per-contact-pair wetness scalars in
`dishContacts.mjs` enrolment out of `accumulationWetness`, grip-step
counters in `dishLinks.mjs` gated by the knob-resolved medium in
`particles.js`); slice A's staging report stages exactly this slice
(first `degradedOk: true` consumer, a stamp-in API decision
expected, the persona show-block shed line owed to it). Premise
HOLDS; nothing in the issue or its parents was contradicted by the
code as found.

## What shipped

- **The read** (`gl/wetFrame.mjs`): `sampleWet(x, y)` — the standing
  field's wetness at a scene point, bilinear over the sim's own
  grid mapping. Physics steps ahead of the frame's wet request, so
  the dish reads the field the last request left — the one-frame
  interleave, named in the service contract.
- **The write** (`gl/vortex.mjs`, `gl/wetFrame.mjs`): the frame
  request carries `stamps` — the dish's contact presses
  ({x, y, amount}) — applied with the marks' stamps on the full
  path, under the shed (stamps-only is the service degraded mode
  keeps), and onto a frozen hold (pressed, not flowed).
- **The engine** (`engine/dishMedium.mjs`, `dishContacts.mjs`,
  `particles.js`): the driver attaches a sampler to the dish
  session per frame/step (`session.wetSampler`). With it, a pair's
  medium resolves from the field sampled at the pair's midpoint
  (both passes), the integrator's drag samples at each body, the
  grip gates and stick verdicts behind `noteBondGrip` read the
  sampled medium, and each contacting pair records one press
  (`MEDIUM_CONTACT_STAMP × pairWet` — a pair deposits the wet it
  carries; a dry pair records nothing) into `session.wetStamps`,
  which the driver drains into the next wet-frame request.
- **The consumers**: liveLoop adds `dish` to the request's
  consumers whenever the resolver reports a dish present on the
  frame, passes `degradedOk` for it, and serves the resolver's
  drained stamps; the resolver takes the sampler through a module
  channel (`setLiveWetSampler` — never a frame input: inputs are
  recorded for takes, and the field re-derives on replay through
  the same loop). The dish is the first consumer to exercise the
  degraded path live.
- **The bake** (`engine/kernel/bake/dishBake.mjs`): the driver
  takes a caller-supplied service by injection (the kernel imports
  no gl — the #1239/#1310 boundary), attached before the first
  step and served once per bake step (bodies as stamp instances +
  the step's drained presses), so a wet bake settles by the
  field's law too. Without an injected service the bake keeps the
  knob bookkeeping, bit-identical to before.
- **The shed line** (`gl/wetLive.mjs`, `curator/trioLive.js`,
  `App.jsx`): the loop publishes the served mode per frame; the
  personas' show block carries `wet: { mode, shed }` only while
  the field is degraded or a wanting consumer stands shed —
  #1809's "degradation is visible in the show block", landed with
  the first degraded consumer as slice A staged it.

## Preservation proof (what did NOT change)

Measured on the unmodified tree first, then held after the change
(`engine/dishWet.selfcheck` cases (a)/(b)/(f)):

- Per-system wet scene, no field attached: trajectory hash
  **2258814921** before and after — the knob path is bit-identical.
- Cross-strata wet scene through a session, no sampler:
  **3750751918** before and after.
- A uniform sampler at the knob's wetness reproduces 2258814921
  exactly: the knob was always a uniform field.
- Dry bake: **3304663090** before and after (at wetness 0 the
  service answers 'off', the field is never born, every read is 0).
- `wetFrame.selfcheck`'s Phase A byte-identity golden
  (3108730517) intact, unmodified: with no stamps requested, the
  full path is the pre-slice path byte for byte.

## The one legitimate change (named, with cause)

- Wet bake golden: **212945750 → 2527199455**. Cause: the bake now
  steps an injected wet field and the dish reads it (spatially
  varying medium instead of the uniform knob), per #1809 slice B's
  acceptance ("re-pinned only where the field source legitimately
  changes values"). The new value repeats bit for bit. No other
  golden, checkpoint, or fixture moved. (Suite-source pins re-worded
  for the per-pair medium local, and the dishLinks/dishMedium bake
  harnesses updated to inject/serve the field on both sides, are
  listed in the staging report — no assertion weakened.)

## Degraded path, exercised live (by construction + suite)

Under `perfTier1` with a dish on stage the service now serves
'degraded' instead of standing the field down: stamps (marks +
dish presses) land, the mask dries in place, no velocity is
published. ACCUM's own reads stay gated off at tier 1 exactly as
before (`accumOn` already excludes it), so the only new behaviour
under the shed is the dish's — and the show block names it.
`wetFrame.selfcheck` pins the dish-side degraded semantics
including a press landing through the shed;
`dishWet.selfcheck` (g) pins the wire.

## Measured behaviour evidence (sandbox, mechanics not feel)

- A resting pair at knob 0 with the field held wet **bonds** after
  the formation threshold; at knob 0.9 with the field dry it
  **never does** — grip follows the field (dishWet (d)).
- The sample point is the pair: wet-only-at-midpoint gives the
  full-wet Coulomb outcome (vy 3 → 2.5 on the dishFriction probe
  shape); wet-everywhere-but-the-midpoint gives the dry pass bit
  for bit (dishWet (c)).
- One press per contacting pair per pass at the pair's midpoint,
  amount 0.35 × pairWet, on the one session list from both passes
  (dishWet (e)).

## Costs and limits (honest)

- No new cost-tier registration: the field's work stays registered
  once as `gl/vortex` (tier 1); this slice adds policy and reads
  over it, per slice A's decision. The dish-side reads are a
  bilinear sample per contacting pair per step plus one per body
  per step inside passes that already run; the medium's module
  budgeted "a few flops per contacting pair" for its curves, and
  the sample is the same order. No on-device number is claimed —
  device measurement belongs to the #1695 harness on Matt's Mac.
- The bake's field is the bake's own weather: its wetness input is
  the wettest enrolled layer's knob and its seed the first layer's
  (one field, one input — the live loop's store knob is the same
  shape of answer), and its stamps are the bodies only, where the
  live field also takes non-dish marks. The wet LAW is one in both
  drivers; a bake is not a replay of a performance's field.
- Takes: the field stays session substance (slice A's ownership),
  so a restored take's dish reads the standing field — the same
  property ACCUM's trails already have; replay from the input log
  re-derives the field through the loop, deterministically.
- First frame: the field is born by the first request, so a dish's
  first frame reads dry and its second reads the field the first
  frame's marks laid. The field's birth semantics, not a special
  case.

## Verification

- `dishWet.selfcheck` (new): **7 checks** — the fallback goldens
  above, uniform-field exactness, sample-point probes, bond
  formation following the field, the stamp law, the bake goldens,
  the wire + interleave. `wetFrame.selfcheck`: **19 checks** (+4
  for this slice). `trioLive.selfcheck`: **23 checks** (+1, the
  shed line).
- Targeted battery: 60 suites referencing the touched files —
  first run 55 pass / 5 fail (the four pin/harness items the
  staging report names, plus a contention browser crash); all
  five re-run green on the final tree, and `glBoundary`/`purity`
  pass after the bake's service became an injection.
- Full manifest sweep on the final tree: **535 of 537 commands
  pass**. The two failures are the known sandbox-environmental
  pair — `swarmWasm` (the checked-in kernel wasm does not
  reproduce bit-for-bit from the sandbox's rust toolchain) and
  `rollSafety` — both base-identical, neither touched by this
  slice. `accum.selfcheck` passed in-sweep at 83 cases (3 GB
  heap); two earlier solo runs died in its browser phase under
  multi-agent box contention with every executed check green —
  contention, not a tree signal (wetWarmup crashed the same way
  under the same load, then passed solo on both trees, 21 checks).
- `npm run build` green; `npm run lint` 0 errors;
  `npm run format:check` clean.
