/** #532 PR2 — live resolve defaults.
 *  ACES on, Bayer on, exposure 1.0. No panel this PR.
 */
export const RESOLVE_UNIFORMS = ['u_src', 'u_aces', 'u_exposure', 'u_dither'];

export function bindResolveProbe(gl, getLoc, {
  aces = 1,
  exposure = 1,
  dither = 1,
} = {}) {
  gl.uniform1f(getLoc('u_aces'), aces ? 1 : 0);
  gl.uniform1f(getLoc('u_exposure'), Number.isFinite(exposure) ? exposure : 1);
  gl.uniform1f(getLoc('u_dither'), dither ? 1 : 0);
}
