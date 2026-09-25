// node src/state/stubMix.selfcheck.mjs
//
// #517/#555: the 12 layout tiles ride the preset MIX road (loadStubMode) instead of a
// bare mode switch, changing `mode` only. Motion chips (loadMotion) are the animation axis.
// Numbers glide, colors and the
// asset pool are left alone (to.paletteId === null), one undo step on commit.
// Layout chips are single-axis: neither a stub chip nor a preset ever swaps the
// asset pool or palette (color and shape chips are their own axes).
import assert from 'node:assert';
import { useStore } from './store.js';
import { STUB_VOICES, MOTION_MODES, isMotionActive } from '../data/voices.js';
import { COMPOSITION_PRESETS as PRESETS } from '../data/presets.js';
import { validateLayoutParams, BEHAVE_MODES } from '../data/layout-modes.js';

const S = () => useStore.getState();

// ── layout tiles carry no motion; motion chips are valid + separate ──────
assert.strictEqual(STUB_VOICES.length, 12);
for (const v of STUB_VOICES) assert.ok(!('motion' in v), `${v.id}: layout tile carries no motion block`);
assert.ok(MOTION_MODES.length >= 5);
for (const m of MOTION_MODES) {
  assert.deepStrictEqual(validateLayoutParams(m.params).rejected, [], `${m.id} motion validates clean`);
  assert.ok(!('mode' in m.params) && !('composition' in m.params), `${m.id} does not smuggle layout`);
  assert.ok(BEHAVE_MODES.includes(m.params.behave), `${m.id} behave is real`);
}
const mm = (id) => MOTION_MODES.find((m) => m.id === id).params;
assert.ok(mm('still').lifeDrift <= 0.1 && mm('still').noiseSpeed <= 0.15, 'still is near-static');
assert.ok(mm('flow').noiseSpeed >= 0.5 && mm('flow').wind > mm('still').wind, 'flow has flow');
assert.strictEqual(mm('orbit').behave, 'orbit');

// ── loadStubMode: opens a MIX, touches nothing until commit ──────────────
const id = S().layoutParams.mode === 'grid' ? 'rails' : 'grid';
const before = { params: { ...S().layoutParams }, paletteId: S().paletteId, overrides: S().paletteOverrides, assets: { ...S().enabledAssets } };

S().loadStubMode(id);
const mix = S().voiceMix;
assert.ok(mix, 'a stub tap opens a MIX');
assert.strictEqual(mix.to.params.mode, id);
assert.strictEqual(mix.to.params.lifeDrift, before.params.lifeDrift, 'a layout tile leaves motion alone');
assert.strictEqual(mix.to.params.behave, before.params.behave);
assert.strictEqual(mix.to.paletteId, null, 'color state is left alone');
assert.strictEqual(mix.targetVoiceId, null);
assert.deepStrictEqual(S().layoutParams, before.params, 'live params are untouched until commit');

S().commitVoiceMix();
assert.strictEqual(S().layoutParams.mode, id);
assert.strictEqual(S().layoutParams.noiseSpeed, before.params.noiseSpeed, 'noiseSpeed unchanged by a layout tile');
assert.strictEqual(S().paletteId, before.paletteId, 'palette id survives');
assert.deepStrictEqual(S().paletteOverrides, before.overrides, 'no stray override frozen in');
assert.deepStrictEqual(S().enabledAssets, before.assets, 'a stub chip never swaps the asset pool');
assert.strictEqual(S().voiceMix, null);

// Same chip again: nothing changed -> no MIX.
S().loadStubMode(id);
assert.strictEqual(S().voiceMix, null, 're-tapping the current stub is a no-op');

// ── loadMotion: the animation axis ───────────────────────────────────────
{
  const pick = MOTION_MODES.find((m) => !isMotionActive(S().layoutParams, m));
  const b = { mode: S().layoutParams.mode, composition: S().layoutParams.composition, paletteId: S().paletteId, assets: { ...S().enabledAssets } };
  S().loadMotion(pick.id);
  const mx = S().voiceMix;
  assert.ok(mx, 'a motion tap opens a MIX');
  assert.strictEqual(mx.to.params.mode, b.mode, 'motion chip leaves the layout mode alone');
  assert.strictEqual(mx.to.paletteId, null, 'motion chip leaves color alone');
  S().commitVoiceMix();
  for (const [k, v] of Object.entries(pick.params)) assert.strictEqual(S().layoutParams[k], v, `${pick.id}.${k} landed`);
  assert.ok(isMotionActive(S().layoutParams, pick), 'the chip reads active after landing');
  assert.strictEqual(S().layoutParams.mode, b.mode);
  assert.strictEqual(S().layoutParams.composition, b.composition);
  assert.strictEqual(S().paletteId, b.paletteId);
  assert.deepStrictEqual(S().enabledAssets, b.assets, 'motion chip never swaps the asset pool');
  S().loadMotion(pick.id);
  assert.strictEqual(S().voiceMix, null, 're-tapping the current motion is a no-op');
  // Locked params are respected, like a preset.
  const other = MOTION_MODES.find((m) => m.id !== pick.id && m.params.noiseSpeed !== S().layoutParams.noiseSpeed);
  useStore.setState({ lockedParams: { noiseSpeed: true } });
  const keep = S().layoutParams.noiseSpeed;
  S().loadMotion(other.id);
  assert.strictEqual(S().voiceMix.to.params.noiseSpeed, keep, 'a locked param does not move');
  useStore.setState({ lockedParams: {}, voiceMix: null });
  S().loadMotion('nope');
  assert.strictEqual(S().voiceMix, null, 'unknown motion id is a no-op');
}

// Presets are layout-only too, even when the data pairs a palette / categories.
{
  const pre = PRESETS.find((p) => p.paletteId && p.categories && p.id !== S().layoutParams.composition);
  assert.ok(pre, 'a preset with a palette + categories pairing exists to test against');
  const b = { paletteId: S().paletteId, assets: { ...S().enabledAssets } };
  S().applyPreset(pre);
  assert.ok(S().voiceMix, 'the preset opens a MIX');
  assert.strictEqual(S().voiceMix.to.paletteId, null, 'preset does not pair a palette');
  S().commitVoiceMix();
  assert.strictEqual(S().paletteId, b.paletteId, 'preset leaves the palette alone');
  assert.deepStrictEqual(S().enabledAssets, b.assets, 'preset leaves the asset pool alone');
}

// Unknown id is a no-op.
S().loadStubMode('nope');
assert.strictEqual(S().voiceMix, null);

console.log('stubMix.selfcheck: OK');
