// patternRender.selfcheck.mjs — a PATTERN track reaches the screen (#1098).
//
// Node side: the pixel source and its cache key, both resolvers (live and studio), and the scene
// contract entry. Browser side (headless Chromium, the same harness as the GL parity checks): the
// frame the renderer produces IS the engine's frame, under the display curve every track gets.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { patternPixels, patternBytesGL, patternKey, patternPalette } from './patternSource.js';
import { defaultPattern } from '../state/patternTrack.js';
import { buildSceneContract, assertSceneContract, serializeSceneContract } from '../gl/sceneContract.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { resolveLayers as studioResolve } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { resolvePalette } from '../data/palettes.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { createNoise } from '../engine/noise.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const okA = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const PAL = resolvePalette('praystation', null);
const P = (over = {}) => ({ ...defaultPattern('QUILT', 7), density: 6, ...over });

// ── pixel source ────────────────────────────────────────────────────────────
ok('patternPixels: a deterministic frame of the right size, in every mode, from the palette only', () => {
  const allowed = new Set(PAL.swatches.map((h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }));
  for (const mode of ['QUILT', 'GLYPH', 'FIELD']) {
    const a = patternPixels(P({ mode }), PAL, 160, 112, 0);
    assert.equal(a.length, 160 * 112);
    assert.deepEqual(a, patternPixels(P({ mode }), PAL, 160, 112, 0), `${mode} is deterministic`);
    for (const px of a) assert.ok(allowed.has(px), `${mode}: a pixel is not a palette colour`);
    assert.notDeepEqual(a, patternPixels(P({ mode, seed: 8 }), PAL, 160, 112, 0), `${mode}: the seed changes the frame`);
  }
  assert.doesNotThrow(() => patternPixels(null, null, 8, 8, 0), 'junk in, a frame out');
});

ok('patternBytesGL: the same frame with rows flipped to GL order', () => {
  const w = 40; const h = 28;
  const src = patternPixels(P(), PAL, w, h, 0);
  const gl = new Uint32Array(patternBytesGL(P(), PAL, w, h, 0).buffer);
  for (const y of [0, 1, 13, 27]) assert.deepEqual(gl.subarray((h - 1 - y) * w, (h - y) * w), src.subarray(y * w, (y + 1) * w));
});

ok('patternKey: a static pattern ignores time; a drifting one keys on it; palette and size change it', () => {
  assert.equal(patternKey(P(), PAL, 100, 70, 0), patternKey(P(), PAL, 100, 70, 99), 'DRIFT 0: time is not in the key');
  assert.notEqual(patternKey(P({ drift: 0.5 }), PAL, 100, 70, 1), patternKey(P({ drift: 0.5 }), PAL, 100, 70, 2));
  assert.notEqual(patternKey(P(), PAL, 100, 70), patternKey(P(), PAL, 101, 70));
  assert.notEqual(patternKey(P(), PAL, 100, 70), patternKey(P(), resolvePalette('v01d', null), 100, 70));
  assert.notEqual(patternKey(P(), PAL, 100, 70), patternKey(P({ seed: 8 }), PAL, 100, 70));
  assert.notEqual(patternKey(P(), PAL, 100, 70), patternKey(P({ mode: 'GLYPH' }), PAL, 100, 70));
  assert.deepEqual(Object.keys(patternPalette({ swatches: ['#fff'], leak: 1, id: 'x', dirty: true })).sort(), ['bg', 'ink', 'swatches']);
});

// ── resolvers ───────────────────────────────────────────────────────────────
const input = (layers, over = {}) => ({
  layers, activeLayerId: 'kc', layerSnapshots: {}, seed: 1234, paletteId: 'v01d', paletteOverrides: null, userPalettes: [],
  // the KC track's living-motion floor (#1128) is off here: these checks are about the PATTERN track's own contract
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 20, kinemeBreath: 0, kinemeDrift: 0 }, caGrid: null, enabledAssets: null, assetWeightOverrides: {},
  customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false, loopTimeMs: 2500, perfClampOverride: null,
  perfTier1: false, assetThin: false, slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100],
  phraseWrapGen: 0, attractor: null, ...over,
});
const PT = (over = {}) => ({ id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'multiply', layerOpacity: 0.6, pattern: P(), ...over });
const KC = { id: 'kc', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };

