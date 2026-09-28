// #589 — Euclidean phrase clock: rhythm with holes.
//
// Bjorklund's algorithm distributes k hits as evenly as possible over n steps.
// The phrase then advances only on HIT steps, so the wrap lands where the foot
// did not expect it — five in eight, and the misses are the piece.
//
// Pure: no store, no timers. The hook owns the interval, this owns the pattern.

export const EUCLID_MAX_STEPS = 32;

/**
 * Bjorklund proper — pair-and-fold, not the floor((i*k)/n) Bresenham shortcut.
 * The shortcut produces a ROTATION of the canonical pattern (it gives
 * 10101101 for E(5,8), the sixth rotation of the cinquillo), which would make
 * the named rhythms wrong by a displacement even though the necklace matches.
 * The canon is what people hear, so the canon is what we build.
 */
function bjorklund(k, n) {
  let a = Array.from({ length: k }, () => [1]);
  let b = Array.from({ length: n - k }, () => [0]);
  while (b.length > 1 && a.length > 0) {
    const m = Math.min(a.length, b.length);
    const paired = [];
    for (let i = 0; i < m; i++) paired.push(a[i].concat(b[i]));
    const restA = a.slice(m);
    const restB = b.slice(m);
    a = paired;
    b = restA.length ? restA : restB;
  }
  return a.concat(b).flat();
}

/**
 * The pattern for (beats, steps, rotate) as an array of 0/1.
 *
 * FAIL-CLOSED, and deliberately toward the known behaviour rather than
 * silence: steps is clamped into [1, EUCLID_MAX_STEPS], and beats is clamped
 * into [0, steps]. k > n has no Euclidean meaning, and the only two honest
 * answers are "every step" or "no step". Every step is chosen: it degrades to
 * a plain metro, which is a clock the performer can hear and recover from
 * mid-set. Silence looks identical to a broken instrument.
 */
export function euclidPattern(beats, steps, rotate = 0) {
  const n = Math.max(1, Math.min(EUCLID_MAX_STEPS, Math.round(Number(steps) || 1)));
  const rawK = Math.round(Number(beats) || 0);
  const k = Math.max(0, Math.min(n, rawK));
  if (k === 0) return new Array(n).fill(0);
  if (k === n) return new Array(n).fill(1);
  const base = bjorklund(k, n);
  const r = ((Math.round(Number(rotate) || 0) % n) + n) % n;
  if (!r) return base;
  return base.map((_, i) => base[(i + r) % n]);
}

/** Does the Euclidean clock fire on this step? */
export function euclidHit(step, beats, steps, rotate = 0) {
  const pattern = euclidPattern(beats, steps, rotate);
  const i = ((Math.round(Number(step) || 0) % pattern.length) + pattern.length) % pattern.length;
  return pattern[i] === 1;
}

/** Render a pattern as `x` / `.` — the shape the performer is counting. */
export function euclidString(beats, steps, rotate = 0) {
  return euclidPattern(beats, steps, rotate).map((v) => (v ? 'x' : '.')).join('');
}
