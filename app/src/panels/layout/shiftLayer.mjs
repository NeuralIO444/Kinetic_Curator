// shiftLayer.mjs — #1204: the pure half of the shift layer.
//
// HEROES is the shift function of MOTION; ATTRACTORS (the PULL row) is the
// shift function of WILD (the dice). Both rows are quantized hand input:
// modes OFF · LOW · MID · HIGH write stored values, and the row shows the
// stored value's nearest mode (the quantized-hand-input rule: stored values
// stay continuous; the hand writes modes; double-click edits the exact
// count where the value is a count).
//
// The params themselves are the engine's, shipped with #1200 and unwritten
// by any panel until now: `heroes` (read in buildPlacements stage C) and
// `attractorCount` / `attractorRadius` (read in placement stage A). No new
// param shape is introduced — the rows write the engine's own keys.
//
// Hand-only law (#1204 spec §5): the dice, the curator, Davis, the dial
// lean and the governor never write these params. Nothing in this module
// is imported by a machine door; shiftLayer.selfcheck.mjs pins every
// machine door shut.
import { MAX_HEROES, ATTRACTOR_RADIUS_DEFAULT } from '../../engine/kernel/field/attractors.js';

export { MAX_HEROES, ATTRACTOR_RADIUS_DEFAULT };

/** The four modes, in row order. Ids are the stored vocabulary; labels render upper-case (TE). */
export const SHIFT_MODE_IDS = Object.freeze(['off', 'low', 'mid', 'high']);
export const SHIFT_MODE_OPTIONS = Object.freeze(SHIFT_MODE_IDS.map((id) => ({ id, label: id.toUpperCase() })));

// ── HEROES ────────────────────────────────────────────────────────────────
// OFF · LOW · MID · HIGH → 0 · 1 · 3 · 7 heroes. Seven is the engine's
// scarcity cap (MAX_HEROES): a handful is what makes a hero read as
// emphasis instead of a second crowd.
export const HERO_COUNT_BY_MODE = Object.freeze({ off: 0, low: 1, mid: 3, high: MAX_HEROES });

/** Clamp an exact hero count to the engine's range: a whole number, 0..MAX_HEROES. */
export function clampHeroCount(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_HEROES, Math.max(0, n));
}

/** The mode a stored hero count displays as: nearest mode value, ties to the lower mode. */
export function heroModeForCount(count) {
  const c = clampHeroCount(count);
  let best = 'off';
  let bestDist = Infinity;
  for (const id of SHIFT_MODE_IDS) {
    const d = Math.abs(HERO_COUNT_BY_MODE[id] - c);
    if (d < bestDist) {
      best = id;
      bestDist = d;
    }
  }
  return best;
}

/** The LAYOUT_PARAM write the HEROES row emits for a mode tap. */
export function heroesWrite(modeId) {
  return { key: 'heroes', value: HERO_COUNT_BY_MODE[modeId] ?? 0 };
}

/** The LAYOUT_PARAM write the exact-count editor emits (double-click). */
export function heroesExactWrite(count) {
  return { key: 'heroes', value: clampHeroCount(count) };
}

// ── ATTRACTORS (PULL) ─────────────────────────────────────────────────────
// OFF · LOW · MID · HIGH → 0 · 1 · 2 · 3 attractors, and the pull strength
// is how far each attractor's density pool reaches: the field radius as a
// multiplier of ATTRACTOR_RADIUS_DEFAULT (0.15 of the canvas). Positions
// are the engine's own seeded scatter (createAttractorField: the k-th
// point is a pure function of the seed, identical whatever count is
// requested), so modes replay exactly and no canvas picking is needed.
export const ATTRACTOR_COUNT_BY_MODE = Object.freeze({ off: 0, low: 1, mid: 2, high: 3 });
export const ATTRACTOR_RADIUS_MULT_BY_MODE = Object.freeze({ off: 1, low: 1, mid: 1.5, high: 2 });

/** The field radius a PULL mode writes. */
export function attractorRadiusForMode(modeId) {
  return ATTRACTOR_RADIUS_DEFAULT * (ATTRACTOR_RADIUS_MULT_BY_MODE[modeId] ?? 1);
}

/** The param pair a PULL mode stands for. OFF still writes the default radius, so the stored pair is always a complete mode. */
export function attractorParamsForMode(modeId) {
  return {
    attractorCount: ATTRACTOR_COUNT_BY_MODE[modeId] ?? 0,
    attractorRadius: attractorRadiusForMode(modeId),
  };
}

/** The LAYOUT_PARAM writes the PULL row emits for a mode tap (count, then radius — one undo step via the store's push debounce). */
export function attractorWrites(modeId) {
  const p = attractorParamsForMode(modeId);
  return [
    { key: 'attractorCount', value: p.attractorCount },
    { key: 'attractorRadius', value: p.attractorRadius },
  ];
}

/**
 * The mode a stored (attractorCount, attractorRadius) pair displays as.
 * Count 0 (or absent) is OFF whatever the radius says. Otherwise the
 * nearest mode, count weighted double — the count is the visible fact,
 * the radius its reach.
 */
export function attractorModeForParams(params = {}) {
  const count = Number(params.attractorCount);
  if (!Number.isFinite(count) || count <= 0) return 'off';
  const radius = Number(params.attractorRadius);
  const mult = Number.isFinite(radius) && radius > 0 ? radius / ATTRACTOR_RADIUS_DEFAULT : 1;
  let best = 'low';
  let bestScore = Infinity;
  for (const id of ['low', 'mid', 'high']) {
    const score =
      Math.abs(ATTRACTOR_COUNT_BY_MODE[id] - count) * 2 + Math.abs(ATTRACTOR_RADIUS_MULT_BY_MODE[id] - mult);
    if (score < bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}
