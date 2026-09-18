// composite.selfcheck.mjs — Phase 3 layer compositing + mattes (#189, #154).
//
// Node-only: blendIdFor mapping (including the plus-lighter → screen #96
// substitution the SVG reference applies), sanitizeMatte via
// buildSceneContract, the resolveLayerMattes cycle guard,
// assertSceneContract matte validation, and the hueRotateMatrix color
// matrix (#262: identity at 0, luminance-preserving, known rotation).
//
// Browser (skipped when the Playwright browser is absent): exact matte
// shader math through compositeProbe.html (alpha / luma / invert / none),
// and full-pipeline matte behavior through renderViaGL — a valid matte
// changes the render, while missing / cyclic / non-content sources fail
// closed to the unmatted pixels.
//
// Matte acceptance note (#154): the SVG reference path has no matte
// implementation (re-planned away from SVG masks), so there is no SVG
// cross-check for mattes. Exactness is proven against a JS mirror of the
// composite formula; multi-layer compositing itself is covered by the
// fx-stack-3 corpus scene against the SVG reference.
import assert from 'node:assert';
import { blendIdFor, BLEND_IDS } from './shaders.mjs';
import { resolveLayerMattes, RENDERER_PROGRAMS, hueRotateMatrix } from './renderer.mjs';
import { buildSceneContract, assertSceneContract, sanitizeMatte } from './sceneContract.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const okAsync = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };

// --- Node: blend id mapping -------------------------------------------------

ok('blendIdFor maps the contract set; plus-lighter falls back to screen (#96)', () => {
  assert.equal(blendIdFor('normal'), BLEND_IDS.normal);
  assert.equal(blendIdFor('multiply'), BLEND_IDS.multiply);
  assert.equal(blendIdFor('screen'), BLEND_IDS.screen);
  assert.equal(blendIdFor('overlay'), BLEND_IDS.overlay);
  assert.equal(blendIdFor('hue'), BLEND_IDS.hue);
  assert.equal(blendIdFor('luminosity'), BLEND_IDS.luminosity);
  assert.equal(blendIdFor('plus-lighter'), BLEND_IDS.screen, 'matches the SVG reference substitution');
  assert.equal(blendIdFor('bogus'), BLEND_IDS.normal, 'unknown modes never throw');
  assert.equal(blendIdFor(undefined), BLEND_IDS.normal);
});

ok('sanitizeMatte: shape, defaults, and fail-closed nulls', () => {
  assert.equal(sanitizeMatte(null), null);
  assert.equal(sanitizeMatte(undefined), null);
  assert.equal(sanitizeMatte({}), null);
  assert.equal(sanitizeMatte({ sourceId: '' }), null);
  assert.equal(sanitizeMatte({ sourceId: 42 }), null);
  assert.deepEqual(
    sanitizeMatte({ sourceId: 'bg' }),
    { sourceId: 'bg', mode: 'alpha', invert: false }
  );
  assert.deepEqual(
    sanitizeMatte({ sourceId: 'bg', mode: 'luma', invert: 1 }),
    { sourceId: 'bg', mode: 'luma', invert: true }
  );
  assert.deepEqual(
    sanitizeMatte({ sourceId: 'bg', mode: 'bogus' }),
    { sourceId: 'bg', mode: 'alpha', invert: false }
  );
});

ok('buildSceneContract plumbs doc-layer matte onto content and fx layers', () => {
  const doc = {
    seed: 1, quality: 'balanced',
    layers: [
      { id: 'bg', type: 'content', layerBlendMode: 'normal', layerOpacity: 1 },
      {
        id: 'top', type: 'content', layerBlendMode: 'screen', layerOpacity: 0.5,
        matte: { sourceId: 'bg', mode: 'luma', invert: true },
      },
      { id: 'fx1', type: 'fx', layerOpacity: 0.9, matte: { sourceId: 'bg' }, effects: [] },
    ],
  };
  const rl = (id, extra = {}) => ({
    id, layoutParams: {}, palette: {}, items: [],
    layerBlendMode: 'normal', layerOpacity: 1, ...extra,
  });
  const scene = buildSceneContract({
    doc,
    resolvedLayers: [
      rl('bg'),
      rl('top', { layerBlendMode: 'screen', layerOpacity: 0.5 }),
      { id: 'fx1', isFx: true, layer: doc.layers[2], layerOpacity: 0.9 },
    ],
  });
  const byId = new Map(scene.layers.map((l) => [l.id, l]));
  assert.equal(byId.get('bg').matte, null);
  assert.deepEqual(byId.get('top').matte, { sourceId: 'bg', mode: 'luma', invert: true });
  assert.deepEqual(byId.get('fx1').matte, { sourceId: 'bg', mode: 'alpha', invert: false });
});

