// node src/engine/kernel/tracks/trackGraph.noop.selfcheck.mjs
// #1236 — no-op early-return contract for applyField/applyFeed.
// The no-op path (patch off, zero strength, empty sources) must return the
// INPUT ARRAY UNCHANGED — same reference, zero allocation — and the active
// path must stay byte-identical to before the early return landed.
// The active-path goldens below were captured from the pre-#1236 code
// (direct O(n·m) loop, #1254); they pin the loop's output, not its shape.
import assert from 'node:assert';
import { applyField, applyFeed, normalizePatch } from './trackGraph.js';
import { createPointSet, POINT_COLUMN_NAMES } from '../soa/pointSet.js';

const fieldPatch = (over = {}) =>
  normalizePatch({ from: 0, to: 1, mode: 'field', strength: 1, polarity: 1, ...over });
const feedPatch = (over = {}) =>
  normalizePatch({ from: 0, to: 1, mode: 'feed', strength: 1, polarity: 1, ...over });

// --- applyField: no-op path returns the identical input reference ---------
{
  const tgt = [{ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }];
  const src = [{ x: 0.9, y: 0.1 }];

  const off = applyField(tgt, src, fieldPatch({ mode: 'off' }));
  assert.strictEqual(off, tgt, 'FIELD off: same array reference (not a copy)');
  assert.strictEqual(off[0], tgt[0], 'FIELD off: same point objects (no spread)');

  const zero = applyField(tgt, src, fieldPatch({ strength: 0 }));
  assert.strictEqual(zero, tgt, 'FIELD strength 0: same array reference');

  const empty = applyField(tgt, [], fieldPatch());
  assert.strictEqual(empty, tgt, 'FIELD empty sources: same array reference');
  const emptyUndef = applyField(tgt, undefined, fieldPatch());
  assert.strictEqual(emptyUndef, tgt, 'FIELD undefined sources: same array reference');

  // The no-op path never mutates what it returns.
  const frozen = [{ x: 0.5, y: 0.5 }];
  Object.freeze(frozen);
  Object.freeze(frozen[0]);
  assert.strictEqual(applyField(frozen, [], fieldPatch()), frozen, 'FIELD no-op on frozen input');
  console.log('[selfcheck] trackGraph.noop applyField no-op returns input');
}

// --- applyField: active path is unchanged ----------------------------------
{
  const tgt = [{ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }];
  const src = [{ x: 0.9, y: 0.1 }, { x: 0.8, y: 0.2 }, { x: 0.7, y: 0.3 }];
  const out = applyField(tgt, src, fieldPatch());
  assert.notStrictEqual(out, tgt, 'FIELD active: fresh array, not the input');
  assert.notStrictEqual(out[0], tgt[0], 'FIELD active: fresh point objects');
  // Pre-#1236 golden (direct O(n·m) loop, FIELD_RADIUS 0.35, gain 0.002).
  assert.deepStrictEqual(
    out,
    [
      { x: 0.5049937578027466, y: 0.4950062421972534 },
      { x: 0.2, y: 0.8 },
    ],
    'FIELD active: byte-identical to pre-#1236 output',
  );
  assert.deepStrictEqual(tgt, [{ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }], 'FIELD active: input not mutated');
  const again = applyField(tgt, src, fieldPatch());
  assert.deepStrictEqual(out, again, 'FIELD active: deterministic across runs');
  // A mutated copy must not alias the input: write through the returned
  // objects and confirm the source list is untouched.
  out[0].x = -999;
  out[1].y = -999;
  assert.strictEqual(tgt[0].x, 0.5, 'FIELD active: mutating output does not alias input');
  assert.strictEqual(tgt[1].y, 0.8, 'FIELD active: mutating output does not alias input');
  console.log('[selfcheck] trackGraph.noop applyField active path unchanged');
}

// --- applyFeed: no-op path returns the identical input reference -----------
{
  const w = 4, h = 4;
  // #1308: sampleFlow reads SoA columns — the fixture is built as (u, v)
  // directly, with the same values the old interleaved layout held.
  const u = new Float32Array(w * h);
  const v = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      u[i] = 0.02 * (x + 1);
      v[i] = -0.01 * (y + 1);
    }
  const field = { w, h, u, v };
  const pts = [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.5 }];

  const off = applyFeed(pts, field, feedPatch({ mode: 'off' }));
  assert.strictEqual(off, pts, 'FEED off: same array reference (not a copy)');
  assert.strictEqual(off[0], pts[0], 'FEED off: same point objects (no spread)');

  const zero = applyFeed(pts, field, feedPatch({ strength: 0 }));
  assert.strictEqual(zero, pts, 'FEED strength 0: same array reference');

  console.log('[selfcheck] trackGraph.noop applyFeed no-op returns input');
}

