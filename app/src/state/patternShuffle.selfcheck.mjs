// patternShuffle.selfcheck.mjs — the live DROP gate, and a PATTERN track carried by the project (#1100).
// Node-only: the real store, and a loop clock moved by hand.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { useStore } from './store.js';
import { loopClock } from '../gl/loopClock.js';
import { isPatternLayer } from './slices/layersSlice.js';
import {
  requestPatternShuffle, tickPatternShuffles, isShufflePending, pendingSnapshot, subscribePending, resetPatternShuffle,
} from './patternShuffle.js';
import { serializeProject, parseProject } from './projectDocument.js';
import { buildBundle, parseBundle } from './bundle.js';
import { barMs } from '../pattern/shuffleGate.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const S = () => useStore.getState();
const pt = () => S().layers.find(isPatternLayer);
const seedNow = () => pt().pattern.seed;

function fresh({ drop = false, bpm = 120 } = {}) {
  resetPatternShuffle();
  useStore.setState({
    layers: [{ id: 'kc0', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } }],
    activeLayerId: 'kc0', layerSnapshots: {}, selectedPatternLayerId: null, beatBpm: bpm, historyUndoStack: [], historyRedoStack: [],
  });
  S().addPatternLayer('QUILT');
  if (drop) S().setPatternParam(pt().id, 'drop', true);
  return pt().id;
}
const at = (ms) => { loopClock.ms = ms; tickPatternShuffles(); };

ok('DROP off: SHUFFLE lands in the same frame and nothing is left pending', () => {
  const id = fresh(); loopClock.ms = 5000;
  const s0 = seedNow();
  requestPatternShuffle(id);
  assert.notEqual(seedNow(), s0); assert.equal(isShufflePending(id), false);
});

ok('DROP on: SHUFFLE arms, and lands on the first poll at or after the next bar, never before', () => {
  for (const bpm of [60, 120, 180, 300]) for (const tap of [10, 700, 1999, 2000, 3999.9]) {
    const id = fresh({ drop: true, bpm }); loopClock.ms = tap;
    const s0 = seedNow(); const bar = barMs(bpm);
    requestPatternShuffle(id);
    assert.equal(seedNow(), s0, 'a tap never lands in its own frame'); assert.equal(isShufflePending(id), true);
    const target = (Math.floor(tap / bar) + 1) * bar;
    let landed = null;
    for (let t = tap + 5; t < tap + bar * 2; t += 5) { at(t); if (seedNow() !== s0) { landed = t; break; } }
    assert.ok(landed !== null, `bpm ${bpm} tap ${tap}: never landed`);
    assert.ok(landed >= target, `landed at ${landed}, before the bar at ${target}`);
    assert.ok(landed - target <= 5, `landed ${landed - target} ms late`);
    assert.equal(isShufflePending(id), false);
  }
});

ok('coalescing: taps while armed do nothing; exactly one reseed per bar', () => {
  const id = fresh({ drop: true }); loopClock.ms = 100;
  const s0 = seedNow(); let changes = 0; let last = s0;
  requestPatternShuffle(id);
  for (let t = 150; t < 1900; t += 50) { loopClock.ms = t; requestPatternShuffle(id); tickPatternShuffles(); }
  for (let t = 1900; t < 2200; t += 10) { at(t); if (seedNow() !== last) { changes += 1; last = seedNow(); } }
  assert.equal(changes, 1);
});

ok('turning DROP off while armed flushes it at once', () => {
  const id = fresh({ drop: true }); loopClock.ms = 100;
  const s0 = seedNow(); requestPatternShuffle(id);
  S().setPatternParam(id, 'drop', false);
  at(150);
  assert.notEqual(seedNow(), s0); assert.equal(isShufflePending(id), false);
});

ok('a held clock holds the shuffle; a thaw lands it once, with no catch-up burst', () => {
  const id = fresh({ drop: true }); loopClock.ms = 500;
  const s0 = seedNow(); requestPatternShuffle(id);
  for (let k = 0; k < 200; k++) at(500); // frozen: wall time passes, loop time does not
  assert.equal(seedNow(), s0); assert.equal(isShufflePending(id), true);
  at(60000);
  const s1 = seedNow(); assert.notEqual(s1, s0);
  for (let t = 60016; t < 70000; t += 16) at(t);
  assert.equal(seedNow(), s1, 'one reseed, not one per missed bar');
});

