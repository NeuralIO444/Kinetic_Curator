// node src/gl/presentOrientation.selfcheck.mjs
// The live canvas shows the scene the right way up: what the visible canvas displays is the same picture the readback
// (every export, the stage mirror) returns. Before this, present() flipped the frame for the visible canvas as if it
// were a readback target, so the live view was upside-down against exports, the pointer and every pin.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSceneContract } from './sceneContract.js';
import { presentProbeViaGL, closeGlDriver } from './parity/glDriver.mjs';
import { isBrowserMissingError } from './exportStill.mjs';

// 1. the source: the resolve shader flips only for a readback target, and present() says it is presenting
{
  const fs = readFileSync(new URL('./resolveFs.mjs', import.meta.url), 'utf8');
  assert.match(fs, /uniform float u_present;/);
  assert.match(fs, /u_present > 0\.5 \? v_cuv\.y : 1\.0 - v_cuv\.y/, 'present samples un-flipped, a readback target flips');
  const r = readFileSync(new URL('./renderer.mjs', import.meta.url), 'utf8');
  assert.match(r, /\{ \.\.\.ro, present: true \}/, 'the live present passes present: true');
  const bind = readFileSync(new URL('./resolveBind.mjs', import.meta.url), 'utf8');
  assert.match(bind, /present = false/, 'readbacks default to the flip');
  assert.match(r, /resolveTargetToBytes[\s\S]{0,400}bindResolveProbe\(gl, \(n\) => U\(resProg, n\), \{ \.\.\.resolveOpts, weave: null \}\)/, 'the readback path is unchanged');
}

// 2. the picture: one asymmetric mark in the TOP-LEFT of the scene (an upward triangle is wide at its base, narrow at
// its tip). The visible canvas and the readback must both show it in the top half, apex up.
try {
  const layers = [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }];
  const item = { x: 220, y: 150, scale: 2.2, scaleY: 2.2, rotation: 0, alpha: 100, assetId: 'geo_tri_01', color: '#ffffff', accent: '#ffffff', key: 't', zTier: 0 };
  const resolved = [{ id: 'a', layer: layers[0], items: [item], palette: { bg: '#000000', ink: '#ffffff', swatches: ['#ffffff'] }, layoutParams: {}, layerBlendMode: 'normal', layerOpacity: 1 }];
  const contract = buildSceneContract({ doc: { seed: 1, layers, quality: 'balanced' }, resolvedLayers: resolved, caps: null, accum: null });
  const W = 500; const H = 350;
  const { shown, readback, width, height } = await presentProbeViaGL(contract, { width: W, height: H, bg: '#000000' });
  assert.equal(width, W); assert.equal(height, H);
  const lit = (px) => { // [ink pixel count, centroid y, width of the ink in its top quarter, width in its bottom quarter]
    let n = 0; let sy = 0; let minY = H; let maxY = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4] > 128) { n++; sy += y; minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const q = Math.max(1, Math.floor((maxY - minY) / 4));
    const span = (y0, y1) => { let lo = W; let hi = -1; for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4] > 128) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return hi - lo; };
    return { n, cy: sy / n, top: span(minY, minY + q), bottom: span(maxY - q, maxY + 1) };
  };
  const s = lit(shown); const r = lit(readback);
  assert.ok(r.n > 400, `the mark is drawn (${r.n} px)`);
  assert.ok(r.cy < H / 2, `readback: the mark sits in the top half (centroid y ${r.cy.toFixed(0)} of ${H})`);
  assert.ok(r.top < r.bottom, 'readback: apex up (narrow at the top, wide at the bottom)');
  assert.ok(s.cy < H / 2, `the visible canvas shows the mark in the TOP half (centroid y ${s.cy.toFixed(0)} of ${H})`);
  assert.ok(s.top < s.bottom, 'the visible canvas shows it apex up');
  assert.ok(Math.abs(s.cy - r.cy) < 2 && s.n === r.n, 'what is shown is what an export contains');
} catch (e) {
  if (isBrowserMissingError(e)) console.log('  SKIP GL probe: headless Chromium not installed');
  else throw e;
} finally {
  await closeGlDriver();
}

console.log('presentOrientation.selfcheck: ok');
