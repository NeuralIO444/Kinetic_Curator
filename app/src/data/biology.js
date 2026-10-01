// #793 Biology policy — how forms live and die. Taste (#762) is what to keep.
export const BIOLOGY_KIND = 'kc-biology';
export const BIOLOGY_VERSION = 1;

export const BIOLOGY_DEFAULT = Object.freeze({
  kind: BIOLOGY_KIND,
  version: BIOLOGY_VERSION,
  birthRate: 0.15,
  ageRate: 0.08,
  fadeStart: 0.65,
  fadeRate: 0.25,
  regrowBelow: 0.35,
  popCap: 240,
  neverStatic: true,
});

export function sanitizeBiology(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...BIOLOGY_DEFAULT };
  const clamp = (k, lo, hi) => {
    const n = Number(raw[k]);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : BIOLOGY_DEFAULT[k];
  };
  return {
    kind: BIOLOGY_KIND,
    version: BIOLOGY_VERSION,
    birthRate: clamp('birthRate', 0, 1),
    ageRate: clamp('ageRate', 0, 1),
    fadeStart: clamp('fadeStart', 0, 1),
    fadeRate: clamp('fadeRate', 0, 1),
    regrowBelow: clamp('regrowBelow', 0, 1),
    popCap: Math.round(clamp('popCap', 8, 800)),
    neverStatic: raw.neverStatic !== false,
  };
}

/** One tick of population policy. Pure. Samplers (#720) call this. */
export function stepBiology({ pop = 0, ageMean = 0 }, policy = BIOLOGY_DEFAULT, dtSec = 1 / 60) {
  const p = sanitizeBiology(policy);
  const dt = Math.max(0, Number(dtSec) || 0);
  let n = Math.max(0, pop);
  let age = Math.max(0, Math.min(1, ageMean));
  const startRatio = n / p.popCap;
  const regrow = startRatio < p.regrowBelow;
  age = Math.min(1, age + p.ageRate * dt);
  if (n > p.popCap) n = p.popCap;
  if (regrow) n = Math.min(p.popCap, n + p.birthRate * p.popCap * dt);
  else if (n < p.popCap) n = Math.min(p.popCap, n + p.birthRate * 0.25 * p.popCap * dt);
  const fading = age >= p.fadeStart;
  const fade = fading ? Math.min(1, (age - p.fadeStart) * p.fadeRate * 4) : 0;
  if (p.neverStatic && n < 2) n = 2;
  return { pop: n, ageMean: age, fade, regrow };
}
