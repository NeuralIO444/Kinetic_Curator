// silhouette.selfcheck — merge-kit geometry for the Asset Studio (#merge).
// Pure functions only: traceSilhouette needs a DOM canvas, so the raster
// half is exercised in the browser; traceAlpha (marching squares) runs here
// on hand-built grids.
import assert from 'node:assert';
import {
  traceAlpha, blurAlpha, cleanMergeLoops, chamferContour, resampleContour, blendContours,
  loopArea, outerLoop, loopsToD, loopsToPath, traceSilhouette,
} from './silhouette.js';

const approx = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

// --- traceAlpha: a filled rect yields one loop hugging its pixel edges.
{
  const w = 14, h = 14;
  const alpha = new Uint8Array(w * h);
  for (let y = 3; y <= 10; y++) for (let x = 3; x <= 10; x++) alpha[y * w + x] = 1;
  const loops = traceAlpha(alpha, w, h);
  assert.strictEqual(loops.length, 1, 'rect traces to exactly one loop');
  const xs = loops[0].map((p) => p[0]);
  const ys = loops[0].map((p) => p[1]);
  assert.ok(approx(Math.min(...xs), 3), `left edge at x=3, got ${Math.min(...xs)}`);
  assert.ok(approx(Math.max(...xs), 11), `right edge at x=11, got ${Math.max(...xs)}`);
  assert.ok(approx(Math.min(...ys), 3) && approx(Math.max(...ys), 11), 'vertical edges match');
  assert.ok(loops[0].length >= 8, 'loop has real vertices');
  assert.ok(Math.abs(loopArea(loops[0])) > 40, 'loop encloses area');
}

// --- traceAlpha: a rect with a hole yields two loops (outer + hole).
{
  const w = 14, h = 14;
  const alpha = new Uint8Array(w * h);
  for (let y = 2; y <= 11; y++) for (let x = 2; x <= 11; x++) alpha[y * w + x] = 1;
  for (let y = 5; y <= 8; y++) for (let x = 5; x <= 8; x++) alpha[y * w + x] = 0;
  const loops = traceAlpha(alpha, w, h);
  assert.strictEqual(loops.length, 2, `donut traces to two loops, got ${loops.length}`);
  const areas = loops.map((l) => Math.abs(loopArea(l))).sort((a, b) => a - b);
  assert.ok(areas[1] > 90 && areas[1] < 110, `outer area ~100, got ${areas[1]}`);
  assert.ok(areas[0] > 10 && areas[0] < 22, `hole area ~16, got ${areas[0]}`);
  assert.strictEqual(outerLoop(loops), loops[areas[1] === Math.abs(loopArea(loops[0])) ? 0 : 1]);
}

// --- traceAlpha: empty grid yields no loops.
assert.deepStrictEqual(traceAlpha(new Uint8Array(16), 4, 4), []);

// --- chamferContour: amount 0 is the identity.
{
  const sq = [[0, 0], [100, 0], [100, 100], [0, 100]];
  assert.deepStrictEqual(chamferContour(sq, 0), sq);
  assert.deepStrictEqual(chamferContour(sq, -3), sq);
}

// --- chamferContour: each corner becomes a bevel (4 pts -> 8 pts).
{
  const sq = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const c = chamferContour(sq, 10);
  assert.strictEqual(c.length, 8, `chamfered square has 8 points, got ${c.length}`);
  assert.deepStrictEqual(c[0].map(Math.round), [0, 10], 'first bevel point pulls back along the left edge');
  assert.deepStrictEqual(c[1].map(Math.round), [10, 0], 'second bevel point pulls back along the top edge');
  // Bevels cut the corner off: every output point stays inside the square.
  for (const [x, y] of c) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100);
}

// --- resampleContour: exact count, even spacing along the path.
{
  const tri = [[0, 0], [30, 0], [15, 30]];
  const r = resampleContour(tri, 9);
  assert.strictEqual(r.length, 9);
  assert.deepStrictEqual(r[0], [0, 0], 'starts at the loop start');
  // Project each sample back onto the triangle to get its path distance.
  const edges = tri.map((p, i) => [p, tri[(i + 1) % tri.length]]);
  const cum = [0];
  edges.forEach(([a, b]) => cum.push(cum[cum.length - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])));
  const total = cum[cum.length - 1];
  const pathD = r.map((p) => {
    let best = { d: Infinity, s: 0 };
    edges.forEach(([a, b], i) => {
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
      const qx = a[0] + vx * t, qy = a[1] + vy * t;
      const d = Math.hypot(p[0] - qx, p[1] - qy);
      if (d < best.d) best = { d, s: cum[i] + t * Math.hypot(vx, vy) };
    });
    assert.ok(best.d < 0.01, 'sample lies on the contour');
    return best.s;
  });
  const step = total / 9;
  for (let i = 1; i < 9; i++) {
    assert.ok(Math.abs((pathD[i] - pathD[i - 1]) - step) < 0.05,
      `even path spacing (got ${(pathD[i] - pathD[i - 1]).toFixed(2)}, want ${step.toFixed(2)})`);
  }
}

