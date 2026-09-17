/**
 * Debug strip — harness Layer 3 "shader printf" (#193).
 *
 * Renders N debug values into a 1×N pixel strip and reads them back to JS.
 * Values travel as raw float32 bit patterns packed into RGBA8, so the
 * round-trip is bit-exact for every finite float (NaN/Inf included).
 *
 * Browser-safe. The GL helpers need no extensions (RGBA8 render targets).
 */

const _dv = new DataView(new ArrayBuffer(4));

/** @returns {Uint8Array} 4*N bytes, big-endian float32 bit patterns. */
export function packStripValues(values) {
  const bytes = new Uint8Array(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    _dv.setFloat32(0, values[i], false);
    bytes[i * 4 + 0] = _dv.getUint8(0);
    bytes[i * 4 + 1] = _dv.getUint8(1);
    bytes[i * 4 + 2] = _dv.getUint8(2);
    bytes[i * 4 + 3] = _dv.getUint8(3);
  }
  return bytes;
}

/** Inverse of packStripValues. */
export function unpackStripPixels(bytes) {
  if (bytes.length % 4 !== 0) throw new Error('[gl-debug] strip bytes must be a multiple of 4');
  const n = bytes.length / 4;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    _dv.setUint8(0, bytes[i * 4 + 0]);
    _dv.setUint8(1, bytes[i * 4 + 1]);
    _dv.setUint8(2, bytes[i * 4 + 2]);
    _dv.setUint8(3, bytes[i * 4 + 3]);
    out[i] = _dv.getFloat32(0, false);
  }
  return out;
}

/** 1×N RGBA8 render target for a strip of N values. */
export function createStripTarget(gl, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error('[gl-debug] strip needs n >= 1');
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('[gl-debug] strip target incomplete');
  return { tex, fb, n };
}

/** Upload values into the strip target (the "render" half of printf). */
export function writeStrip(gl, target, values) {
  if (values.length !== target.n) {
    throw new Error(`[gl-debug] strip write: got ${values.length} values for n=${target.n}`);
  }
  gl.bindTexture(gl.TEXTURE_2D, target.tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, target.n, 1, gl.RGBA, gl.UNSIGNED_BYTE, packStripValues(values));
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/** Read the strip target back and decode to floats (the "printf" half). */
export function readStrip(gl, target) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
  const bytes = new Uint8Array(target.n * 4);
  gl.readPixels(0, 0, target.n, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return unpackStripPixels(bytes);
}

export function disposeStripTarget(gl, target) {
  gl.deleteFramebuffer(target.fb);
  gl.deleteTexture(target.tex);
}

/** Human-readable table for the read-back values. */
export function formatStripTable(labels, values) {
  const rows = values.map((v, i) => [labels[i] ?? `#${i}`, String(v)]);
  const w0 = Math.max(...rows.map((r) => r[0].length), 'label'.length);
  const w1 = Math.max(...rows.map((r) => r[1].length), 'value'.length);
  const line = (a, b) => `  ${a.padEnd(w0)} | ${b.padEnd(w1)}`;
  return [
    `debug strip (${values.length} values):`,
    line('label', 'value'),
    `  ${'-'.repeat(w0)}-+-${'-'.repeat(w1)}`,
    ...rows.map((r) => line(r[0], r[1])),
  ].join('\n');
}
