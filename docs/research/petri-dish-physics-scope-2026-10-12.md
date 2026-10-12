# KC-1 — One Petri Dish, With Physics: Scope Spec

**Status:** Scope spec, ordered by Matt 2026-10-12. Committed to gh as a docs PR (Matt merges). No code is built by this document; implementation issues are drafted only on Matt's further word.
**Parent:** #1183 (One petri dish) — this spec is the interaction layer of that issue's direction: PATTERN became ground (landed: GROUND lean #1370, EDGE nudge #1395, SHADOW #1397, SNAP #1398); this spec covers marks *interacting with each other* — bodies, forces, deformation, blending.
**Foundation:** #167 / docs/CONTACTS.md — organism contacts already exist in the particle engine (disc overlap, mass-weighted depenetration, bounce/stick/swap/die/breed), off by default, per-system grids, no UI. This spec grows that seed into the dish; it does not replace it.
**Constraints inherited from #1183 (binding):** stills must equal the live path (parity goldens stay valid); governor shed tiers apply; iPad-class budgets; one-writer files (`particles.js` among them) take a call site only — new logic lives in a new module; one fix per PR; every PR in Matt's review lane.

## Issue-overlap review (2026-10-12, before scoping)

- **#1183** — the umbrella. This spec is its next slice, not a rival. Nothing here re-opens the landed ground effects.
- **#1355 (Phase 3 hierarchy formation)** — adjacent, not overlapping: formation reads "neighbour/density pressure" at a pin. Dish physics *produces* exactly that signal (contact density field, §4) — spec names it as an output #1355 can consume. No shared implementation.
- **#1206 (hierarchical assembly / Moth Pilot)** — structural parent-child composition, not physics. Composition point only: an assembled creature is a compound body in the dish (§2).
- **#1367 (retroactive capture)** — downstream consumer: it snapshots resolver state including swarm physics, so contact state must stay a pure function of (seed, params, steps). One more reason for the determinism law (§7).
- **#1298 (WebGPU)** — explicitly deferred; this spec must not depend on it. Physics stays on the CPU integrator.
- **#1312 (iPad WebView worker)** — open verification; the perf budgets here target iPad regardless of where the sim thread lands.
- **#167 (closed)** — the contacts foundation. **#509 (closed)** — precedent for cross-layer behaviour: MOD steering + shared scent between content layers. Scent is the stigmergy seed (§6).

## Thesis

