// node src/state/projectDocument.selfcheck.mjs
import assert from 'node:assert';
import { serializeProject, parseProject, PROJECT_VERSION } from './projectDocument.js';

const state = {
  seed: 0x1a4f,
  paletteId: 'praystation',
  layoutParams: { mode: 'grid', count: 120, mirror: true },
  enabledAssets: { a: true, b: false },
  quality: 'performance',
};

const doc = serializeProject(state);
assert.strictEqual(doc.version, PROJECT_VERSION);
assert.strictEqual(doc.seed, 0x1a4f);
assert.strictEqual(doc.enabledAssets.b, false);

const round = parseProject(doc);
assert.ok(round.ok);
assert.strictEqual(round.doc.seed, 0x1a4f);
assert.strictEqual(round.doc.quality, 'performance');
assert.deepStrictEqual(round.doc.layoutParams, state.layoutParams);

const legacy = parseProject({
  seed: '1a4f',
  palette: 'praystation',
  layout: { mode: 'orbit', count: 50 },
});
assert.ok(legacy.ok);
assert.strictEqual(legacy.doc.seed, 0x1a4f);
assert.strictEqual(legacy.doc.layoutParams.mode, 'orbit');

const bad = parseProject({ version: 99 });
assert.ok(!bad.ok);

const badSeed = parseProject({ version: 1, seed: 'nope' });
assert.ok(!badSeed.ok);

console.log('projectDocument.selfcheck: OK');
