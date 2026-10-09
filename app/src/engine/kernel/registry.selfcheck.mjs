// node src/engine/kernel/registry.selfcheck.mjs
// #1183 — the declared module registry factory: validation + HMR semantics.

import assert from 'node:assert';
import { createRegistry } from './registry.js';

// --- family / payload validation is fail-closed ---
assert.throws(() => createRegistry(''), /family/);
assert.throws(() => createRegistry('x', { payloadKey: '' }), /payloadKey/);

const reg = createRegistry('testfam', { payloadKey: 'fn', defaults: { reads: ['seed'], costTier: 0 } });
assert.throws(() => reg.register(null), /declaration must be an object/);
assert.throws(() => reg.register({ fn() {} }), /id must be a non-empty string/);
assert.throws(() => reg.register({ id: 'a' }), /missing fn/);
assert.throws(() => reg.register({ id: 'a', fn() {}, costTier: 7 }), /costTier must be an integer 0–3/);
assert.throws(() => reg.register({ id: 'a', fn() {}, costTier: 1.5 }), /costTier must be an integer 0–3/);
assert.throws(() => reg.register({ id: 'a', fn() {}, reads: 'seed' }), /reads must be an array/);
assert.throws(() => reg.register({ id: 'a', fn() {}, writes: [1] }), /writes must be an array/);

// --- defaults fill the declaration ---
function fnA() { return 1; }
reg.register({ id: 'a', fn: fnA });
{
  const d = reg.get('a');
  assert.strictEqual(d.id, 'a');
  assert.strictEqual(d.family, 'testfam'); // factory sets family, not the caller
  assert.deepStrictEqual([...d.reads], ['seed']);
  assert.deepStrictEqual([...d.writes], []);
  assert.strictEqual(d.costTier, 0);
  assert.strictEqual(d.fn, fnA);
}
assert.deepStrictEqual(reg.list(), ['a']);
assert.strictEqual(reg.get('nope'), undefined);

// --- identical re-declaration is a no-op that refreshes the payload (HMR, #551) ---
function fnA2() { return 2; }
reg.register({ id: 'a', fn: fnA2 }); // same declaration, fresh closure → no throw
assert.strictEqual(reg.get('a').fn, fnA2);

// --- conflicting re-declaration throws ---
assert.throws(
  () => reg.register({ id: 'a', fn: fnA2, costTier: 2 }),
  /conflicting declaration/,
);

// --- entries are frozen ---
assert.ok(Object.isFrozen(reg.get('a')));

console.log('registry.selfcheck: ok');
