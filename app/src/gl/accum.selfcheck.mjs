// accum.selfcheck.mjs — Phase 4 ACCUM on GPU + bloom (#190, absorbs #169).
//
// Node-only: recipe param mapping (fade/optics clamps, off-by-default),
// sanitizeAccumOptics, contract accum.optics sanitization, and the JS mirror
// (mirrorAccumStep) sanity — fade decay, over composite, no-bloom-at-zero.
//
// Browser (skipped when the Playwright browser is absent): the GPU recipe
// through accumProbe.html on synthetic frames vs the JS mirror — ping-pong
// feedback actually accumulates, fade decays light toward black, optics > 0
// visibly blooms (bright pixel bleeds to neighbors), optics = 0 bleeds
// nothing. Plus an end-to-end renderAccumViaGL trail still on a corpus doc
// with motion (frames differ -> trails; lower fade -> dimmer trails).
import assert from 'node:assert';
import {
  ACCUM_VERSION,
  accumRecipeParams,
  sanitizeAccumOptics,
  mirrorAccumStep,
} from './accum.mjs';
import { buildSceneContract } from './sceneContract.js';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const okAsync = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };

ok('recipe params: defaults and clamps', () => {
  assert.equal(ACCUM_VERSION, 1);
  const d = accumRecipeParams();
  assert.equal(d.keep, 0.88);
  assert.equal(d.optics, 0);
  assert.equal(d.bloomAmount, 0);
  assert.equal(d.halationAmount, 0);
  assert.equal(d.frameBlurSigma, 0);
  assert.deepEqual(accumRecipeParams({ fade: 2 }).keep, 0.99, 'fade clamps at 0.99');
  assert.deepEqual(accumRecipeParams({ fade: -1 }).keep, 0, 'fade clamps at 0');
  assert.deepEqual(accumRecipeParams({ optics: 2 }).optics, 1, 'optics clamps at 1');
  assert.deepEqual(accumRecipeParams({ optics: 'bogus' }).optics, 0, 'optics NaN -> 0');
});

ok('recipe params: one optics amount drives bloom + halation + blur-over-time', () => {
  const p = accumRecipeParams({ fade: 0.9, optics: 1 });
  assert.ok(p.bloomAmount > 0 && p.halationAmount > 0 && p.frameBlurSigma > 0);
  assert.ok(p.halationSigma > p.bloomSigma, 'halation blur is wider than bloom (#169)');
  const [r, g, b] = p.halationTint;
  assert.ok(r >= g && g > b, `halation tint is red/warm biased, got [${r},${g},${b}]`);
  const half = accumRecipeParams({ optics: 0.5 });
  assert.ok(half.bloomAmount < p.bloomAmount, 'amount scales with the slider');
});

ok('sanitizeAccumOptics clamps to 0..1', () => {
  assert.equal(sanitizeAccumOptics(0.5), 0.5);
  assert.equal(sanitizeAccumOptics(7), 1);
  assert.equal(sanitizeAccumOptics(-2), 0);
  assert.equal(sanitizeAccumOptics(NaN), 0);
  assert.equal(sanitizeAccumOptics(undefined), 0);
});

