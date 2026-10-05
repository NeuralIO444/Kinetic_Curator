// mathFilters.selfcheck.mjs — #1010 MATH catalog.
//
// Proves the data contract the store, the sanitizer, the MOD engine, and
// the BUILD panel share: defaults, sanitizing, mod math, readout theater,
// wet ceiling, artist-unit formatting.
import assert from 'node:assert';
import {
  isMathLayer,
  MATH_EFFECT_DEFS,
  MATH_OP_KINDS,
  MATH_MOD_SOURCES,
  MATH_WET_CEILING,
  defaultMathEffects,
  defaultMathParams,
  sanitizeMathEffects,
  mathTrackHitsHard,
  mathTrackWetCeiling,
  formatMathParam,
} from './mathFilters.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('isMathLayer matches type only', () => {
  assert.equal(isMathLayer({ type: 'math' }), true);
  assert.equal(isMathLayer({ type: 'fx' }), false);
  assert.equal(isMathLayer({ type: 'content' }), false);
  assert.equal(isMathLayer(null), false);
});

ok('twelve ops in the catalog', () => {
  assert.equal(MATH_OP_KINDS.length, 12);
  for (const k of MATH_OP_KINDS) assert.ok(MATH_EFFECT_DEFS[k].label, `${k} has a label`);
});

ok('default chain is GAIN → CONTRAST', () => {
  const fx = defaultMathEffects();
  assert.deepEqual(fx.map((f) => f.kind), ['gain', 'contrast']);
  assert.deepEqual(fx[0].params, { exposure: 0 });
  assert.deepEqual(fx[1].params, { amount: 0.5 });
  assert.deepEqual(fx[0].mod, {});
});

ok('defaultMathParams returns null for unknown kinds', () => {
  assert.equal(defaultMathParams('nope'), null);
  assert.deepEqual(defaultMathParams('threshold'), { level: 0.5, softness: 0 });
});

ok('sanitizeMathEffects drops unknown kinds, clamps, defaults, cleans mod', () => {
  const out = sanitizeMathEffects([
    { kind: 'gain', params: { exposure: 99 }, mod: { exposure: 'beatPulse' } },
    { kind: 'nope', params: {} },
    null,
    { kind: 'quantize', params: { steps: 3.7 }, mod: { steps: 'bogus', nope: 'rms' } },
    { kind: 'hueRotate' }, // missing params -> defaults
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].params.exposure, 3, 'clamped to max');
  assert.deepEqual(out[0].mod, { exposure: 'beatPulse' });
  assert.equal(out[1].params.steps, 4, 'int rounds');
  assert.deepEqual(out[1].mod, {}, 'bogus mod source dropped');
  assert.deepEqual(out[2].params, { degrees: 0 });
  assert.deepEqual(sanitizeMathEffects('junk'), []);
});

ok('mathTrackHitsHard: hard threshold, hard quantize', () => {
  const layer = (effects) => ({ type: 'math', visible: true, effects });
  assert.equal(mathTrackHitsHard(layer([{ kind: 'threshold', params: { level: 0.5, softness: 0 } }])), true);
  assert.equal(mathTrackHitsHard(layer([{ kind: 'threshold', params: { level: 0.5, softness: 0.8 } }])), false);
  assert.equal(mathTrackHitsHard(layer([{ kind: 'quantize', params: { steps: 4 } }])), true);
  assert.equal(mathTrackHitsHard(layer([{ kind: 'quantize', params: { steps: 5 } }])), false);
  assert.equal(mathTrackHitsHard(layer([{ kind: 'gain', params: { exposure: 3 } }])), false);
  assert.equal(mathTrackHitsHard({ type: 'fx', visible: true, effects: [] }), false);
  assert.equal(mathTrackHitsHard({ type: 'math', visible: false, effects: [{ kind: 'threshold', params: { softness: 0 } }] }), false);
});

ok('mathTrackWetCeiling: 50% while HUE ROTATE is in the chain', () => {
  assert.equal(MATH_WET_CEILING, 0.5);
  assert.equal(mathTrackWetCeiling({ type: 'math', effects: [{ kind: 'hueRotate', params: {} }] }), 0.5);
  assert.equal(mathTrackWetCeiling({ type: 'math', effects: [{ kind: 'gain', params: {} }] }), 1);
  assert.equal(mathTrackWetCeiling({ type: 'fx', effects: [] }), 1);
});

ok('formatMathParam speaks artist units', () => {
  assert.equal(formatMathParam('gain', 'exposure', 1.5), '+1.5 st');
  assert.equal(formatMathParam('gain', 'exposure', -2), '-2.0 st');
  assert.equal(formatMathParam('hueRotate', 'degrees', 45), '45°');
  assert.equal(formatMathParam('quantize', 'steps', 4), '4');
  assert.equal(formatMathParam('contrast', 'amount', 0.5), '0.5');
});

ok('MOD sources are the documented four', () => {
  assert.deepEqual(MATH_MOD_SOURCES, ['none', 'rms', 'flux', 'beatPulse']);
});

console.log(`ok mathFilters.selfcheck — ${n} checks`);
