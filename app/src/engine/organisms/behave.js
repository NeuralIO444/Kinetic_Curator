/**
 * Named organism steering. Weights only — the integrator stays in particles.js.
 * Adding a profile is a row in BEHAVE, not a new force type.
 */

export const BEHAVE_IDS = ['cruise', 'flock', 'orbit', 'scatter'];

export const BEHAVE = {
  cruise: {
    sep: 3.1,
    ali: 0.28,
    coh: 0.12,
    sepR: 64,
    aliR: 48,
    cohR: 52,
    wind: 0.22,
    orbit: 0,
    attract: 0.45,
  },
  flock: {
    sep: 1.8,
    ali: 1.0,
    coh: 1.35,
    sepR: 40,
    aliR: 60,
    cohR: 70,
    wind: 0.35,
    orbit: 0,
    attract: 1,
  },
  orbit: {
    sep: 2.6,
    ali: 0.2,
    coh: 0.08,
    sepR: 56,
    aliR: 44,
    cohR: 48,
    wind: 0.12,
    orbit: 0.55,
    attract: 0.2,
  },
  scatter: {
    sep: 4.2,
    ali: 0,
    coh: 0,
    sepR: 80,
    aliR: 20,
    cohR: 20,
    wind: 0.18,
    orbit: 0,
    attract: 0.15,
  },
};

export function resolveBehave(id) {
  return BEHAVE[id] || BEHAVE.cruise;
}

/** Weak pull around plate center — Haeckel grid, not a drain. */
export function orbitForce(x, y, cx, cy, gain) {
  if (!gain) return { fx: 0, fy: 0 };
  const dx = cx - x;
  const dy = cy - y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const want = Math.min(d, 220);
  const err = (d - want * 0.45) / 400;
  return { fx: (dx / d) * err * gain, fy: (dy / d) * err * gain };
}
