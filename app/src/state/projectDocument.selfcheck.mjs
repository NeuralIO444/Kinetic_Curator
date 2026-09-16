// node src/state/projectDocument.selfcheck.mjs
import assert from 'node:assert';
import { serializeProject, parseProject, PROJECT_VERSION } from './projectDocument.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const state = {
  seed: 0x1a4f,
  paletteId: 'praystation',
  layoutParams: { mode: 'grid', count: 120, mirror: true },
  enabledAssets: { a: true, b: false },
  quality: 'performance',
};

const filled = normalizeLayoutParams(state.layoutParams);

const doc = serializeProject(state);
assert.strictEqual(doc.version, PROJECT_VERSION);
assert.strictEqual(doc.seed, 0x1a4f);
assert.strictEqual(doc.enabledAssets.b, false);
assert.strictEqual(doc.layoutParams.mode, 'grid');
assert.strictEqual(doc.layoutParams.count, 120);
assert.strictEqual(doc.layoutParams.mirror, true);
assert.strictEqual(doc.layoutParams.jitter, DEFAULT_LAYOUT_PARAMS.jitter);
assert.strictEqual(doc.layoutParams.accumulation, false);

const round = parseProject(doc);
assert.ok(round.ok);
assert.strictEqual(round.doc.seed, 0x1a4f);
assert.strictEqual(round.doc.quality, 'performance');
assert.deepStrictEqual(round.doc.layoutParams, filled);

const legacy = parseProject({
  seed: '1a4f',
  palette: 'praystation',
  layout: { mode: 'orbit', count: 50 },
});
assert.ok(legacy.ok);
assert.strictEqual(legacy.doc.seed, 0x1a4f);
assert.strictEqual(legacy.doc.layoutParams.mode, 'orbit');
assert.strictEqual(legacy.doc.layoutParams.count, 50);
assert.strictEqual(legacy.doc.layoutParams.lifeDrift, DEFAULT_LAYOUT_PARAMS.lifeDrift);
assert.deepStrictEqual(legacy.doc.layoutParams.scale, DEFAULT_LAYOUT_PARAMS.scale);

// Broken range arrays fall back to defaults instead of crashing sliders.
const badRange = parseProject({
  version: 1,
  seed: 1,
  layoutParams: { mode: 'grid', scale: 2, rotate: [0] },
});
assert.ok(badRange.ok);
assert.deepStrictEqual(badRange.doc.layoutParams.scale, DEFAULT_LAYOUT_PARAMS.scale);
assert.deepStrictEqual(badRange.doc.layoutParams.rotate, DEFAULT_LAYOUT_PARAMS.rotate);

// Custom palette colours must survive the round trip (#53)
const withPalette = serializeProject({
  ...state,
  paletteOverrides: { swatches: ['#112233', '#445566'], bg: '#000102', ink: '#fffefd' },
});
assert.ok(withPalette.paletteOverrides, 'paletteOverrides must be serialized');
const rtPalette = parseProject(withPalette);
assert.ok(rtPalette.ok);
assert.deepStrictEqual(
  rtPalette.doc.paletteOverrides,
  { swatches: ['#112233', '#445566'], bg: '#000102', ink: '#fffefd' },
  'custom palette must round-trip intact',
);

// No overrides means the catalog palette, and must parse as an explicit null
const noPalette = parseProject(serializeProject(state));
assert.strictEqual(noPalette.doc.paletteOverrides, null, 'absent overrides parse to null');

const bad = parseProject({ version: 99 });
assert.ok(!bad.ok);

const badSeed = parseProject({ version: 1, seed: 'nope' });
assert.ok(!badSeed.ok);

console.log('projectDocument.selfcheck: OK');
