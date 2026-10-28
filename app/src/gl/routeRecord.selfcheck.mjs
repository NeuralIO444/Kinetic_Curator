// node src/gl/routeRecord.selfcheck.mjs
// #1483 follow-up — a take carries its audio route table, and playback hears through it. Pins: the recorder keeps the
// starting table and every change by frame (an unchanged table is not a change; later store mutation cannot reach the
// record); the shape check fails closed; routesAt answers the table in force at any frame; a played take lays ITS
// table over the loop's store view frame by frame (and after a seek), a take without the section — or with a junk one
// — plays through the live table as before; the section survives the file; and the take button records it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRouteRecorder, checkRouteRecord, routesAt, ROUTE_RECORD_VERSION } from './routeRecord.mjs';
import { createLiveResolver } from './liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from './resolveTap.mjs';
import { createPerformanceRecorder, packPerformance, unpackPerformance } from './performanceFile.mjs';
import { startPlayback, stopPlayback, seekPlayback, overlayScene } from './playback.mjs';
import { DEFAULT_ROUTES } from './audioRoutes.mjs';
import { sanitizeAudioRoutes } from '../data/audioRoutes.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, '');

// two real tables: the defaults plus a route Davis opened, and the defaults less their last row (a closed route)
const FULL = sanitizeAudioRoutes([
  ...DEFAULT_ROUTES.map((r) => ({ ...r })),
  { input: 'treble', target: 'render.hue', depth: 15, by: 'davis' },
]);
const LESS = sanitizeAudioRoutes(DEFAULT_ROUTES.slice(0, -1).map((r) => ({ ...r })));
assert.ok(Array.isArray(FULL) && Array.isArray(LESS) && FULL.length === LESS.length + 2, 'two real custom tables');
const LIVE = [FULL[0]]; // "today's" table: differs from everything the take holds

await ok('the recorder keeps the starting table and every change by frame; an unchanged table is no change', () => {
  let frame = 0;
  const src = FULL.map((r) => ({ ...r }));
  const rec = createRouteRecorder({ initial: null, getFrame: () => frame });
  frame = 5;
  rec.set(null); // the same default routing: nothing
  rec.set(DEFAULT_ROUTES.map((r) => ({ ...r }))); // the default table spelled out IS the default routing: nothing
  rec.set(src);
  frame = 9;
  rec.set(src.map((r) => ({ ...r }))); // equal rows in a new array: nothing
  rec.set(LESS);
  frame = 12;
  rec.set([]);
  const r = rec.finish();
  assert.equal(r.version, ROUTE_RECORD_VERSION);
  assert.equal(r.initial, null, 'null (the default routing) stays null');
  assert.deepEqual(
    r.changes.map(([f, t]) => [f, t && t.length]),
    [
      [5, FULL.length],
      [9, LESS.length],
      [12, 0],
    ],
  );
  src[0].depth = 999; // the store mutating its table after the fact cannot reach the record
  assert.notEqual(r.changes[0][1][0].depth, 999);
  assert.equal(checkRouteRecord(r), r, 'a recorded section checks');
});

await ok('the shape check fails closed', () => {
  const good = { version: ROUTE_RECORD_VERSION, initial: null, changes: [[3, LESS]] };
  assert.equal(checkRouteRecord(good), good);
  for (const bad of [
    null,
    { ...good, version: 99 },
    { ...good, changes: 'x' },
    {
      ...good,
      changes: [
        [4, LESS],
        [3, FULL],
      ],
    }, // frames go backwards
    { ...good, changes: [[1.5, LESS]] },
    { ...good, changes: [[3, 'nope']] },
    { ...good, initial: [{ junk: true }] }, // a table that does not survive sanitizing
  ])
    assert.equal(checkRouteRecord(bad), null, JSON.stringify(bad)?.slice(0, 60));
});

await ok('routesAt: the starting table, then each change from its frame on', () => {
  const r = {
    version: ROUTE_RECORD_VERSION,
    initial: FULL,
    changes: [
      [10, LESS],
      [20, []],
    ],
  };
  assert.equal(routesAt(r, 0), FULL);
  assert.equal(routesAt(r, 9), FULL);
  assert.equal(routesAt(r, 10), LESS);
  assert.equal(routesAt(r, 19), LESS);
  assert.deepEqual(routesAt(r, 500), []);
});

