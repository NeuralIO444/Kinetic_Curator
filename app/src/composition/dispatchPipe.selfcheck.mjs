// node src/composition/dispatchPipe.selfcheck.mjs
//
// #2097 — the pipe coalesces high-frequency actions per frame, and "nothing is ever dropped".
// SET_LAYOUT_PARAM is keyed per slider; SET_LAYOUT_PARAMS is a partial-merge BATCH with no key, so two batches in one
// frame used to collapse to the last one and the first batch's keys were lost. Batches now merge.
import assert from 'node:assert/strict';
import { createDispatchPipe } from './dispatchPipe.js';
import * as A from '../state/actions.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// a manual frame: rAF queues the flush; frame() runs it
let queued = null;
globalThis.requestAnimationFrame = (fn) => {
  queued = fn;
  return 1;
};
globalThis.cancelAnimationFrame = () => {
  queued = null;
};
const frame = () => {
  const f = queued;
  queued = null;
  f?.(0);
};

const seen = [];
const pipe = createDispatchPipe((a) => seen.push(a));
const reset = () => {
  frame();
  seen.length = 0;
};

ok('two partial SET_LAYOUT_PARAMS batches in one frame deliver {a:1, b:2} in one sink call', () => {
  pipe({ type: A.SET_LAYOUT_PARAMS, payload: { a: 1 } });
  pipe({ type: A.SET_LAYOUT_PARAMS, payload: { b: 2 } });
  assert.equal(seen.length, 0, 'coalesced: nothing delivered before the frame');
  frame();
  assert.equal(seen.length, 1, 'one sink call');
  assert.deepEqual(seen[0].payload, { a: 1, b: 2 });
  reset();
});

ok('a later batch wins a key both batches carry', () => {
  pipe({ type: A.SET_LAYOUT_PARAMS, payload: { a: 1, c: 3 } });
  pipe({ type: A.SET_LAYOUT_PARAMS, payload: { a: 9 } });
  frame();
  assert.deepEqual(seen[0].payload, { a: 9, c: 3 });
  reset();
});

ok("the merge does not mutate the caller's payload objects", () => {
  const first = { a: 1 };
  pipe({ type: A.SET_LAYOUT_PARAMS, payload: first });
  pipe({ type: A.SET_LAYOUT_PARAMS, payload: { b: 2 } });
  frame();
  assert.deepEqual(first, { a: 1 });
  reset();
});

ok('SET_LAYOUT_PARAM still coalesces per key: same key last-wins, different keys both land', () => {
  pipe({ type: A.SET_LAYOUT_PARAM, key: 'x', value: 1 });
  pipe({ type: A.SET_LAYOUT_PARAM, key: 'x', value: 2 });
  pipe({ type: A.SET_LAYOUT_PARAM, key: 'y', value: 5 });
  frame();
  assert.equal(seen.length, 2);
  assert.equal(seen.find((a) => a.key === 'x').value, 2);
  assert.equal(seen.find((a) => a.key === 'y').value, 5);
  reset();
});

ok('a discrete action still flushes the queue first, in order', () => {
  pipe({ type: A.SET_LAYOUT_PARAMS, payload: { a: 1 } });
  pipe({ type: A.SET_LAYOUT_PARAMS, payload: { b: 2 } });
  pipe({ type: 'SET_AUDIO_ENABLED', payload: true });
  assert.equal(seen.length, 2, 'the merged batch landed before the discrete action');
  assert.deepEqual(seen[0].payload, { a: 1, b: 2 });
  assert.equal(seen[1].type, 'SET_AUDIO_ENABLED');
  reset();
});

console.log(`dispatchPipe.selfcheck: ${n} checks passed`);
