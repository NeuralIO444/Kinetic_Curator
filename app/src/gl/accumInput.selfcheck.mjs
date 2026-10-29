// accumInput.selfcheck.mjs — #1806 slice 1: the selective-accumulation
// renderer seam.
//
// What ships in slice 1 is ONLY the seam: renderFrameInto's accumInput
// mode + createRenderer's renderAccumInput entry. No contract field, no
// recipe wiring, no UI (slices 2 and 3). This suite proves the seam's
// contract:
//
// Node (no GL):
// - isAccumFeedLayer: content + pattern strata feed; math + fx never do.
// - accumFeedLayers: the selection resolves in compositeOrder; fx/math
//   and unknown ids in the selection are ignored, never errors.
//
// Browser (skipped when the Playwright browser is absent), on a scene of
// two content strata (bg, top) under an invert FX stratum. All renders
// run in DATA space (rawResolve: the raw premultiplied clamp, no ACES /
// dither): the harness's presentation resolve tonemaps in straight
// space, which is nonlinear in alpha, so presentation bytes cannot be
// folded or compared as light. The ACCUM input frame is data in
// production too — accum.step() consumes the 16F texture, never a
// resolved picture — so data space is the quantity the seam promises.
// - subset render = the full render masked to the selected strata: the
//   node-side premultiplied fold over(subTop, over(subBg, bg)) matches
//   the no-FX full composite pixel-for-pixel (within resolve
//   quantization). The fold matching also proves placement parity: the
//   subset draws the resolver's own instances, so any placement shift
//   would break the match.
// - attribution: each subset holds light only where its own stratum
//   marks; the other stratum's exclusive region stays transparent in it.
// - pre-FX: the subset renders equal the fold (built from the un-FX'd
//   composite) while the FX'd full render differs broadly — the buffer
//   input never carries the finish. Naming the fx stratum in the
//   selection changes nothing.
// - empty / unknown-only selections render fully transparent.

import assert from 'node:assert/strict';
import { isAccumFeedLayer, accumFeedLayers } from './renderer.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const okAsync = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// --- Node: the feed definition ----------------------------------------------

ok('isAccumFeedLayer: content + pattern feed; math + fx never do', () => {
  assert.equal(isAccumFeedLayer({ type: 'content' }), true);
  assert.equal(isAccumFeedLayer({ type: 'pattern' }), true, 'a pattern composites like a content track (#1098)');
  assert.equal(isAccumFeedLayer({ type: 'fx' }), false, 'a finish is not a light source');
  assert.equal(isAccumFeedLayer({ type: 'math' }), false, 'a transform is not a light source');
  assert.equal(isAccumFeedLayer({ type: 'bogus' }), false);
  assert.equal(isAccumFeedLayer(null), false);
  assert.equal(isAccumFeedLayer(undefined), false);
  assert.equal(isAccumFeedLayer({}), false);
});

ok('accumFeedLayers: compositeOrder selection; fx/math/unknown ids ignored', () => {
  const contract = {
    layers: [
      { id: 'bg', type: 'content' },
      { id: 'fx1', type: 'fx' },
      { id: 'pat', type: 'pattern' },
      { id: 'm1', type: 'math' },
      { id: 'top', type: 'content' },
    ],
    compositeOrder: ['bg', 'fx1', 'pat', 'm1', 'top'],
  };
  const ids = (sel) => accumFeedLayers(contract, sel).map((l) => l.id);
  assert.deepEqual(ids(['top', 'bg']), ['bg', 'top'], 'compositeOrder, not selection order');
  assert.deepEqual(ids(['fx1', 'm1', 'pat']), ['pat'], 'naming a transform stratum never makes it feed');
  assert.deepEqual(ids(['bg', 'fx1', 'm1', 'pat', 'top']), ['bg', 'pat', 'top'], 'all named: only the light strata');
  assert.deepEqual(ids(['nope']), [], 'unknown ids are ignored, not errors');
  assert.deepEqual(ids([]), []);
  assert.deepEqual(ids(null), []);
  assert.deepEqual(ids(new Set(['top'])), ['top'], 'any iterable selection works');
});

// --- Browser: the pixel proof -------------------------------------------------

