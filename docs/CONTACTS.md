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

- `contactRadius` (0–120 px, default 0) — disc radius for overlap. **0
  disables the pass entirely**: the swarm is then bit-identical to the
  pre-contact engine (the behaviour lock in `particles.selfcheck.mjs`
  proves it).
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

Every overlapping pair (dist < 2r) always gets positional depenetration,
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
- `collideMask` groups are asset-derived; true cross-*layer* contacts
  (two app layers colliding) would need shared grids and are out of scope.
