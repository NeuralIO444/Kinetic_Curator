#!/usr/bin/env node
// Perf probe — #189 acceptance: "3 stacked FX layers hold 60fps" (the case
// that culled to 28fps on SVG).
//
// Renders the fx-stack-3 corpus scene N times through the real GL page and
// reports per-render ms. The atlas is uploaded once and programs compile on
// the warm-up call; each timed call runs renderScene (targets alloc/free per
// call) plus readPixels — an upper bound on a live loop's frame cost, which
// would persist targets and skip readPixels.
//
//   node src/gl/parity/perf.mjs [sceneId] [iters] [width] [quality]
// The quality override exists to exercise the full 3-wrap FX stack at
// different tiers; since #192 all tiers composite every FX wrap (maxFxLayers
// retired as a budget), so the override now only changes count/particle
// density between tiers.
import { getScene } from './corpus.mjs';
import { buildSceneContract } from '../sceneContract.js';
import { resolveLayers } from '../../../../studio/render.mjs';
import { getRenderCaps } from '../../data/quality.js';
import { buildRenderPayload, openHarnessPage, closeGlDriver } from './glDriver.mjs';

async function main(argv) {
  const sceneId = argv[0] || 'fx-stack-3';
  const iters = Number(argv[1] || 30);
  const width = Number(argv[2] || 1000);
  const quality = argv[3] || null;
  const scene = getScene(sceneId);
  const doc = { ...scene.doc, ...(quality ? { quality } : {}) };
  const caps = getRenderCaps(doc.quality || 'balanced', false);
  const resolvedLayers = resolveLayers(doc, { caps });
  const contract = buildSceneContract({ doc, resolvedLayers, caps });
  const bg = resolvedLayers[0]?.palette?.bg || '#000000';
  const height = Math.round((width * 700) / 1000);
  const payload = buildRenderPayload(contract, { width, height, bg });
  const { page, close } = await openHarnessPage('/parity/glHarness.html');
  try {
    const r = await page.evaluate(([p, k]) => window.__kcPerf(p, k), [payload, iters]);
    console.log(
      `[perf:${sceneId}] ${r.width}x${r.height} x${r.iters}: ` +
      `avg ${r.avgMs.toFixed(2)}ms (${r.fps.toFixed(1)} fps), ` +
      `p50 ${r.p50Ms.toFixed(2)}ms, min ${r.minMs.toFixed(2)}ms`
    );
    console.log(
      `[perf:${sceneId}] ${r.avgMs < 16.67 ? 'HOLDS 60fps' : 'BELOW 60fps'} ` +
      `(budget 16.67ms/frame; includes readPixels, so this is an upper bound)`
    );
  } finally {
    await close();
    await closeGlDriver();
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
