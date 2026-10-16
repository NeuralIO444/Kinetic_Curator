/**
 * dishMedium.mjs — petri dish C1 (#1413): the medium. WETNESS stops
 * being only a watercolor word and becomes the dish's physics: the one
 * knob already on the instrument (accumulationWetness, #970) maps to
 * restitution / cling / damping curves at the contact pass call site.
 * Spec: docs/research/petri-dish-physics-scope-2026-10-12.md §6.
 *
 *   WET  → low restitution, high cling (stick-leaning contacts),
 *          slow damping (the medium's friction: motion dies sooner).
 *   DRY  → bouncy, low adhesion — and at WETNESS = 0 the EXACT dry
 *          path: every curve below is the identity there, so the
 *          pre-C1 engine is reproduced bit for bit (the watercolor
 *          law — 0 is dry paper — holds absolutely in the dish too).
 *
 * The three curves, all pure functions of the clamped wetness w:
 *
 *   RESTITUTION — e_eff = e × (1 − w). A wet bounce lands softer; at
 *   full wet the medium absorbs the bounce entirely and a bounce-mode
 *   pair meets exactly as stick would. Linear: the knob's travel is
 *   the effect's travel, no hidden knee.
 *
 *   CLING — surface tension (§4: WETNESS = surface tension +
 *   friction). A contacting pair that is SEPARATING gives up a budget
 *   of its separating normal velocity: capture = min(vn, clingK ×
 *   MEDIUM_CLING_TENSION), with clingK the smoothstep of w (nothing
 *   at dry, full at wet, gentle through the middle of the knob). The
 *   budget form is the physics: tension can hold a slow separation
 *   still (capture = vn, the pair leaves with vn 0) but a fast pair
 *   tears free losing only the budget — no threshold, no weld, and
 *   never a reversal (capture ≤ vn, so tension never pulls a pair
 *   together; it only refuses to let go). Cling acts on the
 *   post-impulse, post-repel velocities of every contacting pair,
 *   whatever the pair's mode: the medium biases, the mode decides —
 *   modes still own their events (swap/die/breed fire on approach,
 *   which cling never touches) and their approach response.
 *
 *   DAMPING — the medium's drag on the integrator: this step's
 *   velocity retention is multiplied by (1 − MEDIUM_DAMP_DRAG × w)
 *   in the same dt-correct pow form as the damping it rides. At full
 *   wet a body keeps 2% less of its velocity per step — over a second
 *   of glide that is the difference between a dish that settles and
 *   one that jitters on.
 *
 *   FRICTION — the surface half (§4's other meaning), shipped by D1
 *   (#1595): after the bounce impulse and the cling have run, a
 *   contacting pair's relative TANGENTIAL velocity meets one
 *   Coulomb clamp. The pair coefficient is μ = FRIC_MAX × fricK(w),
 *   fricK the cling curve's smoothstep sibling; the impulse that
 *   would zero the slide is clamped to μ × the total normal impulse
 *   the pair actually exchanged this step (bounce + cling), so
 *   friction creates no energy and no grip from nothing: under
 *   budget the pair grips (static friction, emergent — no mode
 *   switch), over budget it slides, giving up exactly the budget
 *   (kinetic). One μ, both regimes, named as the deliberate
 *   simplification. At w = 0 fricK is 0 and both passes skip the
 *   block whole — a dry dish is the pre-D1 dish bit for bit. The
 *   budget is this-step only: no persistent manifolds, no
 *   accumulation across steps (research §1.4, accepted deliberately
 *   — a pair resting in a V of neighbours can keep a small residual
 *   tangential drift; resting-contact friction is a different
 *   engine's problem). Dry is billiards; wet has skin.
 *   D2 (#1596) spends this same impulse twice: applied at the
 *   contact point it is also torque (Δω = −R·jt/I per disc, law in
 *   dishSpin.mjs), and the slide it answers is read at the contact
 *   point — no new budget, no second friction, exactly as §9 of
 *   the D1 sketch promised.
 *
 * Composition and scope, decided once here:
 *   - The medium exists only where the dish does: the call site maps
 *     the curves inside the contacts gate (contactRadius > 0), so a
 *     contact-less swarm — including the #970 watercolor path, which
 *     reads the same knob for the FX finish — is bit-identical.
 *   - Cross-strata pairs take the pair's averaged wetness, exactly
 *     as cross-strata restitution is averaged (A1's precedent); the
 *     drag stays per-system, in each stratum's own integrator.
 *   - Determinism: curves are pure arithmetic on a param — no state,
 *     no step counter, nothing to drift between live and bake. The
 *     studio bake runs the same update(), so bakes settle exactly as
 *     the live dish does (the issue's probe is a bake probe).
 *   - Stillness: the medium is a physics parameter, like restitution
 *     itself — there is no render split to restrain. Under
 *     reduced-motion the dish resolves once and holds (spec §7), so
 *     nothing integrates and nothing accrues; when it steps, the
 *     medium applies as it does in any bake.
 *   - Governor: the medium declares NO cost tier and never sheds.
 *     It is contact law, not a finish: restitution, repel, and the
 *     shared grid itself register no tier either (the ladder sheds
 *     FX finishes, then deform, then radius fidelity, then body
 *     counts — never the parameters of the contact law), and a shed
 *     that rewrote physics mid-performance would break bake parity,
 *     since bakes carry no governor state. Its cost is four curve
 *     evaluations per system-step and, when wet, a few flops per
 *     contacting pair inside passes that already run.
 *
 * particles.js and dishContacts.mjs take call sites only; the law
 * lives here (the B1 one-writer pattern).
 */

