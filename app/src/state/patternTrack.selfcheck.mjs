// patternTrack.selfcheck.mjs — the PATTERN track in the layer model (#1097).
// Node-only, via the real store (layersPatch.selfcheck pattern): seed deterministic layers,
// then call the actions. No renderer, no UI: the block rides the project, nothing draws it yet.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { useStore } from './store.js';
import { MAX_CONTENT_TRACKS, isPatternLayer, isKcLayer, displayLayerName } from './slices/layersSlice.js';
import { normalizeLayers } from './projectNormalize.js';
import {
  PATTERN_MODES, PATTERN_DEFAULT_DENSITY, defaultPattern, sanitizePattern,
} from './patternTrack.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const kc = (id, extra = {}) => ({ id, name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 }, ...extra });
const seed = (layers = [kc('kc-a')], activeLayerId = 'kc-a') => {
  useStore.setState({ layers, activeLayerId, layerSnapshots: {}, selectedPatternLayerId: null, historyUndoStack: [], historyRedoStack: [] });
};
const S = () => useStore.getState();
const pt = () => S().layers.find(isPatternLayer);

// ── sanitizePattern ─────────────────────────────────────────────────────────
ok('defaults per mode: density 8 / 4 / 6, seed a stored uint32, DRIFT 0, DROP off', () => {
  assert.deepEqual(PATTERN_DEFAULT_DENSITY, { QUILT: 8, GLYPH: 4, FIELD: 6 });
  for (const m of PATTERN_MODES) {
    const p = defaultPattern(m, 0xdeadbeef);
    assert.equal(p.mode, m); assert.equal(p.seed, 0xdeadbeef); assert.equal(p.density, PATTERN_DEFAULT_DENSITY[m]);
    assert.equal(p.drift, 0); assert.equal(p.drop, false);
    assert.deepEqual(sanitizePattern(p), p, 'a default is a fixed point of the sanitizer');
  }
  assert.equal(defaultPattern('QUILT').mix, 0.55);
  assert.equal(defaultPattern('QUILT').grout, 0.03);
  assert.equal(defaultPattern('QUILT').hero, 0.25);
  assert.equal(defaultPattern('nope').mode, 'QUILT');
});

ok('sanitizePattern clamps, defaults and never throws on junk', () => {
  const p = sanitizePattern({ mode: 'GLYPH', seed: -1, density: 99, mix: 7, grout: 5, hero: -3, drift: 'x', drop: 'yes' });
  assert.deepEqual(p, { mode: 'GLYPH', seed: 0xffffffff, density: 12, mix: 1, grout: 0.08, hero: 0, drift: 0, drop: false, kin: 'OFF', movers: 0.3 });
  assert.equal(sanitizePattern({ density: 1 }).density, 4);
  assert.equal(sanitizePattern({ density: 7.6 }).density, 8, 'density is an integer');
  assert.equal(sanitizePattern({ seed: 2 ** 40 }).seed, (Math.floor(2 ** 40) >>> 0));
  assert.equal(sanitizePattern({ mode: 'ESCHER' }).mode, 'QUILT', 'ESCHER is parked, not in the enum');
  for (const junk of [undefined, null, 0, 'x', [], [1, 2], NaN, () => 1, { mode: {} }, { seed: {} }, { density: [] }, { mix: '' }]) {
    const out = sanitizePattern(junk);
    assert.deepEqual(Object.keys(out).sort(), ['density', 'drift', 'drop', 'grout', 'hero', 'kin', 'mix', 'mode', 'movers', 'seed']);
    assert.ok(Number.isInteger(out.seed) && out.seed >= 0 && out.seed <= 0xffffffff);
  }
  assert.equal(sanitizePattern({ drop: true }).drop, true);
});

