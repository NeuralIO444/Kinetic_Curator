// composite.selfcheck.mjs — Phase 3 layer compositing + mattes (#189, #154).
//
// Node-only: blendIdFor mapping (including the plus-lighter → screen #96
// substitution the SVG reference applies), sanitizeMatte via
// buildSceneContract, the resolveLayerMattes cycle guard, and
// assertSceneContract matte validation.
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
import { resolveLayerMattes, RENDERER_PROGRAMS } from './renderer.mjs';
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
// The #193 second pass routes the four renderer programs (quad, composite,
// resolve, copy) through the checked compile/link builders and the uniform
// audit in createRenderer. The real compile needs a GL context (covered in
// the debug harness's in-page suite); here in Node we prove the audit
// table is complete and honest: every uniform each shader declares is in
// its program's upload list — the exact direction the checked audit
// throws on.
ok('harness: RENDERER_PROGRAMS covers all four renderer programs', () => {
  const keys = RENDERER_PROGRAMS.map((d) => d.key).sort();
  assert.deepEqual(keys, ['composite', 'copy', 'quad', 'resolve']);
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
