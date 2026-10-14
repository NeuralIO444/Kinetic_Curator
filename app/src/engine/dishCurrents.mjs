/**
 * dishCurrents.mjs — petri dish C2 (#1414): the medium II — currents
 * by mass. Spec: docs/research/petri-dish-physics-scope-2026-10-12.md
 * §6 ("Currents: the existing curl wind is the dish's current; bodies
 * advect with it by mass — light bodies ride it, heavy bodies
 * resist").
 *
 * What the pre-C2 engine did with the wind: a FORCE. Every body,
 * whatever its mass, was pushed downwind at (field × gain) / m,
 * forever — with the integrator's damping that reads as a terminal
 * drift speed proportional to 1/m, so on the baseline probe a heavy
 * stratum (m = 3) still migrated ~350 px in 480 steps while a light
 * one (m = 0.4) saturated the speed clamp at ~7.7 px/step. Neither
 * behaviour is a current: the light body is blasted, not carried;
 * the heavy one resists by a factor of three, not by kind.
 *
 * C2 gives the dish the medium's actual verb: ADVECTION. A body in a
 * current does not accelerate downwind without bound — it relaxes
 * toward the current's own velocity, at a rate inverse to its mass:
 *
 *     a += (u − v) × coupling / m
 *
 * u is the current's velocity at the body (the wind field's shape,
 * scaled to a speed — the field itself is untouched, sampled exactly
 * as the legacy force sampled it), v is the body's velocity, and the
 * coupling is the current's strength. The equilibrium of the term
 * against the integrator's damping is a fraction of u that falls
 * steeply with m: a light body locks onto the flow and rides it at
 * the current's pace; a heavy body's coupling is so weak that over
 * any performance horizon it keeps its own counsel — it holds
 * ground. One term structure, both of the issue's work items:
 *
 *   WIND — u = the wind field's shape × CURRENT_SPEED (curl shape:
 *   the curl2 vector; point shape: the legacy magnitude with the
 *   strength factored out), coupling = CURRENT_COUPLING × windMul.
 *   The strength rides the coupling, never the target, so wind at 0
 *   is a term that is exactly absent — not a brake dragging bodies
 *   toward a zero target. Wind off = pre-C2 trajectories, exactly.
 *
 *   ATTRACTOR CHEMOTAXIS — the shared attractor term (#1200 lineage:
 *   the pointer/well force every stratum's force pass shares) rides
 *   the same structure: u = the unit vector to the well ×
 *   ATTRACTOR_DRIFT_SPEED × the group's sign, coupling =
 *   CURRENT_COUPLING × gravityWells × attractMul × |seek gain|.
 *   The sign is the behave row's seek gain (#584/#711): a seeking
 *   group drifts toward the well — food, light — and a fleeing group
 *   drifts away from the same well — threat. The well is typed by
 *   the group's sign, not by new data: no attractor table, no new
 *   parameter. Near the well the target flips with the direction, so
 *   seekers pool around it instead of diving through it.
 *
 * Composition and scope, decided once here (the C1 pattern):
 *   - The currents exist only where the dish does: the call site
 *     resolves them inside the same gate as the medium
 *     (contactRadius > 0). Outside it, the legacy force terms run
 *     bit-identical — every pinned behaviour hash, the reference
 *     engine, and the WASM fast path (which already excludes
 *     contact casts on exactly this gate) are untouched. Inside the
 *     gate the legacy wind/attractor forces are REPLACED, not
 *     supplemented: two pushes would be two opinions about one
 *     medium.
 *   - The DISH switch (A3) does not gate the currents, exactly as it
 *     does not gate the medium (C1): both are properties of the
 *     per-system force/contact passes, which the switch never
 *     touched — it governs cross-strata enrolment only.
 *   - Determinism: the term is pure arithmetic on params and the
 *     body's own velocity at the force pass — no state, no step
 *     counter, no clock, no dice. The studio bake runs the same
 *     update(), so a baked dish rides the same currents (bake =
 *     live, as every stage before).
 *   - dt: the term enters as an acceleration, so integration scales
 *     it by dtFrames like every other force (spine A's convention);
 *     at 60 fps the per-step gap closure is exactly coupling / m.
 *   - Stillness: currents are physics, like the medium — there is no
 *     render split to restrain. Under reduced-motion the dish
 *     resolves once and holds (spec §7), so nothing integrates and
 *     nothing advects; when it steps, the current applies as in any
 *     bake. (B1/B2's splits exist because deform and coalescence are
 *     render attributes; C1 set the physics precedent.)
 *   - Governor: the currents declare NO cost tier and never shed —
 *     C1's argument, inherited deliberately: they are force law, not
 *     a finish (the §7 ladder sheds FX finishes, then deform, then
 *     radius fidelity, then body counts — never the parameters of
 *     the force law), and a shed that rewrote physics
 *     mid-performance would break bake parity, since bakes carry no
 *     governor state. Their cost is a handful of flops per body
 *     inside a force pass that already runs.
 *
 * particles.js takes call sites only; the law lives here (the B1
 * one-writer pattern).
 */

/** The current's own speed (px/step) at field shape 1: what a fully
 *  entrained body rides at, before damping takes its share. Kept
 *  near the moth speed ceiling so even a light organism body rides
 *  the flow instead of being torn off it. */
export const CURRENT_SPEED = 1.2;

/** Per-step relaxation rate at strength 1 and mass 1: the fraction
 *  of the velocity gap (u − v) the current closes per step, before
 *  the body's inverse mass is applied. At 0.02, a mass-0.4 body
 *  entrains with a ~20-step time constant; a mass-3 body's is ~150
 *  steps — and against per-step damping its equilibrium share of the
 *  current falls to roughly a fifth of the light body's. */
export const CURRENT_COUPLING = 0.02;

/** Chemotaxis drift speed (px/step): the velocity a body relaxes
 *  toward along the well's axis — a drift, not a dive. The legacy
 *  force pulled at ~0.4/m with no ceiling but the speed clamp; the
 *  drift target is what makes pooling at the well possible. */
export const ATTRACTOR_DRIFT_SPEED = 0.9;

/** A current strength read honestly: a finite positive number is
 *  itself; anything else (absent, NaN, junk, zero, negative) is no
 *  current at all — the off state, never an anti-current. */
export function clampCurrentStrength(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The currents at strength `s`, resolved once per system-step:
 * { on, coupling }. coupling already carries the strength, so the
 * per-body term is (u − v) × coupling / m — and at strength 0 the
 * resolution is the identity: on = false, and the call site runs the
 * legacy force, which the strength would have zeroed anyway.
 */
export function dishCurrentsFor(strength) {
  const s = clampCurrentStrength(strength);
  return { on: s > 0, coupling: CURRENT_COUPLING * s };
}

/** No currents, frozen: what a call site outside the dish holds. */
export const NO_CURRENTS = Object.freeze({ on: false, coupling: 0 });

/**
 * One axis of the advection term: the acceleration that closes the
 * gap between the current's velocity `u` and the body's velocity
 * `v`, at this coupling and mass. Pure arithmetic; the caller adds
 * it to the force accumulators like any other force.
 */
export function advectAxis(u, v, coupling, m) {
  return ((u - v) * coupling) / m;
}

/** The chemotaxis sign of a seek gain: negative flees (threat),
 *  anything else seeks (food, light). The gain's magnitude is the
 *  coupling's business (dishCurrentsFor), never the sign's — and a
 *  zero gain resolves to no current before the sign is ever read. */
export function attractorDriftSign(seekMul) {
  return seekMul < 0 ? -1 : 1;
}
