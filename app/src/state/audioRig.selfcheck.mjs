// node src/state/audioRig.selfcheck.mjs
// A hit brings back the picture, not the audio setup: recalling or morphing to a kept layout leaves the live audio
// feel and spectrum marks exactly as they are, so an old hit reacts to the audio you have on now.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) };
const { withLiveRig, AUDIO_RIG_KEYS, SPECTRUM_KEYS } = await import('./audioRig.js');
const { createDavisSlice, sanitizeFavorite } = await import('./slices/davisSlice.js');
const { FEEL_KEYS } = await import('../data/feels.js');
const { DEFAULT_LAYOUT_PARAMS } = await import('../data/layout-modes.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

function boot(layoutParams) {
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = createDavisSlice(set, () => state);
  Object.assign(state, { layoutParams });
  return { get: () => state, call: (name, ...a) => state[name](...a) };
}

ok('the rig is the eight feel params and the four spectrum marks, and they are all real layout params', () => {
  assert.deepEqual([...AUDIO_RIG_KEYS], [...FEEL_KEYS, ...SPECTRUM_KEYS]);
  assert.equal(AUDIO_RIG_KEYS.length, 12);
  for (const k of AUDIO_RIG_KEYS) assert.ok(k in DEFAULT_LAYOUT_PARAMS, `${k} is a layout param`);
});

ok('withLiveRig: the picture from the hit, the audio setup from now; pure; absent live keys fall to the default', () => {
  const saved = { mode: 'grid', count: 40, audioModDepth: 0, audioResponse: 'linear', spectrumScale: 0.9, lifeDrift: 0.9 };
  const live = { mode: 'rand', count: 200, audioModDepth: 1.2, audioResponse: 'peak-hold', spectrumScale: 0.3 };
  const frozen = JSON.stringify([saved, live]);
  const out = withLiveRig(saved, live);
  assert.equal(out.mode, 'grid'); assert.equal(out.count, 40, 'the picture is the hit\'s');
  assert.equal(out.audioModDepth, 1.2); assert.equal(out.audioResponse, 'peak-hold'); assert.equal(out.spectrumScale, 0.3, 'the audio setup is live');
  assert.ok(!('lifeDrift' in out), 'a rig key the live layout lacks is dropped: the default applies, not the old value');
  assert.equal(JSON.stringify([saved, live]), frozen, 'neither argument is mutated');
  assert.equal(withLiveRig(null, live), null);
  assert.deepEqual(withLiveRig({ mode: 'grid' }, null), { mode: 'grid' });
});

ok('recall: a hit kept with the music dialled down no longer drops it', () => {
  const live = { ...DEFAULT_LAYOUT_PARAMS, audioModDepth: 1.4, audioScaleMod: 1.35, audioAlphaMod: 0.9, spectrumScale: 0.6, spectrumMap: 2 };
  const s = boot(live);
  const hit = sanitizeFavorite({ seed: 9, seedOffsets: {}, timestamp: '12:00:00', config: { layout: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 40, audioModDepth: 0, audioScaleMod: 0, audioAlphaMod: 0, spectrumScale: 0 }, palette: { id: 'bone' } } });
  s.call('recallFavorite', hit);
  const lp = s.get().layoutParams;
  assert.equal(lp.mode, 'grid'); assert.equal(lp.count, 40, 'the picture comes back');
  assert.equal(lp.audioModDepth, 1.4); assert.equal(lp.audioScaleMod, 1.35); assert.equal(lp.audioAlphaMod, 0.9, 'the audio feel stays');
  assert.equal(lp.spectrumScale, 0.6); assert.equal(lp.spectrumMap, 2, 'and so do the spectrum marks');
  assert.equal(s.get().seed, 9); assert.equal(s.get().paletteId, 'bone');
});

ok('morph (the queue jump and the keeps shelf): the audio setup does not move either', () => {
  const live = { ...DEFAULT_LAYOUT_PARAMS, audioModDepth: 1.1, audioSwell: 0.4, spectrumColour: 0.5 };
  const s = boot(live);
  const hit = sanitizeFavorite({ seed: 4, seedOffsets: {}, timestamp: '12:00:00', config: { layout: { ...DEFAULT_LAYOUT_PARAMS, count: 55, audioModDepth: 0.1, audioSwell: 1, spectrumColour: 0 }, palette: { id: 'bone' } } });
  s.call('morphToFavorite', hit);
  const st = s.get();
  const finalLp = st.morphTo ? { ...st.layoutParams, ...st.morphTo } : st.layoutParams;
  for (const k of ['audioModDepth', 'audioSwell', 'spectrumColour']) {
    assert.equal(finalLp[k], live[k], `${k} stays live`);
    assert.ok(!st.morphTo || !(k in st.morphTo) || st.morphTo[k] === live[k], `${k} is not animated toward the hit's value`);
  }
  assert.ok(st.morphTo ? st.morphTo.count === 55 : finalLp.count === 55, 'the picture still morphs to the hit');
});

ok('a hit without a layout, and the file keeps its feel (the hit still carries it)', () => {
  const s = boot({ ...DEFAULT_LAYOUT_PARAMS, audioModDepth: 1.2 });
  s.call('recallFavorite', sanitizeFavorite({ seed: 3, seedOffsets: {}, timestamp: '12:00:00', config: { palette: { id: 'bone' } } }));
  assert.equal(s.get().layoutParams.audioModDepth, 1.2);
  const src = readFileSync(new URL('./slices/davisSlice.js', import.meta.url), 'utf8');
  assert.match(src, /layout: \{ \.\.\.state\.layoutParams \}/, 'a keep still saves the whole layout');
  assert.match(src, /withLiveRig\(fav\.config\.layout, state\.layoutParams\)/);
});

console.log(`audioRig.selfcheck: ${n} checks passed`);
