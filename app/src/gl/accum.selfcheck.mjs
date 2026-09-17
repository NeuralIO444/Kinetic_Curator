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
  sanitizeAccumTunnel,
  sanitizeAccumPrism,
  sanitizeAccumFlow,
  sanitizeAccumEchoes,
  sanitizeAudioSample,
  applyAudioEnvelope,
  mirrorFlowVec,
  createEchoState,
  mirrorAccumStep,
  mirrorGaussBlur,
  blurPassSigmas,
  ACCUM_PROGRAMS,
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

ok('recipe params: Phase A feedback defaults to off (identity transform)', () => {
  const d = accumRecipeParams();
  assert.equal(d.tunnelZoom, 1, 'zoom 1 = no-op');
  assert.equal(d.tunnelSpin, 0, 'spin 0 = no-op');
  assert.equal(d.prismUv, 0, 'prism 0 = no-op');
  const p = accumRecipeParams({ tunnel: 1, prism: 1 });
  assert.ok(p.tunnelZoom > 1 && p.tunnelSpin > 0 && p.prismUv > 0);
  const half = accumRecipeParams({ tunnel: 0.5, prism: 0.5 });
  assert.ok(half.tunnelZoom < p.tunnelZoom && half.tunnelSpin < p.tunnelSpin && half.prismUv < p.prismUv,
    'feedback amounts scale with the sliders');
  assert.deepEqual(accumRecipeParams({ tunnel: 2, prism: -1 }).tunnelZoom, p.tunnelZoom, 'tunnel clamps at 1');
  assert.equal(accumRecipeParams({ tunnel: 2, prism: -1 }).prismUv, 0, 'prism clamps at 0');
});

ok('sanitizeAccumTunnel / sanitizeAccumPrism clamp to 0..1', () => {
  for (const fn of [sanitizeAccumTunnel, sanitizeAccumPrism]) {
    assert.equal(fn(0.5), 0.5);
    assert.equal(fn(7), 1);
    assert.equal(fn(-2), 0);
    assert.equal(fn(NaN), 0);
    assert.equal(fn(undefined), 0);
  }
});

ok('recipe params: Phase B flow/echoes default to off', () => {
  const d = accumRecipeParams();
  assert.equal(d.flowUv, 0, 'flow 0 = FEED pass skipped');
  assert.equal(d.echoTaps, 0, 'echoes 0 = no ring, no mix');
  assert.deepEqual(d.echoWeights, [], 'no weights at 0 taps');
  const p = accumRecipeParams({ flow: 1, echoes: 2 });
  assert.ok(p.flowUv > 0, 'flow maps to a UV displacement');
  assert.equal(p.echoTaps, 2);
  assert.deepEqual(p.echoWeights, [0.5, 0.35], 'tap weights decay with age');
  assert.equal(accumRecipeParams({ flow: 7 }).flowUv, p.flowUv, 'flow clamps at 1');
  assert.equal(accumRecipeParams({ echoes: 9 }).echoTaps, 4, 'echoes clamp at 4');
  assert.equal(accumRecipeParams({ echoes: -1 }).echoTaps, 0, 'echoes clamp at 0');
});

ok('recipe params: B3 resolution gate caps taps at >=2K widths', () => {
  assert.equal(accumRecipeParams({ echoes: 4, echoWidth: 1000 }).echoTaps, 4, 'below 2K: 4 taps');
  assert.equal(accumRecipeParams({ echoes: 4, echoWidth: 2048 }).echoTaps, 3, 'at 2K: capped to 3');
  assert.equal(accumRecipeParams({ echoes: 4, echoWidth: 7680 }).echoTaps, 3, 'at 8K: capped to 3');
  assert.equal(accumRecipeParams({ echoes: 2, echoWidth: 7680 }).echoTaps, 2, 'below the cap is untouched');
});

ok('sanitizeAccumFlow / sanitizeAccumEchoes', () => {
  assert.equal(sanitizeAccumFlow(0.5), 0.5);
  assert.equal(sanitizeAccumFlow(7), 1);
  assert.equal(sanitizeAccumFlow(NaN), 0);
  assert.equal(sanitizeAccumEchoes(2.6), 3, 'echoes round to taps');
  assert.equal(sanitizeAccumEchoes(9), 4);
  assert.equal(sanitizeAccumEchoes(-1), 0);
  assert.equal(sanitizeAccumEchoes(undefined), 0);
});

