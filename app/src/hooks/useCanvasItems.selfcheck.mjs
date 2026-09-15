// Runnable self-check for weighted asset selection (issue #26).
// node src/hooks/useCanvasItems.selfcheck.mjs
import assert from 'node:assert';
import { pickWeighted } from './useCanvasItems.js';
import { mkRng } from '../engine/prng.js';

const assets = [{ id: 'heavy' }, { id: 'medium' }, { id: 'light' }];
const weights = [4, 2, 1];
const total = 7;
const rng = mkRng(42);

const counts = { heavy: 0, medium: 0, light: 0 };
for (let i = 0; i < 20000; i++) counts[pickWeighted(assets, weights, total, rng).id]++;

assert(counts.heavy > counts.medium, 'heavy should be picked more than medium');
assert(counts.medium > counts.light, 'medium should be picked more than light');
assert(
  Math.abs(counts.heavy / counts.light - 4) < 0.5,
  `heavy:light ratio should be ~4:1, got ${counts.heavy}:${counts.light}`
);

const rngA = mkRng(7);
const rngB = mkRng(7);
const seqA = Array.from({ length: 10 }, () => pickWeighted(assets, weights, total, rngA).id);
const seqB = Array.from({ length: 10 }, () => pickWeighted(assets, weights, total, rngB).id);
assert.deepStrictEqual(seqA, seqB, 'same seed must produce the same pick sequence');

console.log('useCanvasItems.selfcheck: OK', counts);