ok('live resolver: a pattern track resolves to its block and the ACTIVE palette, never a phantom KC', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(input([KC, PT()]));
  const pt = out.find((l) => l.id === 'pt');
  assert.ok(pt && pt.isPattern === true && !pt.isFx);
  assert.deepEqual(pt.items, [], 'no node instances');
  assert.equal(pt.palette.id, 'v01d', 'the active palette');
  assert.equal(pt.layerBlendMode, 'multiply'); assert.equal(pt.layerOpacity, 0.6);
  assert.equal(pt.t, 2.5, 'loop time, in seconds');
  assert.equal(out.find((l) => l.id === 'kc').items.length > 0, true, 'the KC track is untouched');
  assert.equal(out.length, 2);
  r.dispose();
});

ok('studio resolver (stills, exports, parity): the same entry shape', () => {
  const doc = { seed: 1, paletteId: 'v01d', paletteOverrides: null, layoutParams: { ...DEFAULT_LAYOUT_PARAMS }, layers: [KC, PT()], activeLayerId: 'kc', layerSnapshots: {}, patternTime: 3 };
  const out = studioResolve(doc, { caps: getRenderCaps('balanced', false) });
  const pt = out.find((l) => l.id === 'pt');
  assert.ok(pt.isPattern && pt.palette.id === 'v01d' && pt.t === 3 && pt.items.length === 0);
  assert.deepEqual(pt.pattern, P());
});

// ── scene contract ──────────────────────────────────────────────────────────
const contractFor = (layers, over = {}, resolved = null) => {
  const doc = { seed: 1234, quality: 'balanced', layers, ...over };
  const r = createLiveResolver();
  const rl = resolved || r.resolveLayers(input(layers, { loopTimeMs: over.__t ?? 0 }));
  const c = buildSceneContract({ doc, resolvedLayers: rl, caps: null, accum: null });
  r.dispose();
  return c;
};

ok('contract: a pattern layer entry with its block and palette; it rides the FX fold; it validates', () => {
  const fx = { id: 'fx', name: 'FX 1', type: 'fx', visible: true, layerBlendMode: 'normal', layerOpacity: 1, effects: [{ kind: 'rgbSplit', params: { dx: 3 } }] };
  const c = contractFor([KC, PT(), fx]);
  const l = c.layers.find((x) => x.id === 'pt');
  assert.equal(l.type, 'pattern'); assert.equal(l.blend, 'multiply'); assert.equal(l.opacity, 0.6);
  assert.deepEqual(l.pattern, P());
  assert.deepEqual(Object.keys(l.palette).sort(), ['bg', 'ink', 'swatches', 'weights'].filter((k) => k in l.palette).sort());
  assert.ok(l.palette.swatches.length > 3);
  assert.deepEqual(c.compositeOrder, ['kc', 'pt', 'fx']);
  assert.deepEqual(c.fxWraps[0].contentLayerIds, ['kc', 'pt'], 'an FX track above a pattern wraps it');
  assert.equal(c.instances.every((i) => i.layer !== 'pt'), true, 'a pattern has no instances');
  assert.ok(assertSceneContract(c));
  assert.throws(() => assertSceneContract({ ...c, layers: c.layers.map((x) => (x.id === 'pt' ? { ...x, pattern: null } : x)) }), /pattern block required/);
  assert.throws(() => assertSceneContract({ ...c, layers: c.layers.map((x) => (x.id === 'pt' ? { ...x, type: 'wat' } : x)) }), /bad type/);
});

