// poets/doctrineLayout.js — the doctrines on LAYOUT: type layout and page layout at the render seam
// (Persona Kernel P6, #2386; spec docs/design/persona-kernel-spec.md §0 R7/R8, §4, §6).
//
// BLAST, HYBRID and SWISS GRIT each propose ONE layout move per call, in their own design language, as a NAMED axis
// in the form's treatment record (`typeset: 1` or `page: 1`, optionally `hand: 1|-1`) — never ambient, never mutated
// per frame, the `rayGunForm` pattern: decision -> record -> a pure function at draw. An older record, every
// performer's tap and every doctrine call made with the switch off name none of them, and the stage draws exactly
// as it always did.
//
// R7 scope — typography and layout only: the type itself, the layout of the type, the page layout of the stage (where
// the block sits in the frame). This module takes a poem's STAMP LIST and moves stamps; it has no notion of a creature,
// a beast, a body or a gait, and imports none (the selfcheck pins that). Plates are never treated, so never moved.
//
//   TYPE LAYOUT (`typeset`)          PAGE LAYOUT (`page`)
//   BLAST        slam    the block set on a hot diagonal — the whole      bleed   the block shoved toward a frame
//                        form tilts about its own centre, capped          edge/corner so it crops at the margin
//   HYBRID       stair   rows cascade down the block in even digital      drift   the block slides along the
//                        steps, row by row (a window cascade)             diagonal and lands on the coarse pixel grid
//   SWISS GRIT   indent  rows step in on a 12-column grid, whole          column  the block's edge set on a column
//                        columns at a time, the anchor row on the margin  line and its top on the baseline unit
//
// What a move may not break (the exception's floor, kept from rayGunForm): every stamp keeps its `ch`, `assetId`,
// `em` and everything else it carries; the count is unchanged; every centre stays on the dish; each move is a RIGID
// transform of the block (slam, bleed, drift, column) or of a whole row (stair, indent), so a word's glyphs keep their
// reading order and their spacing exactly. A move that cannot fit on the dish at its drawn amount tries half, a
// quarter, then nothing: it never clips, never overlaps what it did not, never leaves the dish.
//
// Every number below is a design constant of the move (like rayGunForm's own CARSON_* / GREIMAN_* / GRIT_*), measured
// in the dish's unit space (height = 1, width = aspect). A move is a SMALL capped step: no move shifts the block more
// than its cap, and none rotates more than SLAM_DEG. The band's unruled tuning numbers are not read here (they stay
// null); where the band is on, its verdict reaches this file only as the record's `hand` (see curator/doctrineLayout.mjs).
//
// Pure: no store, no bus, no clock, no Math.random. Same record, same form: same stamps.
//
// Cost (governor): CPU geometry at the draw, once per form draw — registered below as tier 0 (structural, never shed):
// a doctrine's layout never snaps plain mid-performance, and it costs no pass, no texture and no draw call.

import { mkRng } from '../engine/prng.js';
import { registerCostTier } from '../engine/kernel/costRegistry.mjs';
import { stampWidthEm, stampInkBox } from './placement.js';

registerCostTier('poets/doctrine-layout', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0,
  notes:
    '#2386 P6 doctrine layout: one rigid shift/tilt of a poem’s stamp list at the form draw (O(stamps), a few dozen ' +
    'multiplies, ≤ 200 stamps). No GL pass, texture or draw call; structural, never shed (a layout move never snaps plain ' +
    'mid-performance). Off (no axis named) is the old path bit for bit.',
});

/** The doctrines that have a layout move, with the move each plays on each axis (names are code ids, never surfaces). */
export const LAYOUT_MOVES = Object.freeze({
  carson: Object.freeze({ typeset: 'slam', page: 'bleed' }),
  greiman: Object.freeze({ typeset: 'stair', page: 'drift' }),
  ashworth: Object.freeze({ typeset: 'indent', page: 'column' }),
});

/** The two record axes, in the order they are applied (the type is set, then the block is placed on the page). */
export const LAYOUT_AXES = Object.freeze(['typeset', 'page']);

