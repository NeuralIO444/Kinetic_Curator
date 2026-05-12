// xorshift32 — tiny seeded PRNG
// Deterministic: same seed always produces same sequence
export function mkRng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}
