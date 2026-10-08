// earnedVoices.selfcheck.mjs — voices the triad mints from the artist's own work (#1153).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { Events, emit, on } from '../composition/eventBus.js';
import { createLoisActivity } from '../curator/loisActivity.js';
import {
  EARNED_SLOTS, EARNED_MIN_ROLLS, earnedName, earnedCaption, sanitizeEarned, mintEarned, earnedVoices, isEarned,
} from './earnedVoices.js';
import { useStore } from './store.js';
import { MAX_USER_VOICES, findVoiceDef, sanitizeUserVoice } from './slices/voiceSlice.js';
import { FLAGSHIP_VOICES } from '../data/voices.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const S = () => useStore.getState();
const ev = (id, rolls, at = 1) => ({ id, name: id, earned: { rolls, at, caption: '' }, state: {} });

ok('the name is deadpan from the scene, the caption three facts, and neither mentions anyone', () => {
  assert.equal(earnedName({ paletteId: 'tidepool', layoutParams: { mode: 'grid' } }), 'tidepool grid');
  assert.equal(earnedName({ paletteId: 'x', paletteOverrides: { bg: '#000' }, layoutParams: { mode: 'phyllo' } }), 'custom phyllo', 'an edited palette is called custom, not its old id');
  assert.ok(earnedName({ paletteId: 'persona-oxman-long-name', layoutParams: { mode: 'stratified' } }).length <= 24, 'the shelf cap');
  assert.equal(earnedCaption({ rolls: 23, count: 220, seed: 0xa17e9b21 }), 'after 23 rolls · 220 marks · seed a17e9b21');
  assert.equal(earnedCaption({ rolls: 1, count: 5, seed: 1 }), 'after 1 roll · 5 marks · seed 1');
  const src = readFileSync(new URL('./earnedVoices.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/queen/i.test(src), 'rule 10: the Queen is nowhere in the code that shows or ranks a find');
  assert.ok(!/Math\.random|Date\.now/.test(src), 'rarity is a count, never a dice roll, and the module has no clock');
});

ok('four slots: fill, then a deeper find replaces the shallowest (the oldest on a tie); a shallower find is not shelved', () => {
  assert.equal(EARNED_SLOTS, 4);
  let list = [];
  for (const [i, r] of [[1, 9], [2, 14], [3, 7], [4, 30]]) { const o = mintEarned(list, ev(`e${i}`, r, i)); assert.equal(o.minted, true); list = o.list; }
  assert.equal(list.length, 4);
  let o = mintEarned(list, ev('e5', 6, 5)); assert.equal(o.minted, false, '6 is shallower than the shallowest (7): nothing is displaced for less');
  o = mintEarned(list, ev('e6', 7, 6)); assert.equal(o.minted, true); assert.equal(o.replaced, 'e3', 'a tie at the bottom goes to the newer find');
  list = o.list; assert.deepEqual(earnedVoices(list).map((v) => v.id), ['e4', 'e2', 'e1', 'e6'], 'deepest first');
  o = mintEarned(list, ev('e7', 40, 7)); assert.equal(o.replaced, 'e6'); assert.equal(o.minted, true);
  assert.equal(mintEarned(list, ev('e4', 99, 8)).minted, false, 'the same id is never minted twice');
  assert.equal(mintEarned(list, ev('thin', EARNED_MIN_ROLLS - 1)).minted, false, 'fewer than the minimum rolls is not a find');
  assert.equal(mintEarned([], { id: 'plain', name: 'p', state: {} }).minted, false, 'a voice with no earned block is not a find');
});

ok('hand-made voices are untouched and have their own cap; sanitize bounds what comes back from storage', () => {
  const mine = [{ id: 'uv-1', name: 'VOICE 01', state: {} }];
  const o = mintEarned(mine, ev('e1', 8)); assert.deepEqual(o.list[0], mine[0]);
  assert.equal(isEarned(mine[0]), false); assert.equal(isEarned(o.list[1]), true);
  assert.equal(sanitizeEarned(null), null); assert.equal(sanitizeEarned({ rolls: -1 }), null); assert.equal(sanitizeEarned({ rolls: 'x' }), null);
  assert.equal(sanitizeEarned({ rolls: 1e12 }).rolls, 99999); assert.equal(sanitizeEarned({ rolls: 6.9 }).rolls, 6);
  assert.equal(sanitizeEarned({ rolls: 6, caption: 'x'.repeat(500) }).caption.length, 80);
});

const reset = (extra = {}) => useStore.setState({
  seed: 0xabc123, paletteId: 'tidepool', paletteOverrides: null, userVoices: [], voiceMix: null, activeVoiceId: null, historyUndoStack: [], historyRedoStack: [],
  layoutParams: { ...S().layoutParams, mode: 'grid', count: 220 },
  layers: [{ id: 'kc1', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } }],
  activeLayerId: 'kc1', layerSnapshots: {}, ...extra,
});

ok('the real action: it shelves the live scene with its name, caption and roll count, and persists the shelf form', () => {
  reset(); S().mintEarnedVoice({ rolls: 11, at: 5 });
  const v = S().userVoices[0];
  assert.equal(v.id, 'ev-abc123-11'); assert.equal(v.name, 'tidepool grid'); assert.equal(v.earned.rolls, 11); assert.equal(v.earned.caption, 'after 11 rolls · 220 marks · seed abc123');
  assert.equal(v.state.params.mode, 'grid'); assert.ok(!v.state.stack, 'a plain one-track scene carries no stack');
  S().mintEarnedVoice({ rolls: 11, at: 6 }); assert.equal(S().userVoices.length, 1, 'the same find twice is one voice');
  S().mintEarnedVoice({ rolls: 2 }); assert.equal(S().userVoices.length, 1, 'too few rolls: no voice');
  assert.deepEqual(sanitizeUserVoice(JSON.parse(JSON.stringify(v))).earned, v.earned, 'it survives its own sanitizer');
});

ok('it carries the layer stack, and loading the voice brings the tracks back in one undo', () => {
  reset();
  S().addPatternLayer('GLYPH'); S().addFxLayer();
  const want = S().layers.map((l) => l.type).join(',');
  S().mintEarnedVoice({ rolls: 9, at: 1 });
  const v = S().userVoices[0]; assert.ok(v.state.stack && v.state.stack.l.length === 3, 'PATTERN and FX ride along');
  // strip the scene, then load the voice and let the MIX land
  useStore.setState({ layers: [{ id: 'solo', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } }], activeLayerId: 'solo', layerSnapshots: {}, historyUndoStack: [] });
  S().loadVoice(v.id); S().commitVoiceMix();
  assert.equal(S().layers.map((l) => l.type).join(','), want, 'the tracks came back');
  assert.equal(S().historyUndoStack.length, 1); S().undo(); assert.deepEqual(S().layers.map((l) => l.id), ['solo'], 'one undo puts the old scene back');
});

