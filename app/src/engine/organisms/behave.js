/**
 * Named organism steering. Weights only — the integrator stays in particles.js.
 * Adding a profile is a row in BEHAVE, not a new force type.
 */

export const BEHAVE_IDS = ['cruise', 'flock', 'orbit', 'scatter', 'mold', 'levy', 'lorenz'];

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
  // #582 — levy: foraging, not wandering. Long holds broken by one long
  // stride. The steering is deliberately the quietest row in the table (almost
  // no separation, almost no wind) because the hold has to actually be still —
  // measured, the baseline drift is the noise floor a stride must beat, and at
  // scatter/cruise levels it buries the branch entirely. The stride itself
  // comes from the gated Levy branch in particles.js, which this row opts into
  // with levyGain. Table-only, like chemotaxis/deposit: a per-layer behave*
  // override cannot switch the branch on for another verb.
  levy: {
    sep: 0.6,
    ali: 0.02,
    coh: 0.05,
    sepR: 32,
    aliR: 24,
    cohR: 28,
    wind: 0.01,
    orbit: 0,
    attract: 0.05,
    levyGain: 0.004,
    levyAlpha: 1.35,
  },
  // #583 — lorenz: weather inside a jar. The agent rides the flow of a Lorenz
  // system, so its heading is bounded but never repeats: it circles one
  // invisible center, then flips to the other. Quiet steering for the same
  // reason as levy — the ride is the signal, and separation/wind at cruise
  // levels drowns it. Table-only, gated like chemotaxis.
  lorenz: {
    sep: 1.2,
    ali: 0.06,
    coh: 0.18,
    sepR: 40,
    aliR: 32,
    cohR: 44,
    wind: 0.02,
    orbit: 0,
    attract: 0.1,
    lorenzGain: 0.05,
    lorenzRho: 28,
  },
};

/**
 * #582 — Levy step length, as a pure function of one uniform draw.
 *
 * Inverse-transform Pareto: with u uniform on [0,1), (1-u)^(-1/alpha) has tail
 * P(L > l) = l^-alpha. That is the whole point — the tail index alpha is the
 * distribution FAMILY, not a scale knob:
 *   alpha -> 2  : light tail, steps cluster, reads as Brownian wander
 *   alpha ~ 1.3 : the foraging band (most flights a hold, rare strides)
 *   alpha -> 0  : almost every draw saturates the cap
 * Authored range is (0, 2]: at alpha <= 0 the exponent flips sign and long
 * steps become IMPOSSIBLE instead of rare, and above 2 the character stops
 * being Levy at all. Both silently change the family rather than failing, so
 * the value is clamped here rather than trusted.
 *
 * Returned SHIFTED by the Pareto floor (L-1), so the result is "how far past a
 * hold this flight goes" and the common draw is ~0. Unshifted, the smallest
 * possible draw is still 1, so every "hold" would creep — and the hold has to
 * be still or the stride has nothing to contrast against. The shift keeps the
 * tail: P(L-1 > l) = (1+l)^-alpha.
 *
 * The cap is what makes it safe to integrate: u -> 1 sends the raw draw to
 * infinity, and one Infinity in the force pass poisons a particle's position
 * permanently (the speed clamp cannot bound a non-finite). LEVY_MAX_STEP is
 * therefore a hard ceiling, not a tuning value.
 */
export const LEVY_ALPHA_MIN = 0.05;
export const LEVY_ALPHA_MAX = 2;
export const LEVY_MAX_STEP = 64;

/**
 * #582 — how long an agent commits to one flight, in frames. This is what
 * makes the walk Levy rather than Brownian: a heavy-tailed magnitude re-drawn
 * every frame averages out over any visible window (measured: displacement
 * spread 4.3 with the branch on vs 4.2 off — indistinguishable). Held for a
 * stretch, a rare large draw becomes a sustained stride instead of one clipped
 * frame — the speed clamp bounds per-frame velocity, so magnitude alone cannot
 * produce distance. Duration does.
 */
export const LEVY_FLIGHT_FRAMES = 45;

export function levyStep(u, alpha) {
  const a = Math.min(LEVY_ALPHA_MAX, Math.max(LEVY_ALPHA_MIN, Number(alpha) || LEVY_ALPHA_MIN));
  const uu = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  // 1-u keeps the draw in (0,1]; the floor bounds the raw value before the cap
  // so no intermediate is ever Infinity.
  const L = Math.pow(Math.max(1 - uu, 1e-9), -1 / a) - 1;
  return L > LEVY_MAX_STEP ? LEVY_MAX_STEP : L;
}