ok('applyAudioEnvelope: silence is identity, loudness/flux/beat modulate', () => {
  const base = accumRecipeParams({ fade: 0.9, optics: 0.5, tunnel: 0.5, prism: 0.5 });
  const silent = applyAudioEnvelope(base, { rms: 0, flux: 0, beatPulse: 0 });
  assert.deepEqual(silent, base, 'silence returns the params unchanged');
  const loud = applyAudioEnvelope(base, { rms: 1, flux: 0, beatPulse: 0 });
  assert.ok(loud.keep > base.keep && loud.keep <= 0.99, 'kick punches trails longer');
  assert.ok(loud.optics > base.optics && loud.optics <= 1, 'glow swells');
  assert.ok(loud.tunnelZoom > base.tunnelZoom, 'tunnel scales with loudness');
  assert.ok(loud.tunnelSpin > base.tunnelSpin, 'spin scales with loudness');
  assert.ok(loud.prismUv > base.prismUv, 'prism scales with loudness');
  // Gestures are distinct: flux (transients) punches keep but not optics,
  // beatPulse (on-the-one) swells optics but not keep.
  const transient = applyAudioEnvelope(base, { rms: 0, flux: 1, beatPulse: 0 });
  assert.ok(transient.keep > base.keep, 'flux alone punches keep');
  assert.equal(transient.optics, base.optics, 'flux alone leaves optics alone');
  const onTheOne = applyAudioEnvelope(base, { rms: 0, flux: 0, beatPulse: 1 });
  assert.ok(onTheOne.optics > base.optics, 'beatPulse alone swells optics');
  assert.equal(onTheOne.keep, base.keep, 'beatPulse alone leaves keep alone');
  assert.ok(loud.keep > transient.keep, 'full RMS punches harder than flux alone');
  assert.equal(applyAudioEnvelope(base, { rms: 1 }).keep, Math.min(0.99, 0.9 + 0.08 * 1), 'keep math is exact');
  // Optics is one amount: every derived glow field recomputes from the
  // modulated value, so audio genuinely swells the blur/bloom/halation.
  const glowBase = accumRecipeParams({ fade: 0.9, optics: 0.2 });
  const glowLoud = applyAudioEnvelope(glowBase, { rms: 1, flux: 0, beatPulse: 0 });
  assert.equal(glowLoud.optics, 0.5, 'optics modulates');
  assert.equal(glowLoud.bloomAmount, 0.55 * 0.5, 'bloomAmount recomputes from modulated optics');
  assert.equal(glowLoud.halationSigma, 22.0 * (0.5 + 0.5), 'halationSigma recomputes');
  assert.equal(glowLoud.frameBlurSigma, 5.0 * 0.5, 'frameBlurSigma recomputes');
});

ok('sanitizeAudioSample clamps rms, flux, beatPulse', () => {
  assert.deepEqual(sanitizeAudioSample({ rms: 0.5, flux: 0.2, beatPulse: 0.9 }), { rms: 0.5, flux: 0.2, beatPulse: 0.9 });
  assert.deepEqual(sanitizeAudioSample({ rms: 7, flux: -1, beatPulse: 'x' }), { rms: 1, flux: 0, beatPulse: 0 });
  assert.deepEqual(sanitizeAudioSample({}), { rms: 0, flux: 0, beatPulse: 0 });
});

ok('audioEnvelope: loads kc-audio-envelope/1, samples rms/flux/beatPulse', async () => {
  const { loadAudioEnvelope, sampleEnvelope } = await import('./audioEnvelope.mjs');
  const { writeFileSync } = await import('node:fs');
  const sidecar = {
    schema: 'kc-audio-envelope/1', source: 't.mp3', sr: 22050, hop_length: 512,
    fps: 43.066, duration: 2, tempo_bpm: 120,
    frames: [
      { t: 0, rms: 0, flux: 0, beat_phase: 0 },
      { t: 1, rms: 1, flux: 0.5, beat_phase: 0.5 },
      { t: 2, rms: 0, flux: 1, beat_phase: 0 },
    ],
    beats: [0, 0.5, 1.0, 1.5],
    downbeats: [],
  };
  writeFileSync('/tmp/kc-audioenv-selfcheck.json', JSON.stringify(sidecar));
  const env = loadAudioEnvelope('/tmp/kc-audioenv-selfcheck.json');
  assert.ok(env && env.samples.length === 3, 'loads 3 frames');
  assert.deepEqual(env.beats, [0, 0.5, 1, 1.5], 'beats kept');
  const mid = sampleEnvelope(env, 0.5);
  assert.ok(Math.abs(mid.rms - 0.5) < 1e-9, 'rms interpolates linearly');
  assert.ok(Math.abs(mid.flux - 0.25) < 1e-9, 'flux interpolates linearly');
  assert.ok(mid.beat_phase === 0 || mid.beat_phase === 0.5, 'beat_phase nearest-sample');
  const onBeat = sampleEnvelope(env, 1.0);
  assert.equal(onBeat.beatPulse, 1, 'beatPulse fires 1.0 at the beat');
  const offBeat = sampleEnvelope(env, 1.25);
  assert.ok(Math.abs(offBeat.beatPulse - 0.5) < 1e-9, 'beatPulse decays over the interval');
  const before = sampleEnvelope(env, 0);
  assert.equal(before.beatPulse, 1, 'beat at t=0 fires');
  const noBeats = sampleEnvelope({ samples: env.samples, beats: [], tempoBpm: 0 }, 1.0);
  assert.equal(noBeats.beatPulse, 0, 'no beats -> no pulse');
});

