// node src/curator/refineColor.selfcheck.mjs
// #1365 Q2 (Matt, 2026-10-12): in REFINE a CURATOR press varies colour by a small hue drift and a little warmer /
// cooler, bounded like refine's layout spread; contrast, bg and ink untouched. Around what was KEPT (no walk), locked
// swatches held, one undo step, explore untouched, and the kept palette's weights preserved.
import assert from 'node:assert/strict';
import { colorDeal, warmHex, nudgeSwatches, anchorValid, REFINE_HUE_RANGE, REFINE_WARM_RANGE, WARM_K } from './refineColor.js';
import { DEFAULT_SPREAD } from './refineMutate.js';
import { mkRng } from '../engine/prng.js';
import { rngForIndex, CH } from '../engine/kernel/rng.js';
import { resolvePalette, getCatalogPalette } from '../data/palettes.js';
import { useStore } from '../state/store.js';
import { initPhase, resetPhase, getPhase, PHASE_REFINE, PHASE_EXPLORE } from './phase.js';

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

// 1. the deal: bounded like refine's spread, centred, deterministic
{
  const maxHue = DEFAULT_SPREAD * REFINE_HUE_RANGE; const maxWarm = DEFAULT_SPREAD * REFINE_WARM_RANGE;
  assert.ok(Math.abs(maxHue - 12) < 1e-9 && Math.abs(maxWarm - 0.2) < 1e-9, 'at spread 0.10: +/-12 degrees, +/-0.2 warmth');
  const rng = mkRng(7); let sumH = 0; let sumW = 0;
  for (let i = 0; i < 4000; i++) {
    const d = colorDeal(rng);
    assert.ok(Math.abs(d.hue) <= maxHue + 1e-9 && Math.abs(d.warm) <= maxWarm + 1e-9, 'bounded');
    sumH += d.hue; sumW += d.warm;
  }
  assert.ok(Math.abs(sumH / 4000) < 0.6 && Math.abs(sumW / 4000) < 0.01, 'centred on the kept palette');
  const a = mkRng(99); const b = mkRng(99);
  assert.deepEqual(colorDeal(a), colorDeal(b), 'deterministic per stream');
}

// 2. warmth: red up / blue down, small, never a contrast change
{
  const [r, g, b] = rgb(warmHex('#808080', 0.2));
  assert.ok(r > 128 && g === 128 && b < 128, 'warmer: red up, blue down');
  const [r2, , b2] = rgb(warmHex('#808080', -0.2));
  assert.ok(r2 < 128 && b2 > 128, 'cooler: the other way');
  assert.equal(warmHex('#336699', 0), '#336699');
  for (const c of ['#c6ff00', '#ff2d78', '#00e5ff', '#161616', '#f5f2ea']) {
    const step = 0.2 * WARM_K * 255;
    assert.ok(Math.abs(lum(warmHex(c, 0.2)) - lum(c)) <= step * 0.15 + 1, `${c}: lightness barely moves`);
  }
}

// 3. locks hold; the anchor is stale when anything else touched the palette or a keep landed
{
  const sw = ['#ff0000', '#00ff00', '#0000ff'];
  const out = nudgeSwatches(sw, { hue: 10, warm: 0.1 }, { 1: true });
  assert.equal(out[1], '#00ff00', 'a locked swatch never drifts');
  assert.notEqual(out[0], sw[0]); assert.notEqual(out[2], sw[2]);
  assert.deepEqual(nudgeSwatches(sw, { hue: 0, warm: 0 }), sw);
  const ov = { swatches: ['#111111'] };
  const anchor = { paletteId: 'p', overrides: null, keepCount: 2, lastOverrides: ov };
  assert.equal(anchorValid(anchor, { paletteId: 'p', paletteOverrides: ov }, 2), true);
  assert.equal(anchorValid(anchor, { paletteId: 'q', paletteOverrides: ov }, 2), false, 'another palette');
  assert.equal(anchorValid(anchor, { paletteId: 'p', paletteOverrides: { swatches: ['#111111'] } }, 2), false, 'someone else edited it');
  assert.equal(anchorValid(anchor, { paletteId: 'p', paletteOverrides: ov }, 3), false, 'a keep landed');
  assert.equal(anchorValid(null, { paletteId: 'p' }, 0), false);
}

