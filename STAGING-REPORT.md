# STAGING REPORT — #1841 WET slice B: dish migration onto the wet-frame service

**Issue (verbatim):** "WET slice B: dish migration onto the wet-frame
service (of #1809) — REVIEW LANE"
**Branch:** `feat/1841-dish-migration` on origin/main 302f738a.
Local only — no push, no PR (coordinator publishes, Matt merges —
review lane). This file replaces the report that was at the worktree
root (#1876's); that report remains in git history.

## Premise verdict: HOLDS

Checked against the code on main before building: the wet-frame
service exists at `app/src/gl/wetFrame.mjs` with slice A's contract
(need-based gate, `degradedOk`, modes live/degraded/shed/off, regimes
damp 0.05 / wet 0.35 / soaked 0.8); the dish consumed no spatial
field (enrolment `wetness` scalars in `dishContacts.mjs` from the
`accumulationWetness` knob, per-system medium resolved from the knob
in `particles.js`, grip counters in `dishLinks.mjs` gated by the
knob's friction curve); slice A's staging report stages exactly
this slice (first `degradedOk` consumer, a stamp-in API decision
expected, the persona show-block shed line owed). Nothing
contradicted → built. #1814's scope (strata soak / composite-mask
consumer) was not touched.

One reading, stated plainly: the issue's "pressure support" names
no symbol in the code or docs; it is read as the medium-biased
impulse/deform-feed path, which now follows the sampled medium like
every other wet quantity.

## What shipped (plain language)

The dish now gets "how wet is it here" from the one shared wet
field, through the service slice A built — and presses its contacts
back into that field.

- **The read** (`gl/wetFrame.mjs`): the service gains
  `sampleWet(x, y)` — the standing field's wetness at a scene
  point. The resolver attaches it to the dish session through a
  module channel (`gl/liveResolve.mjs` `setLiveWetSampler`, wired
  in `gl/liveLoop.mjs`) — deliberately not a frame input, because
  inputs are recorded for takes and a closure cannot be; a take
  replays through the same loop and the field re-derives, exactly
  as it already does for ACCUM.
- **The physics** (`engine/dishMedium.mjs`, `dishContacts.mjs`,
  `particles.js`): with a sampler attached, each contact pair's
  medium (bounce, cling, friction, grip gate) resolves from the
  field at the pair's midpoint, and the integrator's drag samples
  the field per body. The XPBD solver and every curve are
  unchanged. With no sampler, the original knob arithmetic runs in
  the original order — the fallback is bit-identical (goldens
  below), so drivers without the service (unit suites, census)
  are untouched.
- **The write** (`gl/vortex.mjs`, `gl/wetFrame.mjs`): contact
  presses (one per contacting pair per pass, at the midpoint,
  amount = 0.35 × the pair's wetness — a pair deposits the wet it
  carries; a dry pair creates nothing) ride the frame request as
  `stamps` and land in the field on the full path, on the
  stamps-only degraded path, and pressed (not flowed) onto a
  frozen hold. Dropped when no consumer is served.
- **The degraded path, live for the first time**: the dish
  enrols as a consumer beside ACCUM with `degradedOk` — under
  the tier-1 perf shed the field degrades to stamps-only for the
  dish instead of dying. ACCUM's own behaviour at tier 1 is
  unchanged (it is already stood down as a unit there).
- **The shed line**: the loop publishes the served mode on a new
  wire (`gl/wetLive.mjs`); the personas' show block carries
  `{ mode, shed }` only while degraded/shed (`curator/trioLive.js`
  `getWet` option, wired in `App.jsx`) — the line slice A owed
  this slice.
- **The bake** (`engine/kernel/bake/dishBake.mjs`): the driver
  takes a caller-supplied service by injection (`wetFrame`
  option) and serves it per bake step, so an injected wet bake
  settles by the field's law. Injection, not ownership: the
  first cut had the bake create the service, and the kernel
  boundary suites (#1239 glBoundary, #1310 purity) correctly
  rejected a kernel→gl import — the kernel stays worker-pure.
  Without injection the bake is the pre-#1841 bake, bit for bit.
  Census bakes are dry and unaffected either way.

## Preservation proof (measured, not asserted)

Goldens measured on the unmodified tree first, then re-measured
on the final tree:

- Per-system wet scene, no field attached: **2258814921** —
  unchanged bit for bit (the knob fallback is exact).
- Cross-strata wet scene through a dish session, no sampler:
  **3750751918** — unchanged bit for bit.
- Dry bake: **3304663090** — unchanged.
- Wet-frame Phase A golden: **3108730517** — unchanged (slice A's
  behaviour is untouched; the service gained a read + a request
  field, nothing else).
- Uniform-field exactness: a constant sampler at 0.65 reproduces
  2258814921 exactly — the field path IS the knob path when the
  field is flat, so the live dish changes only where the field
  actually varies.
- Bake≡live survives the migration: dishLinks' parity harness
  now serves the field on both sides and the equality assertions
  hold bit for bit (this also cross-validates the bake wiring).

## The one re-pin (with cause)

- Wet bake golden **212945750 → 2527199455**. Cause: the bake now
  steps an injected wet field and the dish reads it (spatially
  varying medium instead of the uniform knob) — the change #1809
  slice B's acceptance allows ("re-pinned only where the field
  source legitimately changes values, each named with cause").
  The new value repeats bit for bit. Pinned in
  `src/engine/dishWet.selfcheck.mjs` (f).

Suite-source pins re-worded, no assertion weakened: three suites
(dishMedium (i), dishFriction (e), dishSpin (f)) pinned the
per-system medium local as `med.`; the medium now resolves per
pair, so the local is `medPair.` and the pins follow it — each
suite header records the re-pin and cause. dishLinks' bake≡live
harness and dishMedium's (h) bake were updated to inject/serve
the field (the equality and settle assertions themselves are
unchanged).

## Verification

- New/changed suites: `dishWet.selfcheck` **7 checks** (new —
  fallback goldens, uniform-field exactness, sample-point probes
  that prove pair outcomes key on the field at the midpoint, bond
  formation following the field over a decoy knob both ways,
  stamp law, bake goldens, the wire + interleave);
  `wetFrame.selfcheck` **19 checks** (+4: dish alone passes the
  need gate, `sampleWet`, stamps on full/degraded paths, stamp
  determinism); `trioLive.selfcheck` **23 checks** (+1: the show
  block's shed line, present only when served degraded/shed).
- Targeted battery (60 suites — every suite referencing a
  touched file: the whole dish family, contacts, kernel/dish,
  vortex, the wet/accum suites, replay/take/census/trio suites):
  first run 55 pass / 5 fail — the four pin/harness items above
  plus a wetWarmup browser crash under box contention. All five
  re-run green on the final tree (wetWarmup solo, 21 checks) —
  recorded here so the trail is honest.
- Full manifest sweep (final tree): **535 of 537 commands pass.**
  The two failures are the documented sandbox-environmental pair
  — `swarmWasm` (checked-in kernel wasm not reproducing
  bit-for-bit from the sandbox rust toolchain) and `rollSafety`
  — base-identical, untouched by this slice.
- `accum.selfcheck`: passed in the sweep at **83 cases** (3 GB
  heap). Two earlier solo runs died in its browser phase
  (Chromium target crash / process kill) while three agents'
  sweeps shared the box — every check that executed passed, no
  assertion failed in any run, and wetWarmup crashed the same
  way under the same load before passing solo on both trees
  (21 checks). Sandbox contention, not a tree signal.
- `npm run build` green; `npm run lint` 0 errors (the 3 warnings
  in touched files are pre-existing App.jsx hook warnings in
  untouched code).
- `npm run format:check` clean on the final tree.

## Flags for the coordinator

1. **Behaviour change, surfaced not smoothed**: in the live
   instrument the dish's medium is now spatial — grip, cling,
   friction, bounce and drag follow the local wash, and contacts
   feed the wash back. That is the slice's purpose; the goldens
   for it are Matt's eyes (review lane). Physics under a FLAT
   field is proven identical to the knob, so any felt difference
   is the field's variation, not a solver change.
2. **Bake fields are each run's own**: the bake serves its
   injected service from the dish bodies only; the live field
   also takes non-dish marks' stamps. A bake is the dish's own
   weather, not a replay of a performance's field. Named in the
   dishBake header.
3. **Takes**: the field is not added to the take snapshot
   protocol (slice A precedent — ACCUM's field is not snapshotted
   either); it re-derives from recorded inputs on replay. The
   sampler channel follows the established module-channel
   precedent (getLastSpawnDecisions / resolveTap's snapshotter).
4. **First frame reads dry**: a session's field is born at its
   first wet-frame request, so frame one's dish physics reads
   dry. That is the service's birth semantics, not a special
   case in this slice.
5. **liveLoop.mjs hunks are small and delimited** (import line,
   sampler registration after service creation, the request
   block, teardown) for composition with #1837's hunks at
   publish.
6. No on-device numbers are claimed anywhere in this slice: the
   sampler is one bilinear read per contact pair per step; any
   perf measurement belongs to the #1695 harness on Matt's Mac.
