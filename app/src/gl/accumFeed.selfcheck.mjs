// accumFeed.selfcheck.mjs — #1806 slice 2: recipe wiring for selective
// accumulation. Slice 1 (accumInput.selfcheck.mjs) proved the renderer
// seam; this suite proves the wiring that makes the recipe honour a
// scene's FEEDS ACCUM flags:
//
// Node (no GL):
// - accumFeedSelection: the derivation both consumers share — null when
//   every feed-capable stratum feeds (the byte-identical default), else
//   the feeding ids in compositeOrder (possibly empty).
// - buildSceneContract carries a document layer's feedsAccum: false onto
//   the contract layer (content + pattern), key absent otherwise — an
//   unflagged scene's contract is byte-identical to the pre-#1806 one,
//   and spelling the flag `true` changes nothing. assertSceneContract
//   rejects the flag anywhere else.
// - the pattern-texture sweep stays owned by the full render (source
//   pin: an accumInput render seeds its seen set from the full render's
//   instead of resetting it — the slice-1 hazard, found in its report).
// - the governor's rung (cut 1.47): fires after the feedback warp and
//   before the creature count, only when a selection is live and not
//   already shed; legacy callers see the pre-#1806 ladder; the restore
//   table and the badge agree; the cost is declared (gl/accum-feed).
//
// Browser (skipped when the Playwright browser is absent), on the
// slice-1 scene (two content strata under an invert FX stratum, plus a
// no-FX variant):
// - default preserved: a sequence over unflagged contracts is
//   byte-identical to the same sequence with the flag spelled `true`.
// - one stratum off: the sequence buffer equals (worst channel Δ
//   1 LSB — resolve rounding) the buffer of the scene WITHOUT the
//   stratum (zero trail — the #1806 acceptance probe: only the
//   feeding stratum's light ever enters), while the stage render
//   still shows the stratum. The comparison lives in sequence space:
//   a one-shot full render paints the palette backdrop and a subset
//   render never does (slice 1's seam rule), so stills can't carry it.
// - both strata off: the buffer never leaves the background.
// - mirror parity for BOTH paths: the JS mirror (mirrorAccumStep),
//   stepped on the full composite frame and on the subset frame,
//   matches the GPU probe stepped on the same frames.
// - the matte ruling, pinned: a feeding stratum matted by a
//   non-feeding stratum keeps its matte — the subset render holds the
//   stratum's light only inside its matte source's footprint. The
//   source lends its shape, never its light: the stratum renders into
//   the buffer exactly as it renders on stage.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAccumFeedLayer, accumFeedLayers, accumFeedSelection } from './renderer.mjs';
import { buildSceneContract, assertSceneContract } from './sceneContract.js';
import { nextGovernorCut, GOVERNOR_RESTORE_CUTS, shedSummary } from '../hooks/governorCuts.js';
import { getCostTier } from './costTiers.mjs';

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

// --- Node: the derivation -----------------------------------------------------

ok('accumFeedSelection: null while every feed-capable stratum feeds', () => {
  const contract = {
    layers: [
      { id: 'bg', type: 'content' },
      { id: 'fx1', type: 'fx' },
      { id: 'pat', type: 'pattern' },
      { id: 'top', type: 'content' },
    ],
    compositeOrder: ['bg', 'fx1', 'pat', 'top'],
  };
  assert.equal(accumFeedSelection(contract), null, 'no flags -> no selection (the historical path)');
  assert.equal(accumFeedSelection({ layers: [], compositeOrder: [] }), null, 'empty scene');
  assert.equal(accumFeedSelection(null), null, 'no contract');
  assert.equal(accumFeedSelection({}), null, 'shapeless contract');
  // A flag on a stratum that can never feed is not a selection: nothing
  // the buffer eats has changed.
  const fxFlagged = {
    layers: [
      { id: 'bg', type: 'content' },
      { id: 'fx1', type: 'fx', feedsAccum: false },
    ],
    compositeOrder: ['bg', 'fx1'],
  };
  assert.equal(accumFeedSelection(fxFlagged), null, 'an fx flag alone selects nothing');
});

