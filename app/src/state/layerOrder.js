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
  layers.forEach((l, i) => { if (isAdjustment(l)) slots.push(i); });
  const adj = slots.map((i) => layers[i]);
  const sorted = [...adj.filter(isFx), ...adj.filter(isMath)];
  const moved = sorted.some((l, k) => l !== adj[k]);
  if (!moved) return { layers, moved: false };
  const out = layers.slice();
  slots.forEach((idx, k) => { out[idx] = sorted[k]; });
  return { layers: out, moved: true };
}

/**
 * May two layers trade places? Content swaps with content, FX with FX, MATH
 * with MATH. Content never crosses the adjustment line (#732) and FX never
 * crosses MATH (#1048).
 */
export function canTrade(a, b) {
  if (!a || !b) return false;
  if (isAdjustment(a) || isAdjustment(b)) return a.type === b.type;
  return true;
}