const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, true]));
const caps = getRenderCaps('balanced', false);
function fixtureDoc() {
  return {
    version: 1, seed: 4242, paletteId: 'praystation', paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, count: 16, lifeDrift: 0 },
    enabledAssets, quality: 'balanced',
    layers: [{ id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'bg',
  };
}

ok('contract carries sanitized accum.optics (additive, no version bump)', () => {
  const doc = fixtureDoc();
  const rl = resolveLayers(doc, { caps });
  const c = buildSceneContract({ doc, resolvedLayers: rl, caps, accum: { enabled: true, fade: 0.9, optics: 0.5, background: '#112233' } });
  assert.equal(c.accum.enabled, true);
  assert.equal(c.accum.fade, 0.9);
  assert.equal(c.accum.optics, 0.5);
  assert.equal(c.accum.background, '#112233');
  const cl = buildSceneContract({ doc, resolvedLayers: rl, caps, accum: { enabled: true, optics: 9 } });
  assert.equal(cl.accum.optics, 1, 'optics clamps at the contract boundary');
  const off = buildSceneContract({ doc, resolvedLayers: rl, caps });
  assert.equal(off.accum, null, 'no accum -> null (renderer stays on the plain path)');
});

// --- mirror sanity (float64, hand-computed expectations) --------------------

const W = 8, H = 8, N4 = W * H * 4;
const f64 = (fill) => { const a = new Float64Array(N4); if (fill) a.fill(fill); return a; };
const px = (buf, x, y) => [0, 1, 2, 3].map((c) => buf[(y * W + x) * 4 + c]);

ok('mirror: fade-only step matches hand math', () => {
  const accum = f64(0); // black transparent buffer start
  const frame = f64(0);
  const o = 3 * 4; // pixel (3,0)
  frame[o] = 1; frame[o + 1] = 0.5; frame[o + 2] = 0.25; frame[o + 3] = 1;
  const out = mirrorAccumStep({ accum, frame, w: W, h: H, params: accumRecipeParams({ fade: 0.8, optics: 0 }) });
  assert.deepEqual(px(out, 3, 0), [1, 0.5, 0.25, 1], 'opaque frame lands via over');
  assert.deepEqual(px(out, 0, 0), [0, 0, 0, 0], 'untouched pixels stay empty');
  // Second step with an empty frame: light decays toward black, alpha kept.
  const out2 = mirrorAccumStep({ accum: out, frame: f64(0), w: W, h: H, params: accumRecipeParams({ fade: 0.8, optics: 0 }) });
  const [r, g, b, a] = px(out2, 3, 0);
  assert.ok(Math.abs(r - 0.8) < 1e-12 && Math.abs(g - 0.4) < 1e-12 && Math.abs(b - 0.2) < 1e-12, `fade *= keep, got ${r},${g},${b}`);
  assert.equal(a, 1, 'alpha is not faded');
});

ok('mirror: optics 0 blooms nothing', () => {
  const accum = f64(0);
  const frame = f64(0);
  const o = (4 * W + 4) * 4;
  frame[o] = 1; frame[o + 3] = 1;
  const out = mirrorAccumStep({ accum, frame, w: W, h: H, params: accumRecipeParams({ fade: 1, optics: 0 }) });
  assert.deepEqual(px(out, 6, 4), [0, 0, 0, 0], 'no bleed two pixels away at optics 0');
  assert.deepEqual(px(out, 4, 4)[0], 1);
});

// --- browser: GPU recipe vs JS mirror ---------------------------------------

async function runBrowserTests() {
  const { openHarnessPage, renderAccumViaGL, renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const { page, close } = await openHarnessPage('/parity/accumProbe.html');
  try {
    const bytesOf = (f64buf) => {
      const b = new Array(f64buf.length);
      for (let i = 0; i < f64buf.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(f64buf[i] * 255)));
      return b;
    };
    const f64Of = (bytes) => Float64Array.from(bytes, (v) => v / 255);
    const LSB = 1 / 255;

    const runProbe = async ({ w = 12, h = 12, bg = '#000000', fade = 0.9, optics = 0, frames }) => {
      const res = await page.evaluate((p) => window.__kcAccumProbe(p), {
        w, h, bg, fade, optics, frames: frames.map(bytesOf),
      });
      return { gpu: f64Of(res.pixels), w: res.width, h: res.height };
    };
    const mirrorSeq = ({ w, h, bg, fade, optics, frames }) => {
      const bgV = [0, 1, 2].map((i) => parseInt(bg.slice(1 + i * 2, 3 + i * 2), 16) / 255);
      let acc = new Float64Array(w * h * 4);
      for (let i = 0; i < w * h; i++) { acc[i * 4] = bgV[0]; acc[i * 4 + 1] = bgV[1]; acc[i * 4 + 2] = bgV[2]; acc[i * 4 + 3] = 1; }
      const params = accumRecipeParams({ fade, optics });
      for (const f of frames) acc = mirrorAccumStep({ accum: acc, frame: f, w, h, params });
      return acc;
    };
    const closeTo = (gpu, ref, tol, what) => {
      let worst = 0;
      for (let i = 0; i < gpu.length; i++) worst = Math.max(worst, Math.abs(gpu[i] - ref[i]));
      assert.ok(worst <= tol, `${what}: worst Δ ${worst.toFixed(4)} > tol ${tol.toFixed(4)}`);
    };
    const whiteDot = (w, h, x, y) => {
      const f = new Float64Array(w * h * 4);
      const o = (y * w + x) * 4;
      f[o] = 1; f[o + 1] = 1; f[o + 2] = 1; f[o + 3] = 1;
      return f;
    };
    const whiteBlock = (w, h, x, y, s, v = 1) => {
      const f = new Float64Array(w * h * 4);
      for (let j = 0; j < s; j++) {
        for (let i = 0; i < s; i++) {
          const o = ((y + j) * w + x + i) * 4;
          f[o] = v; f[o + 1] = v; f[o + 2] = v; f[o + 3] = 1;
        }
      }
      return f;
    };

    await okAsync('probe: ping-pong feedback accumulates across frames (GPU = mirror)', async () => {
      const w = 12, h = 12, fade = 0.9;
      const frames = [whiteDot(w, h, 3, 3), whiteDot(w, h, 8, 8), new Float64Array(w * h * 4)];
      const { gpu } = await runProbe({ w, h, fade, optics: 0, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade, optics: 0, frames });
      closeTo(gpu, ref, 3 * LSB, '3-frame accum sequence');
      const dot = (buf, x, y) => buf[(y * w + x) * 4];
      assert.ok(dot(gpu, 3, 3) < dot(gpu, 8, 8), 'older trail is dimmer (fade decay)');
      assert.ok(dot(gpu, 8, 8) > 0.5, 'newer mark is brighter');
    });

    await okAsync('probe: optics 0 = no bloom bleed (off by default)', async () => {
      const w = 12, h = 12;
      const frames = [whiteDot(w, h, 6, 6)];
      const { gpu } = await runProbe({ w, h, fade: 1, optics: 0, frames });
      const far = (x, y) => gpu[(y * w + x) * 4];
      assert.equal(far(9, 6), 0, 'no light three pixels away at optics 0');
      assert.equal(far(6, 9), 0, 'no light three pixels away at optics 0');
    });

    await okAsync('probe: optics 1 visibly blooms (GPU = mirror)', async () => {
      // 64x64: a realistic scale for the recipe's blur sigmas (σ=5 incoming
      // blur is extreme on a 12px canvas, mild on a real canvas).
      const w = 64, h = 64;
      // Mid-gray block: nothing saturates the 8-bit readback, so the light
      // bloom/halation add stays measurable.
      const frames = [whiteBlock(w, h, 28, 28, 8, 0.5)];
      const { gpu } = await runProbe({ w, h, fade: 1, optics: 1, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 1, optics: 1, frames });
      closeTo(gpu, ref, 4 * LSB, 'bloom step');
      const at = (x, y) => gpu[(y * w + x) * 4];
      assert.ok(at(40, 32) > 0.01, `bloom bleeds eight pixels past the block, got ${at(40, 32).toFixed(3)}`);
      const sum = (buf) => { let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i + 1] + buf[i + 2]; return s; };
      const plain = await runProbe({ w, h, fade: 1, optics: 0, frames });
      assert.ok(sum(gpu) > sum(plain.gpu) * 1.01, 'bloom + halation add light (not just redistribute)');
      // Warm bias: halation adds more red than blue.
      const hal = (buf) => { let r = 0, b = 0; for (let i = 0; i < buf.length; i += 4) { r += buf[i]; b += buf[i + 2]; } return r - b; };
      assert.ok(hal(gpu) > hal(plain.gpu), 'optics shift the added light warm/red');
    });

    await okAsync('probe: fade 0 kills trails', async () => {
      const w = 12, h = 12;
      const frames = [whiteDot(w, h, 6, 6), new Float64Array(w * h * 4)];
      const { gpu } = await runProbe({ w, h, fade: 0, optics: 0, frames });
      const at = (x, y) => gpu[(y * w + x) * 4];
      assert.equal(at(6, 6), 0, 'keep=0 erases the previous frame');
    });

    await okAsync('e2e: renderAccumViaGL trail still on a corpus doc with motion', async () => {
      const { getScene } = await import('./parity/corpus.mjs');
      const { buildSceneContract: bsc } = await import('./sceneContract.js');
      const doc = getScene('single-basic').doc;
      const frames = [];
      for (const progress of [0, 0.5, 1]) {
        const rl = resolveLayers(doc, { caps, motion: 'auto', progress });
        frames.push(bsc({ doc, resolvedLayers: rl, caps, accum: { enabled: true, fade: 0.9, optics: 0.4, background: '#000000' } }));
      }
      const { pixels, width, height } = await renderAccumViaGL(frames, { width: 200, height: 140, fade: 0.9, optics: 0.4 });
      assert.equal(width, 200);
      assert.equal(height, 140);
      assert.equal(pixels.length, 200 * 140 * 4);
      const single = await renderViaGL(frames[2], { width: 200, height: 140 });
      assert.ok(!pixels.equals(single.pixels), 'trail still differs from the last frame alone');
      // optics=0: fade + over only. Any difference from the last frame alone
      // MUST be trails (no bloom/blur to hide behind). Opaque input frames
      // would erase trails here (OVER with s.a=1 -> o=s).
      const sharp = await renderAccumViaGL(frames, { width: 200, height: 140, fade: 0.9, optics: 0 });
      assert.ok(!sharp.pixels.equals(single.pixels), 'optics=0: trails accumulate (differs from last frame)');
      const dim = await renderAccumViaGL(frames, { width: 200, height: 140, fade: 0.5, optics: 0 });
      const bright = (buf) => { let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i + 1] + buf[i + 2]; return s; };
      assert.ok(bright(pixels) > bright(dim.pixels), 'higher fade keeps brighter trails');
    });
  } finally {
    await close();
    const { closeGlDriver } = await import('./parity/glDriver.mjs');
    await closeGlDriver();
  }
}

try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser accum tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}

console.log(`accum.selfcheck: OK (${n} cases)`);