ok('hand-made voices have their own twelve; imports keep at most four earned and twelve of the rest', () => {
  reset();
  for (let i = 0; i < MAX_USER_VOICES; i++) S().captureUserVoice();
  assert.equal(S().userVoices.length, MAX_USER_VOICES); S().captureUserVoice(); assert.equal(S().userVoices.length, MAX_USER_VOICES, 'the hand-made cap holds');
  S().mintEarnedVoice({ rolls: 8, at: 1 }); assert.equal(S().userVoices.length, MAX_USER_VOICES + 1, 'a find still has its own slot when the shelf is full');
  const many = [...Array.from({ length: 20 }, (_, i) => ({ id: `uv-${i}`, name: `V${i}`, state: { params: {}, palette: {} } })), ...Array.from({ length: 7 }, (_, i) => ({ id: `ev-${i}`, name: `E${i}`, state: { params: {}, palette: {} }, earned: { rolls: 5 + i, at: i } }))];
  assert.equal(S().importUserVoices(many), 16, '12 hand-made + 4 earned');
  assert.equal(S().userVoices.filter(isEarned).length, 4);
});

ok('the feed announces BLOOM with the artist\'s own roll count, from the kept frame; EVOLVE rolls do not count', () => {
  let now = 90_000_000; const subs = []; const st = { seed: 1, layoutParams: { composition: 'flow' }, historyUndoStack: [], historyRedoStack: [], favorites: [], keeps: [], lastEvolveTs: null };
  const store = { getState: () => st, subscribe: (fn) => { subs.push(fn); return () => {}; } };
  const act = createLoisActivity({ now: () => now }); act.start({ store });
  const got = []; const off = on(Events.BLOOM, (p) => got.push(p));
  for (let i = 0; i < 3; i++) { now += 1000; st.lastEvolveTs = i + 1; subs.forEach((f) => f(st)); } // Davis's own rolls: not the artist's
  for (let i = 0; i < 6; i++) { now += 2000; emit(Events.LAYOUT_CURATE); }
  now += 1000; st.keeps = [{ id: 'k1' }]; subs.forEach((f) => f(st));
  assert.equal(got.length, 1, 'one BLOOM for one keep'); assert.equal(got[0].rolls, 6, '6 of the artist\'s rolls, not 9'); assert.equal(act.snapshot().bloomDepth, 6);
  // a keep after only evolve passes: BLOOM state may be true, but the artist rolled nothing, so there is no find
  const b = createLoisActivity({ now: () => now }); const st2 = { ...st, keeps: [] }; const subs2 = []; b.start({ store: { getState: () => st2, subscribe: (fn) => { subs2.push(fn); return () => {}; } } });
  for (let i = 0; i < 6; i++) { now += 1000; st2.lastEvolveTs = 100 + i; subs2.forEach((f) => f(st2)); }
  now += 500; st2.keeps = [{ id: 'k9' }]; subs2.forEach((f) => f(st2));
  assert.equal(got.at(-1).rolls, 0, 'announced with 0 rolls: mintEarned refuses it');
  assert.equal(mintEarned([], ev('x', got.at(-1).rolls)).minted, false);
  off(); act.stop(); b.stop();
});

ok('retired, not deleted: the factory four still resolve so an old project, keep or link that names one opens as before', () => {
  for (const f of FLAGSHIP_VOICES) { const d = findVoiceDef(f.id, []); assert.ok(d && d.kind === 'flagship', f.id); }
  assert.equal(findVoiceDef('swarm', []).displayName, 'Night Migration');
});

ok('wiring: the app mints on BLOOM and on nothing else', () => {
  const hook = readFileSync(new URL('../hooks/useEarnedVoices.js', import.meta.url), 'utf8');
  assert.match(hook, /on\(Events\.BLOOM, \(\{ rolls, at \} = \{\}\) => useStore\.getState\(\)\.mintEarnedVoice\(\{ rolls, at \}\)\)/);
  assert.match(readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'), /useEarnedVoices\(\);/);
});

console.log(`earnedVoices.selfcheck: ${n} checks passed`);