// ── the slice ───────────────────────────────────────────────────────────────
ok('addPatternLayer: appended as type pattern (PT-n), a KC track stays active, no snapshot, no patch', () => {
  seed();
  S().addPatternLayer('GLYPH');
  const p = pt();
  assert.ok(p && p.type === 'pattern' && p.name === 'PT-1' && p.visible === true);
  assert.equal(p.pattern.mode, 'GLYPH'); assert.equal(p.pattern.density, 4);
  assert.ok(Number.isInteger(p.pattern.seed) && p.pattern.seed >= 0);
  assert.equal(p.patch, undefined);
  assert.equal(S().activeLayerId, 'kc-a', 'a pattern track never takes the active slot');
  assert.equal(S().layerSnapshots[p.id], undefined, 'and has no snapshot');
  assert.equal(isKcLayer(p), false); assert.equal(isKcLayer(S().layers[0]), true);
  assert.equal(isKcLayer({ id: 'old' }), true, 'an untyped legacy layer is a KC track');
  S().addPatternLayer();
  assert.equal(S().layers.filter(isPatternLayer)[1].name, 'PT-2');
  assert.equal(S().layers.filter(isPatternLayer)[1].pattern.mode, 'QUILT', 'default mode');
});

ok('the content cap counts PATTERN tracks (4 total)', () => {
  seed();
  for (let i = 0; i < 6; i++) S().addPatternLayer();
  assert.equal(S().layers.filter((l) => !['fx', 'math'].includes(l.type)).length, MAX_CONTENT_TRACKS);
  S().addLayer();
  assert.equal(S().layers.length, MAX_CONTENT_TRACKS, 'a KC track is refused once the cap is full');
});

ok('setPatternParam: clamps through the sanitizer, ignores unknown keys, mode and seed, and no-ops on an equal value', () => {
  seed(); S().addPatternLayer('QUILT');
  const id = pt().id;
  S().setPatternParam(id, 'drift', 5);
  assert.equal(pt().pattern.drift, 1);
  S().setPatternParam(id, 'density', 3);
  assert.equal(pt().pattern.density, 4);
  S().setPatternParam(id, 'drop', true);
  assert.equal(pt().pattern.drop, true);
  const before = JSON.stringify(S().layers);
  S().setPatternParam(id, 'seed', 5);        // seed only moves by SHUFFLE
  S().setPatternParam(id, 'mode', 'GLYPH');  // mode only moves by setPatternMode
  S().setPatternParam(id, 'wat', 1);
  S().setPatternParam('missing', 'drift', 1);
  S().setPatternParam('kc-a', 'drift', 1);   // a KC track has no pattern block
  assert.equal(JSON.stringify(S().layers), before);
  const stack = S().historyUndoStack.length;
  S().setPatternParam(id, 'drift', 1);       // equal value
  assert.equal(S().historyUndoStack.length, stack, 'an equal value is not an undo entry');
});

ok('setPatternMode: switches mode; an untouched density follows the new mode, a touched one stays', () => {
  seed(); S().addPatternLayer('QUILT');
  const id = pt().id;
  S().setPatternMode(id, 'GLYPH');
  assert.equal(pt().pattern.mode, 'GLYPH'); assert.equal(pt().pattern.density, 4);
  S().setPatternMode(id, 'FIELD');
  assert.equal(pt().pattern.density, 6);
  S().setPatternParam(id, 'density', 10);
  S().setPatternMode(id, 'QUILT');
  assert.equal(pt().pattern.density, 10, 'a density the user set is kept');
  S().setPatternMode(id, 'ESCHER');
  assert.equal(pt().pattern.mode, 'QUILT', 'an unknown mode falls back, and never throws');
});

ok('shufflePattern: writes a new uint32 seed, keeps every other field, never repeats the seed', () => {
  seed(); S().addPatternLayer('QUILT');
  const id = pt().id;
  S().setPatternParam(id, 'mix', 0.2);
  const before = { ...pt().pattern };
  const seen = new Set([before.seed]);
  for (let i = 0; i < 20; i++) {
    const prev = pt().pattern.seed;
    S().shufflePattern(id);
    const p = pt().pattern;
    assert.notEqual(p.seed, prev);
    assert.ok(Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 0xffffffff);
    assert.deepEqual({ ...p, seed: 0 }, { ...before, seed: 0 });
    seen.add(p.seed);
  }
  assert.ok(seen.size > 10, 'seeds are random');
});