ok('audioEnvelope: malformed/missing sidecar is a null no-op; legacy sketch accepted', async () => {
  const { loadAudioEnvelope } = await import('./audioEnvelope.mjs');
  const { writeFileSync } = await import('node:fs');
  assert.equal(loadAudioEnvelope('/tmp/kc-audioenv-does-not-exist.json'), null, 'missing file -> null');
  writeFileSync('/tmp/kc-audioenv-bad.json', '{not json');
  assert.equal(loadAudioEnvelope('/tmp/kc-audioenv-bad.json'), null, 'bad JSON -> null');
  writeFileSync('/tmp/kc-audioenv-noframes.json', JSON.stringify({ schema: 'kc-audio-envelope/1' }));
  assert.equal(loadAudioEnvelope('/tmp/kc-audioenv-noframes.json'), null, 'no frames -> null');
  // Legacy pre-research sketch: bare array of {t, rms, beat}.
  writeFileSync('/tmp/kc-audioenv-legacy.json', JSON.stringify([
    { t: 0, rms: 0.2, beat: 1 }, { t: 1, rms: 0.4, beat: 0 },
  ]));
  const legacy = loadAudioEnvelope('/tmp/kc-audioenv-legacy.json');
  assert.ok(legacy && legacy.samples.length === 2, 'legacy array loads');
  assert.equal(legacy.samples[0].flux, 0, 'legacy has no flux');
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
  assert.equal(c.accum.tunnel, 0, 'tunnel defaults to 0/off');
  assert.equal(c.accum.prism, 0, 'prism defaults to 0/off');
  assert.equal(c.accum.flow, 0, 'flow defaults to 0/off');
  assert.equal(c.accum.echoes, 0, 'echoes defaults to 0/off');
  assert.equal(c.accum.background, '#112233');
  const cl = buildSceneContract({ doc, resolvedLayers: rl, caps, accum: { enabled: true, optics: 9 } });
  assert.equal(cl.accum.optics, 1, 'optics clamps at the contract boundary');
  const fb = buildSceneContract({
    doc, resolvedLayers: rl, caps,
    accum: { enabled: true, tunnel: 0.4, prism: 9, flow: 0.7, echoes: 2.6 },
  });
  assert.equal(fb.accum.tunnel, 0.4, 'tunnel rides the contract');
  assert.equal(fb.accum.prism, 1, 'prism clamps at the contract boundary');
  assert.equal(fb.accum.flow, 0.7, 'flow rides the contract');
  assert.equal(fb.accum.echoes, 3, 'echoes round at the contract boundary');
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

ok('halation parity: GPU subdivision matches the reference 3σ kernel (#226)', () => {
  // Reference look (Matt's call: no need to match SVG, we are in new
  // territory): the full 3σ gaussian the JS mirror evaluates — the wide warm
  // halation #169 designed. The GPU's old truncated-at-64-taps kernel was
  // the artifact; blurInto now subdivides wide sigmas into multiple passes
  // at σ/√n so the GPU evaluates the same full kernel.
  //
  // 1. Subdivision math: per-pass sigmas convolve back to the full sigma,
  //    and every pass fits the shader's 64-tap loop.
  for (const sigma of [5, 9, 11, 13.5, 22, 33]) {
    const passes = blurPassSigmas(sigma);
    assert.ok(passes.length >= 1, `sigma ${sigma}: at least one pass`);
    assert.ok(passes.every((s) => Math.ceil(3 * s) <= 64),
      `sigma ${sigma}: every pass fits 64 taps`);
    const total = Math.sqrt(passes.reduce((a, s) => a + s * s, 0));
    assert.ok(Math.abs(total - sigma) < 1e-9,
      `sigma ${sigma}: passes convolve back to ${sigma}, got ${total}`);
  }
  assert.deepEqual(blurPassSigmas(0), [], 'no-op sigma -> no passes');
  assert.equal(blurPassSigmas(5).length, 1, 'small sigma stays a single pass');
  assert.equal(blurPassSigmas(33).length, 3, 'halation max sigma subdivides into 3 passes');
  // 2. Image level: the GPU's subdivided stack (repeated mirrorGaussBlur at
  //    the sub-sigmas) equals the mirror's single full-kernel pass. A 1D-ish
  //    strip keeps it cheap; the comparison is interior-only (margin = 3σ)
  //    because clamped edges legitimately differ between single and
  //    repeated passes.
  const w = 256, h = 3;
  const src = new Float64Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = 0.5 + 0.5 * Math.sin(x * 0.11) * Math.cos(x * 0.031);
      src[o] = v; src[o + 1] = v * 0.7; src[o + 2] = v * 0.4; src[o + 3] = 1;
    }
  }
  src[100 * 4] = 1; // impulse: exercises the kernel tails
  for (const sigma of [22, 33]) { // bloom max … halation max (the subdivided range)
    const ref = mirrorGaussBlur(src, w, h, sigma);
    let cur = src;
    for (const s of blurPassSigmas(sigma)) cur = mirrorGaussBlur(cur, w, h, s);
    const margin = Math.ceil(3 * sigma) + 1;
    let maxDiff = 0;
    for (let y = 0; y < h; y++) {
      for (let x = margin; x < w - margin; x++) {
        const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) maxDiff = Math.max(maxDiff, Math.abs(ref[o + c] - cur[o + c]));
      }
    }
    // The residual is the 3σ tail mass each sub-kernel drops — invisible
    // (measured ~1e-3 vs the probe's 4-LSB ≈ 1.6e-2 bar), not a mismatch.
    assert.ok(maxDiff < 5e-3, `sigma ${sigma}: subdivided stack matches reference kernel, max interior diff ${maxDiff.toExponential(2)}`);
  }
});