// ── the real store ────────────────────────────────────────────────────────────────────────────────────────────────
const S = () => useStore.getState();
initPhase(useStore.subscribe);
const PAL = 'persona-davis';
const fresh = () => {
  resetPhase();
  useStore.setState({
    seed: 4242, seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 }, curatePress: 0, paletteId: PAL, paletteOverrides: null,
    paletteLocks: {}, lockedParams: {}, refinePaletteAnchor: null, favorites: [], keeps: [], historyUndoStack: [], historyRedoStack: [],
  });
};
const keep = () => useStore.setState({ favorites: [...(S().favorites || []), { seed: S().seed, config: {} }] });
const catalog = getCatalogPalette(PAL);
const expected = (anchorSwatches, press, locks = {}) =>
  nudgeSwatches(anchorSwatches, colorDeal(rngForIndex(4242, CH.color, press + 0x20000, S().seedOffsets)), locks);

// 4. explore never drifts the palette; refine does, exactly the deal, around the KEPT palette (no walk)
{
  fresh();
  S().curateUnlocked();
  assert.notEqual(getPhase(), PHASE_REFINE);
  assert.equal(S().paletteOverrides, null, 'explore / no phase: no drift');

  fresh(); keep();
  assert.equal(getPhase(), PHASE_REFINE, 'fixture: a keep puts the instrument in refine');
  for (let press = 0; press < 25; press++) {
    S().curateUnlocked();
    assert.equal(getPhase(), PHASE_REFINE, 'the drift never knocks the instrument out of refine');
    assert.deepEqual(S().paletteOverrides.swatches, expected(catalog.swatches, press), `press ${press}: a fresh deal from the kept palette`);
    assert.equal(S().paletteOverrides.bg, undefined, 'bg untouched');
    assert.equal(S().paletteOverrides.ink, undefined, 'ink untouched');
  }
  const r = resolvePalette(S().paletteId, S().paletteOverrides, []);
  assert.deepEqual(r.weights, catalog.weights, 'the kept palette\'s weights ride along (which colour is which is unchanged)');
  assert.equal(r.bg, catalog.bg);
}

// 5. one press is one undo step: undo restores palette and layout together
{
  fresh(); keep();
  const before = { overrides: S().paletteOverrides, layout: JSON.stringify(S().layoutParams) };
  S().curateUnlocked();
  assert.notEqual(S().paletteOverrides, null);
  S().undo();
  assert.equal(S().paletteOverrides, before.overrides, 'undo restores the palette');
  assert.equal(JSON.stringify(S().layoutParams), before.layout, 'and the layout, in the same step');
}

// 6. re-anchoring: a new keep, an artist edit, a new palette — and locks
{
  fresh(); keep();
  S().curateUnlocked(); S().curateUnlocked();
  const kept = S().paletteOverrides.swatches.slice();
  keep(); // the artist keeps the drifted look: it becomes the anchor
  S().curateUnlocked();
  assert.deepEqual(S().paletteOverrides.swatches, expected(kept, 2), 'after a keep, refine varies around what was just kept');

  fresh(); keep();
  S().curateUnlocked();
  S().setPaletteSwatch(0, '#123456'); // the artist edits a swatch
  assert.equal(S().paletteOverrides.weights, undefined, 'an artist edit drops the carried weights (#1049: derive)');
  const edited = resolvePalette(S().paletteId, S().paletteOverrides, []).swatches;
  S().curateUnlocked();
  assert.deepEqual(S().paletteOverrides.swatches, expected(edited, 1), 'and refine re-anchors on the edited palette');

  fresh(); keep();
  useStore.setState({ paletteLocks: { 0: true, 3: true } });
  for (let i = 0; i < 5; i++) S().curateUnlocked();
  assert.equal(S().paletteOverrides.swatches[0], catalog.swatches[0], 'locked swatch 1 holds');
  assert.equal(S().paletteOverrides.swatches[3], catalog.swatches[3], 'locked swatch 4 holds');
}

resetPhase();
void PHASE_EXPLORE;
console.log('refineColor.selfcheck: ok (#1365 Q2, refine varies colour gently around the kept palette)');