ok('undo and redo carry a pattern edit', () => {
  seed(); S().addPatternLayer('QUILT');
  const id = pt().id; const s0 = pt().pattern.seed;
  S().shufflePattern(id);
  const s1 = pt().pattern.seed;
  assert.notEqual(s0, s1);
  S().undo();
  assert.equal(pt().pattern.seed, s0, 'undo restores the seed');
  S().redo();
  assert.equal(pt().pattern.seed, s1, 'redo reapplies it');
  S().undo(); S().undo();
  assert.equal(S().layers.filter(isPatternLayer).length, 0, 'undo also removes the track');
});

ok('a PATTERN track is never the active layer, a PATCH source or a PATCH target', () => {
  seed([kc('kc-a'), kc('kc-b')]); S().addPatternLayer();
  const id = pt().id;
  S().setActiveLayer(id);
  assert.equal(S().activeLayerId, 'kc-a');
  S().setLayerPatch(id, { mode: 'mod', to: 'kc-a', strength: 0.5 });
  assert.equal(pt().patch, undefined, 'a pattern track cannot be a PATCH source');
  S().setLayerPatch('kc-a', { mode: 'mod', to: id, strength: 0.5 });
  assert.equal(S().layers.find((l) => l.id === 'kc-a').patch.to, null, 'nor a PATCH target');
  S().setLayerPatch('kc-a', { mode: 'mod', to: 'kc-b', strength: 0.5 });
  assert.equal(S().layers.find((l) => l.id === 'kc-a').patch.to, 'kc-b');
});

ok('removing: a PATTERN track goes freely, the LAST KC track stays even if a pattern track remains', () => {
  seed(); S().addPatternLayer();
  const id = pt().id;
  S().removeLayer('kc-a');
  assert.ok(S().layers.some((l) => l.id === 'kc-a'), 'the last KC track stays (it owns the seed and the sliders)');
  S().removeLayer(id);
  assert.equal(S().layers.filter(isPatternLayer).length, 0);
  seed([kc('kc-a'), kc('kc-b')]); S().addPatternLayer();
  S().removeLayer('kc-a');
  assert.equal(S().activeLayerId, 'kc-b', 'the next active layer is a KC track, never the pattern track');
});

ok('duplicate: a copy of a PATTERN track is the same pattern, no snapshot; the cap and solo treat it as content', () => {
  seed(); S().addPatternLayer('GLYPH'); S().setPatternParam(pt().id, 'drift', 0.5);
  const src = pt();
  S().duplicateLayer(src.id);
  const ps = S().layers.filter(isPatternLayer);
  assert.equal(ps.length, 2);
  assert.deepEqual(ps[1].pattern, src.pattern);
  assert.ok(ps[1].id !== src.id && S().layerSnapshots[ps[1].id] === undefined);
  assert.equal(S().layers.indexOf(ps[1]), S().layers.indexOf(ps[0]) + 1);
  S().soloLayer(ps[0].id);
  assert.ok(S().layers.find((l) => l.id === ps[0].id).visible);
  assert.ok(!S().layers.find((l) => l.id === 'kc-a').visible, 'solo hides the other content tracks');
});

ok('selection: adding a PATTERN track opens its editor; only a pattern id can be selected; removing clears it', () => {
  seed([kc('kc-a'), kc('kc-b')]);
  assert.equal(S().selectedPatternLayerId, null);
  S().addPatternLayer();
  const id = pt().id;
  assert.equal(S().selectedPatternLayerId, id, 'a new pattern track opens its editor, like a new FX track');
  S().selectPatternLayer('kc-a');
  assert.equal(S().selectedPatternLayerId, null, 'a KC id is not a pattern id');
  S().selectPatternLayer(id);
  assert.equal(S().selectedPatternLayerId, id);
  S().selectPatternLayer('missing');
  assert.equal(S().selectedPatternLayerId, null);
  S().selectPatternLayer(id);
  S().removeLayer(id);
  assert.equal(S().selectedPatternLayerId, null, 'removing the track clears the selection');
  assert.equal(S().activeLayerId, 'kc-a', 'and the KC track stays the active one throughout');
});

