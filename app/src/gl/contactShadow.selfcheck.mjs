// node src/gl/contactShadow.selfcheck.mjs
// #1183 contact shadow (design: docs/design/contact-shadow.md, Matt's decisions 2026-10-12). Node half: the pure
// maths, the scene-contract rules (when a layer casts, what colour, when it is shed), and that every contract
// without a shadow is byte-identical to before. The GPU half runs in the browser selfcheck
// (contactShadow.browser.selfcheck.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHADOW_MAX_OFFSET,
  SHADOW_MAX_OPACITY,
  CONTACT_SHADOW_PROGRAMS,
  CONTACT_SHADOW_COST,
  hexLuminance,
  darkestSwatch,
  shadowOffset,
  blurWeights,
  shadowStrength,
  hexRgb01,
} from './contactShadow.mjs';
import { buildSceneContract, assertSceneContract, contactShadowShed, contractShadow } from './sceneContract.js';
import { getCostTier } from './costTiers.mjs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../data/layout-modes.js';
import { RANDOMIZABLE_KEYS } from '../state/paramUtils.js';
import './renderer.mjs'; // registers the cost tier

// 1. colour: the palette's darkest swatch (decision 5)
{
  assert.equal(darkestSwatch({ swatches: ['#ffffff', '#202020', '#808080'] }), '#202020');
  assert.equal(
    darkestSwatch({ swatches: ['#FF0000', '#0000FF'] }),
    '#0000ff',
    'by luminance (blue is darker than red), lower-cased',
  );
  assert.equal(darkestSwatch({ swatches: ['#101010', '#101010'] }), '#101010', 'a tie keeps the first');
  assert.equal(darkestSwatch({ swatches: ['junk', '#404040'] }), '#404040', 'junk swatches are skipped');
  assert.equal(darkestSwatch(null), '#000000');
  assert.equal(darkestSwatch({ swatches: [] }), '#000000');
  assert.ok(hexLuminance('#000000') === 0 && Math.abs(hexLuminance('#ffffff') - 1) < 1e-12);
  assert.deepEqual(hexRgb01('#ff8000'), [1, 128 / 255, 0]);
}

// 2. direction: away from the sun, capped; straight under with no sun (decision 1)
{
  assert.deepEqual(shadowOffset(300, 300, null), { dx: 0, dy: 0 }, 'no sun: straight under the mark');
  assert.deepEqual(shadowOffset(300, 300, { x: 0, y: 0, height: 0 }), { dx: 0, dy: 0 });
  const sun = { x: 500, y: 350, height: 260 };
  const right = shadowOffset(800, 350, sun);
  assert.ok(right.dx > 0 && right.dy === 0, 'a mark right of the sun throws its shadow further right');
  const above = shadowOffset(500, 100, sun);
  assert.ok(above.dy < 0 && above.dx === 0, 'a mark above the sun throws it further up');
  assert.deepEqual(shadowOffset(500, 350, sun), { dx: 0, dy: 0 }, 'directly under the sun: straight down');
  const low = shadowOffset(800, 350, { ...sun, height: 40 });
  assert.ok(low.dx > right.dx, 'a lower sun throws a longer shadow');
  const far = shadowOffset(-5000, 350, { ...sun, height: 20 });
  assert.ok(Math.abs(Math.hypot(far.dx, far.dy) - SHADOW_MAX_OFFSET) < 1e-9, 'the throw is capped');
}

// 3. blur and strength
{
  const w = blurWeights();
  assert.equal(w.length, 9);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12, 'weights sum to 1 (no brightening or darkening)');
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(w[i] - w[8 - i]) < 1e-15 && w[i] < w[i + 1], 'symmetric, peaked');
  assert.equal(shadowStrength(0), 0);
  assert.equal(shadowStrength(1, 1), SHADOW_MAX_OPACITY);
  assert.equal(shadowStrength(0.5, 0.5), 0.25 * SHADOW_MAX_OPACITY, 'scaled by the layer opacity');
  assert.equal(shadowStrength(9, 9), SHADOW_MAX_OPACITY, 'clamped');
  assert.equal(shadowStrength(NaN), 0);
}

// 4. the knob, the cost tier, the dice
{
  assert.equal(DEFAULT_LAYOUT_PARAMS.groundShadow, 0, 'the knob ships at 0');
  assert.deepEqual(PARAM_SPEC.groundShadow, { min: 0, max: 1 });
  assert.ok(!RANDOMIZABLE_KEYS.includes('groundShadow'), 'the dice never turn it on');
  assert.equal(getCostTier('gl/contact-shadow').tier, 2, 'decision 6: cost tier 2');
  assert.deepEqual(getCostTier('gl/contact-shadow').tier, CONTACT_SHADOW_COST.tier);
  assert.deepEqual(
    CONTACT_SHADOW_PROGRAMS.map((p) => p.key),
    ['silhouette', 'blur', 'lay'],
  );
}