ok('a BPM change while armed re-times it from now; removing the track drops it', () => {
  const id = fresh({ drop: true, bpm: 60 }); loopClock.ms = 100;
  requestPatternShuffle(id);
  useStore.setState({ beatBpm: 240 });
  at(1200); // 240 BPM: a bar is 1000 ms, so the next line after 1200 is 2000
  assert.equal(isShufflePending(id), true);
  at(2000); assert.equal(isShufflePending(id), false);
  const id2 = fresh({ drop: true }); loopClock.ms = 100;
  requestPatternShuffle(id2); S().removeLayer(id2);
  at(5000);
  assert.equal(isShufflePending(id2), false, 'nothing left to land on');
});

ok('subscribers hear every change, and the snapshot is stable between changes (React-safe)', () => {
  const id = fresh({ drop: true }); loopClock.ms = 100;
  let calls = 0; const off = subscribePending(() => { calls += 1; });
  const a = pendingSnapshot();
  assert.equal(pendingSnapshot(), a, 'same object until something changes');
  requestPatternShuffle(id);
  assert.ok(calls >= 1 && pendingSnapshot() !== a && pendingSnapshot().has(id));
  const armed = pendingSnapshot();
  assert.equal(pendingSnapshot(), armed);
  at(2500);
  assert.ok(!pendingSnapshot().has(id));
  off();
});

ok('pending state is a performance moment, not a project field: it never reaches a saved project', () => {
  const id = fresh({ drop: true }); loopClock.ms = 100;
  requestPatternShuffle(id);
  const json = JSON.stringify(serializeProject(S()));
  assert.ok(!/pending|armed|gate/i.test(json));
});

// ── persistence: the project file, autosave and the bundle carry a PATTERN track ──
ok('project export → import keeps the PATTERN track exactly (and the KC track stays the active one)', () => {
  const id = fresh();
  S().setPatternMode(id, 'GLYPH');
  S().setPatternParam(id, 'density', 9); S().setPatternParam(id, 'mix', 0.3); S().setPatternParam(id, 'drift', 0.45); S().setPatternParam(id, 'drop', true);
  const before = JSON.parse(JSON.stringify(pt()));
  const doc = JSON.parse(JSON.stringify(serializeProject(S()))); // through real JSON, like a file
  const parsed = parseProject(doc);
  assert.ok(parsed.ok, parsed.error);
  const layers = parsed.doc.layers;
  assert.ok(Array.isArray(layers), 'parsed layers');
  const back = layers.find((l) => l.type === 'pattern');
  assert.deepEqual(back.pattern, before.pattern);
  assert.equal(back.id, before.id); assert.equal(back.layerBlendMode, before.layerBlendMode);
  assert.equal(parsed.doc.activeLayerId, 'kc0');
});

ok('a hand-edited or damaged PATTERN block loads repaired, never crashes', () => {
  const id = fresh();
  const doc = JSON.parse(JSON.stringify(serializeProject(S())));
  doc.layers.find((l) => l.id === id).pattern = { mode: 'WAT', seed: 'x', density: 999, mix: -5, drift: 'fast', drop: 'yes' };
  const parsed = parseProject(doc);
  assert.ok(parsed.ok);
  const layers = parsed.doc.layers;
  const p = layers.find((l) => l.id === id).pattern;
  assert.deepEqual(Object.keys(p).sort(), ['density', 'drift', 'drop', 'grout', 'hero', 'mix', 'mode', 'seed']);
  assert.equal(p.mode, 'QUILT'); assert.equal(p.density, 12); assert.equal(p.mix, 0); assert.equal(p.drift, 0); assert.equal(p.drop, false);
});

ok('the export-everything bundle carries it through the project part', () => {
  const id = fresh();
  S().setPatternParam(id, 'drift', 0.2);
  const want = JSON.parse(JSON.stringify(pt().pattern));
  const bundle = JSON.parse(JSON.stringify(buildBundle({ project: serializeProject(S()), now: 0 })));
  const out = parseBundle(bundle, { project: (raw) => { const r = parseProject(raw); return r.ok ? { ok: true, value: r } : r; } });
  assert.ok(out.ok !== false);
  const r = out.parts.project; assert.ok(r.ok);
  assert.deepEqual(r.value.doc.layers.find((l) => l.type === 'pattern').pattern, want);
});

ok('by design a recipe URL and a keep do NOT carry layers (kc-r/1 is one picture); a pattern track rides the project, not the recipe', () => {
  const src = readFileSync(new URL('./recipeUrls.js', import.meta.url), 'utf8');
  assert.match(src, /OUT of v1: layers\/snapshots/);
});

console.log(`patternShuffle.selfcheck: ${n} checks passed`);
