// rayGunGrit.selfcheck.mjs — #2010 (RAY GUN P2 · SWISS GRIT): the Ashworth mode.
//
// Pins (docs/design/raygun-headroom-2026-11-06.md §1b A1/A2/A5, §10 P2):
//   A  the seat: 'grit' is a ray-gun mode, cycled between greiman and shot; the door carries it
//   B  the Swiss base (A1), set against the DRAWN ink: one size, straight; proportional kerning — within a word every
//      ink-to-ink gap is one even track (never touching), across words one wider word space; one leading that
//      clears the drawn cap; the size floor (never under 1.5× the door's legibility floor unless the deal was)
//   C  word recoverability on its own setting: reading order kept in every row
//   D  the ruled violations: every move is exactly one baseline unit (leading / 5 or 6); the anchor (first line's
//      first word) never moves; a dropped band lands; one letter row of three or more is overprinted — offset one
//      unit right and down — onto a neighbour, never onto the first line; a plate-break ornament stays furniture
//   E  A2 no house template: drawn per record, deterministic per seed
//   F  A5 systematic grit: under the wear axis every letter is xeroxed, none torn; the geometry is untouched
//   G  the drawn scale: GRIT_INK_EM_PER_UNIT is what the renderer actually draws (a glyph rendered and measured)
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import { RAYGUN_MODES, rayGunForm, GRIT_INK_EM_PER_UNIT } from './rayGunForm.js';
import { fieldFormForDeal, sanitizeFieldForm } from './fieldForm.js';
import { WEAR_SOURCE_BY_ID, wearStampIdFor, stampWidthEm, stampInkBox, ORNAMENT_STAMP_IDS } from './placement.js';
import { ASSETS } from '../data/assets/index.js';
import { mkRng } from '../engine/prng.js';
import { CORPUS } from '../gl/parity/corpus.mjs';
import { renderSvg } from '../../../studio/render.mjs';
import { RESVG_FONT } from '../assets/resvgFont.mjs';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('rayGunGrit.selfcheck');

const BY_ID = new Map(ASSETS.map((a) => [a.id, a]));
const ORN = [...ORNAMENT_STAMP_IDS][0];
const base = fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(5));
/** The form's rows laid end to end `times` times on one baseline, a placement word space between runs. */
function longLine(f, times, aspect) {
  const ys = [...new Set(f.stamps.map((t) => t.y))].sort((a, b) => a - b);
  const out = [];
  let x = 0;
  for (let n = 0; n < times; n++)
    for (const y of ys) {
      const row = f.stamps.filter((t) => t.y === y).sort((a, b) => a.x - b.x);
      const dx = x - row[0].x;
      for (const t of row) out.push({ ...t, x: t.x + dx, y: 0.5 });
      x = out[out.length - 1].x + 1.2 * row[0].em;
    }
  const scale = (0.9 * aspect) / x;
  return { ...f, aspect, stamps: out.map((t) => ({ ...t, x: 0.05 * aspect + t.x * scale * 0.95, em: t.em })) };
}
const forms = [
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't4' }, mkRng(1)), // three rows
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't1' }, mkRng(1)), // three rows
  base, // two rows
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g2', face: 'serif' }, mkRng(7)),
  fieldFormForDeal({ poetId: 'rosselli', pieceId: 'r1' }, mkRng(11)),
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't1', script: 'kana' }, mkRng(42)),
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1', plateBreak: ORN }, mkRng(5)), // plate break: an ornament row
  // one line (a single-row poem: the violations still land, off the anchor word)
  { ...base, stamps: base.stamps.map((s) => ({ ...s, y: base.stamps[0].y })) },
  // a long single row at a narrow aspect (the poem's own rows, twice, end to end with real word spaces): the fit
  // closes the air, then breaks the line at word breaks — it never shrinks under the floor
  longLine(base, 4, 0.6),
].filter(Boolean);
assert.ok(forms.length >= 8, 'fixtures deal');
assert.ok(forms[6].stamps.some((s) => s.assetId === ORN), 'fixture: a plate break stands');
const SEEDS = Array.from({ length: 24 }, (_, i) => 1 + i * 7919);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const CAP_EM = 80 * GRIT_INK_EM_PER_UNIT;
const ink = (s) => stampInkBox(s.assetId).w * GRIT_INK_EM_PER_UNIT * s.em;
const isOrn = (s) => ORNAMENT_STAMP_IDS.has(s.assetId);

