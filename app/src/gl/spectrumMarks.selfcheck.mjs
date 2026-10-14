// node src/gl/spectrumMarks.selfcheck.mjs
// #1482 P3 — spectrum marks. Node half: the dials -> the contract key (off is absent), the shed rung, the wiring from
// the live loop to the renderer's uniforms, and that the shader is gated so off never enters. The GPU half renders
// real marks in headless Chromium: a known spectrum moves exactly the marks that listen to it, and off is byte-identical.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spectrumMarksFor, SPECTRUM_MAPS } from './spectrumMarks.mjs';
import { createSpectrumCore, packSpectrumTexture, TEX_W, TEX_H, LOG_BINS } from './spectrumCore.mjs';
import { buildSceneContract, spectrumMarksShed, contactShadowShed } from './sceneContract.js';
import { getCostTier } from './costTiers.mjs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../data/layout-modes.js';
import './renderer.mjs'; // registers the cost tier

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stateWith = (fill) => { const s = createSpectrumCore().state; for (let i = 0; i < LOG_BINS; i++) { s.smooth[i] = fill(i, 'smooth'); s.peak[i] = fill(i, 'peak'); s.flux[i] = fill(i, 'flux'); } return s; };

// 1. the dials -> the key
{
  const st = stateWith((i) => (i > 100 ? 1 : 0));
  assert.equal(spectrumMarksFor({}, false, st), null, 'no dials: absent');
  assert.equal(spectrumMarksFor({ spectrumScale: 0, spectrumDisplace: 0, spectrumColour: 0, spectrumMap: 3 }, false, st), null, 'a map with no amount is still off');
  assert.equal(spectrumMarksFor({ spectrumScale: 0.5 }, true, st), null, 'shed: absent');
  const k = spectrumMarksFor({ spectrumScale: 0.5, spectrumDisplace: 2, spectrumColour: -1, spectrumMap: 2.4 }, false, st);
  assert.deepEqual([k.map, k.scale, k.displace, k.colour], [2, 0.5, 1, 0], 'clamped to 0..1, the map rounded');
  assert.equal(k.tex.length, TEX_W * TEX_H);
  assert.ok(k.tex[255] > 200 && k.tex[0] === 0, 'row 0 carries the spectrum: low bins quiet, high bins up');
  assert.equal(spectrumMarksFor({ spectrumScale: 'x', spectrumDisplace: NaN, spectrumColour: 0.2, spectrumMap: 'q' }, false, st).map, 0, 'junk is 0, never throws');
  assert.deepEqual(SPECTRUM_MAPS, ['INDEX', 'ANGLE', 'POSITION', 'HASH']);
}

// 2. defaults, ranges, the shed rung, the cost declaration
{
  for (const k of ['spectrumScale', 'spectrumDisplace', 'spectrumColour', 'spectrumMap']) assert.equal(DEFAULT_LAYOUT_PARAMS[k], 0, `${k} defaults to 0 (off)`);
  assert.deepEqual(PARAM_SPEC.spectrumMap, { min: 0, max: 3, int: true });
  assert.deepEqual(PARAM_SPEC.spectrumScale, { min: 0, max: 1 });
  assert.equal(spectrumMarksShed({ perfTier1: true, quality: 'performance' }), true);
  assert.equal(spectrumMarksShed({ perfTier1: true, quality: 'balanced' }), false, 'tier-1 extras first, then this');
  assert.equal(spectrumMarksShed({ perfTier1: false, quality: 'performance' }), false);
  assert.equal(spectrumMarksShed(null), false);
  for (const d of [{ perfTier1: true, quality: 'performance' }, { perfTier1: true, quality: 'balanced' }, {}]) assert.equal(spectrumMarksShed(d), contactShadowShed(d), 'same rung as the contact shadow');
  assert.equal(getCostTier('gl/spectrum-marks').tier, 2);
}

// 3. the contract never carries the key unless the loop attaches it, so every built contract is what it was
{
  const c = buildSceneContract({ doc: { seed: 1, quality: 'balanced' }, resolvedLayers: [] });
  assert.ok(!('spectrum' in c));
}

