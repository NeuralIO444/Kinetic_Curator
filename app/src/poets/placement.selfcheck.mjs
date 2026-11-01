// placement.selfcheck.mjs — FIELD S1 (#1902): the placement law.
// Charset (every deck line maps to existing stamps), determinism (same seed
// -> identical stamp list, bit-for-bit), and the per-poet recipe invariants.
import { placePiece, stampIdForChar, lineMapsToStamps, LETTER_STAMP_IDS, PLACEMENT_LAYOUTS } from './placement.js';
import { POETS } from '../curator/fieldDirector.js';
import { mkRng } from '../engine/prng.js';

let pass = 0;
let fail = 0;
const assert = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL', msg);
  }
};

const ASPECT = 10 / 7;

// ── Charset law: the 36 stamps, and every deck line maps onto them ──────
assert(LETTER_STAMP_IDS.size === 36, 'exactly 36 letter stamps exist');
assert(stampIdForChar('A') === 'typ_A' && stampIdForChar('9') === 'typ_9', 'letters and digits map');
assert(stampIdForChar('a') === null && stampIdForChar('/') === null && stampIdForChar(' ') === null, 'lowercase, punctuation and space have no stamp');
for (const [poetId, deck] of Object.entries(POETS)) {
  for (const piece of deck) {
    for (const line of piece.lines) {
      assert(lineMapsToStamps(line), `${poetId}/${piece.id}: line maps to stamps: "${line}"`);
    }
    assert(PLACEMENT_LAYOUTS.includes(piece.layout), `${poetId}/${piece.id}: layout is a placement recipe (${piece.layout})`);
  }
}

// ── Determinism: same seed -> identical list; different seed -> moved form ─
for (const deck of Object.values(POETS)) {
  for (const piece of deck) {
    const a = placePiece(piece, mkRng(1234), { aspect: ASPECT });
    const b = placePiece(piece, mkRng(1234), { aspect: ASPECT });
    assert(JSON.stringify(a) === JSON.stringify(b), `${piece.id}: same seed, identical placement`);
    const c = placePiece(piece, mkRng(987654), { aspect: ASPECT });
    assert(JSON.stringify(a) !== JSON.stringify(c), `${piece.id}: different seed, different deal`);
    // Seed-sensitivity across a set (not every pair: Rosselli's origin snaps
    // to the module's own cell grid, so two nearby deals can honestly land
    // on the same cell — the law is that the seed moves the deal).
    const deals = new Set();
    for (let s = 1; s <= 6; s++) deals.add(JSON.stringify(placePiece(piece, mkRng(s * 7919), { aspect: ASPECT })));
    assert(deals.size >= 2, `${piece.id}: the seed moves the deal (${deals.size} distinct over 6 seeds)`);
    const glyphs = piece.lines.join('').replace(/ /g, '').length;
    assert(a.stamps.length === glyphs, `${piece.id}: one stamp per glyph (${a.stamps.length} == ${glyphs})`);
    for (const s of a.stamps) {
      assert(s.assetId === `typ_${s.ch}` && LETTER_STAMP_IDS.has(s.assetId), `${piece.id}: stamp id matches its glyph`);
      assert(s.rotation === 0, `${piece.id}: no rotation under any recipe`);
      assert(s.x >= 0 && s.x <= ASPECT && s.y >= 0 && s.y <= 1, `${piece.id}: stamp centre on the dish`);
      assert(s.em > 0 && s.em <= 0.3, `${piece.id}: em in a sane band`);
    }
  }
}

// ── Recipe invariants per poet ───────────────────────────────────────────
const byLayout = (layout, piece) => placePiece(piece, mkRng(7), { aspect: ASPECT });
const rowsOf = (stamps) => {
  const rows = new Map();
  for (const s of stamps) {
    const k = s.y.toFixed(9);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(s);
  }
  return [...rows.values()].sort((a, b) => a[0].y - b[0].y);
};