const hexRgb = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
// Premultiplied source-over of S over D, both [r,g,b,a] in 0..1 — the
// composite shader's own fold, on resolved bytes (rawResolve bytes are
// the raw premultiplied clamp, so byte space is premultiplied space).
const over = (S, D) => [
  S[0] + D[0] * (1 - S[3]),
  S[1] + D[1] * (1 - S[3]),
  S[2] + D[2] * (1 - S[3]),
  S[3] + D[3] * (1 - S[3]),
];
const pxAt = (buf, i) => [buf[i] / 255, buf[i + 1] / 255, buf[i + 2] / 255, buf[i + 3] / 255];

async function runBrowserTests() {
  const { renderViaGL, renderAccumInputViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const { buildSceneContract } = await import('./sceneContract.js');
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');
  const { DEFAULT_LAYOUT_PARAMS } = await import('../data/layout-modes.js');
  const { ASSETS } = await import('../data/assets/index.js');

  // Corpus discipline (parity/corpus.mjs): lifeDrift 0, fixed seeds, and
  // text-bearing stamps disabled so pixels never depend on font resolution.
  const TEXT_ASSET_IDS = new Set(ASSETS.filter((a) => a.svg.includes('<text')).map((a) => a.id));
  const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, !TEXT_ASSET_IDS.has(a.id)]));
  const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, ...over });

  // Two content strata under one invert FX stratum (the fx-invert-wrap
  // corpus shape, FX moved on top of both): the audience's frame is
  // inverted everywhere; the buffer input must never be.
  const doc = {
    version: 1,
    seed: 0xc0ffee,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: lp({ count: 10 }),
    enabledAssets,
    quality: 'balanced',
    layers: [
      { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      { id: 'top', name: 'Top', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      {
        id: 'fx1',
        name: 'FX1',
        type: 'fx',
        visible: true,
        layerBlendMode: 'normal',
        layerOpacity: 1,
        effects: [{ kind: 'invert', params: {} }],
      },
    ],
    activeLayerId: 'bg',
    layerSnapshots: {
      top: {
        seed: 7,
        paletteId: 'praystation',
        paletteOverrides: null,
        layoutParams: lp({ count: 12 }),
        caGrid: null,
        enabledAssets,
      },
    },
  };
  const caps = getRenderCaps(doc.quality, false);
  const buildFor = (d) => buildSceneContract({ doc: d, resolvedLayers: resolveLayers(d, { caps }), caps });
  const contract = buildFor(doc);
  const docNoFx = { ...doc, layers: doc.layers.filter((l) => l.id !== 'fx1') };
  const contractNoFx = buildFor(docNoFx);
  const bgHex = resolveLayers(doc, { caps })[0]?.palette?.bg || '#000000';

  const W = 240,
    H = 168;
  const opts = { width: W, height: H, bg: bgHex, rawResolve: true };
  const fullFx = (await renderViaGL(contract, opts)).pixels;
  const fullPlain = (await renderViaGL(contractNoFx, opts)).pixels;
  const subBg = (await renderAccumInputViaGL(contract, ['bg'], opts)).pixels;
  const subTop = (await renderAccumInputViaGL(contract, ['top'], opts)).pixels;
  const subAll = (await renderAccumInputViaGL(contract, ['bg', 'top'], opts)).pixels;
  const subFxNamed = (await renderAccumInputViaGL(contract, ['bg', 'top', 'fx1'], opts)).pixels;
  const subNone = (await renderAccumInputViaGL(contract, [], opts)).pixels;
  const subUnknown = (await renderAccumInputViaGL(contract, ['nope'], opts)).pixels;

  const NPX = W * H;
  const alphaCount = (buf) => {
    let c = 0;
    for (let p = 0; p < NPX; p++) if (buf[p * 4 + 3] > 0) c++;
    return c;
  };
  const maxDiff = (a, b) => {
    let m = 0;
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m;
  };

  await okAsync('the scene is real: both strata mark, the fx stratum wraps', () => {
    const census = (id) => contract.instances.filter((it) => it.layer === id).length;
    assert.ok(census('bg') > 0 && census('top') > 0, 'both content strata carry instances');
    assert.deepEqual(
      accumFeedLayers(contract, ['bg', 'top', 'fx1']).map((l) => l.id),
      ['bg', 'top'],
      'on the real contract, the fx stratum is not a feed layer',
    );
    assert.ok(alphaCount(subBg) > 0 && alphaCount(subTop) > 0, 'each subset render holds light');
    assert.ok(maxDiff(fullFx, fullPlain) > 100, 'sanity: the invert wrap changes the full render broadly');
  });

  await okAsync('subset = full render masked to the selected strata (premultiplied fold, pixel-matched)', () => {
    const bgPx = [...hexRgb(bgHex), 1];
    let bad = 0,
      worst = 0;
    for (let p = 0; p < NPX; p++) {
      const i = p * 4;
      const folded = over(pxAt(subTop, i), over(pxAt(subBg, i), bgPx));
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(folded[c] * 255 - fullPlain[i + c]);
        worst = Math.max(worst, d);
        if (d > 3) bad++;
      }
    }
    assert.equal(bad, 0, `fold vs no-FX composite: ${bad} channel values beyond ±3 (worst ${worst.toFixed(1)})`);
    // The joint selection is the same fold with no background under it:
    // over(subTop, subBg) must reproduce subAll the same way — the seam
    // composes strata exactly as the composite does.
    let badJoint = 0;
    for (let p = 0; p < NPX; p++) {
      const i = p * 4;
      const folded = over(pxAt(subTop, i), pxAt(subBg, i));
      for (let c = 0; c < 4; c++) if (Math.abs(folded[c] * 255 - subAll[i + c]) > 3) badJoint++;
    }
    assert.equal(badJoint, 0, `over(subTop, subBg) vs subAll: ${badJoint} channel values beyond ±3`);
  });

  await okAsync('attribution: each subset is dark exactly where only the other stratum marks', () => {
    let bgOnly = 0,
      topOnly = 0;
    for (let p = 0; p < NPX; p++) {
      const aB = subBg[p * 4 + 3],
        aT = subTop[p * 4 + 3];
      if (aB > 0 && aT === 0) bgOnly++;
      if (aT > 0 && aB === 0) topOnly++;
    }
    assert.ok(bgOnly > 0, 'bg has marks top never touches (and subBg holds them)');
    assert.ok(topOnly > 0, 'top has marks bg never touches (and subTop holds them)');
    // Where subTop carries no light, subAll is subBg's pixel untouched.
    // Stated at the quantization floor: a resolved alpha byte of 0 means
    // the 16F alpha was under ~1/510, whose premultiplied light is
    // sub-LSB — so the bound is ±2 (one rounding on each render), not
    // byte equality.
    let leaked = 0;
    for (let p = 0; p < NPX; p++) {
      const i = p * 4;
      if (subTop[i + 3] === 0) for (let c = 0; c < 4; c++) if (Math.abs(subAll[i + c] - subBg[i + c]) > 2) leaked++;
    }
    assert.equal(leaked, 0, 'no top light leaks into pixels top never marked');
  });

  await okAsync('pre-FX: naming the fx stratum changes nothing; the subset never carries the finish', () => {
    assert.deepEqual([...subFxNamed], [...subAll], 'fx id in the selection is ignored byte-for-byte');
    // subAll's fold matched the UNWRAPPED composite above; against the
    // audience's inverted frame it must differ broadly — proof the wrap
    // never ran on the buffer-input path.
    let diff = 0;
    for (let p = 0; p < NPX; p++) {
      const i = p * 4;
      const folded = over(pxAt(subTop, i), over(pxAt(subBg, i), [...hexRgb(bgHex), 1]));
      if (Math.abs(folded[0] * 255 - fullFx[i]) > 24) diff++;
    }
    assert.ok(diff > NPX * 0.5, `subset fold differs from the inverted frame on ${(diff / NPX).toFixed(2)} of pixels`);
  });

  await okAsync('empty and unknown-only selections render fully transparent', () => {
    assert.equal(alphaCount(subNone), 0, 'no strata selected -> no light');
    assert.equal(alphaCount(subUnknown), 0, 'unknown ids -> no light, no throw');
    assert.ok(subNone.every((v) => v === 0) && subUnknown.every((v) => v === 0), 'transparent black, byte for byte');
  });

  await closeGlDriver();
}

try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser accum-input tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}

console.log(`accumInput.selfcheck: OK (${n} cases)`);
