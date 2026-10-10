// node src/engine/kernel/field/registry.selfcheck.mjs
// #1183 — field/weather/feature registries: the migrated fields keep their
// behavior bit-for-bit; weather + feature registries carry the shape.

import assert from 'node:assert';
import { FIELDS } from './registry.js';
import { WEATHER } from '../weather/registry.js';
import { FEATURES } from '../feature/registry.js';
import { makeNoiseField, makeCaField } from './index.js';
import { createScentField } from './scent.js';

// --- the migrated fields are registered with the declared shape ---
for (const id of ['constant', 'ca', 'noise', 'scent', 'quadtree']) {
  const d = FIELDS.get(id);
  assert.ok(d, `missing field ${id}`);
  assert.strictEqual(d.id, id);
  assert.strictEqual(d.family, 'field');
  assert.ok(Array.isArray(d.reads) && Array.isArray(d.writes), `${id}: reads/writes arrays`);
  assert.ok(Number.isInteger(d.costTier) && d.costTier >= 0 && d.costTier <= 3, `${id}: bad costTier`);
  assert.strictEqual(typeof d.create, 'function', `${id}: create must be callable`);
}
assert.strictEqual(FIELDS.get('scent').costTier, 0, 'scent is tier 0 (structural substrate)');

// --- behavior: registry-created fields sample identically to the direct calls ---
{
  const seed = 0x5eed;
  const direct = makeNoiseField(seed, { freq: 2.5, octaves: 3 });
  const via = FIELDS.get('noise').create(seed, { freq: 2.5, octaves: 3 });
  assert.strictEqual(via.kind, direct.kind);
  for (const [nx, ny] of [[0.1, 0.2], [0.5, 0.5], [0.9, 0.1]]) {
    assert.strictEqual(via.sample(nx, ny), direct.sample(nx, ny), `noise field differs at ${nx},${ny}`);
  }
}
{
  const grid = [[1, 0], [0, 1]];
  const direct = makeCaField(grid, { softness: 1 });
  const via = FIELDS.get('ca').create(0, { grid, softness: 1 });
  assert.strictEqual(via.sample(0.25, 0.25), direct.sample(0.25, 0.25));
}
{
  const via = FIELDS.get('scent').create(0, {});
  via.deposit(0.5, 0.5, 1);
  const v = via.sample(0.5, 0.5);
  assert.ok(v > 0 && v <= 4, `scent sample out of range: ${v}`);
  const direct = createScentField();
  direct.deposit(0.5, 0.5, 1);
  assert.strictEqual(v, direct.sample(0.5, 0.5), 'scent via registry differs from direct');
}
{
  const via = FIELDS.get('constant').create(0, { value: 0.3 });
  assert.strictEqual(via.sample(0.9, 0.9), 0.3);
}
{
  const via = FIELDS.get('quadtree').create(0xabc, { z: 2 });
  const v = via.sample(0.4, 0.6);
  assert.ok(v >= 0 && v <= 1, `quadtree field out of range: ${v}`);
}

// --- weather + feature registries: shape defined, ready for their modules ---
for (const [reg, family, payloadKey] of [[WEATHER, 'weather', 'create'], [FEATURES, 'feature', 'create']]) {
  assert.strictEqual(reg.family, family);
  assert.deepStrictEqual(reg.list(), [], `${family} starts empty — no modules migrated yet`);
  const decl = { id: `__dish_${family}_test`, reads: ['scalars'], writes: ['fields'], costTier: 1, create: () => ({}) };
  reg.register(decl);
  const got = reg.get(`__dish_${family}_test`);
  assert.strictEqual(got.family, family);
  assert.strictEqual(typeof got[payloadKey], 'function');
  assert.deepStrictEqual(reg.list(), [`__dish_${family}_test`]);
}

// --- fail-closed ---
assert.throws(() => FIELDS.register({ id: '__dish_nocreate' }), /missing create/);
assert.throws(() => FIELDS.register({ id: '__dish_badtier', costTier: 5, create: () => ({}) }), /costTier/);
assert.throws(
  () => FIELDS.register({ id: 'noise', reads: ['nope'], create: (s) => ({}) }),
  /conflicting declaration/,
);

console.log('field/registry.selfcheck: ok');
