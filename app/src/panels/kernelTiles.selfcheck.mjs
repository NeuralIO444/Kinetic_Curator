// node src/panels/kernelTiles.selfcheck.mjs
// #1233 — the KERNEL tab's tile rows are driven by the kernel registries:
// a module registered in field/weather/feature registry.js appears as a
// tile with zero panel-code edits; empty registries render no row (no tile,
// no crash); field probes are deterministic per seed and byte-identical to
// the direct constructors (the laws hold).

import assert from 'node:assert';
import { createRegistry } from '../engine/kernel/registry.js';
import { FIELDS } from '../engine/kernel/field/registry.js';
import { WEATHER } from '../engine/kernel/weather/registry.js';
import { FEATURES } from '../engine/kernel/feature/registry.js';
import { makeNoiseField } from '../engine/kernel/field/index.js';
import {
  tileFace,
  tileRowsFor,
  registryTileRows,
  registryCounts,
  probeField,
} from './kernelTiles.mjs';

// --- the live roster: five fields, one row ---
{
  const rows = registryTileRows();
  assert.strictEqual(rows.length, 1, `expected only the field row, got ${rows.map((r) => r.family)}`);
  const [row] = rows;
  assert.strictEqual(row.family, 'field');
  assert.deepStrictEqual(row.tiles.map((t) => t.id), ['constant', 'ca', 'noise', 'scent', 'quadtree']);
  for (const t of row.tiles) {
    assert.ok(t.face.length > 0 && t.face.length <= 4, `${t.id}: face "${t.face}" must be 1–4 chars`);
    assert.strictEqual(t.face, tileFace(t.id));
    assert.ok(Number.isInteger(t.tier) && t.tier >= 0 && t.tier <= 3, `${t.id}: bad tier`);
    assert.ok(t.decl && typeof t.decl.create === 'function', `${t.id}: tile must carry the registry declaration`);
  }
  const faces = row.tiles.map((t) => t.face);
  assert.strictEqual(new Set(faces).size, faces.length, `faces must be unique: ${faces}`);
}

// --- empty registries render no row: no tile, no crash ---
{
  const empty = createRegistry('weather', { payloadKey: 'create', defaults: { reads: [], writes: [], costTier: 1 } });
  assert.deepStrictEqual(tileRowsFor([empty]), [], 'empty registry must yield no rows');
  assert.deepStrictEqual(WEATHER.list(), [], 'weather registry starts empty');
  assert.deepStrictEqual(FEATURES.list(), [], 'feature registry starts empty');
  const counts = registryCounts();
  assert.deepStrictEqual(counts, [
    { family: 'field', n: 5 },
    { family: 'weather', n: 0 },
    { family: 'feature', n: 0 },
  ]);
}

// --- a newly registered module appears as a tile, no panel-code edit ---
{
  const fresh = createRegistry('field', {
    payloadKey: 'create',
    defaults: { reads: ['seed'], writes: ['scalars'], costTier: 0 },
  });
  fresh.register({ id: 'proto', create: () => ({ kind: 'proto', sample: () => 0.25 }) });
  const rows = tileRowsFor([fresh]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].tiles.length, 1);
  const [t] = rows[0].tiles;
  assert.strictEqual(t.id, 'proto');
  assert.strictEqual(t.face, 'PROT');
  assert.strictEqual(t.tier, 0);
}

// --- probes: deterministic per seed, byte-identical to the direct constructors ---
{
  const seed = 0x5eed;
  for (const id of FIELDS.list()) {
    const decl = FIELDS.get(id);
    const a = probeField(decl, seed);
    const b = probeField(decl, seed);
    assert.strictEqual(a, b, `${id}: probe must be deterministic per seed`);
  }
  const viaRegistry = probeField(FIELDS.get('noise'), seed);
  const direct = makeNoiseField(seed).sample(0.5, 0.5);
  assert.strictEqual(viaRegistry, direct, 'registry-created noise probe must equal the direct constructor');
  assert.strictEqual(probeField(FIELDS.get('constant'), seed), 1, 'constant defaults to 1');
  assert.strictEqual(probeField(FIELDS.get('ca'), seed), 1, 'ca without a grid is the constant-1 fallback');
  // noise actually varies with seed — the probe really samples
  assert.notStrictEqual(
    probeField(FIELDS.get('noise'), seed),
    probeField(FIELDS.get('noise'), seed ^ 0x9e3779b9),
    'noise probe must differ across seeds',
  );
}

// --- non-field shapes probe to null (weather/feature entries have no sample) ---
{
  const fake = createRegistry('weather', { payloadKey: 'create' });
  fake.register({ id: 'gust', create: () => ({}) });
  const [t] = tileRowsFor([fake])[0].tiles;
  assert.strictEqual(t.family, 'weather');
  assert.strictEqual(probeField(t.decl, 1), null, 'weather entries have no field-sample shape');
}

console.log('panels/kernelTiles.selfcheck: ok');
