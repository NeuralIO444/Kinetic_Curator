// noiseField.glsl.js — GPU twin of the registered 'noise' field
// (makeNoiseField in app/src/engine/kernel/field/index.js).
//
// Transform-feedback vertex shader: one invocation per SoA position lane,
// writes the field value to the captured varying. The runner (fieldRunner.js)
// uploads the SoA x/y columns as two scalar attributes — flat columns in,
// flat column out, no repacking.
//
// Field contract preserved: pure function of (seed, x, y) — the seed rides
// in the uploaded permutation table, x/y in the attributes, z/freq/octaves
// in uniforms. Output mapping is the JS twin exactly:
//   clamp((fBm + 1) * 0.5, 0, 1)
// ((v+1)/2 vs (v+1)*0.5: both exact in binary floating point — no divergence.)

import { FIELD_COMMON_GLSL } from './fieldCommon.glsl.js';

/** Transform-feedback varyings captured by the runner, in order. */
export const NOISE_FIELD_VARYINGS = Object.freeze(['v_field']);

/** Maximum octaves the shader loop supports; more falls back to JS. */
export const NOISE_FIELD_MAX_OCTAVES = 8;

export const NOISE_FIELD_VERT = /* glsl */`#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

// SoA position columns — two scalar attributes, never interleaved.
in float a_x;
in float a_y;

uniform float u_freq;
uniform float u_z;
uniform int u_octaves;
uniform float u_lacunarity;
uniform float u_gain;

out float v_field;

${FIELD_COMMON_GLSL}

void main() {
  float v = kcFbm3D(a_x * u_freq, a_y * u_freq, u_z, u_octaves, u_lacunarity, u_gain);
  v_field = clamp((v + 1.0) * 0.5, 0.0, 1.0);
  // Rasterization is discarded by the runner; position is unused but must
  // be written (undefined otherwise).
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

// Trivial fragment shader: the runner enables RASTERIZER_DISCARD, so this
// never executes. Attached anyway — a vertex-only program trips driver
// quirks (ANGLE/SwiftShader link warnings) for zero benefit.
export const NOISE_FIELD_FRAG = /* glsl */`#version 300 es
precision highp float;
layout(location = 0) out vec4 o_color;
void main() {
  o_color = vec4(0.0);
}
`;

/**
 * The registry descriptor for the noise field's GPU twin, attached to the
 * FIELDS entry by fieldRunner.js (kernel never imports from gl/, #1239).
 * Shape: { vertexShader, varyings[, fragmentShader] } per the registry.
 */
export const NOISE_FIELD_GPU = Object.freeze({
  vertexShader: NOISE_FIELD_VERT,
  fragmentShader: NOISE_FIELD_FRAG,
  varyings: NOISE_FIELD_VARYINGS,
});
