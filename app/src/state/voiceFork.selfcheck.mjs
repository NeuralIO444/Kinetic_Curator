// node src/state/voiceFork.selfcheck.mjs
//
// #734 (CHIP_LAB C1): the DAVIS ✎ dish edits a COPY of a flagship Voice and
// SAVE forks it into MY VOICES. Factory voices are sealed: FLAGSHIP_VOICES and
// every factory resolveVoiceState() stay byte-stable across a whole badge
// session. The only write path is forkVoice (add-only, never overwrite).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { useStore } from './store.js';
import { FLAGSHIP_VOICES, resolveVoiceState } from '../data/voices.js';
import { MAX_USER_VOICES, forkName } from './slices/voiceSlice.js';

const S = () => useStore.getState();
const factoryJson = JSON.stringify(FLAGSHIP_VOICES);
const resolvedJson = JSON.stringify(FLAGSHIP_VOICES.map((v) => resolveVoiceState(v)));
const hype = FLAGSHIP_VOICES.find((v) => v.id === 'hype');
const factoryFlap = resolveVoiceState(hype).params.flap;

// ── a badge session: draft → edit flap (+ more) → fork ───────────────────
useStore.setState({ userVoices: [] });
const draft = resolveVoiceState(hype); // what VoiceDish starts from
draft.params.flap = 0.2;
draft.params.count = 42;
draft.fx.grain = 0.5;
const firstAsset = Object.keys(draft.assets)[0];
if (firstAsset) draft.assets[firstAsset] = false;
S().forkVoice({ id: 'uv-test-1', name: hype.title, state: draft });

const fork = S().userVoices.find((v) => v.id === 'uv-test-1');
assert.ok(fork, 'SAVE forks a new user voice');
assert.strictEqual(fork.name, `${hype.title} fork`);
assert.strictEqual(fork.state.params.flap, 0.2, 'the fork carries the edited flap');
assert.strictEqual(fork.state.params.count, 42);
assert.strictEqual(fork.state.fx.grain, 0.5);
if (firstAsset) assert.strictEqual(fork.state.assets[firstAsset], false, 'asset toggle carried');

// ── factory sealed ───────────────────────────────────────────────────────
assert.strictEqual(JSON.stringify(FLAGSHIP_VOICES), factoryJson, 'FLAGSHIP_VOICES byte-stable across the session');
assert.strictEqual(JSON.stringify(FLAGSHIP_VOICES.map((v) => resolveVoiceState(v))), resolvedJson, 'factory states byte-stable');
assert.strictEqual(resolveVoiceState(hype).params.flap, factoryFlap, 'HYPE flap unchanged');
assert.notStrictEqual(resolveVoiceState(hype), resolveVoiceState(hype), 'each draft is a fresh copy');

// ── add-only: a repeated id never overwrites; names dedupe ───────────────
S().forkVoice({ id: 'uv-test-1', name: hype.title, state: resolveVoiceState(hype) });
assert.strictEqual(S().userVoices.find((v) => v.id === 'uv-test-1').state.params.flap, 0.2, 'repeated id refused, never overwrites');
S().forkVoice({ id: 'uv-test-2', name: hype.title, state: resolveVoiceState(hype) });
assert.strictEqual(S().userVoices.find((v) => v.id === 'uv-test-2').name, `${hype.title} fork 2`);
assert.strictEqual(forkName('A very long voice title here', []).length <= 24, true);

// ── shelf cap ────────────────────────────────────────────────────────────
useStore.setState({ userVoices: Array.from({ length: MAX_USER_VOICES }, (_, i) => ({ ...fork, id: `f${i}`, name: `F${i}` })) });
S().forkVoice({ id: 'uv-over', name: 'x', state: resolveVoiceState(hype) });
assert.ok(!S().userVoices.some((v) => v.id === 'uv-over'), 'full shelf refuses a fork');

// ── the dish has no path to the factory or to overwrite ──────────────────
const dish = readFileSync(new URL('../panels/davis/VoiceDish.jsx', import.meta.url), 'utf8');
assert.ok(/forkVoice\(/.test(dish), 'the dish saves through forkVoice');
assert.ok(!/overwriteUserVoice|FLAGSHIP_VOICES/.test(dish), 'the dish never overwrites and never touches the factory list');

useStore.setState({ userVoices: [] });
console.log('voiceFork.selfcheck: OK');
