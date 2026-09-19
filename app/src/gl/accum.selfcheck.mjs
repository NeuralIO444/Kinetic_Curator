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
  mirrorMipChain,
  mirrorTrilinear,
  mirrorGlowSample,
  drainGlErrors,
  createAccum,
  ACCUM_PROGRAMS,
  ACCUM_PASS_SOURCES,
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
  assert.equal(ACCUM_VERSION, 2);
  const d = accumRecipeParams();
  assert.equal(d.keep, 0.88);
  assert.equal(d.optics, 0);
  assert.equal(d.bloomAmount, 0);
  assert.equal(d.halationAmount, 0);
  assert.equal(d.stipple, 0, 'no stipple at optics 0');
  assert.deepEqual(accumRecipeParams({ fade: 2 }).keep, 0.99, 'fade clamps at 0.99');
  assert.deepEqual(accumRecipeParams({ fade: -1 }).keep, 0, 'fade clamps at 0');
  assert.deepEqual(accumRecipeParams({ optics: 2 }).optics, 1, 'optics clamps at 1');
  assert.deepEqual(accumRecipeParams({ optics: 'bogus' }).optics, 0, 'optics NaN -> 0');
});

ok('recipe params: one optics amount drives bloom + halation + stipple + chroma', () => {
  // #308: the glow system. No gaussian anywhere — one optics slider drives
  // the mip lod of each tier, the stipple gate, and the chromatic offset.
  const p = accumRecipeParams({ fade: 0.9, optics: 1 });
  assert.ok(p.bloomAmount > 0 && p.halationAmount > 0, 'both tiers lift light');
  assert.ok(p.halationLod > p.bloomLod, 'halation reads a deeper mip than bloom');
  assert.ok(p.stipple > 0, 'stipple diffusion is on');
  assert.ok(p.chromaTexels > 0, 'chromatic offset is on');
  assert.ok(!('frameBlurSigma' in p) && !('bloomSigma' in p) && !('halationSigma' in p),
    'no sigma fields survive the blur removal');
  const [r, g, b] = p.halationTint;
  assert.ok(r >= g && g > b, `halation tint is red/warm biased, got [${r},${g},${b}]`);
  const half = accumRecipeParams({ optics: 0.5 });
  assert.ok(half.bloomAmount < p.bloomAmount, 'amount scales with the slider');
  assert.ok(half.halationLod < p.halationLod, 'mip depth scales with the slider');
  assert.ok(half.stipple < p.stipple, 'stipple scales with the slider');
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
  // modulated value, so audio genuinely swells the mip glow/stipple/chroma.
  const glowBase = accumRecipeParams({ fade: 0.9, optics: 0.2 });
  const glowLoud = applyAudioEnvelope(glowBase, { rms: 1, flux: 0, beatPulse: 0 });
  // #273: headroom-relative — optics 0.2 + 0.8 headroom * 0.3 gesture = 0.44
  assert.equal(glowLoud.optics, 0.44, 'optics modulates within headroom');
  assert.equal(glowLoud.bloomAmount, 0.22 * 0.44, 'bloomAmount recomputes from modulated optics');
  assert.equal(glowLoud.halationLod, 2 + 0.44, 'halationLod recomputes');
  assert.equal(glowLoud.stipple, 0.44, 'stipple recomputes');
  // Audio can never peg GLOW: loud rms + beatPulse on a high slider swells
  // toward the ceiling instead of clamping at 1; the slider keeps authority.
  const highGlow = applyAudioEnvelope(accumRecipeParams({ optics: 0.8 }), { rms: 1, flux: 0, beatPulse: 1 });
  assert.ok(Math.abs(highGlow.optics - 0.88) < 1e-12, 'loud audio on optics 0.8 -> 0.88, not pegged');
  const maxGlow = applyAudioEnvelope(accumRecipeParams({ optics: 1 }), { rms: 1, flux: 0, beatPulse: 1 });
  assert.equal(maxGlow.optics, 1, 'optics 1 stays 1, never exceeds the slider');
  const lowGlow = applyAudioEnvelope(accumRecipeParams({ optics: 0 }), { rms: 1, flux: 0, beatPulse: 0 });
  assert.ok(Math.abs(lowGlow.optics - 0.3) < 1e-12, 'gesture keeps full strength at optics 0');
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

ok('glow system: no gaussian survives anywhere in the ACCUM path (#308)', () => {
  // The module's whole contract: the blur passes are deleted (not
  // optimized, not hidden behind a quality flag), the audit table carries
  // glow instead of blur/add, and no shader source mentions a sigma.
  // resample is #309's structural half-res plumbing, not a blur.
  const keys = Object.keys(ACCUM_PASS_SOURCES).sort();
  assert.deepEqual(keys, ['copy', 'down', 'echo', 'fade', 'feed', 'glow', 'over', 'resample']);
  for (const [name, src] of Object.entries(ACCUM_PASS_SOURCES)) {
    assert.ok(!/sigma/i.test(src), `accum-${name}: no sigma in the shader source`);
    assert.ok(!/gauss/i.test(src), `accum-${name}: no gaussian in the shader source`);
  }
  assert.deepEqual(Object.keys(ACCUM_PROGRAMS).sort(), keys,
    'the audit table and the pass sources agree');
});

ok('mirror: mip chain halves each level and quantizes to 8-bit', () => {
  const gw = 8, gh = 6;
  const base = new Float64Array(gw * gh * 4);
  // Quantize like the GPU's RGBA8 framebuffer write does (boxDownsample in
  // the real path) — level 0 enters the chain already 8-bit.
  for (let i = 0; i < base.length; i++) base[i] = Math.round(((i * 7919) % 257 / 300) * 255) / 255;
  const chain = mirrorMipChain(base, gw, gh);
  const sizes = chain.map((l) => [l.w, l.h]);
  assert.deepEqual(sizes, [[8, 6], [4, 3], [2, 1], [1, 1]], 'each level halves (floor, min 1)');
  for (const level of chain) {
    for (const v of level.px) {
      assert.ok(Math.abs(v * 255 - Math.round(v * 255)) < 1e-9, 'every level is 8-bit quantized');
    }
  }
  // Uniform input stays uniform through the chain.
  const flat = new Float64Array(gw * gh * 4).fill(0.5);
  const fchain = mirrorMipChain(flat, gw, gh);
  for (const level of fchain) {
    for (let i = 0; i < level.px.length; i += 4) {
      assert.ok(Math.abs(level.px[i] - 0.5) < 2 / 255, 'flat field survives the chain');
    }
  }
});

ok('mirror: glow sample with the gate off and no chroma is plain trilinear', () => {
  const gw = 4, gh = 4;
  const base = new Float64Array(gw * gh * 4);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const o = (y * gw + x) * 4;
      base[o] = x / gw; base[o + 1] = y / gh; base[o + 2] = 0.5; base[o + 3] = 1;
    }
  }
  const chain = mirrorMipChain(base, gw, gh);
  const args = { lod: 1.5, stipple: 0, chromaTexels: 0 };
  for (const [u, v, x, y] of [[0.3, 0.4, 5, 9], [0.7, 0.2, 40, 3], [0.51, 0.49, 0, 0]]) {
    const g = mirrorGlowSample(chain, gw, gh, u, v, x, y, args);
    const t = mirrorTrilinear(chain, u, v, 1.5);
    assert.deepEqual(g, t, 'gate off + chroma 0: the glow sample is plain trilinear');
  }
  // Deterministic: the stipple hash gives the same gate twice.
  const sargs = { lod: 1.5, stipple: 1, chromaTexels: 0 };
  const a1 = mirrorGlowSample(chain, gw, gh, 0.3, 0.4, 5, 9, sargs);
  const a2 = mirrorGlowSample(chain, gw, gh, 0.3, 0.4, 5, 9, sargs);
  assert.deepEqual(a1, a2, 'the stipple gate is deterministic');
  // The gate only ever dims: gated channels never exceed the ungated ones.
  const plain = mirrorGlowSample(chain, gw, gh, 0.3, 0.4, 5, 9, args);
  for (let c = 0; c < 3; c++) assert.ok(a1[c] <= plain[c] + 1e-12, 'stipple dims, never brightens');
});

