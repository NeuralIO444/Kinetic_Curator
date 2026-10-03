// Crooked Hand and Open Hand. Amount 0 is the identity. Seeded, not per frame.

export function crookedCorner(c, amount, seed) {
  if (!(amount > 0)) return { x: c.x, y: c.y };
  const shear = (seed * 2 - 1) * amount * 0.45;
  const pinch = (((seed * 7.13) % 1) * 2 - 1) * amount * 0.35;
  const y = c.y;
  let x = c.x + c.y * shear;
  x *= 1 - pinch * Math.max(-1, Math.min(1, y / 50));
  return { x, y };
}

export function stretchCorner(c, amount, seed) {
  if (!(amount > 0)) return { x: c.x, y: c.y };
  const s = seed * 3.7 - Math.floor(seed * 3.7); // fract, seed in [0,1)
  const m = (s * 2 - Math.floor(s * 2)) * 2 - 1; // -1..1 magnitude+sign
  const ax = s < 0.5 ? m : m * 0.25; // one axis dominates: wider or taller, never both equally
  const ay = s < 0.5 ? m * 0.25 : m;
  return { x: c.x * (1 + amount * 0.30 * ax), y: c.y * (1 + amount * 0.30 * ay) };
}

export function nickCorner(c, amount, seed, cornerIndex) {
  if (!(amount > 0)) return { x: c.x, y: c.y };
  const s = seed * 9.31 - Math.floor(seed * 9.31); // fract, seed in [0,1)
  const pick = Math.min(3, Math.floor(s * 4)); // one of the four corners
  if (pick !== cornerIndex) return { x: c.x, y: c.y };
  const k = 1 - amount * 0.35; // pull the picked corner toward center
  return { x: c.x * k, y: c.y * k };
}

export function flipCorner(c, amount, seed) {
  if (!(amount > 0)) return { x: c.x, y: c.y };
  const s = seed * 5.77 - Math.floor(seed * 5.77); // fract, seed in [0,1)
  if (!(s > 0.5)) return { x: c.x, y: c.y };
  return { x: -c.x, y: c.y }; // seeded horizontal turn, still the same cell
}

export function openAlpha(alpha, local, amount, seed) {
  if (!(amount > 0)) return alpha;
  const d = Math.hypot(local.x - 0.5, local.y - 0.5);
  const istr = seed * 3.3 - Math.floor(seed * 3.3); // ink pick strand
  const ipick = Math.min(2, Math.floor(istr * 3)); // 0 stroke, 1 hollow, 2 double
  if (ipick === 0) {
    const edge = (d < 0.05 ? 0 : d < 0.22 ? (d - 0.05) / 0.17 : d < 0.34 ? 1 : d < 0.48 ? 1 - (d - 0.34) / 0.14 : 0);
    return alpha * (1 - amount + amount * edge);
  }
  if (ipick === 1) {
    const hole = d < 0.12 ? 1 : d < 0.22 ? 1 - (d - 0.12) / 0.1 : 0;
    return alpha * (1 - amount * hole * (0.45 + 0.4 * seed));
  }
  // double: faint second strike; mirror models the mix bound (the GLSL samples the cell)
  const dstr = seed * 4.9 - Math.floor(seed * 4.9); // strike direction strand
  const faint = 0.5 + 0.5 * dstr;
  return alpha * (1 - amount * 0.35) + alpha * amount * 0.35 * faint;
}
