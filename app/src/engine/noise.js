/**
 * noise.js
 * Highly optimized, zero-dependency 3D Simplex Noise implementation.
 * Provides deterministic multi-octave Fractal Brownian Motion (fBm).
 */

// Skewing and unskewing factors for 3D
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

// Grad3 gradient vectors for 3D Simplex
const grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

// Permutation table (reference 256 values duplicated to 512)
const p = new Uint8Array(512);

/**
 * Initializes the permutation table deterministically from a numeric seed.
 * Uses a simple LCG (Linear Congruential Generator) for seeding.
 */
export function seedNoise(seedValue) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  let r = seedValue;
  
  // Deterministic shuffle using LCG
  for (let i = 255; i > 0; i--) {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    const j = r % (i + 1);
    const temp = perm[i];
    perm[i] = perm[j];
    perm[j] = temp;
  }
  
  // Fill the 512 length table
  for (let i = 0; i < 512; i++) {
    p[i] = perm[i & 255];
  }
}

// Default initialization
seedNoise(444);

/**
 * Computes 3D Simplex Noise for coordinates (x, y, z).
 * Returns values strictly normalized between [-1.0, 1.0].
 */
export function noise3D(x, y, z) {
  let n0, n1, n2, n3; // Noise contributions from the four corners

  // Skew the input space to determine which simplex cell we're in
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  const X0 = i - t; // Unskew the cell origin back to (x,y,z) space
  const Y0 = j - t;
  const Z0 = k - t;
  const x0 = x - X0; // The x,y,z distances from the cell origin
  const y0 = y - Y0;
  const z0 = z - Z0;

  // Determine which simplex we are in.
  let i1, j1, k1; // Offsets for second corner of simplex in (i,j,k) coords
  let i2, j2, k2; // Offsets for third corner of simplex in (i,j,k) coords

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; // X Y Z order
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; // X Z Y order
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; // Z X Y order
    }
  } else { // x0 < y0
    if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; // Z Y X order
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; // Y Z X order
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; // Y X Z order
    }
  }

  // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
  // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
  // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where c = 1/6.
  const x1 = x0 - i1 + G3; // Offsets for second corner in (x,y,z) coords
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner in (x,y,z) coords
  const y2 = y0 - j2 + 2.0 * G3;
  const z2 = z0 - k2 + 2.0 * G3;
  const x3 = x0 - 1.0 + 3.0 * G3; // Offsets for last corner in (x,y,z) coords
  const y3 = y0 - 1.0 + 3.0 * G3;
  const z3 = z0 - 1.0 + 3.0 * G3;

  // Work out the hashed gradient indices of the four simplex corners
  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;
  
  const gi0 = p[ii + p[jj + p[kk]]] % 12;
  const gi1 = p[ii + i1 + p[jj + j1 + p[kk + k1]]] % 12;
  const gi2 = p[ii + i2 + p[jj + j2 + p[kk + k2]]] % 12;
  const gi3 = p[ii + 1 + p[jj + 1 + p[kk + 1]]] % 12;

  // Calculate the contribution from the four corners
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

  // Add contributions together and scale the result to get a maximum value of 1.0.
  // The sum of contributions is scaled by 32.
  return 32.0 * (n0 + n1 + n2 + n3);
}

/**
 * Computes multi-octave Fractal Brownian Motion (fBm) Simplex Noise.
 * Stacks octaves with increasing frequency and decreasing amplitude.
 * Returns values normalized between [-1.0, 1.0].
 */
export function fBm3D(x, y, z, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let value = 0.0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmplitude = 0.0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(x * frequency, y * frequency, z * frequency);
    maxAmplitude += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return value / maxAmplitude;
}
