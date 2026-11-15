// inkPaint.js — #2104 Q2 (second half): the paint-structure census of the
// asset library — the classification the ink ruling stands on.
//
// The ruling (Matt, 2026-11-13): while a world stands, the drawn line work
// draws in the standing world's ink; when no world stands, line work draws
// exactly as it does today. The classification rulings that followed
// (Matt, 2026-11-14, Q1–Q3) made the test paint-structural and per-asset:
// a unit takes the ink iff its ink slot — the SVG's var(--ink) painting —
// is painted by STROKES ONLY.
//   Q1 — an asset mixing ink-slot strokes and fills keeps its dealt colour
//        whole (the dial's hub dot, the network drawings' node dots).
//   Q2 — mic_specbar_h/v (five filled bars, zero strokes) are not lines.
//   Q3 — accent-slot strokes are not the ink's business; this census never
//        reads the accent slot at all, and no consumer touches the accent
//        channel.
// The poem's letters are safe by construction: every letterform and stamp
// face in the library paints its ink slot with fills only (the census
// selfcheck pins it), so no letter can ever classify as line work.
//
// Computed from the authored SVG strings, once, at module load — a stated
// rule over library data, the way deriveLineInk is a stated rule over
// palette data. Never a category or trait proxy (the survey, issue #2104,
// shows both break). An id the library does not carry (a custom asset)
// answers NONE: it keeps its dealt colour, fail-closed.
//
// Browser-safe, pure.
import { ASSETS } from './assets/index.js';

export const INK_PAINT_STROKE = 'stroke';
export const INK_PAINT_FILL = 'fill';
export const INK_PAINT_MIXED = 'mixed';
export const INK_PAINT_NONE = 'none';

const INK_STROKE = /stroke="var\(--ink\)"/g;
const INK_FILL = /fill="var\(--ink\)"/g;

/** The paint structure of one SVG's ink slot: 'stroke' | 'fill' | 'mixed' | 'none'. */
export function inkPaintStructure(svg) {
  const s = typeof svg === 'string' ? svg : '';
  const strokes = (s.match(INK_STROKE) || []).length;
  const fills = (s.match(INK_FILL) || []).length;
  if (strokes > 0 && fills === 0) return INK_PAINT_STROKE;
  if (fills > 0 && strokes === 0) return INK_PAINT_FILL;
  if (strokes > 0 && fills > 0) return INK_PAINT_MIXED;
  return INK_PAINT_NONE;
}

const STRUCTURE = new Map();
const census = { stroke: 0, fill: 0, mixed: 0, none: 0 };
for (const a of ASSETS) {
  const st = inkPaintStructure(a.svg);
  STRUCTURE.set(a.id, st);
  census[st] += 1;
}

/**
 * The library census, pinned by inkPaint.selfcheck.mjs (on this head:
 * 985 assets — 107 stroke-only, 813 fill-only, 46 mixed, 19 no ink slot).
 */
export const INK_PAINT_CENSUS = Object.freeze({ total: ASSETS.length, ...census });

/** The paint structure of a library asset's ink slot; unknown ids answer 'none'. */
export const inkPaintOf = (assetId) => STRUCTURE.get(assetId) ?? INK_PAINT_NONE;

/** The ink ruling's predicate: this asset's line work takes a standing world's ink. */
export const isStrokeOnlyInkAsset = (assetId) => inkPaintOf(assetId) === INK_PAINT_STROKE;
