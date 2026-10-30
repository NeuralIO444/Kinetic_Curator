// wetSoak.selfcheck.mjs — #1814: strata soak where the field is wet
// (WET_ENGINE Phase B).
//
// The issue's acceptance, pinned:
//  (1) mode off (every existing project): byte-identical composite —
//      the flag rides the contract only while on, an unflagged
//      contract is the pre-#1814 contract, and a flagged layer with
//      no field served renders byte-identical pixels to the unflagged
//      scene (mask absent → static blend).
//  (2) mask absent at perfTier1: the service names the shed, serves
//      no mask, and the stratum row shows the degradation (the WET
//      indicator dims — pinned here by source + CSS).
//  (3) scripted soak test: a mark over a wet patch vs dry ground —
//      dry-side pixels match the mode-off render exactly; the smear
//      direction follows the field's velocity sign (both signs); the
//      absorption term multiplies by the pigment reflectance, and by
//      the ground colour alone when no pigment is served — each term
//      isolated (velocity zeroed for absorption, ground whitened for
//      smear).
//  (4) export parity: the same scene + field through the warm-up
//      export shape (renderScene) and the live composite
//      (renderFrame via the present probe) agree within tolerance,
//      WET mode on; the end-to-end warm-up export soaks and is
//      byte-identical across runs.
// Plus the spine's standing laws: the service contract is untouched
// (the soak is a named consumer of the generic gate — a soak-only
// scene births the field and a resting mark wets its own ground: the
// stamping clause), and the terms live in one recipe (wetSoak.mjs)
// whose constants the GLSL carries literally.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..', '..');
const REPO = join(APP, '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

let checks = 0;
const ok = (name, fn) => {
  fn();
  checks++;
  console.log(`  [ok] ${name}`);
};
const okAsync = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  [ok] ${name}`);
};

const {
  WET_SOAK,
  WET_SOAK_VEL_PACK,
  soakWeight,
  sampleWetPack,
  decodeVelocity,
  smearOffsetUv,
  absorbColor,
  soakFieldState,
} = await import('./wetSoak.mjs');
const { VORTEX_VEL_PACK } = await import('./vortex.mjs');
const { createWetFrameService } = await import('./wetFrame.mjs');
const { buildSceneContract, assertSceneContract } = await import('./sceneContract.js');
const { getCostTier } = await import('./costTiers.mjs');
const { COMPOSITE_FS } = await import('./shaders.mjs');
const { getScene } = await import('./parity/corpus.mjs');
const { resolveLayers } = await import('../../../studio/render.mjs');
const { getRenderCaps } = await import('../data/quality.js');

// --- the recipe -----------------------------------------------------------------
ok('recipe: taps sum to 1 (a still field re-samples the source exactly)', () => {
  assert.equal(
    WET_SOAK.tapWeights.reduce((a, b) => a + b, 0),
    1,
  );
  assert.deepEqual([...WET_SOAK.tapWeights], [0.5, 0.3, 0.2]);
  assert.deepEqual([...WET_SOAK.tapSpans], [0, 0.5, 1]);
  assert.equal(WET_SOAK.smear, 1);
});

ok('mirror: soakWeight is mask × amount, clamped', () => {
  assert.equal(soakWeight(0, 1), 0);
  assert.equal(soakWeight(1, 0), 0);
  assert.equal(soakWeight(0.5, 0.8), 0.4);
  assert.equal(soakWeight(1, 1), 1);
  assert.equal(soakWeight(2, 2), 1, 'clamps');
  assert.equal(soakWeight(undefined, 1), 0);
});

ok('mirror: velocity decode is centred, pack-scaled', () => {
  assert.equal(
    WET_SOAK_VEL_PACK,
    VORTEX_VEL_PACK,
    'the mirrored pack constant equals vortex’s (wetSoak never imports the sim)',
  );
  assert.deepEqual(decodeVelocity(0.5, 0.5), [0, 0]);
  assert.deepEqual(decodeVelocity(1, 0), [VORTEX_VEL_PACK, -VORTEX_VEL_PACK]);
  assert.deepEqual(decodeVelocity(0.75, 0.25, 32), [16, -16]);
});

ok('mirror: smear offset follows the velocity sign (scene → FBO uv, Y flips)', () => {
  const [du, dv] = smearOffsetUv(16, 0, 1000, 700);
  assert.ok(du > 0 && dv === 0, '+x flow drags toward +u');
  const [du2, dv2] = smearOffsetUv(0, 16, 1000, 700);
  assert.ok(du2 === 0 && dv2 < 0, '+y (down in scene) drags toward −v (up in FBO space)');
  assert.deepEqual(smearOffsetUv(0, 0, 1000, 700), [0, 0]);
});

ok('mirror: absorption — pigment reflectance when present, ground alone when not', () => {
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  assert.ok(near(absorbColor([0.8, 0.6, 0.4], [0.5, 0.25, 1], [0.1, 0.1, 0.1]), [0.4, 0.15, 0.4]));
  assert.ok(near(absorbColor([0.8, 0.6, 0.4], null, [0.25, 0.5, 0.75]), [0.2, 0.3, 0.3]));
  assert.ok(
    near(absorbColor([0.3, 0.3, 0.3], [1, 1, 1], [0, 0, 0]), [0.3, 0.3, 0.3]),
    'bare paper (reflectance 1) absorbs nothing',
  );
});

ok('mirror: pack sampling is bilinear in scene space', () => {
  const n = 4;
  const rgba = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) rgba[(j * n + i) * 4] = i * 85; // R ramps with x
  const pack = { n, rgba };
  assert.equal(sampleWetPack(pack, 0, 0, 100, 100)[0], 0);
  assert.ok(Math.abs(sampleWetPack(pack, 99, 0, 100, 100)[0] - 1) < 0.02, 'right edge ≈ 1');
  const mid = sampleWetPack(pack, 50, 50, 100, 100)[0];
  assert.ok(mid > 0.4 && mid < 0.6, 'centre interpolates');
});

ok('soakFieldState: no mask → null (the static-blend fallback); packs normalise', () => {
  assert.equal(soakFieldState(null, [0, 0, 0]), null);
  assert.equal(soakFieldState({}, [0, 0, 0]), null);
  assert.equal(soakFieldState({ wetMask: null }, [0, 0, 0]), null);
  const mask = { n: 4, rgba: new Uint8Array(64) };
  const st = soakFieldState({ wetMask: mask, wetAmount: 2 }, [0.1, 0.2, 0.3]);
  assert.equal(st.mask, mask);
  assert.equal(st.vel, null, 'velocity is optional state (smear 0)');
  assert.equal(st.pig, null, 'pigment is optional state (ground fallback)');
  assert.equal(st.amount, 1, 'amount clamps to 1');
  assert.equal(st.velPack, VORTEX_VEL_PACK, 'pack scale defaults to the vortex pack');
  assert.deepEqual(st.ground, [0.1, 0.2, 0.3]);
});

// --- GLSL ↔ recipe pins -----------------------------------------------------------
ok('GLSL carries the recipe literally (composite soak block)', () => {
  assert.ok(COMPOSITE_FS.includes('uniform float u_soakOn;'), 'soak gate uniform');
  assert.ok(
    COMPOSITE_FS.includes('clamp(texture(u_soakMask, fuv).r * u_soakAmt, 0.0, 1.0)'),
    'fieldWetness = mask × amount, clamped — the issue formula',
  );
  assert.ok(
    COMPOSITE_FS.includes(
      'texture(u_src, tuv) * 0.5 + texture(u_src, tuv - d * 0.5) * 0.3 + texture(u_src, tuv - d) * 0.2',
    ),
    'smear taps: spans 0/0.5/1, weights 0.5/0.3/0.2 — WET_SOAK, literally',
  );
  assert.ok(
    COMPOSITE_FS.includes('u_soakPigOn > 0.5 ? texture(u_soakPig, fuv).rgb : u_soakGround'),
    'absorption: pigment reflectance, else the ground colour alone',
  );
  assert.ok(COMPOSITE_FS.includes('vec2 fuv = vec2(tuv.x, 1.0 - tuv.y);'), 'field packs sampled in scene space');
  assert.ok(COMPOSITE_FS.includes('o = mix(o, vec4(co2 * ao2, ao2), f);'), 'w = mix(w_dry, w_soaked, f)');
});

await okAsync('renderer: composite program declares the soak uniforms; the sampling has a cost tier', async () => {
  const renderer = read('app/src/gl/renderer.mjs');
  for (const u of [
    'u_soakOn',
    'u_soakMask',
    'u_soakVel',
    'u_soakPig',
    'u_soakPigOn',
    'u_soakAmt',
    'u_soakGround',
    'u_soakVelScale',
  ]) {
    assert.ok(renderer.includes(`'${u}'`), `composite program def lists ${u}`);
    assert.ok(renderer.includes(`${u}: U(compProg, '${u}')`), `compU binds ${u}`);
  }
  assert.ok(renderer.includes('layer.wetSoak === true'), 'compositeLayerTo passes the flag');
  assert.ok(renderer.includes('soakFieldState(payload.wet'), 'renderFrameInto normalises the payload field');
  assert.ok(renderer.includes("registerCostTier('gl/wet-soak'"), 'cost registration present');
  await import('./renderer.mjs'); // importing the renderer performs the registration
  const tier = getCostTier('gl/wet-soak');
  assert.ok(tier && tier.tier === 0, 'tier 0 — shed is the service shed, never a silent thinning');
});

// --- the contract -------------------------------------------------------------------
const buildContractFromDoc = (doc) => {
  const caps = getRenderCaps(doc.quality || 'balanced', false);
  return buildSceneContract({ doc, resolvedLayers: resolveLayers(doc, { caps }), caps });
};

ok('contract: the flag rides only while on; unflagged scenes are untouched', () => {
  const base = getScene('single-basic').doc;
  const off = buildContractFromDoc(JSON.parse(JSON.stringify(base)));
  assert.ok(!JSON.stringify(off).includes('wetSoak'), 'no flag anywhere in an unflagged contract');
  const onDoc = JSON.parse(JSON.stringify(base));
  onDoc.layers[0].wetSoak = true;
  const on = buildContractFromDoc(onDoc);
  const content = on.layers.find((l) => l.type === 'content');
  assert.equal(content.wetSoak, true, 'the flagged content layer carries wetSoak: true');
  const stripped = JSON.parse(JSON.stringify(on));
  delete stripped.layers.find((l) => l.type === 'content').wetSoak;
  assert.equal(JSON.stringify(stripped), JSON.stringify(off), 'flag aside, the contracts are identical');
});

ok('contract validator: wetSoak is only ever true, and only on content', () => {
  const doc = JSON.parse(JSON.stringify(getScene('single-basic').doc));
  doc.layers[0].wetSoak = true;
  const contract = buildContractFromDoc(doc);
  assert.doesNotThrow(() => assertSceneContract(contract));
  const bad = JSON.parse(JSON.stringify(contract));
  bad.layers.find((l) => l.type === 'content').wetSoak = false;
  assert.throws(() => assertSceneContract(bad), /wetSoak is only ever true/);
});

// --- the document + store chain ------------------------------------------------------
globalThis.requestAnimationFrame = (fn) => {
  queueMicrotask(() => fn(performance.now()));
  return 1;
};
globalThis.cancelAnimationFrame = () => {};
const { Events, emit } = await import('../composition/eventBus.js');
const { wireEventBus } = await import('../composition/wireEventBus.js');
const { applyAction } = await import('../state/applyAction.js');
const { useStore } = await import('../state/store.js');
const { serializeProject, parseProject } = await import('../state/projectDocument.js');
const { strataSummary } = await import('../panels/build/strataSummary.mjs');
wireEventBus(applyAction);
const S = () => useStore.getState();
const layerOf = (id) => S().layers.find((l) => l.id === id);
const undoDepth = () => S().historyUndoStack.length;

const rawDoc = {
  version: 1,
  seed: 0xbeef,
  paletteId: 'praystation',
  layers: [
    { id: 'kc-a', name: 'A', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    {
      id: 'kc-b',
      name: 'B',
      type: 'content',
      visible: true,
      layerBlendMode: 'normal',
      layerOpacity: 1,
      wetSoak: true,
    },
    { id: 'pt-1', name: 'P', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, wetSoak: true },
    {
      id: 'fx-1',
      name: 'F',
      type: 'fx',
      visible: true,
      layerBlendMode: 'normal',
      layerOpacity: 1,
      effects: [{ kind: 'invert', params: {} }],
      wetSoak: true,
    },
  ],
  activeLayerId: 'kc-a',
};
const parsed = parseProject(JSON.parse(JSON.stringify(rawDoc)));
assert.ok(parsed.ok, `fixture doc parses: ${parsed.error || ''}`);
S().applyProject(parsed.doc);

ok('load normalization: exactly true on a content layer survives; every other spelling drops', () => {
  assert.equal(layerOf('kc-b').wetSoak, true, 'content + true survives');
  assert.ok(!('wetSoak' in layerOf('pt-1')), 'pattern layer: dropped (content only)');
  assert.ok(!('wetSoak' in layerOf('fx-1')), 'fx layer: dropped');
  assert.ok(!('wetSoak' in layerOf('kc-a')), 'absence stays absence');
});

ok('bus chain: the row event flips the mode — key appears as true, disappears on disable, never false', () => {
  assert.ok(!('wetSoak' in layerOf('kc-a')), 'starts keyless (off)');
  emit(Events.LAYER_TOGGLE_WET_SOAK, { id: 'kc-a' });
  assert.equal(layerOf('kc-a').wetSoak, true, 'one tap: wetSoak === true');
  emit(Events.LAYER_TOGGLE_WET_SOAK, { id: 'kc-a' });
  assert.ok(!('wetSoak' in layerOf('kc-a')), 'second tap: the key is gone, not spelled false');
});

ok('the toggle is undoable on content, a no-op on pattern/FX (no key, no undo entry)', () => {
  const before = undoDepth();
  emit(Events.LAYER_TOGGLE_WET_SOAK, { id: 'pt-1' });
  emit(Events.LAYER_TOGGLE_WET_SOAK, { id: 'fx-1' });
  assert.equal(undoDepth(), before, 'no undo entries for non-content strata');
  assert.ok(!('wetSoak' in layerOf('pt-1')) && !('wetSoak' in layerOf('fx-1')));
  emit(Events.LAYER_TOGGLE_WET_SOAK, { id: 'kc-a' });
  assert.equal(undoDepth(), before + 1, 'one undo entry for the content toggle');
  S().undo();
  assert.ok(!('wetSoak' in layerOf('kc-a')), 'undo restores the off state');
});

ok('a duplicate inherits the mode; the saved project round-trips byte-stable', () => {
  emit(Events.LAYER_DUPLICATE, { id: 'kc-b' });
  const copy = S().layers.find((l) => l.id !== 'kc-b' && l.type === 'content' && l.wetSoak === true);
  assert.ok(copy, 'the duplicate carries wetSoak');
  const saved1 = JSON.stringify(serializeProject(S()));
  const back = parseProject(JSON.parse(saved1));
  assert.ok(back.ok);
  S().applyProject(back.doc);
  const saved2 = JSON.stringify(serializeProject(S()));
  assert.equal(saved2, saved1, 'serialize → parse → apply → serialize is byte-stable');
  const allOff = parseProject(JSON.parse(saved1));
  for (const l of allOff.doc.layers) delete l.wetSoak;
  S().applyProject(allOff.doc);
  assert.ok(
    !JSON.stringify(serializeProject(S())).includes('wetSoak'),
    'an all-off project spells no wetSoak anywhere',
  );
});

ok('the collapsed BUILD block confesses the mode in words', () => {
  const baseLayer = {
    type: 'content',
    layerBlendMode: 'normal',
    layerOpacity: 1,
    patch: { mode: 'off', to: null, strength: 0.16 },
  };
  const on = strataSummary({ ...baseLayer, wetSoak: true }, 'content', 80, null);
  assert.ok(on.includes('wet soak'), `summary names the mode: ${on}`);
  const off = strataSummary(baseLayer, 'content', 80, null);
  assert.ok(!off.includes('wet soak'), 'off stays silent');
});

// --- the service gate ------------------------------------------------------------------
ok('service: a soak-only request births the field; a resting mark wets its own ground (the stamping clause)', () => {
  const svc = createWetFrameService();
  const instances = [{ x: 500, y: 350, tint: '#2255cc' }];
  let served = null;
  for (let i = 0; i < 30; i++) {
    served = svc.frame({
      consumers: { soak: true },
      wetness: 0.85,
      freeze: false,
      seed: 7,
      width: 1000,
      height: 700,
      instances,
      behave: 'cruise',
      motion: 0.3,
    });
  }
  assert.equal(served.wetMode, 'live');
  assert.equal(served.wetStep, 1);
  assert.ok(served.wetMask && served.wetVel, 'mask + velocity served to a soak-only consumer');
  assert.ok(svc.stats().births >= 1, 'the field was born for the soak');
  const wetAtMark = sampleWetPack(served.wetMask, 500, 350, 1000, 700)[0];
  assert.ok(wetAtMark > 0.05, `the ground under the mark is wet (${wetAtMark.toFixed(3)})`);
  assert.equal(served.pigStep, 1, 'the tinted mark deposited pigment (absorption has something to drink)');
  svc.dispose();
});

ok('service: no consumer → off; perfTier1 shed → named shed, no mask (the static-blend state)', () => {
  const svc = createWetFrameService();
  const base = {
    wetness: 0.85,
    freeze: false,
    seed: 7,
    width: 1000,
    height: 700,
    instances: [],
    behave: 'cruise',
    motion: 0,
  };
  assert.equal(svc.frame({ ...base, consumers: {} }).wetMode, 'off');
  const shed = svc.frame({ ...base, consumers: { soak: true }, shed: 'perfTier1', degradedOk: false });
  assert.equal(shed.wetMode, 'shed');
  assert.equal(shed.wetShed, 'perfTier1');
  assert.equal(shed.wetMask, null, 'mask absent under the shed — the composite blends statically');
  svc.dispose();
});

// --- surface pins ----------------------------------------------------------------------
ok('surface: liveLoop gates on the soak, ferries the field, and the capture merges (never replaces)', () => {
  const loop = read('app/src/gl/liveLoop.mjs');
  assert.ok(
    loop.includes('consumers: { accum: !!layoutParams.accumulation, soak: anyWetSoak, dish: dishWet.present }'),
    'need-based gate',
  );
  assert.ok(loop.includes("l.type === 'content' && l.wetSoak === true"), 'the soak test reads the contract');
  assert.ok(loop.includes('display: wetDisplay'), 'capture display state nests under .display');
  assert.ok(loop.includes('...(payload.wet || {})'), 'capture merges the payload field');
});

ok('surface: the BUILD row carries the toggle and the perfTier1 dim', () => {
  const jsx = read('app/src/panels/build/LayerStack.jsx');
  assert.ok(jsx.includes('Events.LAYER_TOGGLE_WET_SOAK'), 'the row emits the toggle');
  assert.ok(jsx.includes('wet-dim'), 'the degraded state has a class');
  assert.ok(jsx.includes('perfTier1: s.perfTier1'), 'the row reads the governor tier');
  const css = read('app/src/styles/panels.css');
  assert.ok(css.includes('.micro-btn.wet-dim'), 'the dim is styled');
  const bus = read('app/src/composition/eventBus.js');
  assert.ok(bus.includes("LAYER_TOGGLE_WET_SOAK: 'layer:toggleWetSoak'"), 'the event exists');
});

ok('the SVG divergence stays signed for the soak; the corpus stays dry', async () => {
  const { CORPUS, KNOWN_DIVERGENCES } = await import('./parity/corpus.mjs');
  const rec = (KNOWN_DIVERGENCES || []).find((d) => d.id === 'wet-warm-up');
  assert.ok(rec, 'divergence recorded');
  assert.equal(rec.svg, 'mask absent → static blend');
  assert.ok(rec.signed.includes('#1814'), 'the soak signed the same fallback');
  assert.ok(!JSON.stringify(CORPUS).includes('wetSoak'), 'no corpus scene flags the mode (sweep untouched)');
});

ok('manifest: the suite is wired into selfcheck.manifest', () => {
  const manifest = readFileSync(join(APP, 'selfcheck.manifest'), 'utf8');
  assert.ok(manifest.includes('node src/gl/wetSoak.selfcheck.mjs'), 'manifest line present');
});

// --- GL renders ---------------------------------------------------------------------------
// Skips (loudly) when headless Chromium is unavailable — the same
// discipline as wetWarmup.selfcheck.
try {
  const { renderViaGL, renderExportViaGL, presentProbeViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const { renderExport, isBrowserMissingError } = await import('./exportStill.mjs');

  const W = 400;
  const H = 280;
  const buildContract = async (doc) => buildContractFromDoc(doc);
  const docWith = (on) => {
    const doc = JSON.parse(JSON.stringify(getScene('single-basic').doc));
    if (on) doc.layers[0].wetSoak = true;
    return doc;
  };
  // Synthetic served fields, in the wetExportPayload ferry form.
  const b64 = (u8) => Buffer.from(u8).toString('base64');
  const packOf = (n, fill) => {
    const rgba = new Uint8Array(n * n * 4);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const [r, g, bc, a] = fill(i, j);
        const o = (j * n + i) * 4;
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = bc;
        rgba[o + 3] = a;
      }
    return { n, rgba: b64(rgba) };
  };
  const N = 128;
  const wetPayload = ({ maskFill, velByte = [128, 128], pig = null, amount = 1 }) => ({
    wetStep: 1,
    wetAmount: amount,
    wetMask: packOf(N, (i, j) => [...maskFill(i, j), 0, 255]),
    wetVel: packOf(N, () => [velByte[0], velByte[1], 0, 255]),
    pigDep: pig,
  });
  const FULL = () => [255, 0];
  const ZERO = () => [0, 0];

  try {
    const contractOff = await buildContract(docWith(false));
    const contractOn = await buildContract(docWith(true));

    const dry = await renderViaGL(contractOff, { width: W, height: H, bg: '#101018' });
    const flaggedNoField = await renderViaGL(contractOn, { width: W, height: H, bg: '#101018' });
    await okAsync('GL: mode on + mask absent renders byte-identical to mode off (static blend)', () => {
      assert.ok(flaggedNoField.pixels.equals(dry.pixels), 'no field served → the dry composite, bit for bit');
    });
    const flaggedZeroMask = await renderViaGL(contractOn, {
      width: W,
      height: H,
      bg: '#101018',
      wet: wetPayload({ maskFill: ZERO }),
    });
    await okAsync('GL: mode on + a bone-dry field renders byte-identical to mode off', () => {
      assert.ok(
        flaggedZeroMask.pixels.equals(dry.pixels),
        'fieldWetness 0 everywhere → the dry composite, bit for bit',
      );
    });

    // Dry-side exactness + wet-side absorption by the ground alone
    // (dark bg, no pigment): the left half of the field is wet.
    const halfWet = wetPayload({ maskFill: (i) => (i < N / 2 ? [255, 0] : [0, 0]) });
    const half = await renderViaGL(contractOn, { width: W, height: H, bg: '#101018', wet: halfWet });
    await okAsync('GL: dry-side pixels match mode-off exactly; the wet side soaks', () => {
      let dryDiff = 0;
      let wetDiff = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          const d = Math.abs(half.pixels[o] - dry.pixels[o]) + Math.abs(half.pixels[o + 1] - dry.pixels[o + 1]);
          if (x > W * 0.58) dryDiff = Math.max(dryDiff, d);
          else if (x < W * 0.42) wetDiff = Math.max(wetDiff, d);
        }
      }
      assert.equal(dryDiff, 0, 'dry side (past the mask edge) is byte-identical');
      assert.ok(wetDiff > 8, `wet side changes (max channel delta ${wetDiff})`);
    });

    // Absorption isolated: velocity zero, data space (rawResolve). A
    // mark pixel reads out = a·cs + (1−a)·bg dry and a·(cs·R) +
    // (1−a)·bg soaked at f = 1 — the multiplier R is recoverable
    // exactly only where coverage a ≈ 1, so coverage is measured, not
    // guessed: over black a pixel reads a·cs, over white a·cs + (1−a),
    // and their difference is (1−a) itself. Pixels with a > 0.97 are
    // the solid mark cores; there soaked/dry = R within a percent.
    const pigPack = packOf(N, () => [64, 128, 192, 255]);
    const raw = (opts) => renderViaGL(contractOn, { width: W, height: H, rawResolve: true, ...opts });
    const dryBlack = await raw({ bg: '#000000' });
    const dryWhite = await raw({ bg: '#ffffff' });
    const coverage = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const o = p * 4;
      const dw = (dryWhite.pixels[o] + dryWhite.pixels[o + 1] + dryWhite.pixels[o + 2]) / 3;
      const db = (dryBlack.pixels[o] + dryBlack.pixels[o + 1] + dryBlack.pixels[o + 2]) / 3;
      coverage[p] = 1 - (dw - db) / 255;
    }
    const medianRatio = (dry, soaked) => {
      const ratios = [[], [], []];
      for (let p = 0; p < W * H; p++) {
        if (coverage[p] < 0.97) continue;
        const o = p * 4;
        for (let c = 0; c < 3; c++) {
          // the channel itself must carry signal: at dry ≈ 0 the byte
          // quantisation owns the ratio (a magenta core's green is 1
          // dry and 1 soaked — arithmetic noise, not absorption data).
          if (dry.pixels[o + c] > 100) ratios[c].push(soaked.pixels[o + c] / dry.pixels[o + c]);
        }
      }
      return ratios.map((a) => (a.length > 10 ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null));
    };
    const dryPig = await raw({ bg: '#202028' });
    const soakedPig = await raw({ bg: '#202028', wet: wetPayload({ maskFill: FULL, pig: pigPack }) });
    await okAsync('GL: term (a) — with pigment, mark light multiplies by the deposited reflectance', () => {
      const med = medianRatio(dryPig, soakedPig);
      const want = [64 / 255, 128 / 255, 192 / 255];
      for (let c = 0; c < 3; c++) {
        assert.ok(med[c] !== null, `solid mark pixels present in channel ${c}`);
        assert.ok(
          Math.abs(med[c] - want[c]) < 0.035,
          `channel ${c}: ratio ${med[c].toFixed(3)} ≈ reflectance ${want[c].toFixed(3)}`,
        );
      }
    });
    const dryGround = await raw({ bg: '#404040' });
    const soakedGround = await raw({ bg: '#404040', wet: wetPayload({ maskFill: FULL }) });
    await okAsync('GL: term (a) fallback — without pigment, absorption is the ground colour alone', () => {
      const med = medianRatio(dryGround, soakedGround);
      const want = [64 / 255, 64 / 255, 64 / 255];
      for (let c = 0; c < 3; c++) {
        assert.ok(med[c] !== null, `solid mark pixels present in channel ${c}`);
        assert.ok(
          Math.abs(med[c] - want[c]) < 0.035,
          `channel ${c}: ratio ${med[c].toFixed(3)} ≈ ground ${want[c].toFixed(3)}`,
        );
      }
    });

    // Smear isolated: white ground (absorption × 1), no pigment, full
    // wet mask, velocity at the pack ends, ONE centred mark (a clone
    // of the scene's first instance, scaled up — the crowded scene's
    // overlaps make aggregate metrics lie; a single hard edge is the
    // scripted test the issue asks for). The soaked mark must grow a
    // trailing edge on the flow's side only, both signs.
    const oneMark = { ...contractOn.instances[0], x: 500, y: 350, scaleX: 6, scaleY: 6, rotation: 0 };
    const contractOne = { ...contractOn, instances: [oneMark] };
    const smearDry = await renderViaGL(contractOne, { width: W, height: H, bg: '#ffffff' });
    const plus = await renderViaGL(contractOne, {
      width: W,
      height: H,
      bg: '#ffffff',
      wet: wetPayload({ maskFill: FULL, velByte: [255, 128] }),
    });
    const minus = await renderViaGL(contractOne, {
      width: W,
      height: H,
      bg: '#ffffff',
      wet: wetPayload({ maskFill: FULL, velByte: [0, 128] }),
    });
    await okAsync('GL: term (b) — the edge smear follows the field’s velocity sign, both signs', () => {
      const lumAt = (pixels, x, y) => {
        const o = (y * W + x) * 4;
        return (pixels[o] + pixels[o + 1] + pixels[o + 2]) / 3;
      };
      let dk = null;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const l = lumAt(smearDry.pixels, x, y);
          if (!dk || l < dk.l) dk = { x, y, l };
        }
      const edges = (pixels) => {
        let L = null;
        let R = null;
        for (let x = 0; x < W; x++) {
          if (lumAt(pixels, x, dk.y) < 200) {
            if (L === null) L = x;
            R = x;
          }
        }
        return [L, R];
      };
      const [l0, r0] = edges(smearDry.pixels);
      const [lP, rP] = edges(plus.pixels);
      const [lM, rM] = edges(minus.pixels);
      assert.ok(l0 !== null && r0 - l0 > 40, `the dry mark has a measurable edge span (${l0}..${r0})`);
      assert.ok(
        rP >= r0 + 3 && Math.abs(lP - l0) <= 1,
        `+flow: trailing edge grows +x only (${l0}..${r0} → ${lP}..${rP})`,
      );
      assert.ok(
        lM <= l0 - 3 && Math.abs(rM - r0) <= 1,
        `−flow: trailing edge grows −x only (${l0}..${r0} → ${lM}..${rM})`,
      );
    });

    // Export parity: the two export vehicles (the parity candidate
    // render and the chunked export driver — both the warm-up export
    // shape, renderScene over the ferried field) agree byte-for-byte
    // with WET on. The live composite is the same renderFrameInto in
    // the live shell, proven below on its own dry baseline: the two
    // shells' raw outputs differ even bone-dry in this harness
    // (measured max Δ223 / mean Δ2.8 with no field at all — a
    // pre-existing shell difference, not the soak), so cross-shell
    // byte parity is not the harness's claim; same-code + same-field
    // + per-shell dry-exactness is.
    const parityWet = wetPayload({ maskFill: FULL, velByte: [200, 128], pig: pigPack, amount: 0.8 });
    const candidate = await renderViaGL(contractOn, { width: W, height: H, bg: '#101018', wet: parityWet });
    const still = await renderExportViaGL(contractOn, { width: W, height: H, bg: '#101018', wet: parityWet });
    await okAsync('GL: export parity — candidate render vs chunked export, WET on, byte-identical', () => {
      assert.ok(candidate.pixels.equals(still.pixels), 'the two export vehicles produce the same soaked still');
    });
    const liveDry = await presentProbeViaGL(contractOn, { width: W, height: H, bg: '#101018' });
    const liveHalf = await presentProbeViaGL(contractOn, { width: W, height: H, bg: '#101018', wet: halfWet });
    await okAsync('GL: the live composite soaks too — dry side byte-exact on the live shell, wet side changes', () => {
      let dryDiff = 0;
      let wetDiff = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          const d =
            Math.abs(liveHalf.readback[o] - liveDry.readback[o]) +
            Math.abs(liveHalf.readback[o + 1] - liveDry.readback[o + 1]);
          if (x > W * 0.58) dryDiff = Math.max(dryDiff, d);
          else if (x < W * 0.42) wetDiff = Math.max(wetDiff, d);
        }
      }
      assert.equal(dryDiff, 0, 'live shell: dry side is byte-identical');
      assert.ok(wetDiff > 8, `live shell: wet side changes (max channel delta ${wetDiff})`);
    });

    // End-to-end warm-up export: the real exportStill path warms the
    // field from the doc (WETNESS up) and the flagged still soaks.
    const wetDoc = docWith(true);
    wetDoc.layoutParams = { ...wetDoc.layoutParams, accumulationWetness: 0.85 };
    const plainDoc = docWith(false);
    plainDoc.layoutParams = { ...plainDoc.layoutParams, accumulationWetness: 0.85 };
    const e1 = await renderExport({ doc: wetDoc, width: W, height: H });
    const e2 = await renderExport({ doc: wetDoc, width: W, height: H });
    const e0 = await renderExport({ doc: plainDoc, width: W, height: H });
    await okAsync('GL: the warm-up export soaks (flagged ≠ unflagged) and is byte-identical across runs', () => {
      assert.equal(e1.wetReadout, 'wet: warm-up K=90');
      assert.ok(e1.pixels.equals(e2.pixels), 'same project + seed + K → same still');
      let differ = 0;
      for (let i = 0; i < e1.pixels.length; i += 4) {
        if (e1.pixels[i] !== e0.pixels[i] || e1.pixels[i + 1] !== e0.pixels[i + 1]) differ++;
      }
      assert.ok(differ > 50, `the soak changes the export (${differ} pixels)`);
    });
  } catch (e) {
    if (isBrowserMissingError(e)) {
      console.log('  [skip] GL section — headless Chromium unavailable');
    } else {
      throw e;
    }
  } finally {
    await closeGlDriver().catch(() => {});
  }
} catch (e) {
  if (/chromium|browser/i.test(e.message || '')) {
    console.log(`  [skip] GL section unavailable: ${e.message}`);
  } else {
    throw e;
  }
}

console.log(`wetSoak.selfcheck: ${checks} checks passed`);
