// busChain.selfcheck.mjs — the WHOLE chain, run for real: emit -> wireEventBus -> dispatch -> applyAction -> store.
//
// The older wiring checks grep UI source for call text, so they pass when the code is wrong in a way that still reads
// right (a handler passing `p.id` where the case reads `action.key`; an action constant with no case, which only logs
// "Unhandled action"). This one drives the real bus on the real store, from a real exported session
// (fixtures/stimuliSession.json: the STIMULI / BUILD session Matt reviewed on #1468).
//
//   A. every event the registry says is wired reaches a real case (no "Unhandled action", no throw)
//   B. the session loads: routes, the FIELD patch link, the PATTERN track, the FX and MATH stacks
//   C. the events Matt exercised do what the controls promise, and undo undoes them
//   D. hostile payloads (what a persona or a model reply could send) cannot corrupt the stage
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, emit } from './eventBus.js';
import { EVENT_REGISTRY } from './eventRegistry.js';
import { wireEventBus } from './wireEventBus.js';
import { applyAction } from '../state/applyAction.js';
import { useStore } from '../state/store.js';
import { parseProject } from '../state/projectDocument.js';
import { DEFAULT_ROUTES } from '../gl/audioRoutes.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const S = () => useStore.getState();
const snap = (v) => JSON.parse(JSON.stringify(v));

// the dispatch pipe coalesces per-frame streams on requestAnimationFrame; a microtask stands in for a frame in Node
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };
globalThis.cancelAnimationFrame = () => {};
const tick = () => new Promise((r) => setTimeout(r, 0));

// the bus is wired once, to the real action applier (what AppContext's dispatch calls)
wireEventBus(applyAction);

const warns = [];
const errors = [];
const realWarn = console.warn; const realError = console.error;
console.warn = (...a) => { warns.push(a.join(' ')); };
console.error = (...a) => { errors.push(a.join(' ')); };

// ── A ───────────────────────────────────────────────────────────────────────────────────────────────────────
ok('every event the registry says is wired reaches a real action case (no "Unhandled action", no throw)', () => {
  const wired = Object.entries(EVENT_REGISTRY).filter(([, e]) => e.handler === 'wire').map(([k]) => k);
  assert.ok(wired.length > 100, `a large wired set (${wired.length})`);
  const before = snap(S().layers);
  for (const key of wired) {
    warns.length = 0; errors.length = 0;
    assert.ok(Events[key], `${key} is a bus event`);
    emit(Events[key], {}); // an empty payload: the slices must sanitise, never throw
    const bad = warns.filter((w) => /Unhandled action/.test(w));
    assert.deepEqual(bad, [], `${key}: an action with no case`);
    assert.deepEqual(errors.filter((e) => /\[eventBus\]/.test(e)), [], `${key}: a handler threw on {}`);
  }
  void before;
});
await tick(); // flush the coalesced per-frame actions, then check them too
ok('coalesced per-frame actions also reach a case and do not throw once flushed', () => {
  assert.deepEqual(warns.filter((w) => /Unhandled action/.test(w)), []);
  assert.deepEqual(errors.filter((e) => /\[dispatchPipe\]/.test(e)), []);
});

// ── B ───────────────────────────────────────────────────────────────────────────────────────────────────────
const fixture = JSON.parse(readFileSync(new URL('./fixtures/stimuliSession.json', import.meta.url), 'utf8'));
const parsed = parseProject(snap(fixture));
assert.ok(parsed.ok !== false && (parsed.doc || parsed.project || parsed), 'the session parses');
S().applyProject(parsed.doc || parsed.project || parsed);
const layerByName = (name) => S().layers.find((l) => l.name === name);

ok('the session loads: tracks in order, the FIELD patch link, the PATTERN track, the FX and MATH stacks, two routes', () => {
  assert.deepEqual(S().layers.map((l) => l.name), ['PT-1', 'KC-1', 'FX 1', 'KC-2', 'M 1']);
  assert.deepEqual(S().layers.map((l) => l.type), ['pattern', 'content', 'fx', 'content', 'math']);
  assert.equal(layerByName('KC-1').patch.mode, 'field');
  assert.equal(layerByName('KC-1').patch.to, layerByName('KC-2').id, 'the link names KC-2 by its id');
  assert.equal(layerByName('PT-1').pattern.mode, 'FIELD');
  assert.deepEqual(layerByName('FX 1').effects.map((e) => e.kind), ['sharpen', 'haze', 'tear']);
  assert.deepEqual(layerByName('M 1').effects.map((e) => e.kind), ['threshold', 'contrast']);
  assert.equal(layerByName('M 1').layerBlendMode, 'difference');
  assert.deepEqual(S().audioRoutes.map((r) => [r.input, r.target, r.depth]), [['band.air', 'render.scale', 0.2], ['band.sub', 'color.hue', 15]]);
  assert.equal(S().paletteId, 'strata');
});

