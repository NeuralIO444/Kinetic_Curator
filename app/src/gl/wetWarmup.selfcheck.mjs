// wetWarmup.selfcheck.mjs — #1815: warm-up exports, the stills contract.
//
// The issue's acceptance, pinned:
//  (1) two runs of the same export — any call site — are byte-identical
//      (the warmed field hashes identically; the GL sections below hash
//      the rendered pixels too);
//  (2) cross-site parity: exportStill and accumStill derive the field
//      through the ONE derivation (warmUpForScene) — pinned here at the
//      field level and by source, so the sites cannot skew;
//  (3) the live-only doctrine text is gone from the vortex header and
//      the BUGLIST WETNESS row, replaced by the warm-up contract;
//  (4) the warm-up's timing at the 128-grid constants sits under the
//      pinned ceiling (WET_WARMUP_CEILING_MS), logged;
//  (5) WETNESS = 0 projects skip the warm-up entirely (null) and the
//      dry export still equals the shared candidate render byte-for-byte
//      (the pre-#1815 path, structurally untouched).
// Plus the spine's standing laws: the pigment deposit — edge darkening
// included — is field state and warms up with the field (the K=90
// deposit differs from a K=1 stamp: it dried on the way), and the SVG
// divergence is a signed record in the parity harness, not a failure.
//
// The renderFrameOffscreen arm is source-pinned here (liveLoop hands
// the capture frame's served field to the renderer; the renderer runs
// applyWetLookTo from the payload state) — its pixel path is the same
// program/constants as renderScene's, which the GL section exercises.
import assert from 'node:assert';
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
  WET_WARMUP_STEPS,
  WET_WARMUP_CEILING_MS,
  WET_WARMUP_READOUT,
  warmUpWetField,
  warmUpForScene,
  wetLayoutParamsOf,
  wetExportPayload,
  hashWetField,
} = await import('./wetWarmup.mjs');
const { createWetFrameService } = await import('./wetFrame.mjs');
const { motionAmount } = await import('./vortex.mjs');

// Scripted field inputs: 24 tinted marks on a grid (contract-shaped —
// tint hex, no velocities; a still's instances carry none).
const INSTANCES = [];
for (let i = 0; i < 24; i++) {
  INSTANCES.push({
    x: 80 + (i % 6) * 170,
    y: 90 + Math.floor(i / 6) * 170,
    tint: ['#2255cc', '#e8c832', '#cc3333'][i % 3],
  });
}
const BASE = { seed: 7, width: 1000, height: 700, instances: INSTANCES, behave: 'cruise', motion: 0.35, wetness: 0.85 };

// --- the recipe constants -------------------------------------------------------
ok('K is the documented recipe constant and the readout names it', () => {
  assert.equal(WET_WARMUP_STEPS, 90);
  assert.equal(WET_WARMUP_READOUT, 'wet: warm-up K=90');
  assert.equal(WET_WARMUP_CEILING_MS, 2000);
});

// --- dry projects skip the warm-up entirely --------------------------------------
ok('WETNESS = 0 serves null — no warm-up, no field; any wetness > 0 serves (the sim gate)', () => {
  assert.equal(warmUpWetField({ ...BASE, wetness: 0 }), null);
  assert.equal(warmUpForScene({ seed: 7, canvas: { w: 1000, h: 700 }, instances: INSTANCES, layoutParams: {} }), null);
  // wetnessStep is binary (wetness > 0 steps; the regimes shape the
  // amount) — a hair of wetness warms a field, exactly as live serves one.
  assert.ok(warmUpWetField({ ...BASE, wetness: 0.02 }) !== null);
});

// --- byte-identical field, any run ------------------------------------------------
ok('two warm-ups over the same inputs are byte-identical (packs + hash)', () => {
  const a = warmUpWetField(BASE);
  const b = warmUpWetField(BASE);
  assert.ok(a && a.wetStep === 1 && a.wetMask && a.wetVel);
  assert.equal(a.readout, WET_WARMUP_READOUT);
  assert.equal(a.steps, WET_WARMUP_STEPS);
  assert.equal(hashWetField(a), hashWetField(b));
  assert.ok(Buffer.from(a.wetVel.rgba).equals(Buffer.from(b.wetVel.rgba)), 'velocity pack identical');
  assert.ok(Buffer.from(a.wetMask.rgba).equals(Buffer.from(b.wetMask.rgba)), 'mask pack identical');
  assert.ok(Buffer.from(a.pigDep.rgba).equals(Buffer.from(b.pigDep.rgba)), 'pigment pack identical');
});

