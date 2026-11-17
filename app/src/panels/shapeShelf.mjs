// shapeShelf.mjs — the SHAPE rung's shelf (docs/design/wetlab-ladder-spec.md §12.6; issue #2280).
//
// What the artist kept on the SHAPE rung: `{ style, asset }` pairs, saved in the project. The CONSTRUCT rung will deal
// from it. Pure: the sanitizer the document reads through and the keep rule the store's door applies. A kept shape is
// NOT turned on for the stage and never enters customAssets here; the shelf is only the rung's memory.
import { shapeKey } from '../deal/shapeAdapter.mjs';

/** The most shapes a shelf holds. A full shelf refuses a keep rather than evicting. */
export const SHAPE_SHELF_CAP = 64;

/** One shelf entry, or null: a real shape of a known style, reduced to its two fields. */
function entry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const e = { style: raw.style, asset: raw.asset };
  return shapeKey(e) ? e : null;
}

/** Any stored value as a shelf: an array of `{ style, asset }`, junk and duplicates dropped, at most the cap. */
export function sanitizeShapeShelf(raw, cap = SHAPE_SHELF_CAP) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const e = entry(r);
    if (!e) continue;
    const k = shapeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Keep one shape. Returns `{ shelf, note }`: the next shelf (the same array when nothing changed) and what happened —
 * `kept`, `already` (it is on the shelf), `shelf-full` (the cap; nothing is evicted) or `nobody` (not a shape).
 * `cap` is for tests: the construct vocabularies hold fewer shapes than SHAPE_SHELF_CAP, so a real shelf never fills.
 */
export function keepShape(shelf, shape, cap = SHAPE_SHELF_CAP) {
  const cur = sanitizeShapeShelf(shelf, cap);
  const e = entry(shape);
  if (!e) return { shelf, note: { key: null, status: 'nobody' } };
  const key = shapeKey(e);
  if (cur.some((s) => shapeKey(s) === key)) return { shelf, note: { key, status: 'already' } };
  if (cur.length >= cap) return { shelf, note: { key, status: 'shelf-full' } };
  return { shelf: [...cur, e], note: { key, status: 'kept' } };
}

/** Drop one shape by its key. The same array when the key is not on the shelf. */
export function dropShape(shelf, key) {
  const cur = Array.isArray(shelf) ? shelf : [];
  const next = cur.filter((s) => shapeKey(s) !== key);
  return next.length === cur.length ? shelf : next;
}
