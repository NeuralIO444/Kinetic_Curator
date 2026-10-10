// #1240 — deterministic trig for the bake path (OPT-IN).
//
// Why this exists: Math.sin/cos/atan2 are not required by ECMAScript to be
// correctly rounded, and V8 evaluates them differently on x64 vs arm64
// (~1 ulp). Over 120 chaotic bake steps that last-bit difference becomes a
// visibly different swarm, so a bake is only reproducible "on a given
// machine" — which breaks the bake path's whole point if renders ever
// distribute over mixed hardware (Mac Studio vs arm64 iPad).
//
// What this is: sin/cos/atan2 implemented as pure IEEE-754 double arithmetic
// — Horner-form polynomials plus only exact/deterministic operations
// (+, -, *, /, sqrt, abs, floor, round). Double arithmetic is bit-identical
// across architectures, so these return the same bits on x64 and arm64.
// They approximate Math.sin/cos/atan2 to ~1e-11 absolute (verified by the
// selfcheck sweep against Math.*), which is far below visible in a bake.
//
// GUARDRAIL — this changes bits vs Math.*. It is NEVER default-on under the
// byte-identical law. The opt-in is the `trig` option on bakeParticles():
//   - 'native' (default) — the exact Math.sin/cos/atan2 references;
//     byte-identical to today, provably (see resolveTrig + the selfcheck).
//   - 'det' — these polynomials; cross-architecture deterministic.
// Unknown values throw; there is no silent fallback. The 'det' path forces
// the JS bake engine (the wasm module has its own trig, out of scope).

export const TRIG_NATIVE = 'native';
export const TRIG_DET = 'det';

// --- range reduction -------------------------------------------------------
// x = q*(π/2) + r, |r| ≤ π/4, k = q mod 8 (octant). π/2 as a two-double
// split (Hi+Lo ≈ 106 bits) keeps the reduction error ~1e-12 for the
// |x| ≤ ~1e4 arguments the bake actually produces (flap-phase terms carry
// seedOffset up to 1e4).
const PIO2_HI = 1.5707963267948966;
const PIO2_LO = 6.123233995736766e-17;
const TWO_OVER_PI = 0.6366197723675814; // 2/π

// Polynomial coefficients (fdlibm-derived): sin on [-π/4, π/4], degree 13.
const S1 = -1.66666666666666324348e-01;
const S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676768e-06;
const S5 = -2.50507602534068634195e-08;
const S6 = 1.58969099521155010221e-10;
// cos on [-π/4, π/4], degree 14.
const C1 = 4.16666666666666019037e-02;
const C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09;
const C6 = -1.13596475577881948265e-11;

function sinPoly(r) {
  const r2 = r * r;
  return r + r * r2 * (S1 + r2 * (S2 + r2 * (S3 + r2 * (S4 + r2 * (S5 + r2 * S6)))));
}

function cosPoly(r) {
  const r2 = r * r;
  return 1 - r2 * 0.5 + r2 * r2 * (C1 + r2 * (C2 + r2 * (C3 + r2 * (C4 + r2 * (C5 + r2 * C6)))));
}

/**
 * Deterministic sin — same bits on x64 and arm64.
 * NaN/±Infinity → NaN, matching Math.sin.
 */
export function detSin(x) {
  if (!(x < Infinity && x > -Infinity)) return NaN;
  const q = Math.round(x * TWO_OVER_PI);
  const r = (x - q * PIO2_HI) - q * PIO2_LO;
  const k = ((q % 8) + 8) % 8;
  const s = sinPoly(r);
  const c = cosPoly(r);
  // sin(q·π/2 + r) by octant.
  switch (k) {
    case 0: return s;
    case 1: return c;
    case 2: return -s;
    case 3: return -c;
    case 4: return s;
    case 5: return c;
    case 6: return -s;
    default: return -c; // k === 7
  }
}

/**
 * Deterministic cos — same bits on x64 and arm64.
 * NaN/±Infinity → NaN, matching Math.cos.
 */
export function detCos(x) {
  if (!(x < Infinity && x > -Infinity)) return NaN;
  const q = Math.round(x * TWO_OVER_PI);
  const r = (x - q * PIO2_HI) - q * PIO2_LO;
  const k = ((q % 8) + 8) % 8;
  const s = sinPoly(r);
  const c = cosPoly(r);
  // cos(q·π/2 + r) by octant.
  switch (k) {
    case 0: return c;
    case 1: return -s;
    case 2: return -c;
    case 3: return s;
    case 4: return c;
    case 5: return -s;
    case 6: return -c;
    default: return s; // k === 7
  }
}

// atan on [0, 1]: two half-angle reductions (atan(r) = 2·atan(r/(1+√(1+r²))))
// shrink the argument to ≤ tan(π/16) ≈ 0.1989, then an odd Taylor polynomial
// (degree 13, remainder < 1e-11). All operations are deterministic doubles.
function atanUnit(r) {
  let s = r;
  s = s / (1 + Math.sqrt(1 + s * s));
  s = s / (1 + Math.sqrt(1 + s * s));
  const s2 = s * s;
  const p = 1 + s2 * (-1 / 3 + s2 * (1 / 5 + s2 * (-1 / 7 + s2 * (1 / 9 + s2 * (-1 / 11 + s2 * (1 / 13))))));
  return 4 * s * p;
}

const PI = Math.PI; // exact constant — identical on every platform
const PI_HALF = 1.5707963267948966; // π/2, deterministic literal

/**
 * Deterministic atan2 — same bits on x64 and arm64.
 * Signed-zero/infinity semantics match Math.atan2; NaN propagates.
 */
export function detAtan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (y === 0) {
    // Signed-zero semantics matching Math.atan2.
    if (x > 0 || (x === 0 && 1 / x > 0)) return y; // ±0
    return 1 / y < 0 ? -PI : PI; // x < 0 or x === -0 → ±π
  }
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a;
  if (ax === Infinity && ay === Infinity) a = PI / 4;
  else if (ax === Infinity) a = 0;
  else if (ay === Infinity) a = PI_HALF;
  else if (ax >= ay) a = atanUnit(ay / ax);
  else a = PI_HALF - atanUnit(ax / ay);
  if (x < 0) a = PI - a;
  if (y < 0) a = -a;
  return a;
}

/** The exact Math.* references — the default trig source, byte-identical to today. */
export const NATIVE_TRIG = Object.freeze({
  sin: Math.sin,
  cos: Math.cos,
  atan2: Math.atan2,
});

/** The deterministic polynomial trig source — opt-in only (#1240). */
export const DET_TRIG = Object.freeze({
  sin: detSin,
  cos: detCos,
  atan2: detAtan2,
});

/**
 * Resolve a `trig` option to a trig source. undefined/null/'native' →
 * NATIVE_TRIG (today's exact Math.* calls); 'det' → DET_TRIG. Anything else
 * throws — an unknown trig mode must never silently fall back.
 */
export function resolveTrig(mode) {
  if (mode === undefined || mode === null || mode === TRIG_NATIVE) return NATIVE_TRIG;
  if (mode === TRIG_DET) return DET_TRIG;
  throw new Error(
    `unknown trig mode "${mode}" — use '${TRIG_NATIVE}' (default) or '${TRIG_DET}' (opt-in deterministic)`,
  );
}