/** The most separating normal velocity (px/step) full cling can
 *  capture from a contacting pair: surface tension's budget. A pair
 *  separating slower than this is held; faster, it tears free
 *  having paid the budget. */
export const MEDIUM_CLING_TENSION = 0.9;

/** Extra per-step velocity loss at full wet, as a retention
 *  multiplier on the integrator's damping: 1 − this = 0.98 kept per
 *  step at 60 fps (≈ ×0.30 over a second of free glide). */
export const MEDIUM_DAMP_DRAG = 0.02;

/** The pair friction coefficient at full wet (D1, #1595): wet
 *  paper on glass — strong enough to feel in ten seconds, far from
 *  a lock. The pair's μ is this × fricK(pairWet); Matt's tune on
 *  the review lane. */
export const FRIC_MAX = 0.5;

/** The knob, read honestly: a finite number clamped to [0, 1];
 *  anything else (absent, NaN, junk) is the dry path, 0. */
export function clampWetness(v) {
  const n = Number(v);
  return Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0;
}

/** Restitution multiplier: 1 at dry (identity), 0 at full wet. */
export function mediumRestitutionK(w) {
  return 1 - clampWetness(w);
}

/** Cling strength: the smoothstep of w — 0 at dry, 1 at full wet,
 *  flat at both ends of the knob so small wetness stays subtle. */
export function mediumClingK(w) {
  const x = clampWetness(w);
  return x * x * (3 - 2 * x);
}

/** Friction strength (D1, #1595): the smoothstep of w, the cling
 *  curve's sibling — 0 at dry (both passes skip the tangential
 *  block whole), 1 at full wet. One knob, three consequences:
 *  cling holds the normal, friction holds the tangent, damping
 *  slows the glide. */
export function mediumFricK(w) {
  const x = clampWetness(w);
  return x * x * (3 - 2 * x);
}

/** Per-step velocity retention the medium's drag leaves behind:
 *  exactly 1 at dry, 1 − MEDIUM_DAMP_DRAG at full wet. */
export function mediumDampRetention(w) {
  return 1 - MEDIUM_DAMP_DRAG * clampWetness(w);
}

/**
 * The separating normal velocity a cling of strength `clingK`
 * captures from a pair separating at `vn` (vn > 0): the tension
 * budget, never more than the separation itself — capture can hold
 * a pair, it can never pull one back together.
 */
export function mediumClingCapture(clingK, vn) {
  if (!(clingK > 0) || !(vn > 0)) return 0;
  const budget = clingK * MEDIUM_CLING_TENSION;
  return vn < budget ? vn : budget;
}

/**
 * The tangential impulse a contact can transmit this step (D1,
 * #1595): μ × the total normal impulse the pair actually exchanged
 * (bounce + cling). A pair that barely touched barely grips — the
 * budget is the physics, and it is why friction can create neither
 * energy nor grip from nothing.
 */
export function mediumFrictionBudget(mu, jnTotal) {
  if (!(mu > 0) || !jnTotal) return 0;
  return mu * Math.abs(jnTotal);
}

/**
 * The pair's tangential impulse (D1, #1595): the impulse that
 * would zero the pair's relative slide (−vt / kInv), Coulomb-
 * clamped to ±mediumFrictionBudget. Inside the budget the pair
 * grips — the slide zeroes this step; outside, it slides having
 * paid exactly the budget. One μ, both regimes.
 *
 * `vt` is the slide the impulse must answer: D1 read the centres'
 * relative tangential velocity; since D2 (#1596) the call sites
 * pass the CONTACT-POINT slide (centres plus ω×r, dishSpin.mjs),
 * so a grip now zeroes the surfaces' slide and the pair leaves
 * rolling. `kInv` is the tangential inverse effective mass the
 * slide spreads over: D1's wSum (centres only) before D2, the
 * spin-inclusive wSum + Σ R²/I since. The budget and the clamp —
 * the parts that make friction honest — are unchanged.
 */
export function mediumFrictionImpulse(mu, jnTotal, vt, kInv) {
  if (vt === 0 || !(kInv > 0)) return 0;
  const budget = mediumFrictionBudget(mu, jnTotal);
  if (!(budget > 0)) return 0;
  const stick = -vt / kInv;
  return stick < -budget ? -budget : stick > budget ? budget : stick;
}

/**
 * The medium at wetness `w`, resolved once per call site:
 * { wet, restK, clingK, fricK, dampRetention }. At w = 0 every field
 * is the identity (restK 1, clingK 0, fricK 0, dampRetention 1) —
 * the dry path.
 */
export function dishMediumFor(w) {
  const wet = clampWetness(w);
  return {
    wet,
    restK: 1 - wet,
    clingK: mediumClingK(wet),
    fricK: mediumFricK(wet),
    dampRetention: 1 - MEDIUM_DAMP_DRAG * wet,
  };
}

/** The dry medium, frozen: what a call site with no WETNESS means. */
export const DRY_MEDIUM = Object.freeze(dishMediumFor(0));
