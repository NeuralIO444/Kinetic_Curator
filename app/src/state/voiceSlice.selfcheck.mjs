// node src/state/voiceSlice.selfcheck.mjs
// The user-voice shelf: sanitize guards the localStorage trust boundary,
// and the load → scrub → commit flow is exercised against a mock store.
import assert from 'node:assert';
import {
  createVoiceSlice,
  sanitizeUserVoice,
  nextVoiceName,
  findVoiceDef,
  MAX_USER_VOICES,
} from './slices/voiceSlice.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

// ── sanitizeUserVoice ────────────────────────────────────────────────────
const good = sanitizeUserVoice({
  id: 'uv-abc',
  name: 'MY VOICE',
  state: {
    params: { mode: 'swarm', particleCount: 300 },
    palette: { bg: '#0A0E1A', ink: '#F8FAFC', swatches: ['#22D3EE'] },
    fx: { grain: 0.5, vignette: true },
    assets: 'all',
    blendSeconds: 3,
  },
  createdAt: 123,
});
assert.strictEqual(good.id, 'uv-abc');
assert.strictEqual(good.name, 'MY VOICE');
// params are completed to a full state through the firewall
assert.deepStrictEqual(Object.keys(good.state.params).sort(), Object.keys(DEFAULT_LAYOUT_PARAMS).sort());
assert.strictEqual(good.state.params.particleCount, 300);
assert.strictEqual(good.state.params.mode, 'swarm');
assert.strictEqual(good.state.palette.bg, '#0a0e1a');
assert.strictEqual(good.state.palette.swatches.length, 8);
assert.strictEqual(good.state.fx.grain, 0.5);

assert.strictEqual(sanitizeUserVoice(null), null);
assert.strictEqual(sanitizeUserVoice({}), null);
assert.strictEqual(sanitizeUserVoice({ id: 'x' }), null, 'state is required');
assert.strictEqual(sanitizeUserVoice({ id: 'x', state: { params: { mode: '__proto__' } } }).state.params.mode, 'fibonacci', 'bad mode falls back to default');
assert.strictEqual(sanitizeUserVoice({ id: 'x', state: {}, name: 'y'.repeat(99) }).name.length, 24, 'names truncate');
assert.strictEqual(sanitizeUserVoice({ id: 'x', state: {}, name: '   ' }).name, 'VOICE', 'blank name defaults');

// ── nextVoiceName ────────────────────────────────────────────────────────
assert.strictEqual(nextVoiceName([]), 'VOICE 01');
assert.strictEqual(nextVoiceName([{ name: 'VOICE 01' }]), 'VOICE 02');
assert.strictEqual(nextVoiceName([{ name: 'VOICE 01' }, { name: 'VOICE 03' }]), 'VOICE 04', 'never reuses a live number');
assert.strictEqual(nextVoiceName([{ name: 'CUSTOM' }]), 'VOICE 01');

// ── findVoiceDef ─────────────────────────────────────────────────────────
assert.strictEqual(findVoiceDef('swarm', []).kind, 'flagship');
assert.strictEqual(findVoiceDef('nope', []), null);
const uv = sanitizeUserVoice({ id: 'uv-1', name: 'MINE', state: { params: {} } });
assert.strictEqual(findVoiceDef('uv-1', [uv]).kind, 'user');
assert.strictEqual(findVoiceDef('uv-1', [uv]).displayName, 'MINE');
assert.strictEqual(MAX_USER_VOICES, 12);

// ── load → scrub → commit against a mock store ───────────────────────────
let state = {
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  paletteId: 'praystation',
  paletteOverrides: null,
  userPalettes: [],
  enabledAssets: { a: true, b: true },
  historyUndoStack: [],
  historyRedoStack: [],
  ...createVoiceSlice((updater) => {
    const partial = updater(state);
    state = { ...state, ...partial };
  }),
};
const api = state; // actions live on the state object

assert.deepStrictEqual(api.userVoices, [], 'empty shelf in node (no localStorage)');
assert.strictEqual(api.voiceMix, null);
assert.strictEqual(api.activeVoiceId, null);

// Capture the + chip flow (from a non-default mode so we can tell the
// captured state apart from defaults).
state.layoutParams = { ...state.layoutParams, mode: 'grid' };
api.captureUserVoice();
assert.strictEqual(state.userVoices.length, 1);
assert.strictEqual(state.userVoices[0].name, 'VOICE 01');
assert.strictEqual(state.userVoices[0].state.params.mode, 'grid', 'captures current mode');

