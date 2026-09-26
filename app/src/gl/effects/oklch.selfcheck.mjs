// node src/gl/effects/oklch.selfcheck.mjs — #591 OKLCH grade.
//
// The GLSL runs on a GPU; this validates the COLOUR SCIENCE it encodes, using
// the coefficients parsed straight out of the shipped chunk source. That
// matters: a JS re-implementation would only ever test itself, and would keep
// passing while the shader drifted. Parsed, an edit to the matrices changes
// these numbers too — the round-trip and lightness properties still have to hold.
import assert from 'node:assert';
import { COMMON_GLSL, COMMON_VERSION, CHUNK_INDEX } from './chunks.mjs';
import { FX_GRADE_DESCRIPTOR, FX_GRADE_FS } from './fxShaders.mjs';

// ── the chunks are registered and documented ────────────────────────────────
for (const name of ['kc_lin2oklab', 'kc_oklab2lin', 'kc_oklab2oklch', 'kc_oklch2oklab']) {
  assert.ok(COMMON_GLSL.includes(`vec3 ${name}(`), `${name} must exist in the chunk library`);
  assert.ok(CHUNK_INDEX.some((c) => c.name === name), `${name} must be in CHUNK_INDEX`);
}
assert.ok(COMMON_VERSION >= 2, 'adding chunks bumps the library version');

/** Pull the float literals out of one chunk body, in source order. */
function coeffs(fnName, count) {
  // Comments first — the chunk documents its ranges ("a/b ~ +-0.4"), and a
  // stray literal from prose would shift every coefficient by one.
  const body = COMMON_GLSL.split(`vec3 ${fnName}(`)[1].split('\n}')[0].replace(/\/\/[^\n]*/g, '');
  const nums = (body.match(/[-+]?\d*\.\d+/g) || []).map(Number);
  assert.ok(nums.length >= count, `${fnName}: expected >= ${count} coefficients, found ${nums.length}`);
  return nums;
}
const FWD = coeffs('kc_lin2oklab', 12);
const INV = coeffs('kc_oklab2lin', 12);

const cbrt = (v) => Math.sign(v) * Math.abs(v) ** (1 / 3);
function lin2oklab([r, g, b]) {
  const l = FWD[0] * r + FWD[1] * g + FWD[2] * b;
  const m = FWD[3] * r + FWD[4] * g + FWD[5] * b;
  const s = FWD[6] * r + FWD[7] * g + FWD[8] * b;
  const [L, M, S] = [cbrt(l), cbrt(m), cbrt(s)];
  return [
    FWD[10] * L + FWD[11] * M - FWD[12] * S,
    FWD[13] * L - FWD[14] * M + FWD[15] * S,
    FWD[16] * L + FWD[17] * M - FWD[18] * S,
  ];
}
function oklab2lin([L, a, b]) {
  const l = (L + INV[0] * a + INV[1] * b) ** 3;
  const m = (L - INV[2] * a - INV[3] * b) ** 3;
  const s = (L - INV[4] * a - INV[5] * b) ** 3;
  // INV[9] and INV[12] are captured WITH their leading minus (the source
  // writes them negative), so they are added, not subtracted. The round-trip
  // assertion below is what proves this parse is faithful — get it wrong and
  // the identity breaks loudly instead of silently grading everything.
  return [
    INV[6] * l - INV[7] * m + INV[8] * s,
    INV[9] * l + INV[10] * m - INV[11] * s,
    INV[12] * l - INV[13] * m + INV[14] * s,
  ];
}
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const toLin = (rgb255) => rgb255.map((v) => srgb2lin(v / 255));
const lightness = (lin) => lin2oklab(lin)[0];

// ── round trip ──────────────────────────────────────────────────────────────
// lin -> oklab -> lin must return what it was given, or every grade is a slow
// leak. Checked across the cube, including the black point (where the cube
// root is not differentiable) and full white.
{
  let worst = 0;
  for (let r = 0; r <= 255; r += 51) {
    for (let g = 0; g <= 255; g += 51) {
      for (let b = 0; b <= 255; b += 51) {
        const lin = toLin([r, g, b]);
        const back = oklab2lin(lin2oklab(lin));
        for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(lin[i] - back[i]));
      }
    }
  }
  assert.ok(worst < 1e-6, `oklab round trip must be lossless (worst ${worst})`);
}
// Negative input (out-of-gamut, or a 16F round trip) must not become NaN —
// that is what the sign-safe cube root is for, and one NaN poisons the frame.
{
  const lab = lin2oklab([-0.2, 0.5, -0.01]);
  assert.ok(lab.every(Number.isFinite), 'a negative channel must not produce NaN');
  assert.ok(COMMON_GLSL.includes('sign(lms) * pow(abs(lms)'), 'the cube root must be sign-safe');
}

