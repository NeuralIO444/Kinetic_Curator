/**
 * Named organism steering. Weights only — the integrator stays in particles.js.
 * Adding a profile is a row in BEHAVE, not a new force type.
 */

export const BEHAVE_IDS = ['cruise', 'flock', 'orbit', 'scatter', 'mold'];

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
  // #287 — mold: a slow colony that lays scent trails and climbs them.
  // chemotaxis is the scent-gradient gain read by the force pass in
  // particles.js (mold only); deposit is the per-step scent amount each
  // agent leaves behind — the colony sustains itself through scent
  // feeding while a lone cast tires.
  mold: {
    sep: 2.2,
    ali: 0.15,
    coh: 0.55,
    sepR: 48,
    aliR: 40,
    cohR: 64,
    wind: 0.08,
    orbit: 0,
    attract: 0.1,
    chemotaxis: 0.15,
    deposit: 0.06,
  },
};

export function resolveBehave(id) {
  return BEHAVE[id] || BEHAVE.cruise;
}

/**
 * #479 — which wind kernel a swarm uses (divergence-free curl vs point-angle
 * noise). Factored out of particles.js's inline if/else so the DAVIS
 * read-only readout can show it without re-deriving or drifting from the
 * engine's own logic. An explicit windMode/windType always wins; otherwise
 * it's a hidden per-behave/mode default — flock, mold, and murmuration ride
 * curl, everything else stays point. Pure and side-effect free.
 */
export function resolveWindMode(layoutParams) {
  if (layoutParams.windMode === 'curl' || layoutParams.windType === 'curl') return 'curl';
  if (layoutParams.windMode === 'point' || layoutParams.windType === 'point') return 'point';
  const { behave, mode } = layoutParams;
  return (behave === 'flock' || behave === 'mold' || mode === 'murmuration') ? 'curl' : 'point';
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