ok('the seed is an input: a different seed warms a different field', () => {
  assert.notEqual(hashWetField(warmUpWetField({ ...BASE, seed: 8 })), hashWetField(warmUpWetField(BASE)));
});

ok('the helper IS the service, K times — a manual K-frame run matches byte-for-byte', () => {
  const svc = createWetFrameService();
  let served = null;
  try {
    for (let i = 0; i < WET_WARMUP_STEPS; i++) {
      served = svc.frame({
        consumers: { warmup: true },
        wetness: BASE.wetness,
        freeze: false,
        seed: BASE.seed,
        width: BASE.width,
        height: BASE.height,
        instances: BASE.instances,
        behave: BASE.behave,
        motion: BASE.motion,
      });
    }
  } finally {
    svc.dispose();
  }
  assert.equal(hashWetField(served), hashWetField(warmUpWetField(BASE)));
});

ok('the rehearsal matters: K=90 is not a fresh stamp (K=1 differs, pigment included)', () => {
  const k1 = warmUpWetField({ ...BASE, steps: 1 });
  const k90 = warmUpWetField(BASE);
  assert.notEqual(hashWetField(k1), hashWetField(k90));
  // Pigment + edge darkening are field state: after 90 steps the deposit
  // has settled and dried (edge accrued crossing the damp band), so the
  // deposited pack itself differs — the still consumes it as served.
  assert.equal(k90.pigStep, 1);
  assert.ok(!Buffer.from(k1.pigDep.rgba).equals(Buffer.from(k90.pigDep.rgba)), 'deposit dried during the warm-up');
});

// --- the one derivation every still site shares -----------------------------------
ok('warmUpForScene derives exactly the manual inputs (cross-site parity mechanism)', () => {
  const lp = { accumulationWetness: 0.85, behave: 'cruise', wind: 0.4, breath: 0.2, flap: 0.1 };
  const viaScene = warmUpForScene({
    seed: 7,
    canvas: { w: 1000, h: 700 },
    instances: INSTANCES,
    layoutParams: lp,
  });
  const manual = warmUpWetField({
    seed: 7,
    width: 1000,
    height: 700,
    instances: INSTANCES,
    behave: 'cruise',
    motion: motionAmount(lp),
    wetness: 0.85,
  });
  assert.equal(hashWetField(viaScene), hashWetField(manual));
});

ok('wetLayoutParamsOf takes the first non-FX layer carrying layout params', () => {
  const lp = { accumulationWetness: 0.5 };
  assert.equal(wetLayoutParamsOf([{ isFx: true, layoutParams: { accumulationWetness: 1 } }, { layoutParams: lp }]), lp);
  assert.equal(wetLayoutParamsOf([{ layoutParams: lp, isFx: true }, { layoutParams: lp }]), lp);
  assert.equal(wetLayoutParamsOf([]), null);
  assert.equal(wetLayoutParamsOf(null), null);
});

ok('both still entrypoints derive through warmUpForScene (source pin)', () => {
  assert.ok(
    read('app/src/gl/exportStill.mjs').includes('warmUpForScene'),
    'exportStill warms via the shared derivation',
  );
  assert.ok(read('app/src/gl/accumStill.mjs').includes('warmUpForScene'), 'accumStill warms via the shared derivation');
});

ok('wetExportPayload carries the recipe terms + the #1813 display state (ground parsed the fade way)', () => {
  const served = warmUpWetField(BASE);
  const payload = wetExportPayload(served, '#101018');
  assert.equal(payload.wetStep, 1);
  assert.equal(payload.pigStep, 1);
  assert.equal(typeof payload.wetVel.rgba, 'string', 'packs cross base64');
  assert.equal(payload.display.mask.n, served.wetMask.n);
  assert.equal(payload.display.amount, served.wetAmount);
  assert.deepEqual(payload.display.bg, [16 / 255, 16 / 255, 24 / 255]);
  assert.equal(payload.readout, WET_WARMUP_READOUT);
  assert.equal(wetExportPayload(null, '#000000'), null);
});

