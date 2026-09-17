import assert from 'node:assert';
import {
  percentileToLevel,
  sanitizeScores,
  levelFor,
  topBand,
  whyCopy,
  ariaNote,
} from './shimmer.js';

// percentile -> level mapping: dead zone below 70, 4 compressive levels
assert.strictEqual(percentileToLevel(0), 0);
assert.strictEqual(percentileToLevel(41), 0);
assert.strictEqual(percentileToLevel(69.9), 0);
assert.strictEqual(percentileToLevel(70), 1);
assert.strictEqual(percentileToLevel(79), 1);
assert.strictEqual(percentileToLevel(80), 2);
assert.strictEqual(percentileToLevel(88), 2);
assert.strictEqual(percentileToLevel(90), 3);
assert.strictEqual(percentileToLevel(96), 3);
assert.strictEqual(percentileToLevel(97), 4);
assert.strictEqual(percentileToLevel(100), 4);

// hostile / junk input is a no-op, never throws
assert.strictEqual(percentileToLevel(NaN), 0);
assert.strictEqual(percentileToLevel(undefined), 0);
assert.strictEqual(percentileToLevel('warm'), 0);
assert.strictEqual(percentileToLevel(-5), 0);
assert.strictEqual(percentileToLevel(101), 4); // clamped, still a real band

// sanitizeScores keeps numbers, drops junk, keeps the contract {id: percentile}
const clean = sanitizeScores({
  'evolve-target:palette': 96,
  _note: 'stub sample, not a score',
  'evolve-target:seed': 'warm',
  'evolve-target:layout': NaN,
  'evolve-target:all': 41,
});
assert.deepStrictEqual(clean, {
  'evolve-target:palette': 96,
  'evolve-target:all': 41,
});
assert.deepStrictEqual(sanitizeScores(null), {});
assert.deepStrictEqual(sanitizeScores('nope'), {});

// missing candidate / missing file -> level 0, real no-op
assert.strictEqual(levelFor(clean, 'evolve-target:palette'), 3);
assert.strictEqual(levelFor(clean, 'evolve-target:seed'), 0);
assert.strictEqual(levelFor({}, 'evolve-target:palette'), 0);
assert.strictEqual(levelFor(null, 'evolve-target:palette'), 0);

// bands + copy stay honest: past-tense evidence, defeasible, no cheerleading
assert.strictEqual(topBand(96), 'top 10%');
assert.strictEqual(topBand(85), 'top 20%');
assert.strictEqual(topBand(71), 'top 30%');
assert.strictEqual(topBand('junk'), null);
const copy = whyCopy('Palette', 96);
assert.ok(copy.includes('top 10%'));
assert.ok(copy.includes('not an order'));
assert.ok(!copy.includes('!'));
assert.strictEqual(
  whyCopy('Seed', 'junk'),
  'Shimmer is off for this one — no score on file.'
);

// screen-reader notes exist per level, null when dark
assert.strictEqual(ariaNote(4), 'model suggestion: strongest match');
assert.strictEqual(ariaNote(1), 'model suggestion: mild match');
assert.strictEqual(ariaNote(0), null);

console.log('shimmer selfcheck OK');