const fbParams = (over) => ({ ...accumRecipeParams({ fade: 1, optics: 0 }), ...over });

ok('mirror: tunnel zoom pulls a soft mark toward center', () => {
  // NEAREST feedback + sub-texel per-step shifts mean a single hard texel
  // is a fixed point at small canvas sizes (the effect is resolution-
  // dependent — real at still sizes). So: a soft 5x5 blob, centroid metric,
  // exaggerated zoom through the real code path.
  const w2 = 32, h2 = 32, n2 = w2 * h2 * 4;
  const blob = new Float64Array(n2);
  for (let y = 14; y <= 18; y++) {
    for (let x = 22; x <= 26; x++) {
      const o = (y * w2 + x) * 4;
      blob[o] = 1; blob[o + 1] = 0.5; blob[o + 2] = 0.25; blob[o + 3] = 1;
    }
  }
  const centroidX = (buf) => {
    let s = 0, sx = 0;
    for (let y = 0; y < h2; y++) {
      for (let x = 0; x < w2; x++) {
        const v = buf[(y * w2 + x) * 4];
        s += v; sx += v * x;
      }
    }
    return sx / s;
  };
  const c0 = centroidX(blob);
  const params = fbParams({ tunnelZoom: 1.2, tunnelSpin: 0 });
  let acc = blob;
  for (let i = 0; i < 5; i++) {
    acc = mirrorAccumStep({ accum: acc, frame: new Float64Array(n2), w: w2, h: h2, params });
  }
  const c1 = centroidX(acc);
  let total = 0;
  for (let i = 0; i < n2; i += 4) total += acc[i];
  assert.ok(c1 < c0 - 2, `tunnel pulls the mark toward center: ${c0.toFixed(2)} -> ${c1.toFixed(2)}`);
  assert.ok(total > 1, `the mark survives the loop (total ${total.toFixed(2)})`);
  // Control: tunnel = 0 leaves the blob exactly where it was.
  const still = mirrorAccumStep({ accum: blob, frame: new Float64Array(n2), w: w2, h: h2, params: fbParams({}) });
  assert.ok(Math.abs(centroidX(still) - c0) < 1e-9, 'no tunnel -> no migration');
});

