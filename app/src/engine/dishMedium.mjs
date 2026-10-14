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
 *     since bakes carry no governor state. Its cost is three curve
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
 * The medium at wetness `w`, resolved once per call site:
 * { wet, restK, clingK, dampRetention }. At w = 0 every field is the
 * identity (restK 1, clingK 0, dampRetention 1) — the dry path.
 */
export function dishMediumFor(w) {
  const wet = clampWetness(w);
  return {
    wet,
    restK: 1 - wet,
    clingK: mediumClingK(wet),
    dampRetention: 1 - MEDIUM_DAMP_DRAG * wet,
  };
}

/** The dry medium, frozen: what a call site with no WETNESS means. */
export const DRY_MEDIUM = Object.freeze(dishMediumFor(0));
