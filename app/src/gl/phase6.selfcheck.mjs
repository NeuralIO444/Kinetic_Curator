#!/usr/bin/env node
// node src/gl/phase6.selfcheck.mjs
//
// Phase 6 (#192) selfcheck: governor retune + SVG retirement + #103 re-validation.
//
//  A. Governor cut order (pure): resolution sheds before effects/quality;
//     full ladder sequence verified; exhausted ladder returns null.
//  B. Shed honesty: shedSummary names every shed state (the UI badge reads it).
//  C. No maxFxLayers culling: 6 FX layers at performance caps → 6 wraps and an
//     empty reported shed; a forced low budget still *reports* its shed.
//  D. #103 cliffs re-tested on the GL backend: hostile docs run end-to-end
//     (parseProject → resolveLayers → buildSceneContract) without throwing,
//     and hostile values sanitize to safe defaults.
//  E. Density stress: 8 layers × count 8000 builds a contract within budget.
//  F. SVG renderer not in the shipped bundle: a static import-graph walk from
//     the vite entry (main.jsx) asserts no import resolves to
//     studio/render.mjs — the SVG emitter is dev-only (parity reference).
//  G. Browser re-test: a hostile doc through renderViaGL returns pixels
//     without throwing. Skips cleanly (no hang) when the Playwright browser
//     is unavailable — the explicit-skip convention.

import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { nextGovernorCut, shedSummary, RENDER_SCALES } from '../hooks/governorCuts.js';
import { QUALITY_PRESETS, FINAL_CAPS, getRenderCaps } from '../data/quality.js';
import { parseProject } from '../state/projectDocument.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { buildSceneContract, GL_CONTRACT_VERSION } from './sceneContract.js';
import { resolveLayers } from '../../../studio/render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_SRC = path.resolve(HERE, '..');

// ---------------------------------------------------------------- A. cut order
{
  const base = {
    renderScale: 1, quality: 'high', assetThin: false,
    perfClampOverride: null, effectiveCount: 400, slowRender: false,
  };
  // The FIRST cut on a fresh low-FPS episode is resolution — not FX, not
  // quality. This is the #192 contract: pixels drop before anything visible.
  let cut = nextGovernorCut(base);
  assert.equal(cut.kind, 'renderScale', 'first cut must be renderScale');
  assert.equal(cut.scale, 0.75);

  // Walk the whole ladder; FX culling must never appear.
  const kinds = [];
  let s = { ...base };
  for (let i = 0; i < 12; i++) {
    const c = nextGovernorCut(s);
    if (!c) break;
    kinds.push(c.kind);
    if (c.kind === 'renderScale') s.renderScale = c.scale;
    else if (c.kind === 'quality') s.quality = c.quality;
    else if (c.kind === 'assetThin') s.assetThin = true;
    else if (c.kind === 'countClamp') s.perfClampOverride = { count: c.count, mirror: false };
    else if (c.kind === 'slowRender') s.slowRender = true;
  }
  assert.deepEqual(
    kinds,
    ['renderScale', 'renderScale', 'renderScale', 'quality', 'quality', 'assetThin', 'countClamp', 'countClamp', 'countClamp', 'countClamp', 'slowRender'],
    `ladder order wrong: ${kinds.join(',')}`
  );
  assert.ok(!kinds.some((k) => k.toLowerCase().includes('fx')), 'no FX-culling cut may exist');
  assert.equal(nextGovernorCut(s), null, 'exhausted ladder returns null (watchdog is separate)');

  // Unknown/NaN scale snaps to full before stepping down.
  assert.equal(nextGovernorCut({ ...base, renderScale: NaN }).scale, 0.75);
  // renderScale ladder constants are sane.
  assert.deepEqual(RENDER_SCALES, [1, 0.75, 0.5, 0.33]);
  console.log('[selfcheck] A governor cut order OK —', kinds.join(' → '));
}

// ---------------------------------------------------------------- B. honesty
{
  assert.equal(shedSummary({ renderScale: 1 }), null, 'clean state: no badge');
  const sum = shedSummary({
    renderScale: 0.5, perfTier1: true, assetThin: true,
    perfClampOverride: { count: 90, mirror: false }, slowRender: true,
    watchdogTripped: true,
  });
  assert.ok(sum.length === 6, `every shed state must be named, got: ${sum}`);
  assert.ok(sum[0].includes('50%'), 'resolution shed names the scale');
  console.log('[selfcheck] B shed honesty OK —', sum.join(' · '));
}