// --- blendContours: 64 points, endpoints near the sources, midpoint centered.
{
  const a = [[0, 0], [40, 0], [40, 40], [0, 40]];
  const b = [[60, 0], [100, 0], [100, 40], [60, 40]];
  const mid = blendContours(a, b, 0.5);
  assert.strictEqual(mid.length, 64);
  const cx = (pts) => pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = (pts) => pts.reduce((s, p) => s + p[1], 0) / pts.length;
  assert.ok(approx(cx(blendContours(a, b, 0)), cx(resampleContour(a, 64)), 2), 't=0 sits on a');
  assert.ok(approx(cx(blendContours(a, b, 1)), cx(resampleContour(b, 64)), 2), 't=1 sits on b');
  assert.ok(approx(cx(mid), 50, 3) && approx(cy(mid), 20, 3), `t=0.5 centered, got (${cx(mid).toFixed(1)}, ${cy(mid).toFixed(1)})`);
}

// --- loopsToD / loopsToPath: serialization shape.
{
  const d = loopsToD([[[0, 0], [10, 0], [10, 10], [0, 10]]]);
  assert.ok(d.startsWith('M0.00,0.00L'), `d starts with M, got ${d.slice(0, 12)}`);
  assert.ok(d.endsWith('Z'), 'subpath closed');
  assert.strictEqual(loopsToD([]), '');
  assert.strictEqual(loopsToD([[[0, 0]]]), '', 'degenerate loops dropped');
  const p = loopsToPath([[[0, 0], [10, 0], [10, 10], [0, 10]]]);
  assert.ok(p.includes('fill-rule="evenodd"'), 'holes punch via evenodd');
  assert.ok(p.includes('fill="currentColor"'), 'paints via the kit token');
  assert.ok(p.startsWith('<path d="') && p.endsWith('/>'), 'path fragment shape');
}

// --- traceSilhouette exists for the browser (canvas rasterizer, not run here).
assert.strictEqual(typeof traceSilhouette, 'function');

// --- blurAlpha (metaball goo): radius 0 is the identity; a real radius
// visibly moves a DENSE traced contour (the regression the old vertex
// chamfer missed — it only bent coarse polygons).
{
  // Two overlapping discs on a 100x100 grid, traced like the modal does.
  const w = 100, h = 100;
  const alpha = new Uint8Array(w * h);
  const disc = (cx, cy, r) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) alpha[y * w + x] = 1;
    }
  };
  disc(38, 50, 22); disc(62, 50, 22);
  const sharp = outerLoop(traceAlpha(alpha, w, h));
  assert.ok(sharp.length > 100, `dense trace, got ${sharp.length} vertices`);
  const id = blurAlpha(alpha, w, h, 0);
  assert.deepStrictEqual(Array.from(id), Array.from(alpha, (v) => (v ? 1 : 0)), 'radius 0 is the identity');
  const gooey = blurAlpha(alpha, w, h, 10);
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = gooey[i] > 0.5 ? 1 : 0;
  const melted = outerLoop(traceAlpha(bin, w, h));
  assert.ok(melted.length > 50, 'gooey trace still yields a real loop');
  // Resample both to the same count and measure the max pointwise shift.
  const rs = resampleContour(sharp, 128);
  const rm = resampleContour(melted, 128);
  let max = 0;
  for (let i = 0; i < 128; i++) max = Math.max(max, Math.hypot(rs[i][0] - rm[i][0], rs[i][1] - rm[i][1]));
  assert.ok(max > 2, `goo visibly moves the outline, max shift ${max.toFixed(2)}px`);
}

// --- cleanMergeLoops: the tear fix. Speck fragments at junctions are
// dropped, pinhole gaps between fused shapes are filled, real holes and
// small separate shapes survive.
{
  const big = [[0, 0], [100, 0], [100, 100], [0, 100]]; // area 10000
  const speck = [[38, 45], [38.5, 45.5], [38, 46], [37.5, 45.5]]; // area 0.5
  const pinhole = [[44, 41], [55, 41], [50, 44]]; // area ~16, inside big
  const donut = [[40, 40], [60, 40], [60, 60], [40, 60]]; // area 400, inside big
  const farDot = [[200, 200], [206, 200], [206, 206], [200, 206]]; // area 36, outside
  const out = cleanMergeLoops([big, speck, pinhole, donut, farDot]);
  const areas = out.map((l) => Math.abs(loopArea(l))).sort((a, b) => a - b);
  assert.ok(!out.includes(speck), 'junction speck dropped');
  assert.ok(!out.includes(pinhole), 'pinhole gap filled');
  assert.ok(out.includes(donut), 'real hole survives');
  assert.ok(out.includes(farDot), 'small separate shape survives');
  assert.ok(out.includes(big), 'main silhouette survives');
  assert.deepStrictEqual(areas.map(Math.round), [36, 400, 10000]);
}

console.log('silhouette.selfcheck: OK');
