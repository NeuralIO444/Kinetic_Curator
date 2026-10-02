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
import { ASSETS } from './assets/index.js';
import { getCatalogPalette } from './palettes.js';
import { COMPOSITION_PRESETS } from './presets.js';

// #515: HYPE read as rattle, not pulse — its life LFO was the hottest of the three
// flagships (0.5). Retuned to 0.3; raise it deliberately, with a play-test.
{
  const life = (id) => resolveVoiceState(FLAGSHIP_VOICES.find((v) => v.id === id)).params.lifeDrift;
  assert.ok(life('hype') <= 0.3, `HYPE lifeDrift ${life('hype')} must not exceed 0.3`);
}

// Four flagships, each a COMPLETE state.
assert.strictEqual(FLAGSHIP_VOICES.length, 4);
assert.deepStrictEqual(FLAGSHIP_VOICE_IDS, ['swarm', 'hype', 'murmuration', 'dark-glass']);

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

// #519 — HYPE four locked to the Tropism taste (Matt's call 2026-09-30):
// bloom, stem, coil, petal. The fourth seat is org_petal_01, not the sprig.
assert.deepStrictEqual(
  Object.keys(hype.assets).sort(),
  ['flora_flower_01', 'flora_vine_01', 'line_spiral_01', 'org_petal_01'].sort(),
  'HYPE four is the Tropism taste lock',
);

const murm = resolveVoiceState(FLAGSHIP_VOICES[2]);
assert.strictEqual(murm.params.mode, 'murmuration');
assert.ok(MODE_IDS.includes('murmuration'), 'murmuration is a real mode id');
assert.strictEqual(murm.params.paletteShift, 'split');
assert.ok(murm.blendSeconds >= 10, 'ten-second dissolves');

assert.strictEqual(STUB_VOICES.length, 14); // #834: +dla, +eden growth tiles
for (const stub of STUB_VOICES) {
  assert.ok(MODE_IDS.includes(stub.id), `stub ${stub.id} is a real mode`);
  assert.ok(!isFlagshipVoiceId(stub.id), `stub ${stub.id} is not a flagship`);
}
// A flagship is a Voice over a mode (#735), not necessarily a mode itself:
// SWARM/HYPE/MURM happen to share their mode's id; DARK GLASS (#704) rides
// fibonacci. What must hold: every flagship lands on a real mode, and no
// flagship id shadows a stub chip.
for (const v of FLAGSHIP_VOICES) {
  assert.ok(MODE_IDS.includes(resolveVoiceState(v).params.mode), `flagship ${v.id} lands on a real mode`);
  assert.ok(!STUB_VOICES.some((s) => s.id === v.id), `flagship ${v.id} does not shadow a stub chip`);
}

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

// #704 — DARK GLASS: the chiaroscuro mode in one press. Its cast is four
// crystalline facets, each painting a TE-limited gradient (≤2 stops, palette
// slots only — var(--ink)/var(--accent), no literal colours) so it resolves
// through the live palette. Palette = the CHIAROSCURO catalog entry; layout =
// the CHIAROSCURO Look. If either twin is retuned, this fails until they agree.
{
  const def = FLAGSHIP_VOICES.find((v) => v.id === 'dark-glass');
  assert.ok(def, 'dark-glass voice exists');
  const st = resolveVoiceState(def);
  for (const id of Object.keys(st.assets)) {
    const a = ASSETS.find((x) => x.id === id);
    assert.ok(a, `${id} is a real asset`);
    assert.strictEqual(a.category, 'crystalline', `${id} must be a crystalline facet`);
    const grads = a.svg.match(/<(linear|radial)Gradient[\s\S]*?<\/(linear|radial)Gradient>/g) || [];
    assert.ok(grads.length >= 1, `${id} paints a gradient`);
    for (const g of grads) {
      const stops = g.match(/<stop\b[^>]*>/g) || [];
      assert.ok(stops.length >= 2 && stops.length <= 2, `${id}: two stops max (got ${stops.length})`);
      for (const s of stops) {
        assert.match(s, /stop-color="var\(--(ink|accent)\)"/, `${id}: stops are palette slots only — ${s}`);
      }
    }
  }
  const cat = getCatalogPalette('chiaroscuro');
  assert.strictEqual(st.palette.bg, cat.bg.toLowerCase(), 'bg = CHIAROSCURO palette');
  assert.strictEqual(st.palette.ink, cat.ink.toLowerCase(), 'ink = CHIAROSCURO palette');
  const look = COMPOSITION_PRESETS.find((p) => p.id === 'chiaroscuro');
  for (const [k, v] of Object.entries(look.params)) {
    assert.deepStrictEqual(st.params[k], v, `params.${k} = CHIAROSCURO Look`);
  }
  console.log('voices.selfcheck: dark-glass — 4 crystalline gradient facets, CHIAROSCURO palette + Look');
}

console.log('voices.selfcheck: OK');
