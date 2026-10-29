// #1813 — wet-look display pass: recipe table, regime ramp, ground
// steering, and the perceptual behaviour asserted as region statistics
// over the JS mirror (shadeWetPixel), with the GLSL pinned to the same
// shape so the two cannot drift. Renderer/loop wiring and the cost
// registration are pinned from source, like the resolve suite does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { WET_LOOK, WET_LOOK_FS, shadeWetPixel, wetGroundFromCss, wetLookFactor, wetLookLuma } from './wetLook.mjs';
import { WET_REGIMES } from './wetFrame.mjs';
import { RENDERER_PROGRAMS } from './renderer.mjs';
import { getCostTier } from './costTiers.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

let checks = 0;
const ok = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  [ok] ${name}`);
};

const DAMP = WET_REGIMES[0].at; // 0.05
const SOAKED = WET_REGIMES[2].at; // 0.8
const DARK_BG = [0.02, 0.02, 0.025];
const PAPER_BG = [0.93, 0.91, 0.86];
const U = (bg, extra = {}) => ({ amount: 1, damp: DAMP, full: SOAKED, bg, ...extra });
const satProxy = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(wetLookLuma(c), 1e-6);

// --- the recipe table -------------------------------------------------------
ok('recipe: frozen constants, sane ranges, paper darkens harder than the skew', () => {
  assert.ok(Object.isFrozen(WET_LOOK));
  for (const k of ['saturation', 'skew', 'paperSkew', 'sheen']) {
    assert.ok(WET_LOOK[k] > 0 && WET_LOOK[k] <= 1, `${k} in (0, 1]`);
  }
  assert.ok(WET_LOOK.paperSkew > WET_LOOK.skew, 'wet paper darkens more than the glossy skew');
  assert.ok(WET_LOOK.sheenPow >= 4, 'the sheen gate is highlight-tight');
  assert.ok(WET_LOOK.groundSplit > 0 && WET_LOOK.groundSplit < 1);
});

// --- the ground parse is the fade target's parse ----------------------------
ok('ground: wetGroundFromCss follows the #287 fade-target rule', () => {
  assert.deepEqual(wetGroundFromCss('#ffffff'), [1, 1, 1]);
  assert.deepEqual(wetGroundFromCss('#fff'), [1, 1, 1], '3-digit shorthand expands like the fade');
  assert.deepEqual(wetGroundFromCss('#000000'), [0, 0, 0]);
  assert.deepEqual(wetGroundFromCss('not-a-colour'), [0, 0, 0], 'unparseable → black');
  assert.deepEqual(wetGroundFromCss(null), [0, 0, 0]);
  const mid = wetGroundFromCss('#808080');
  assert.ok(Math.abs(mid[0] - 128 / 255) < 1e-9);
  // The class split the shader steers by: a paper palette is light, a stage palette is dark.
  assert.ok(wetLookLuma(wetGroundFromCss('#f2ead8')) >= WET_LOOK.groundSplit, 'cream paper reads light');
  assert.ok(wetLookLuma(wetGroundFromCss('#101014')) < WET_LOOK.groundSplit, 'stage black reads dark');
});

// --- the regime ramp ---------------------------------------------------------
ok('ramp: damp is the floor, soaked is full, monotone between', () => {
  assert.equal(wetLookFactor(0, DAMP, SOAKED), 0);
  assert.equal(wetLookFactor(DAMP, DAMP, SOAKED), 0, 'at damp, still untouched');
  assert.equal(wetLookFactor(DAMP / 2, DAMP, SOAKED), 0, 'below damp, untouched');
  assert.equal(wetLookFactor(SOAKED, DAMP, SOAKED), 1);
  assert.equal(wetLookFactor(1, DAMP, SOAKED), 1);
  let prev = 0;
  for (let w = DAMP; w <= SOAKED; w += 0.05) {
    const f = wetLookFactor(w, DAMP, SOAKED);
    assert.ok(f >= prev && f <= 1, 'monotone, clamped');
    prev = f;
  }
});

// --- byte-identity: dry field, below damp, zero amount -----------------------
ok('identity: dry / below-damp / zero-amount pixels pass through exactly', () => {
  const pixels = [
    [0, 0, 0],
    [0.75, 0.08, 0.05],
    [0.95, 0.95, 0.95],
    [2.0, 1.8, 1.6],
    [0.001, 0.5, 0.999],
  ];
  for (const bg of [DARK_BG, PAPER_BG]) {
    for (const px of pixels) {
      assert.deepEqual(shadeWetPixel(px, 0, U(bg)), px, 'dry mask');
      assert.deepEqual(shadeWetPixel(px, DAMP - 0.01, U(bg)), px, 'below damp');
      assert.deepEqual(shadeWetPixel(px, 1, { ...U(bg), amount: 0 }), px, 'zero amount');
    }
  }
});

// --- scene class 1: dark ground, saturated marks -----------------------------
ok('dark ground: wet region saturates and skews darker, dry region untouched', () => {
  const marks = [
    [0.6, 0.12, 0.08], // saturated red
    [0.1, 0.5, 0.15], // mid green
    [0.2, 0.25, 0.7], // deep blue
  ];
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const dryLuma = mean(marks.map(wetLookLuma));
  const drySat = mean(marks.map(satProxy));
  const wet = marks.map((px) => shadeWetPixel(px, SOAKED, U(DARK_BG)));
  const wetLuma = mean(wet.map(wetLookLuma));
  const wetSat = mean(wet.map(satProxy));
  assert.ok(wetLuma < dryLuma * 0.8, `wet luma ${wetLuma.toFixed(3)} < dry ${dryLuma.toFixed(3)} (skew darker)`);
  assert.ok(wetSat > drySat * 1.2, `wet saturation ${wetSat.toFixed(2)} > dry ${drySat.toFixed(2)} (deepens)`);
  for (let i = 0; i < marks.length; i++) assert.deepEqual(shadeWetPixel(marks[i], 0, U(DARK_BG)), marks[i]);
});

ok('dark ground: brights hold under the skew; HDR holds exactly', () => {
  const noSheenNoSat = { ...WET_LOOK, sheen: 0, saturation: 0 };
  const bright = shadeWetPixel([0.95, 0.95, 0.95], SOAKED, U(DARK_BG, { recipe: noSheenNoSat }));
  assert.ok(Math.abs(bright[0] - 0.95) <= 0.03, `bright holds within 3% (got ${bright[0].toFixed(3)})`);
  const hdr = [2.0, 1.8, 1.6];
  assert.deepEqual(
    shadeWetPixel(hdr, SOAKED, U(DARK_BG, { recipe: noSheenNoSat })),
    hdr,
    'L ≥ 1: skew ratio is exactly 1',
  );
});

ok('dark ground: sheen lifts only the brightest wet pixels, from their own light', () => {
  const bright = shadeWetPixel([0.95, 0.95, 0.95], SOAKED, U(DARK_BG));
  const noSheen = shadeWetPixel([0.95, 0.95, 0.95], SOAKED, U(DARK_BG, { recipe: { ...WET_LOOK, sheen: 0 } }));
  assert.ok(bright[0] - noSheen[0] > 0.1, `highlight lift is real (got ${(bright[0] - noSheen[0]).toFixed(3)})`);
  const mid = shadeWetPixel([0.4, 0.4, 0.4], SOAKED, U(DARK_BG));
  const midNoSheen = shadeWetPixel([0.4, 0.4, 0.4], SOAKED, U(DARK_BG, { recipe: { ...WET_LOOK, sheen: 0 } }));
  assert.ok(Math.abs(mid[0] - midNoSheen[0]) < 0.005, 'mid pixels get no sheen');
  const dryBright = shadeWetPixel([0.95, 0.95, 0.95], 0, U(DARK_BG));
  assert.deepEqual(dryBright, [0.95, 0.95, 0.95], 'dry highlights never lift');
});

// --- scene class 2: light paper ground ---------------------------------------
ok('paper: the ground itself darkens, far past the dark-ground bright hold', () => {
  const wetGround = shadeWetPixel(PAPER_BG, SOAKED, U(PAPER_BG));
  const drop = 1 - wetLookLuma(wetGround) / wetLookLuma(PAPER_BG);
  assert.ok(drop > 0.3, `paper ground darkens materially (drop ${(drop * 100).toFixed(0)}%)`);
  const ink = shadeWetPixel([0.1, 0.08, 0.06], SOAKED, U(PAPER_BG));
  assert.ok(wetLookLuma(ink) < 0.08, 'ink on wet paper darkens too');
});

ok('paper: nothing ever brightens — full sweep, shipped recipe', () => {
  const vals = [0, 0.05, 0.2, 0.5, 0.8, 1.0, 1.6];
  for (const r of vals)
    for (const g of vals)
      for (const b of vals)
        for (const w of [0.1, 0.35, 0.8, 1.0]) {
          const out = shadeWetPixel([r, g, b], w, U(PAPER_BG));
          for (let i = 0; i < 3; i++)
            assert.ok(out[i] <= [r, g, b][i] + 1e-9, `paper brightened ${[r, g, b]} @${w} → ${out}`);
        }
});

ok('paper: the sheen term contributes exactly nothing', () => {
  for (const px of [
    [1, 1, 1],
    [0.9, 0.85, 0.8],
    [0.6, 0.12, 0.08],
  ]) {
    const withSheen = shadeWetPixel(px, SOAKED, U(PAPER_BG));
    const without = shadeWetPixel(px, SOAKED, U(PAPER_BG, { recipe: { ...WET_LOOK, sheen: 0 } }));
    assert.deepEqual(withSheen, without, 'paper brightens never — sheen is dark-ground only');
  }
});

// --- scene class 3: monochrome ------------------------------------------------
ok('monochrome: grey stays grey at every wetness, mid greys skew darker, black holds', () => {
  for (const bg of [DARK_BG, PAPER_BG]) {
    for (const v of [0.05, 0.2, 0.5, 0.8, 0.95]) {
      for (const w of [0.1, 0.35, 0.8]) {
        const out = shadeWetPixel([v, v, v], w, U(bg));
        assert.ok(Math.max(...out) - Math.min(...out) <= 1e-9, `grey ${v} @${w} stays grey`);
      }
    }
    assert.deepEqual(shadeWetPixel([0, 0, 0], SOAKED, U(bg)), [0, 0, 0], 'black holds exactly');
  }
  let prev = Infinity;
  for (const w of [0.1, 0.2, 0.35, 0.5, 0.8]) {
    const l = wetLookLuma(shadeWetPixel([0.5, 0.5, 0.5], w, U(DARK_BG)));
    assert.ok(l < prev, 'mid grey darkens monotonically with wetness');
    prev = l;
  }
});

// --- the GLSL is the mirror's shape -------------------------------------------
ok('glsl: program def carries the shader and the exact uniform list', () => {
  const def = RENDERER_PROGRAMS.find((d) => d.key === 'wetlook');
  assert.ok(def, 'renderer program table has wetlook');
  assert.equal(def.fs, WET_LOOK_FS);
  assert.equal(def.fsFile, 'wetLook.mjs:WET_LOOK_FS');
  const declared = [];
  const re = /uniform\s+\w+\s+(\w+)\s*;/g;
  let m;
  while ((m = re.exec(WET_LOOK_FS))) declared.push(m[1]);
  assert.deepEqual(declared.sort(), [...def.uniforms].sort(), 'declared uniforms == upload list');
});

ok('glsl: regime ramp, passthrough, per-ground curves, no rim, no clock', () => {
  assert.match(WET_LOOK_FS, /\(w - u_damp\) \/ max\(u_full - u_damp/, 'effect ramps between the named thresholds');
  assert.match(WET_LOOK_FS, /t \* t \* \(3\.0 - 2\.0 \* t\)/, 'smoothstep-shaped ramp');
  assert.match(WET_LOOK_FS, /if \(f <= 0\.0\) \{ o = s; return; \}/, 'below damp: bit-exact passthrough');
  assert.match(WET_LOOK_FS, /1\.0 \+ \(Lc - 1\.0\) \* \(u_skew \* f\)/, 'dark-ground skew (brights hold)');
  assert.match(WET_LOOK_FS, /1\.0 - u_paperSkew \* f \* \(0\.5 \+ 0\.5 \* Lc\)/, 'paper curve');
  assert.match(WET_LOOK_FS, /1\.0 \+ u_sat \* f/, 'saturation rise');
  assert.match(WET_LOOK_FS, /pow\(min\(L2, 1\.0\), u_sheenPow\)/, 'sheen gated by own luminance');
  assert.match(WET_LOOK_FS, /if \(!light && u_sheen > 0\.0\)/, 'sheen is dark-ground only');
  assert.match(WET_LOOK_FS, /if \(light\) c = min\(c, cIn\);/, 'paper cap: no channel exceeds its input');
  assert.ok(!/edge/i.test(WET_LOOK_FS), 'no rim/edge term: #1812 darkens in the pack, never twice');
  assert.ok(!/time/i.test(WET_LOOK_FS), 'pure function of frame + field: no clock, no state');
});

// --- wiring + cost --------------------------------------------------------------
ok('wiring: renderer runs the pass in presentUpscaled; loop arms it from the served field', () => {
  const renderer = read('./renderer.mjs');
  assert.match(renderer, /b\.progs\.wetlook/, 'renderer draws the wetlook program');
  assert.match(renderer, /present\(applyWetLook\(dst\)\)/, 'pass sits between upscale and resolve');
  assert.match(renderer, /function setWetLook\(/, 'renderer takes the per-frame state');
  const loop = read('./liveLoop.mjs');
  assert.match(loop, /live\.setWetLook\(/, 'loop pushes the state every frame');
  assert.match(loop, /accumParams\.wetMask/, 'armed from the served field pack');
  assert.match(loop, /WET_REGIMES\[0\]\.at/, 'damp threshold from the service table');
  assert.match(loop, /WET_REGIMES\[2\]\.at/, 'soaked threshold from the service table');
  assert.match(loop, /wetGroundFromCss\(bgCss\)/, 'ground is the frame bg, parsed the fade way');
  assert.ok(!loop.includes('layoutParams.wetLook'), 'no new layout param (replay-divergence trap)');
  assert.ok(!Object.keys(DEFAULT_LAYOUT_PARAMS).some((k) => /wetlook/i.test(k)), 'defaults carry no wet-look key');
});

ok('cost: renderer/wetlook is declared in the registry', () => {
  const tier = getCostTier('renderer/wetlook');
  assert.ok(tier, 'registered');
  assert.equal(tier.tier, 0, 'presentation plumbing, never shed — the upscale class');
  assert.ok(tier.timeMs > 0 && tier.notes.includes('#1813'));
});

ok('manifest: the suite is wired into selfcheck.manifest', () => {
  const manifest = readFileSync(join(here, '../../selfcheck.manifest'), 'utf8');
  assert.ok(manifest.includes('node src/gl/wetLook.selfcheck.mjs'), 'manifest line present');
});

console.log(`wetLook.selfcheck: ${checks} checks passed`);