ok('accumFeedSelection: flagged-off strata drop out, in compositeOrder', () => {
  const contract = {
    layers: [
      { id: 'bg', type: 'content' },
      { id: 'pat', type: 'pattern', feedsAccum: false },
      { id: 'mid', type: 'content', feedsAccum: false },
      { id: 'top', type: 'content' },
    ],
    compositeOrder: ['bg', 'pat', 'mid', 'top'],
  };
  assert.deepEqual(accumFeedSelection(contract), ['bg', 'top']);
  const allOff = {
    layers: [
      { id: 'bg', type: 'content', feedsAccum: false },
      { id: 'top', type: 'content', feedsAccum: false },
    ],
    compositeOrder: ['bg', 'top'],
  };
  assert.deepEqual(accumFeedSelection(allOff), [], 'all off is a selection too: the buffer eats transparency');
  // The seam's capability rule still governs the result (one definition).
  assert.deepEqual(
    accumFeedLayers(contract, ['bg', 'pat', 'mid', 'top']).map((l) => l.id),
    ['bg', 'pat', 'mid', 'top'],
    'accumFeedLayers itself is flag-blind — the selection helper reads the flags',
  );
  assert.ok(isAccumFeedLayer({ type: 'pattern' }), 'pattern feeds (sanity, shared with slice 1)');
});

// --- Node: the contract carry ---------------------------------------------------

async function buildDocs() {
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');
  const { DEFAULT_LAYOUT_PARAMS } = await import('../data/layout-modes.js');
  const { ASSETS } = await import('../data/assets/index.js');
  const TEXT_ASSET_IDS = new Set(ASSETS.filter((a) => a.svg.includes('<text')).map((a) => a.id));
  const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, !TEXT_ASSET_IDS.has(a.id)]));
  const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, ...over });
  const mkDoc = (layers) => ({
    version: 1,
    seed: 0xc0ffee,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: lp({ count: 10 }),
    enabledAssets,
    quality: 'balanced',
    layers,
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
  });
  const BG = { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
  const TOP = { id: 'top', name: 'Top', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
  const FX = {
    id: 'fx1',
    name: 'FX1',
    type: 'fx',
    visible: true,
    layerBlendMode: 'normal',
    layerOpacity: 1,
    effects: [{ kind: 'invert', params: {} }],
  };
  const docs = {
    all: mkDoc([BG, TOP, FX]),
    explicitOn: mkDoc([BG, { ...TOP, feedsAccum: true }, FX]),
    topOff: mkDoc([BG, { ...TOP, feedsAccum: false }, FX]),
    bothOff: mkDoc([{ ...BG, feedsAccum: false }, { ...TOP, feedsAccum: false }, FX]),
    noFxAll: mkDoc([BG, TOP]),
    noFxTopOff: mkDoc([BG, { ...TOP, feedsAccum: false }]),
    noTop: mkDoc([BG]),
    matteTopOff:
      // bg flagged off; top feeds, matted by bg.
      mkDoc([
        { ...BG, feedsAccum: false },
        { ...TOP, matte: { sourceId: 'bg', mode: 'alpha', invert: false } },
      ]),
    matteTopOffNoMatte: mkDoc([{ ...BG, feedsAccum: false }, TOP]),
    bothOffNoFx: mkDoc([
      { ...BG, feedsAccum: false },
      { ...TOP, feedsAccum: false },
    ]),
  };
  const caps = getRenderCaps('balanced', false);
  const build = (doc) => buildSceneContract({ doc, resolvedLayers: resolveLayers(doc, { caps }), caps });
  const contracts = Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, build(d)]));
  const bgHex = resolveLayers(docs.all, { caps })[0]?.palette?.bg || '#000000';
  return { docs, contracts, build, bgHex };
}

const bundle = await buildDocs();
const { contracts } = bundle;

ok('contract carry: the flag rides only while off; unflagged contracts are unchanged', () => {
  const layerOf = (c, id) => c.layers.find((l) => l.id === id);
  assert.ok(!('feedsAccum' in layerOf(contracts.all, 'top')), 'no flag in the doc -> no key in the contract');
  assert.ok(!('feedsAccum' in layerOf(contracts.all, 'bg')), 'bg unflagged -> no key');
  assert.equal(layerOf(contracts.topOff, 'top').feedsAccum, false, 'flagged off -> carried as false');
  assert.ok(!('feedsAccum' in layerOf(contracts.topOff, 'bg')), 'the feeding stratum carries nothing');
  assert.equal(layerOf(contracts.bothOff, 'bg').feedsAccum, false);
  assert.equal(layerOf(contracts.bothOff, 'top').feedsAccum, false);
  // Hash stability: spelling the flag `true` (explicit on) builds the
  // identical contract, byte for byte.
  assert.equal(
    JSON.stringify(contracts.explicitOn),
    JSON.stringify(contracts.all),
    'explicit-on contract == unflagged contract',
  );
  assert.deepEqual(accumFeedSelection(contracts.all), null);
  assert.deepEqual(accumFeedSelection(contracts.topOff), ['bg']);
  assert.deepEqual(accumFeedSelection(contracts.bothOff), []);
});