ok('assertSceneContract validates matte shape', () => {
  const doc = { seed: 1, quality: 'balanced', layers: [{ id: 'bg', type: 'content' }] };
  const scene = buildSceneContract({
    doc,
    resolvedLayers: [{ id: 'bg', layoutParams: {}, palette: {}, items: [], layerBlendMode: 'normal', layerOpacity: 1 }],
  });
  assert.doesNotThrow(() => assertSceneContract(scene));
  const bad = (matte) => {
    const s = JSON.parse(JSON.stringify(scene));
    s.layers[0].matte = matte;
    assert.throws(() => assertSceneContract(s), /matte/);
  };
  bad({ sourceId: 42 });
  bad({ sourceId: 'bg', mode: 'sepia' });
  bad({ sourceId: 'bg', invert: 'yes' });
});

ok('resolveLayerMattes: valid, self-cycle, 2-cycle, missing, fx source', () => {
  const layers = [
    { id: 'a', type: 'content', matte: { sourceId: 'b', mode: 'alpha', invert: false } },
    { id: 'b', type: 'content', matte: null },
    { id: 'c', type: 'content', matte: { sourceId: 'c', mode: 'alpha', invert: false } },
    { id: 'd', type: 'content', matte: { sourceId: 'e', mode: 'luma', invert: true } },
    { id: 'e', type: 'content', matte: { sourceId: 'd', mode: 'alpha', invert: false } },
    { id: 'f', type: 'content', matte: { sourceId: 'missing', mode: 'alpha', invert: false } },
    { id: 'g', type: 'fx', matte: { sourceId: 'b', mode: 'alpha', invert: false } },
    { id: 'h', type: 'content', matte: { sourceId: 'g', mode: 'alpha', invert: false } },
    { id: 'i', type: 'content', matte: { sourceId: 'j', mode: 'luma', invert: true } },
    { id: 'j', type: 'content', matte: { sourceId: 'k', mode: 'alpha', invert: false } },
    { id: 'k', type: 'content', matte: null },
  ];
  const m = resolveLayerMattes({ layers });
  assert.deepEqual(m.get('a'), { sourceId: 'b', mode: 'alpha', invert: false });
  assert.equal(m.get('b'), null, 'no matte');
  assert.equal(m.get('c'), null, 'self-matte fails closed');
  assert.equal(m.get('d'), null, '2-cycle fails closed');
  assert.equal(m.get('e'), null, '2-cycle fails closed');
  assert.equal(m.get('f'), null, 'missing source fails closed');
  assert.deepEqual(m.get('g'), { sourceId: 'b', mode: 'alpha', invert: false }, 'fx layer matte is valid');
  assert.equal(m.get('h'), null, 'fx source fails closed');
  assert.deepEqual(
    m.get('i'), { sourceId: 'j', mode: 'luma', invert: true },
    'chained sources resolve to the immediate layer'
  );
});

// --- harness coverage: every renderer program is audit-registered -----------
// The #193 second pass routes the five renderer programs (quad, composite,
// resolve, copy, upscale) through the checked compile/link builders and the
// audit in createRenderer. The real compile needs a GL context (covered in
// the debug harness's in-page suite); here in Node we prove the audit
// table is complete and honest: every uniform each shader declares is in
// its program's upload list — the exact direction the checked audit
// throws on.
ok('harness: RENDERER_PROGRAMS covers all five renderer programs', () => {
  const keys = RENDERER_PROGRAMS.map((d) => d.key).sort();
  assert.deepEqual(keys, ['composite', 'copy', 'quad', 'resolve', 'upscale']);
  for (const def of RENDERER_PROGRAMS) {
    assert.equal(typeof def.vs, 'string', `${def.key}: has vertex source`);
    assert.equal(typeof def.fs, 'string', `${def.key}: has fragment source`);
    assert.ok(Array.isArray(def.uniforms) && def.uniforms.length > 0, `${def.key}: has an upload list`);
    assert.equal(typeof def.fsFile, 'string', `${def.key}: names its file for errors`);
  }
});