/** The plain form's rows (same y = same row), each in reading order, with its word breaks (placement's own). */
function plainRows(plain) {
  const ys = [...new Set(plain.stamps.map((s) => s.y))].sort((a, b) => a - b);
  const even = plain.layout === 'grid' || plain.layout === 'square';
  return ys.map((y) => {
    const row = plain.stamps
      .map((s, i) => i)
      .filter((i) => plain.stamps[i].y === y)
      .sort((a, b) => plain.stamps[a].x - plain.stamps[b].x || a - b);
    let pitch = Infinity;
    for (let k = 1; k < row.length; k++) {
      const dx = plain.stamps[row[k]].x - plain.stamps[row[k - 1]].x;
      if (dx > 0) pitch = Math.min(pitch, dx);
    }
    const half = (t) => (stampWidthEm(t.assetId, t.ch) * t.em) / 2;
    const breaks = [];
    for (let k = 1; k < row.length; k++) {
      const a = plain.stamps[row[k - 1]];
      const b = plain.stamps[row[k]];
      breaks.push(even ? b.x - a.x > 1.5 * pitch : b.x - a.x - half(a) - half(b) > 0.35 * a.em);
    }
    return { row, breaks, orn: row.length === 1 && isOrn(plain.stamps[row[0]]) };
  });
}

/**
 * The treated form's rows: the plain reading order, split where a plain row ends or where the setting broke a long
 * line (the next glyph steps back left). Breaks inside a row are the poem's own word breaks.
 */
function treatedRows(plain, t) {
  const out = [];
  for (const pr of plainRows(plain)) {
    let cur = { row: [pr.row[0]], breaks: [], orn: pr.orn };
    for (let k = 1; k < pr.row.length; k++) {
      const i = pr.row[k];
      if (t.stamps[i].x < t.stamps[pr.row[k - 1]].x) {
        assert.ok(pr.breaks[k - 1], 'a line is only ever broken at a word break');
        out.push(cur);
        cur = { row: [i], breaks: [], orn: false };
      } else {
        cur.row.push(i);
        cur.breaks.push(pr.breaks[k - 1]);
      }
    }
    out.push(cur);
  }
  return out;
}

/** Indices of the anchor (the first row's first word). */
function anchorSet(rows) {
  const r = rows.find((x) => !x.orn);
  const set = new Set([r.row[0]]);
  for (let k = 0; k < r.breaks.length && !r.breaks[k]; k++) set.add(r.row[k + 1]);
  return set;
}

/** Read a treated grit form back: body, ghosts, rows, the leading and unit (null for a one-row form), baselines. */
function readGrid(plain, treated) {
  const n = plain.stamps.length;
  const body = treated.stamps.slice(0, n);
  const ghosts = treated.stamps.slice(n);
  const rows = treatedRows(plain, treated);
  const em = body[0].em;
  const anchor = anchorSet(rows);
  const first = rows.findIndex((r) => !r.orn);
  const b0 = body[[...anchor][0]].y;
  if (rows.length === 1) return { body, ghosts, rows, em, lead: null, unit: null, b0, first, anchor };
  // score a candidate (leading, unit): -1 if any glyph disagrees, else the number of glyphs on their baseline
  const tryFit = (L, U) => {
    let on = 0;
    for (let r = 0; r < rows.length; r++) {
      const br = b0 + (r - first) * L;
      for (const i of rows[r].row) {
        const dy = body[i].y - br;
        if (near(dy, 0, 1e-7)) on++;
        else if (rows[r].orn || anchor.has(i) || !near(Math.abs(dy), U, 1e-7)) return -1;
      }
    }
    return on;
  };
  const r1 = rows[first + 1] ? first + 1 : first - 1;
  let best = null;
  for (const i of rows[r1].row)
    for (const units of [5, 6])
      for (const sgn of [0, 1, -1]) {
        const L = (body[i].y - b0) / (r1 - first) / (1 + sgn / units / (r1 - first));
        const score = L > 0 ? tryFit(L, L / units) : -1;
        if (score >= 0 && (!best || score > best.score)) best = { score, L, U: L / units };
      }
  if (best) return { body, ghosts, rows, em, lead: best.L, unit: best.U, b0, first, anchor };
  assert.fail('one leading and one unit explain every glyph');
}

