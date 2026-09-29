// node src/data/voices.selfcheck.mjs
import assert from 'node:assert';
import {
  FLAGSHIP_VOICES,
  STUB_VOICES,
  FLAGSHIP_VOICE_IDS,
  resolveVoiceState,
  sanitizeFx,
  mixVoiceState,
  isFlagshipVoiceId,
  VOICE_SWATCH_COUNT,
} from './voices.js';
import { DEFAULT_LAYOUT_PARAMS, MODE_IDS, validateLayoutParams } from './layout-modes.js';

// #515: HYPE read as rattle, not pulse — its life LFO was the hottest of the three
// flagships (0.5). Retuned to 0.3; raise it deliberately, with a play-test.
{
  const life = (id) => resolveVoiceState(FLAGSHIP_VOICES.find((v) => v.id === id)).params.lifeDrift;
  assert.ok(life('hype') <= 0.3, `HYPE lifeDrift ${life('hype')} must not exceed 0.3`);
}

// Three flagships, each a COMPLETE state.
assert.strictEqual(FLAGSHIP_VOICES.length, 3);
assert.deepStrictEqual(FLAGSHIP_VOICE_IDS, ['swarm', 'hype', 'murmuration']);

for (const v of FLAGSHIP_VOICES) {
  const st = resolveVoiceState(v);
  assert.deepStrictEqual(Object.keys(st.params).sort(), Object.keys(DEFAULT_LAYOUT_PARAMS).sort(), `${v.id} params complete`);
  const { rejected } = validateLayoutParams(st.params);
  assert.deepStrictEqual(rejected, [], `${v.id} params validate clean`);
  assert.match(st.palette.bg, /^#[0-9a-f]{6}$/, `${v.id} bg hex`);
  assert.match(st.palette.ink, /^#[0-9a-f]{6}$/, `${v.id} ink hex`);
  assert.strictEqual(st.palette.swatches.length, VOICE_SWATCH_COUNT, `${v.id} 8 swatches`);
  for (const c of st.palette.swatches) assert.match(c, /^#[0-9a-f]{6}$/, `${v.id} swatch hex`);
  assert.deepStrictEqual(Object.keys(st.fx).sort(), ['contrast', 'edge', 'glow', 'grain', 'posterize', 'vignette'].sort());
  assert.ok(st.blendSeconds > 0, `${v.id} blendSeconds`);
  assert.strictEqual(Object.keys(st.assets).length, 4, `${v.id} must constrain to exactly 4 curated assets`);
}

// Spot-check the spec values. #743 SWARM factory cut.
const swarm = resolveVoiceState(FLAGSHIP_VOICES[0]);
assert.strictEqual(swarm.palette.bg, '#0a0e1a');
assert.strictEqual(swarm.params.mode, 'swarm');
assert.strictEqual(swarm.params.particleCount, 120);
assert.strictEqual(swarm.params.count, 160);
assert.strictEqual(swarm.params.accumulation, true);
assert.strictEqual(swarm.fx.grain, 0.35);
assert.strictEqual(swarm.fx.vignette, true);

const hype = resolveVoiceState(FLAGSHIP_VOICES[1]);
assert.strictEqual(hype.palette.bg, '#000000');
assert.strictEqual(hype.params.symmetry, 'bilateral');
assert.strictEqual(hype.params.behave, 'scatter');
assert.strictEqual(hype.fx.posterize, true);
assert.strictEqual(hype.fx.edge, true);

const murm = resolveVoiceState(FLAGSHIP_VOICES[2]);
assert.strictEqual(murm.params.mode, 'murmuration');
assert.ok(MODE_IDS.includes('murmuration'), 'murmuration is a real mode id');
assert.strictEqual(murm.params.paletteShift, 'split');
assert.ok(murm.blendSeconds >= 10, 'ten-second dissolves');

assert.strictEqual(STUB_VOICES.length, 12);
for (const stub of STUB_VOICES) {
  assert.ok(MODE_IDS.includes(stub.id), `stub ${stub.id} is a real mode`);
  assert.ok(!isFlagshipVoiceId(stub.id), `stub ${stub.id} is not a flagship`);
}
for (const id of FLAGSHIP_VOICE_IDS) assert.ok(MODE_IDS.includes(id), `flagship ${id} is a real mode`);

const a = resolveVoiceState(FLAGSHIP_VOICES[0]);
const b = resolveVoiceState(FLAGSHIP_VOICES[1]);
const at0 = mixVoiceState(a, b, 0);
assert.deepStrictEqual(at0.params, a.params, 't=0 returns from');
assert.deepStrictEqual(at0.palette, a.palette, 't=0 palette returns from');
const at1 = mixVoiceState(a, b, 1);
assert.deepStrictEqual(at1.params, b.params, 't=1 returns to');
assert.deepStrictEqual(at1.palette, b.palette, 't=1 palette returns to');
const mid = mixVoiceState(a, b, 0.5);
const optA = a.params.accumulationOptics;
const optB = b.params.accumulationOptics;
assert.strictEqual(mid.params.accumulationOptics, optA + (optB - optA) * 0.5);
// int params round: swarm particleCount 120 → hype 90
assert.strictEqual(mid.params.particleCount, 105);
assert.deepStrictEqual(mid.params.scale, [0.75, 1.85]);
assert.strictEqual(mixVoiceState(a, b, 0).params.mode, 'swarm');
assert.strictEqual(mixVoiceState(a, b, 0.49).params.mode, 'hype');
assert.strictEqual(mid.params.mode, 'hype');
assert.strictEqual(mid.params.blendMode, 'screen');
assert.strictEqual(mid.palette.bg, '#05070d');
assert.strictEqual(mid.palette.swatches.length, VOICE_SWATCH_COUNT);
assert.strictEqual(mid.fx.grain, 0.175);
assert.strictEqual(mid.fx.vignette, false);
assert.strictEqual(mixVoiceState(a, b, 0).fx.vignette, true);
assert.strictEqual(mixVoiceState(a, b, 0.49).fx.vignette, false);
assert.strictEqual(mid.fx.posterize, true);

assert.deepStrictEqual(sanitizeFx({ grain: 9, glow: -2, vignette: 1, contrast: 99 }),
  { grain: 1, vignette: true, posterize: false, edge: false, glow: 0, contrast: 3 });
assert.deepStrictEqual(sanitizeFx(null), sanitizeFx({}));

{
  const p = (id) => resolveVoiceState(FLAGSHIP_VOICES.find((v) => v.id === id)).params;
  for (const id of FLAGSHIP_VOICE_IDS) {
    assert.ok(p(id).breath > 0 && p(id).metabolism > 0, `${id} carries breath + metabolism`);
  }
  assert.ok(p('hype').metabolism > p('swarm').metabolism && p('swarm').metabolism > p('murmuration').metabolism, 'metabolism: HYPE > SWARM > MURM');
  assert.ok(p('murmuration').breath > p('hype').breath && p('hype').breath > p('swarm').breath, 'breath: MURM > HYPE > SWARM');
}

console.log('voices.selfcheck: OK');
