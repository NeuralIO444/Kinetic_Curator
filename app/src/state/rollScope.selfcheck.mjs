// rollScope.selfcheck.mjs — MODE/MOTION roll-scope pinning (#964).
import assert from 'node:assert';
import { MOTION_KEYS, armedMotionParams, pinRollScope } from './rollScope.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('MOTION_KEYS covers every motion param', () => {
  assert.deepEqual([...MOTION_KEYS].sort(),
    ['behave', 'breath', 'flap', 'lifeDrift', 'noiseSpeed', 'wind'].sort());
});

ok('armedMotionParams: null/unknown → null, known → its numbers', () => {
  assert.equal(armedMotionParams(null), null);
  assert.equal(armedMotionParams('nope'), null);
  const flock = armedMotionParams('flock');
  assert.equal(flock.behave, 'flock');
  assert.equal(typeof flock.wind, 'number');
});

ok('pinRollScope: no arms → same values, new object', () => {
  const lp = { mode: 'grid', behave: 'cruise', count: 10 };
  const out = pinRollScope(lp, null, null);
  assert.deepEqual(out, lp);
  assert.notEqual(out, lp);
});

ok('pinRollScope: armed mode pins mode, leaves the rest', () => {
  const out = pinRollScope({ mode: 'grid', count: 10 }, 'fibonacci', null);
  assert.equal(out.mode, 'fibonacci');
  assert.equal(out.count, 10);
});

ok('pinRollScope: armed motion pins every motion key, leaves the rest', () => {
  const out = pinRollScope(
    { mode: 'grid', behave: 'cruise', wind: 0.1, count: 10 },
    null, 'flock',
  );
  const flock = armedMotionParams('flock');
  for (const k of MOTION_KEYS) assert.equal(out[k], flock[k], k);
  assert.equal(out.mode, 'grid');
  assert.equal(out.count, 10);
});

ok('pinRollScope: both arms — "more like this, but different"', () => {
  const out = pinRollScope(
    { mode: 'grid', behave: 'scatter', wind: 9, seed: 1 },
    'fibonacci', 'flock',
  );
  assert.equal(out.mode, 'fibonacci');
  assert.equal(out.behave, 'flock');
  assert.equal(out.seed, 1); // everything else untouched
});

console.log(`rollScope.selfcheck: ${n} checks passed`);
