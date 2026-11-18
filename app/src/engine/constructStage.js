// constructStage.js — #2327 slice 2, the pure stage mapper: a stage item that is a construct's flat tile becomes its
// pieces. Item list in, item list out; no clock, no store, no GL. The one-writer files call it behind a gate.
//
// The hard gate (the KINEME rule, kept): with the switch off, or with no construct on the stage, the SAME ARRAY comes
// back — same reference, nothing allocated — so today's render is today's, byte for byte.
//
// An item is a mark: `x`,`y` its box centre, `scale` scene pixels per box unit (the box is 100 units), `rotation`
// degrees, y down. A piece is the same kind of mark for one primitive, placed by engine/constructPieces.js so the
// pieces rest exactly where the tile draws them. Each piece inherits everything else from the tile's item (colour,
// accent, alpha, z tier, kineme slot…): the tile was ONE mark, its pieces are that mark taken apart.
import { expandConstructPieces, pieceMark, planConstructPieces } from './constructPieces.js';
import { HIER_GLOBAL_BUDGET } from './hierarchy.js';

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const SQUARE_EPS = 1e-9;

/** The id a piece's item carries: the tile's own key, then the piece, so a take that names the mark names the piece. */
const pieceKey = (key, id) => (key === undefined || key === null ? undefined : `${key}#${id}`);

/**
 * @param items   the stage's finished items (read, never written).
 * @param opts    enabled    the switch (default off: nothing changes)
 *                recordOf   (assetId) => the construct record that tile was baked from, or null for any other asset
 *                budget     the most pieces this frame may deal (the hierarchy's global cap by default)
 *                taken      pieces already spoken for (the creatures' items), counted against the same budget
 * @returns the items, with each planned construct's tile replaced in place by its pieces. The same array when there
 *   is nothing to change.
 */
export function constructPieceItems(
  items,
  { enabled = false, recordOf = null, budget = HIER_GLOBAL_BUDGET, taken = 0 } = {},
) {
  if (!enabled || typeof recordOf !== 'function' || !Array.isArray(items) || !items.length) return items;
  // the constructs on stage, in stage order; a non-square mark (scaleY ≠ scale) is a stretched tile — it stays one
  const found = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it.assetId !== 'string') continue;
    if (!finite(it.x) || !finite(it.y) || !finite(it.scale) || !(it.scale > 0) || !finite(it.rotation ?? 0)) continue;
    if (it.scaleY !== undefined && !(Math.abs(it.scaleY - it.scale) <= SQUARE_EPS * Math.max(1, it.scale))) continue;
    const record = recordOf(it.assetId);
    if (record) found.push({ key: i, record });
  }
  if (!found.length) return items;
  const { pieces: dealt } = planConstructPieces(found, { budget, taken });
  if (!dealt.length) return items;
  const dealtSet = new Set(dealt);
  const recordAt = new Map(found.map((f) => [f.key, f.record]));
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!dealtSet.has(i)) {
      out.push(it);
      continue;
    }
    const place = { centre: { x: it.x, y: it.y }, rot: it.rotation ?? 0, unit: it.scale };
    const { pieces } = expandConstructPieces(recordAt.get(i), place);
    if (!pieces) {
      out.push(it); // a record that will not expand stays its tile
      continue;
    }
    for (const p of pieces) {
      const m = pieceMark(p);
      const next = { ...it, assetId: m.assetId, x: m.x, y: m.y, rotation: m.rotation, scale: m.scale, scaleY: m.scale };
      const k = pieceKey(it.key, p.id);
      if (k !== undefined) next.key = k;
      out.push(next);
    }
  }
  return out;
}