// ── A · the seat ────────────────────────────────────────────────────────
ok('A1 grit is a ray-gun mode, seated between greiman and shot; the door carries it', () => {
  assert.deepStrictEqual(RAYGUN_MODES, ['carson', 'greiman', 'grit', 'shot']);
  const f = forms[0];
  assert.deepStrictEqual(sanitizeFieldForm({ ...f, raygun: { mode: 'grit', seed: 3, wear: 1 } }).raygun, {
    mode: 'grit',
    seed: 3,
    wear: 1,
  });
  assert.equal(sanitizeFieldForm({ ...f, raygun: { mode: 'ashworth', seed: 3 } }), null, 'only the named mode');
});

// ── B · the Swiss base, against the drawn ink ───────────────────────────
ok('B1 one size, straight, proportional kerning on one even track, a wider word space, never touching', () => {
  let rowsChecked = 0;
  for (const plain of forms)
    for (const seed of SEEDS) {
      const t = rayGunForm(plain, { mode: 'grit', seed });
      assert.ok(t.stamps.length <= 200);
      for (const s of t.stamps) {
        assert.equal(s.em, t.stamps[0].em, 'one size');
        assert.equal(s.rotation, 0, 'straight');
        assert.ok(s.x >= 0 && s.x <= plain.aspect && s.y >= 0 && s.y <= 1, 'centres on the dish');
      }
      for (const { row, breaks, orn } of treatedRows(plain, t)) {
        if (orn) continue;
        const tracks = [];
        const spaces = [];
        for (let k = 1; k < row.length; k++) {
          const a = t.stamps[row[k - 1]];
          const b = t.stamps[row[k]];
          (breaks[k - 1] ? spaces : tracks).push(b.x - ink(b) / 2 - (a.x + ink(a) / 2));
        }
        for (const g of tracks) assert.ok(near(g, tracks[0], 1e-9) && g > 0, 'one even track, ink never touching');
        for (const g of spaces) assert.ok(near(g, spaces[0], 1e-9), 'one word space');
        if (tracks.length && spaces.length) assert.ok(spaces[0] > tracks[0], 'the word space is wider than the track');
        rowsChecked++;
      }
    }
  assert.ok(rowsChecked > 300, `rows measured (${rowsChecked})`);
});

ok('B2 one leading that clears the drawn cap; the size floor holds', () => {
  for (const plain of forms)
    for (const seed of SEEDS) {
      const g = readGrid(plain, rayGunForm(plain, { mode: 'grit', seed }));
      const cap = CAP_EM * g.em;
      if (g.lead !== null) assert.ok(g.lead >= 1.12 * cap - 1e-9, `leading ${(g.lead / cap).toFixed(2)} caps (form ${forms.indexOf(plain)}, seed ${seed}, rows ${g.rows.length})`);
      const ems = plain.stamps.map((s) => s.em).sort((a, b) => a - b);
      const emPlain = ems[Math.floor(ems.length / 2)];
      assert.ok(g.em >= Math.min(emPlain, 0.015) - 1e-12, `em ${g.em.toFixed(4)} holds the floor`);
      if (forms.indexOf(plain) === forms.length - 1)
        assert.ok(g.rows.length > plainRows(plain).length, 'the long line broke rather than shrinking under the floor');
      assert.ok(g.em <= emPlain + 1e-12, 'never larger than the deal');
    }
});

// ── C · word recoverability ─────────────────────────────────────────────
ok('C1 reading order kept; rows read top to bottom; long lines break at word breaks, never crop', () => {
  for (const plain of forms)
    for (const seed of SEEDS) {
      const t = rayGunForm(plain, { mode: 'grit', seed });
      const rows = treatedRows(plain, t);
      for (const { row } of rows)
        for (let k = 1; k < row.length; k++) assert.ok(t.stamps[row[k]].x > t.stamps[row[k - 1]].x, 'order');
      // rows in reading order, top to bottom (a broken line continues on the next row down)
      const bases = rows.map((r) => Math.min(...r.row.map((i) => t.stamps[i].y)));
      for (let r = 1; r < bases.length; r++) assert.ok(bases[r] > bases[r - 1], 'rows read top to bottom');
      // nothing cropped against the dish edge: every glyph's ink is on the dish
      for (const s of t.stamps.slice(0, plain.stamps.length)) assert.ok(s.x - ink(s) / 2 >= -1e-9 && s.x + ink(s) / 2 <= plain.aspect + 1e-9, 'ink on the dish');
    }
});

