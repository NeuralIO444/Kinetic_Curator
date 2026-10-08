// effectiveTemp.selfcheck.mjs — #1145: the single temperature source of truth.
import assert from 'node:assert';
import {
  TEMP_DEFAULT,
  TEMP_FLOOR,
  TEMP_CAP,
  REFINE_COOL,
  EXPLORE_WARM,
  effectiveTemp,
} from './effectiveTemp.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('silence → the global default 0.4 (yesterday\'s behavior)', () => {
  assert.equal(effectiveTemp(), TEMP_DEFAULT);
  assert.equal(effectiveTemp({}), TEMP_DEFAULT);
  assert.equal(effectiveTemp({ room: null }), TEMP_DEFAULT);
  assert.equal(TEMP_DEFAULT, 0.4);
});

ok('explicit room base_temp wins (the room is the thermostat)', () => {
  assert.equal(effectiveTemp({ room: { base_temp: 0.12 } }), 0.12);
  assert.equal(effectiveTemp({ room: { base_temp: 0.55 } }), 0.55);
});

ok('refine cools the room; explore warms it (#1144\'s interface)', () => {
  assert.ok(Math.abs(effectiveTemp({ room: { base_temp: 0.4 }, phase: 'refine' }) - (0.4 - REFINE_COOL)) < 1e-9);
  assert.ok(Math.abs(effectiveTemp({ room: { base_temp: 0.4 }, phase: 'explore' }) - (0.4 + EXPLORE_WARM)) < 1e-9);
});

ok('null phase (no #1144 yet) applies NO modulation', () => {
  assert.equal(effectiveTemp({ room: { base_temp: 0.45 }, phase: null }), 0.45);
  assert.equal(effectiveTemp({ room: { base_temp: 0.45 } }), 0.45);
});

ok('unknown phase strings are ignored — a typo never moves the thermostat', () => {
  assert.equal(effectiveTemp({ room: { base_temp: 0.4 }, phase: 'refinne' }), 0.4);
});

ok('clamped to the sane band [0.1, 0.55], always', () => {
  assert.equal(effectiveTemp({ room: { base_temp: 0.12 }, phase: 'refine' }), TEMP_FLOOR);
  assert.equal(effectiveTemp({ room: { base_temp: 0.55 }, phase: 'explore' }), TEMP_CAP);
  assert.equal(effectiveTemp({ room: { base_temp: 99 } }), TEMP_CAP);
  assert.equal(effectiveTemp({ room: { base_temp: -1 } }), TEMP_FLOOR);
});

console.log(`effectiveTemp.selfcheck: ${n} checks passed`);
