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

export function openAlpha(alpha, local, amount, seed) {
  if (!(amount > 0)) return alpha;
  const d = Math.hypot(local.x - 0.5, local.y - 0.5);
  if (seed > 0.5) {
    const edge = (d < 0.05 ? 0 : d < 0.22 ? (d - 0.05) / 0.17 : d < 0.34 ? 1 : d < 0.48 ? 1 - (d - 0.34) / 0.14 : 0);
    return alpha * (1 - amount + amount * edge);
  }
  const hole = d < 0.12 ? 1 : d < 0.22 ? 1 - (d - 0.12) / 0.1 : 0;
  return alpha * (1 - amount * hole * (0.45 + 0.4 * seed));
}