ok('contract: a static pattern keeps one hash across time; a drifting one carries t; no pattern, no change', () => {
  const still = (t) => serializeSceneContract(contractFor([KC, PT()], { __t: t }));
  assert.equal(still(0), still(9000), 'DRIFT 0: the contract does not change from frame to frame');
  const drifting = (t) => contractFor([KC, PT({ pattern: P({ drift: 0.5 }) })], { __t: t }).layers.find((x) => x.id === 'pt').pattern;
  assert.equal(drifting(1000).t, 1); assert.equal(drifting(2500).t, 2.5);
  assert.ok(!('t' in contractFor([KC, PT()]).layers.find((x) => x.id === 'pt').pattern));
  const plain = contractFor([KC]);
  assert.deepEqual(plain.layers.map((x) => x.type), ['content']);
  assert.ok(!('patternTime' in plain));
});

ok('the renderer: one texture + one frame source per pattern track, re-uploaded only when the frame changes, freed when the track goes', () => {
  const src = read('../gl/renderer.mjs');
  assert.match(src, /layer\.type === 'pattern' \? patternTexture\(layer, w, h\)/, 'compositeLayerTo draws a pattern from its own texture');
  assert.match(src, /frames: createPatternFrames\(\)/, 'each track owns a frame source (#1101)');
  assert.match(src, /const size = patternDrawSize\(layer\.pattern\.drift, w, h\)/);
  assert.match(src, /e\.frames\.frame\(layer\.pattern, layer\.palette, size\.w, size\.h, layer\.pattern\.t\)/);
  assert.match(src, /if \(e\.key !== f\.key\)/, 'upload only on change');
  assert.match(src, /sweepPatternTextures\(\); \/\/ #1098/, 'a track that left the scene frees its texture');
  assert.match(src, /for \(const e of patternTex\.values\(\)\) gl\.deleteTexture\(e\.tex\)/, 'and dispose frees them all');
  // the flip is turned on for this upload only: every other upload in the file expects the default
  assert.match(src, /UNPACK_FLIP_Y_WEBGL, true\);[^]*?texImage2D[^]*?UNPACK_FLIP_Y_WEBGL, false\);/);
  assert.match(src, /size\.scaled \? gl\.LINEAR : gl\.NEAREST/, 'a capped (moving) pattern is smoothed up, a full-size one stays hard-edged');
});

// ── browser: the actual pixels ──────────────────────────────────────────────
// The resolve pass tone-maps every pixel (ACES, Narkowicz: 1.0 -> 0.804, so 255 -> 205), tracks and
// patterns alike. The expected frame goes through the same curve.
const aces = (v) => {
  const x = v / 255;
  return Math.round(Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14))) * 255);
};