ok('harness: every uniform each renderer shader declares is in its upload list', () => {
  const parse = (src) => {
    const names = [];
    const re = /uniform\s+\w+\s+(\w+)\s*;/g;
    let m;
    while ((m = re.exec(src || ''))) names.push(m[1]);
    return names;
  };
  for (const def of RENDERER_PROGRAMS) {
    // Vertex + fragment stages both feed ACTIVE_UNIFORMS.
    const declared = [...parse(def.vs), ...parse(def.fs)];
    const missing = declared.filter((u) => !def.uniforms.includes(u));
    assert.deepEqual(missing, [], `${def.name}: declared-but-never-set [${missing}]`);
  }
});

// --- hueRotateMatrix (#262): the SVG feColorMatrix hue-rotation matrix ----
const applyMat3 = (m, c) => [ // column-major mat3 * vec3
  m[0] * c[0] + m[3] * c[1] + m[6] * c[2],
  m[1] * c[0] + m[4] * c[1] + m[7] * c[2],
  m[2] * c[0] + m[5] * c[1] + m[8] * c[2],
];
const srgbLum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

ok('hueRotateMatrix: exact identity at 0 and 360', () => {
  const ident = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  assert.deepEqual([...hueRotateMatrix(0)], ident, 'hueRotate=0 uploads an exact identity');
  assert.deepEqual([...hueRotateMatrix(360)], ident, '360 wraps to identity');
  assert.deepEqual([...hueRotateMatrix(-360)], ident, '-360 wraps to identity');
});

ok('hueRotateMatrix: preserves gray and (approx) luminance; rotates hues', () => {
  // 120 degrees maps pure red onto the green column of the matrix.
  const got = applyMat3([...hueRotateMatrix(120)], [1, 0, 0]);
  const want = [-0.3649634110, 0.4433416327, -0.3620619928]; // SVG feColorMatrix type="hueRotate" @120
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(got[i] - want[i]) < 1e-5, `120deg red channel ${i}: ${got[i]} vs ${want[i]}`);
  }
  assert.ok(got[1] > 0.4 && got[0] < 0 && got[2] < 0, 'red visibly shifts toward green');
  const colors = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.8, 0.2, 0.5], [0.1, 0.9, 0.3], [0.4, 0.4, 0.4]];
  for (let deg = 0; deg < 360; deg += 15) {
    const m = [...hueRotateMatrix(deg)];
    for (const c of colors) {
      const r = applyMat3(m, c);
      // Rec.709 luminance is near-preserved: worst observed drift is ~6e-4
      // (0.15 of a byte) — not a dramatic change, matching the SVG reference
      // (feColorMatrix type="hueRotate") by construction.
      const d = Math.abs(srgbLum(r) - srgbLum(c));
      assert.ok(d < 1e-3, `lum drift at ${deg}deg on [${c}]: ${d}`);
    }
  }
  // Gray stays gray at any angle.
  for (const deg of [30, 90, 180, 270]) {
    const r = applyMat3([...hueRotateMatrix(deg)], [0.5, 0.5, 0.5]);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(r[i] - 0.5) < 1e-6, `gray @${deg}deg ch${i}`);
  }
});

// --- Browser: exact shader math + pipeline behavior -------------------------

const unpre3 = (c, a) => (a > 1e-6 ? [c[0] / a, c[1] / a, c[2] / a] : [0, 0, 0]);
const sLum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** JS mirror of COMPOSITE_FS (normal blend) for the probe expectations. */
function compositeRef(S, D, { opacity = 1, mask = null, maskMode = 0, maskInvert = false } = {}) {
  let s = S.slice();
  if (mask) {
    let mm = maskMode === 1 ? sLum(unpre3([mask[0], mask[1], mask[2]], mask[3])) : mask[3];
    if (maskInvert) mm = 1 - mm;
    s = [s[0] * mm, s[1] * mm, s[2] * mm, s[3] * mm];
  }
  s = [s[0] * opacity, s[1] * opacity, s[2] * opacity, s[3] * opacity];
  const cs = unpre3([s[0], s[1], s[2]], s[3]);
  const cb = unpre3([D[0], D[1], D[2]], D[3]);
  const as = s[3], ab = D[3];
  const ao = as + ab - as * ab;
  let co = [0, 0, 0];
  if (ao > 1e-6) {
    for (let i = 0; i < 3; i++) {
      co[i] = (as * (1 - ab) * cs[i] + as * ab * cs[i] + (1 - as) * ab * cb[i]) / ao;
    }
  }
  return [co[0] * ao, co[1] * ao, co[2] * ao, ao];
}