ok('mirror: prism separates the RGB channels radially', () => {
  // 16x1 strip, white dot at x=10, prismUv = 0.1: r samples outward
  // (+pr), g at center, b inward (-pr) — peaks land at x=8 / 10 / 12.
  const w2 = 16, h2 = 1, n2 = w2 * h2 * 4;
  const dot = new Float64Array(n2);
  dot[10 * 4] = 1; dot[10 * 4 + 1] = 1; dot[10 * 4 + 2] = 1; dot[10 * 4 + 3] = 1;
  const params = fbParams({ prismUv: 0.1 });
  const out = mirrorAccumStep({ accum: dot, frame: new Float64Array(n2), w: w2, h: h2, params });
  const close = (v, e) => Math.abs(v - e) < 1e-9;
  assert.ok(close(out[8 * 4], 0.99), 'red fringes outward (x=8)');
  assert.ok(close(out[10 * 4 + 1], 0.99), 'green stays centered (x=10)');
  assert.ok(close(out[12 * 4 + 2], 0.99), 'blue fringes inward (x=12)');
  // prism = 0: no separation, the dot is unchanged.
  const plain = mirrorAccumStep({ accum: dot, frame: new Float64Array(n2), w: w2, h: h2, params: fbParams({}) });
  assert.ok(close(plain[10 * 4], 0.99));
  assert.equal(plain[8 * 4], 0, 'no prism -> no red fringe');
});

ok('mirror: flow = 0 is a no-op, flow > 0 advects', () => {
  // The flow field is deterministic: same UV -> same vector, twice.
  const v1 = mirrorFlowVec(0.3, 0.7);
  const v2 = mirrorFlowVec(0.3, 0.7);
  assert.deepEqual(v1, v2, 'flow field is deterministic');
  assert.ok(Number.isFinite(v1[0]) && Number.isFinite(v1[1]), 'finite vector');
  assert.ok(Math.abs(v1[0]) <= 1 && Math.abs(v1[1]) <= 1, 'bounded displacement');
  // Non-trivial: the field varies across the canvas (not a constant wind).
  const v3 = mirrorFlowVec(0.8, 0.2);
  assert.ok(Math.abs(v1[0] - v3[0]) > 1e-6 || Math.abs(v1[1] - v3[1]) > 1e-6, 'field varies spatially');
  // flow = 0: the buffer is untouched (skipped pass, not an identity warp).
  const w3 = 8, h3 = 8, n3 = w3 * h3 * 4;
  const blob = new Float64Array(n3);
  for (let i = 0; i < n3; i++) blob[i] = (i * 7919) % 97 / 97; // deterministic junk
  const fb0 = fbParams({ flowUv: 0 }); // keep = 0.99 (fade: 1 clamps)
  const still = mirrorAccumStep({ accum: blob, frame: new Float64Array(n3), w: w3, h: h3, params: fb0 });
  for (let i = 0; i < n3; i += 4) {
    assert.ok(Math.abs(still[i] - blob[i] * fb0.keep) < 1e-12, 'flow 0: rgb only fades');
  }
  // flow > 0 on a uniform field: advection of a constant is the constant.
  const flat = new Float64Array(n3).fill(0.5);
  flat.forEach((_, i) => { if (i % 4 === 3) flat[i] = 1; });
  const adv = mirrorAccumStep({ accum: flat, frame: new Float64Array(n3), w: w3, h: h3, params: fbParams({ flowUv: 0.03 }) });
  for (let i = 0; i < n3; i += 4) {
    assert.ok(Math.abs(adv[i] - 0.5 * 0.99) < 1e-9, `uniform field advects to itself, then fades (i=${i})`);
  }
});

