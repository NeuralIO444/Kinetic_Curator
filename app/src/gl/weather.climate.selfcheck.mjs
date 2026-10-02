// #818 — one createNoise(projectSeed). Tracks offset the domain, they do
// not roll a second weather. Flock fallback and displace read that climate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createNoise } from '../engine/noise.js';
import { noiseSeedFor } from '../engine/kernel/rng.js';
import { ParticleSystem } from '../engine/particles.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS = [{ id: 'a' }];
const PALETTE = { id: 'bone', swatches: ['#ffffff'], bg: '#000' };

test('#818 same seed + noise offset is one curl sample', () => {
  const seed = 12345;
  const offsets = { noise: 3 };
  const off = offsets.noise * 100;
  const climate = createNoise(seed);
  const other = createNoise(noiseSeedFor(seed, offsets));
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, ASSETS, PALETTE, seed, offsets);
  assert.equal(sys._noise.seed, seed, 'flock fallback is the project climate');
  const flock = sys._noise.curl2(10 + off, 20 + off, 1.5);
  const displace = climate.curl2(10 + off, 20 + off, 1.5);
  assert.deepEqual(flock, displace);
  assert.notDeepEqual(flock, other.curl2(10, 20, 1.5), 'a re-rolled perm table is a second weather');
});

test('#818 resolver owns one climate and offsets the domain', () => {
  const src = readFileSync(join(DIR, 'liveResolve.mjs'), 'utf8');
  assert.match(src, /createNoise\(projectSeed \|\| 444\)/);
  assert.match(src, /noiseDomainOffset: \(seedOffsets\?\.noise \|\| 0\) \* 100/);
  assert.doesNotMatch(src, /createNoise\(noiseSeedFor/);
});