// 4. wiring and shader gating (static)
{
  const vs = src('./shaders.mjs');
  assert.match(vs, /uniform sampler2D u_spec;/);
  assert.match(vs, /if \(u_specA\.y \+ u_specA\.z \+ u_specA\.w > 0\.0\) \{/, 'the whole branch is gated on an amount');
  assert.match(vs, /if \(specColour > 0\.0\) v_ink = mix\(v_ink, v_accent/, 'colour only moves when asked');
  assert.equal((vs.match(/texelFetch\(u_spec/g) || []).length, 3, 'three lookups: level, peak, onsets');
  const r = src('./renderer.mjs');
  assert.match(r, /spec = contract\.spectrum \|\| null;/);
  assert.match(r, /uploadSpectrum\(\);\s*if \(spec && specTex && specUploaded\) \{/, 'uploaded only when on, and drawn only if it went up');
  assert.match(r, /gl\.uniform4f\(U\(quadProg, 'u_specA'\), 0, 0, 0, 0\);/, 'off sends zeros');
  assert.match(r, /TEXTURE_MIN_FILTER, gl\.NEAREST/, 'R8 without mips must not use the default min filter');
  const ll = src('./liveLoop.mjs');
  assert.match(ll, /spectrumMarksFor\(layoutParams, spectrumMarksShed\(\{ perfTier1: s\.perfTier1, quality: s\.quality \}\)\)/);
  assert.match(ll, /if \(spectrumMarks\) contract\.spectrum = spectrumMarks;/, 'the key is absent when off');
  const ui = src('../panels/StimulusPanel.jsx');
  assert.match(ui, /<SpectrumMarks layoutParams=\{layoutParams\} \/>/);
  const marks = src('./spectrumMarks.mjs');
  assert.ok(!/Date\.now|performance\.now|Math\.random/.test(marks), 'pure');
}
console.log('spectrumMarks node: ok');

// ── GPU: the real renderer in headless Chromium ───────────────────────────────────────────────────────────────────
// Three marks across the canvas; POSITION mapping, so x is the frequency. The spectrum is silent on the left and the
// middle and full on the right: only the right-hand mark may change, and off is byte-identical.
async function runBrowserTests() {
  const { renderViaGL, presentProbeViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const { ASSETS } = await import('../data/assets/index.js');
  const W = 400; const H = 280;
  const pal = { swatches: ['#f2e6d0', '#d8c8a8', '#1b2a4a'], bg: '#f2e6d0' };
  const marks = [100, 500, 900].map((x, i) => ({ assetId: ASSETS[0].id, x, y: 350, scale: 1.1, rotation: 0, color: '#e05030', accent: '#2030e0', alpha: 100, key: `m${i}` }));
  const contract = () => buildSceneContract({
    doc: { seed: 1, quality: 'balanced' },
    resolvedLayers: [{ id: 'c', layer: { id: 'c', name: 'c' }, layoutParams: { blendMode: 'normal' }, palette: pal, items: marks, layerOpacity: 1, layerBlendMode: 'normal' }],
  });
  const withSpec = (over) => {
    const c = contract();
    const st = stateWith((i, row) => (i > 100 ? (over.rows ? over.rows[row] : 1) : 0));
    const base = { map: 2, scale: 0, displace: 0, colour: 0, tex: Array.from(packSpectrumTexture(st)) }; // the parity driver serialises the contract: a plain array
    c.spectrum = { ...base, ...over.k };
    return c;
  };
  const render = async (c) => (await renderViaGL(c, { width: W, height: H, bg: '#f2e6d0' })).pixels;
  // the LIVE renderer takes colour from the ink/accent uniforms (the offline one reads it baked into the atlas)
  const renderLive = async (c) => (await presentProbeViaGL(c, { width: W, height: H, bg: '#f2e6d0' })).readback;
  const region = (buf, x0, x1) => { const out = []; for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; out.push(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]); } return Buffer.from(out); };
  const L = [0, 133]; const M = [133, 266]; const R = [266, 400];
  const diffPx = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) n++; return n; };
  let BG = [0xf2, 0xe6, 0xd0]; // replaced by the frame's own corner pixel once there is a frame
  const inkPx = (buf) => { let n = 0; for (let i = 0; i < buf.length; i += 4) if (Math.abs(buf[i] - BG[0]) + Math.abs(buf[i + 1] - BG[1]) + Math.abs(buf[i + 2] - BG[2]) > 24) n++; return n; };
  try {
    const off = await render(contract());
    BG = [off[0], off[1], off[2]];
    assert.ok(inkPx(off) > 500, 'fixture: marks are drawn');

    const off2 = await render(contract());
    assert.equal(Buffer.compare(off2, off), 0, 'fixture: two renders of the same contract agree');
    const zero = await render(withSpec({ k: { scale: 0, displace: 0, colour: 0 } }));
    assert.equal(Buffer.compare(zero, off), 0, 'a key with every amount at 0 is byte-identical to no key');

    // SCALE: the right-hand mark grows; the two that hear nothing are untouched
    const sc = await render(withSpec({ k: { scale: 1 } }));
    assert.equal(Buffer.compare(region(sc, ...L), region(off, ...L)), 0, 'the left mark hears silence: unchanged');
    assert.equal(Buffer.compare(region(sc, ...M), region(off, ...M)), 0, 'the middle mark hears silence: unchanged');
    assert.ok(inkPx(region(sc, ...R)) > inkPx(region(off, ...R)) * 1.3, `the right mark grew (${inkPx(region(off, ...R))} -> ${inkPx(region(sc, ...R))} px)`);

    // DISPLACE listens to onsets (flux): moved, not resized
    const dp = await render(withSpec({ k: { displace: 1 } }));
    assert.equal(Buffer.compare(region(dp, ...L), region(off, ...L)), 0);
    assert.equal(Buffer.compare(region(dp, ...M), region(off, ...M)), 0);
    assert.ok(diffPx(region(dp, ...R), region(off, ...R)) > 100, 'the right mark was pushed');
    assert.ok(Math.abs(inkPx(region(dp, ...R)) - inkPx(region(off, ...R))) < inkPx(region(off, ...R)) * 0.08, 'pushed, not resized');

    // COLOUR listens to peaks: the live path, same silhouette, different ink
    const liveOff = await renderLive(contract());
    const liveCo = await renderLive(withSpec({ k: { colour: 1 } }));
    assert.equal(Buffer.compare(region(liveCo, ...L), region(liveOff, ...L)), 0, 'the left mark hears silence: unchanged');
    assert.equal(Buffer.compare(region(liveCo, ...M), region(liveOff, ...M)), 0, 'the middle mark hears silence: unchanged');
    assert.ok(diffPx(region(liveCo, ...R), region(liveOff, ...R)) > 50, 'the right mark changed colour');
    BG = [liveOff[0], liveOff[1], liveOff[2]];
    assert.ok(Math.abs(inkPx(region(liveCo, ...R)) - inkPx(region(liveOff, ...R))) < inkPx(region(liveOff, ...R)) * 0.05, 'same silhouette');
    console.log(`spectrumMarks GPU: ok — scale ${inkPx(region(off, ...R))} -> ${inkPx(region(sc, ...R))} px on the listening mark, silent marks byte-identical`);
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser spectrum-marks tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log('spectrumMarks.selfcheck: ok (#1482 P3 spectrum marks)');