ok('contract carry: a pattern stratum flagged off leaves the selection', async () => {
  const { defaultPattern } = await import('../state/patternTrack.js');
  const { resolvePalette } = await import('../data/palettes.js');
  const pal = resolvePalette('praystation');
  const doc = {
    seed: 42,
    quality: 'balanced',
    layers: [
      { id: 'kc', name: 'KC', type: 'content' },
      { id: 'pt', name: 'PT', type: 'pattern', feedsAccum: false },
    ],
  };
  const resolvedLayers = [
    { id: 'kc', layer: doc.layers[0], layerOpacity: 1, layerBlendMode: 'normal', layoutParams: {}, items: [] },
    {
      id: 'pt',
      isPattern: true,
      layer: doc.layers[1],
      layerOpacity: 1,
      layerBlendMode: 'normal',
      pattern: defaultPattern('QUILT', 7),
      palette: pal,
    },
  ];
  const c = buildSceneContract({ doc, resolvedLayers, caps: null });
  assert.equal(c.layers.find((l) => l.id === 'pt').feedsAccum, false, 'pattern flag carried');
  assert.deepEqual(accumFeedSelection(c), ['kc'], 'the pattern no longer feeds; the content stratum does');
});

ok('validator: the flag is only ever false, and only on a light-source stratum', () => {
  const base = contracts.all;
  const withLayer = (layer) => ({
    ...base,
    layers: [...base.layers, layer],
    compositeOrder: [...base.compositeOrder, layer.id],
  });
  assert.throws(
    () => assertSceneContract(withLayer({ id: 'x1', type: 'content', visible: true, feedsAccum: true })),
    /feedsAccum is only ever false/,
    'true is not a representable flag — absence means the stratum feeds',
  );
  assert.throws(
    () => assertSceneContract(withLayer({ id: 'x2', type: 'fx', visible: true, fx: [], feedsAccum: false })),
    /only content\/pattern layers carry a feed flag/,
    'a finish cannot carry the flag',
  );
  assert.doesNotThrow(() =>
    assertSceneContract(withLayer({ id: 'x3', type: 'content', visible: true, feedsAccum: false })),
  );
});