// ── D · the ruled violations ────────────────────────────────────────────
ok('D1 every move is exactly one unit; the anchor never moves; a dropped band lands', () => {
  let moved = 0;
  let total = 0;
  for (const plain of forms)
    for (const seed of SEEDS) {
      const g = readGrid(plain, rayGunForm(plain, { mode: 'grit', seed }));
      if (g.lead === null) {
        // one line: the anchor on the baseline, every other glyph on it or one unit off, and the band drops some
        const offs = new Set(g.rows[0].row.map((i) => Math.abs(g.body[i].y - g.b0)).filter((d) => d > 1e-9).map((d) => d.toFixed(9)));
        assert.ok(offs.size <= 1, 'one unit');
        for (const i of g.anchor) assert.ok(near(g.body[i].y, g.b0), 'the anchor word never moves');
        assert.ok(g.rows[0].row.some((i) => g.body[i].y > g.b0 + 1e-9), 'a one-line poem still takes its violations');
        continue;
      }
      const u = g.unit / g.lead;
      assert.ok(near(u, 1 / 5, 1e-6) || near(u, 1 / 6, 1e-6), 'the unit is a fifth or a sixth of the leading');
      let drops = 0;
      g.rows.forEach((r, ri) => {
        for (const i of r.row) {
          const dy = g.body[i].y - (g.b0 + (ri - g.first) * g.lead);
          total++;
          if (!near(dy, 0, 1e-7)) moved++;
          if (ri > g.first && dy > 1e-7) drops++;
        }
      });
      if (g.rows.slice(g.first + 1).some((r) => !r.orn)) assert.ok(drops >= 1, 'something below the first line drops');
    }
  const share = moved / total;
  assert.ok(share > 0.06 && share < 0.45, `a ruled minority is violated (${share.toFixed(3)})`);
});

ok('D2 the overprint: one letter row of three+, offset one unit right and down, onto a neighbour, never the first line', () => {
  let printed = 0;
  for (const plain of forms)
    for (const seed of SEEDS) {
      const g = readGrid(plain, rayGunForm(plain, { mode: 'grit', seed }));
      if (g.rows.filter((r) => !r.orn).length < 3) {
        assert.equal(g.ghosts.length, 0, 'fewer than three letter rows: no overprint');
        continue;
      }
      const src = g.rows.findIndex(
        (r) =>
          !r.orn &&
          r.row.length === g.ghosts.length &&
          r.row.every(
            (i, k) =>
              g.ghosts[k].ch === g.body[i].ch &&
              (g.ghosts[k].x === plain.aspect || near(g.ghosts[k].x - g.body[i].x, g.unit, 1e-9)) &&
              (near(Math.abs(g.ghosts[k].y - g.unit - g.body[i].y), g.lead, 1e-9) || g.ghosts[k].y === 0 || g.ghosts[k].y === 1),
          ),
      );
      assert.ok(src >= 0, 'one whole letter row is printed again');
      const dir = g.ghosts[0].y - g.unit > g.body[g.rows[src].row[0]].y ? 1 : -1;
      const dst = src + dir;
      assert.ok(dst >= 1 && !g.rows[dst].orn, `onto a letter row, never the first line (form ${forms.indexOf(plain)} seed ${seed} src ${src} dst ${dst} rows ${g.rows.length} orn ${g.rows.map((r) => r.orn)})`);
      g.rows[src].row.forEach((i, k) => {
        const gh = g.ghosts[k];
        if (gh.x !== plain.aspect) assert.ok(near(gh.x - g.body[i].x, g.unit, 1e-9), 'one unit right');
        if (gh.y !== 0 && gh.y !== 1) assert.ok(near(gh.y - g.body[i].y, dir * g.lead + g.unit, 1e-9), 'a leading over, a unit down');
        assert.equal(gh.em, g.body[i].em, 'full weight');
        assert.ok(!isOrn(gh), 'never the ornament');
      });
      printed++;
    }
  assert.ok(printed > 0, 'the three-row fixtures were overprinted');
});

