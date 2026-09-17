/**
 * Pixel diff engine for the WebGL parity harness (Phase 0, #186).
 *
 * Compares two RGBA pixel buffers of identical dimensions and reports
 * whether they agree within the documented tolerance policy.
 *
 * ## Tolerance policy
 *
 * Two renderers never agree bit-for-bit (GPU float math vs resvg's CPU
 * rasterizer; SVG filter rasterization is explicitly outside the
 * determinism contract — see fxFilters.js). So "parity" means:
 *
 * - `perChannelTol` (default 8): a pixel passes when every channel
 *   |a - b| <= perChannelTol. 8/255 ≈ 3% — invisible at normal viewing.
 * - `maxFailFraction` (default 0.001): up to 0.1% of pixels may exceed
 *   the per-channel tolerance (covers antialiasing-edge disagreements).
 * - FX scenes use a relaxed policy (see corpus.mjs): filter-heavy output
 *   is allowed perChannelTol 24 / maxFailFraction 0.02, documented per
 *   scene, because turbulence-based effects (grain, displace, tear)
 *   rasterize differently on every backend by design.
 *
 * The policy is data, not code: callers pass { perChannelTol, maxFailFraction }
 * and the report echoes the policy used, so a "pass" is always auditable.
 */

export const DEFAULT_POLICY = Object.freeze({
  perChannelTol: 8,
  maxFailFraction: 0.001,
});

/** Relaxed policy for scenes with SVG-filter FX (documented variance). */
export const FX_RELAXED_POLICY = Object.freeze({
  perChannelTol: 24,
  maxFailFraction: 0.02,
});

function toBytes(buf) {
  if (Buffer.isBuffer(buf)) return buf;
  if (buf instanceof Uint8Array || buf instanceof Uint8ClampedArray) {
    return Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new TypeError('diffPixels: expected Buffer or Uint8Array RGBA');
}

/**
 * @param {Buffer|Uint8Array} a RGBA pixels, row-major
 * @param {Buffer|Uint8Array} b RGBA pixels, row-major
 * @param {number} width
 * @param {number} height
 * @param {{perChannelTol:number,maxFailFraction:number}} policy
 * @returns report object (also JSON-serializable)
 */
export function diffPixels(a, b, width, height, policy = DEFAULT_POLICY) {
  const A = toBytes(a);
  const B = toBytes(b);
  const total = width * height;
  if (A.length !== total * 4 || B.length !== total * 4) {
    throw new Error(
      `diffPixels: buffer size mismatch (a=${A.length}, b=${B.length}, expected=${total * 4})`
    );
  }
  const tol = policy.perChannelTol;
  let failed = 0;
  let maxDelta = 0;
  let sumDelta = 0;
  const failedSample = [];
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    let pixelMax = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(A[o + c] - B[o + c]);
      if (d > pixelMax) pixelMax = d;
    }
    sumDelta += pixelMax;
    if (pixelMax > maxDelta) maxDelta = pixelMax;
    if (pixelMax > tol) {
      failed++;
      if (failedSample.length < 8) {
        failedSample.push({
          x: i % width,
          y: Math.floor(i / width),
          maxDelta: pixelMax,
          a: [A[o], A[o + 1], A[o + 2], A[o + 3]],
          b: [B[o], B[o + 1], B[o + 2], B[o + 3]],
        });
      }
    }
  }
  const failFraction = total === 0 ? 0 : failed / total;
  return {
    pass: failFraction <= policy.maxFailFraction,
    width,
    height,
    total,
    failed,
    failFraction,
    maxDelta,
    meanDelta: total === 0 ? 0 : sumDelta / total,
    policy: { perChannelTol: tol, maxFailFraction: policy.maxFailFraction },
    failedSample,
  };
}

/** One-line human summary for CLI output. */
export function formatReport(r, label = '') {
  const pct = (r.failFraction * 100).toFixed(3);
  const head = label ? `[parity:${label}] ` : '[parity] ';
  return (
    `${head}${r.pass ? 'PASS' : 'FAIL'} — ${r.failed}/${r.total} px over tol ` +
    `(${pct}% > ${(r.policy.maxFailFraction * 100).toFixed(3)}% allowed), ` +
    `maxΔ=${r.maxDelta}, meanΔ=${r.meanDelta.toFixed(2)} ` +
    `(tol=${r.policy.perChannelTol}/ch)`
  );
}