const bytesOf = (px) => px.map((v) => Math.round(v * 255));

async function runBrowserTests() {
  const { openHarnessPage, closeGlDriver, renderViaGL } = await import('./parity/glDriver.mjs');
  const { getScene } = await import('./parity/corpus.mjs');
  const { buildSceneContract: build } = await import('./sceneContract.js');
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');

  await okAsync('probe: alpha matte math matches the JS mirror (per-pixel masks)', async () => {
    const { page, close } = await openHarnessPage('/parity/compositeProbe.html');
    try {
      const w = 2, h = 2;
      const rep = (v) => [v, v, v, v].flat();
      const src = rep([128, 0, 0, 128]);   // red @ 50%
      const dst = rep([0, 128, 0, 128]);   // green @ 50%
      const mask = [0, 0, 0, 64, 0, 0, 0, 128, 0, 0, 0, 192, 0, 0, 0, 255];
      const res = await page.evaluate((p) => window.__kcComposite(p), {
        w, h, src, dst, mask, blend: 0, opacity: 1, maskMode: 0, maskInvert: false,
      });
      assert.equal(res.pixels.length, 16);
      const alphas = [64, 128, 192, 255];
      for (let i = 0; i < 4; i++) {
        const S = [128 / 255, 0, 0, 128 / 255];
        const D = [0, 128 / 255, 0, 128 / 255];
        const exp = bytesOf(compositeRef(S, D, { mask: [0, 0, 0, alphas[i] / 255] }));
        const got = res.pixels.slice(i * 4, i * 4 + 4);
        for (let c = 0; c < 4; c++) {
          assert.ok(
            Math.abs(got[c] - exp[c]) <= 2,
            `pixel ${i} ch ${c}: got ${got[c]}, expected ${exp[c]}`
          );
        }
      }
    } finally { await close(); }
  });

  await okAsync('probe: luma matte uses sRGB luminance; invert flips', async () => {
    const { page, close } = await openHarnessPage('/parity/compositeProbe.html');
    try {
      const w = 2, h = 2;
      const rep = (v) => [v, v, v, v].flat();
      const src = rep([128, 0, 0, 128]);
      const dst = rep([0, 128, 0, 128]);
      // Opaque gray masks: luma path must equal the alpha value v/255 here.
      const mask = [64, 64, 64, 255, 128, 128, 128, 255, 192, 192, 192, 255, 255, 255, 255, 255];
      const run = (maskInvert) => page.evaluate((p) => window.__kcComposite(p), {
        w, h, src, dst, mask, blend: 0, opacity: 1, maskMode: 1, maskInvert,
      });
      const vals = [64, 128, 192, 255];
      for (const invert of [false, true]) {
        const res = await run(invert);
        for (let i = 0; i < 4; i++) {
          const S = [128 / 255, 0, 0, 128 / 255];
          const D = [0, 128 / 255, 0, 128 / 255];
          const v = vals[i] / 255;
          const exp = bytesOf(compositeRef(S, D, {
            mask: [v, v, v, 1], maskMode: 1, maskInvert: invert,
          }));
          const got = res.pixels.slice(i * 4, i * 4 + 4);
          for (let c = 0; c < 4; c++) {
            assert.ok(
              Math.abs(got[c] - exp[c]) <= 2,
              `invert=${invert} pixel ${i} ch ${c}: got ${got[c]}, expected ${exp[c]}`
            );
          }
        }
      }
      // No mask: control path is unchanged.
      const res = await page.evaluate((p) => window.__kcComposite(p), {
        w, h, src, dst, mask: null, blend: 0, opacity: 1, maskMode: 0, maskInvert: false,
      });
      const S = [128 / 255, 0, 0, 128 / 255];
      const D = [0, 128 / 255, 0, 128 / 255];
      const exp = bytesOf(compositeRef(S, D, {}));
      for (let i = 0; i < 4; i++) {
        const got = res.pixels.slice(i * 4, i * 4 + 4);
        for (let c = 0; c < 4; c++) {
          assert.ok(Math.abs(got[c] - exp[c]) <= 2, `no-mask pixel ${i} ch ${c}`);
        }
      }
    } finally { await close(); }
  });

  async function renderDoc(doc, width = 200) {
    const caps = getRenderCaps(doc.quality || 'balanced', false);
    const resolvedLayers = resolveLayers(doc, { caps });
    const contract = build({ doc, resolvedLayers, caps });
    const bg = resolvedLayers[0]?.palette?.bg || '#000000';
    const height = Math.round((width * 700) / 1000);
    const { pixels } = await renderViaGL(contract, { width, height, bg });
    return pixels;
  }
  const withMatte = (doc, layerId, matte) => {
    const d = JSON.parse(JSON.stringify(doc));
    const l = d.layers.find((x) => x.id === layerId);
    if (matte) l.matte = matte; else delete l.matte;
    return d;
  };
  const differ = (a, b) => {
    let nDiff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) nDiff++;
    return nDiff;
  };

  await okAsync('pipeline: alpha/luma/invert mattes change the render', async () => {
    const base = getScene('multi-blend').doc;
    const ref = await renderDoc(withMatte(base, 'top', null));
    for (const matte of [
      { sourceId: 'bg', mode: 'alpha' },
      { sourceId: 'bg', mode: 'luma' },
      { sourceId: 'bg', mode: 'alpha', invert: true },
    ]) {
      const px = await renderDoc(withMatte(base, 'top', matte));
      assert.ok(differ(ref, px) > 0, `matte ${JSON.stringify(matte)} must change pixels`);
    }
  });

  await okAsync('pipeline: missing/cyclic/fx-source mattes fail closed to unmatted', async () => {
    const base = getScene('multi-blend').doc;
    const ref = await renderDoc(withMatte(base, 'top', null));
    for (const matte of [
      { sourceId: 'nope', mode: 'alpha' },
      { sourceId: 'top', mode: 'alpha' },
    ]) {
      const px = await renderDoc(withMatte(base, 'top', matte));
      assert.ok(px.equals(ref), `matte ${JSON.stringify(matte)} must fail closed`);
    }
    // Two-cycle across two layers.
    const cyc = withMatte(base, 'top', { sourceId: 'bg', mode: 'alpha' });
    cyc.layers.find((x) => x.id === 'bg').matte = { sourceId: 'top', mode: 'alpha' };
    assert.ok((await renderDoc(cyc)).equals(ref), '2-cycle must fail closed');
  });

  await okAsync('pipeline: matte on an FX layer masks the wrap result', async () => {
    const base = getScene('fx-invert-wrap').doc;
    const ref = await renderDoc(withMatte(base, 'fx1', null));
    const masked = await renderDoc(withMatte(base, 'fx1', { sourceId: 'bg', mode: 'alpha' }));
    assert.ok(differ(ref, masked) > 0, 'fx-layer matte must change pixels');
    const bad = await renderDoc(withMatte(base, 'fx1', { sourceId: 'fx1', mode: 'alpha' }));
    assert.ok(bad.equals(ref), 'self-matte on fx layer must fail closed');
  });

  await okAsync('pipeline: stacked FX layers compose — double invert cancels (#227)', async () => {
    // #227: an FX layer adjusts EVERYTHING below it, including lower FX
    // layers' output. Two stacked full-opacity inverts must cancel back to
    // the unwrapped render; under the old fold the upper FX never saw the
    // lower FX's output (and a directly-adjacent upper FX was shed outright).
    const base = JSON.parse(JSON.stringify(getScene('fx-invert-wrap').doc));
    base.layers = base.layers.filter((l) => l.id !== 'top');
    base.layers.find((l) => l.id === 'fx1').layerOpacity = 1;
    base.layers.push({
      id: 'fx2', name: 'FX2', type: 'fx', visible: true,
      layerBlendMode: 'normal', layerOpacity: 1, effects: [{ kind: 'invert', params: {} }],
    });
    const noFx = JSON.parse(JSON.stringify(base));
    noFx.layers = noFx.layers.filter((l) => l.type !== 'fx');
    const single = JSON.parse(JSON.stringify(base));
    single.layers = single.layers.filter((l) => l.id !== 'fx2');

    const fracBad = (a, b, tol = 6) => {
      let bad = 0;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > tol) bad++;
      return bad / (a.length / 4);
    };
    const pxDouble = await renderDoc(base);
    const pxNone = await renderDoc(noFx);
    const pxSingle = await renderDoc(single);
    assert.ok(fracBad(pxSingle, pxNone) > 0.5, 'sanity: a single invert must change most pixels');
    assert.ok(
      fracBad(pxDouble, pxNone) < 0.01,
      `double invert must cancel to the unwrapped render, got ${(fracBad(pxDouble, pxNone) * 100).toFixed(2)}% bad pixels`
    );
  });

  await closeGlDriver();
}

try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser composite tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}

console.log(`composite.selfcheck: OK (${n} cases)`);
