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

console.log('kernel/noise.selfcheck: OK (K1)');
