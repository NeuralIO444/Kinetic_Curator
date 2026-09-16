import assert from 'node:assert';
import { clampFade, DEFAULT_ACCUM_FADE } from './accumFade.js';

assert.strictEqual(clampFade(0.88), 0.88);
assert.strictEqual(clampFade(-1), 0);
assert.strictEqual(clampFade(2), 0.99);
assert.strictEqual(clampFade('nope'), DEFAULT_ACCUM_FADE);
console.log('accumFade.selfcheck: OK');
