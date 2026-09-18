// node src/state/projectDocument.selfcheck.mjs
import assert from 'node:assert';
import { serializeProject, parseProject, PROJECT_VERSION } from './projectDocument.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { sanitizeQuality, MAX_LAYERS } from './projectNormalize.js';
import { ASSETS } from '../data/assets/index.js';
import { useStore } from './store.js';

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

// ── #305 — sub-seed stream offsets round-trip ────────────────────────────
// Offsets serialize with the project and restore on parse; legacy docs
// without them normalize to the identity (all zeros), so old renders are
// bit-identical. Hostile values normalize to uint32 / zero.
const withOffsets = serializeProject({
  ...state,
  seedOffsets: { spatial: 0xdeadbeef, color: 42, asset: 0, noise: 0xffffffff },
});
assert.deepStrictEqual(
  withOffsets.seedOffsets,
  { spatial: 0xdeadbeef, color: 42, asset: 0, noise: 0xffffffff },
  'seedOffsets must serialize',
);
const rtOffsets = parseProject(withOffsets);
assert.ok(rtOffsets.ok);
assert.deepStrictEqual(
  rtOffsets.doc.seedOffsets,
  { spatial: 0xdeadbeef, color: 42, asset: 0, noise: 0xffffffff },
  'seedOffsets must round-trip intact',
);
const legacyOffsets = parseProject({ version: 1, seed: 1, layoutParams: {} });
assert.ok(legacyOffsets.ok);
assert.deepStrictEqual(
  legacyOffsets.doc.seedOffsets,
  { spatial: 0, color: 0, asset: 0, noise: 0 },
  'legacy docs normalize missing offsets to zeros',
);
const hostileOffsets = parseProject({
  version: 1, seed: 1, layoutParams: {},
  seedOffsets: { spatial: 'nope', color: 1.5, asset: -3, noise: null, bogus: 7 },
});
assert.ok(hostileOffsets.ok);
assert.deepStrictEqual(
  hostileOffsets.doc.seedOffsets,
  { spatial: 0, color: 1, asset: 0xffffffff - 2, noise: 0 },
  'hostile offsets normalize to uint32 (garbage → zero), unknown keys dropped',
);
useStore.getState().applyProject(rtOffsets.doc);
assert.deepStrictEqual(
  useStore.getState().seedOffsets,
  { spatial: 0xdeadbeef, color: 42, asset: 0, noise: 0xffffffff },
  'applyProject must restore offsets',
);
useStore.getState().applyProject(legacyOffsets.doc);
assert.deepStrictEqual(
  useStore.getState().seedOffsets,
  { spatial: 0, color: 0, asset: 0, noise: 0 },
  'applyProject of a legacy doc must zero offsets',
);

// ── #103 Track B — hostile-project hygiene audit ─────────────────────────
// Each hostile doc must parse to safe defaults and apply without throwing,
// without store bloat, leaving a playable canvas.

// 200-layer hostile doc → truncated to the cap on parse.
const manyLayers = Array.from({ length: 200 }, (_, i) => ({ id: `l${i}`, name: `L${i}`, type: 'content' }));
const capped = parseProject({ version: 1, seed: 1, layers: manyLayers, activeLayerId: 'l0' });
assert.ok(capped.ok, 'hostile 200-layer doc must still parse');
assert.strictEqual(capped.doc.layers.length, MAX_LAYERS, 'layers truncated to cap on parse');

// 100k-key enabledAssets hostile doc → only known ids survive.
const hostileAssets = {};
for (let i = 0; i < 100000; i++) hostileAssets[`evil-${i}`] = true;
hostileAssets[ASSETS[0].id] = false;
const hostile = parseProject({
  version: 1, seed: 1,
  enabledAssets: hostileAssets,
  assetWeightOverrides: { ...hostileAssets, [ASSETS[1].id]: 3 },
});
assert.ok(hostile.ok, 'hostile asset-map doc must still parse');
assert.ok(Object.keys(hostile.doc.enabledAssets).length < 500, 'enabledAssets collapsed to known ids');
assert.strictEqual(hostile.doc.enabledAssets[ASSETS[0].id], false, 'known ids keep their values');
assert.ok(!('evil-99999' in hostile.doc.enabledAssets), 'hostile keys dropped');
assert.deepStrictEqual(
  Object.keys(hostile.doc.assetWeightOverrides).sort(), [ASSETS[0].id, ASSETS[1].id].sort(),
  'weight overrides filtered to known ids',
);
assert.strictEqual(hostile.doc.assetWeightOverrides[ASSETS[1].id], 3);

// Unknown quality → fallback; a dangling key must never reach the caps lookup.
const badQ = parseProject({ version: 1, seed: 1, quality: 'ultra-mega' });
assert.ok(badQ.ok);
assert.strictEqual(badQ.doc.quality, 'balanced', 'unknown quality falls back on parse');
assert.strictEqual(sanitizeQuality('high'), 'high', 'known quality passes through');

// Apply path: same guarantees, no throw, no bloat, playable canvas.
useStore.getState().applyProject({ ...capped.doc, quality: 'ultra-mega', enabledAssets: hostileAssets });
const applied = useStore.getState();
assert.ok(applied.layers.length <= MAX_LAYERS, 'layers truncated on apply');
assert.strictEqual(applied.quality, 'balanced', 'unknown quality falls back on apply');
assert.ok(Object.keys(applied.enabledAssets).length < 500, 'enabledAssets bounded on apply');
assert.ok(Number.isFinite(applied.seed), 'applied doc stays playable');

console.log('projectDocument.selfcheck: OK');
