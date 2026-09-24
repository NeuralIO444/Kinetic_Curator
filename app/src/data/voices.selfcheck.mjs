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
  // params: every default key present, and the firewall accepts the batch
  // with no rejections.
  assert.deepStrictEqual(Object.keys(st.params).sort(), Object.keys(DEFAULT_LAYOUT_PARAMS).sort(), `${v.id} params complete`);
  const { rejected } = validateLayoutParams(st.params);
  assert.deepStrictEqual(rejected, [], `${v.id} params validate clean`);
  // palette: bg + ink + 8 valid hex swatches
  assert.match(st.palette.bg, /^#[0-9a-f]{6}$/, `${v.id} bg hex`);
  assert.match(st.palette.ink, /^#[0-9a-f]{6}$/, `${v.id} ink hex`);
  assert.strictEqual(st.palette.swatches.length, VOICE_SWATCH_COUNT, `${v.id} 8 swatches`);
  for (const c of st.palette.swatches) assert.match(c, /^#[0-9a-f]{6}$/, `${v.id} swatch hex`);
  // fx chain has the full shape
  assert.deepStrictEqual(Object.keys(st.fx).sort(), ['contrast', 'edge', 'glow', 'grain', 'posterize', 'vignette'].sort());
  assert.ok(st.blendSeconds > 0, `${v.id} blendSeconds`);
}

// Spot-check the spec values.
const swarm = resolveVoiceState(FLAGSHIP_VOICES[0]);
assert.strictEqual(swarm.palette.bg, '#0a0e1a');
assert.strictEqual(swarm.params.mode, 'swarm');
assert.strictEqual(swarm.params.particleCount, 280);
assert.strictEqual(swarm.params.accumulation, true);
assert.strictEqual(swarm.fx.grain, 0.6);
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

// Stubs: every non-flagship mode has a stub entry, ids match real modes.
assert.strictEqual(STUB_VOICES.length, 12);
for (const stub of STUB_VOICES) {
  assert.ok(MODE_IDS.includes(stub.id), `stub ${stub.id} is a real mode`);
  assert.ok(!isFlagshipVoiceId(stub.id), `stub ${stub.id} is not a flagship`);
}
// Flagship ids are real modes too.
for (const id of FLAGSHIP_VOICE_IDS) assert.ok(MODE_IDS.includes(id), `flagship ${id} is a real mode`);

// MIX interpolation.
const a = resolveVoiceState(FLAGSHIP_VOICES[0]);
const b = resolveVoiceState(FLAGSHIP_VOICES[1]);
const at0 = mixVoiceState(a, b, 0);
assert.deepStrictEqual(at0.params, a.params, 't=0 returns from');
assert.deepStrictEqual(at0.palette, a.palette, 't=0 palette returns from');
const at1 = mixVoiceState(a, b, 1);
assert.deepStrictEqual(at1.params, b.params, 't=1 returns to');
assert.deepStrictEqual(at1.palette, b.palette, 't=1 palette returns to');
const mid = mixVoiceState(a, b, 0.5);
// numeric lerp: swarm glow → hype glow, read from the voices themselves so the
// #361 ACCUM glow ceiling can retune both without breaking this.
const optA = a.params.accumulationOptics;
const optB = b.params.accumulationOptics;
assert.strictEqual(mid.params.accumulationOptics, optA + (optB - optA) * 0.5);
// int params round: swarm particleCount 280 → hype 90
assert.strictEqual(mid.params.particleCount, 185);
// arrays lerp elementwise: scale [0.3,1.1] → [1.2,2.6]
assert.deepStrictEqual(mid.params.scale, [0.75, 1.85]);
// Spine E: enums do not snap at midpoint; t=0 returns from, t>0 takes `to`
assert.strictEqual(mixVoiceState(a, b, 0).params.mode, 'swarm');
assert.strictEqual(mixVoiceState(a, b, 0.49).params.mode, 'hype');
assert.strictEqual(mid.params.mode, 'hype');
assert.strictEqual(mid.params.blendMode, 'screen'); // both screen — no-op sanity
// palette lerps color-by-color: indigo #0a0e1a → black #000000 at t=0.5
assert.strictEqual(mid.palette.bg, '#05070d');
assert.strictEqual(mid.palette.swatches.length, VOICE_SWATCH_COUNT);
// fx numbers lerp, booleans take `to` for t>0
assert.strictEqual(mid.fx.grain, 0.3);
assert.strictEqual(mid.fx.vignette, false); // t>0 takes `to` for booleans
assert.strictEqual(mixVoiceState(a, b, 0).fx.vignette, true); // t=0 returns `from`
assert.strictEqual(mixVoiceState(a, b, 0.49).fx.vignette, false);
assert.strictEqual(mid.fx.posterize, true);

// sanitizeFx clamps.
assert.deepStrictEqual(sanitizeFx({ grain: 9, glow: -2, vignette: 1, contrast: 99 }),
  { grain: 1, vignette: true, posterize: false, edge: false, glow: 0, contrast: 3 });
assert.deepStrictEqual(sanitizeFx(null), sanitizeFx({}));

console.log('voices.selfcheck: OK');
