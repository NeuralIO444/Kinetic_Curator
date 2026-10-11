// fieldCommon.glsl.js — shared GLSL hash/noise primitives for the GPU field
// twins (docs/design/gpu-field-eval.md, #1315).
//
// These are line-for-line twins of the JS implementations in
// app/src/engine/noise.js (noise3DWith / fBm3DWith): same lattice math, same
// gradient table, same falloff. The permutation table is NOT re-derived on
// the GPU — the runner uploads the exact 512 bytes from permTableFor(seed)
// as a 512x1 R8UI texture, so the shader hashes exactly like JS.
//
// ── DOCUMENTED DIVERGENCE (never silent) ─────────────────────────────
// JS computes in float64; GLSL highp is float32. Every op below rounds to
// ~1.2e-7 relative, and ~120 flops per fBm octave accumulate. The fBm value
// therefore drifts from the CPU twin by a small, measured amount:
//
//   measured max |CPU − GPU| = 5.1e-7 (mean 7.4e-8) on the parity fixture
//   (seed 0xC0FFEE, 4096 scattered points, freq 2.5, 3 octaves, z 0.37,
//   SwiftShader, 2026-10-10); 7.2e-7 max on a second config (5 octaves).
//   Enforced tolerance FIELD_PARITY_TOL = 1e-5 ≈ 20x headroom for real-GPU
//   FMA/contraction differences. See fieldParity.selfcheck.mjs.
//
// Consequences, enforced by the backend flag (fieldRunner.js):
// GPU fields are NEVER in the byte-identical path — stills and replay
// always use the JS implementation (FIELD_BACKEND defaults to 'js').
// 'gpu' is an explicitly non-deterministic performance path for live
// performance only.

/**
 * Shared GLSL chunk. The including shader must declare `#version 300 es`
 * and precision qualifiers BEFORE this chunk. Declares:
 *   uniform highp usampler2D u_perm  — 512x1 R8UI permutation table
 *   int kcPerm(int i)                 — table lookup, JS-identical indexing
 *   float kcNoise3D(float x, float y, float z)
 *   float kcFbm3D(x, y, z, octaves, lacunarity, gain)
 */
export const FIELD_COMMON_GLSL = /* glsl */`
uniform highp usampler2D u_perm;

// JS: p[i] on the 512-byte table (buildPerm doubles the 256-byte shuffle).
// The & 511 mask matches the table length; callers only ever pass 0..510.
int kcPerm(int i) {
  return int(texelFetch(u_perm, ivec2(i & 511, 0), 0).r);
}

const float KC_F3 = 1.0 / 3.0;
const float KC_G3 = 1.0 / 6.0;

// Gradient table — identical order and values to grad3 in noise.js.
// Non-const global: dynamic indexing is unambiguously legal in ES 3.00.
vec3 KC_GRAD3[12] = vec3[12](
  vec3( 1.0,  1.0,  0.0), vec3(-1.0,  1.0,  0.0),
  vec3( 1.0, -1.0,  0.0), vec3(-1.0, -1.0,  0.0),
  vec3( 1.0,  0.0,  1.0), vec3(-1.0,  0.0,  1.0),
  vec3( 1.0,  0.0, -1.0), vec3(-1.0,  0.0, -1.0),
  vec3( 0.0,  1.0,  1.0), vec3( 0.0, -1.0,  1.0),
  vec3( 0.0,  1.0, -1.0), vec3( 0.0, -1.0, -1.0)
);

// 3D simplex noise — twin of noise3DWith() in app/src/engine/noise.js.
// Lattice coordinates stay float (like JS's float64 path) for the geometry;
// int copies are used only for the permutation indexing, where JS's
// ToInt32(& 255) and GLSL's two's-complement & agree on our input range.
float kcNoise3D(float x, float y, float z) {
  float s = (x + y + z) * KC_F3;
  float fi = floor(x + s);
  float fj = floor(y + s);
  float fk = floor(z + s);
  int i = int(fi);
  int j = int(fj);
  int k = int(fk);

  float t = (fi + fj + fk) * KC_G3;
  float X0 = fi - t;
  float Y0 = fj - t;
  float Z0 = fk - t;
  float x0 = x - X0;
  float y0 = y - Y0;
  float z0 = z - Z0;

  int i1; int j1; int k1;
  int i2; int j2; int k2;
  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
    }
  } else if (y0 < z0) {
    i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
  } else if (x0 < z0) {
    i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
  } else {
    i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
  }

  float x1 = x0 - float(i1) + KC_G3;
  float y1 = y0 - float(j1) + KC_G3;
  float z1 = z0 - float(k1) + KC_G3;
  float x2 = x0 - float(i2) + 2.0 * KC_G3;
  float y2 = y0 - float(j2) + 2.0 * KC_G3;
  float z2 = z0 - float(k2) + 2.0 * KC_G3;
  float x3 = x0 - 1.0 + 3.0 * KC_G3;
  float y3 = y0 - 1.0 + 3.0 * KC_G3;
  float z3 = z0 - 1.0 + 3.0 * KC_G3;

  int ii = i & 255;
  int jj = j & 255;
  int kk = k & 255;

  int gi0 = kcPerm(ii + kcPerm(jj + kcPerm(kk))) % 12;
  int gi1 = kcPerm(ii + i1 + kcPerm(jj + j1 + kcPerm(kk + k1))) % 12;
  int gi2 = kcPerm(ii + i2 + kcPerm(jj + j2 + kcPerm(kk + k2))) % 12;
  int gi3 = kcPerm(ii + 1 + kcPerm(jj + 1 + kcPerm(kk + 1))) % 12;

  float n0;
  float t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 < 0.0) { n0 = 0.0; }
  else { t0 *= t0; n0 = t0 * t0 * dot(KC_GRAD3[gi0], vec3(x0, y0, z0)); }

  float n1;
  float t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 < 0.0) { n1 = 0.0; }
  else { t1 *= t1; n1 = t1 * t1 * dot(KC_GRAD3[gi1], vec3(x1, y1, z1)); }

  float n2;
  float t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 < 0.0) { n2 = 0.0; }
  else { t2 *= t2; n2 = t2 * t2 * dot(KC_GRAD3[gi2], vec3(x2, y2, z2)); }

  float n3;
  float t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 < 0.0) { n3 = 0.0; }
  else { t3 *= t3; n3 = t3 * t3 * dot(KC_GRAD3[gi3], vec3(x3, y3, z3)); }

  return 32.0 * (n0 + n1 + n2 + n3);
}

// fBm — twin of fBm3DWith() in app/src/engine/noise.js.
// The loop bound is a compile-time constant (ES 3.00 needs it for the for);
// fields asking for more than KC_FBM_MAX_OCTAVES octaves fall back to the
// JS implementation (see fieldRunner.js).
const int KC_FBM_MAX_OCTAVES = 8;

float kcFbm3D(float x, float y, float z, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxAmplitude = 0.0;
  for (int o = 0; o < 8; o++) {
    if (o >= octaves) break;
    value += amplitude * kcNoise3D(x * frequency, y * frequency, z * frequency);
    maxAmplitude += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return value / maxAmplitude;
}
`;
