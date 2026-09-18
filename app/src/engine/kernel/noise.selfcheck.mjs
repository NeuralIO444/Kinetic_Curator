// node src/engine/kernel/noise.selfcheck.mjs
// Kernel K1 acceptance (#59)

import assert from 'node:assert';
import { createNoise } from '../noise.js';

const a = createNoise(42);
const b = createNoise(42);
const c = createNoise(99);

const x = 1.25, y = 2.5, z = 0.1;

// AC2: same seed → identical samples
assert.strictEqual(a.noise3D(x, y, z), b.noise3D(x, y, z));
assert.strictEqual(a.fBm3D(x, y, z, 3), b.fBm3D(x, y, z, 3));

// AC1: different seeds → different field (overwhelmingly likely)
assert.notStrictEqual(a.noise3D(x, y, z), c.noise3D(x, y, z));

// AC3: interleaved use of two instances does not alter outputs
const a2 = createNoise(42);
const c2 = createNoise(99);
const seq = [];
for (let i = 0; i < 20; i++) {
  seq.push(a2.noise3D(i * 0.1, 0.2, 0.3));
  seq.push(c2.noise3D(i * 0.1, 0.2, 0.3));
}
const a3 = createNoise(42);
for (let i = 0; i < 20; i++) {
  assert.strictEqual(seq[i * 2], a3.noise3D(i * 0.1, 0.2, 0.3));
}

// curl2 finite
const curl = a.curl2(10, 20, 0);
assert.ok(Number.isFinite(curl.x) && Number.isFinite(curl.y));

// Octave pin: placement uses 3; fBm default is 4 — both must be finite and
// same-seed identity holds at the placement octave count.
{
  const n = createNoise(0xcafe);
  const o3 = n.fBm3D(0.5, 0.25, 0.1, 3);
  const o4 = n.fBm3D(0.5, 0.25, 0.1, 4);
  assert.ok(Number.isFinite(o3) && Number.isFinite(o4));
  assert.notStrictEqual(o3, o4, 'octave count must change the field');
  const n2 = createNoise(0xcafe);
  assert.strictEqual(n2.fBm3D(0.5, 0.25, 0.1, 3), o3);
}

console.log('kernel/noise.selfcheck: OK (K1)');
