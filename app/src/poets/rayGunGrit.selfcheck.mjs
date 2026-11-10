// rayGunGrit.selfcheck.mjs — #2010 (RAY GUN P2 · SWISS GRIT): the Ashworth mode.
//
// Pins (docs/design/raygun-headroom-2026-11-06.md §1b A1/A2/A5, §10 P2):
//   A  the seat: 'grit' is a ray-gun mode, cycled between greiman and shot; the door carries it
//   B  the Swiss base (A1): one size, straight, columns on a fixed advance, rows on a fixed leading that clears the
//      stage's drawn ink, the block on the dish
//   C  word recoverability on its own grid: every word's glyphs in reading order on consecutive columns, one empty
//      column between words — the violations move glyphs only across the row axis
//   D  the ruled violations: every vertical move is exactly one baseline unit; the first line takes none; one
//      column drops a unit; one row (of three or more) is overprinted onto a neighbour's baseline at full weight,
//      never onto the first line; a two-row poem takes no overprint
//   E  A2 no house template: the grid is drawn per record (seeds differ), deterministic per seed
//   F  A5 systematic grit: under the wear axis every letter goes through the copier — xerox, never torn — and the
//      geometry is identical to the unworn grid
import assert from 'node:assert';
import { RAYGUN_MODES, rayGunForm } from './rayGunForm.js';
import { fieldFormForDeal, sanitizeFieldForm } from './fieldForm.js';
import { WEAR_SOURCE_BY_ID, wearStampIdFor, stampWidthEm } from './placement.js';
import { ASSETS } from '../data/assets/index.js';
import { mkRng } from '../engine/prng.js';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('rayGunGrit.selfcheck');

const BY_ID = new Map(ASSETS.map((a) => [a.id, a]));
const forms = [
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't4' }, mkRng(1)), // three rows
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't1' }, mkRng(1)), // three rows
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(5)), // two rows
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g2', face: 'serif' }, mkRng(7)),
  fieldFormForDeal({ poetId: 'rosselli', pieceId: 'r1' }, mkRng(11)),
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't1', script: 'kana' }, mkRng(42)),
].filter(Boolean);
assert.ok(forms.length >= 5, 'fixtures deal');
const SEEDS = Array.from({ length: 24 }, (_, i) => 1 + i * 7919);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/**
 * Read a treated grit form back into its grid: rows (by plain reading order), the set em, the advance, the unit,
 * the leading, and the overprint ghosts. Uses the plain form's own rows (same y = same row).
 */