ok('D3 the plate break: the ornament stays furniture — inside the block, unmoved, never overprinted', () => {
  const plain = forms[6];
  const oi = plain.stamps.findIndex(isOrn);
  for (const seed of SEEDS) {
    const t = rayGunForm(plain, { mode: 'grit', seed });
    const o = t.stamps[oi];
    assert.equal(o.assetId, ORN);
    const letters = t.stamps.slice(0, plain.stamps.length).filter((s) => !isOrn(s));
    const left = Math.min(...letters.map((s) => s.x - ink(s) / 2));
    const right = Math.max(...letters.map((s) => s.x + ink(s) / 2));
    assert.ok(o.x > left + 0.2 * (right - left) && o.x < right, 'centred inside the block, not flush left');
    assert.ok(!t.stamps.slice(plain.stamps.length).some(isOrn), 'never overprinted');
  }
});

// ── E · A2 ──────────────────────────────────────────────────────────────
ok('E1 the grid is drawn per record: seeds differ, a seed repeats exactly', () => {
  const f = forms[0];
  const grids = new Set(
    SEEDS.map((seed) => {
      const t = rayGunForm(f, { mode: 'grit', seed });
      const g = readGrid(f, t);
      return `${g.lead.toFixed(6)}|${t.stamps[1].x.toFixed(6)}|${t.stamps[0].x.toFixed(6)}`;
    }),
  );
  assert.ok(grids.size >= SEEDS.length - 2, `every record draws its own grid (${grids.size}/${SEEDS.length})`);
  assert.deepStrictEqual(rayGunForm(f, { mode: 'grit', seed: 99 }), rayGunForm(f, { mode: 'grit', seed: 99 }));
});

// ── F · A5 ──────────────────────────────────────────────────────────────
ok('F1 under the wear axis every letter goes through the copier, none torn; the grid is untouched', () => {
  for (const plain of forms)
    for (const seed of SEEDS.slice(0, 8)) {
      const bare = rayGunForm(plain, { mode: 'grit', seed });
      const worn = rayGunForm(plain, { mode: 'grit', seed, wear: 1 });
      assert.equal(worn.stamps.length, bare.stamps.length);
      worn.stamps.forEach((s, i) => {
        const b = bare.stamps[i];
        assert.deepStrictEqual([s.ch, s.x, s.y, s.em, s.rotation], [b.ch, b.x, b.y, b.em, b.rotation]);
        const xr = wearStampIdFor(b.assetId, 'xerox');
        assert.equal(s.assetId, xr ?? b.assetId);
        if (xr) assert.ok(BY_ID.get(s.assetId).tags.includes('xerox') && WEAR_SOURCE_BY_ID.get(s.assetId) === b.assetId);
      });
    }
});

// ── G · the drawn scale ─────────────────────────────────────────────────
ok('G1 GRIT_INK_EM_PER_UNIT is what the renderer draws: a cap renders 80 units × the constant, within 4%', () => {
  const s = base.stamps.find((t) => t.ch === 'H') ?? base.stamps[0];
  const one = { ...base, stamps: [{ ...s, x: base.aspect / 2, y: 0.5 }] };
  const doc = structuredClone(CORPUS[0].doc);
  doc.layoutParams = { ...doc.layoutParams, count: 0, composition: 'raster', fieldForm: one };
  const img = new Resvg(renderSvg(doc), { fitTo: { mode: 'width', value: 1600 }, font: RESVG_FONT }).render();
  const { pixels: px, width: w, height: h } = img;
  let y0 = h;
  let y1 = 0;
  for (let y = Math.floor(h * 0.3); y < h * 0.7; y++)
    for (let x = Math.floor(w * 0.4); x < w * 0.6; x++) {
      const i = (y * w + x) * 4;
      if (px[i] + px[i + 1] + px[i + 2] > 150) {
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  const drawnEm = (y1 - y0) / h / s.em;
  const want = stampInkBox(s.assetId).h * GRIT_INK_EM_PER_UNIT;
  assert.ok(Math.abs(drawnEm / want - 1) < 0.04, `drawn ${drawnEm.toFixed(3)} em vs the constant's ${want.toFixed(3)} em`);
});

console.log(`rayGunGrit.selfcheck: ok (${passed} checks)`);