// a real take (the playback selfcheck's rig, shortened), then the section laid on it
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const input = (f) => ({
  canvasW: 320,
  canvasH: 240,
  layers: [L('a')],
  activeLayerId: 'a',
  layerSnapshots: {},
  seed: 1483,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  perfClampOverride: null,
  scaleMul: 1,
  alphaBoost: 0,
  phraseWrapGen: 0,
  reducedMotion: false,
  quality: 'balanced',
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  effectiveScale: [0.5, 1.5],
  effectiveAlpha: [20, 100],
  assetAttach: {},
  attractor: null,
  dishPins: [],
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', count: 30, particleCount: 40 },
  loopTimeMs: (f + 1) * (1000 / 60),
  dtSec: 1 / 60,
});
const rec = createPerformanceRecorder();
const live = withResolveTap(createLiveResolver);
setResolveTap((i) => rec.onInput(i));
setResolveOutputTap((o) => rec.onOutput(o));
for (let f = 0; f < 70; f++) live.resolveLayers(input(f));
setResolveTap(null);
setResolveOutputTap(null);
live.dispose();
const bare = rec.finish();
const routes = { version: ROUTE_RECORD_VERSION, initial: FULL, changes: [[30, LESS]] };
const take = { ...bare, routes };

/** Advance the playing take `k` frames (live inputs are ignored while it plays). */
function advance(k) {
  const r = withResolveTap(createLiveResolver);
  for (let i = 0; i < k; i++) r.resolveLayers(input(9000 + i));
  r.dispose();
}

await ok("a played take lays ITS route table over the loop's view, frame by frame and after a seek", () => {
  const state = { audioRoutes: LIVE, beatBpm: 100 };
  assert.equal(overlayScene(state).audioRoutes, LIVE, 'not playing: the live table');
  assert.equal(startPlayback(take), true);
  assert.deepEqual(overlayScene(state).audioRoutes, FULL, 'frame 0: the table the take began with');
  advance(31);
  assert.deepEqual(overlayScene(state).audioRoutes, LESS, 'past frame 30: the table as the take changed it');
  assert.equal(state.audioRoutes, LIVE, "the store's own table is never written");
  seekPlayback(10);
  assert.deepEqual(overlayScene(state).audioRoutes, FULL, 'seek back: the table at that frame');
  stopPlayback();
  assert.equal(overlayScene(state).audioRoutes, LIVE, 'stopped: the live table again');
});

await ok('a take without the section, or with a junk one, plays through the live table as before', () => {
  const state = { audioRoutes: LIVE };
  for (const t of [bare, { ...bare, routes: { version: 7 } }]) {
    assert.equal(startPlayback(t), true, 'the take itself still plays');
    assert.equal(overlayScene(state).audioRoutes, LIVE);
    stopPlayback();
  }
});

await ok('the section survives the file', async () => {
  const back = await unpackPerformance(await packPerformance(take));
  assert.deepEqual(back.routes, routes);
  assert.equal(startPlayback(back), true);
  assert.deepEqual(overlayScene({ audioRoutes: LIVE }).audioRoutes, FULL);
  stopPlayback();
});

await ok('wired: the take button records `routes` from the store table and every change', () => {
  const src = flat(readFileSync(new URL('../components/PerformanceButton.jsx', import.meta.url), 'utf8'));
  assert.ok(src.includes(flat('createRouteRecorder({ initial: useStore.getState().audioRoutes, getFrame })')));
  assert.ok(src.includes(flat('if (s.audioRoutes !== prev.audioRoutes) rec.set(s.audioRoutes);')));
  assert.ok(
    src.includes(flat('spectrum: spectrumSection, routes: routesSection')),
    'the section is registered with the take',
  );
  const pb = flat(readFileSync(new URL('./playback.mjs', import.meta.url), 'utf8'));
  assert.ok(pb.includes(flat('if (active.routes) out.audioRoutes = routesAt(active.routes, active.index);')));
  const canvas = flat(readFileSync(new URL('../panels/CanvasPanel.jsx', import.meta.url), 'utf8'));
  assert.ok(canvas.includes(flat('getState: () => overlayScene(useStore.getState())')), 'the loop reads the overlay');
});

console.log(`routeRecord.selfcheck: ${n} checks passed (#1483 — a take hears through its own routes)`);