// ── the scene contract ───────────────────────────────────────────────────────────────────────────────────────────
const pal = { swatches: ['#e0d0c0', '#3a2a1a', '#909090'], bg: '#ffffff' };
const item = (x, y) => ({
  x,
  y,
  scale: 1,
  rotation: 0,
  alpha: 1,
  assetId: 'a1',
  color: '#ff0000',
  accent: '#00ff00',
  key: `k${x}`,
});
const content = (id, groundShadow, extra = {}) => ({
  id,
  layer: { id, name: id },
  layoutParams: { groundShadow, blendMode: 'normal' },
  palette: pal,
  items: [item(100, 100), item(400, 300)],
  layerOpacity: 1,
  layerBlendMode: 'normal',
  ...extra,
});
const pattern = (id) => ({
  id,
  isPattern: true,
  layer: { id, name: id },
  pattern: { mode: 'QUILT', seed: 3 },
  palette: pal,
  layerOpacity: 1,
  layerBlendMode: 'normal',
});
const doc = (over = {}) => ({ seed: 7, quality: 'balanced', layers: [], ...over });
const build = (resolvedLayers, d = doc()) => buildSceneContract({ doc: d, resolvedLayers });
const layerOf = (c, id) => c.layers.find((l) => l.id === id);

// 5. casts only with the knob up AND a pattern below (decision 4)
{
  const on = build([pattern('p'), content('c', 0.6)]);
  assert.deepEqual(
    layerOf(on, 'c').shadow,
    { amount: 0.6, color: '#3a2a1a' },
    'knob + ground: the shadow, in the darkest swatch',
  );
  assert.equal(layerOf(build([pattern('p'), content('c', 0)]), 'c').shadow, undefined, 'knob 0: no key');
  assert.equal(layerOf(build([content('c', 1)]), 'c').shadow, undefined, 'no pattern: no key');
  assert.equal(layerOf(build([content('c', 1), pattern('p')]), 'c').shadow, undefined, 'a pattern ABOVE is not ground');
  const mid = build([pattern('p'), content('low', 0.5), content('high', 0.5)]);
  assert.ok(
    layerOf(mid, 'low').shadow && layerOf(mid, 'high').shadow,
    'every layer above the ground can cast (decision 3)',
  );
  assert.equal(layerOf(build([pattern('p'), content('c', 3)]), 'c').shadow.amount, 1, 'amount clamped to 1');
  assert.equal(layerOf(build([pattern('p'), content('c', NaN)]), 'c').shadow, undefined);
}

// 6. off is byte-identical: a contract without a casting layer is exactly what it was
{
  const base = [pattern('p'), content('c', 0)];
  const noKey = [pattern('p'), { ...content('c', 0), layoutParams: { blendMode: 'normal' } }];
  assert.equal(
    JSON.stringify(build(base)),
    JSON.stringify(build(noKey)),
    'knob 0 equals a layout that never heard of it',
  );
  assert.ok(!JSON.stringify(build(base)).includes('shadow'), 'no shadow anywhere in an off contract');
}

// 7. shed: tier 2 goes only after the tier-1 extras AND the PERF step (decision 6); stills never shed
{
  assert.equal(contactShadowShed(doc()), false);
  assert.equal(contactShadowShed(doc({ perfTier1: true, quality: 'balanced' })), false, 'tier 1 shed alone keeps it');
  assert.equal(contactShadowShed(doc({ quality: 'performance' })), false, 'PERF alone keeps it');
  assert.equal(contactShadowShed(doc({ perfTier1: true, quality: 'performance' })), true, 'both: shed');
  const shed = build([pattern('p'), content('c', 1)], doc({ perfTier1: true, quality: 'performance' }));
  assert.equal(layerOf(shed, 'c').shadow, undefined, 'a shed shadow is simply not in the contract');
  assert.equal(contractShadow(content('c', 1), true, true), null);
}

// 8. the validator: a hand-built bad shadow fails loudly
{
  const good = build([pattern('p'), content('c', 0.5)]);
  assertSceneContract(good);
  const bad = (mut) => {
    const c = JSON.parse(JSON.stringify(good));
    mut(c);
    return () => assertSceneContract(c);
  };
  assert.throws(
    bad((c) => {
      layerOf(c, 'c').shadow.amount = 0;
    }),
    /shadow.amount/,
  );
  assert.throws(
    bad((c) => {
      layerOf(c, 'c').shadow.amount = 2;
    }),
    /shadow.amount/,
  );
  assert.throws(
    bad((c) => {
      layerOf(c, 'c').shadow.color = 'red';
    }),
    /shadow.color/,
  );
  assert.throws(
    bad((c) => {
      layerOf(c, 'p').shadow = { amount: 0.5, color: '#000000' };
    }),
    /only content layers/,
  );
}

