import assert from 'node:assert';
import { BEHAVE, BEHAVE_IDS, resolveBehave, orbitForce } from './behave.js';

assert.deepStrictEqual(BEHAVE_IDS, ['cruise', 'flock', 'orbit', 'scatter']);
assert.ok(resolveBehave('cruise').sep > resolveBehave('flock').sep);
assert.ok(resolveBehave('cruise').coh < resolveBehave('flock').coh);
assert.strictEqual(resolveBehave('nope').sep, BEHAVE.cruise.sep);
const o = orbitForce(0, 0, 500, 350, 0.5);
assert.ok(Number.isFinite(o.fx) && Number.isFinite(o.fy));
console.log('behave.selfcheck: OK');
