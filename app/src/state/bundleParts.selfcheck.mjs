// bundleParts.selfcheck.mjs — each bundle part is read by its own real validator (#1051).
import assert from 'node:assert';
import { buildBundle, parseBundle, BUNDLE_PARTS } from './bundle.js';
import { BUNDLE_SANITIZERS } from './bundleParts.js';
import { buildProjectPayload } from '../hooks/useProjectPayload.js';
import { sanitizeFavorite, createDavisSlice } from './slices/davisSlice.js';
import { defaultBiologyPolicy } from '../biology/policy.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('every part has a reader', () => {
  for (const p of BUNDLE_PARTS) assert.equal(typeof BUNDLE_SANITIZERS[p], 'function', p);
});

const fav = (seed, extra = {}) => ({
  id: `f${seed}`, seed, timestamp: '2026-10-05T12:00:00.000Z',
  config: { layout: {}, palette: { id: 'praystation' } }, ...extra,
});

ok('real favorites and keeps survive a trip through JSON, in order', () => {
  const favorites = [fav(1), fav(2)].map(sanitizeFavorite);
  const keeps = [fav(3), fav(4), fav(5)].map(sanitizeFavorite);
  const b = JSON.parse(JSON.stringify(buildBundle({ favorites, keeps })));
  const r = parseBundle(b, BUNDLE_SANITIZERS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.parts.favorites.value.map((f) => f.seed), [1, 2]);
  assert.deepEqual(r.parts.keeps.value.map((f) => f.seed), [3, 4, 5]);
  assert.deepEqual(r.parts.favorites.value, favorites);
});

ok('junk inside a list is dropped by the favorite sanitizer, not trusted', () => {
  const r = parseBundle(buildBundle({ favorites: [fav(1), { seed: 'NaN' }, null, 7] }), BUNDLE_SANITIZERS);
  assert.deepEqual(r.parts.favorites.value.map((f) => f.seed), [1]);
});

ok('a part of the wrong shape is refused by name, the rest still load', () => {
  const b = buildBundle({ favorites: [fav(1)], keeps: { not: 'a list' }, userPalettes: 'nope', canvasPresets: 5 });
  const r = parseBundle(b, BUNDLE_SANITIZERS);
  assert.equal(r.ok, true);
  assert.equal(r.parts.favorites.ok, true);
  assert.deepEqual([r.parts.keeps.ok, r.parts.userPalettes.ok, r.parts.canvasPresets.ok], [false, false, false]);
  assert.equal(r.parts.keeps.error, 'keeps is not a list');
});

ok('a real project payload round-trips through the project reader', () => {
  const project = buildProjectPayload({
    seed: 12345, seedOffsets: {}, paletteId: 'praystation', paletteOverrides: {}, paletteLocks: {},
    layoutParams: {}, lockedParams: {}, caGrid: null, enabledAssets: {}, quality: 'balanced',
    autoQuality: false, assetWeightOverrides: {}, assetKineme: {}, audioRoutes: null, midiMap: {},
    customAssets: [], layers: undefined, activeLayerId: undefined, layerSnapshots: {}, projectTitle: 'bundle test',
  });
  const r = parseBundle(JSON.parse(JSON.stringify(buildBundle({ project }))), BUNDLE_SANITIZERS);
  assert.equal(r.parts.project.ok, true, r.parts.project.error);
  assert.equal(r.parts.project.value.doc.seed, 12345);
});

ok('a project that is not a project is refused, with the importer\'s own reason', () => {
  const r = parseBundle(buildBundle({ project: 'hello', favorites: [] }), BUNDLE_SANITIZERS);
  assert.equal(r.parts.project.ok, false);
  assert.ok(r.parts.project.error.length > 0);
  assert.equal(r.parts.favorites.ok, true, 'an empty list is a valid list');
});

ok('biology policy: the shipped default is accepted, a mangled one is refused', () => {
  const good = parseBundle(buildBundle({ biology: defaultBiologyPolicy() }), BUNDLE_SANITIZERS);
  assert.equal(good.parts.biology.ok, true);
  const bad = parseBundle(buildBundle({ biology: { nonsense: true } }), BUNDLE_SANITIZERS);
  assert.equal(bad.parts.biology.ok, false);
});

ok('taste: a mangled file is refused', () => {
  const bad = parseBundle(buildBundle({ taste: { nope: 1 } }), BUNDLE_SANITIZERS);
  assert.equal(bad.parts.taste.ok, false);
});

ok('canvas presets are re-sanitized (capped, labelled)', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, w: 1920, h: 1080, fps: 30 }));
  const r = parseBundle(buildBundle({ canvasPresets: many }), BUNDLE_SANITIZERS);
  assert.equal(r.parts.canvasPresets.ok, true);
  assert.ok(r.parts.canvasPresets.value.length <= 24);
});

// The store side: importShelf replaces the shelf, sanitizes, and never wipes on a bad part.
function makeShelf() {
  let state = {};
  const set = (fn) => { state = { ...state, ...(typeof fn === 'function' ? fn(state) : fn) }; };
  state = createDavisSlice(set);
  return { get: () => state };
}
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

ok('importShelf replaces favorites and keeps with sanitized lists', () => quiet(() => {
  const s = makeShelf();
  s.get().importShelf({ favorites: [fav(1), { seed: 'x' }, fav(2)], keeps: [fav(9)] });
  assert.deepEqual(s.get().favorites.map((f) => f.seed), [1, 2]);
  assert.deepEqual(s.get().keeps.map((f) => f.seed), [9]);
}));

ok('importShelf: a missing part leaves that list alone (a refused part never wipes the shelf)', () => quiet(() => {
  const s = makeShelf();
  s.get().importShelf({ favorites: [fav(1)], keeps: [fav(2)] });
  s.get().importShelf({ favorites: undefined, keeps: [fav(3)] });
  assert.deepEqual(s.get().favorites.map((f) => f.seed), [1]);
  assert.deepEqual(s.get().keeps.map((f) => f.seed), [3]);
  s.get().importShelf({ favorites: 'junk', keeps: null });
  assert.deepEqual(s.get().favorites.map((f) => f.seed), [1]);
  assert.deepEqual(s.get().keeps.map((f) => f.seed), [3]);
  s.get().importShelf();
  assert.deepEqual(s.get().keeps.map((f) => f.seed), [3]);
}));

ok('importShelf caps both lists at 200', () => quiet(() => {
  const s = makeShelf();
  const many = Array.from({ length: 250 }, (_, i) => fav(i + 1));
  s.get().importShelf({ favorites: many, keeps: many });
  assert.equal(s.get().favorites.length, 200);
  assert.equal(s.get().keeps.length, 200);
}));

console.log(`bundleParts.selfcheck: ${n} checks passed`);