// Loading a USER voice targets the captured state, not defaults.
const uvId = state.userVoices[0].id;
api.loadVoice(uvId);
assert.ok(state.voiceMix, 'user mix opens');
assert.strictEqual(state.voiceMix.to.params.mode, 'grid', 'user voice target is the captured state');
assert.strictEqual(state.voiceMix.targetVoiceId, uvId);
api.cancelVoiceMix();
state.layoutParams = { ...state.layoutParams, mode: 'fibonacci' };

// Load a flagship: opens a mix, does not touch committed state.
api.loadVoice('swarm');
assert.ok(state.voiceMix, 'mix opens');
assert.strictEqual(state.voiceMix.t, 0);
assert.strictEqual(state.voiceMix.targetVoiceId, 'swarm');
assert.strictEqual(state.activeVoiceId, 'swarm');
assert.strictEqual(state.layoutParams.mode, 'fibonacci', 'committed params untouched during mix');
assert.ok(state.voiceMix.to.params.mode === 'swarm', 'target is the voice');
assert.strictEqual(state.voiceMix.from.params.mode, 'fibonacci', 'from is the live state');

// Scrubbing pauses the auto-advance.
api.setVoiceMixT(0.5);
assert.strictEqual(state.voiceMix.t, 0.5);
assert.strictEqual(state.voiceMix.auto, false);
api.resumeVoiceMix();
assert.strictEqual(state.voiceMix.auto, true);

// Driver ticks advance t WITHOUT pausing auto (regression: the driver used
// to call setVoiceMixT and immediately pause itself).
api.advanceVoiceMix(0.6);
assert.strictEqual(state.voiceMix.t, 0.6);
assert.strictEqual(state.voiceMix.auto, true, 'driver tick preserves auto');

// Commit lands the full voice state in one step.
api.commitVoiceMix();
assert.strictEqual(state.voiceMix, null);
assert.strictEqual(state.layoutParams.mode, 'swarm');
assert.strictEqual(state.layoutParams.particleCount, 280);
assert.strictEqual(state.paletteOverrides.bg, '#0a0e1a');
assert.strictEqual(state.paletteOverrides.swatches.length, 8);
assert.deepStrictEqual(state.enabledAssets, { a: true, b: true }, 'all-on restores every asset');
assert.strictEqual(state.activeVoiceId, 'swarm');
assert.strictEqual(state.historyUndoStack.length, 1, 'one undo entry for the whole voice load');

// Reloading the active voice without a mix is a no-op.
const before = state.historyUndoStack.length;
api.loadVoice('swarm');
assert.strictEqual(state.voiceMix, null, 'no mix reopened');
assert.strictEqual(state.historyUndoStack.length, before);

// Retarget mid-mix re-snapshots from the in-flight blend.
api.loadVoice('hype');
api.setVoiceMixT(0.5);
const midMode = state.voiceMix.to.params.mode;
assert.strictEqual(midMode, 'hype');
api.loadVoice('murmuration');
assert.strictEqual(state.voiceMix.from.params.mode, 'hype', 'from re-snapshots the in-flight target at the dissolve point');
assert.strictEqual(state.voiceMix.t, 0);

// Long-press overwrite refreshes the chip's captured state.
const vid = state.userVoices[0].id;
api.commitVoiceMix(); // land murmuration
api.overwriteUserVoice(vid);
const refreshed = state.userVoices.find((v) => v.id === vid);
assert.strictEqual(refreshed.state.params.mode, 'murmuration', 'overwrite captures current state');
assert.strictEqual(refreshed.name, 'VOICE 01', 'overwrite keeps the name');

// Rename + delete.
api.renameUserVoice(vid, '  DUSK  ');
assert.strictEqual(state.userVoices.find((v) => v.id === vid).name, 'DUSK');
api.renameUserVoice(vid, '   ');
assert.strictEqual(state.userVoices.find((v) => v.id === vid).name, 'DUSK', 'blank rename is ignored');
api.deleteUserVoice(vid);
assert.strictEqual(state.userVoices.length, 0);

// Shelf cap.
for (let i = 0; i < MAX_USER_VOICES + 3; i++) api.captureUserVoice();
assert.strictEqual(state.userVoices.length, MAX_USER_VOICES, 'cap holds');

// Unknown voice id is a no-op.
api.loadVoice('nope');
assert.strictEqual(state.voiceMix, null);

console.log('voiceSlice.selfcheck: OK');
