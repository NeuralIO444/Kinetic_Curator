// engine/assetAttach.js — #1355 Phase 3: ATTACH points, set on an asset in the wet lab.
//
// An attach point says WHERE ON THE SHAPE another part may join (where a wing meets the body). It belongs to the
// asset, so every copy in the dish carries it, and it rides the project document. This is not the canvas PIN
// (curator/dishPins.js), which says where in the dish a creature may grow.
//
// Points are in the asset's own box, 0..100 on both axes (the viewBox every asset is drawn in). At most MAX_ATTACH.
//
// #1634 slice 1: a point may carry a ROLE — 'H' (the head) or 'L' (where a limb may grow) — the artist's markers
// for the creature families (Matt, 2026-10-16: markers choose where; dish pressure decides whether and how much).
// One head per asset: a second H is just a point. Unmarked points are plain attach points, as before.

export const MAX_ATTACH = 4;
export const ATTACH_BOX = 100;
/** A click this close to a point (box units) steps its role instead of adding a point. */
export const ATTACH_HIT = 6;

const inBox = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= ATTACH_BOX;
// Two decimals is finer than a click can aim, and keeps the saved file short and stable.
const snap = (n) => Math.round(n * 100) / 100;
const ROLES = new Set(['H', 'L']);

/** One asset's points: well-formed, inside the box, at most MAX_ATTACH, roles valid, at most one H. */
export function sanitizeAttachPoints(points) {
  if (!Array.isArray(points)) return [];
  let headSeen = false;
  return points
    .filter((p) => p && inBox(p.x) && inBox(p.y))
    .slice(0, MAX_ATTACH)
    .map((p) => {
      const pt = { x: snap(p.x), y: snap(p.y) };
      if (ROLES.has(p.role)) {
        if (p.role === 'H') {
          if (headSeen) return pt; // one head per asset: a later H is just a point
          headSeen = true;
        }
        pt.role = p.role;
      }
      return pt;
    });
}

/**
 * The whole map { assetId: points }: only the assets the artist edited by hand. An entry may be an EMPTY list: that
 * is the artist saying "no points on this one", which is different from an asset with no entry (it uses the points
 * worked out from its shape, engine/autoAttach.js). Returns null when nothing is set, so an untouched project
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
 * A click in the wet lab (#1634, gesture ruled by Matt 2026-10-18: tap cycles plain → H → L → gone). On (or
 * near) an existing point it steps that point's role: plain becomes H, H becomes L, L is removed. Stepping a
 * point to H steps any other H back to plain — one head per asset. Elsewhere the click adds a plain point.
 * At the limit a new click adds nothing: the artist steps a point out first, so none is ever moved by surprise.
 * A click that changes nothing returns the same array (the store skips the write).
 */
export function clickAttach(points, pt) {
  if (!pt || !inBox(pt.x) || !inBox(pt.y)) return points;
  const hit = points.findIndex((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= ATTACH_HIT);
  if (hit >= 0) {
    const cur = points[hit];
    if (cur.role === 'L') return points.filter((_, i) => i !== hit); // L → gone
    if (cur.role === 'H') {
      return points.map((p, i) => (i === hit ? { x: snap(p.x), y: snap(p.y), role: 'L' } : p)); // H → L
    }
    // plain → H: any other H steps back to plain (one head per asset)
    return points.map((p, i) => {
      if (i === hit) return { x: snap(p.x), y: snap(p.y), role: 'H' };
      if (p.role === 'H') return { x: snap(p.x), y: snap(p.y) };
      return p;
    });
  }
  if (points.length >= MAX_ATTACH) return points;
  return [...points, { x: snap(pt.x), y: snap(pt.y) }];
}