// ── THE CLAIM: a hue walk keeps its brightness ──────────────────────────────
// "Colour that travels without dying." Measured against HSL, the thing it
// replaces, over a full 360-degree rotation.
{
  const rgb2hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    let h = 0; let s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  };
  const hsl2rgb = (h, s, l) => {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)].map((v) => v * 255);
  };
  const hueWalk = (rgb255, deg) => {
    const [L, a, b] = lin2oklab(toLin(rgb255));
    const C = Math.hypot(a, b);
    const H = Math.atan2(b, a) + (deg * Math.PI) / 180;
    return oklab2lin([L, C * Math.cos(H), C * Math.sin(H)]).map(clamp01);
  };

  const samples = [[180, 90, 40], [40, 120, 200], [200, 60, 150], [230, 220, 60], [60, 20, 90]];
  let dropOklch = 0; let dropHsl = 0;
  for (const s of samples) {
    const L0 = lightness(toLin(s));
    for (let d = 0; d <= 360; d += 5) {
      dropOklch = Math.max(dropOklch, L0 - lightness(hueWalk(s, d)));
      const [h, sa, l] = rgb2hsl(...s);
      dropHsl = Math.max(dropHsl, L0 - lightness(toLin(hsl2rgb((h + d / 360) % 1, sa, l))));
    }
  }
  // In sRGB, a saturated hue walk leaves the gamut and the clamp costs some
  // lightness — that is the documented limit, not a bug (see below). What must
  // hold is that OKLCH is dramatically better than the thing it replaces.
  assert.ok(dropHsl > 5 * dropOklch,
    `OKLCH must hold lightness far better than HSL (oklch ${dropOklch.toFixed(4)} vs hsl ${dropHsl.toFixed(4)})`);
  assert.ok(dropOklch < 0.12, `OKLCH lightness drop must stay small (got ${dropOklch.toFixed(4)})`);

  // IN GAMUT the claim is absolute: at a chroma that survives a full rotation,
  // lightness does not move at all. This is the "stays lit" promise, asserted
  // rather than eyeballed.
  const mild = samples.map((s) => {
    const [L, a, b] = lin2oklab(toLin(s));
    const C = Math.hypot(a, b);
    const k = Math.min(1, 0.05 / C);
    const H = Math.atan2(b, a);
    return oklab2lin([L, C * k * Math.cos(H), C * k * Math.sin(H)]).map((v) => clamp01(v) * 255);
  });
  for (const s of mild) {
    const L0 = lightness(toLin(s));
    for (let d = 0; d <= 360; d += 5) {
      const L1 = lightness(hueWalk(s, d));
      // Tolerance is 1e-3 = about a quarter of one 8-bit step: at low chroma
      // the rotation still grazes the gamut edge at a few hues, and the
      // residue is far below anything renderable. HSL over the same walk
      // drops 0.095 — roughly 24 steps.
      assert.ok(Math.abs(L0 - L1) < 1e-3,
        `in-gamut hue rotation must not move lightness (${L0.toFixed(6)} -> ${L1.toFixed(6)} at ${d} deg)`);
    }
  }
}

// ── the effect is identity at defaults, and discrete like every other FX ────
{
  const d = FX_GRADE_DESCRIPTOR.params;
  assert.strictEqual(d.hue.def, 0, 'default hue must be identity');
  assert.strictEqual(d.chroma.def, 1, 'default chroma must be identity');
  assert.strictEqual(d.lift.def, 1, 'default lift must be identity');
  // Premultiplied in / premultiplied out, or a graded edge darkens itself.
  assert.ok(FX_GRADE_FS.includes('src.rgb / a'), 'must un-premultiply before the colour math');
  assert.ok(FX_GRADE_FS.includes('rgb * src.a'), 'must re-premultiply after');
  // Clamp in LINEAR light, before the transfer curve.
  assert.ok(FX_GRADE_FS.includes('kc_lin2srgb(clamp(outLin, 0.0, 1.0))'), 'out-of-gamut must clamp in linear light');
}

console.log('oklch.selfcheck: OK');
