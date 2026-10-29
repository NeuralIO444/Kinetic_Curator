// pigmentKM.selfcheck.mjs — #1811: Kubelka-Munk pigment colour, pure
// functions only (no GL, no field). The mixture test by name, the
// derivation's determinism, and the finite-layer limits. Measured
// values behind every band are in docs/review/1811/.
import assert from 'node:assert';
import {
  deriveKM,
  kmCacheSize,
  kmConstantsForColor,
  KM_BANDS,
  KM_THICKNESS,
  mixColorsRgb,
  mixturePigmentColor,
  mixtureSpectrum,
  spectrumFromRgb,
  spectrumToRgb,
} from './pigmentKM.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const BLUE = [0.1, 0.25, 0.85];
const YELLOW = [0.95, 0.8, 0.1];
const RED = [0.85, 0.1, 0.1];
const near = (a, b, tol, label) =>
  assert.ok(Math.abs(a - b) <= tol, `${label}: ${a.toFixed(4)} vs ${b.toFixed(4)} (tol ${tol})`);

ok('derivation is deterministic and the cache returns the identical object', () => {
  const a = deriveKM(BLUE);
  const b = deriveKM(BLUE);
  assert.deepStrictEqual(Array.from(a.K), Array.from(b.K));
  assert.deepStrictEqual(Array.from(a.S), Array.from(b.S));
  assert.strictEqual(a.rho, b.rho);
  const before = kmCacheSize();
  const c1 = kmConstantsForColor(BLUE);
  const c2 = kmConstantsForColor(BLUE);
  assert.strictEqual(c1, c2, 'same colour → same frozen object');
  assert.strictEqual(kmCacheSize(), before + 1, 'derived once, then cached');
  assert.deepStrictEqual(Array.from(c1.K), Array.from(a.K), 'cached path == pure path');
});

ok('spectrum reconstruction round-trips: primaries, grey, white, palette colours', () => {
  // The representation property (distinct from mixture behaviour):
  // spectrum → rgb returns the colour within projection tolerance.
  // White and grey are exact by the basis normalization's construction.
  for (const c of [[1, 0, 0], [0, 1, 0], [0, 0, 1], BLUE, YELLOW, RED, [0.8, 0.3, 0.15], [1, 0.75, 0.8]]) {
    const rt = spectrumToRgb(spectrumFromRgb(c));
    for (let ch = 0; ch < 3; ch++) near(rt[ch], c[ch], 0.02, `roundtrip ${c} ch${ch}`);
  }
  for (let ch = 0; ch < 3; ch++) {
    near(spectrumToRgb(spectrumFromRgb([1, 1, 1]))[ch], 1, 1e-6, `white ch${ch} (exact by construction)`);
    near(spectrumToRgb(spectrumFromRgb([0.5, 0.5, 0.5]))[ch], 0.5, 1e-6, `grey ch${ch} (exact by construction)`);
  }
});

ok('THE MIXTURE TEST: blue + yellow renders a living green, not RGB grey', () => {
  const mix = mixColorsRgb([
    { rgb: BLUE, c: 0.5 },
    { rgb: YELLOW, c: 0.5 },
  ]);
  const naive = BLUE.map((v, i) => (v + YELLOW[i]) / 2);
  const sat = (c) => Math.max(...c) - Math.min(...c);
  // Measured on the pinned constants (docs/review/1811/): KM gives
  // (0.165, 0.560, 0.253) — green-dominant, saturation 0.395 — where
  // the channel average gives (0.525, 0.525, 0.475), saturation 0.050.
  // Bands sit well inside both measurements; a lerp "KM" fails the
  // saturation factor and the green-dominance margin by construction.
  assert.ok(mix[1] > mix[0] + 0.25, `green dominates red (${mix.map((v) => v.toFixed(3))})`);
  assert.ok(mix[1] > mix[2] + 0.2, `green dominates blue (${mix.map((v) => v.toFixed(3))})`);
  assert.ok(mix[1] >= 0.45 && mix[1] <= 0.7, `green channel in the living band (${mix[1].toFixed(3)})`);
  assert.ok(sat(mix) >= 3 * sat(naive), `KM saturation ${sat(mix).toFixed(3)} vs naive ${sat(naive).toFixed(3)}`);
  // The pigment identity the field stores for the same mixture wears
  // the same green (R∞ of the mixed spectrum, thickness-independent).
  const pigment = mixturePigmentColor([
    { rgb: BLUE, c: 0.5 },
    { rgb: YELLOW, c: 0.5 },
  ]);
  assert.ok(pigment[1] > pigment[0] + 0.25 && pigment[1] > pigment[2] + 0.2, `stored pigment is green (${pigment})`);
});

