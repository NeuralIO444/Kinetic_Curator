// #796 — diorama parallax on existing zTiers. Seeded, slow, no extra pass.
export function parallaxOffset(zTier, tiers, parallax, seed, loopTimeMs) {
  const amt = Number(parallax) || 0;
  if (!(amt > 0)) return { x: 0, y: 0 };
  const n = Math.max(1, Number(tiers) || 1);
  const tier = Math.max(0, Number(zTier) || 0);
  const t = (Number(loopTimeMs) || 0) * 0.001;
  const phase = (Number(seed) || 0) * 0.000001;
  const camX = Math.sin(t * 0.11 + phase) * 10 * amt;
  const camY = Math.cos(t * 0.07 + phase * 1.3) * 6 * amt;
  const f = n <= 1 ? 0.5 : tier / (n - 1);
  const k = 0.25 + f * 0.85;
  return { x: camX * k, y: camY * k };
}

export function applyParallax(instances, { zTiers, parallax, seed, loopTimeMs }) {
  if (!(parallax > 0) || !instances) return instances;
  for (const it of instances) {
    const o = parallaxOffset(it.zTier, zTiers, parallax, seed, loopTimeMs);
    it.x += o.x;
    it.y += o.y;
  }
  return instances;
}
