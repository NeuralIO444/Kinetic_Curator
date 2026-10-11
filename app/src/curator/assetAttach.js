// curator/assetAttach.js — #1355 Phase 3: ATTACH points, set on an asset in the wet lab.
//
// An attach point says WHERE ON THE SHAPE another part may join (where a wing meets the body). It belongs to the
// asset, so every copy in the dish carries it, and it rides the project document. This is not the canvas PIN
// (curator/dishPins.js), which says where in the dish a creature may grow.
//
// Points are in the asset's own box, 0..100 on both axes (the viewBox every asset is drawn in). At most MAX_ATTACH.

export const MAX_ATTACH = 4;
export const ATTACH_BOX = 100;
/** A click this close to a point (box units) removes it instead of adding one. */
export const ATTACH_HIT = 6;

const inBox = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= ATTACH_BOX;
// Two decimals is finer than a click can aim, and keeps the saved file short and stable.
const snap = (n) => Math.round(n * 100) / 100;

/** One asset's points: well-formed, inside the box, at most MAX_ATTACH. */
export function sanitizeAttachPoints(points) {
  if (!Array.isArray(points)) return [];
  return points.filter((p) => p && inBox(p.x) && inBox(p.y)).slice(0, MAX_ATTACH).map((p) => ({ x: snap(p.x), y: snap(p.y) }));
}

/**
 * The whole map { assetId: points }: only the assets the artist edited by hand. An entry may be an EMPTY list: that
 * is the artist saying "no points on this one", which is different from an asset with no entry (it uses the points
 * worked out from its shape, curator/autoAttach.js). Returns null when nothing is set, so an untouched project
 * saves as before.
 */
export function sanitizeAssetAttach(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const [assetId, pts] of Object.entries(raw)) {
    if (typeof assetId !== 'string' || !assetId || assetId.length > 120 || n >= 400) continue;
    if (!Array.isArray(pts)) continue;
    out[assetId] = sanitizeAttachPoints(pts); n++;
  }
  return n ? out : null;
}

/**
 * A click in the wet lab: on (or near) an existing point it removes that point; elsewhere it adds one. At the limit
 * a new click adds nothing: the artist removes a point first, so none is ever moved by surprise.
 */
export function clickAttach(points, pt) {
  if (!pt || !inBox(pt.x) || !inBox(pt.y)) return points;
  const hit = points.findIndex((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= ATTACH_HIT);
  if (hit >= 0) return points.filter((_, i) => i !== hit);
  if (points.length >= MAX_ATTACH) return points;
  return [...points, { x: snap(pt.x), y: snap(pt.y) }];
}
