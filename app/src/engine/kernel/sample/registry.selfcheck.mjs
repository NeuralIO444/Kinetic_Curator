// node src/engine/kernel/sample/registry.selfcheck.mjs
// #1183 — sampler registry: every sampler carries the declared module shape
// { id, family, reads, writes, costTier, fn }; the legacy registerSampler(id,
// fn) shape keeps working through the compatibility shim.

import assert from 'node:assert';
import { registerSampler, getSampler, getSamplerDecl, listSamplers } from './registry.js';

// --- every registered sampler has a full declaration ---
for (const id of listSamplers()) {
  const d = getSamplerDecl(id);
  assert.ok(d, `missing declaration for ${id}`);
  assert.strictEqual(d.id, id);
  assert.strictEqual(d.family, 'sampler');
  assert.ok(Array.isArray(d.reads), `${id}: reads must be an array`);
  assert.ok(Array.isArray(d.writes), `${id}: writes must be an array`);
  assert.ok(Number.isInteger(d.costTier) && d.costTier >= 0 && d.costTier <= 3, `${id}: bad costTier`);
  assert.strictEqual(typeof d.fn, 'function', `${id}: fn must be callable`);
  // getSampler keeps returning the callable — the one caller (placement.js)
  // is untouched.
  assert.strictEqual(getSampler(id), d.fn, `${id}: getSampler must return the declared fn`);
}

// --- legacy shim: registerSampler(id, fn) fills the declaration ---
function legacyFn() { return { x: 1, y: 2 }; }
registerSampler('__dish_compat', legacyFn);
{
  const d = getSamplerDecl('__dish_compat');
  assert.strictEqual(d.family, 'sampler');
  assert.deepStrictEqual([...d.reads], ['seed']);
  assert.deepStrictEqual([...d.writes], ['points']);
  assert.strictEqual(d.costTier, 0);
  assert.strictEqual(getSampler('__dish_compat'), legacyFn);
  assert.ok(listSamplers().includes('__dish_compat'));
}

// --- declared shape round-trips ---
function declaredFn() { return { x: 3, y: 4 }; }
registerSampler({
  id: '__dish_declared',
  reads: ['seed', 'caGrid'],
  writes: ['points'],
  costTier: 0,
  fn: declaredFn,
});
{
  const d = getSamplerDecl('__dish_declared');
  assert.deepStrictEqual([...d.reads], ['seed', 'caGrid']);
  assert.deepStrictEqual([...d.writes], ['points']);
  assert.strictEqual(getSampler('__dish_declared'), declaredFn);
}

// --- unknown modes still fall back to random (existing #106 behavior) ---
assert.strictEqual(getSampler('__no_such_mode'), getSampler('random'));
assert.strictEqual(getSamplerDecl('__no_such_mode'), undefined);

// --- bad declarations throw, naming the offender ---
assert.throws(() => registerSampler({ id: '__dish_bad', fn() {} , costTier: 9 }), /costTier/);
assert.throws(() => registerSampler({ fn() {} }), /id must be a non-empty string/);

console.log('sample/registry.selfcheck: ok');