ok('mirror: echoes mix past frames, echoes = 0 is a no-op', () => {
  const w4 = 4, h4 = 4, n4 = w4 * h4 * 4;
  const dotAt = (x) => {
    const f = new Float64Array(n4);
    f[x * 4] = 1; f[x * 4 + 1] = 1; f[x * 4 + 2] = 1; f[x * 4 + 3] = 1;
    return f;
  };
  const silent = new Float64Array(n4);
  const params = { ...accumRecipeParams({ fade: 1, optics: 0 }), echoTaps: 2, echoWeights: [0.5, 0.35] };
  // echoes = 0: identical to the old path even with a state object around.
  const noEcho = mirrorAccumStep({ accum: silent, frame: dotAt(0), w: w4, h: h4, params: fbParams({}), echo: createEchoState() });
  assert.equal(noEcho[0], 1, 'live frame lands at full weight');
  assert.equal(noEcho[4], 0, 'no ghost without echoes');
  // With echoes: step 1 has no history yet (no taps valid) — the live
  // frame lands alone. Step 2 mixes the previous frame as tap 0.
  const echo = createEchoState();
  const s1 = mirrorAccumStep({ accum: silent, frame: dotAt(0), w: w4, h: h4, params, echo });
  assert.equal(s1[0], 1, 'step 1: live frame only');
  assert.equal(s1[4], 0, 'step 1: no ghost yet');
  const s2 = mirrorAccumStep({ accum: silent, frame: dotAt(8), w: w4, h: h4, params, echo });
  assert.equal(s2[8 * 4], 1, 'step 2: new live frame at full weight');
  assert.ok(Math.abs(s2[0] - 0.5 * 1) < 1e-12, `step 2: tap 0 ghost at 0.5, got ${s2[0]}`);
  assert.equal(s2[4], 0, 'step 2: untouched texel stays dark');
  // Missing state with taps > 0 is a loud error, not silent wrongness.
  assert.throws(() => mirrorAccumStep({ accum: silent, frame: dotAt(0), w: w4, h: h4, params }), /echo state/);
});

// --- harness coverage: every ACCUM program is audit-registered ---------------
// The #193 second pass routes all eight ACCUM programs (fade/feed/echo/
// copy/over/down/blur/add) through the checked compile/link builders and
// the uniform audit in createAccum. The real compile needs a GL context
// (covered in the debug harness's in-page suite); here in Node we prove
// the audit table is complete and honest: every uniform each shader
// declares is in its program's upload list — the exact direction the
// checked audit throws on.
const parseShaderUniforms = (src) => {
  const names = [];
  const re = /uniform\s+\w+\s+(\w+)\s*;/g;
  let m;
  while ((m = re.exec(src || ''))) names.push(m[1]);
  return names;
};

ok('harness: ACCUM_PROGRAMS covers all eight GPU programs', () => {
  const keys = Object.keys(ACCUM_PROGRAMS).sort();
  assert.deepEqual(keys, ['add', 'blur', 'copy', 'down', 'echo', 'fade', 'feed', 'over']);
  for (const [name, def] of Object.entries(ACCUM_PROGRAMS)) {
    assert.equal(typeof def.fs, 'string', `${name}: has shader source`);
    assert.ok(def.fs.includes('void main'), `${name}: source is a shader`);
    assert.ok(Array.isArray(def.uniforms) && def.uniforms.length > 0, `${name}: has an upload list`);
    assert.equal(typeof def.file, 'string', `${name}: names its file for errors`);
  }
});

