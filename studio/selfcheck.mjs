#!/usr/bin/env node
// studio/selfcheck.mjs — asserts the SVG emitter agrees with the kernel and
// emits nothing resvg can't resolve. Run: node studio/selfcheck.mjs
import assert from 'node:assert/strict';
import { getRenderCaps } from '../app/src/data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../app/src/data/layout-modes.js';
import { ASSETS } from '../app/src/data/assets/index.js';
import { renderSvg, resolveLayers, CANVAS_W, CANVAS_H } from './render.mjs';

const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, true]));
const base = {
  version: 1,
  seed: 0x12345678,
  paletteId: 'praystation',
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0 },
  enabledAssets,
  quality: 'balanced',
};

const caps = getRenderCaps('balanced', false);

// 1. Single layer: every kernel item reaches the SVG as its own <g><use>.
{
  const layers = resolveLayers(base, { caps });
  const svg = renderSvg(base);
  assert.equal(layers.length, 1);
  assert.equal((svg.match(/<use /g) || []).length, layers[0].items.length,
    'one <use> per kernel item');
  assert.ok(svg.includes(`viewBox="0 0 ${CANVAS_W} ${CANVAS_H}"`));
}

// 2. Multi-layer: active layer reads top-level fields, others read snapshots,
//    and both are drawn in `layers` order.
{
  const doc = {
    ...base,
    layers: [
      { id: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      { id: 'b', visible: true, layerBlendMode: 'screen', layerOpacity: 0.5 },
      { id: 'c', visible: false, layerBlendMode: 'normal', layerOpacity: 1 },
    ],
    activeLayerId: 'a',
    layerSnapshots: {
      b: { seed: 99, paletteId: 'praystation', paletteOverrides: null,
        layoutParams: { ...base.layoutParams, count: 30 }, caGrid: null, enabledAssets },
    },
  };
  const layers = resolveLayers(doc, { caps });
  assert.equal(layers.length, 2, 'invisible layers are skipped');
  assert.equal(layers[0].items.length, resolveLayers(base, { caps })[0].items.length,
    'active layer uses top-level fields');
  assert.ok(layers[1].items.length < layers[0].items.length,
    'inactive layer uses its snapshot');
  const svg = renderSvg(doc);
  assert.ok(svg.includes('mix-blend-mode:screen') && svg.includes('opacity="0.5"'));
}

// 3. No CSS custom properties survive — resvg cannot resolve var().
{
  const svg = renderSvg({ ...base, layoutParams: { ...base.layoutParams, shading: 'gloss', hueRotate: 40 } });
  assert.ok(!svg.includes('var(--'), 'all --ink/--accent substituted');
  assert.ok(svg.includes('feColorMatrix'), 'hue-rotate emitted as an SVG filter');
  assert.ok(svg.includes('url(#kc-gloss-grad)'), 'gloss overlay emitted');
}

// 4. Determinism: same doc -> byte-identical SVG; different seed -> different.
{
  assert.equal(renderSvg(base), renderSvg(base));
  assert.notEqual(renderSvg(base), renderSvg({ ...base, seed: 1 }));
}

// 5. Time/ramp actually move things, and t=0 is the identity frame.
{
  assert.ok(renderSvg(base, { time: 0 }).includes('rotate(0) scale(1)'));
  // base pins lifeDrift:0, which switches the breath off entirely.
  const drifty = { ...base, layoutParams: { ...base.layoutParams, lifeDrift: 0.35 } };
  assert.notEqual(renderSvg(drifty, { time: 0 }), renderSvg(drifty, { time: 1.7 }));
  assert.ok(renderSvg(drifty, { time: 0 }).includes('rotate(0) scale(1)'),
    't=0 is still the identity frame');
  assert.notEqual(
    renderSvg(base, { ramp: { displacement: [0, 200] }, progress: 0 }),
    renderSvg(base, { ramp: { displacement: [0, 200] }, progress: 1 }),
  );
}

console.log('studio selfcheck OK');
