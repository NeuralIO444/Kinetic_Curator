/**
 * Builtin Phase-1 effect registrations for the JS↔GL bridge (#194).
 * Browser-safe (no Node imports).
 *
 * These encode the exact uniform mappings the Phase-1 renderer used, so
 * the bridge path is pixel-identical: rgbSplit dx is in thousandths of
 * the canvas width, blur runs as two separable passes with sigma scaled
 * by the write target width, grain takes its amount plus a LUT texture.
 * Effect kinds outside this set (displace, tear, scanlines, solarize,
 * edge) throw at chain time — they land in Phase 2 (#188).
 */

import { FULL_VS, EFFECT_FS, EFFECT_IDS } from '../shaders.mjs';

const UNIFORMS = {
  u_src: { kind: 'sampler', unit: 0 },
  u_aux: { kind: 'sampler', unit: 1 },
  u_effect: { kind: 'int' },
  u_p: { kind: 'vec4' },
  u_texel: { kind: 'vec2' },
  u_res: { kind: 'vec2' }, // not declared by EFFECT_FS (null location → skipped)
  u_clip: { kind: 'vec4' },
  u_clipOn: { kind: 'float' },
};

export function registerBuiltinEffects(bridge) {
  bridge.registerProgram('effect', FULL_VS, EFFECT_FS, {
    uniforms: UNIFORMS,
    file: 'shaders.mjs:EFFECT_FS',
  });
  const id = EFFECT_IDS;
  const one = (mode, params) => ({ program: 'effect', passes: [{ mode, params }] });
  bridge.defineEffect('invert', one(id.invert, () => [0, 0, 0, 0]));
  bridge.defineEffect('rgbSplit', one(id.rgbSplit, (p) => [(p.dx || 0) / 1000, 0, 0, 0]));
  bridge.defineEffect('grain', one(id.grain, (p) => [p.amount ?? 0.4, 0, 0, 0]));
  const sigma = (p, ctx) => [Math.max(0.5, (p.radius || 0) * (ctx.width / 1000)), 0, 0, 0];
  bridge.defineEffect('blur', {
    program: 'effect',
    pad: 0, // padded blur routing activates with Phase-2 shaders
    passes: [
      { mode: id.blurH, params: sigma },
      { mode: id.blurV, params: sigma },
    ],
  });
  bridge.defineEffect('posterize', one(id.posterize, (p) => [p.levels || 4, 0, 0, 0]));
}