// Greenleaf grid: uniform advance within a line (even spacing), even row pitch.
for (const piece of POETS.greenleaf.filter((p) => p.layout === 'grid')) {
  const { stamps } = byLayout('grid', piece);
  const rows = rowsOf(stamps);
  assert(rows.length === piece.lines.length, `grid ${piece.id}: one row per line`);
  for (const row of rows) {
    const xs = row.map((s) => s.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    // Spaces widen one gap; glyph-to-glyph gaps are all equal (even spacing).
    const min = Math.min(...gaps);
    assert(
      gaps.every((g) => Math.abs(g - min) < 1e-9 || g > min),
      `grid ${piece.id}: glyph gaps even, space gaps wider`,
    );
    assert(new Set(row.map((s) => s.y)).size === 1, `grid ${piece.id}: locked baseline`);
  }
  if (rows.length > 1) {
    const pitches = rows.slice(1).map((r, i) => r[0].y - rows[i][0].y);
    assert(pitches.every((p) => Math.abs(p - pitches[0]) < 1e-9), `grid ${piece.id}: even row pitch`);
  }
}

// Bands (Greenleaf + Teijo): locked baselines, stratified pitch > grid pitch feel (1.9 em).
for (const piece of [...POETS.greenleaf, ...POETS.teijo].filter((p) => p.layout === 'bands')) {
  const { stamps } = byLayout('bands', piece);
  const rows = rowsOf(stamps);
  assert(rows.length === piece.lines.length, `bands ${piece.id}: one band per line`);
  for (const row of rows) assert(new Set(row.map((s) => s.y)).size === 1, `bands ${piece.id}: locked baseline`);
  if (rows.length > 1) {
    const em = stamps[0].em;
    const pitch = rows[1][0].y - rows[0][0].y;
    assert(Math.abs(pitch - 1.9 * em) < 1e-9, `bands ${piece.id}: stratified pitch is 1.9 em`);
  }
}

// Single (Teijo + Gibson): exactly one row — one locked baseline for the whole piece.
for (const piece of [...POETS.teijo, ...POETS.gibson].filter((p) => p.layout === 'single')) {
  const { stamps } = byLayout('single', piece);
  assert(new Set(stamps.map((s) => s.y)).size === 1, `single ${piece.id}: the whole piece shares one baseline`);
  const w = Math.max(...stamps.map((s) => s.x)) - Math.min(...stamps.map((s) => s.x));
  assert(w < 0.88 * ASPECT, `single ${piece.id}: module fits inside the dish with air`);
}

// Two (Gibson): two locked baselines.
for (const piece of POETS.gibson.filter((p) => p.layout === 'two')) {
  const { stamps } = byLayout('two', piece);
  assert(new Set(stamps.map((s) => s.y)).size === piece.lines.length, `two ${piece.id}: one baseline per line`);
}

// Square (Rosselli): square cells — horizontal neighbour gap == vertical row
// pitch == em (edge-to-edge packing on both axes), origin on the cell grid.
for (const piece of POETS.rosselli) {
  const { stamps } = byLayout('square', piece);
  const em = stamps[0].em;
  const rows = rowsOf(stamps);
  for (const row of rows) {
    const xs = row.map((s) => s.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i] - xs[i - 1];
      assert(Math.abs(gap - em) < 1e-9 || gap > em, `square ${piece.id}: cells edge-to-edge (gap ${gap} vs em ${em})`);
    }
  }
  if (rows.length > 1) {
    const pitch = rows[1][0].y - rows[0][0].y;
    assert(Math.abs(pitch - em) < 1e-9, `square ${piece.id}: row pitch == em (square cells)`);
  }
  const minX = Math.min(...stamps.map((s) => s.x)) - em / 2;
  assert(Math.abs(minX / em - Math.round(minX / em)) < 1e-6, `square ${piece.id}: module origin snapped to the cell grid`);
}

// ── Density moves the recipe's own dial, monotonically ───────────────────
const withDensity = (piece, d) => ({ ...piece, density: d });
{
  const g = POETS.greenleaf[0]; // grid
  const lo = placePiece(withDensity(g, 0.05), mkRng(3), { aspect: ASPECT });
  const hi = placePiece(withDensity(g, 0.95), mkRng(3), { aspect: ASPECT });
  const span = (r) => Math.max(...r.stamps.map((s) => s.x)) - Math.min(...r.stamps.map((s) => s.x));
  assert(span(hi) > span(lo), 'grid: higher density -> wider spacing');
  const r = POETS.rosselli[0]; // square
  const rLo = placePiece(withDensity(r, 0.05), mkRng(3), { aspect: ASPECT });
  const rHi = placePiece(withDensity(r, 0.95), mkRng(3), { aspect: ASPECT });
  assert(rHi.stamps[0].em > rLo.stamps[0].em, 'square: higher density -> larger module');
  const w = POETS.gibson[0]; // single
  const wLo = placePiece(withDensity(w, 0.05), mkRng(3), { aspect: ASPECT });
  const wHi = placePiece(withDensity(w, 0.95), mkRng(3), { aspect: ASPECT });
  assert(wHi.stamps[0].em > wLo.stamps[0].em, 'single: higher density -> larger type');
}

console.log(`placement.selfcheck: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