ok('names: PT-n is positional, a rename keeps the position visible', () => {
  assert.equal(displayLayerName({ type: 'pattern', name: 'PT-3' }, 1), 'PT-1');
  assert.equal(displayLayerName({ type: 'pattern', name: 'PT-1 copy' }, 2), 'PT-2');
  assert.equal(displayLayerName({ type: 'pattern', name: 'quilt' }, 1), 'PT-1 · quilt');
});

// ── normalize / project ─────────────────────────────────────────────────────
ok('normalizeLayers keeps a valid pattern, repairs a broken one, and keeps the active layer a KC track', () => {
  const raw = [
    kc('kc-a'),
    { id: 'pt-1', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'multiply', layerOpacity: 0.5, pattern: { mode: 'FIELD', seed: 9, density: 6, mix: 0.4, grout: 0, hero: 0, drift: 0.3, drop: true } },
    { id: 'pt-2', name: 'PT-2', type: 'pattern', pattern: { mode: 'WAT', seed: 'x', density: 500, mix: 9 } },
    { id: 'pt-3', type: 'pattern' },
  ];
  const { layers, activeLayerId } = normalizeLayers(raw, 'pt-1');
  assert.equal(activeLayerId, 'kc-a', 'an active id that points at a pattern track falls back to a KC track');
  const p1 = layers.find((l) => l.id === 'pt-1');
  assert.equal(p1.type, 'pattern'); assert.equal(p1.layerBlendMode, 'multiply'); assert.equal(p1.layerOpacity, 0.5);
  assert.deepEqual(p1.pattern, { mode: 'FIELD', seed: 9, density: 6, mix: 0.4, grout: 0, hero: 0, drift: 0.3, drop: true, kin: 'OFF', movers: 0.3 });
  assert.equal(p1.patch, undefined);
  const p2 = layers.find((l) => l.id === 'pt-2');
  assert.equal(p2.pattern.mode, 'QUILT'); assert.equal(p2.pattern.density, 12); assert.equal(p2.pattern.mix, 1);
  assert.deepEqual(layers.find((l) => l.id === 'pt-3').pattern, sanitizePattern(undefined), 'a missing block gets defaults');
});

ok('normalizeLayers: PATTERN counts toward the content cap; a PATTERN-only document is invalid; PATCH never targets one', () => {
  const many = [kc('kc-a'), ...['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id, type: 'pattern', pattern: {} }))];
  assert.equal(normalizeLayers(many, 'kc-a').layers.length, MAX_CONTENT_TRACKS);
  assert.equal(normalizeLayers([{ id: 'p1', type: 'pattern', pattern: {} }], 'p1').layers, null, 'a KC track must exist');
  const patched = normalizeLayers([kc('kc-a', { patch: { mode: 'mod', to: 'pt-1', strength: 0.3 } }), { id: 'pt-1', type: 'pattern', pattern: {} }], 'kc-a');
  assert.equal(patched.layers[0].patch.to, null);
});

ok('a project with no pattern track is untouched: normalize output is identical with and without the feature', () => {
  const raw = [kc('kc-a'), kc('kc-b', { layerBlendMode: 'screen', layerOpacity: 0.7 })];
  const { layers } = normalizeLayers(raw, 'kc-b');
  assert.deepEqual(layers.map((l) => [l.id, l.type, l.layerBlendMode, l.layerOpacity, l.patch.mode]), [['kc-a', 'content', 'normal', 1, 'off'], ['kc-b', 'content', 'screen', 0.7, 'off']]);
  assert.ok(layers.every((l) => !('pattern' in l)));
});

ok('a PATTERN track never takes the KC content path: liveResolve gives it its own entry (#1098 draws it)', () => {
  const src = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(layer\.type === 'pattern'\) \{[\s\S]*?isPattern: true[\s\S]*?continue;\s*\}/);
});

console.log(`patternTrack.selfcheck: ${n} checks passed`);