ok('sweep ownership: an accumInput render seeds the pattern seen-set, never resets it', () => {
  const src = readFileSync(new URL('./renderer.mjs', import.meta.url), 'utf8');
  assert.match(
    src,
    /patternSeen = accumInput \? new Set\(patternSeen\) : new Set\(\);/,
    'the full render owns the pattern-texture sweep (slice-1 hazard: subset renders freed unselected patterns)',
  );
  assert.match(src, /sweepPatternTextures\(\); \/\/ #1098/, 'the pinned sweep call itself is untouched');
});

// --- Node: the governor rung ----------------------------------------------------

const PRESSURE = {
  fxaa: true,
  renderScale: 1,
  quality: 'high',
  assetThin: false,
  perfClampOverride: null,
  effectiveCount: 400,
  slowRender: false,
  gpuSaturated: true,
  weatherActive: true,
  weatherShed: false,
  feedbackWarpActive: true,
  feedbackWarpShed: false,
  accumFeedActive: true,
  accumFeedShed: false,
  creatureCount: 2,
  creatureShed: 0,
  travelActive: true,
  travelShed: false,
};
const walk = (s0, steps = 24) => {
  const kinds = [];
  let s = { ...s0 };
  for (let i = 0; i < steps; i++) {
    const c = nextGovernorCut(s);
    if (!c) break;
    kinds.push(c.kind);
    if (c.kind === 'renderScale') s = { ...s, renderScale: c.scale };
    else if (c.kind === 'fxaa') s = { ...s, fxaa: false };
    else if (c.kind === 'markWeather') s = { ...s, weatherShed: true };
    else if (c.kind === 'feedbackWarp') s = { ...s, feedbackWarpShed: true };
    else if (c.kind === 'accumFeed') s = { ...s, accumFeedShed: true };
    else if (c.kind === 'creatureCount') s = { ...s, creatureShed: c.creatureShed };
    else if (c.kind === 'travel') s = { ...s, travelShed: true };
    else if (c.kind === 'quality') s = { ...s, quality: c.quality };
    else if (c.kind === 'assetThin') s = { ...s, assetThin: true };
    else if (c.kind === 'countClamp')
      s = { ...s, perfClampOverride: { count: c.count, mirror: false }, effectiveCount: c.count };
    else if (c.kind === 'slowRender') s = { ...s, slowRender: true };
  }
  return kinds;
};

ok('governor: cut 1.47 fires once, after the warp, before the population', () => {
  const kinds = walk(PRESSURE);
  assert.equal(kinds.filter((k) => k === 'accumFeed').length, 1, 'the rung fires exactly once');
  assert.ok(kinds.indexOf('accumFeed') > kinds.indexOf('feedbackWarp'), 'after the feedback warp (its ACCUM family)');
  assert.ok(kinds.indexOf('accumFeed') < kinds.indexOf('creatureCount'), 'before the creature count');
  assert.ok(
    kinds.indexOf('accumFeed') < kinds.indexOf('quality'),
    'well before ACCUM itself sheds (cut 3 is the tier mechanism)',
  );
  const noSelection = walk({ ...PRESSURE, accumFeedActive: false });
  assert.ok(!noSelection.includes('accumFeed'), 'no live selection -> no rung (the pre-#1806 ladder)');
  const already = walk({ ...PRESSURE, accumFeedShed: true });
  assert.ok(!already.includes('accumFeed'), 'already shed -> never refires');
});

ok('governor: restore entry, table order and badge agree', () => {
  const entry = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'accumFeed');
  assert.ok(entry, 'accumFeed has a restore entry');
  const order = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  assert.ok(
    order.indexOf('feedbackWarp') < order.indexOf('accumFeed') &&
      order.indexOf('accumFeed') < order.indexOf('creatureCount'),
    'restore table order matches shed order around the new rung',
  );
  assert.equal(entry.needsRestore({ accumFeedShed: true }, { healthy: true }), true);
  assert.equal(entry.needsRestore({ accumFeedShed: true }, { healthy: false }), false);
  assert.equal(entry.needsRestore({ accumFeedShed: false }, { healthy: true }), false);
  assert.deepEqual(
    shedSummary({ renderScale: 1, accumFeedShed: true }),
    ['accum feed — all strata'],
    'the badge is honest about an accum-feed shed',
  );
});

ok('cost: the subset render is declared, with its measured derivation (gl/accum-feed)', () => {
  const decl = getCostTier('gl/accum-feed');
  assert.ok(decl, 'gl/accum-feed is registered');
  assert.equal(decl.tier, 0, 'tier 0 — shed by its own governor cut (1.47), not by tier (the #740 FXAA shape)');
  assert.ok(decl.timeMs > 0, 'carries a real, non-zero time (the render is not free)');
  assert.match(decl.notes, /641\.9/, 'the notes carry the measured SwiftShader figure the estimate derives from');
  assert.ok(decl.memoryBytes > 0, 'carries the dedicated target set bytes');
});

// --- Browser: the recipe proof --------------------------------------------------

