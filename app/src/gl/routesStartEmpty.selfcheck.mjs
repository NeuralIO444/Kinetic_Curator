// #1477 — routes start empty: a fresh project has all routes off; AUTO fills them; the metro keeps a small breath of its
// own; her set is not inert; and a document saved before this still loads as the default table.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useStore } from '../state/store.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { DEFAULT_ROUTES, METRO_BREATH, hasNoRoutes, effectiveRoutes, metroBreath, audioRoutes } from './audioRoutes.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const loud = { rms: 0.8, bass: 0.9, mid: 0.6, treble: 0.5, beatPulse: 1 };
const P = { depth: 1, scaleMod: 1, alphaMod: 1 };

ok('a fresh store has no routes at all ([]), not the default table', () => {
  assert.deepEqual(useStore.getState().audioRoutes, []);
  assert.equal(hasNoRoutes(useStore.getState().audioRoutes), true);
  assert.equal(hasNoRoutes(null), false, 'null is the default table');
  assert.equal(hasNoRoutes([{ input: 'beat', target: 'render.scale', depth: 0.1 }]), false);
});

ok('with an empty table real audio moves nothing until routes exist (AUTO builds them)', () => {
  const r = audioRoutes(loud, P, [], null);
  assert.equal(r.scaleMul, 1); assert.equal(r.alphaBoost, 0); assert.equal(r.breathAudio, 0); assert.equal(r.glow, 0);
  const d = audioRoutes(loud, P, null, null);
  assert.ok(d.scaleMul > 1, 'the default table, by contrast, reacts');
});

ok('a fresh project saves its empty table, and loads it back empty (it is a state, not a missing one)', () => {
  const base = { seed: 7, paletteId: 'bone', layoutParams: {}, audioRoutes: [] };
  const doc = serializeProject(base);
  assert.deepEqual(doc.audioRoutes, [], 'saved');
  const back = parseProject(JSON.parse(JSON.stringify(doc))).doc;
  assert.deepEqual(back.audioRoutes, [], 'and reloads empty');
});

ok('a document saved before this (no table) still loads as the default, so old sessions are untouched', () => {
  const old = JSON.parse(JSON.stringify(serializeProject({ seed: 7, paletteId: 'bone', layoutParams: {}, audioRoutes: null })));
  assert.ok(!('audioRoutes' in old));
  assert.strictEqual(parseProject(old).doc.audioRoutes, null, 'absent -> default table');
  useStore.getState().applyProject(parseProject(old).doc);
  assert.strictEqual(useStore.getState().audioRoutes, null);
  assert.equal(DEFAULT_ROUTES.length >= 5, true);
});

ok('RESET still means the default table, CLEAR means none, and both undo', () => {
  useStore.setState({ audioRoutes: [], historyUndoStack: [], historyRedoStack: [] });
  useStore.getState().setAudioRoutes(null);
  assert.strictEqual(useStore.getState().audioRoutes, null, 'RESET: the default');
  useStore.getState().undo();
  assert.deepEqual(useStore.getState().audioRoutes, [], 'undo: back to none');
});

ok('the metro keeps a small breath of its own: only with an empty table, no audio, metro on', () => {
  const live = { routes: [], audioOn: false, metro: true, beatPulse: 1 };
  assert.ok(Math.abs(metroBreath(live) - METRO_BREATH) < 1e-9, 'full pulse = the built-in depth');
  assert.ok(metroBreath({ ...live, beatPulse: 0.5 }) < metroBreath(live), 'follows the pulse');
  assert.equal(metroBreath({ ...live, beatPulse: 0 }), 0);
  assert.equal(metroBreath({ ...live, metro: false }), 0, 'metro off: still');
  assert.equal(metroBreath({ ...live, audioOn: true }), 0, 'real audio replaces it');
  assert.equal(metroBreath({ ...live, routes: null }), 0, 'the default table has its own beat routes');
  assert.equal(metroBreath({ ...live, routes: [{ input: 'beat', target: 'render.scale', depth: 0.1 }] }), 0, 'routing the beat anywhere replaces it');
  assert.ok(metroBreath({ ...live, beatPulse: NaN }) === 0 && metroBreath({ ...live, beatPulse: 99 }) <= 0.2);
});

ok('her set is not inert: with no routes of your own it uses the default routing while it plays, and only then', () => {
  assert.strictEqual(effectiveRoutes([], true), null, 'set playing + no routes -> default routing');
  assert.deepEqual(effectiveRoutes([], false), [], 'no set: stays empty');
  const mine = [{ input: 'band.air', target: 'render.scale', depth: 0.2 }];
  assert.strictEqual(effectiveRoutes(mine, true), mine, 'your own routes always win');
  assert.strictEqual(effectiveRoutes(null, true), null);
});

ok('wiring: the loop uses these, and the slice default is []', () => {
  const loop = src('./liveLoop.mjs');
  assert.match(loop, /effectiveRoutes\(s\.audioRoutes, !!synth\)/);
  assert.match(loop, /metroBreath\(\{ routes: s\.audioRoutes, audioOn, metro: s\.beatMetro, beatPulse: s\.beatPulse \}\)/);
  assert.match(src('../state/slices/audioSlice.js'), /audioRoutes: \[\],/);
});

console.log(`routesStartEmpty.selfcheck: ${n} checks passed`);
