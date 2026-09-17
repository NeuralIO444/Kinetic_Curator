/**
 * noise.js — 3D Simplex + fBm (Kernel K1 #59)
 * Primary API: createNoise(seed) → isolated instance (no shared mutable perm).
 * Legacy module-level noise3D / fBm3D delegate to a default instance.
 */

const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

const grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function buildPerm(seedValue) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  let r = (seedValue | 0) || 1;
  for (let i = 255; i > 0; i--) {
    r = (Math.imul(r, 1103515245) + 12345) & 0x7fffffff;
    const j = r % (i + 1);
    const temp = perm[i];
    perm[i] = perm[j];
    perm[j] = temp;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  return p;
}

function noise3DWith(p, x, y, z) {
  let n0, n1, n2, n3;

  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  const z0 = z - Z0;

  let i1, j1, k1, i2, j2, k2;

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
    }
  } else if (y0 < z0) {
    i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
  } else if (x0 < z0) {
    i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
  } else {
    i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2.0 * G3;
  const y2 = y0 - j2 + 2.0 * G3;
  const z2 = z0 - k2 + 2.0 * G3;
  const x3 = x0 - 1.0 + 3.0 * G3;
  const y3 = y0 - 1.0 + 3.0 * G3;
  const z3 = z0 - 1.0 + 3.0 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  const gi0 = p[ii + p[jj + p[kk]]] % 12;
  const gi1 = p[ii + i1 + p[jj + j1 + p[kk + k1]]] % 12;
  const gi2 = p[ii + i2 + p[jj + j2 + p[kk + k2]]] % 12;
  const gi3 = p[ii + 1 + p[jj + 1 + p[kk + 1]]] % 12;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 < 0) n0 = 0.0;
  else {
    t0 *= t0;
    n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0 + grad3[gi0][2] * z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 < 0) n1 = 0.0;
  else {
    t1 *= t1;
    n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1 + grad3[gi1][2] * z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 < 0) n2 = 0.0;
  else {
    t2 *= t2;
    n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2 + grad3[gi2][2] * z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 < 0) n3 = 0.0;
  else {
    t3 *= t3;
    n3 = t3 * t3 * (grad3[gi3][0] * x3 + grad3[gi3][1] * y3 + grad3[gi3][2] * z3);
  }

  return 32.0 * (n0 + n1 + n2 + n3);
}

function fBm3DWith(p, x, y, z, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let value = 0.0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmplitude = 0.0;

  for (let o = 0; o < octaves; o++) {
    value += amplitude * noise3DWith(p, x * frequency, y * frequency, z * frequency);
    maxAmplitude += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return value / maxAmplitude;
}

/**
 * 2D curl of a scalar potential (approx) for divergence-free flow hints.
 * Returns { x, y } unit-ish vector from finite differences of fBm.
 */
function curl2With(p, x, y, z, eps = 0.5) {
  const n1 = fBm3DWith(p, x, y + eps, z, 3);
  const n2 = fBm3DWith(p, x, y - eps, z, 3);
  const n3 = fBm3DWith(p, x + eps, y, z, 3);
  const n4 = fBm3DWith(p, x - eps, y, z, 3);
  return {
    x: (n1 - n2) / (2 * eps),
    y: (n4 - n3) / (2 * eps),
  };
}

/**
 * Create an isolated noise field from a numeric seed.
 * @param {number} seedValue
 * @returns {{ seed, noise3D, fBm3D, curl2 }}
 */
export function createNoise(seedValue) {
  const p = buildPerm(seedValue);
  const seed = (seedValue | 0) || 1;
  return {
    seed,
    noise3D: (x, y, z) => noise3DWith(p, x, y, z),
    fBm3D: (x, y, z, octaves, lacunarity, gain) =>
      fBm3DWith(p, x, y, z, octaves, lacunarity, gain),
    curl2: (x, y, z, eps) => curl2With(p, x, y, z, eps),
  };
}

// ── Legacy module-level API (default instance) ─────────────────
let _default = createNoise(444);

/** @deprecated Prefer createNoise(seed).noise3D */
export function noise3D(x, y, z) {
  return _default.noise3D(x, y, z);
}

/** @deprecated Prefer createNoise(seed).fBm3D */
export function fBm3D(x, y, z, octaves, lacunarity, gain) {
  return _default.fBm3D(x, y, z, octaves, lacunarity, gain);
}
