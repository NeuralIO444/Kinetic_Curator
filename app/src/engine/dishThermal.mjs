/**
 * dishThermal.mjs — petri dish §4 rows (#1538): TEMPO and DENSITY,
 * the two dish inputs the petri spec promised (docs/research/
 * petri-dish-physics-scope-2026-10-12.md §4) that no stage built.
 * The E1b census (#1505) measured the gap: no tempo/thermal key
 * existed in PARAM_SPEC at all, and the density layout param never
 * entered the dish path (bit-identical at 10 vs 100). This module
 * is the law for both reinterpretations; particles.js takes the
 * call sites only (the B1 one-writer pattern, as dishMedium).
 *
 *   TEMPO — thermal energy. The `dishTempo` layout param resolves
 *   here to a Brownian jitter amplitude: each step, every body in
 *   the dish takes a small deterministic velocity kick (hashU01 on
 *   the dyn channel, keyed by step and body — the integrator's own
 *   idiom, cf. the curiosity walk). Hot dish never settles; cold
 *   dish stills. The curve is linear — the knob's travel is the
 *   effect's travel, no hidden knee (dishMedium's restitution
 *   precedent) — and at TEMPO 0 the amplitude is exactly 0: the
 *   branch never runs and the pre-#1538 engine is reproduced bit
 *   for bit. Defaults parity is that identity: dishTempo defaults
 *   to 0, so a document that predates the row opens cold, exactly
 *   as it was saved.
 *
 *   DENSITY — crowding pressure. The `density` layout param keeps
 *   its placement meaning (the param census measures it there) and
 *   gains its dish meaning: it drives the existing contact repel
 *   gain. The curve is a ratio around the shipped default —
 *   gain = density / DENSITY_PIVOT — so at the default (78) the
 *   gain is exactly 1 and every existing dish behaves bit for bit
 *   as before; below it the dish presses softer, above it harder,
 *   linearly across the knob's whole 10..100 travel. Repel stays
 *   per-system personal space (the cross-strata pass never carried
 *   it — A1's scope), so the gain applies at the per-system
 *   contact-pass call site, beside the medium's restitution map.
 *
 * Composition and scope, decided once here:
 *   - Both laws exist only where the dish does: the call sites sit
 *     inside the contacts gate (contactRadius > 0), so a
 *     contact-less swarm is bit-identical, exactly as the medium's.
 *   - Determinism: the curves are pure arithmetic on params, and
 *     the jitter draws are hashU01(seed, CH.dyn, step-mixed keys)
 *     — no clock reads, no unseeded draws, no step counter of our
 *     own (the integrator's _step is the key). A frame stays a pure
 *     function of (seed, params, steps); the studio bake runs the
 *     same update(), so bakes agitate exactly as the live dish.
 *   - Stillness (spec §7): thermal reads the stillness law, not
 *     the tempo knob — under reduced-motion the resolved amplitude
 *     is 0 whatever the knob says, so a held dish cannot jitter.
 *     Density is a pressure, not a motion: like restitution it
 *     applies whenever the dish resolves, held or stepping.
 *   - Governor: neither law declares a cost tier or sheds. They
 *     are contact law, not finishes (dishMedium's precedent); a
 *     shed that rewrote physics mid-performance would break bake
 *     parity. Their cost is two curve evaluations per system-step
 *     and, when hot, two hash draws per body inside an integrator
 *     that already runs.
 */

/** Peak per-axis Brownian kick (px/step at 60 fps) at TEMPO 1,
 *  drawn uniform in ±this each step. Against the integrator's
 *  damping (~0.95) a full-hot body holds a typical speed of a
 *  few px/step — under the cloud speed clamp (8), far above the
 *  settled dish's residual drift: hot reads hot, not broken. */
export const THERMAL_JITTER_MAX = 1.0;

/** The density value whose crowding gain is exactly 1 — the
 *  shipped layout default (DEFAULT_LAYOUT_PARAMS.density). The
 *  selfcheck pins the two together so they can never drift. */
export const DENSITY_PIVOT = 78;

/** The knob, read honestly: a finite number clamped to [0, 1];
 *  anything else (absent, NaN, junk) is a cold dish, 0 — the
 *  pre-#1538 world, where the row did not exist. */
export function clampDishTempo(v) {
  const n = Number(v);
  return Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0;
}

/** Brownian jitter amplitude (px/step) at a tempo: linear,
 *  exactly 0 at 0 — the identity the defaults-parity gate rides. */
export function thermalJitterAmp(tempo) {
  return THERMAL_JITTER_MAX * clampDishTempo(tempo);
}

/**
 * TEMPO resolved once per call site: { tempo, amp }. `still`
 * is the frame's reduced-motion flag — under it the amplitude
 * is 0 at any knob value (spec §7: thermal reads the stillness
 * law, not the tempo knob).
 */
export function dishThermalFor(tempo, still = false) {
  const t = clampDishTempo(tempo);
  return { tempo: t, amp: still ? 0 : THERMAL_JITTER_MAX * t };
}

/** The cold thermal, frozen: what a call site with no TEMPO means. */
export const COLD_THERMAL = Object.freeze(dishThermalFor(0));

/**
 * Crowding pressure as a multiplier on the contact repel gain:
 * density / DENSITY_PIVOT — exactly 1 at the shipped default,
 * 10/78 at the knob's floor, 100/78 at its ceiling. An absent or
 * junk density reads the pivot (gain 1, the identity): a document
 * that predates the reinterpretation presses exactly as it did.
 */
export function crowdingRepelGain(density) {
  const n = Number(density);
  return Number.isFinite(n) && n > 0 ? n / DENSITY_PIVOT : 1;
}
