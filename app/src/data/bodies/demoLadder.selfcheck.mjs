import assert from 'node:assert';
import {
  DEMO_LADDER_ID, DEMO_LADDER_STEPS, MOTH_LADDERS,
  ladderById, ladderFrame, ladderSymbolId,
} from './demoLadder.js';

// Original single-ladder contract (#119 / #125) is unchanged.
assert.strictEqual(DEMO_LADDER_STEPS.length, 5);
assert.strictEqual(ladderFrame(0), 0);
assert.strictEqual(ladderFrame(1), 4);
assert.strictEqual(ladderFrame(0.5), 2);
assert.strictEqual(ladderFrame(-1), 0);
assert.strictEqual(ladderFrame(2), 4);
assert.ok(!DEMO_LADDER_STEPS.some((s) => /<script/i.test(s)));

// #109A — second ladder pair-2 (org_lobe_01 → org_petal_03), same pipeline.
assert.strictEqual(MOTH_LADDERS.length, 2);
assert.deepStrictEqual(MOTH_LADDERS.map((l) => l.id), ['wing-open', 'pair-2']);
for (const ladder of MOTH_LADDERS) {
  assert.strictEqual(ladder.steps.length, 5, ladder.id);
  assert.ok(!ladder.steps.some((s) => /<script/i.test(s)), ladder.id);
  assert.ok(ladder.steps.every((s) => s.includes('var(--ink)')), `${ladder.id} keeps var(--ink) paint`);
}
assert.notStrictEqual(MOTH_LADDERS[0].steps[0], MOTH_LADDERS[1].steps[0], 'ladders differ');
// ladderFrame selects per-ladder, clamps like before, falls back on bad id.
assert.strictEqual(ladderFrame(0.5, 'pair-2'), 2);
assert.strictEqual(ladderFrame(1, 'pair-2'), 4);
assert.strictEqual(ladderFrame(-3, 'pair-2'), 0);
assert.strictEqual(ladderFrame(NaN, 'pair-2'), 0);
assert.strictEqual(ladderById('nope').id, DEMO_LADDER_ID, 'unknown ladder falls back to wing-open');
assert.strictEqual(ladderFrame(0.5, 'nope'), ladderFrame(0.5, DEMO_LADDER_ID));
// Symbol ids match what AssetSpriteSheet registers.
assert.strictEqual(ladderSymbolId('pair-2', 3), 'kc-blend-pair-2-3');
assert.strictEqual(ladderSymbolId('wing-open', 0), 'kc-blend-wing-open-0');
assert.strictEqual(ladderSymbolId('nope', 1), 'kc-blend-wing-open-1');
console.log('demoLadder.selfcheck: OK');
