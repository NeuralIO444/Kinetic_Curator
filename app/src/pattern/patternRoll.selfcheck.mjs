// patternRoll.selfcheck.mjs — PATTERN is part of the KINETIC and CURATOR systems (Matt, 2026-10-07).
import assert from 'node:assert';
import { rollPatternLayers, dealPattern, reseedPattern, weatherPattern, CHAOS_ADD_CHANCE, BORN_OPACITY } from './patternRoll.js';
import { defaultPattern, sanitizePattern } from '../state/patternTrack.js';
import { mkRng } from '../engine/prng.js';
import { useStore } from '../state/store.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const S = () => useStore.getState();
const pat = (st = S()) => st.layers.filter((l) => l.type === 'pattern');
const reset = (extra = []) => useStore.setState({
  layers: [{ id: 'kc1', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } }, ...extra],
  activeLayerId: 'kc1', layerSnapshots: {}, historyUndoStack: [], historyRedoStack: [], lockedParams: {}, armedMode: null, armedMotion: null, curatePress: 0,
});
const PT = (id, over = {}) => ({ id, name: id, type: 'pattern', visible: true, layerBlendMode: 'multiply', layerOpacity: 0.7, pattern: { ...defaultPattern('QUILT', 5), ...over } });

ok('the dice: a deal changes the picture and stays valid; reseed keeps the kind; weather keeps the picture; DROP survives all', () => {
  const rng = mkRng(11); const base = { ...defaultPattern('QUILT', 5), drop: true };
  const modes = new Set(); let still = 0; let moving = 0;
  for (let i = 0; i < 200; i++) {
    const d = dealPattern(base, rng); modes.add(d.mode); if (d.drift === 0) still += 1; else moving += 1;
    assert.deepEqual(d, sanitizePattern(d), 'a deal is already valid'); assert.equal(d.drop, true); assert.notEqual(d.seed, base.seed);
    assert.equal(d.kin, 'MIX'); assert.ok(d.movers >= 0.15 && d.movers <= 0.45, 'a few movers, never the whole board');
  }
  assert.equal(modes.size, 3, 'all three modes come up'); assert.ok(still > 60 && moving > 60, `about half still (${still}/${moving})`);
  const r = reseedPattern(base, mkRng(2)); assert.equal(r.mode, 'QUILT'); assert.notEqual(r.seed, base.seed); assert.ok(Math.abs(r.density - base.density) === 1);
  const w = weatherPattern({ ...base, drift: 0 }, mkRng(3)); assert.equal(w.drift, 0, 'a still pattern stays still'); assert.equal(w.seed, base.seed); assert.equal(w.mode, 'QUILT');
  const w2 = weatherPattern({ ...base, drift: 0.5 }, mkRng(3)); assert.ok(w2.drift > 0, 'a moving one never stops');
});

ok('rollPatternLayers: nothing changes without PATTERN tracks (chaos aside); existing tracks keep their id, blend and opacity', () => {
  const layers = [{ id: 'kc1', type: 'content' }];
  for (const kind of ['rules', 'weather', 'curate']) { const r = rollPatternLayers(layers, kind, mkRng(1)); assert.equal(r.changed, false); assert.equal(r.layers.length, 1); }
  const withP = [{ id: 'kc1', type: 'content' }, PT('p1')];
  const r = rollPatternLayers(withP, 'curate', mkRng(1)); assert.equal(r.changed, true);
  assert.equal(r.layers[1].id, 'p1'); assert.equal(r.layers[1].layerBlendMode, 'multiply'); assert.equal(r.layers[1].layerOpacity, 0.7);
  assert.deepEqual(rollPatternLayers(withP, 'nope', mkRng(1)), { layers: withP, changed: false });
});

ok('patterns on request (Matt, 2026-10-08): KIN never adds the first one, CURATOR never adds one, and a pattern that is ever born is a veil no stronger than 0.3', () => {
  assert.strictEqual(CHAOS_ADD_CHANCE, 0, `chance ${CHAOS_ADD_CHANCE}`); assert.ok(BORN_OPACITY <= 0.3, `opacity ${BORN_OPACITY}`);
  for (let i = 1; i <= 400; i++) assert.strictEqual(rollPatternLayers([{ id: 'kc1', type: 'content' }], 'chaos', mkRng(i * 7919)).layers.length, 1, `chaos roll ${i} added nothing`);
  for (let i = 1; i <= 200; i++) assert.deepEqual(rollPatternLayers([{ id: 'kc1', type: 'content' }], 'curate', mkRng(i * 31)).layers.length, 1, 'curate adds nothing');
});