/** The treatment mode(s) each doctrine's call arms — the layout reads only a record whose mode is its own doctrine's. */
const DOCTRINE_OF_MODE = Object.freeze({ carson: 'carson', shot: 'carson', greiman: 'greiman', grit: 'ashworth' });

// ── the moves' constants (design constants, unit dish space; height = 1, width = aspect) ────────────────────
export const SLAM_DEG = 9; // BLAST type: the most the block tilts (full draw), degrees
export const BLEED_CAP = 0.14; // BLAST page: the most the block is shoved toward a frame edge, per axis
export const BLEED_EDGE = 0.02; // BLAST page: a bled block's outermost centre stops this far from the frame edge
export const STAIR_STEP_EM = 0.5; // HYBRID type: one row's step, in the form's median em
export const STAIR_CAP = 0.15; // HYBRID type: the most the last row sits from the first, in total
export const DRIFT_STEP = 0.1; // HYBRID page: the block's slide along the diagonal (full draw)
export const DRIFT_GRID = 0.05; // HYBRID page: the coarse pixel grid the block lands on (the float's own bitmap-nod grid)
export const GRID_COLUMNS = 12; // SWISS GRIT: the column grid (the baseline unit is the same 1/12 of the height)
export const INDENT_MAX_COLS = 2; // SWISS GRIT type: the deepest indent, in whole columns
export const COLUMN_CAP = 0.12; // SWISS GRIT page: the most the block is set toward a column line
export const COLUMN_LINES = 3; // SWISS GRIT page: the block's edge lands on column line 1..3

const TYPE_SALT = 0x4c595453; // 'LYTS'
const PAGE_SALT = 0x4c595047; // 'LYPG'
const MOVE_SALT = 0x4c594d56; // 'LYMV'
const HAND_SALT = 0x4c594844; // 'LYHD'
const EPS = 1e-9;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// a hash finalizer, not the engine's xorshift: a xorshift stream's FIRST output barely moves across nearby seeds
function hashU01(seed, salt) {
  const s = Number.isInteger(seed) && seed >= 0 ? seed >>> 0 : 0;
  let h = (s ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0x100000000;
}

/** The axis a doctrine call at `seed` names: 'typeset' or 'page'. A pure function of the record's own seed. */
export function layoutMove(seed) {
  return hashU01(seed, MOVE_SALT) < 0.5 ? 'typeset' : 'page';
}

/** The handedness a seed draws when nothing answers a call: +1 or -1. */
export const seedHand = (seed) => (hashU01(seed, HAND_SALT) < 0.5 ? 1 : -1);

/** A record's handedness: the `hand` it names (an answered call), else the one its seed draws. */
export function layoutHandOf(record) {
  if (record && (record.hand === 1 || record.hand === -1)) return record.hand;
  return seedHand(record && record.seed);
}

/** Does this record name a layout axis at all? (Cheap gate: false for every older record and every tap.) */
export const hasLayout = (record) => !!record && typeof record === 'object' && (record.typeset === 1 || record.page === 1);

/**
 * The doctrine whose layout this record plays, or null: the record must name the doctrine that armed it AND that
 * doctrine must be the one whose mode the record is at — a performer's tap (no doctrine) and a mismatch play nothing.
 */
export function layoutDoctrineOf(record) {
  if (!hasLayout(record)) return null;
  const id = DOCTRINE_OF_MODE[record.mode];
  return id && record.doctrine === id ? id : null;
}

/**
 * The layout moves a standing record is playing, read off the record (the stage's own measure — what the horn strip
 * may show): `{ typeset, page }`. Null when the record plays no doctrine layout.
 */
export function layoutSignals(record) {
  if (!layoutDoctrineOf(record)) return null;
  return Object.freeze({ typeset: record.typeset === 1, page: record.page === 1 });
}

// ── geometry helpers ───────────────────────────────────────────────────────────────────────────────────────
// A stamp's drawn ink half-extent, in dish units, on the ink the stage actually draws (placement.stampInkBox, in the
// 100-unit cell, one cell unit drawing 2.27/80 em — rayGunForm's GRIT_INK_EM_PER_UNIT); a stamp with no ink box falls
// back to its placement ruler. BLAST may crop (its moves are measured on centres, the door's own bound); HYBRID and
// SWISS GRIT keep their INK on the dish — their words stay whole.
const INK_EM_PER_UNIT = 2.27 / 80;
const INK_SLACK = 1.1; // a rotated glyph reaches a little past its upright box
const inkHalfW = (s) => {
  const box = stampInkBox(s.assetId);
  const w = box ? box.w * INK_EM_PER_UNIT : stampWidthEm(s.assetId, s.ch);
  return (w * s.em * INK_SLACK) / 2;
};
const inkHalfH = (s) => {
  const box = stampInkBox(s.assetId);
  return ((box ? box.h * INK_EM_PER_UNIT : 2.27) * s.em * INK_SLACK) / 2;
};

function extent(stamps, ink = false) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of stamps) {
    const hx = ink ? inkHalfW(s) : 0;
    const hy = ink ? inkHalfH(s) : 0;
    if (s.x - hx < minX) minX = s.x - hx;
    if (s.x + hx > maxX) maxX = s.x + hx;
    if (s.y - hy < minY) minY = s.y - hy;
    if (s.y + hy > maxY) maxY = s.y + hy;
  }
  return { minX, maxX, minY, maxY };
}