ok('mirror: chromatic offset fringes the channels radially', () => {
  // White block on black; at lod 0 the glow target resolves the edge, and
  // an exaggerated chroma offset pushes red outward and blue inward.
  const gw = 8, gh = 8;
  const base = new Float64Array(gw * gh * 4);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const o = (y * gw + x) * 4;
      const v = (x >= 3 && x < 5) ? 1 : 0;
      base[o] = v; base[o + 1] = v; base[o + 2] = v; base[o + 3] = 1;
    }
  }
  const chain = mirrorMipChain(base, gw, gh);
  const args = { lod: 0, stipple: 0, chromaTexels: 6 };
  // No chroma: the channels never separate.
  const flat = mirrorGlowSample(chain, gw, gh, 2.5 / 8, 0.5, 10, 16, { lod: 0, stipple: 0, chromaTexels: 0 });
  assert.ok(Math.abs(flat[0] - flat[2]) < 1e-12, 'chroma 0: r == b everywhere');
  // Chroma on: red samples outward (away from center), blue inward — so a
  // bright shape's red core reads tighter and blue fringes the outside.
  // Just outside the block's left edge: blue reaches where red no longer does.
  const left = mirrorGlowSample(chain, gw, gh, 2.5 / 8, 0.5, 10, 16, args);
  assert.ok(left[2] - left[0] > 0.3, `left of the block fringes blue: r=${left[0].toFixed(3)} b=${left[2].toFixed(3)}`);
  // Radial symmetry: the same blue outer fringe on the right edge.
  const right = mirrorGlowSample(chain, gw, gh, 5.5 / 8, 0.5, 22, 16, args);
  assert.ok(right[2] - right[0] > 0.3, `right of the block fringes blue: r=${right[0].toFixed(3)} b=${right[2].toFixed(3)}`);
});

