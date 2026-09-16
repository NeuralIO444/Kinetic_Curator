import assert from 'node:assert';
import { DEMO_LADDER_STEPS, ladderFrame } from './demoLadder.js';

assert.strictEqual(DEMO_LADDER_STEPS.length, 5);
assert.strictEqual(ladderFrame(0), 0);
assert.strictEqual(ladderFrame(1), 4);
assert.strictEqual(ladderFrame(0.5), 2);
assert.strictEqual(ladderFrame(-1), 0);
assert.strictEqual(ladderFrame(2), 4);
assert.ok(!DEMO_LADDER_STEPS.some((s) => /<script/i.test(s)));
console.log('demoLadder.selfcheck: OK');