async function runBrowserTests() {
  const { renderViaGL, renderAccumViaGL, renderAccumInputViaGL, openHarnessPage, closeGlDriver } =
    await import('./parity/glDriver.mjs');
  const { mirrorAccumStep, accumRecipeParams } = await import('./accum.mjs');
  const { contracts, bgHex } = bundle;
  const W = 240,
    H = 168;
  const STEPS = 12;
  const NPX = W * H;
  const seq = (contract, width = W, height = H) =>
    renderAccumViaGL(
      Array.from({ length: STEPS }, () => contract),
      {
        width,
        height,
        bg: bgHex,
        fade: 0.85,
        optics: 0,
      },
    );
  const diffPixels = (a, b, tol = 8, npix = NPX) => {
    let d = 0;
    for (let p = 0; p < npix; p++) {
      const i = p * 4;
      if (
        Math.abs(a[i] - b[i]) > tol ||
        Math.abs(a[i + 1] - b[i + 1]) > tol ||
        Math.abs(a[i + 2] - b[i + 2]) > tol ||
        Math.abs(a[i + 3] - b[i + 3]) > tol
      )
        d++;
    }
    return d;
  };
  const flipRows = (buf, w, h) => {
    const out = new Uint8Array(buf.length);
    const rb = w * 4;
    for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * rb, (h - y) * rb), y * rb);
    return out;
  };
  const { page, close } = await openHarnessPage('/parity/accumProbe.html');
  const probeSeq = async (frameBytesBottomFirst, { w, h, fade, steps }) => {
    const frames = Array.from({ length: steps }, () => Array.from(frameBytesBottomFirst));
    const res = await page.evaluate((p) => window.__kcAccumProbe(p), { w, h, bg: bgHex, fade, optics: 0, frames });
    return res.pixels; // bottom-first bytes
  };

  const seqAll = (await seq(contracts.all)).pixels;
  const seqExplicitOn = (await seq(contracts.explicitOn)).pixels;
  const seqTopOff = (await seq(contracts.topOff)).pixels;

  await okAsync('default preserved: unflagged and explicit-on sequences are byte-identical', () => {
    assert.deepEqual([...seqExplicitOn], [...seqAll], 'spelling feedsAccum: true changes no byte of the trails');
    // Sanity that the flagged sequence really does diverge (measured
    // ~11% of pixels on this scene; the strata are sparse, so the
    // difference is footprint-bound, not global).
    assert.ok(
      diffPixels(seqTopOff, seqAll) > NPX * 0.05,
      'the flagged sequence diverges materially (next cases pin how)',
    );
  });

  await okAsync('one stratum off: zero trail — the buffer equals the scene without the stratum', async () => {
    // Nothing but bg's light ever enters: the flagged scene's trails
    // match the bg-only scene's trails to resolve rounding (measured
    // worst channel Δ 1 LSB; 2 allowed for driver variance).
    const seqOff = (await seq(contracts.noFxTopOff)).pixels;
    const seqGone = (await seq(contracts.noTop)).pixels;
    let worst = 0;
    for (let i = 0; i < seqOff.length; i++) worst = Math.max(worst, Math.abs(seqOff[i] - seqGone[i]));
    assert.ok(worst <= 2, `flagged-off stratum leaves zero trail (worst Δ ${worst} LSB vs the scene without it)`);
    // …while the stage still shows the stratum in full (measured ~5%).
    const stageOff = (await renderViaGL(contracts.noFxTopOff, { width: W, height: H, bg: bgHex, rawResolve: true }))
      .pixels;
    const stageGone = (await renderViaGL(contracts.noTop, { width: W, height: H, bg: bgHex, rawResolve: true })).pixels;
    assert.ok(diffPixels(stageOff, stageGone) > NPX * 0.025, 'the stage render still carries the flagged-off stratum');
    // And the subset buffer is not the all-feeding buffer (measured ~6%).
    const seqNoFxAll = (await seq(contracts.noFxAll)).pixels;
    const seqNoFxOff = (await seq(contracts.noFxTopOff)).pixels;
    assert.ok(diffPixels(seqNoFxOff, seqNoFxAll) > NPX * 0.025, 'subset trails differ from all-strata trails');
  });

  await okAsync('both strata off: the buffer never leaves the background (and no FX leaks in)', async () => {
    const seqBothFx = (await seq(contracts.bothOff)).pixels;
    const seqBothNoFx = (await seq(contracts.bothOffNoFx)).pixels;
    assert.deepEqual(
      [...seqBothFx],
      [...seqBothNoFx],
      'fed transparency, the buffer is the background — FX scene or not',
    );
    const first = [...seqBothFx.subarray(0, 4)];
    // Uniform up to the resolve's Bayer dither (a ±1 LSB 4x4 pattern —
    // the buffer itself never leaves the begin background).
    let spread = 0;
    for (let i = 0; i < seqBothFx.length; i++) spread = Math.max(spread, Math.abs(seqBothFx[i] - first[i % 4]));
    assert.ok(spread <= 1, `every pixel is the begin background, resolved (spread ${spread} LSB = dither only)`);
    assert.ok(first[3] >= 254, 'the buffer stays opaque (it is the background, not transparency)');
  });

  // Mirror parity for both paths: the probe steps the GPU recipe on
  // byte frames; the mirror steps the same bytes in float64. Frames are
  // the REAL renders (full composite / subset), resolved in data space.
  const W2 = 120,
    H2 = 84;
  const fullFrame = flipRows(
    (await renderViaGL(contracts.noFxAll, { width: W2, height: H2, bg: bgHex, rawResolve: true })).pixels,
    W2,
    H2,
  );
  const subsetFrame = flipRows(
    (await renderAccumInputViaGL(contracts.noFxAll, ['bg'], { width: W2, height: H2, bg: bgHex, rawResolve: true }))
      .pixels,
    W2,
    H2,
  );
  const mirrorSeq = (frameBytes) => {
    const frame = new Float64Array(frameBytes.length);
    for (let i = 0; i < frameBytes.length; i++) frame[i] = frameBytes[i] / 255;
    const bgV = [0, 1, 2].map((i) => parseInt(bgHex.slice(1 + i * 2, 3 + i * 2), 16) / 255);
    let acc = new Float64Array(W2 * H2 * 4);
    for (let i = 0; i < W2 * H2; i++) {
      acc[i * 4] = bgV[0];
      acc[i * 4 + 1] = bgV[1];
      acc[i * 4 + 2] = bgV[2];
      acc[i * 4 + 3] = 1;
    }
    const params = accumRecipeParams({ fade: 0.8, optics: 0, background: bgHex, echoWidth: W2 });
    for (let k = 0; k < 8; k++) acc = mirrorAccumStep({ accum: acc, frame, w: W2, h: H2, params });
    for (let i = 0; i < acc.length; i++) acc[i] = Math.min(1, Math.max(0, acc[i]));
    return acc;
  };
  const parity = async (frameBytes, what) => {
    const gpu = await probeSeq(frameBytes, { w: W2, h: H2, fade: 0.8, steps: 8 });
    const ref = mirrorSeq(frameBytes);
    let worst = 0;
    for (let i = 0; i < gpu.length; i++) worst = Math.max(worst, Math.abs(gpu[i] / 255 - ref[i]));
    assert.ok(worst <= 3 / 255, `${what}: worst Δ ${worst.toFixed(4)} > 3 LSB`);
  };
  await okAsync('mirror parity: the composite path (GPU probe = JS mirror)', async () => {
    await parity(fullFrame, 'composite-fed recipe');
  });
  await okAsync('mirror parity: the subset path (GPU probe = JS mirror)', async () => {
    await parity(subsetFrame, 'subset-fed recipe');
    // The two paths really are different inputs (the subset holds less light).
    let sub = 0,
      full = 0;
    for (let i = 3; i < subsetFrame.length; i += 4) {
      if (subsetFrame[i] > 0) sub++;
      if (fullFrame[i] > 0) full++;
    }
    assert.ok(sub < full, 'the subset frame holds strictly fewer lit pixels than the composite');
  });
  await close();

  await okAsync('matte ruling: a feeding stratum keeps its matte from a non-feeding source', async () => {
    assert.deepEqual(accumFeedSelection(contracts.matteTopOff), ['top'], 'bg off, top feeds — matted by bg');
    const opts = { width: W, height: H, bg: bgHex, rawResolve: true };
    const subMatted = (await renderAccumInputViaGL(contracts.matteTopOff, ['top'], opts)).pixels;
    const subPlain = (await renderAccumInputViaGL(contracts.matteTopOffNoMatte, ['top'], opts)).pixels;
    const subBg = (await renderAccumInputViaGL(contracts.noFxAll, ['bg'], opts)).pixels;
    // (i) the matte only ever REMOVES light.
    let grew = 0;
    for (let i = 0; i < subMatted.length; i++) if (subMatted[i] > subPlain[i] + 2) grew++;
    assert.equal(grew, 0, 'matted subset never exceeds the unmatted subset (+2 LSB floor)');
    // (ii) and it really bites: top has marks outside bg's footprint
    // (measured: alpha sum 320k -> 37k, ~2.5k px differ).
    let alphaM = 0,
      alphaP = 0,
      differ = 0;
    for (let p = 0; p < NPX; p++) {
      alphaM += subMatted[p * 4 + 3];
      alphaP += subPlain[p * 4 + 3];
      if (Math.abs(subMatted[p * 4 + 3] - subPlain[p * 4 + 3]) > 8) differ++;
    }
    assert.ok(
      alphaM < alphaP && differ > 50,
      `the matte removes real light (alpha ${alphaP} -> ${alphaM}, ${differ}px differ)`,
    );
    // (iii) the footprint: where the source stratum has no light, the
    // matted stratum leaves none either — the source lends its shape.
    let outside = 0;
    for (let p = 0; p < NPX; p++) {
      if (subBg[p * 4 + 3] === 0 && subMatted[p * 4 + 3] > 2) outside++;
    }
    assert.equal(outside, 0, "top's light survives only inside bg's footprint, though bg itself does not feed");
  });

  await closeGlDriver();
}

try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser accum-feed tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}

console.log(`accumFeed.selfcheck: OK (${n} cases)`);