// --- applyFeed: active path is unchanged ------------------------------------
{
  const w = 4, h = 4;
  // #1308: sampleFlow reads SoA columns — the fixture is built as (u, v)
  // directly, with the same values the old interleaved layout held.
  const u = new Float32Array(w * h);
  const v = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      u[i] = 0.02 * (x + 1);
      v[i] = -0.01 * (y + 1);
    }
  const field = { w, h, u, v };
  const pts = [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.5 }];
  const out = applyFeed(pts, field, feedPatch());
  assert.notStrictEqual(out, pts, 'FEED active: fresh array, not the input');
  assert.notStrictEqual(out[0], pts[0], 'FEED active: fresh point objects');
  // Pre-#1236 golden (bilinear sampleFlow, FEED amt = strength × polarity).
  assert.deepStrictEqual(
    out,
    [
      { x: 0.28499999921768904, y: 0.23250000039115548 },
      { x: 0.8149999985471368, y: 0.47500000055879354 },
    ],
    'FEED active: byte-identical to pre-#1236 output',
  );
  assert.deepStrictEqual(pts, [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.5 }], 'FEED active: input not mutated');
  const again = applyFeed(pts, field, feedPatch());
  assert.deepStrictEqual(out, again, 'FEED active: deterministic across runs');
  // A mutated copy must not alias the input: write through the returned
  // objects and confirm the source list is untouched.
  out[0].x = -999;
  assert.strictEqual(pts[0].x, 0.25, 'FEED active: mutating output does not alias input');
  console.log('[selfcheck] trackGraph.noop applyFeed active path unchanged');
}

// --- #1306 (SoA 2/5): no-op path is a column-count check ----------------------
// The no-op path accepts point sets: emptiness is read from `count` (the
// column-count check), the input set is returned untouched (same reference,
// zero per-point allocation, zero per-point walk — no toObjects() to
// discover there's nothing to do), and no column is mutated.
{
  const snap = (s) => {
    const o = { count: s.count };
    for (const c of POINT_COLUMN_NAMES) o[c] = Array.from(s[c].slice(0, s.count));
    return JSON.stringify(o);
  };
  const mkSet = (n, count) => {
    const s = createPointSet(Math.max(1, n));
    for (let i = 0; i < n; i++) {
      s.x[i] = 0.1 * (i + 1); s.y[i] = 0.2 * (i + 1);
      s.vx[i] = 0.01 * i; s.vy[i] = -0.01 * i;
      s.slot[i] = i; s.energy[i] = 1 + i;
      s.id[i] = 100 + i; s.family[i] = 7; s.source[i] = 3;
    }
    s.count = count;
    return s;
  };

  // count — not capacity — decides: count 0 in a capacity-8 set is empty.
  const emptySet = mkSet(8, 0);
  const tgt = mkSet(2, 2);
  const tgtBefore = snap(tgt);
  const r1 = applyField(tgt, emptySet, fieldPatch());
  assert.strictEqual(r1, tgt, 'FIELD set no-op (count 0): same set reference');
  assert.strictEqual(snap(tgt), tgtBefore, 'FIELD set no-op: target columns unmutated');
  assert.strictEqual(snap(emptySet), snap(mkSet(8, 0)), 'FIELD set no-op: source columns unmutated');

  // Non-empty set sources with an off / zero-strength patch: same ref.
  const liveSet = mkSet(3, 3);
  assert.strictEqual(applyField(tgt, liveSet, fieldPatch({ mode: 'off' })), tgt,
    'FIELD set no-op (off): same set reference');
  assert.strictEqual(applyField(tgt, liveSet, fieldPatch({ strength: 0 })), tgt,
    'FIELD set no-op (strength 0): same set reference');
  assert.strictEqual(snap(tgt), tgtBefore, 'FIELD set no-op: still zero column writes');

  // Mixed shapes on the no-op path: set target + array sources, off patch.
  assert.strictEqual(
    applyField(tgt, [{ x: 0.9, y: 0.1 }], fieldPatch({ mode: 'off' })), tgt,
    'FIELD set target + array sources, off: same set reference');

  // The snapshot comparisons above are the column equivalent of #1236's
  // frozen-input test (typed arrays cannot be Object.freeze()d when
  // non-empty): the no-op path performs zero column writes.

  // Sets on the ACTIVE path are slice 2/5 territory: loud error, never a
  // silent coercion to an empty source list (byte-identical law).
  assert.throws(
    () => applyField([{ x: 0.5, y: 0.5 }], liveSet, fieldPatch()),
    /slice 2\/5/,
    'FIELD active + set sources: loud migration error, not a silent no-op');
  assert.throws(
    () => applyField(tgt, [{ x: 0.9, y: 0.1 }], fieldPatch()),
    /slice 2\/5/,
    'FIELD active + set target: loud migration error');
  console.log('[selfcheck] trackGraph.noop #1306 set no-op is a column-count check');
}