ok('mirror: optics 1 glows — bleed, added light, warm bias, no frame blur', () => {
  const w = 64, h = 64, n4 = w * h * 4;
  const block = new Float64Array(n4);
  for (let y = 26; y < 38; y++) {
    for (let x = 26; x < 38; x++) {
      const o = (y * w + x) * 4;
      block[o] = 1; block[o + 1] = 1; block[o + 2] = 1; block[o + 3] = 1;
    }
  }
  const acc0 = new Float64Array(n4);
  // Gate off + no chroma here: this test locks the bloom/halation light
  // behavior (bleed, added light, warm bias). The stipple gate and the
  // chromatic offset have their own dedicated tests above — a single
  // pixel in dim glow would be at the gate's mercy.
  const p = { ...accumRecipeParams({ fade: 1, optics: 1 }), stipple: 0, chromaTexels: 0 };
  const out = mirrorAccumStep({ accum: acc0, frame: block, w, h, params: p });
  const at = (buf, x, y) => buf[(y * w + x) * 4];
  // The frame itself lands sharp: no blur-over-time softens the edge — the
  // interior keeps the frame's full weight (plus the glow on top), and one
  // pixel outside the block carries only glow light, no blurred frame.
  assert.ok(at(out, 30, 30) >= 1, 'the block interior keeps the frame at full weight');
  assert.ok(at(out, 25, 32) < 0.1, `no frame light bleeds past the edge, got ${at(out, 25, 32).toFixed(4)}`);
  // The glow bleeds past the block…
  assert.ok(at(out, 44, 32) > 0.002, `glow bleeds well past the block, got ${at(out, 44, 32).toFixed(4)}`);
  // …adds light rather than redistributing it…
  const sum = (buf) => { let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i + 1] + buf[i + 2]; return s; };
  const plain = mirrorAccumStep({ accum: acc0, frame: block, w, h, params: accumRecipeParams({ fade: 1, optics: 0 }) });
  assert.ok(sum(out) > sum(plain) * 1.01, 'bloom + halation add light');
  // …and the halation tier biases it warm.
  const warm = (buf) => { let d = 0; for (let i = 0; i < buf.length; i += 4) d += buf[i] - buf[i + 2]; return d; };
  assert.ok(warm(out) > warm(plain), 'optics shift the added light warm/red');
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
// The #193 second pass routes all seven ACCUM programs (fade/feed/echo/
// copy/over/down/glow) through the checked compile/link builders and
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
  assert.deepEqual(keys, ['copy', 'down', 'echo', 'fade', 'feed', 'glow', 'over', 'resample']);
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

// --- regression: sticky GL errors must not freeze the live loop -------------
// WebGL errors are sticky flags. A benign error raised by earlier non-ACCUM
// work in the frame (content render, timer queries) stays queued until
// something calls getError(). step() used to throw on ANY pending error,
// which the live tick (no fault isolation for the ACCUM branch) turned into
// a permanently frozen canvas: "as soon as i turn accum it freezes".
// createAccum().step() must drain stale errors on entry so its post-step
// check only reflects its own passes. Driven against a recording mock GL
// (no browser needed).
function makeMockGL() {
  let ids = 1;
  const C = {
    TEXTURE_2D: 0x0DE1, TEXTURE0: 0x84C0, FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0, FRAMEBUFFER_COMPLETE: 0x8CD5,
    RGBA16F: 0x881A, RGBA8: 0x8058, RGBA: 0x1908, HALF_FLOAT: 0x140B,
    UNSIGNED_BYTE: 0x1401, NEAREST: 0x2600, LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    CLAMP_TO_EDGE: 0x812F, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, COLOR_BUFFER_BIT: 0x4000,
    TRIANGLES: 0x0004, ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88E4, FLOAT: 0x1406,
    BLEND: 0x0BE2, VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82, ACTIVE_UNIFORMS: 0x8B86,
    NO_ERROR: 0, INVALID_OPERATION: 0x0502,
  };
  let activeUnit = 0;
  const gl = {
    ...C,
    _errorQueue: [],
    createTexture: () => ids++, deleteTexture() {},
    bindTexture(t, id) { if (t === C.TEXTURE_2D) this._bound = id; },
    activeTexture(u) { activeUnit = u - C.TEXTURE0; },
    texParameteri() {},
    texImage2D() {},
    generateMipmap() {},
    createFramebuffer: () => ids++, deleteFramebuffer() {},
    bindFramebuffer() {},
    framebufferTexture2D() {},
    checkFramebufferStatus: () => C.FRAMEBUFFER_COMPLETE,
    createBuffer: () => ids++, deleteBuffer() {},
    bindBuffer() {}, bufferData() {},
    createShader: () => ids++, shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, getShaderInfoLog: () => '', deleteShader() {},
    createProgram: () => ids++, attachShader() {}, linkProgram() {},
    getProgramParameter: (p, q) => (q === C.LINK_STATUS ? true : 0),
    getProgramInfoLog: () => '', deleteProgram() {},
    getActiveUniform: () => null, getUniformLocation: () => ({}),
    useProgram() {}, viewport() {}, disable() {}, clearColor() {}, clear() {},
    enableVertexAttribArray() {}, vertexAttribPointer() {}, disableVertexAttribArray() {},
    uniform1i() {}, uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {},
    drawArrays() {},
    getError() { return this._errorQueue.length ? this._errorQueue.shift() : C.NO_ERROR; },
  };
  return gl;
}

function makeMockBridge(gl) {
  // Minimal bridge surface createAccum uses: lost flag + layer() targets.
  // Honors the #309 resolution divisor (pair at base/div, like the real bridge).
  const layers = new Map();
  const allocTarget = (w, h) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('[mock-bridge] framebuffer incomplete');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  };
  return {
    lost: false,
    layer(id, { div = 1 } = {}) {
      const d = Math.max(1, div || 1);
      const key = `${id}/d${d}`;
      if (!layers.has(key)) {
        layers.set(key, {
          t0: allocTarget(Math.round(64 / d), Math.round(40 / d)),
          t1: allocTarget(Math.round(64 / d), Math.round(40 / d)),
        });
      }
      return layers.get(key);
    },
  };
}

