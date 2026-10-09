// node src/engine/kernel/tracks/trackGraph.noop.selfcheck.mjs
// #1236 — no-op early-return contract for applyField/applyFeed.
// The no-op path (patch off, zero strength, empty sources) must return the
// INPUT ARRAY UNCHANGED — same reference, zero allocation — and the active
// path must stay byte-identical to before the early return landed.
// The active-path goldens below were captured from the pre-#1236 code
// (direct O(n·m) loop, #1254); they pin the loop's output, not its shape.
import assert from 'node:assert';
import { applyField, applyFeed, normalizePatch } from './trackGraph.js';

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
  const flow = new Float32Array(w * h * 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 2;
      flow[i] = 0.02 * (x + 1);
      flow[i + 1] = -0.01 * (y + 1);
    }
  const field = { w, h, flow };
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
  const flow = new Float32Array(w * h * 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 2;
      flow[i] = 0.02 * (x + 1);
      flow[i + 1] = -0.01 * (y + 1);
    }
  const field = { w, h, flow };
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
