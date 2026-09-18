import assert from 'node:assert';
import { BEHAVE, BEHAVE_IDS, resolveBehave, orbitForce } from './behave.js';

assert.deepStrictEqual(BEHAVE_IDS, ['cruise', 'flock', 'orbit', 'scatter', 'mold']);
assert.ok(resolveBehave('cruise').sep > resolveBehave('flock').sep);
assert.ok(resolveBehave('cruise').coh < resolveBehave('flock').coh);
assert.strictEqual(resolveBehave('nope').sep, BEHAVE.cruise.sep);
const o = orbitForce(0, 0, 500, 350, 0.5);
assert.ok(Number.isFinite(o.fx) && Number.isFinite(o.fy));
// #287 — mold is the chemotactic colony profile: it must declare the
// scent-gradient gain and the per-step deposit the force pass reads.
const mold = resolveBehave('mold');
assert.ok(mold.chemotaxis > 0, 'mold needs a chemotaxis gain');
assert.ok(mold.deposit > 0, 'mold needs a scent deposit amount');
assert.ok(mold.sep > 0 && mold.coh > 0, 'mold still steers on sep/coh');
// No other profile may opt into chemotaxis — the force pass gates on it.
for (const id of BEHAVE_IDS) {
  if (id === 'mold') continue;
  assert.ok(!(resolveBehave(id).chemotaxis > 0), `${id} must not declare chemotaxis`);
}
console.log('behave.selfcheck: OK');