ok('regression: drainGlErrors clears a sticky queue', () => {
  const gl = makeMockGL();
  gl._errorQueue.push(0x0502, 0x0501, 0x0500);
  drainGlErrors(gl);
  assert.equal(gl.getError(), gl.NO_ERROR, 'queue drained');
  // cap: never spins forever
  gl._errorQueue.push(...new Array(100).fill(0x0502));
  drainGlErrors(gl, 4);
  assert.equal(gl._errorQueue.length, 96, 'drain respects the cap');
});

ok('regression: step() survives a pre-existing sticky GL error', () => {
  const gl = makeMockGL();
  const bridge = makeMockBridge(gl);
  const accum = createAccum(gl, bridge, { width: 64, height: 40 });
  accum.begin('#101010');
  const frameTex = gl.createTexture();
  const p = accumRecipeParams({ fade: 0.88, optics: 0, tunnel: 0, prism: 0 });
  // A benign error from earlier non-ACCUM work in the frame (e.g. a timer
  // query quirk on ANGLE): step() must drain it, not throw on it.
  gl._errorQueue.push(gl.INVALID_OPERATION);
  const tgt = accum.step(frameTex, p);
  assert.ok(tgt && tgt.tex, 'step returns a target despite the stale error');
  assert.equal(gl.getError(), gl.NO_ERROR, 'no error left pending');
  accum.dispose();
});