The dish stops being a composited picture and becomes a place with physics: **one shared space, every stratum a body, the existing parameters reinterpreted as forces, and touch as an exchange** — of momentum, of shape, of pigment. No second physics engine (CONTACTS.md's law stands), no new panel of physics knobs: the instrument's own controls gain physical meaning.

## §1 One shared world

Today each particle system keeps its own spatial hash; strata collide only within their own kind — a PEARL ghosts through an EAVES. The dish move: **one shared spatial grid across all strata**, one contact pass over it, inside the same integrator step as forces → contacts → integration (the existing order). FRONT→GROUND stops being draw order and becomes depth that bodies actually occupy.

## §2 Every stratum a body

A stratum dealt by a static layout currently has no velocity or mass — nothing to push with. Enrollment rule: **every placement in a live stratum gets a physics presence** (position, velocity, mass) in the shared grid.

- Mass derives from the mark: stratum type + mark scale (a PEARL is heavy; a STRAW is light), honouring the existing per-particle mass column.
- A "static" stratum is not exempt — it is a *heavy, damped* body. It can be nudged, leaned on, crowded.
- Compound bodies (hierarchy creatures, #1206) enroll as one body at their root with summed mass.
- FX strata do not enroll as bodies — they are the medium (§6), per #1183's direction (FX = weather).

## §3 Boundary: radius from the mark, then deform

True silhouette collision (per-asset SDF) stays **out** — the roadmap priced it at 10–50× cost; this spec does not relitigate that. Instead:

- **Radius from scale:** the contact disc derives from each mark's live scale (replacing the single uniform `contactRadius`), so the disc tracks the silhouette as marks grow, shrink, and pulse. Per-asset radius trim (a silhouette factor in the asset record, default 1.0) is allowed data, not new UI.
- **Impact deform:** a contact already computes an impulse. Feed impulse magnitude into a **deform spring** on the mark: squash along the collision axis, recover via the existing critically-damped spring class (Spine C). Deform is a render attribute (Stage C attribute path), never a placement change — goldens stay clean.
- **Membrane wobble:** at rest, a low-amplitude organic wobble (the ORGANIC rhythm layer's character) keeps bodies feeling soft rather than billiard-hard. Davis-rendered (continuous), stillness-collapsible.

## §4 Forces — the parameters, reinterpreted

No new force panel. Existing controls gain physical meaning in the dish:

| Existing parameter | Physical meaning in the dish |
|---|---|
| TEMPO | Thermal energy — Brownian jitter amplitude; hot dish never settles, cold dish stills |
| DENSITY | Crowding pressure — drives the existing contact repel gain |
| WETNESS | The medium's surface tension + friction (§6) |
| SIZE / scale | Body radius (§3) and, via the mass column, inertia |
| Attractors (shared module, #1200) | Food / light / threat — per-group chemotaxis sign: drift toward, or flee |
| ACCUM | Deposition — marks lay trails (§6) |
| Audio / MIDI drivers | Unchanged role: they turn the knobs; the knobs now mean forces |

Contact density (bodies per cell, from the shared grid) is published as a **field signal** on the bus — measurements only — which #1355's formation thresholds and the telemetry feed may read.

## §5 Blend — touch as exchange

- **Coalescence:** same-family bodies in sustained contact (approach-fired, dwell-gated) render a soft merge at the contact point — a local threshold blend in the finish, not a blend mode over the frame. Breaks cleanly when the pair separates.
- **Pigment exchange:** on sustained contact, each body's colour leans toward the other's — GROUND lean's mechanism (#1370), made dynamic and mutual, rate-limited, seeded. Colonies that mingle trade pigment over a performance; colour stays a function of state, never of wall-clock.
- **Population:** breed/die contact modes (existing) tuned as dish ecology: growth into free space, thinning under crowding pressure (§4's field). One **global** population cap under the governor arbitrates all strata (today's cap is per-system).

## §6 The medium

FX strata are the air/water of the dish (#1183: FX = weather):
- **Viscosity from WETNESS:** wet dish → low restitution, high cling (stick-leaning contacts), slow damping; dry dish → bouncy, low adhesion. WETNESS=0 keeps its watercolor law: the exact dry path.
- **Currents:** the existing curl wind is the dish's current; bodies advect with it by mass (light bodies ride it, heavy bodies resist).
- **Trails (stigmergy):** with ACCUM up, moving bodies deposit a fading trail field in the shared grid; other bodies read it as weak attraction or avoidance by group. Precedent: #509's shared scent. This is how the dish remembers where life has been — and how colonization's logic enters the live world.

## §7 Laws (non-negotiable, from #1183 + CONTACTS.md)

- **Determinism:** the shared pass has one canonical pair-visit order (stratum order, then index — the cross-stratum extension of CONTACTS.md's fixed order). No `Math.random`/`Date.now` in the pass. A frame is a pure function of (seed, params, steps) — bakes, snapshots (#1367), and goldens all depend on this.
- **Parity:** the studio bake path runs the identical pass (it already runs contacts today); stills equal live.
- **Goldens:** placement hashes never see contact offsets — physics is live-layer only, as today.
- **One-writer:** `particles.js` takes a call site only; the shared-grid pass lives in a new module.
- **Governor:** contact fidelity is a shed tier — shed FX finishes first, then deform, then radius fidelity (fewer pairs), body counts last.
- **Stillness:** under reduced-motion the dish resolves contacts once and holds — no integration, no jitter (thermal reads the stillness law, not the tempo knob).

## Stages

**Stage A — One world (the enrolment).** Shared cross-strata grid; every stratum enrolled as a body; radius-from-scale; contact knobs (radius trim, restitution, repel — already in PARAM_SPEC) exposed on the strata block; canonical visit order + extended determinism selfcheck (cross-stratum scenario added beside contacts scenario 14).
*Acceptance:* a PEARL body displaces an EAVES body on contact, on the live canvas and identically in a bake · golden placement hashes unchanged · contact-off (dish toggle at 0) is bit-identical to today's engine · 405-node mixed roster holds the frame budget on the reference device.

**Stage B — Soft bodies & exchange.** Impact deform springs; membrane wobble; coalescence render for sustained same-family contact; mutual pigment exchange; contact-density field published.
*Acceptance:* a hard bump visibly dents and recovers · two mingling colonies measurably trade pigment over 60 s of contact, and the trade is seed-reproducible · deform and exchange vanish cleanly under their shed tiers · #1355 can read the density field from the bus.

**Stage C — The medium & ecology.** WETNESS-driven viscosity/cling; mass-weighted current advection; ACCUM trail field with group attraction/avoidance; global population cap + breed/die ecology tuning.
*Acceptance:* WETNESS=0 is the exact dry path · a light stratum rides the current, a heavy one resists, same seed · trails visibly organise a colony's drift and fade on schedule · population never exceeds the governor's cap under breed-heavy settings.

## Non-goals

Silhouette/SDF collision · rigid-body stacks or a physics library · soft-body simulation · WebGPU dependency · a physics panel (knobs live in PARAM_SPEC and the strata block) · cross-*dish* anything.

## Risks

- **WASM fast path:** already excludes contact-heavy modes; the shared pass widens the JS-fallback zone (≈1.3× on offline bakes) — accepted, named here so it is never discovered.
- **Pair counts on iPad:** cross-strata pairs grow faster than per-system pairs; Stage A's budget acceptance line is the gate, and the shed ladder (§7) is the release valve.
- **Feel risk:** physics that reads "billiards" kills the dish. The deform/wobble stage is not garnish — it is what makes Stage A's correctness feel alive. Do not judge Stage A as the finished feel.

## Open questions for Matt

1. Dish physics default: ON for live strata, or behind a DISH toggle per Look? (Recommendation: a per-Look toggle, default ON — a Look is a world, and worlds have physics; the toggle preserves today's ghost-stack as an artistic choice.)
2. Coalescence scope: same-family only (recommended for v1), or any-body?
3. Population ecology: a MODE on the dish, or always-on gentle? (Recommendation: mode — ecology is a performance decision, not a default behaviour.)

## Visual targets (Matt, 2026-10-12)

Eight goal reference images, saved at `~/workspace/your_files/petri-goal-refs/` (kept local per the visual-targets precedent; this section is their design read):

1. **01-pastel-colonies** — soft pastel colonies (pink, peach, cream) crowding in a blue medium, dotted daughter colonies beside parents. The §5 target: distinct identities that touch, lean, and trade pigment without losing themselves; breed made visible.
2. **02-dendritic-agar** — a branching orange colony invading blue-green medium, radial spore-burst colonies at the edges, territories that stop at each other's borders. The §6 target: frontier growth, stigmergy trails, competition for space.
3. **03-foam-cells** — interlocking translucent cells with dark membranes, teal-to-red gradient across the raft. The §3 target: pressure made visible — cells deform into polygons under crowding; the membrane between two cells is the body-level analogue of the mix seam.
4. **04-fluoro-mesh-organisms** — wireframe tube and sphere organisms, green-red fluorescence on black. The §2 target: bodies with *structure* — lattice skins, bendable tubes (compound bodies, #1206), glow as medium.
5. **05-diatom-arrangement** — a Victorian diatom slide: ornate circles, triangles, and star shells packed gapless on black. The asset vocabulary's north star — Haeckel-grade micro-geometry as marks; repetition with organic variation.
6. **06-sem-fans-dotfields** — false-colour SEM: radial fan discs (teal, magenta) over tissue studded with ordered dot colonies. Hero marks + density pooling: a few large structured bodies, fields of small ones in formation.
7. **07-stem-cross-section** — honeycomb cellular tissue in a ring, chambers inside chambers, spiked defensive edges. The hierarchy target: bodies with interiors, structure you can read at two scales.
8. **08-iridescent-foam** — macro bubble raft, oil-slick iridescence on dark. The §6 medium target: surface tension you can *see*; iridescence as weather (FX), not decoration.

Read together: the dish should look grown, not rendered — soft bodies under real pressure, structured at two scales, colour earned by neighbourhood. If a stage's output could be mistaken for clip-art circles, it has missed the target regardless of test results.

## Lois pass

- The dish is not a metaphor upgrade; it is a **physics contract**. If marks can't push each other, it's still Photoshop with better PR.
- Stage A is plumbing and will look unimpressive in a screenshot. Ship it anyway — every living thing in this instrument for the next two years stands on that grid.
- "Use all the parameters" is the whole design. The day a physics knob appears that isn't already a KC-1 word, the design has failed.
- Pigment exchange is the soul of it. Momentum is mechanics; two colonies trading colour because they touched — that's the piece people will remember.