const onDish = (s, aspect, ink = false) => {
  const hx = ink ? inkHalfW(s) : 0;
  const hy = ink ? inkHalfH(s) : 0;
  return s.x - hx >= -EPS && s.x + hx <= aspect + EPS && s.y - hy >= -EPS && s.y + hy <= 1 + EPS;
};

/** Move every stamp by (dx, dy), absorbing float dust at the dish edge. */
const shift = (stamps, dx, dy, aspect) =>
  stamps.map((s) => ({ ...s, x: clamp(s.x + dx, 0, aspect), y: clamp(s.y + dy, 0, 1) }));

/**
 * The translation range along one axis that keeps the block's extent [min, max] on [lo, hi] — widened to include 0, so
 * a block already outside is never pulled in by a move that did not ask to. A block wider than the span gets [0, 0].
 */
function room(min, max, lo, hi) {
  const a = lo - min;
  const b = hi - max;
  if (a > b + EPS && a > 0 && b < 0) return [0, 0];
  return [Math.min(0, a), Math.max(0, b)];
}

/** Nudge a block back onto the dish by the smallest rigid shift, or null when it is larger than the dish. */
function fitOnDish(stamps, aspect) {
  const b = extent(stamps);
  if (b.maxX - b.minX > aspect + EPS || b.maxY - b.minY > 1 + EPS) return null;
  const dx = b.minX < 0 ? -b.minX : b.maxX > aspect ? aspect - b.maxX : 0;
  const dy = b.minY < 0 ? -b.minY : b.maxY > 1 ? 1 - b.maxY : 0;
  const out = dx || dy ? shift(stamps, dx, dy, aspect) : stamps;
  return out.every((s) => onDish(s, aspect)) ? out : null;
}

/** Which plain row each stamp belongs to: plain stamps by their row's words, ghosts by the nearest plain baseline. */
function rowIndexOf(stamps, n, rows) {
  const byPlain = new Map();
  rows.forEach((row, k) => row.words.forEach((w) => w.forEach((idx) => byPlain.set(idx, k))));
  return stamps.map((s, i) => {
    if (i < n && byPlain.has(i)) return byPlain.get(i);
    let best = 0;
    for (let k = 1; k < rows.length; k++) if (Math.abs(rows[k].y - s.y) < Math.abs(rows[best].y - s.y)) best = k;
    return best;
  });
}

const medianEm = (stamps) => {
  const ems = stamps.map((s) => s.em).sort((a, b) => a - b);
  return ems[Math.floor(ems.length / 2)];
};