// ── C ───────────────────────────────────────────────────────────────────────────────────────────────────────
ok('audio routes: add, undo, clear, reset to the default table (the matrix controls, through the bus)', () => {
  const start = snap(S().audioRoutes);
  emit(Events.AUDIO_ROUTES_EDIT, { fn: (t) => [...t, { input: 'band.mud', target: 'render.alpha', depth: 0.3 }], continuous: false });
  assert.equal(S().audioRoutes.length, 3);
  assert.equal(S().audioRoutes[2].input, 'band.mud');
  S().undo();
  assert.deepEqual(S().audioRoutes, start, 'one undo step takes the edit back');
  emit(Events.AUDIO_ROUTES_SET, { routes: [], continuous: false });
  assert.deepEqual(S().audioRoutes, [], 'CLEAR: an empty table, not the default');
  emit(Events.AUDIO_ROUTES_SET, { routes: null, continuous: false });
  assert.equal(S().audioRoutes, null, 'RESET: null is the default table (never a stored copy)');
  // the first edit from the default customises a COPY of it
  emit(Events.AUDIO_ROUTES_EDIT, { fn: (t) => t.slice(0, 2), continuous: false });
  assert.deepEqual(snap(S().audioRoutes), snap(DEFAULT_ROUTES.slice(0, 2)), 'an edit from the default starts from the default rows');
  emit(Events.AUDIO_ROUTES_SET, { routes: start, continuous: false });
});

ok('a slider drag (continuous) coalesces into ONE undo step', () => {
  const start = snap(S().audioRoutes);
  const depth = (v) => (t) => t.map((r, i) => (i === 0 ? { ...r, depth: v } : r));
  const undoBefore = S().historyUndoStack.length;
  for (const v of [0.3, 0.4, 0.5, 0.6]) emit(Events.AUDIO_ROUTES_EDIT, { fn: depth(v), continuous: true });
  assert.equal(S().audioRoutes[0].depth, 0.6);
  assert.ok(S().historyUndoStack.length - undoBefore <= 1, 'one step for the whole drag');
  S().undo();
  assert.deepEqual(S().audioRoutes, start);
});

ok('BEAT: the BPM is clamped to the dial range; the metro switch is a boolean', () => {
  emit(Events.BEAT_BPM, { bpm: 90 });
  assert.equal(S().beatBpm, 90);
  emit(Events.BEAT_BPM, { bpm: 99999 });
  assert.ok(S().beatBpm <= 300 && S().beatBpm >= 30, `clamped (${S().beatBpm})`);
  emit(Events.BEAT_METRO, { on: false });
  assert.equal(S().beatMetro, false);
  emit(Events.BEAT_METRO, { on: true });
  assert.equal(S().beatMetro, true);
});

ok('PATCH link: OFF, MOD, FEED rewrite the one layer; the strength clamps', () => {
  const kc1 = layerByName('KC-1').id; const kc2 = layerByName('KC-2').id;
  emit(Events.LAYER_PATCH, { id: kc1, patch: { mode: 'mod', to: kc2, strength: 0.5 } });
  assert.deepEqual(S().layers.find((l) => l.id === kc1).patch, { mode: 'mod', to: kc2, strength: 0.5 });
  emit(Events.LAYER_PATCH, { id: kc1, patch: { mode: 'feed', to: kc2, strength: 7 } });
  assert.equal(S().layers.find((l) => l.id === kc1).patch.strength, 1, 'strength clamps to 1');
  emit(Events.LAYER_PATCH, { id: kc1, patch: { mode: 'off', to: null, strength: 0.16 } });
  assert.equal(S().layers.find((l) => l.id === kc1).patch.mode, 'off');
});

ok('PATTERN track: mode and params change; a new track is added as ground; select moves the editor', () => {
  const pt = layerByName('PT-1').id;
  emit(Events.PATTERN_MODE, { id: pt, mode: 'QUILT' });
  assert.equal(S().layers.find((l) => l.id === pt).pattern.mode, 'QUILT');
  emit(Events.PATTERN_PARAM, { id: pt, key: 'drift', value: 0.5 });
  assert.equal(S().layers.find((l) => l.id === pt).pattern.drift, 0.5);
  const count = S().layers.length;
  emit(Events.PATTERN_ADD, { mode: 'GLYPH' });
  assert.equal(S().layers.length, count + 1);
});

