/**
 * dishSpin.mjs — petri dish D2 (#1596): spin. Until now a disc's
 * rotation was presentational — the render faced the velocity and
 * contact never touched it. D2 adds the minimal honest angular
 * model from the friction research (§3): one scalar ω per disc
 * (plus θ, its integral, for rendering), solid-disc inertia
 * I = ½mR², and torque taken from the SAME clamped tangential
 * impulse D1 (#1595) computes — no new budget, no second friction.
 *
 * The geometry is the disc engine's free gift (research §3.1):
 * for a disc–disc contact the contact point lies on the line of
 * centres, r ∥ n, so normal impulses never create spin (r × n = 0)
 * and the tangential coupling is maximal and constant (|r × t| =
 * R). With the passes' conventions (n from the first body to the
 * second, t = (−ny, nx), the first body taking −jt·t and the
 * second +jt·t):
 *
 *   contact-point tangential velocity
 *     vtC = vt − ωA·RA − ωB·RB
 *   (body A's surface at the contact moves at vA + ωA·RA along t;
 *    body B's at vB − ωB·RB — the signs are the r directions.)
 *
 *   tangential inverse effective mass
 *     kt = wSum + RA²/IA + RB²/IB        (= 3·wSum for two solid discs)
 *   so D1's stick impulse −vt/kt, Coulomb-clamped to D1's budget,
 *   zeroes the CONTACT-POINT slide when it grips: a gripped pair
 *   leaves rolling, not sliding — rolling-without-slipping is the
 *   cone's own output once vt is read at the contact point, never
 *   a separate constraint (research §3.1).
 *
 *   torque: Δω = −R·jt/I for BOTH bodies (each body's own R and
 *   I) — the cross products rA × (−jt·t) and rB × (+jt·t) land on
 *   the same signed form, which is exactly why two discs at a
 *   rolling contact counter-rotate their surfaces into agreement.
 *
 * Damping and clamp (research §3.2 + pitfall 8): ω decays every
 * step by (1 − SPIN_DAMP_C·dtFrames) in the integrator's pow form
 * — the rotational frictionAir, unphysical on purpose, one
 * multiply, and it kills infinite-spin artefacts before they can
 * appear. |ω| is clamped outright at SPIN_MAX: past half a turn
 * per step the rendered rotation aliases anyway, so no honest
 * instrument needs spin faster than that; grippy impacts on small
 * discs (Δω = 2·jt/(mR) is large when R is small) hit the clamp
 * instead of strobing.
 *
 * Rolling resistance is deliberately ABSENT: in pure rolling the
 * contact point is instantaneously at rest, Coulomb friction does
 * no work there, and a µr row is a separate effect the issue
 * admits only if first play shows discs rolling forever
 * (µr = 0 until earned, not bundled speculatively).
 *
 * Parity and determinism, inherited from D1: ω is written ONLY
 * inside the passes' friction blocks, which both skip whole when
 * the pair's fricK is 0 — so a dry dish never writes ω, the
 * integrator's spin step (gated on ω ≠ 0) never runs, θ stays 0,
 * and the render forwards the heading rotation untouched: the dry
 * engine is bit-identical, golden for golden. Everything here is
 * pure arithmetic on pass state — no state of its own, no clock,
 * no randomness; live and bake run the same passes, so spin
 * replays exactly. Governor: contact law, no cost tier, never
 * sheds — the medium's precedent (dishMedium.mjs).
 *
 * The #1410 deform feed's stance carries over unchanged: it reads
 * normal Δv only; whether spin should shear the dent is a feel
 * question for after D2 plays, named here as D1 named it.
 *
 * particles.js and dishContacts.mjs take call sites only; the law
 * lives here (the B1 one-writer pattern).
 */

/** Angular damping coefficient (D2, #1596): per step at 60 fps a
 *  free spin keeps (1 − this) of itself — ω halves in ~69 steps.
 *  The rotational analogue of Matter's frictionAir default (0.01),
 *  and the day-one answer to infinite spin. */
export const SPIN_DAMP_C = 0.01;

/** The outright spin bound (rad/step): half a turn per step.
 *  Faster rotation aliases on any render; the clamp exists so a
 *  grippy impact on a small disc saturates instead of strobing. */
export const SPIN_MAX = Math.PI;

const TAU = Math.PI * 2;

/** Solid-disc moment of inertia, I = ½mR². Zero for a body with no
 *  mass or no disc — such a body takes no torque (and no contact:
 *  both passes gate on positive radii before friction runs). */
export function spinInertia(mass, radius) {
  return mass > 0 && radius > 0 ? 0.5 * mass * radius * radius : 0;
}

/**
 * The pair's relative tangential velocity AT THE CONTACT POINT:
 * the centres' slide (vt, the quantity D1 read) corrected by both
 * discs' surface speeds there. Zero when the pair rolls.
 */
export function spinContactVt(vt, omA, rA, omB, rB) {
  return vt - omA * rA - omB * rB;
}

/**
 * The tangential inverse effective mass the contact-point slide is
 * spread over: the centres' wSum plus each disc's spin term R²/I
 * (for a solid disc R²/I = 2/m exactly — spin makes a contacting
 * pair effectively lighter tangentially, which is why D1's stick
 * impulse, re-based on kt, zeroes the contact slide instead of
 * overshooting it into oscillation).
 */
export function spinInvMassT(wSum, rA, iA, rB, iB) {
  return wSum + (iA > 0 ? (rA * rA) / iA : 0) + (iB > 0 ? (rB * rB) / iB : 0);
}

/**
 * One disc's spin change from the pair's tangential impulse:
 * Δω = (r × jt·t)/I in the passes' sign conventions collapses to
 * −R·jt/I for both bodies (see the header). Zero when the body has
 * no inertia to turn.
 */
export function spinDeltaOmega(radius, jt, inertia) {
  return inertia > 0 ? -(radius * jt) / inertia : 0;
}

/**
 * One integrator step of a free spin: the damping decay in the
 * house dt form (pow, exact at 60 fps), then the outright clamp.
 * Applied in update() only to bodies ω ≠ 0 — an unspun body never
 * enters, so the dry integrator's arithmetic is untouched.
 */
export function spinStepOmega(omega, dtFrames) {
  const w = omega * Math.pow(1 - SPIN_DAMP_C, dtFrames);
  return w > SPIN_MAX ? SPIN_MAX : w < -SPIN_MAX ? -SPIN_MAX : w;
}

/** θ kept in [−π, π): the roll is a render angle, so it wraps —
 *  pure arithmetic, safe at any magnitude a step can add. */
export function spinWrapAngle(th) {
  return th - TAU * Math.floor((th + Math.PI) / TAU);
}