// ── BLAST ─────────────────────────────────────────────────────────────────────────────────────────────────
// SLAM (type layout): the whole block set on a hot diagonal — tilted about its own centre by up to SLAM_DEG. Every
// stamp's position turns with it and its own rotation takes the same angle, so the form is one rigid piece, set at an
// angle: words keep their order and spacing. A tilt that does not fit the dish halves, quarters, then stands down.
function slam(stamps, { hand, aspect }, rng) {
  const deg = hand * SLAM_DEG * (0.5 + 0.5 * rng());
  const b = extent(stamps);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  for (let k = 0; k < 3; k++) {
    const th = deg / 2 ** k;
    const r = (th * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const turned = stamps.map((st) => {
      const dx = st.x - cx;
      const dy = st.y - cy;
      return { ...st, x: cx + c * dx - s * dy, y: cy + s * dx + c * dy, rotation: st.rotation + th };
    });
    const fit = fitOnDish(turned, aspect);
    if (fit) return fit;
  }
  return stamps;
}

// BLEED (page layout, measured on centres — BLAST may crop): the block is shoved toward a frame edge and corner — one side per axis — so it crops at the
// margin the way a hot layout does. At most BLEED_CAP per axis, only toward the chosen side, and the outermost centre
// stops BLEED_EDGE short of the edge (centres stay on the dish; the glyph's ink may cross — the crop).
function bleed(stamps, { hand, aspect }, rng) {
  const vertical = rng() < 0.5 ? -1 : 1;
  const b = extent(stamps);
  const wantX = hand > 0 ? aspect - BLEED_EDGE - b.maxX : BLEED_EDGE - b.minX;
  const wantY = vertical > 0 ? 1 - BLEED_EDGE - b.maxY : BLEED_EDGE - b.minY;
  const dx = hand > 0 ? clamp(wantX, 0, BLEED_CAP) : clamp(wantX, -BLEED_CAP, 0);
  const dy = vertical > 0 ? clamp(wantY, 0, BLEED_CAP) : clamp(wantY, -BLEED_CAP, 0);
  const [rx0, rx1] = room(b.minX, b.maxX, 0, aspect);
  const [ry0, ry1] = room(b.minY, b.maxY, 0, 1);
  return shift(stamps, clamp(dx, rx0, rx1), clamp(dy, ry0, ry1), aspect);
}

// ── HYBRID ────────────────────────────────────────────────────────────────────────────────────────────────
// STAIR (type layout): the rows cascade — row k sits k even steps along the line from the first row, like windows
// stacked on a desktop. Each row moves rigidly (its words keep order and spacing); the first row never moves; the
// step is a share of the median em, and the whole cascade is capped at STAIR_CAP. A cascade that does not fit halves,
// quarters, then stands down.
function stair(stamps, { hand, aspect, n, rows }, rng) {
  if (rows.length < 2) return stamps;
  const frac = 0.5 + 0.5 * rng();
  const step = Math.min(STAIR_STEP_EM * medianEm(stamps), STAIR_CAP / (rows.length - 1)) * frac;
  const rowOf = rowIndexOf(stamps, n, rows);
  for (let k = 0; k < 3; k++) {
    const f = 1 / 2 ** k;
    const out = stamps.map((s, i) => ({ ...s, x: s.x + hand * rowOf[i] * step * f }));
    // ink stays on the dish; a glyph whose ink was already past the edge may not get worse (its centre stays on)
    const fits = out.every((s, i) => onDish(s, aspect, true) || (!onDish(stamps[i], aspect, true) && onDish(s, aspect)));
    if (fits) return out.map((s) => ({ ...s, x: clamp(s.x, 0, aspect) }));
  }
  return stamps;
}

// DRIFT (page layout): the block slides along the diagonal by up to DRIFT_STEP and its top-left lands on the coarse
// pixel grid (DRIFT_GRID — the float's own bitmap-nod lattice), so the whole block sits on the digital grid.
function drift(stamps, { hand, aspect }, rng) {
  const frac = 0.5 + 0.5 * rng();
  const b = extent(stamps, true);
  const snap = (v) => Math.round(v / DRIFT_GRID) * DRIFT_GRID;
  const dx = snap(b.minX + hand * DRIFT_STEP * frac) - b.minX;
  const dy = snap(b.minY + hand * DRIFT_STEP * 0.6 * frac) - b.minY;
  const [rx0, rx1] = room(b.minX, b.maxX, 0, aspect);
  const [ry0, ry1] = room(b.minY, b.maxY, 0, 1);
  return shift(stamps, clamp(dx, rx0, rx1), clamp(dy, ry0, ry1), aspect);
}

// ── SWISS GRIT ────────────────────────────────────────────────────────────────────────────────────────────
// INDENT (type layout): each row after the first steps in by whole columns of a 12-column grid (0..INDENT_MAX_COLS),
// the anchor row staying on the margin; hand +1 steps the indents in down the block, hand -1 steps them back out.
// Rows move rigidly. A row whose indent does not fit the dish gives up columns one at a time.
function indent(stamps, { hand, aspect, n, rows }, rng) {
  if (rows.length < 2) return stamps;
  const col = aspect / GRID_COLUMNS;
  const drawn = rows.slice(1).map(() => Math.floor(rng() * (INDENT_MAX_COLS + 1)));
  drawn.sort((a, b) => (hand > 0 ? a - b : b - a));
  const cols = [0, ...drawn];
  const rowOf = rowIndexOf(stamps, n, rows);
  const rowMax = rows.map(() => -Infinity);
  stamps.forEach((s, i) => {
    if (s.x + inkHalfW(s) > rowMax[rowOf[i]]) rowMax[rowOf[i]] = s.x + inkHalfW(s);
  });
  const dxOf = cols.map((c, k) => {
    let cc = c;
    while (cc > 0 && rowMax[k] + cc * col > aspect) cc -= 1;
    return cc * col;
  });
  return stamps.map((s, i) => (dxOf[rowOf[i]] ? { ...s, x: clamp(s.x + dxOf[rowOf[i]], 0, aspect) } : s));
}

// COLUMN (page layout): the block's near edge is set on a column line of the 12-column grid (line 1..3, from the left
// for hand +1, from the right for hand -1) and its top on the baseline unit (1/12 of the height) — at most COLUMN_CAP
// across and half a unit down.
function column(stamps, { hand, aspect }, rng) {
  const line = 1 + Math.floor(rng() * COLUMN_LINES);
  const col = aspect / GRID_COLUMNS;
  const b = extent(stamps, true);
  const wantX = hand > 0 ? line * col - b.minX : aspect - line * col - b.maxX;
  const unit = 1 / GRID_COLUMNS;
  const wantY = Math.round(b.minY / unit) * unit - b.minY;
  const [rx0, rx1] = room(b.minX, b.maxX, 0, aspect);
  const [ry0, ry1] = room(b.minY, b.maxY, 0, 1);
  return shift(
    stamps,
    clamp(clamp(wantX, -COLUMN_CAP, COLUMN_CAP), rx0, rx1),
    clamp(clamp(wantY, -unit / 2, unit / 2), ry0, ry1),
    aspect,
  );
}

const MOVE_FN = Object.freeze({ slam, stair, indent, bleed, drift, column });

/**
 * Apply a treatment record's layout axes to the treated stamp list. Called by `rayGunForm` as its LAST step, so a
 * layout move sits on top of the doctrine's own treatment. Returns `stamps` itself (the same array) when the record
 * names no layout, is not a doctrine's, or the form is empty — the unarmed path is the old path, byte for byte.
 *
 * @param stamps  the treated stamps (plain stamps first, ghosts after)
 * @param ctx     { n: the plain stamp count, rows: the plain form's rows (segmentWords), aspect }
 * @param record  the form's treatment record ({ mode, seed, doctrine, typeset?, page?, hand? })
 */
export function doctrineLayout(stamps, { n, rows, aspect }, record) {
  const id = layoutDoctrineOf(record);
  if (!id || !Array.isArray(stamps) || stamps.length === 0 || !Array.isArray(rows) || rows.length === 0) return stamps;
  const hand = layoutHandOf(record);
  const seed = record.seed;
  let out = stamps;
  const ctx = { hand, aspect, n, rows };
  if (record.typeset === 1) out = MOVE_FN[LAYOUT_MOVES[id].typeset](out, ctx, mkRng((seed ^ TYPE_SALT) >>> 0));
  if (record.page === 1) out = MOVE_FN[LAYOUT_MOVES[id].page](out, ctx, mkRng((seed ^ PAGE_SALT) >>> 0));
  return out;
}