ok('regression: step() still throws on an error from its own passes', () => {
  const gl = makeMockGL();
  const bridge = makeMockBridge(gl);
  const accum = createAccum(gl, bridge, { width: 64, height: 40 });
  accum.begin('#101010');
  const frameTex = gl.createTexture();
  const p = accumRecipeParams({ fade: 0.88, optics: 0, tunnel: 0, prism: 0 });
  // Poison getError so the post-step check sees an error: the invariant
  // (real ACCUM-pass failures are loud) must survive the drain fix.
  // The drain consumes the first call; the post-step check is the second.
  let calls = 0;
  gl.getError = () => (++calls <= 1 ? gl.NO_ERROR : gl.INVALID_OPERATION);
  assert.throws(() => accum.step(frameTex, p), /GL error after step/,
    'genuine pass error still throws');
  accum.dispose();
});

// --- #309: half-res ACCUM feedback pair -----------------------------------

ok('#309: default resDiv keeps the full-size pair (unchanged behavior)', () => {
  const gl = makeMockGL();
  const bridge = makeMockBridge(gl);
  const accum = createAccum(gl, bridge, { width: 64, height: 40 });
  accum.begin('#000000');
  const t = accum.texture();
  assert.equal(t.w, 64, 'pair width');
  assert.equal(t.h, 40, 'pair height');
  accum.dispose();
});

ok('#309: resDiv=2 allocates the feedback pair at half size', () => {
  const gl = makeMockGL();
  const bridge = makeMockBridge(gl);
  const accum = createAccum(gl, bridge, { width: 64, height: 40, resDiv: 2 });
  accum.begin('#000000');
  const t = accum.texture();
  assert.equal(t.w, 32, 'pair width is half');
  assert.equal(t.h, 20, 'pair height is half');
  // step() runs the resample pass and returns the half-size target.
  const frameTex = gl.createTexture();
  const p = accumRecipeParams({ fade: 0.88, optics: 0, tunnel: 0, prism: 0 });
  const out = accum.step(frameTex, p, { width: 64, height: 40 });
  assert.equal(out.w, 32, 'step returns the half-size target');
  assert.equal(out.h, 20);
  accum.dispose();
});

