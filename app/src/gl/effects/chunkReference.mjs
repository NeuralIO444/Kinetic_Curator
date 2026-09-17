/**
 * CPU reference implementations of the common.glsl chunks (#196).
 * Browser-safe (no Node imports). Plain doubles — the render tests compare
 * against real GPU output with a tolerance that absorbs float32-vs-float64
 * differences plus 8-bit framebuffer quantization.
 *
 * These mirror the GLSL op-for-op so a typo'd constant or swapped channel
 * in common.glsl shows up as a render-test failure, not a silent drift.
 */

const fract = (v) => v - Math.floor(v);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a + (b - a) * t;

export function refHash12(x, y) {
  let p3x = fract(x * 0.1031);
  let p3y = fract(y * 0.1031);
  let p3z = fract(x * 0.1031);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d; p3y += d; p3z += d;
  return fract((p3x + p3y) * p3z);
}

export function refHash22(x, y) {
  let p3x = fract(x * 0.1031);
  let p3y = fract(y * 0.1030);
  let p3z = fract(x * 0.0973);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d; p3y += d; p3z += d;
  return [fract((p3x + p3y) * p3z), fract((p3x + p3z) * p3y)];
}

export function refVnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = refHash12(ix, iy);
  const b = refHash12(ix + 1, iy);
  const c = refHash12(ix, iy + 1);
  const d = refHash12(ix + 1, iy + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

export function refFbm(x, y, octaves) {
  let v = 0, amp = 0.5, qx = x, qy = y;
  for (let i = 0; i < 4; i++) {
    if (i >= octaves) break;
    v += amp * refVnoise(qx, qy);
    const nx = qx * 2.03 + 19.7, ny = qy * 2.03 + 7.3;
    qx = nx; qy = ny;
    amp *= 0.5;
  }
  return v;
}

export function refLuma(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function refRgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) * 0.5, d = mx - mn;
  let h = 0, s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

export function refHsl2rgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  // Note: this closed form equals the GLSL branchless formulation.
  return [f(0), f(8), f(4)];
}

export function refSrgb2lin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function refLin2srgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function refIgn(x, y) {
  return fract(52.9829189 * fract(x * 0.06711056 + y * 0.00583715));
}

export function refDither(x, y) {
  return refIgn(x, y) - 0.5;
}

export function refUvCentered(u, v) {
  return [u * 2 - 1, v * 2 - 1];
}

export function refUvAspect(u, v, rw, rh) {
  return [(u * 2 - 1) * (rw / rh), v * 2 - 1];
}

// Re-exported for test convenience.
export { clamp01 };