// ---------------------------------------------------------------- helpers
const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, true]));
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, ...over });
const contentLayer = (id) => ({
  id, name: id, type: 'content', visible: true,
  layerBlendMode: 'normal', layerOpacity: 1,
});
const fxLayer = (id, kind = 'invert') => ({
  id, name: id, type: 'fx', visible: true,
  layerBlendMode: 'normal', layerOpacity: 1,
  effects: [{ kind, params: {} }],
});
function doc(over = {}) {
  return {
    version: 1,
    seed: 0xC0FFEE,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: lp({ count: 36 }),
    enabledAssets,
    quality: 'balanced',
    layers: [contentLayer('bg')],
    activeLayerId: 'bg',
    layerSnapshots: {},
    ...over,
  };
}
const contractOf = (d) => {
  const caps = getRenderCaps(d.quality || 'balanced', false);
  return buildSceneContract({ doc: d, resolvedLayers: resolveLayers(d, { caps }), caps });
};

// ------------------------------------------- C. no maxFxLayers-style culling
{
  // All live tiers retired the budget.
  for (const t of ['high', 'balanced', 'performance']) {
    assert.equal(QUALITY_PRESETS[t].maxFxLayers, Infinity, `${t} must not cap FX layers`);
  }
  assert.equal(FINAL_CAPS.maxFxLayers, Infinity);

  // 6 FX layers at the strictest live tier: every wrap applies, shed is empty.
  const layers = [contentLayer('bg')];
  for (let i = 1; i <= 6; i++) {
    layers.push(fxLayer(`fx${i}`, ['invert', 'posterize', 'rgbSplit', 'blur', 'solarize', 'edge'][i - 1]));
    layers.push(contentLayer(`c${i}`));
  }
  const scene = contractOf(doc({ quality: 'performance', layers }));
  assert.equal(scene.fxWraps.length, 6, `all 6 FX wraps must apply at performance, got ${scene.fxWraps.length}`);
  assert.deepEqual(scene.shed.fxLayerIds, [], 'reported shed must be empty in normal operation');

  // A forced low budget still *reports* — the silent-cull trap stays dead.
  const tightCaps = { ...getRenderCaps('performance', false), maxFxLayers: 1 };
  const tight = buildSceneContract({
    doc: doc({ quality: 'performance', layers }),
    resolvedLayers: resolveLayers(doc({ layers }), { caps: tightCaps }),
    caps: tightCaps,
  });
  assert.equal(tight.fxWraps.length, 1, 'forced budget applies 1 wrap');
  assert.equal(tight.shed.fxLayerIds.length, 5, 'forced budget reports the 5 shed FX layers');
  console.log('[selfcheck] C no FX culling OK — 6 wraps at performance, shed reported when forced');
}

// --------------------------------------- D. #103 cliffs on the GL backend
{
  // D1: the exact hostile import from #103's acceptance criteria.
  const hostile = {
    version: 1,
    seed: 1,
    layoutParams: { scale: [null, null], alpha: null, count: 1e12, mode: '__proto__' },
  };
  const parsed = parseProject(JSON.parse(JSON.stringify(hostile)));
  assert.ok(parsed.ok, 'hostile project must parse');
  const hostileLp = parsed.doc.layoutParams;
  const scene = contractOf(doc({ layoutParams: hostileLp }));
  assert.ok(Number.isFinite(scene.instances.length), 'hostile doc builds a contract');
  assert.ok(
    scene.instances.length <= getRenderCaps('balanced', false).maxCount * 1,
    `count 1e12 must clamp to caps, got ${scene.instances.length}`
  );
  const rl = resolveLayers(doc({ layoutParams: hostileLp }), { caps: getRenderCaps('balanced', false) });
  assert.deepEqual(rl[0].layoutParams.scale, DEFAULT_LAYOUT_PARAMS.scale, 'scale [null,null] → default');
  assert.deepEqual(rl[0].layoutParams.alpha, DEFAULT_LAYOUT_PARAMS.alpha, 'alpha null → default');
  assert.notEqual(rl[0].layoutParams.mode, '__proto__', 'mode __proto__ must not survive');
  // The fallen-back mode is a real sampler id (string from the allow-list).
  assert.equal(typeof rl[0].layoutParams.mode, 'string');
  assert.equal(hostileLp.mode, DEFAULT_LAYOUT_PARAMS.mode, 'mode __proto__ → default mode');

  // D2: hostile leftovers — NaN/Infinity ranges, null layers entries, version 999.
  const hostile2 = parseProject({
    version: 1, seed: 'not-a-number',
    layoutParams: { scale: [NaN, Infinity], rotate: 'junk', count: -50, particleCount: 1e9 },
    layers: [null, { id: 42 }, { id: 'ok', type: 'fx', effects: [{ kind: 'nope', params: {} }] }],
  });
  // seed 'not-a-number' is rejected at parse (not silently zeroed) — the
  // hostile case must not white-screen, and an explicit error is honest.
  assert.ok(!hostile2.ok || hostile2.doc, 'hostile doc 2 must not throw');
  const doc2layers = hostile2.ok && hostile2.doc.layers ? hostile2.doc.layers : [contentLayer('bg')];
  const doc2lp = hostile2.ok ? hostile2.doc.layoutParams : lp({});
  const scene2 = contractOf(doc({ layoutParams: doc2lp, layers: doc2layers }));
  assert.ok(scene2.layers.length >= 1, 'doc 2 builds a contract');

  // D3: 200 layers through the raw contract path (no parse normalization)
  // stay bounded by per-layer caps. At the parse/apply boundary #103 now
  // caps documents at MAX_LAYERS (16) — covered by projectDocument.selfcheck;
  // this asserts the un-normalized contract path stays bounded regardless.
  const many = [];
  for (let i = 0; i < 200; i++) many.push(contentLayer(`l${i}`));
  const t0 = Date.now();
  const scene3 = contractOf(doc({ layers: many }));
  const dt = Date.now() - t0;
  assert.equal(scene3.layers.length, 200, '200 layers resolve');
  assert.ok(scene3.instances.length <= 200 * getRenderCaps('balanced', false).maxCount,
    'total instances bounded by per-layer caps');
  console.log(`[selfcheck] D #103 hostile/docs OK — 200 layers in ${dt}ms (bounded by caps)`);
}