// --- the three call sites consume the field ---------------------------------------
ok('call sites: renderScene, renderAccumSequence, renderFrameOffscreen all consume wet (source pins)', () => {
  const renderer = read('app/src/gl/renderer.mjs');
  assert.ok(renderer.includes('applyStillWetLook'), 'one-shot renderer runs the still wet-look pass');
  assert.ok(renderer.includes('payload.wet.display'), 'renderScene reads the payload display state');
  assert.ok(
    renderer.includes('wet.display ? applyStillWetLook(T, finalTex'),
    'the accum sequence finishes through the pass',
  );
  assert.ok(renderer.includes('wetStep: wet.wetStep'), 'the sequence recipe takes the warmed wet terms');
  assert.ok(
    renderer.includes('applyWetLookTo(OT, finished, payload.wet.display)'),
    'renderFrameOffscreen runs the pass from the payload display state (#1814: payload.wet is the one wet shape — field packs + .display)',
  );
  const loop = read('app/src/gl/liveLoop.mjs');
  assert.equal(
    (loop.match(/wetGroundFromCss\(bgCss\)/g) || []).length,
    2,
    'liveLoop assembles the display state twice: the tick (setWetLook) and the capture',
  );
  const harness = read('app/src/gl/parity/glHarness.html');
  assert.ok(harness.includes('decodeWet(payload.wet)'), 'the harness decodes the ferried field for both still paths');
});

// --- doctrine: live-only text replaced by the warm-up contract ---------------------
ok('the live-only doctrine is gone from the header/docs, replaced by the warm-up contract', () => {
  const vortex = read('app/src/gl/vortex.mjs');
  assert.ok(!vortex.includes('a wet still will not match the live frame'), 'vortex header: old doctrine gone');
  assert.ok(vortex.includes('warm-up of K = 90 steps'), 'vortex header: warm-up contract stands');
  const buglist = read('docs/BUGLIST.md');
  const wetRow = buglist.split('\n').find((l) => l.includes('**WETNESS**'));
  assert.ok(
    wetRow && wetRow.includes('warm-up') && wetRow.includes('K=90'),
    'BUGLIST WETNESS row states the warm-up contract',
  );
  assert.ok(!wetRow.includes('Live-only'), 'BUGLIST WETNESS row: no longer live-only');
});

// --- SVG divergence: signed in the harness, corpus stays dry -----------------------
await okAsync('the SVG divergence is a signed record; the parity corpus never warms a field', async () => {
  const { CORPUS, KNOWN_DIVERGENCES } = await import('./parity/corpus.mjs');
  const rec = (KNOWN_DIVERGENCES || []).find((d) => d.id === 'wet-warm-up');
  assert.ok(rec, 'divergence recorded in the parity harness');
  assert.equal(rec.svg, 'mask absent → static blend');
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');
  for (const scene of CORPUS) {
    const caps = getRenderCaps(scene.doc.quality || 'balanced', false);
    for (const layer of resolveLayers(scene.doc, { caps })) {
      assert.ok(
        !(Number(layer.layoutParams?.accumulationWetness) > 0),
        `corpus scene ${scene.id} stays dry (WETNESS 0)`,
      );
    }
  }
});

// --- timing: under the pinned ceiling at the shipped constants ---------------------
ok('warm-up timing at the 128-grid constants is under the pinned ceiling', () => {
  // Still-shaped inputs: 48 tinted instances, no velocities (a still's
  // contract instances carry none), default layout motion.
  const inst = [];
  for (let i = 0; i < 48; i++) {
    inst.push({
      x: 40 + (i % 8) * 130,
      y: 60 + Math.floor(i / 8) * 110,
      tint: ['#2255cc', '#e8c832', '#cc3333'][i % 3],
    });
  }
  const input = { seed: 7, width: 1000, height: 700, instances: inst, behave: 'cruise', motion: 0.35, wetness: 0.95 };
  warmUpWetField(input); // JIT warm
  const t0 = performance.now();
  const served = warmUpWetField(input);
  const ms = performance.now() - t0;
  console.log(
    `  warm-up timing: K=${WET_WARMUP_STEPS} at 128-grid constants took ${ms.toFixed(1)} ms (ceiling ${WET_WARMUP_CEILING_MS} ms)`,
  );
  assert.ok(served && served.wetStep === 1);
  assert.ok(ms < WET_WARMUP_CEILING_MS, `warm-up ${ms.toFixed(1)} ms exceeds the ${WET_WARMUP_CEILING_MS} ms ceiling`);
});

ok('manifest: the suite is wired into selfcheck.manifest', () => {
  const manifest = readFileSync(join(APP, 'selfcheck.manifest'), 'utf8');
  assert.ok(manifest.includes('node src/gl/wetWarmup.selfcheck.mjs'), 'manifest line present');
});

