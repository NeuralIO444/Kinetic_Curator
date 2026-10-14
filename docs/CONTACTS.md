# Organism contacts (#167)

Presets place glyphs; swarm/hype integrate cohesion / well / damping / wind.
Contacts make assets occupy space: bounce, swap children, breed — with one
integrator, not a second physics engine. No Matter, cannon, or Rapier. No
rigid stacks, no CCD, no 3D.

## Where it lives

`ParticleSystem._contactPass` in `app/src/engine/particles.js`, called from
`update()` between the force pass and the velocity/position integration, so
contact impulses flow through the same damping, speed clamp, and wall
handling as every other force. It reuses the counting-sort spatial hash
(`_buildSpatialHash`) with its own cell size (`2 * contactRadius`) — the
boids grid keeps its exact cell size and visit order, which is what the
#108 behaviour lock pins.

## Properties (all on the layout params; see `PARAM_SPEC` in `data/layout-modes.js`)

- `contactRadius` (0–120 px, default 0) — the disc radius of a scale-1,
  trim-1 mark; each body's actual disc is `contactRadius × live scale ×
  asset radiusTrim` (#1408, below). **0 disables the pass entirely**: the
  swarm is then bit-identical to the pre-contact engine (the behaviour
  lock in `particles.selfcheck.mjs` proves it).
- `mass` — already a per-particle column (init draws 0.4–1.2); the contact
  impulse splits mass-weighted, so mass *is* the hit response. No new knob.
- `contactRestitution` (0–1, default 0.5) — bounce coefficient.
- `contactRepel` (0–5, default 0) — personal-space force gain vs
  same-collide-group neighbours: extra separating velocity proportional to
  overlap, applied even when the pair is drifting apart.
- `collideMask` (32-bit int, default all bits) — which collide layers
  interact. Each particle's layer (`cgroup`) is set at init from its asset
  index and is stable for its lifetime — `swap` changes the costume, not
  the layer. A pair interacts only if both groups' bits are set.
- `contactMode` (`none | bounce | swap | stick | die | breed`, default
  `none`) — the on-contact response.

Every overlapping pair (dist < ri + rj) always gets positional depenetration,
mass-weighted, so assets never interpenetrate regardless of mode. Then:

- `bounce` — impulse with `contactRestitution`; `stick` is bounce at
  restitution 0 (perfectly inelastic).
- `swap` — exchanges `assetIndex` on approach.
- `die` — the higher-index particle dies; its index goes on the freelist
  and the particle renders nothing, neighbours nothing, integrates nothing.
- `breed` — spawns a child at the parents' midpoint (momentum-averaged
  velocity, seeded costume/layer/jitter). Recycles a dead slot first;
  grows the population **only under the quality cap**
  (`layoutParams.maxParticles`, threaded from the quality tier by
  `useSwarmTick` and the studio bake).

Events fire on approach (vn < 0) only, so a resting pair doesn't strobe.
Newborns sit out the rest of the pass so a child overlapping its parents
can't breed again before depenetration pushes it clear.

## Rules from the issue

- **Offset from the layout sample**: init is untouched; contacts are a
  deterministic function applied on top of the seeded sample.
- **Studio video bakes contact state**: video frames go through
  `bakeParticles` → `update()` → the contact pass, so each frame is a pure
  function of (seed, params, steps) — same class as the swarm bake itself.
  Nothing to refuse.
- **Golden placement hash ignores contact offsets**: contacts only run in
  the live swarm/hype tick; `buildPlacements` never sees them. Pinned by
  scenario 14 in `contacts.selfcheck.mjs`.
- **Determinism**: fixed pair-visit order (ascending i, same grid walk as
  boids, each unordered pair once), no `Math.random`/`Date.now` in the
  pass, breed jitter from `hashU01(seed, CH.dyn, …)` keyed by a per-system
  breed sequence.

## Follow-ups (not this issue)

- No UI sliders expose the contact params yet (`PARAM_SPEC` is the trust
  boundary; the panel half is a separate pass).
- `collideMask` groups are asset-derived.

## Cross-strata contacts — the shared dish grid (#1407, petri dish A1)

Shipped: cross-*layer* contacts now exist. `app/src/engine/dishContacts.mjs`
holds ONE counting-sort spatial hash spanning every enrolled stratum's
`ParticleSystem`; the resolver enrols each live swarm layer (in stack
order), arms the session once per frame, and the first enrolled system's
`update()` runs the cross-strata pass over the consistent end-of-last-step
snapshot (`particles.js` and `liveResolve.mjs` each take a call site only).
`kernel/bake/dishBake.mjs` steps several strata in lockstep under the same
protocol, so a multi-strata bake is the same pure function as the live
ticks. Cross-strata pairs depenetrate (mass-weighted, always) and take a
bounce impulse only when both strata are impulse modes (restitution
averaged); swap/die/breed and repel stay per-system in A1. A session arms
only when at least two enrolled strata have `contactRadius > 0` — every
other configuration is bit-identical to the per-system engine above.
Pinned by scenario 17 in `contacts.selfcheck.mjs` and by
`src/gl/dishContacts.selfcheck.mjs` (hidden stratum = stratum alone,
byte-for-byte).

## Radius from the mark (#1408, petri dish A2)

A body's boundary is its mark. Both contact passes — the per-system pass
above and the cross-strata dish pass — compute every disc from the one
shared law (`contactBodyRadius` in `dishContacts.mjs`):

    disc = contactRadius × live scale × asset radiusTrim

- **live scale** — the particle's `scale` column, the same attribute the
  renderer draws: growth, shrink, and the breath pulse size the disc
  every frame, so a swelling mark starts displacing neighbours at its new
  size with no knob change.
- **asset radiusTrim** — a silhouette factor on the asset record
  (`radiusTrim`, default 1.0; absent or malformed reads as 1.0). Data, not
  UI. It is resolved per particle at spawn (`contactTrim` column),
  inherited at breed from the costume parent, and exchanged at swap —
  the disc follows the visible costume. True silhouette/SDF collision
  stays out (the roadmap priced it at 10–50×).
- A pair interacts only when both discs are positive; a zero-size mark
  (scale 0) honestly has no disc. Radius reads are pure functions of
  state and allocate nothing per frame (radii land in reused scratch).

Scale 1 + trim 1 everywhere reproduces the pre-A2 uniform-disc physics
exactly (scenario 19's seeded A/B against scenario 17's pinned numbers).
One deliberate non-convergence: the circlepack *placement* sampler keeps
its own nominal unit (`PACK_UNIT_PX × scale`) — it already follows the
same law in placement space, and unifying the literal source would move
golden placement hashes, which stay untouched.

## Dish controls (#1409, petri dish A3)

The artist's switch for the shared grid. One boolean layout param,
`dish` (default ON — the spec's open question 1, ratified as filed),
gated at enrolment through `dishEnrolRadius` in `dishContacts.mjs`:

- **ON** — enrolment carries each stratum's `contactRadius` as before;
  the session arms when two or more strata enrol.
- **OFF** — enrolment carries 0, so the session can never arm and the
  cross-strata pass never runs: strata ghost through each other exactly
  as they did before the dish. Each stratum's own #167 per-system pass
  is untouched either way — the switch gates the *shared* grid only.
  OFF is byte-identical to no session at all, including across a
  mid-performance flip (contacts scenario 20's fork test) and through
  the resolver (gl dishContacts selfcheck §5).

The switch rides the ordinary param path: `PARAM_SPEC`/`BOOL_KEYS` at
the trust boundary, `LAYOUT_PARAM` on the bus, persisted per Look like
every other param (normalize selfcheck pins the round trip, including
a saved OFF). No migration case for old saves: every shipped voice and
preset carries `contactRadius` 0, so default-ON cannot arm on any
existing document — a pre-A3 Look opens with the behaviour it was saved
with.

UI (BUILD panel, the strata block, KC content strata only — FX strata
never enrol, and adjacency/pattern blocks have their own physics): the
expanded block carries the DISH on/off switch plus **bounce**
(`contactRestitution`, 0–1, reset 0.5) and **repel** (`contactRepel`,
0–5, reset 0); the radius is not a knob — it is A2's law. When the dish
is on but the Look's contact radius is 0, the block says so ("idle —
contact radius 0") rather than implying physics that cannot happen.
The collapsed block's amber summary confesses the state: `dish off`
always shows; `dish on` shows only when armed (radius > 0); on + idle
stays silent, so a default Look's summary line is unchanged. Every
control change is an artist tweak in the honest feed via the bus (G7) —
the system's own writers never emit `LAYOUT_PARAM`, which is what keeps
the attribution honest.

## Impact deform (#1410, petri dish B1)

Contacts stop being billiard balls: a body that is hit — or pressed by
a crowd — squashes along the collision axis and springs back. The law
lives in `app/src/engine/dishDeform.mjs`; both contact passes (the
per-system pass and the shared dish grid) take only a feed call site.

- **Feed.** A resolved pair already knows its impulse and its overlap.
  Each body's dent target is `max(impact, pressure)`: impact is the
  body's normal Δv from the bounce/repel impulse × 0.06, pressure is
  the overlap fraction (overlap / rsum) × 0.5. Max, never a sum — a
  body pressed from three sides takes its worst dent, capped at 0.45.
  The feed writes state only; positions and velocities are already
  final when it runs.
- **Spring.** Recovery is the Spine C (#389) critically-damped law,
  `amt *= exp(-λ·dt)` at Spine C's base λ = 10 — the same spring the
  heading uses, aimed at zero. Exponential decay is monotone by
  construction: the dent settles with no overshoot and no oscillation.
- **Wobble.** At rest, a membrane wobble (the ORGANIC character) rides
  on top of the spring state: ±0.05 max, amplitude scaled by the body's
  energy (liveness), phase from the step counter and the body's #558
  uniqueness columns — deterministic per step count, so live and bake
  agree. Impact and wobble compose as vectors in squash space.
- **Render attribute only.** The step writes three render columns
  (`deformAmt`, `deformAxisX/Y`); `getItems` forwards them when
  non-zero; the contract carries `deform: [axisX, axisY, amount]` only
  on dented instances (an undeformed contract — and its hash — is
  exactly what it was); `QUAD_VS` applies the squash post-rotation in
  world space, area-preserving (bulge = 1/(1−amt) across the axis),
  gated on `amount > 0`. It rides the instance format as floats 21–23
  (24-float stride, attribute location 7) — the #1129 PR2 pattern.
  Contacts scenarios 22–23 pin the consequence: deform on vs off, and
  reduced-motion vs full motion, are bit-identical in every physics
  column. Golden placement hashes never see any of it.
- **Stillness.** Under reduced-motion the rendered amount is 0 at every
  step: no wobble, and a dent resolves to rest and holds (the spring
  state still decays underneath, so leaving reduced-motion never pops
  a stale dent). Physics is untouched.
- **Governor.** Deform is cost tier 2 (`engine/dish-deform`) — on the
  spec §7 ladder it sheds after the tier-1 finishes and before radius
  fidelity and body counts. The shed applies at contract build
  (`dishDeformShed` in `sceneContract.js`, the contact shadow's rule:
  `perfTier1` on AND quality stepped to performance). Stills and
  exports never shed it.
- **Switch.** There is no artist knob: deform follows contacts. The
  engine takes an update-level `deform: false` (spread-only, like
  `dishSession`) that silences feed and render — the byte-identity
  tests drive it; the governor shed is the live off-ramp.

## Coalescence (#1411, petri dish B2)

Bodies that stay in contact stop reading as two discs that happen to
touch: a soft membrane grows at the seam, so a colony reads as one
thing that touches without dissolving. The law lives in
`app/src/engine/dishCoalesce.mjs`; the per-system contact pass takes
only a feed call site, and the step/compose call site sits beside
B1's at the end of `update()`.

- **Family.** In v1 a family is the stratum (the ParticleSystem).
  Dwell is fed ONLY by the per-system pass, so cross-strata pairs —
  different families by construction — can never merge, however long
  they rest against each other (spec §5, open question 2: the
  recommended same-family-only scope).
- **Dwell.** A pair accrues 1 dwell per step in contact. Contact
  includes a near touch (centre distance within 1.06 × the disc
  sum): positional depenetration parks a resting pair exactly at
  the disc sum, on the rejected side of the contact test, so
  without the tolerance a resting pair would strobe in and out of
  contact and never read as sustained.
- **Factor.** Below 24 steps of dwell the merge factor is 0 — a
  glancing touch never merges — then it ramps linearly over 30
  steps to 1. Out of contact, dwell drains at 4 per step and the
  pair is forgotten at zero: separation restores two clean discs
  within a beat. The whole state is counted in steps, so it is a
  pure function of (seed, params, steps): bake equals live.
- **Fields.** Each step composes the active pairs into fields:
  midpoint on the centre segment, radius from the pair's discs
  (the #1408 radius law, now in the `dishRadius.mjs` leaf), tint
  the two bodies' colours averaged. Strongest first, capped at 24
  per layer. The resolver forwards them on the content layer and
  the contract carries `coalesce: [{x, y, r, f, tint}]` only while
  a merge is live — an unmerged contract (and its hash) is exactly
  what it was.
- **Finish.** One fullscreen pass per coalescing layer
  (`app/src/gl/coalesceFinish.mjs`), run on the layer's own
  texture inside the per-layer composite step, before the layer
  lands: a metaball threshold blend. Where a field's potential
  crosses the threshold and the marks' own alpha is lower, the
  alpha is raised to the bridge value and the colour pulled to
  the pair's tint — the membrane exists only in the notch between
  two touching discs. It is a local field in the finish, never a
  blend mode over the frame. No fields, no pass: the frame is
  pixel-identical.
- **Physics honesty.** The feed and the step write state only —
  no position, velocity, or mass is ever read back by the
  integrator. `dishCoalesce.selfcheck.mjs` pins B1's proofs:
  coalescence on vs off (and reduced-motion vs full motion) are
  bit-identical in every physics column; a slot recycled by
  breed inherits no pair's dwell.
- **Stillness.** Under reduced-motion no field renders, while the
  dwell state tracks underneath — un-stilling resumes mid-merge
  honestly, never pops a stale membrane.
- **Governor.** Coalescence is cost tier 1 (`engine/dish-coalesce`)
  — it sheds WITH the FX finishes, first on the ladder: the
  contract omits the fields whenever `perfTier1` is active
  (`dishCoalesceShed`, any quality), one rung before the shadow
  and deform. Stills and exports never shed it.
- **Switch.** Like deform, there is no artist knob: coalescence
  follows contacts. The engine takes an update-level
  `coalesce: false` (spread-only) that silences feed and compose;
  the byte-identity tests drive it.

## Pigment exchange + contact density (#1412, petri dish B3)

Sustained contact stops being only a membrane: the two bodies trade
colour, and the grid itself starts reporting how crowded the dish
is. Two deliverables, one stage: the exchange (the soul of the dish —
colour earned by neighbourhood) and the density field (the signal
#1355's formation thresholds were promised).

### Pigment exchange

The law lives in `app/src/engine/dishPigment.mjs`; particles.js
takes call sites only (the step beside B2's at the end of `update()`,
plus a palette-sync beside #278's re-resolve).

- **Pairs.** The trade runs on B2's coalescing pairs, read through
  `coalescePairs` — the dwell law is written once, in dishCoalesce.
  The weight is the pair's merge factor: below the dwell gate
  nothing trades, a full merge trades at the full rate. Family is
  B2's family (the stratum), so cross-strata pairs never trade.
- **The trade.** Each body closes a fraction
  `(1 − exp(−0.05 · dt)) × factor` of the remaining gap to its
  partner per step — the exponential is the rate cap: at full merge
  a body closes at most 5% of the gap per second, so colonies
  measurably converge over ~60 s of contact and can never snap.
  One delta is computed from the pre-step snapshot and applied
  +d / −d, so the pair's mean colour is conserved exactly and the
  gap shrinks monotonically — no overshoot, ever. The trade crosses
  only an actual touch (the feed's near-touch test): a separated
  pair's draining dwell fades the membrane, but no pigment crosses
  a gap.
- **State.** The trade moves the engine's one pigment working copy
  (`leakRgb`, #287) — leak drifts it toward the neighbourhood
  average, exchange trades it pairwise; one store, two honest
  forces. Earned colour reaches `color[]` by write-back on the #287
  discipline: quantized to 4 bits per channel, written only when
  the hex actually changes, so the atlas bakes once per visible
  shift. A palette re-deal re-seeds the working copy from the new
  colours — earned pigment belongs to the palette that earned it.
- **History.** Nothing decays the working copy back toward the
  palette: a body removed from contact keeps its earned colour
  exactly. Exchange is history, not a shader trick.
- **Physics honesty.** The step writes colour state only.
  `dishPigment.selfcheck.mjs` pins the closed form (dwell-weighted,
  mean-conserving, monotone), the 60 s convergence probe, history,
  and B1's byte-identity shape: exchange on vs off — and
  reduced-motion vs full motion — are bit-identical in every
  physics column.
- **Stillness.** Under reduced-motion the trade does not accrue
  (the dwell still tracks underneath). Pigment has no rest state
  to settle into, so trading under the stillness would repaint
  bodies the moment it lifted — the pop B1's law forbids.
- **Governor.** Exchange is cost tier 2 (`engine/dish-pigment`),
  deform's rung: `dishPigmentShed` (perfTier1 on AND quality at
  performance) reaches the step spread-only via
  `layoutParams.pigmentShed` and stops the trade; colour already
  earned is history and stays — a shed never repaints a body.
  Stills and exports carry no governor state, so their bakes never
  shed and trade exactly as the live dish did.
- **Switch.** No artist knob: exchange follows contacts. The
  engine takes an update-level `pigment: false` (spread-only)
  that silences the step and the palette sync.

### Contact-density field

The law lives in `app/src/engine/dishDensity.mjs`; the shared pass
stamps it, the resolver publishes it, the shell puts it on the bus.

- **Field.** `runDishContacts`' counting sort already counts every
  enrolled body into a cell per tick; the pass now stamps those
  counts onto the session as a field — `{ cellSize, originX,
  originY, cols, rows, counts, total, max, tick }` in the grid's own
  geometry (cell = 2 × the largest disc radius). Measurements only:
  nothing reads the field back into physics.
- **Ticks.** The tick advances once per consumed arm. An arm that
  builds no grid (too few living bodies) stamps the EMPTY field,
  and a frame whose pass never ran (dish off, one stratum, slow
  render) publishes the empty field — never a stale crowd.
- **Publication.** The resolver publishes the frame's field after
  the layer loop (`publishDishDensity`); the App frame tap bridges
  it to the typed bus as `dish:density` (`Events.DISH_DENSITY`,
  via curator/dishDensityLive.js, with a pull getter beside it —
  the dishPressure precedent). Formation checks and telemetry read
  `sampleDishDensity` / `dishDensityShare` (share saturates at
  `DISH_DENSITY_SATURATE` bodies per cell — an open tunable, like
  dish pressure's) from the payload with no engine change.
- **Parity.** The field is a pure function of the pass, so the bake
  driver computes identical fields on its own session for identical
  steps (it simply never publishes to the live holder).

## The medium — WETNESS as viscosity and cling (#1413, petri dish C1)

The dish has weather now: the WETNESS knob (`accumulationWetness`,
#970 — the watercolor word) is read by the contact engine as the
medium the bodies move through. Wet → low restitution, high cling,
slow damping; dry → bouncy, low adhesion. One knob, already on the
instrument, no new vocabulary. The law lives in
`app/src/engine/dishMedium.mjs`; both contact passes and the
integrator take call sites only.

- **The curves.** All three are pure functions of the clamped
  wetness w, resolved once per call site by `dishMediumFor`:
  restitution × (1 − w) (at full wet a bounce-mode pair meets
  exactly as stick would); cling strength = smoothstep(w); drag
  retention = 1 − 0.02·w per step, multiplied into the integrator's
  damping in its own dt-correct pow form.
- **Cling.** Surface tension (spec §4: WETNESS = surface tension +
  friction). A contacting pair that is separating gives up a budget
  of its separating normal velocity — capture =
  min(vn, clingK × 0.9 px/step) — read on the post-impulse,
  post-repel velocities, so a wet bounce can be recaptured by the
  tension it lands in. A slow separation is held whole; a fast one
  tears free having paid only the budget. Capture never exceeds
  the separation, so tension can hold a pair but never pull one
  together — no weld, no threshold.
- **Composition.** The medium biases, the mode decides: restitution
  curves only scale the bounce coefficient (stick is already 0),
  cling acts on separation for every mode, and the approach-fired
  events (swap/die/breed) are untouched — at full wet all three
  still fire. Cross-strata pairs average the two strata's wetness,
  exactly as A1 averages restitution; enrolment carries the field
  (`wetness` on `enrolDishBody`, clamped at the boundary), and the
  drag stays per-system in each stratum's own integrator.
- **The gate.** The medium exists only where the dish does: the
  curves are mapped inside the contacts gate (contactRadius > 0),
  so a contact-less swarm — including the #970 watercolor finish
  reading the same knob — is bit-identical to pre-C1.
- **The dry law.** WETNESS=0 is the exact dry path: every curve is
  the identity there (restK 1, clingK 0, retention 1), the dry
  pair resolves no medium in the dish pass, and junk wetness
  (absent, NaN, non-numeric) reads as dry. Pinned by
  `dishMedium.selfcheck.mjs`: wetness-0 vs absent is bit-identical
  through full updates in bounce and breed, and all 23 pre-existing
  contact scenarios keep their pinned numbers.
- **Settle.** Same seed, three wetness levels, residual kinetic
  energy after 240 steps of the bake engine: strictly ordered
  (wettest settles hardest, mid measurably below dry), nothing
  frozen — the probe in `dishMedium.selfcheck.mjs` §(f).
- **Determinism & parity.** The curves are stateless arithmetic on
  a param — no step counter, no clock, no dice — and the bake runs
  the same update(), so a wet bake settles exactly as the live wet
  dish does (bakeDishParticles acts, and repeats bit for bit).
- **Stillness.** The medium is a physics parameter, like
  restitution itself — there is no render split to restrain. Under
  reduced-motion the dish resolves once and holds (spec §7), so
  nothing integrates and nothing accrues; when it steps, the
  medium applies as in any bake.
- **Governor.** The medium declares no cost tier and never sheds:
  it is contact law, not a finish (restitution, repel, and the
  shared grid register no tier either — the §7 ladder sheds
  finishes, deform, radius fidelity, body counts). A shed that
  rewrote physics mid-performance would break bake parity, since
  bakes carry no governor state. Its cost is three curve
  evaluations per system-step plus, when wet, a few flops per
  contacting pair inside passes that already run.
- **Switch.** No artist knob beyond WETNESS itself: the medium
  follows the knob wherever contacts run. There is no update-level
  off switch — dry is the off, and it is exact.

## The currents — the medium moves, by mass (#1414, petri dish C2)

C1 gave the dish a medium; C2 gives the medium motion. Inside the
dish the wind stops being a force and becomes a current: a body no
longer gets pushed by the field, it rides it — carried up to the
field's velocity if it is slower, dragged back if it is faster,
at a rate set by its own mass. Light strata migrate with the
weather; heavy strata hold ground against it. The law lives in
`app/src/engine/dishCurrents.mjs`; the force pass in
`particles.js` takes call sites only.

- **The law.** One term structure for both sources:
  acceleration += (target velocity − body velocity) × coupling /
  mass. A push cannot brake; advection does both, which is what
  makes it a current rather than a stronger wind. Strength rides
  the coupling, never the target, so strength 0 makes the term
  exactly absent — never a drag toward rest. Coupling =
  CURRENT_COUPLING (0.02) × strength, resolved once per update by
  `dishCurrentsFor`, the C1 resolution shape.
- **Wind.** The target is the field's own shape read as a
  velocity, at CURRENT_SPEED (1.2): the curl branch's target is
  the raw curl vector × 1.2; the point branch's is
  (cos, sin) × (noise + 1) × 0.4 × 1.2 — the shape the legacy
  force always used, with the strength factored out of the
  magnitude into the coupling. The field itself is untouched (the
  issue's words): same noise, same sample points, same weather —
  only what a body does in it changed. Entrainment is a time
  constant, mass / coupling: ~20 steps for a light body, ~150
  for a heavy one.
- **Chemotaxis.** The well attractor rides the same term: target
  = unit direction to the well × ATTRACTOR_DRIFT_SPEED (0.9) ×
  the group's sign, where the sign is the behave row's shipped
  seek gain (#584/#711) — seek rows drift toward the well, flee
  rows are driven from it, the per-group reading the instrument
  already performs. Strength = gravityWells × attract × |seek
  gain|. Inside the dish it replaces the legacy ATTRACTOR_GAIN
  force under the same guards (wells > 0, attract > 0, and the
  d > 5 dead zone, kept).
- **The gate.** Currents exist only where the dish does
  (contactRadius > 0), C1's gate exactly. Outside it both legacy
  forces run byte-for-byte: the manifest's reference-engine
  parity (particles.selfcheck, including its wind-heavy case)
  and the seek/flee suite pin them, and the currents suite
  re-pins both legacy closed forms at the gate's edge. The WASM
  swarm path never sees a current — it already excludes
  contactRadius > 0 casts.
- **Wind off = pre-C2, exactly** (the acceptance line). At wind
  0 the resolution is the frozen off object and no term is
  added; `dishCurrents.selfcheck.mjs` proves a dish cast at
  wind 0 bit-identical to the same cast with no dish at all,
  attractor present or not, over 240 steps.
- **Acceptance, measured.** Same seed, full 40-body casts, 480
  steps, curl current: the STRAW stratum (m = 0.4) travels a mean
  491px with its centroid carried 128px downstream; the PEARL
  stratum (m = 3) travels 59px, centroid 2px. On the pre-C2
  engine the same fixture's PEARL stratum travelled 350px — the
  strata were separated by degree; now they are separated by
  kind. Pure single-body casts (the current the only force):
  the light body rides at ~4× the heavy body's speed and path —
  the per-step damping floor compresses the 7.5× coupling
  ratio — and the heavy body never entrains (0.05–0.07 px/step).
- **Chemotaxis, measured.** Single bodies, well east of centre,
  480 steps: light seekers pool (mean distance 384 → 108px);
  heavy seekers drift but lag (384 → 278px); light fleers are
  driven off (384 → 549px); the wells-closed control does not
  approach (384 → 383px).
- **Determinism & parity.** The law is stateless arithmetic on
  params and the step's own field sample — no clock, no dice, no
  step counter — and the bake steps the same update(), so a
  baked dish rides the currents: the suite's bake repeats bit
  for bit and is not the contactless legacy trajectory.
- **Stillness.** Currents are physics, not a render attribute
  (C1's precedent): there is no reduced-motion split to make.
  Under reduced motion the dish resolves once and holds, so
  nothing integrates and nothing advects; when it steps, the
  currents apply as in any bake.
- **Governor.** No cost tier and no shed — C1's precedent,
  followed deliberately. A shed that rewrote physics
  mid-performance would break bake parity, since bakes carry no
  governor state. The cost is two axis evaluations per body per
  step inside a force pass that already samples the field.
- **Switch.** No new knob, and the per-Look DISH switch does not
  gate the currents: they follow the wind and attractor knobs
  wherever the dish runs, as C1's medium follows WETNESS. Wind 0
  and wells 0 are the offs, and they are exact.
