/** #532 PR1 — upload resolve uniforms in the bypassed state.
 *  Live renderer calls this after binding u_src. PR2 will pass real values.
 */
export const RESOLVE_UNIFORMS = ['u_src', 'u_aces', 'u_exposure', 'u_dither'];

export function bindResolveProbe(gl, getLoc) {
  gl.uniform1f(getLoc('u_aces'), 0.0);
  gl.uniform1f(getLoc('u_exposure'), 1.0);
  gl.uniform1f(getLoc('u_dither'), 0.0);
}
