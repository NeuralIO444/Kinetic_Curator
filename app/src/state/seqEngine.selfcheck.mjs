// node src/state/seqEngine.selfcheck.mjs
// The sequencer's step math: window, advance, wrap, stop, fire mode.
import assert from 'node:assert';
import { SEQ_WINDOW, seqWindow, seqNextIndex, seqFireMode } from './seqEngine.mjs';

const favs = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, seed: i }));

// window: last SEQ_WINDOW of the arranged array
assert.strictEqual(SEQ_WINDOW, 12, 'window is 12 until the strip-cap slice');
assert.deepStrictEqual(seqWindow(favs(5)).map((f) => f.id), ['f0', 'f1', 'f2', 'f3', 'f4']);
assert.deepStrictEqual(seqWindow(favs(20)).map((f) => f.id).length, 12);
assert.deepStrictEqual(seqWindow(favs(20))[0].id, 'f8', 'window is the newest 12');
assert.deepStrictEqual(seqWindow([]), []);
assert.deepStrictEqual(seqWindow(null), []);

// advance through a list
assert.deepStrictEqual(seqNextIndex(0, 4, true), { index: 1, wrapped: false, stopped: false });
assert.deepStrictEqual(seqNextIndex(2, 4, true), { index: 3, wrapped: false, stopped: false });
// wrap on loop
assert.deepStrictEqual(seqNextIndex(3, 4, true), { index: 0, wrapped: true, stopped: false });
// hold + stop without loop
assert.deepStrictEqual(seqNextIndex(3, 4, false), { index: 3, wrapped: false, stopped: true });
// empty list
assert.deepStrictEqual(seqNextIndex(0, 0, true), { index: 0, wrapped: false, stopped: true });
// garbage index recovers
assert.deepStrictEqual(seqNextIndex(NaN, 4, true).index, 0, 'NaN index restarts at 0');

// fire mode: cut only when the gap map says cut for that favorite
assert.strictEqual(seqFireMode({}, 'f1'), 'morph', 'default is morph');
assert.strictEqual(seqFireMode(null, 'f1'), 'morph');
assert.strictEqual(seqFireMode({ f1: 'cut' }, 'f1'), 'cut');
assert.strictEqual(seqFireMode({ f1: 'cut' }, 'f2'), 'morph', 'other favorites unaffected');
assert.strictEqual(seqFireMode({ f1: 'bogus' }, 'f1'), 'morph', 'unknown mode falls back to morph');

console.log('seqEngine.selfcheck: OK');
