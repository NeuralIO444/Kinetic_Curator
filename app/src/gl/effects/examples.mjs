/**
 * Template example effects — order:06 (#195). Browser-safe (no Node imports).
 *
 * Each effect is exactly one fragment shader + one param descriptor. No
 * runner code, no UI code: registering one of these is the whole port.
 * They exist to prove the template contract and to give Phase-2 ports a
 * copy-paste starting point — they are not the production effect set.
 */

export const TMPL_INVERT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_cuv);
  o = vec4(vec3(1.0) - c.rgb, c.a);
}
`;

export const TMPL_INVERT_DESCRIPTOR = {
  label: 'Template Invert',
  hint: 'Flip every channel. No parameters — the simplest possible template effect.',
  pad: 0,
  animated: false,
  params: {},
};

export const TMPL_POSTER_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform int u_levels;
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_cuv);
  float l = float(max(u_levels, 2));
  o = vec4(floor(c.rgb * l + 0.5) / l, c.a);
}
`;

export const TMPL_POSTER_DESCRIPTOR = {
  label: 'Template Posterize',
  hint: 'Reduce each channel to a fixed number of tonal steps. Shows an int param binding.',
  pad: 0,
  animated: false,
  params: {
    levels: {
      type: 'int', label: 'Levels', min: 2, max: 8, step: 1, def: 4,
      ui: 'slider', hint: 'Tonal steps per channel',
    },
  },
};

export const TMPL_GRAIN_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_amount;
in vec2 v_cuv;
out vec4 o;
// kc_hash12 comes from the shared chunk library (common.glsl), injected by
// registerTemplateEffect — effects never implement their own hash.
void main() {
  vec4 c = texture(u_tex, v_cuv);
  float g = kc_hash12(v_cuv * u_res + u_time * 13.7) - 0.5;
  o = vec4(c.rgb + g * u_amount, c.a);
}
`;

export const TMPL_GRAIN_DESCRIPTOR = {
  label: 'Template Grain',
  hint: 'Animated grain. Shows a float param plus u_time for animated effects.',
  pad: 0,
  animated: true,
  params: {
    amount: {
      type: 'float', label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.4,
      ui: 'slider', hint: 'Grain strength',
    },
  },
};

/** [kind, { fs, descriptor }] pairs for registration loops. */
export const TEMPLATE_EXAMPLES = [
  ['tmplInvert', { fs: TMPL_INVERT_FS, descriptor: TMPL_INVERT_DESCRIPTOR, file: 'examples.mjs:tmplInvert' }],
  ['tmplPoster', { fs: TMPL_POSTER_FS, descriptor: TMPL_POSTER_DESCRIPTOR, file: 'examples.mjs:tmplPoster' }],
  ['tmplGrain', { fs: TMPL_GRAIN_FS, descriptor: TMPL_GRAIN_DESCRIPTOR, file: 'examples.mjs:tmplGrain' }],
];