ok('#309: resize keeps the divisor (pair stays half-size)', () => {
  const gl = makeMockGL();
  const bridge = makeMockBridge(gl);
  const accum = createAccum(gl, bridge, { width: 64, height: 40, resDiv: 2 });
  accum.begin('#000000');
  accum.resize(64, 40);
  const t = accum.texture();
  assert.equal(t.w, 32, 'pair width still half after resize');
  assert.equal(t.h, 20, 'pair height still half after resize');
  accum.dispose();
});

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

    const runProbe = async ({ w = 12, h = 12, bg = '#000000', fade = 0.9, optics = 0, tunnel = 0, prism = 0, flow = 0, echoes = 0, audio = null, stipple = null, frames }) => {
      const res = await page.evaluate((p) => window.__kcAccumProbe(p), {
        w, h, bg, fade, optics, tunnel, prism, flow, echoes, echoWidth: w, audio, stipple,
        frames: frames.map(bytesOf),
      });
      return { gpu: f64Of(res.pixels), w: res.width, h: res.height };
    };
    const mirrorSeq = ({ w, h, bg, fade, optics, tunnel = 0, prism = 0, flow = 0, echoes = 0, audio = null, stipple = null, frames }) => {
      const bgV = [0, 1, 2].map((i) => parseInt(bg.slice(1 + i * 2, 3 + i * 2), 16) / 255);
      let acc = new Float64Array(w * h * 4);
      for (let i = 0; i < w * h; i++) { acc[i * 4] = bgV[0]; acc[i * 4 + 1] = bgV[1]; acc[i * 4 + 2] = bgV[2]; acc[i * 4 + 3] = 1; }
      const base = accumRecipeParams({ fade, optics, tunnel, prism, flow, echoes, echoWidth: w });
      if (stipple !== null && stipple !== undefined) base.stipple = stipple;
      const echo = createEchoState();
      let i = 0;
      for (const f of frames) {
        const params = audio ? applyAudioEnvelope(base, audio[i] || {}) : base;
        acc = mirrorAccumStep({ accum: acc, frame: f, w, h, params, echo });
        i++;
      }
      // The probe resolves the 16F accum buffer through an RGBA8 target
      // (COPY_FS), which clamps super-white glow lift to 1.0 — the mirror
      // models the linear-light recipe, so clamp here to compare against
      // what the probe can actually return (#308: the additive glow pushes
      // bright cores past 1.0 by design).
      for (let k = 0; k < acc.length; k++) acc[k] = Math.min(1, Math.max(0, acc[k]));
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

    await okAsync('probe: optics 1 visibly glows (GPU = mirror)', async () => {
      // 64x64: a realistic scale for the recipe's glow lods — the mip
      // chain reads a 8x8 base at lods ~3 (bloom) and ~4.6 (halation),
      // so the glow is broad and soft, not a tight halo.
      const w = 64, h = 64;
      // Bright block: the additive glow lifts the block core past 1.0 and
      // the probe's 8-bit readback clamps it — mirrorSeq clamps the same
      // way, so the bloom/halation add stays measurable without the
      // saturation breaking parity.
      const frames = [whiteBlock(w, h, 26, 26, 12, 1)];
      // Tight parity with the stipple gate off: no hash-thresholded binary
      // decision, so the GPU's float32 mip filtering and the mirror's
      // float64 chain agree to a few LSB.
      const { gpu } = await runProbe({ w, h, fade: 1, optics: 1, stipple: 0, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 1, optics: 1, stipple: 0, frames });
      closeTo(gpu, ref, 6 * LSB, 'glow step (stipple off)');
      const at = (x, y) => gpu[(y * w + x) * 4];
      assert.ok(at(48, 32) > 0.003, `glow bleeds ten pixels past the block, got ${at(48, 32).toFixed(4)}`);
      const sum = (buf) => { let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i + 1] + buf[i + 2]; return s; };
      const plain = await runProbe({ w, h, fade: 1, optics: 0, frames });
      assert.ok(sum(gpu) > sum(plain.gpu) * 1.01, 'bloom + halation add light (not just redistribute)');
      // Warm bias: halation adds more red than blue.
      const hal = (buf) => { let r = 0, b = 0; for (let i = 0; i < buf.length; i += 4) { r += buf[i]; b += buf[i + 2]; } return r - b; };
      assert.ok(hal(gpu) > hal(plain.gpu), 'optics shift the added light warm/red');
      // The frame itself lands sharp — no blur-over-time.
      assert.ok(at(30, 30) > 0.99, 'the block interior is untouched at full weight');
    });

    await okAsync('probe: stipple diffusion is live and statistically matches the mirror', async () => {
      // With the gate on, the glow is hash-thresholded per dot: a pixel
      // whose glow value sits within float noise of the hash threshold
      // flips between GPU and mirror, so worst-pixel parity is the wrong
      // bar. The hash itself is bit-exact (16-bit quantized); agreement is
      // statistical — sparse flipped dots, tiny mean difference.
      const w = 64, h = 64;
      const frames = [whiteBlock(w, h, 26, 26, 12, 1)];
      const { gpu } = await runProbe({ w, h, fade: 1, optics: 1, frames });
      const ref = mirrorSeq({ w, h, bg: '#000000', fade: 1, optics: 1, frames });
      const diffs = [];
      for (let i = 0; i < gpu.length; i++) diffs.push(Math.abs(gpu[i] - ref[i]));
      diffs.sort((a, b) => a - b);
      const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const p995 = diffs[Math.floor(diffs.length * 0.995)];
      assert.ok(mean < 4 * LSB, `stippled glow: mean Δ ${mean.toFixed(4)} < 4 LSB`);
      assert.ok(p995 < 24 * LSB, `stippled glow: 99.5th pct Δ ${p995.toFixed(4)} < 24 LSB`);
      // And the gate genuinely changes the picture: stipple on vs off.
      const { gpu: smooth } = await runProbe({ w, h, fade: 1, optics: 1, stipple: 0, frames });
      let gateDelta = 0;
      for (let i = 0; i < gpu.length; i++) gateDelta = Math.max(gateDelta, Math.abs(gpu[i] - smooth[i]));
      assert.ok(gateDelta > 0.02, `the stipple gate visibly breaks up the glow (max Δ ${gateDelta.toFixed(3)})`);
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
      // Total light (not the center pixel): the audio-swollen optics adds
      // glow light around the dot while the punched-up keep makes the
      // trail as a whole survive longer.
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

    await okAsync('#309 e2e: velocity smear stretches instances along their motion', async () => {
      // Two frames, one instance shifted +24u in x: the second frame's
      // instance carries velocity (24, 0) -> smk = min(24*0.06, 1) = 1,
      // so the quad doubles along x. fade ~0 kills the trails, leaving
      // only the smeared frame; the plain single render is the control.
      const { getScene } = await import('./parity/corpus.mjs');
      const { buildSceneContract: bsc } = await import('./sceneContract.js');
      const doc = getScene('single-basic').doc;
      const rl = resolveLayers(doc, { caps, motion: 'auto', progress: 0.5 });
      const c1 = bsc({ doc, resolvedLayers: rl, caps, accum: { enabled: true, fade: 0.9, optics: 0, background: '#000000' } });
      const c2 = JSON.parse(JSON.stringify(c1));
      for (const it of c2.instances) it.x += 24;
      const seq = await renderAccumViaGL([c1, c2], { width: 200, height: 140, bg: '#000000', fade: 0.01, optics: 0 });
      const single = await renderViaGL(c2, { width: 200, height: 140, bg: '#000000' });
      // Inked-pixel count: every instance carries velocity (24, 0) ->
      // smk = min(24*0.06, 1) = 1, so each quad doubles along x and the
      // inked area grows ~2x. (Span is the wrong metric here: the scene's
      // 27 instances spread over the canvas dominate the bounding box.)
      const inked = (px) => {
        let c = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] + px[i + 1] + px[i + 2] > 30) c++;
        }
        return c;
      };
      const iSmeared = inked(seq.pixels);
      const iPlain = inked(single.pixels);
      assert.ok(iPlain > 0, 'control render has ink');
      assert.ok(iSmeared > iPlain * 1.4,
        `smeared inked pixels ${iSmeared} vs plain ${iPlain}`);
    });

    await okAsync('#309: resDiv=2 resample is the exact 2x2 box (real GPU)', async () => {
      // 4x4 frame, 2x2 pair: each 2x2 quadrant is a solid color, so the
      // resampled pair must equal the quadrant colors exactly.
      const R = [255, 0, 0, 255], G = [0, 255, 0, 255];
      const B = [0, 0, 255, 255], Wh = [255, 255, 255, 255];
      const frame = [
        R, R, G, G,
        R, R, G, G,
        B, B, Wh, Wh,
        B, B, Wh, Wh,
      ].flat(); // bottom-first rows
      const res = await page.evaluate((p) => window.__kcAccumProbe(p), {
        w: 2, h: 2, resDiv: 2, bg: '#000000', fade: 0.9, optics: 0,
        tunnel: 0, prism: 0, flow: 0, echoes: 0, echoWidth: 2,
        frames: [frame],
      });
      assert.equal(res.width, 2);
      assert.equal(res.height, 2);
      const expected = [R, G, B, Wh].flat(); // bottom-first
      assert.equal(res.pixels.length, expected.length);
      for (let i = 0; i < expected.length; i++) {
        assert.ok(Math.abs(res.pixels[i] - expected[i]) <= 1,
          `byte ${i}: got ${res.pixels[i]}, want ${expected[i]}`);
      }
    });

    await okAsync('#309: resample preserves a solid field at fractional resDiv', async () => {
      // A constant frame must resample to the same constant at ANY factor —
      // guards the u_srcSize plumbing for fractional dprScale.
      const solid = [];
      for (let i = 0; i < 6 * 6; i++) solid.push(200, 100, 50, 255);
      const res = await page.evaluate((p) => window.__kcAccumProbe(p), {
        w: 4, h: 4, resDiv: 1.5, bg: '#000000', fade: 0.9, optics: 0,
        tunnel: 0, prism: 0, flow: 0, echoes: 0, echoWidth: 4,
        frames: [solid],
      });
      assert.equal(res.width, 4);
      assert.equal(res.height, 4);
      for (let i = 0; i < res.pixels.length; i += 4) {
        assert.ok(Math.abs(res.pixels[i] - 200) <= 2, `r solid at ${i / 4}`);
        assert.ok(Math.abs(res.pixels[i + 1] - 100) <= 2, `g solid at ${i / 4}`);
        assert.ok(Math.abs(res.pixels[i + 2] - 50) <= 2, `b solid at ${i / 4}`);
        assert.equal(res.pixels[i + 3], 255, `a solid at ${i / 4}`);
      }
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