ok('subtractive signature: mixtures darken toward the absorbing pigment', () => {
  // Blue + red: both pigments absorb green; the mixture's luminance
  // falls BELOW either input's — impossible for any averaging mix.
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const mix = mixColorsRgb([
    { rgb: BLUE, c: 0.5 },
    { rgb: RED, c: 0.5 },
  ]);
  assert.ok(
    lum(mix) < Math.min(lum(BLUE), lum(RED)),
    `mix lum ${lum(mix).toFixed(3)} < ${Math.min(lum(BLUE), lum(RED)).toFixed(3)}`,
  );
  // Red + yellow runs the other way — orange, red-dominant, bright:
  // the model is subtractive per band, not a universal darkener.
  const orange = mixColorsRgb([
    { rgb: RED, c: 0.5 },
    { rgb: YELLOW, c: 0.5 },
  ]);
  assert.ok(
    orange[0] > 0.9 && orange[1] > 0.12 && orange[1] < 0.35 && orange[2] < 0.2,
    `orange (${orange.map((v) => v.toFixed(3))})`,
  );
});

ok('concentration steers the mixture (more yellow → brighter, greener-yellow)', () => {
  const yHeavy = mixColorsRgb([
    { rgb: BLUE, c: 0.25 },
    { rgb: YELLOW, c: 0.75 },
  ]);
  const bHeavy = mixColorsRgb([
    { rgb: BLUE, c: 0.75 },
    { rgb: YELLOW, c: 0.25 },
  ]);
  assert.ok(yHeavy[1] > bHeavy[1], 'yellow-heavy mix is greener');
  assert.ok(bHeavy[2] > yHeavy[2], 'blue-heavy mix keeps more blue');
});

ok('finite-layer limits: no pigment → paper exactly; thick → R∞ closed form', () => {
  const none = mixtureSpectrum([{ ...kmConstantsForColor(BLUE), c: 0 }]);
  for (let i = 0; i < KM_BANDS; i++) assert.strictEqual(none[i], 1, 'zero concentration is the paper');
  const km = kmConstantsForColor(BLUE);
  const thick = mixtureSpectrum([{ K: km.K, S: km.S, c: 400 }]);
  for (let i = 0; i < KM_BANDS; i++) {
    const ks = km.K[i] / km.S[i];
    const rInf = 1 + ks - Math.sqrt(ks * ks + 2 * ks);
    near(thick[i], rInf, 0.01, `band ${i} tends to R∞`);
  }
  // A single colour at unit load sits between paper and its R∞ colour —
  // a wash, not a bulk sample — and stays recognizably itself.
  const self = mixColorsRgb([{ rgb: YELLOW, c: 1 }]);
  near(self[0], YELLOW[0], 0.15, 'yellow wash red');
  near(self[1], YELLOW[1], 0.15, 'yellow wash green');
  near(self[2], YELLOW[2], 0.15, 'yellow wash blue');
  assert.ok(KM_THICKNESS > 0);
});

ok('character derivation: ranges, and the heuristic directions hold', () => {
  const black = kmConstantsForColor([0, 0, 0]);
  const white = kmConstantsForColor([1, 1, 1]);
  const earth = kmConstantsForColor([0.55, 0.42, 0.3]);
  const vivid = kmConstantsForColor([0.1, 0.9, 0.2]);
  for (const km of [black, white, earth, vivid]) {
    assert.ok(km.rho >= 0.35 && km.rho <= 1.2, `rho in range (${km.rho})`);
    assert.ok(km.omega >= 0 && km.omega <= 1, `omega in range (${km.omega})`);
    assert.ok(km.gamma >= 0 && km.gamma <= 1, `gamma in range (${km.gamma})`);
  }
  assert.ok(black.rho > white.rho, 'darker pigment is denser (settles faster)');
  assert.ok(black.omega > white.omega, 'absorbing pigment stains (resists lift)');
  assert.ok(earth.gamma > vivid.gamma, 'earthy colour granulates more than a vivid one');
});

console.log(`pigmentKM.selfcheck: ${n} checks passed`);