function readGrid(plain, treated) {
  const n = plain.stamps.length;
  const body = treated.stamps.slice(0, n);
  const ghosts = treated.stamps.slice(n);
  const ys = [...new Set(plain.stamps.map((s) => s.y))].sort((a, b) => a - b);
  const rows = ys.map((y) =>
    plain.stamps
      .map((s, i) => i)
      .filter((i) => plain.stamps[i].y === y)
      .sort((a, b) => plain.stamps[a].x - plain.stamps[b].x || a - b),
  );
  // The unit: the smallest vertical step between two glyphs of one row (a violation moves exactly one unit).
  let unit = Infinity;
  for (const row of rows)
    for (const i of row)
      for (const j of row) {
        const d = Math.abs(body[i].y - body[j].y);
        if (d > 1e-9 && d < unit) unit = d;
      }
  // The baselines: row 0 never moves; solve for the ONE leading under which every row's glyphs sit on its
  // baseline or exactly one unit off it (the most glyphs on the baseline wins a tie).
  const b0 = body[rows[0][0]].y;
  const fits = (lead) => {
    let on = 0;
    for (let r = 0; r < rows.length; r++) {
      const br = b0 + r * lead;
      for (const i of rows[r]) {
        const dy = body[i].y - br;
        if (near(dy, 0, 1e-7)) on++;
        else if (!(Number.isFinite(unit) && near(Math.abs(dy), unit, 1e-7))) return -1;
      }
    }
    return on;
  };
  let lead = NaN;
  if (rows.length > 1) {
    let best = -1;
    for (const i of rows[1])
      for (const off of [0, unit, -unit]) {
        if (!Number.isFinite(off)) continue;
        const L = body[i].y + off - b0;
        const score = fits(L);
        if (score > best) {
          best = score;
          lead = L;
        }
      }
    assert.ok(best >= 0, 'every row sits on one leading, its glyphs on the baseline or one unit off');
  }
  const bases = rows.map((_, r) => b0 + r * (rows.length > 1 ? lead : 0));
  let adv = Infinity;
  for (const row of rows)
    for (let k = 1; k < row.length; k++) {
      const dx = body[row[k]].x - body[row[k - 1]].x;
      if (dx > 1e-9) adv = Math.min(adv, dx);
    }
  return { body, ghosts, rows, bases, adv, unit, lead, em: body[0].em };
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

// ── B · the Swiss base ──────────────────────────────────────────────────
ok('B1 one size, straight, on columns and a leading that clears the drawn ink, on the dish', () => {
  for (const plain of forms)
    for (const seed of SEEDS) {
      const t = rayGunForm(plain, { mode: 'grit', seed });
      const g = readGrid(plain, t);
      assert.ok(t.stamps.length <= 200);
      for (const s of t.stamps) {
        assert.equal(s.em, g.em, 'one size');
        assert.equal(s.rotation, 0, 'straight');
        assert.ok(s.em > 0 && s.em <= 0.3);
        assert.ok(s.x >= 0 && s.x <= plain.aspect && s.y >= 0 && s.y <= 1, 'centres on the dish');
      }
      // every glyph centre sits on the column grid
      const x0 = Math.min(...g.body.map((s) => s.x));
      if (Number.isFinite(g.adv))
        for (const s of g.body) {
          const c = (s.x - x0) / g.adv;
          assert.ok(near(c, Math.round(c), 1e-6), `on a column (${c})`);
        }
      // rows on one leading, generous: never tighter than 2.6 em
      if (g.rows.length > 1) assert.ok(g.lead >= 2.6 * g.em - 1e-9, `one leading, clearing the ink (${(g.lead / g.em).toFixed(2)} em)`);
    }
});

// ── C · word recoverability on its own grid ─────────────────────────────
ok('C1 every word in order on consecutive columns, one empty column between words', () => {
  for (const plain of forms)
    for (const seed of SEEDS) {
      const g = readGrid(plain, rayGunForm(plain, { mode: 'grit', seed }));
      if (!Number.isFinite(g.adv)) continue;
      for (const row of g.rows) {
        const steps = [];
        for (let k = 1; k < row.length; k++) steps.push(Math.round((g.body[row[k]].x - g.body[row[k - 1]].x) / g.adv));
        assert.ok(steps.every((st) => st === 1 || st === 2), `columns advance by one (a glyph) or two (a word break): ${steps}`);
        // the plain form's word breaks (read off its own geometry, placement's constants) are exactly where the grid
        // leaves an empty column
        const even = plain.layout === 'grid' || plain.layout === 'square';
        let pitch = Infinity;
        for (let k = 1; k < row.length; k++) {
          const dx = plain.stamps[row[k]].x - plain.stamps[row[k - 1]].x;
          if (dx > 0) pitch = Math.min(pitch, dx);
        }
        for (let k = 1; k < row.length; k++) {
          const a = plain.stamps[row[k - 1]];
          const b = plain.stamps[row[k]];
          const half = (t) => (stampWidthEm(t.assetId, t.ch) * t.em) / 2;
          const plainBreak = even ? b.x - a.x > 1.5 * pitch : b.x - a.x - half(a) - half(b) > 0.35 * a.em;
          assert.equal(steps[k - 1] === 2, plainBreak, `break ${k}: the grid keeps the poem's own word breaks`);
        }
      }
    }
});

// ── D · the ruled violations ────────────────────────────────────────────
ok('D1 every vertical move is exactly one baseline unit; the first line takes none; one column drops', () => {
  let shifted = 0;
  let total = 0;
  for (const plain of forms)
    for (const seed of SEEDS) {
      const g = readGrid(plain, rayGunForm(plain, { mode: 'grit', seed }));
      const moves = new Set();
      g.rows.forEach((row, r) => {
        for (const i of row) {
          const dy = g.body[i].y - g.bases[r];
          total++;
          if (r === 0) assert.ok(near(dy, 0), 'the first line takes no violation');
          if (!near(dy, 0, 1e-7)) {
            shifted++;
            moves.add(Math.abs(dy).toFixed(9));
          }
        }
      });
      assert.ok(moves.size <= 1, 'one module: every move is the same unit');
      if (moves.size === 1) {
        const u = Number([...moves][0]) / g.em;
        assert.ok(u >= 0.36 - 1e-6 && u <= 0.44 + 1e-6, `the unit is a drawn module (${u.toFixed(3)} em)`);
      }
    }
  const share = shifted / total;
  assert.ok(share > 0.04 && share < 0.4, `a ruled minority of glyphs is violated (${share.toFixed(3)})`);
});

ok('D2 the overprint: one row of three or more, onto a neighbour baseline, full weight, never onto the first line', () => {
  for (const plain of forms)
    for (const seed of SEEDS) {
      const g = readGrid(plain, rayGunForm(plain, { mode: 'grit', seed }));
      if (g.rows.length < 3) {
        assert.equal(g.ghosts.length, 0, 'a two-row poem takes no overprint');
        continue;
      }
      const src = g.rows.findIndex((row) => row.length === g.ghosts.length && row.every((i, k) => g.ghosts[k].ch === g.body[i].ch));
      assert.ok(src >= 1, 'one whole row (never the first) is printed again');
      const lead = g.lead;
      const dst = g.ghosts[0].y > g.body[g.rows[src][0]].y ? src + 1 : src - 1;
      assert.ok(dst >= 1, 'never onto the first line');
      g.rows[src].forEach((i, k) => {
        const gh = g.ghosts[k];
        assert.equal(gh.x, g.body[i].x, 'same column');
        assert.ok(near(Math.abs(gh.y - g.body[i].y), lead, 1e-9) || gh.y === 1 || gh.y === 0, 'exactly one leading away');
        assert.equal(gh.em, g.body[i].em, 'full weight');
        assert.equal(gh.assetId, g.body[i].assetId);
      });
    }
});

// ── E · A2: no house template ───────────────────────────────────────────
ok('E1 the grid is drawn per record: seeds differ, a seed repeats exactly', () => {
  const f = forms[0];
  const grids = new Set(
    SEEDS.map((seed) => {
      const g = readGrid(f, rayGunForm(f, { mode: 'grit', seed }));
      return `${g.adv.toFixed(6)}|${g.lead.toFixed(6)}|${g.body[0].x.toFixed(6)}`;
    }),
  );
  assert.ok(grids.size >= SEEDS.length - 2, `every record draws its own grid (${grids.size}/${SEEDS.length})`);
  assert.deepStrictEqual(rayGunForm(f, { mode: 'grit', seed: 99 }), rayGunForm(f, { mode: 'grit', seed: 99 }));
});

// ── F · A5: systematic grit ─────────────────────────────────────────────
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
        assert.equal(s.assetId, xr ?? b.assetId, xr ? `${b.ch}: xeroxed` : `${b.ch}: no variant, kept`);
        if (xr) assert.ok(BY_ID.get(s.assetId).tags.includes('xerox') && WEAR_SOURCE_BY_ID.get(s.assetId) === b.assetId);
      });
    }
});

console.log(`rayGunGrit.selfcheck: ok (${passed} checks)`);