// ---------------------------------------------------------------- E. density
{
  const layers = [contentLayer('bg')];
  for (let i = 1; i < 8; i++) layers.push(contentLayer(`l${i}`));
  const t0 = Date.now();
  const scene = contractOf(doc({ quality: 'high', layoutParams: lp({ count: 8000 }), layers }));
  const dt = Date.now() - t0;
  const caps = getRenderCaps('high', false);
  assert.ok(scene.instances.length <= 8 * caps.maxCount, 'density clamped by caps');
  assert.ok(dt < 15000, `contract build took ${dt}ms`);
  console.log(`[selfcheck] E density stress OK — 8×count-8000 → ${scene.instances.length} instances in ${dt}ms`);
}

// -------------------------------- F. SVG renderer not in the shipped bundle
{
  // Static import-graph walk from the vite entry. studio/render.mjs is the
  // dev-only parity reference; no production import path may reach it.
  const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const visited = new Set();
  const stack = [path.join(APP_SRC, 'main.jsx')];
  let hit = null;
  while (stack.length && !hit) {
    const file = stack.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(src))) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue; // external / absolute: not ours
      let target = path.resolve(path.dirname(file), spec);
      if (existsSync(target)) { /* exact file */ }
      else if (existsSync(target + '.js')) target += '.js';
      else if (existsSync(target + '.jsx')) target += '.jsx';
      else if (existsSync(target + '.mjs')) target += '.mjs';
      else if (existsSync(path.join(target, 'index.js'))) target = path.join(target, 'index.js');
      else continue;
      const norm = target.split(path.sep).join('/');
      if (norm.endsWith('/studio/render.mjs')) { hit = file; break; }
      stack.push(target);
    }
  }
  assert.ok(!hit, `shipped bundle reaches the SVG renderer via ${hit}`);
  console.log(`[selfcheck] F bundle hygiene OK — ${visited.size} modules from main.jsx, none reach studio/render.mjs`);
}

// ------------------------------------------------- G. browser re-test (skip)
{
  let skipped = false;
  try {
    const { chromium } = await import('playwright');
    let browser = null;
    try {
      browser = await chromium.launch();
    } catch (e) {
      if (/Executable doesn't exist/.test(String(e?.message || e))) skipped = true;
      else throw e;
    }
    if (!skipped) {
      await browser.close();
      const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
      const caps = getRenderCaps('balanced', false);
      const hostileDoc = doc({
        layoutParams: lp({ scale: [null, null], alpha: null, count: 1e12, mode: '__proto__' }),
      });
      const parsed = parseProject(JSON.parse(JSON.stringify(hostileDoc)));
      assert.ok(parsed.ok, 'browser hostile doc parses');
      const hostileDoc2 = { ...hostileDoc, layoutParams: parsed.doc.layoutParams };
      const scene = buildSceneContract({
        doc: hostileDoc2,
        resolvedLayers: resolveLayers(hostileDoc2, { caps }),
        caps,
      });
      try {
        const { pixels, width, height } = await renderViaGL(scene, { width: 400, height: 280, bg: '#000000' });
        assert.equal(pixels.length, width * height * 4, 'hostile doc renders pixels');
        console.log(`[selfcheck] G browser hostile re-test OK — ${width}x${height} pixels, no throw`);
      } finally {
        await closeGlDriver();
      }
    }
  } catch (e) {
    if (/Executable doesn't exist/.test(String(e?.message || e))) skipped = true;
    else throw e;
  }
  if (skipped) console.log('[selfcheck] G browser hostile re-test SKIPPED (no Playwright browser)');
}

assert.equal(GL_CONTRACT_VERSION, 1, 'contract version unchanged (shed is additive)');
console.log('[selfcheck] phase6 OK — governor retuned, SVG retired, #103 cliffs re-tested');
