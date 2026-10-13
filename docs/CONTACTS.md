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
