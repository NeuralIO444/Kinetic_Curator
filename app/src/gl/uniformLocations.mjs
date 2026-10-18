/**
 * Uniform-location locator for the GL renderer (#1665, audit fix 2).
 *
 * A program's uniform locations are fixed at link time and stay valid for
 * the program object's whole life, so resolving them through
 * gl.getUniformLocation on every pass of every frame is a driver
 * round-trip spent re-answering a settled question. createUniformLocator
 * wraps a GL context and returns the (program, name) => location function
 * the renderer already calls as U(p, n) — same contract, locations fetched
 * once each.
 *
 * The cache is a WeakMap keyed by the program OBJECT (never by name or
 * index): the renderer deletes its programs at teardown (disposeBase),
 * and identity keying makes stale entries impossible — a deleted
 * program's locations die with the object, and a rebuilt program is a
 * new object with a fresh entry. Inactive uniforms (getUniformLocation
 * returns null) are cached too: a cached miss is still a saved lookup.
 * One locator per renderer instance; locators never share state.
 *
 * Browser-safe (no Node imports).
 */
export function createUniformLocator(gl) {
  const perProgram = new WeakMap();
  return (program, name) => {
    let byName = perProgram.get(program);
    if (byName === undefined) {
      byName = new Map();
      perProgram.set(program, byName);
    }
    if (!byName.has(name)) byName.set(name, gl.getUniformLocation(program, name));
    return byName.get(name);
  };
}