ok('the add path still works when asked for explicitly (addChance 0.3): ONE, only when none exists, never past the cap, as a translucent veil', () => {
  let added = 0; const N = 400;
  for (let i = 1; i <= N; i++) {
    const r = rollPatternLayers([{ id: 'kc1', type: 'content' }], 'chaos', mkRng(i * 7919), { makeId: () => `pt-${i}`, addChance: 0.3 });
    if (r.changed) { added += 1; assert.equal(r.layers.length, 2); const p = r.layers[1]; assert.equal(p.type, 'pattern'); assert.equal(p.layerOpacity, BORN_OPACITY); assert.equal(p.id, `pt-${i}`); assert.deepEqual(p.pattern, sanitizePattern(p.pattern)); }
  }
  assert.ok(Math.abs(added / N - 0.3) < 0.07, `${added}/${N} added`);
  const has = [{ id: 'kc1', type: 'content' }, PT('p1')];
  for (let i = 1; i < 50; i++) assert.equal(rollPatternLayers(has, 'chaos', mkRng(i), { addChance: 0.3 }).layers.filter((l) => l.type === 'pattern').length, 1, 'never a second one');
  const full = ['a', 'b', 'c', 'd'].map((id) => ({ id, type: 'content' }));
  for (let i = 1; i < 80; i++) assert.equal(rollPatternLayers(full, 'chaos', mkRng(i), { addChance: 1 }).layers.length, 4, 'at the 4-track cap nothing is added');
  for (let i = 1; i < 80; i++) assert.equal(rollPatternLayers([{ id: 'kc1', type: 'content' }], 'chaos', mkRng(i), { canAdd: false, addChance: 1 }).layers.length, 1, 'a full tape adds nothing');
  const fx = [{ id: 'k', type: 'content' }, { id: 'f', type: 'fx', effects: [] }, { id: 'm', type: 'math', effects: [] }, { id: 'k2', type: 'content' }, { id: 'k3', type: 'content' }];
  let ok3 = 0; for (let i = 1; i < 300; i++) if (rollPatternLayers(fx, 'chaos', mkRng(i), { addChance: 0.3 }).changed) ok3 += 1; assert.ok(ok3 > 0, 'FX and MATH tracks do not count toward the content cap');
});

ok('the real actions: KIN chaos / rules / weather and CURATOR deal the PATTERN tracks, in one undo, and a KC-only scene is untouched', () => {
  reset([PT('p1', { drift: 0.4 })]); const before = JSON.stringify(pat());
  S().kineticRulesPass();
  assert.notEqual(JSON.stringify(pat()), before, 'rules reseeds'); assert.equal(pat()[0].pattern.mode, 'QUILT'); assert.equal(S().historyUndoStack.length, 1);
  S().undo(); assert.equal(JSON.stringify(pat()), before, 'one undo restores the old pattern');
  S().kineticWeatherPass(); assert.equal(pat()[0].pattern.seed, 5, 'weather keeps the picture'); assert.ok(pat()[0].pattern.drift > 0);
  S().undo();
  S().kineticRoll(); assert.notEqual(pat()[0].pattern.seed, 5, 'chaos deals it'); S().undo(); assert.equal(JSON.stringify(pat()), before);
  S().curateUnlocked(); assert.notEqual(JSON.stringify(pat()), before, 'the Curator deals it'); S().undo(); assert.equal(JSON.stringify(pat()), before);
  reset(); const kcOnly = S().layers;
  S().kineticRulesPass(); assert.equal(S().layers, kcOnly, 'no PATTERN track: the layer list is the very same array');
  S().kineticWeatherPass(); assert.equal(S().layers, kcOnly);
  S().curateUnlocked(); assert.equal(S().layers, kcOnly);
});

ok('the Curator is seeded: the same (seed, press #) deals the same patterns; the next press deals different ones', () => {
  const run = (press) => { reset([PT('p1')]); useStore.setState({ seed: 4242, seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 }, curatePress: press }); S().curateUnlocked(); return JSON.stringify(pat()[0].pattern); };
  assert.equal(run(3), run(3)); assert.notEqual(run(3), run(4));
});

ok('a chaos roll never brings a PATTERN track with it, and the roll is still one undo', () => {
  let born = 0;
  for (let i = 0; i < 300; i++) { reset(); S().kineticRoll(); if (pat().length) { born += 1; assert.equal(pat()[0].layerOpacity, BORN_OPACITY); assert.equal(S().historyUndoStack.length, 1); S().undo(); assert.equal(pat().length, 0, 'undo takes it away again'); } }
  assert.strictEqual(born, 0, `${born}/300 chaos rolls added a PATTERN track`);
});

console.log(`patternRoll.selfcheck: ${n} checks passed`);