// --- GL: the rendered stills --------------------------------------------------------
// Skips (loudly) when headless Chromium is unavailable — the same
// discipline as exportStill.selfcheck.
try {
  const { getScene } = await import('./parity/corpus.mjs');
  const { renderExport, isBrowserMissingError } = await import('./exportStill.mjs');
  const { renderCandidate, closeCandidate } = await import('./candidate.mjs');
  const { buildSceneContract } = await import('./sceneContract.js');
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');
  const { renderAccumViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');

  const W = 200;
  const H = 140;
  const wetDoc = () => {
    const doc = JSON.parse(JSON.stringify(getScene('single-basic').doc));
    doc.layoutParams = { ...doc.layoutParams, accumulationWetness: 0.85 };
    return doc;
  };
  const dryDoc = () => {
    const doc = JSON.parse(JSON.stringify(getScene('single-basic').doc));
    doc.layoutParams = { ...doc.layoutParams, accumulationWetness: 0 };
    return doc;
  };
  const differFrac = (a, b) => {
    let differ = 0;
    const px = Math.min(a.length, b.length) / 4;
    for (let i = 0; i < px; i++) {
      if (a[i * 4] !== b[i * 4] || a[i * 4 + 1] !== b[i * 4 + 1] || a[i * 4 + 2] !== b[i * 4 + 2]) differ++;
    }
    return differ / px;
  };

  try {
    const wet1 = await renderExport({ doc: wetDoc(), width: W, height: H });
    await okAsync('GL: a wet export names its warm-up in the readout', () => {
      assert.equal(wet1.wetReadout, 'wet: warm-up K=90');
    });
    const wet2 = await renderExport({ doc: wetDoc(), width: W, height: H });
    await okAsync('GL: two runs of the same wet export are byte-identical', () => {
      assert.ok(wet1.pixels.equals(wet2.pixels), 'same project + seed + K → same still');
    });
    const dry = await renderExport({ doc: dryDoc(), width: W, height: H });
    await okAsync('GL: the wet contribution is in the picture (wet ≠ dry render)', () => {
      assert.equal(dry.wetReadout, null);
      const f = differFrac(wet1.pixels, dry.pixels);
      assert.ok(f > 0.001, `wet and dry stills differ on ${(f * 100).toFixed(2)}% of pixels`);
    });
    const dryCandidate = await renderCandidate({ doc: dryDoc() }, { width: W });
    await okAsync('GL: WETNESS = 0 exports byte-identical to the shared candidate path (pre-#1815 behaviour)', () => {
      assert.ok(dry.pixels.equals(dryCandidate.pixels), 'dry export === candidate render');
    });

    // The accumStill sequence path: contracts built the way accumStill
    // builds them (progress-varying, accum enabled), the field warmed
    // from frame 0 and held.
    const doc = wetDoc();
    const caps = getRenderCaps(doc.quality || 'balanced', false);
    const firstLayers = resolveLayers(doc, { caps, progress: 0 });
    const frames = [0, 0.5, 1].map((progress) =>
      buildSceneContract({
        doc,
        resolvedLayers: resolveLayers(doc, { caps, progress }),
        caps,
        accum: { enabled: true, fade: 0.88, background: '#000000' },
      }),
    );
    const served = warmUpForScene({
      seed: frames[0].seed || 0,
      canvas: frames[0].canvas,
      instances: frames[0].instances,
      layoutParams: wetLayoutParamsOf(firstLayers),
    });
    const bg = firstLayers[0]?.palette?.bg || '#000000';
    const wetPayload = wetExportPayload(served, bg);
    const seqWet1 = await renderAccumViaGL(frames, { width: W, height: H, bg, wet: wetPayload });
    const seqWet2 = await renderAccumViaGL(frames, { width: W, height: H, bg, wet: wetPayload });
    await okAsync('GL: two runs of the same wet accum sequence are byte-identical', () => {
      assert.ok(seqWet1.pixels.equals(seqWet2.pixels));
    });
    const seqDry = await renderAccumViaGL(frames, { width: W, height: H, bg });
    await okAsync('GL: the held field changes the sequence (wet sequence ≠ dry sequence)', () => {
      const f = differFrac(seqWet1.pixels, seqDry.pixels);
      assert.ok(f > 0.001, `wet and dry sequences differ on ${(f * 100).toFixed(2)}% of pixels`);
    });
  } catch (e) {
    if (!isBrowserMissingError(e)) throw e;
    console.log('  [skip] GL section — headless Chromium unavailable');
  } finally {
    await closeCandidate().catch(() => {});
    await closeGlDriver().catch(() => {});
  }
} catch (e) {
  // Only a genuinely missing browser may skip the section; anything
  // else is a failure and must surface as one.
  if (/chromium|browser/i.test(e.message || '')) {
    console.log(`  [skip] GL section unavailable: ${e.message}`);
  } else {
    throw e;
  }
}

console.log(`wetWarmup.selfcheck: ${checks} checks passed`);