ok('the rest of the controls Matt exercised: canvas, creature count, MIDI, startup, queue, macros', () => {
  emit(Events.CANVAS_SIZE, { w: 1080, h: 1920, presetId: 'custom' });
  assert.deepEqual([S().canvasW, S().canvasH], [1080, 1920]);
  emit(Events.CREATURE_COUNT, { n: 3 });
  assert.equal(S().creatureCount, 3);
  emit(Events.CREATURE_COUNT, { n: 99 });
  assert.equal(S().creatureCount, 4, 'the TE four');
  emit(Events.MIDI_ENABLED, { on: true });
  assert.equal(S().midiEnabled, true);
  emit(Events.MIDI_ENABLED, { on: false });
  const macros = (S().mathMacros || []).length;
  emit(Events.MACRO_ADD);
  assert.equal((S().mathMacros || []).length, macros + 1);
  const id = S().mathMacros[S().mathMacros.length - 1].id;
  emit(Events.MACRO_RENAME, { id, name: 'swell' });
  assert.equal(S().mathMacros.find((m) => m.id === id).name, 'swell');
  emit(Events.MACRO_REMOVE, { id });
  assert.equal((S().mathMacros || []).length, macros);
});

// ── D ───────────────────────────────────────────────────────────────────────────────────────────────────────
ok('hostile payloads (a persona or a model reply) cannot corrupt the stage', () => {
  const layersBefore = snap(S().layers);
  const routesBefore = snap(S().audioRoutes);
  warns.length = 0; errors.length = 0;
  // unknown ids and junk modes change nothing
  emit(Events.LAYER_PATCH, { id: 'no-such-layer', patch: { mode: 'x', to: 'y', strength: NaN } });
  emit(Events.PATTERN_PARAM, { id: 'no-such-layer', key: 'drift', value: 1 });
  emit(Events.PATTERN_MODE, { id: layerByName('PT-1').id, mode: 'NOT-A-MODE' });
  assert.equal(layerByName('PT-1').pattern.mode, snap(layersBefore.find((l) => l.name === 'PT-1')).pattern.mode, 'junk mode refused');
  // prototype pollution through a param key
  emit(Events.PATTERN_PARAM, { id: layerByName('PT-1').id, key: '__proto__', value: { polluted: 1 } });
  emit(Events.PATTERN_PARAM, { id: layerByName('PT-1').id, key: 'constructor', value: 1 });
  assert.equal({}.polluted, undefined, 'Object.prototype is intact');
  // junk routes are dropped by the sanitiser, valid ones survive
  emit(Events.AUDIO_ROUTES_SET, { routes: [{ input: 'band.nope', target: 'render.scale', depth: 1 }, { input: 'band.air', target: 'render.scale', depth: 0.2 }, null, 7], continuous: false });
  assert.deepEqual(S().audioRoutes.map((r) => r.input), ['band.air'], 'only the valid route is kept');
  emit(Events.AUDIO_ROUTES_SET, { routes: routesBefore, continuous: false });
  // numbers: NaN / Infinity / strings do not become state
  emit(Events.BEAT_BPM, { bpm: NaN });
  assert.ok(Number.isFinite(S().beatBpm), 'BPM stays finite');
  emit(Events.CANVAS_SIZE, { w: -5, h: 'wide', presetId: 'custom' });
  assert.ok(S().canvasW > 0 && S().canvasH > 0 && Number.isFinite(S().canvasW), 'canvas size stays valid');
  emit(Events.CREATURE_COUNT, { n: 'lots' });
  assert.ok(Number.isInteger(S().creatureCount) && S().creatureCount >= 0 && S().creatureCount <= 4);
  // the layer list is still structurally the session's (no layer lost, none invented by the junk above)
  assert.deepEqual(S().layers.map((l) => l.id).filter((id) => layersBefore.some((l) => l.id === id)), layersBefore.map((l) => l.id));
  assert.deepEqual(errors.filter((e) => /\[eventBus\]/.test(e)), [], 'nothing threw');
});

console.warn = realWarn; console.error = realError;
console.log(`busChain.selfcheck: ${n} checks passed (the real chain, ${Object.values(EVENT_REGISTRY).filter((e) => e.handler === 'wire').length} wired events)`);
