// wetCeiling.selfcheck.mjs — the wet slider never shows a value the renderer won't honor (#1023).
import assert from 'node:assert';
import { wetDisplay, mathTrackWetCeiling, MATH_WET_CEILING } from './mathFilters.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { getRenderCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const hue = [{ kind: 'hueRotate', params: { degrees: 40 } }];
const gain = [{ kind: 'gain', params: {} }];
const math = (effects, layerOpacity) => ({ type: 'math', effects, layerOpacity });

ok('HUE ROTATE caps the display at 50% and clamps a higher stored value to it', () => {
  for (const [stored, shown] of [[0, 0], [0.3, 0.3], [0.5, 0.5], [0.9, 0.5], [1, 0.5]]) {
    const d = wetDisplay(math(hue, stored));
    assert.equal(d.cap, 0.5);
    assert.equal(d.capped, true);
    assert.equal(d.wet, shown, `stored ${stored}`);
  }
});

ok('without HUE ROTATE the display is the stored value, uncapped', () => {
  for (const stored of [0, 0.25, 0.9, 1]) {
    const d = wetDisplay(math(gain, stored));
    assert.deepEqual(d, { cap: 1, wet: stored, capped: false });
  }
});

ok('FX and content tracks are never capped', () => {
  assert.deepEqual(wetDisplay({ type: 'fx', effects: hue, layerOpacity: 0.9 }), { cap: 1, wet: 0.9, capped: false });
  assert.deepEqual(wetDisplay({ type: 'content', layerOpacity: 0.7 }), { cap: 1, wet: 0.7, capped: false });
});

ok('the stored value is never rewritten: remove HUE ROTATE and the setting returns', () => {
  const layer = math(hue, 0.9);
  assert.equal(wetDisplay(layer).wet, 0.5);
  layer.effects = gain;
  assert.equal(wetDisplay(layer).wet, 0.9);
  assert.equal(layer.layerOpacity, 0.9);
});

ok('junk opacity is clamped, not shown as NaN', () => {
  assert.equal(wetDisplay(math(gain, undefined)).wet, 1);
  assert.equal(wetDisplay(math(gain, NaN)).wet, 1);
  assert.equal(wetDisplay(math(gain, 7)).wet, 1);
  assert.equal(wetDisplay(math(gain, -3)).wet, 0);
  assert.equal(wetDisplay(null).wet, 1);
});

// The actual acceptance: what the slider shows equals what the renderer emits.
// A MATH track resolves exactly as liveResolve.mjs resolves it (isFx + isMath).
const caps = getRenderCaps('balanced', false);
function emittedWet(layer) {
  const doc = {
    version: 1, seed: 1, paletteId: 'praystation', paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, count: 8 },
    enabledAssets: {}, quality: 'balanced', layers: [layer], activeLayerId: layer.id, layerSnapshots: {},
  };
  const resolvedLayers = [{ id: layer.id, isFx: true, isMath: true, layer, layerOpacity: layer.layerOpacity ?? 1, soloGrade: false }];
  const scene = buildSceneContract({ doc, resolvedLayers, caps });
  const w = scene.fxWraps.find((x) => x.fxLayerId === layer.id);
  return w ? w.opacity : null;
}

ok('parity: the slider value equals the opacity the scene contract emits', () => {
  for (const effects of [hue, gain, [...gain, ...hue]]) {
    for (const stored of [0.1, 0.5, 0.75, 1]) {
      const layer = { id: 'm1', name: 'M 1', type: 'math', visible: true, layerBlendMode: 'normal', layerOpacity: stored, effects };
      assert.equal(emittedWet(layer), wetDisplay(layer).wet, `${effects.map((e) => e.kind)} @ ${stored}`);
    }
  }
});

ok('the ceiling constant and helper agree', () => {
  assert.equal(mathTrackWetCeiling(math(hue, 1)), MATH_WET_CEILING);
});

console.log(`wetCeiling.selfcheck: ${n} checks passed`);
