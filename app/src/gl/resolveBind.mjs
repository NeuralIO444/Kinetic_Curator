/** #532 PR2 — live resolve defaults.
 *  ACES on, Bayer on, exposure 1.0. No panel this PR.
 */
export const DITHER_AMPLITUDE = 1 / 255;
export const RESOLVE_UNIFORMS = ['u_src', 'u_aces', 'u_exposure', 'u_dither', 'u_fxaa', 'u_weave'];

export function bindResolveProbe(gl, getLoc, {
  aces = 1,
  exposure = 1,
  dither = 1,
  fxaa = 0, // #740 PR1 probe: off. PR2 flips it after Matt's eyes + re-bless.
  weave = null, // #741: [dx, dy] output px, or null = off (live present only; never stills)
} = {}) {
  gl.uniform1f(getLoc('u_aces'), aces ? 1 : 0);
  gl.uniform1f(getLoc('u_exposure'), Number.isFinite(exposure) ? exposure : 1);
  // Bayer adds (b - 0.5) * u_dither to [0,1] colour: ±half an 8-bit step.
  // 1.0 here was a visible full-range 4×4 mesh over the whole frame.
  gl.uniform1f(getLoc('u_fxaa'), fxaa ? 1 : 0);
  const wx = weave && Number.isFinite(weave[0]) ? weave[0] : 0;
  const wy = weave && Number.isFinite(weave[1]) ? weave[1] : 0;
  gl.uniform2f(getLoc('u_weave'), wx, wy);
  gl.uniform1f(getLoc('u_dither'), dither ? DITHER_AMPLITUDE : 0);
}