/**
 * #583 — the Lorenz system, as a pure derivative.
 *
 * dx = sigma(y - x);  dy = x(rho - z) - y;  dz = xy - beta*z
 *
 * sigma and beta are the canonical 10 and 8/3 and are NOT authored: they are
 * what make this the Lorenz attractor rather than a generic 3-variable ODE.
 * `rho` is the drama knob and the only one exposed, because gain alone just
 * scales the ride without changing its character:
 *   rho < ~24.7 : the trajectory spirals into a fixed point and STOPS
 *                 flipping lobes (measured: 0 flips at rho 14) — restful, not
 *                 chaotic
 *   rho = 28    : classic chaos, the butterfly, the authored default
 *   rho > ~35   : a larger, more violent attractor (measured at 40: |y| to
 *                 37.6, z to 69.4) that swings wider across the plate
 * Authored range is [1, 60]: at rho <= 1 the only attractor is the origin,
 * which is a dead agent, and far above 60 the excursions outgrow the plate.
 */
export const LORENZ_SIGMA = 10;
export const LORENZ_BETA = 8 / 3;
export const LORENZ_RHO_MIN = 1;
export const LORENZ_RHO_MAX = 60;
/**
 * Integration step. Fixed, and deliberately small: Lorenz is stiff enough that
 * a forward Euler step of 0.02 drifts OFF the attractor (measured z to 60.1
 * against the true ~47.5 ceiling). This is integrated RK2 (midpoint) at 0.006,
 * which holds the classic bounds; the cost is one extra derivative per agent
 * per frame, paid only by a cast that opted into the row.
 */
export const LORENZ_DT = 0.006;

export function lorenzDeriv(x, y, z, rho) {
  return {
    dx: LORENZ_SIGMA * (y - x),
    dy: x * (rho - z) - y,
    dz: x * y - LORENZ_BETA * z,
  };
}

/** One RK2 (midpoint) step. Returns the advanced state; pure. */
export function lorenzAdvance(x, y, z, rho, dt) {
  const r = Math.min(LORENZ_RHO_MAX, Math.max(LORENZ_RHO_MIN, Number(rho) || LORENZ_RHO_MIN));
  const k1 = lorenzDeriv(x, y, z, r);
  const hx = x + k1.dx * dt * 0.5;
  const hy = y + k1.dy * dt * 0.5;
  const hz = z + k1.dz * dt * 0.5;
  const k2 = lorenzDeriv(hx, hy, hz, r);
  return { x: x + k2.dx * dt, y: y + k2.dy * dt, z: z + k2.dz * dt, dx: k2.dx, dy: k2.dy };
}

/**
 * Seed one agent onto the attractor. The origin is a FIXED POINT — an agent
 * left at (0,0,0) never moves and never will — so the draw is pushed clear of
 * it rather than merely randomised.
 */
export function lorenzSeed(u1, u2, u3) {
  const sgn = u1 < 0.5 ? -1 : 1;
  return {
    x: sgn * (4 + u1 * 12),
    y: sgn * (4 + u2 * 12),
    z: 10 + u3 * 25,
  };
}

export function resolveBehave(id) {
  return BEHAVE[id] || BEHAVE.cruise;
}

/** #479 Option B — which table fields a per-layer override can replace. */
export const BEHAVE_OVERRIDE_FIELDS = [
  'sep', 'ali', 'coh', 'sepR', 'aliR', 'cohR', 'wind', 'orbit', 'attract',
];

/**
 * #479 Option B — the table row for `layoutParams.behave`, with any
 * per-layer overrides (`layoutParams.behaveSep`, `behaveAli`, ...) applied
 * on top. null (the field's default — no override) falls through to the
 * table's own value, so an unedited layer is identical to before overrides
 * existed. Shared by particles.js (the one-writer for the actual physics)
 * and the DAVIS readout/editor, so the two can never drift on what
 * "effective" means. chemotaxis/deposit/lambda are not overridable —
 * table-only, same as before this existed.
 */
export function resolveEffectiveBehave(layoutParams) {
  const row = resolveBehave(layoutParams.behave);
  const out = { ...row };
  for (const key of BEHAVE_OVERRIDE_FIELDS) {
    const override = layoutParams[`behave${key[0].toUpperCase()}${key.slice(1)}`];
    if (override != null) out[key] = override;
  }
  return out;
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
