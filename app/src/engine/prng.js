// xorshift32 — tiny seeded PRNG
// Deterministic: same seed always produces same sequence
export function mkRng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const v = (s >>> 0) / 0xffffffff;
    // xorshift32 has full period: every seed's stream eventually visits the
    // state 0xffffffff, which maps to exactly 1.0. Callers do
    // Math.floor(rng() * len) — 1.0 indexes one past the end and propagates
    // undefined. Clamp just that case; every other value is bit-identical,
    // so all determinism fixtures are unaffected.
    return v === 1 ? 1 - Number.EPSILON : v;
  };
}
