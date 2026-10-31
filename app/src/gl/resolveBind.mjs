/** #532 PR2 — live resolve defaults.
 *  ACES on, Bayer on, exposure 1.0. No panel this PR.
 *  #1830 — the exposure model (gl/exposureModel.mjs): opts.exposureStops
 *  (EV detents) is translated here into the linear u_exposure gain. An
 *  explicit linear opts.exposure still wins, so probes and goldens stay
 *  byte-identical; stops 0 yields gain exactly 1.
 */
import { snapExposureStops, stopsToGain } from './exposureModel.mjs';
export const DITHER_AMPLITUDE = 1 / 255;
export const RESOLVE_UNIFORMS = [
  'u_src',
  'u_aces',
  'u_exposure',
  'u_dither',
  'u_fxaa',
  'u_weave',
  'u_fake',
  'u_light',
  'u_shape',
];

export function bindResolveProbe(gl, getLoc, opts = {}) {
  const {
    aces = 1,
    exposure = 1,
    exposureStops = null, // #1830: EV detents via the exposure model; null = not set
    dither = 1,
    fxaa = 0, // #740 PR1 probe: off. PR2 flips it after Matt's eyes + re-bless.
    weave = null, // #741: [dx, dy] output px, or null = off (live present only; never stills)
    present = false, // true when drawing into the visible canvas (see u_present in resolveFs.mjs)
    fake = null, // [contact, wrap, shoulder], 0 = off
    light = null,
  } = opts;
  gl.uniform1f(getLoc('u_aces'), aces ? 1 : 0);
  // #1830 precedence: an explicit linear exposure (probes/goldens) wins;
  // otherwise stops translate to gain; otherwise the default above.
  const linear = Number.isFinite(opts.exposure)
    ? opts.exposure
    : Number.isFinite(exposureStops)
      ? stopsToGain(snapExposureStops(exposureStops))
      : exposure;
  gl.uniform1f(getLoc('u_exposure'), Number.isFinite(linear) ? linear : 1);
  // Bayer adds (b - 0.5) * u_dither to [0,1] colour: ±half an 8-bit step.
  // 1.0 here was a visible full-range 4×4 mesh over the whole frame.
  gl.uniform1f(getLoc('u_fxaa'), fxaa ? 1 : 0);
  const wx = weave && Number.isFinite(weave[0]) ? weave[0] : 0;
  const wy = weave && Number.isFinite(weave[1]) ? weave[1] : 0;
  gl.uniform2f(getLoc('u_weave'), wx, wy);
  gl.uniform1f(getLoc('u_dither'), dither ? DITHER_AMPLITUDE : 0);
  const f = fake || [0, 0, 0];
  gl.uniform4f(getLoc('u_fake'), Number(f[0]) || 0, Number(f[1]) || 0, Number(f[2]) || 0, 0);
  const lx = light && Number.isFinite(light[0]) ? light[0] : 0.4;
  const ly = light && Number.isFinite(light[1]) ? light[1] : 0.7;
  gl.uniform2f(getLoc('u_light'), lx, ly);
  gl.uniform1f(getLoc('u_shape'), 0);
  gl.uniform1f(getLoc('u_present'), present ? 1 : 0);
}