// 9. wiring: the renderer runs the passes only for a layer that carries `shadow`; the live docs carry perfTier1
{
  const r = readFileSync(new URL('./renderer.mjs', import.meta.url), 'utf8');
  assert.match(
    r,
    /if \(layer\.type === 'content' && layer\.shadow\) \{\s*contactShadow\.apply\(/,
    'gated on the contract key',
  );
  assert.equal((r.match(/contactShadow\.apply\(/g) || []).length, 1, 'one call site');
  assert.equal((r.match(/maskFor\(layer\.id\)/g) || []).length, 1, 'the matte is rendered once per layer');
  assert.match(
    readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8'),
    /perfTier1: !!s\.perfTier1/,
    'liveLoop tells the contract about the tier-1 shed',
  );
}

console.log('contactShadow node: ok');

// ── GPU: the real renderer in headless Chromium (parity driver) ──────────────────────────────────────────────────
// One big mark in the middle of a FIELD pattern. Off is byte-identical; on darkens around the mark toward the
// palette's darkest swatch; far pixels never change; a sun on the left throws the shadow to the right.
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const { ASSETS } = await import('../data/assets/index.js');
  const { defaultPattern } = await import('../state/patternTrack.js');
  const W = 400;
  const H = 280;
  const gpal = { swatches: ['#f2e6d0', '#d8c8a8', '#1b2a4a'], bg: '#f2e6d0' };
  const mark = {
    assetId: ASSETS[0].id,
    x: 500,
    y: 350,
    scale: 2.2,
    rotation: 0,
    color: '#e05030',
    accent: '#e05030',
    alpha: 100,
    key: 'm0',
  };
  const scene = (groundShadow, light = null) =>
    buildSceneContract({
      doc: { seed: 1, quality: 'balanced', ...(light ? { light, palette: gpal } : {}) },
      resolvedLayers: [
        {
          id: 'p',
          isPattern: true,
          layer: { id: 'p', name: 'p' },
          pattern: defaultPattern('FIELD', 3),
          palette: gpal,
          layerOpacity: 1,
          layerBlendMode: 'normal',
        },
        {
          id: 'c',
          layer: { id: 'c', name: 'c' },
          layoutParams: { groundShadow, blendMode: 'normal' },
          palette: gpal,
          items: [mark],
          layerOpacity: 1,
          layerBlendMode: 'normal',
        },
      ],
    });
  const render = async (c) => (await renderViaGL(c, { width: W, height: H, bg: '#f2e6d0' })).pixels;
  const px = (buf, x, y) => {
    const i = (y * W + x) * 4;
    return [buf[i], buf[i + 1], buf[i + 2]];
  };
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  try {
    const off = await render(scene(0));
    const onC = scene(1);
    assert.ok(layerOf(onC, 'c').shadow, 'fixture: the layer casts');
    const stripped = JSON.parse(JSON.stringify(onC));
    delete layerOf(stripped, 'c').shadow;
    assert.equal(
      Buffer.compare(await render(stripped), off),
      0,
      'no shadow key: byte-identical to knob 0 (nothing runs)',
    );
    const on = await render(onC);
    assert.notEqual(Buffer.compare(on, off), 0, 'the shadow changes the frame');

    let darker = 0;
    let lighter = 0;
    let farChanged = 0;
    let towardInk = 0;
    let changed = 0;
    const ink = [0x1b, 0x2a, 0x4a];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const a = px(off, x, y);
        const b = px(on, x, y);
        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        const r = Math.hypot(x - W / 2, y - H / 2);
        if (r > 120 && d > 3) farChanged++;
        if (d <= 3) continue;
        changed++;
        if (lum(b) < lum(a) - 0.5) darker++;
        else if (lum(b) > lum(a) + 0.5) lighter++;
        const dist = (c) => Math.hypot(c[0] - ink[0], c[1] - ink[1], c[2] - ink[2]);
        if (dist(b) < dist(a)) towardInk++;
      }
    assert.ok(changed > 200, `a visible soft shadow (${changed} px changed)`);
    assert.equal(farChanged, 0, 'pixels far from the mark never change');
    assert.ok(
      darker > changed * 0.9 && lighter <= changed * 0.02,
      `the shadow darkens, never lightens (${darker} darker, ${lighter} lighter of ${changed})`,
    );
    assert.ok(
      towardInk > changed * 0.95,
      `every shadowed pixel moves toward the darkest swatch (${towardInk}/${changed})`,
    );

    // a sun on the left throws the shadow to the right
    const sun = {
      x: -400,
      y: 350,
      height: 120,
      intensity: 0.0001,
      ambient: 1,
      slot: 'white',
      bevel: 0,
      spec: 0,
      pool: 0,
    };
    const litOff = await render(scene(0, sun));
    const litOn = await render(scene(1, sun));
    let left = 0;
    let right = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = lum(px(litOff, x, y)) - lum(px(litOn, x, y));
        if (d <= 0.5) continue;
        if (x < W / 2) left += d;
        else right += d;
      }
    assert.ok(
      right > left * 1.5,
      `the shadow falls away from the sun (right ${right.toFixed(0)} vs left ${left.toFixed(0)})`,
    );
    console.log(
      `contactShadow GPU: ok — ${changed} px shadowed, sun throw right/left ${(right / Math.max(1, left)).toFixed(1)}x`,
    );
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser contact-shadow tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log('contactShadow.selfcheck: ok (#1183 contact shadow)');
