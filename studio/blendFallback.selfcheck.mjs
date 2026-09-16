import assert from 'node:assert';
import { blend, BLEND_FALLBACK } from './blendFallback.mjs';

assert.strictEqual(BLEND_FALLBACK['plus-lighter'], 'screen');
assert.strictEqual(blend(null), null);
assert.strictEqual(blend('normal'), null);
assert.strictEqual(blend('multiply'), 'multiply');
assert.strictEqual(blend('plus-lighter'), 'screen');
assert.strictEqual(blend('plus-lighter'), 'screen', 'second call still maps');
console.log('blendFallback.selfcheck: OK');
