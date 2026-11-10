// layerOrder.js — the fold order of adjustment tracks (#1048). Pure, no imports.
//
// The layer array is stored bottom→top and the scene contract folds it in that
// order. KC-1's rule is: FX tracks grade the picture first, MATH tracks (the
// tone grade) last — "what you see on top is applied last". Until #1048 the
// engine let FX and MATH interleave in any order (#1010 called that creative),
// which the BUILD panel's separate FX / MATH sections hid. Now the order is an
// invariant: among adjustment tracks, every FX comes before every MATH.
//
// Only adjustment tracks move, and only into the slots adjustment tracks
// already occupy, so content tracks keep their exact positions. Relative order
// inside FX, and inside MATH, is preserved (stable).

const isFx = (l) => !!l && l.type === 'fx';
const isMath = (l) => !!l && l.type === 'math';
export const isAdjustment = (l) => isFx(l) || isMath(l);

/**
 * @param {Array<{type:string}>} layers bottom→top
 * @returns {{layers: Array, moved: boolean}} the same layers with FX before
 *   MATH among the adjustment slots; `moved` says whether anything changed.
 */
export function fxBeforeMath(layers) {
  if (!Array.isArray(layers)) return { layers, moved: false };
  const slots = [];
  layers.forEach((l, i) => {
    if (isAdjustment(l)) slots.push(i);
  });
  const adj = slots.map((i) => layers[i]);
  const sorted = [...adj.filter(isFx), ...adj.filter(isMath)];
  const moved = sorted.some((l, k) => l !== adj[k]);
  if (!moved) return { layers, moved: false };
  const out = layers.slice();
  slots.forEach((idx, k) => {
    out[idx] = sorted[k];
  });
  return { layers: out, moved: true };
}

/**
 * May two layers trade places? Only within the exact same type: content
 * swaps with content, FX with FX, MATH with MATH, pattern with pattern.
 * Content never crosses the adjustment line (#732) and FX never crosses
 * MATH (#1048). #2038 adds the pattern clause: a pattern used to read as
 * "content family" here and could trade UP past the content stratum —
 * under the rebuild patterns are pinned to the bottom, locked, so a
 * pattern trades only with another pattern (which keeps every pattern
 * in the bottom band). With the one-content skeleton the content case
 * is moot in practice; the law is stated whole anyway.
 */
export function canTrade(a, b) {
  if (!a || !b) return false;
  return a.type === b.type;
}

// #2038 — the fixed strata order (Matt's ruling, 2026-11-08): bottom→top
// PATTERNS (pinned to the bottom, locked) → the ONE content stratum →
// FX → MATH. With one stratum per rationed band the full order is
// determined by type alone, so the canonical form is a stable partition
// by band: relative order inside a band (patterns among themselves) is
// preserved exactly, and nothing else about the layers changes. The
// load door re-seats legacy documents into this order (said out loud,
// projectNormalize.js); the store's add paths canonicalize the same
// way, so no reachable state ever holds a pattern above the content
// stratum or an adjustment stratum below it. This subsumes fxBeforeMath
// (FX before MATH is the band order's upper half); fxBeforeMath stays
// for its own callers and pins.
const STRATA_BAND = { pattern: 0, content: 1, fx: 2, math: 3 };
const bandOf = (l) => STRATA_BAND[l && l.type] ?? 1;

/**
 * @param {Array<{type:string}>} layers bottom→top
 * @returns {{layers: Array, moved: boolean}} the same layers in the
 *   fixed #2038 order (stable within each band); `moved` says whether
 *   anything changed.
 */
export function canonicalStrataOrder(layers) {
  if (!Array.isArray(layers)) return { layers, moved: false };
  const sorted = layers
    .map((l, i) => ({ l, i }))
    .sort((a, b) => bandOf(a.l) - bandOf(b.l) || a.i - b.i)
    .map((e) => e.l);
  const moved = sorted.some((l, k) => l !== layers[k]);
  return moved ? { layers: sorted, moved: true } : { layers, moved: false };
}