try {
  const { getScene } = await import('../gl/parity/corpus.mjs');
  const { renderCandidate, closeCandidate } = await import('../gl/candidate.mjs');
  const base = getScene('single-basic');
  const W = 200; const H = 140;
  const docWith = (layers, extra = {}) => ({ ...base, doc: { ...structuredClone(base.doc), layers, activeLayerId: 'bg', ...extra } });
  const kcLayer = { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
  const pal = resolvePalette(base.doc.paletteId || 'praystation', base.doc.paletteOverrides || null);
  const expected = (pattern) => {
    const px = new Uint8Array(patternPixels(pattern, pal, W, H, 0).buffer);
    const out = new Uint8Array(px.length);
    for (let i = 0; i < px.length; i += 4) { out[i] = aces(px[i]); out[i + 1] = aces(px[i + 1]); out[i + 2] = aces(px[i + 2]); out[i + 3] = 255; }
    return out;
  };
  const worst = (a, b) => {
    let m = 0; let off = 0; const total = a.length / 4;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      m = Math.max(m, d); if (d > 2) off += 1;
    }
    return { m, off: off / total };
  };

  for (const mode of ['QUILT', 'GLYPH', 'FIELD']) {
    const pattern = P({ mode, density: mode === 'GLYPH' ? 4 : 6 });
    const got = await renderCandidate(docWith([kcLayer, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern }]), { width: W });
    await okA(`GL ${mode}: the rendered frame is the engine's frame under the display curve (right way up, exact colours)`, async () => {
      const d = worst(got.pixels, expected(pattern));
      assert.ok(d.off < 0.002, `${(d.off * 100).toFixed(2)}% of pixels are off by more than 2 (worst ${d.m})`);
    });
  }

  const pattern = P();
  const withPt = await renderCandidate(docWith([kcLayer, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern }]), { width: W });
  const kcOnly = await renderCandidate(docWith([kcLayer]), { width: W });
  await okA('a pattern track covers the KC track below it, and without it the KC picture is untouched', async () => {
    assert.ok(!withPt.pixels.equals(kcOnly.pixels));
    assert.ok(worst(withPt.pixels, expected(pattern)).off < 0.002, 'opaque pattern fully covers a KC track');
  });

  const half = await renderCandidate(docWith([kcLayer, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 0.5, pattern }]), { width: W });
  await okA('opacity composites: a half-opaque pattern sits between the KC picture and the pattern', async () => {
    let between = 0; let tested = 0;
    for (let i = 0; i < half.pixels.length; i += 4) {
      const lo = Math.min(kcOnly.pixels[i], withPt.pixels[i]) - 2; const hi = Math.max(kcOnly.pixels[i], withPt.pixels[i]) + 2;
      if (kcOnly.pixels[i] === withPt.pixels[i]) continue;
      tested += 1; if (half.pixels[i] >= lo && half.pixels[i] <= hi) between += 1;
    }
    assert.ok(tested > 100 && between / tested > 0.98, `${between}/${tested}`);
  });

  const fxDoc = (effects) => docWith([kcLayer, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern }, { id: 'fx', name: 'FX 1', type: 'fx', visible: true, layerBlendMode: 'normal', layerOpacity: 1, effects }]);
  const graded = await renderCandidate(fxDoc([{ kind: 'rgbSplit', params: { dx: 3 } }]), { width: W });
  await okA('an FX track above a pattern changes it (the fold wraps a pattern like content)', async () => {
    assert.ok(!graded.pixels.equals(withPt.pixels));
    assert.ok(worst(graded.pixels, withPt.pixels).off > 0.05);
  });

  const again = await renderCandidate(docWith([kcLayer, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern }]), { width: W });
  await okA('same scene, same pixels (deterministic through the GL path)', async () => assert.ok(withPt.pixels.equals(again.pixels)));

  for (const [mode, drift] of [['QUILT', 0.8], ['GLYPH', 1], ['FIELD', 0.6]]) {
    const moving = P({ mode, density: mode === 'GLYPH' ? 4 : 6, drift });
    const t = 2.5;
    const got = await renderCandidate(docWith([kcLayer, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern: moving }], { patternTime: t }), { width: W });
    await okA(`GL ${mode} drifting (t = 2.5 s): the frame is the engine's frame at that time, and it differs from the still one`, async () => {
      const px = new Uint8Array(patternPixels(moving, pal, W, H, t).buffer);
      const want = new Uint8Array(px.length);
      for (let i = 0; i < px.length; i += 4) { want[i] = aces(px[i]); want[i + 1] = aces(px[i + 1]); want[i + 2] = aces(px[i + 2]); want[i + 3] = 255; }
      const d = worst(got.pixels, want);
      assert.ok(d.off < 0.002, `${(d.off * 100).toFixed(2)}% of pixels are off by more than 2 (worst ${d.m})`);
      assert.ok(!got.pixels.equals((await renderCandidate(docWith([kcLayer, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern: { ...moving, drift: 0 } }]), { width: W })).pixels), 'drifting is not still');
    });
  }

  const other = await renderCandidate(docWith([kcLayer, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern: P({ seed: 99 }) }]), { width: W });
  await okA('a new seed is a new frame', async () => assert.ok(!other.pixels.equals(withPt.pixels)));
  await closeCandidate();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  SKIP browser render checks: headless Chromium not installed');
  } else {
    throw e;
  }
}

console.log(`patternRender.selfcheck: ${n} checks passed`);
