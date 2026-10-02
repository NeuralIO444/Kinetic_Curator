// #558 — siblings diverge on the loop clock. Pause cannot walk the offset.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodePhase } from './liveResolve.mjs';

test('#558 phase offsets siblings and reruns match', () => {
  const a = nodePhase(2, { phaseOffset: 0.1, speedMul: 1 });
  const b = nodePhase(2, { phaseOffset: 0.7, speedMul: 1 });
  assert.notEqual(a, b);
  assert.equal(nodePhase(2, { phaseOffset: 0.1, speedMul: 1 }), a);
});

test('#558 pause holds the phase: same loop base, same result', () => {
  const held = nodePhase(4, { phaseOffset: 0.25, speedMul: 1.1 });
  assert.equal(nodePhase(4, { phaseOffset: 0.25, speedMul: 1.1 }), held);
  assert.ok(nodePhase(4, { speedMul: 1.2 }) !== nodePhase(4, { speedMul: 0.8 }));
});
