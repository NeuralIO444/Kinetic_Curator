// diff.selfcheck.mjs — parity diff engine (Phase 0, #186): tolerance
// policy, failure accounting, and report shape, on synthetic buffers.
import assert from 'node:assert';
import { diffPixels, formatReport, DEFAULT_POLICY, FX_RELAXED_POLICY } from './diff.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const rgba = (w, h, fn) => {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fn(x, y);
      buf.set([r, g, b, a], (y * w + x) * 4);
    }
  return buf;
};
const solid = (w, h, px) => rgba(w, h, () => px);

ok('identical buffers pass with zero failures', () => {
  const a = solid(4, 4, [10, 20, 30, 255]);
  const r = diffPixels(a, Buffer.from(a), 4, 4);
  assert.equal(r.pass, true);
  assert.equal(r.failed, 0);
  assert.equal(r.maxDelta, 0);
  assert.equal(r.meanDelta, 0);
});

ok('sub-tolerance noise passes; per-pixel max tracked', () => {
  const a = solid(8, 8, [100, 100, 100, 255]);
  const b = rgba(8, 8, (x, y) => [100 + ((x + y) % 9) - 4, 100, 100, 255]); // ±4
  const r = diffPixels(a, b, 8, 8);
  assert.equal(r.pass, true);
  assert.equal(r.failed, 0);
  assert.equal(r.maxDelta, 4);
});

ok('a single hot pixel fails only when over the fraction budget', () => {
  const a = solid(32, 32, [0, 0, 0, 255]);
  const b = Buffer.from(a);
  b.set([255, 255, 255, 255], 0); // one white pixel: 1/1024 = 0.098% < 0.1%
  const r = diffPixels(a, b, 32, 32);
  assert.equal(r.pass, true); // within the 0.1% allowance
  assert.equal(r.failed, 1);
  assert.equal(r.maxDelta, 255);
  assert.equal(r.failedSample[0].x, 0);
  const r2 = diffPixels(a, b, 32, 32, { perChannelTol: 8, maxFailFraction: 0 });
  assert.equal(r2.pass, false); // zero tolerance budget -> fails
});

ok('large-area shift fails and reports fraction', () => {
  const a = solid(10, 10, [0, 0, 0, 255]);
  const b = solid(10, 10, [50, 0, 0, 255]); // every pixel Δ=50 on R
  const r = diffPixels(a, b, 10, 10);
  assert.equal(r.pass, false);
  assert.equal(r.failed, 100);
  assert.equal(r.failFraction, 1);
});

ok('alpha channel participates in the diff', () => {
  const a = solid(4, 4, [0, 0, 0, 255]);
  const b = solid(4, 4, [0, 0, 0, 200]);
  const r = diffPixels(a, b, 4, 4);
  assert.equal(r.failed, 16);
  assert.equal(r.maxDelta, 55);
});

ok('buffer size mismatch throws', () => {
  assert.throws(() => diffPixels(Buffer.alloc(10), Buffer.alloc(16), 2, 2), /size mismatch/);
});

ok('policies are frozen and documented', () => {
  assert.ok(Object.isFrozen(DEFAULT_POLICY));
  assert.ok(Object.isFrozen(FX_RELAXED_POLICY));
  assert.equal(DEFAULT_POLICY.perChannelTol, 8);
  assert.ok(FX_RELAXED_POLICY.perChannelTol > DEFAULT_POLICY.perChannelTol);
});

ok('formatReport is a single auditable line', () => {
  const a = solid(4, 4, [0, 0, 0, 255]);
  const r = diffPixels(a, Buffer.from(a), 4, 4);
  const line = formatReport(r, 'smoke');
  assert.ok(line.startsWith('[parity:smoke] PASS'));
  assert.ok(line.includes('tol=8/ch'));
  assert.ok(!line.includes('\n'));
});

console.log(`diff.selfcheck: OK (${n} cases)`);
