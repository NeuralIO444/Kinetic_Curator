// node src/state/undoSeedOffsets.selfcheck.mjs
//
// history.js entrySignature() must include seedOffsets: two consecutive
// sub-seed mutations have identical pre-states in every other field, so
// without it the dedupe collapses them into one undo step (S2 → S0, skipping S1).
import assert from 'node:assert';
import { useStore } from './store.js';

const S = () => useStore.getState();

const s0 = S().seedOffsets.spatial;
S().mutateSeedOffset('spatial');
const s1 = S().seedOffsets.spatial;
S().mutateSeedOffset('spatial');
const s2 = S().seedOffsets.spatial;
assert.ok(s0 !== s1 && s1 !== s2, 'mutations must change the offset (test precondition)');

assert.strictEqual(S().historyUndoStack.length, 2, 'each mutation is its own undo step');
S().undo();
assert.strictEqual(S().seedOffsets.spatial, s1, 'first undo lands on S1, not S0');
S().undo();
assert.strictEqual(S().seedOffsets.spatial, s0, 'second undo lands on S0');

console.log('undoSeedOffsets.selfcheck ok');
