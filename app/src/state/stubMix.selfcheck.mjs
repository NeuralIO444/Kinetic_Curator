// node src/state/stubMix.selfcheck.mjs
//
// #517: the 12 stub chips carry a motion block and ride the preset MIX road
// (loadStubMode) instead of a bare mode switch: numbers glide, colors and the
// asset pool are left alone (to.paletteId === null), one undo step on commit.
import assert from 'node:assert';
import { useStore } from './store.js';
import { STUB_VOICES } from '../data/voices.js';
import { validateLayoutParams, BEHAVE_MODES } from '../data/layout-modes.js';

const S = () => useStore.getState();

// ── motion blocks ────────────────────────────────────────────────────────
assert.strictEqual(STUB_VOICES.length, 12);
for (const v of STUB_VOICES) {
  assert.ok(v.motion && typeof v.motion === 'object', `${v.id} carries a motion block`);
  assert.deepStrictEqual(validateLayoutParams(v.motion).rejected, [], `${v.id} motion validates clean`);
  assert.ok(!('mode' in v.motion), `${v.id} motion does not smuggle a mode`);
  if (v.motion.behave !== undefined) assert.ok(BEHAVE_MODES.includes(v.motion.behave), `${v.id} behave is real`);
}
// Rule from the issue: static modes = low drift + low flow; flow modes = mid flow.
const m = (id) => STUB_VOICES.find((v) => v.id === id).motion;
for (const id of ['grid', 'rails', 'layers', 'abacus', 'stratified', 'ca', 'radial', 'fibonacci']) {
  assert.ok(m(id).lifeDrift <= 0.15 && m(id).noiseSpeed <= 0.2, `${id} is near-static`);
}
for (const id of ['flow', 'noise', 'orbit']) {
  assert.ok(m(id).noiseSpeed >= 0.35, `${id} has mid flow`);
}
assert.strictEqual(m('orbit').behave, 'orbit', 'orbit chip has an honest behave');

// ── loadStubMode: opens a MIX, touches nothing until commit ──────────────
const id = S().layoutParams.mode === 'grid' ? 'rails' : 'grid';
const stub = STUB_VOICES.find((v) => v.id === id);
const before = { params: { ...S().layoutParams }, paletteId: S().paletteId, overrides: S().paletteOverrides };

S().loadStubMode(id);
const mix = S().voiceMix;
assert.ok(mix, 'a stub tap opens a MIX');
assert.strictEqual(mix.to.params.mode, id);
assert.strictEqual(mix.to.params.lifeDrift, stub.motion.lifeDrift, 'motion is in the target');
assert.strictEqual(mix.to.paletteId, null, 'color state is left alone');
assert.strictEqual(mix.targetVoiceId, null);
assert.deepStrictEqual(S().layoutParams, before.params, 'live params are untouched until commit');

S().commitVoiceMix();
assert.strictEqual(S().layoutParams.mode, id);
assert.strictEqual(S().layoutParams.noiseSpeed, stub.motion.noiseSpeed);
assert.strictEqual(S().paletteId, before.paletteId, 'palette id survives');
assert.deepStrictEqual(S().paletteOverrides, before.overrides, 'no stray override frozen in');
assert.strictEqual(S().voiceMix, null);

// Same chip again: nothing changed -> no MIX.
S().loadStubMode(id);
assert.strictEqual(S().voiceMix, null, 're-tapping the current stub is a no-op');

// Locked params are respected, like a preset.
{
  const other = id === 'orbit' ? 'flow' : 'orbit';
  useStore.setState({ lockedParams: { noiseSpeed: true } });
  const keep = S().layoutParams.noiseSpeed;
  S().loadStubMode(other);
  assert.strictEqual(S().voiceMix.to.params.noiseSpeed, keep, 'a locked param does not move');
  assert.strictEqual(S().voiceMix.to.params.mode, other);
  useStore.setState({ lockedParams: {}, voiceMix: null });
}

// Unknown id is a no-op.
S().loadStubMode('nope');
assert.strictEqual(S().voiceMix, null);

console.log('stubMix.selfcheck: OK');