ok('harness: every uniform each ACCUM shader declares is in its upload list', () => {
  for (const [name, def] of Object.entries(ACCUM_PROGRAMS)) {
    const declared = parseShaderUniforms(def.fs);
    const missing = declared.filter((u) => !def.uniforms.includes(u));
    assert.deepEqual(missing, [], `accum-${name}: declared-but-never-set [${missing}]`);
  }
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

    const runProbe = async ({ w = 12, h = 12, bg = '#000000', fade = 0.9, optics = 0, tunnel = 0, prism = 0, flow = 0, echoes = 0, audio = null, frames }) => {
      const res = await page.evaluate((p) => window.__kcAccumProbe(p), {
        w, h, bg, fade, optics, tunnel, prism, flow, echoes, echoWidth: w, audio,
        frames: frames.map(bytesOf),
      });
      return { gpu: f64Of(res.pixels), w: res.width, h: res.height };
    };
    const mirrorSeq = ({ w, h, bg, fade, optics, tunnel = 0, prism = 0, flow = 0, echoes = 0, audio = null, frames }) => {
      const bgV = [0, 1, 2].map((i) => parseInt(bg.slice(1 + i * 2, 3 + i * 2), 16) / 255);
      let acc = new Float64Array(w * h * 4);
      for (let i = 0; i < w * h; i++) { acc[i * 4] = bgV[0]; acc[i * 4 + 1] = bgV[1]; acc[i * 4 + 2] = bgV[2]; acc[i * 4 + 3] = 1; }
      const base = accumRecipeParams({ fade, optics, tunnel, prism, flow, echoes, echoWidth: w });
      const echo = createEchoState();
      let i = 0;
      for (const f of frames) {
        const params = audio ? applyAudioEnvelope(base, audio[i] || {}) : base;
        acc = mirrorAccumStep({ accum: acc, frame: f, w, h, params, echo });
        i++;
      }
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

    await okAsync('probe: tunnel feedback spirals inward (GPU = mirror)', async () => {
      // 256px: the recipe's per-frame zoom (1%/frame at tunnel = 1) moves
      // ~0.65px/frame at this radius — above the NEAREST visibility floor.
      const w = 256, h = 256;
      // 6x6 block east of center; 15 fade-only frames at tunnel = 1.
      const frames = [whiteBlock(w, h, 190, 125, 6)];
      for (let i = 0; i < 14; i++) frames.push(new Float64Array(w * h * 4));
      const { gpu } = await runProbe({ w, h, fade: 1, optics: 0, tunnel: 1, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 1, optics: 0, tunnel: 1, frames });
      closeTo(gpu, ref, 6 * LSB, 'tunnel sequence');
      const cx = (buf) => {
        let s = 0, sx = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const v = buf[(y * w + x) * 4]; s += v; sx += v * x;
        }
        return sx / s;
      };
      assert.ok(cx(gpu) < 192.5 - 8, `tunnel pulls the block toward center: centroid x ${cx(gpu).toFixed(1)} (was 192.5)`);
    });

    await okAsync('probe: prism splits channels radially (GPU = mirror)', async () => {
      // 512px: the recipe's per-frame prism push (0.001 UV at prism = 1)
      // moves ~0.5px/frame — just above the NEAREST visibility floor.
      const w = 512, h = 512;
      // 3x3 dot east of center; 8 fade-only frames at prism = 1.
      const frames = [whiteBlock(w, h, 400, 256, 3)];
      for (let i = 0; i < 7; i++) frames.push(new Float64Array(w * h * 4));
      const { gpu } = await runProbe({ w, h, fade: 1, optics: 0, prism: 1, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 1, optics: 0, prism: 1, frames });
      closeTo(gpu, ref, 6 * LSB, 'prism sequence');
      const peakX = (buf, c) => {
        let bx = 0, bv = -1;
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let y = 252; y < 262; y++) s += buf[(y * w + x) * 4 + c];
          if (s > bv) { bv = s; bx = x; }
        }
        return bx;
      };
      const rx = peakX(gpu, 0), gx = peakX(gpu, 1), bx = peakX(gpu, 2);
      assert.ok(rx < gx && gx < bx, `channels separate radially: r@${rx} g@${gx} b@${bx}`);
      assert.ok(bx - rx >= 4, `separation is visible: r/b spread ${bx - rx}px`);
    });

    await okAsync('probe: flow advects the buffer (GPU = mirror on smooth content)', async () => {
      // The noise hash is integer-exact on both sides, but the displacement
      // is float32 vs float64 — so parity runs on a smooth blob (neighbor
      // flips cost little) rather than a hard dot.
      const w = 256, h = 256;
      const blob = (w, h) => {
        const f = new Float64Array(w * h * 4);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = (x - w / 2) / (w / 8), dy = (y - h / 2) / (h / 8);
            const v = Math.exp(-(dx * dx + dy * dy));
            const o = (y * w + x) * 4;
            f[o] = v; f[o + 1] = v; f[o + 2] = v; f[o + 3] = 1;
          }
        }
        return f;
      };
      const frames = [blob(w, h)];
      for (let i = 0; i < 7; i++) frames.push(new Float64Array(w * h * 4));
      const { gpu } = await runProbe({ w, h, fade: 1, optics: 0, flow: 1, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 1, optics: 0, flow: 1, frames });
      closeTo(gpu, ref, 8 * LSB, 'flow sequence');
      // Behavioral: flow actually moves light (vs the no-flow run).
      const { gpu: still } = await runProbe({ w, h, fade: 1, optics: 0, flow: 0, frames });
      let diff = 0;
      for (let i = 0; i < gpu.length; i += 4) diff = Math.max(diff, Math.abs(gpu[i] - still[i]));
      assert.ok(diff > 0.02, `flow displaces the blob (max Δ ${diff.toFixed(3)})`);
      // Conservation-ish: the forward warp is not divergence-free, so it
      // dissipates a few %/step at max flow (part of the billow look) — but
      // it must never CREATE light.
      const sum = (buf) => { let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i]; return s; };
      assert.ok(sum(gpu) <= sum(still) * 1.02, `flow never creates light (gpu=${sum(gpu).toFixed(1)} still=${sum(still).toFixed(1)})`);
    });

    await okAsync('probe: echoes leave discrete ghosts (GPU = mirror)', async () => {
      const w = 12, h = 12;
      // Dots march right across three frames; tap 0 should ghost the
      // previous frame's dot at half weight behind the live one.
      // fade = 0 (keep = 0) so the fade trail doesn't drown the ghosts —
      // this probe isolates the echo mix, not the feedback loop.
      const frames = [whiteDot(w, h, 2, 6), whiteDot(w, h, 5, 6), whiteDot(w, h, 8, 6)];
      const { gpu } = await runProbe({ w, h, fade: 0, optics: 0, echoes: 2, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 0, optics: 0, echoes: 2, frames });
      closeTo(gpu, ref, 4 * LSB, 'echo sequence');
      const at = (x) => gpu[(6 * w + x) * 4];
      assert.ok(at(8) > 0.9, `live dot at full weight, got ${at(8).toFixed(3)}`);
      assert.ok(at(5) > 0.3 && at(5) < 0.7, `tap-0 ghost at ~0.5 behind it, got ${at(5).toFixed(3)}`);
      assert.ok(at(2) > 0.1 && at(2) < at(5), `tap-1 ghost dimmer still, got ${at(2).toFixed(3)}`);
      assert.equal(at(10), 0, 'no light ahead of the motion');
    });

    await okAsync('probe: echo mix clamps alpha to <= 1 (GPU and mirror)', async () => {
      const w = 8, h = 8;
      // Two identical frames stacked: additive mixing would push alpha to
      // 1.85 without the clamp. (RGB goes HDR here, which the 8-bit probe
      // readback clips — so this locks the alpha guarantee specifically,
      // not the RGB values.)
      const frames = [whiteDot(w, h, 4, 4), whiteDot(w, h, 4, 4), whiteDot(w, h, 4, 4)];
      const { gpu } = await runProbe({ w, h, fade: 0, optics: 0, echoes: 2, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 0, optics: 0, echoes: 2, frames });
      const maxAlpha = (buf) => { let m = 0; for (let i = 3; i < buf.length; i += 4) m = Math.max(m, buf[i]); return m; };
      assert.ok(maxAlpha(gpu) <= 1 + 1e-6, `GPU echo alpha clamped, got max ${maxAlpha(gpu).toFixed(3)}`);
      assert.ok(maxAlpha(ref) <= 1 + 1e-6, `mirror echo alpha clamped, got max ${maxAlpha(ref).toFixed(3)}`);
    });

    await okAsync('probe: audio envelope modulates per-frame params (GPU = mirror)', async () => {
      const w = 12, h = 12;
      // One dot, then silence: with a loud envelope the trail survives
      // longer (keep punched up); with silence it decays to the base keep.
      const frames = [whiteDot(w, h, 6, 6)];
      for (let i = 0; i < 5; i++) frames.push(new Float64Array(w * h * 4));
      const loudAudio = frames.map(() => ({ rms: 1, flux: 0, beat_phase: 0, beatPulse: 0 }));
      const quietAudio = frames.map(() => ({ rms: 0, flux: 0, beat_phase: 0, beatPulse: 0 }));
      const { gpu: loud } = await runProbe({ w, h, fade: 0.5, optics: 0, audio: loudAudio, frames });
      const { gpu: quiet } = await runProbe({ w, h, fade: 0.5, optics: 0, audio: quietAudio, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 0.5, optics: 0, audio: loudAudio, frames });
      closeTo(loud, ref, 3 * LSB, 'audio-modulated sequence');
      // Total light (not the center pixel): the audio-swollen optics blurs
      // the incoming dot (energy-conserving), so the center dims while the
      // trail as a whole survives longer on the punched-up keep.
      const total = (buf) => { let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i]; return s; };
      assert.ok(total(loud) > total(quiet) * 1.5, `loud envelope keeps brighter trails (${total(loud).toFixed(3)} vs ${total(quiet).toFixed(3)})`);
      // Silence envelope == no envelope at all (the no-audio path untouched).
      const { gpu: noEnv } = await runProbe({ w, h, fade: 0.5, optics: 0, frames });
      closeTo(quiet, noEnv, 1e-9, 'silent envelope is identity');
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
