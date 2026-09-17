/**
 * Tap points — harness Layer 2 (#193).
 *
 * Captures each intermediate framebuffer in a chain (e.g. the Phase 2
 * ping-pong FX chain, or any multi-pass pipeline) so a bad stage can be
 * found by inspection instead of guesswork. Captures are plain RGBA8
 * readPixels snapshots of whatever framebuffer is bound for reading.
 *
 * `tapToDataURL` turns a tap into a downscaled thumbnail for the Shader
 * Lab panel (flips to y-down for display).
 */

import { checkGlError } from './diagnostics.mjs';

export function createTapRecorder(gl) {
  const taps = [];
  return {
    /**
     * Snapshot the currently-bound READ framebuffer.
     * @returns {{name, w, h, pixels: Uint8Array}} row 0 = bottom (GL order).
     */
    tap(name, w, h) {
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      checkGlError(gl, `tapPoints.tap(${name})`);
      const rec = { name, w, h, pixels };
      taps.push(rec);
      return rec;
    },
    getTaps() {
      return taps.slice();
    },
    clear() {
      taps.length = 0;
    },
  };
}

/** Downscaled y-down thumbnail data URL for panel display. */
export function tapToDataURL(tap, maxDim = 160) {
  const scale = Math.min(1, maxDim / Math.max(tap.w, tap.h));
  const dw = Math.max(1, Math.round(tap.w * scale));
  const dh = Math.max(1, Math.round(tap.h * scale));
  const src = document.createElement('canvas');
  src.width = tap.w;
  src.height = tap.h;
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(tap.pixels), tap.w, tap.h), 0, 0);
  const dst = document.createElement('canvas');
  dst.width = dw;
  dst.height = dh;
  const ctx = dst.getContext('2d');
  ctx.save();
  ctx.translate(0, dh);
  ctx.scale(dw / tap.w, -dh / tap.h);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  return dst.toDataURL();
}
