// mindEngage.js — #1464 Mind 3: each persona's hidden engagement score, its tier, its decay and its cool-down. Pure:
// the caller hands it the time and the signals; nothing here reads a clock or storage.
//
// Matt's decisions (2026-10-13):
//   - LOIS, Davis and the third each keep an INDEPENDENT score mixing time in the product with demonstrated engagement
//     (keeps, dwell, returning to seeds, audio use). Earned, not just elapsed: each persona weighs the signals her own way.
//   - Scores are hidden (a readout lives in the dev panel only), persist across sessions, and DECAY over long absences,
//     each persona on her own curve (the zodiac reading may stretch or shorten it slightly).
//   - 4 tiers. Low engagement never demotes: the tier is the highest one reached, and a score that has fallen below its
//     tier's floor puts the persona in COOL-DOWN (quieter, rarer, softer) until it climbs back.
import { PERSONAS } from './mindContract.js';

export const TIERS = Object.freeze([1, 2, 3, 4]);
/** The score each tier starts at. */
export const TIER_FLOORS = Object.freeze([0, 60, 240, 720]);
export const SCORE_CAP = 2000;
/** Cool-down begins when the score falls below this share of the tier's floor, and ends back at the floor. */
export const COOL_ENTER = 0.85;
/** A gap between active bars longer than this is an absence, and the score decays across it. */
export const ABSENCE_MS = 30 * 60 * 1000;
const DAY_MS = 86400000;
/** Days for a score to halve while the artist is away. */
export const HALF_LIFE_DAYS = Object.freeze({ lois: 10, davis: 14, queen: 21 });

/**
 * Points per signal, per persona. One active bar is about two seconds at 120 BPM, so an hour of active play is
 * ~1800 bars. LOIS (the critic) rewards keeps and exports; Davis (the generator) dwelling and returning to seeds;
 * the third, sound.
 *   active  per bar the artist is present          keep    per keep           export  per export
 *   dwell   per bar spent lingering on a frame     return  per return to a kept/bloomed seed
 *   audio   per bar with audio on                  evolve  per evolve
 */
export const WEIGHTS = Object.freeze({
  lois: Object.freeze({ active: 0.04, keep: 6, export: 10, dwell: 0.05, return: 3, audio: 0.01, evolve: 1 }),
  davis: Object.freeze({ active: 0.05, keep: 3, export: 2, dwell: 0.12, return: 6, audio: 0.01, evolve: 3 }),
  queen: Object.freeze({ active: 0.04, keep: 1, export: 1, dwell: 0.02, return: 1, audio: 0.2, evolve: 0.5 }),
});

/** The tier a score has reached (1..4). */
export function tierOf(score) {
  let t = 1;
  for (let i = 0; i < TIER_FLOORS.length; i++) if (score >= TIER_FLOORS[i]) t = i + 1;
  return t;
}

const fresh = () => ({ score: 0, peak: 1, cool: false, lastAt: null });
const num = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Decode what was saved (fail closed: anything malformed starts that persona fresh). Personas are stored by index. */
export function decodeEngagement(raw) {
  const out = Object.fromEntries(PERSONAS.map((p) => [p, fresh()]));
  let o;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return out; }
  if (!o || o.v !== 1 || !Array.isArray(o.p)) return out;
  PERSONAS.forEach((p, i) => {
    const r = o.p[i];
    if (!Array.isArray(r) || r.length !== 4) return;
    const score = num(r[0], 0, SCORE_CAP);
    const peak = TIERS.includes(r[1]) ? r[1] : null;
    const lastAt = r[3] === null ? null : num(r[3], 0, 8.64e15);
    if (score === null || peak === null || (r[2] !== 0 && r[2] !== 1) || (r[3] !== null && lastAt === null)) return;
    out[p] = { score, peak: Math.max(peak, tierOf(score)), cool: r[2] === 1, lastAt };
  });
  return out;
}

/** The scores as the string to save (personas by index: no name is written down). */
export function encodeEngagement(state) {
  return JSON.stringify({ v: 1, p: PERSONAS.map((p) => { const s = state[p]; return [Math.round(s.score * 100) / 100, s.peak, s.cool ? 1 : 0, s.lastAt]; }) });
}

/** A score after `ms` away, on the persona's half-life (× the zodiac's halfLife multiplier). */
export function decayed(score, ms, halfLifeDays, halfLifeMul = 1) {
  if (!(ms > ABSENCE_MS)) return score;
  const hl = halfLifeDays * (Number.isFinite(halfLifeMul) && halfLifeMul > 0 ? halfLifeMul : 1);
  return score * Math.pow(0.5, ms / DAY_MS / hl);
}

/** Cool-down with hysteresis: enters below COOL_ENTER × the tier's floor, leaves back at the floor. Tier 1 never cools. */
export function coolOf(score, peak, wasCool) {
  if (peak <= 1) return false;
  const floor = TIER_FLOORS[peak - 1];
  return wasCool ? score < floor : score < floor * COOL_ENTER;
}

/** Points one bar's signals are worth to a persona. */
export function pointsFor(persona, s) {
  const w = WEIGHTS[persona];
  if (!w || !s || !s.active) return 0;
  const c = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  return w.active + w.keep * c(s.keeps) + w.export * c(s.exports) + (s.dwelling ? w.dwell : 0) + w.return * c(s.returns)
    + (s.audio ? w.audio : 0) + w.evolve * c(s.evolves);
}

/**
 * The live engagement book. `state` is what decodeEngagement returned.
 * step(signals, nowMs, halfLifeMul) — one bar. Only an ACTIVE bar counts or decays: an absence is measured from the
 * persona's last active bar to this one, so time away (a closed laptop, a week off) decays the score when the artist
 * comes back. halfLifeMul is { persona: multiplier } from the zodiac reading (1 without one).
 */
export function createEngagement(state = decodeEngagement(null)) {
  const book = Object.fromEntries(PERSONAS.map((p) => [p, { ...(state[p] || fresh()) }]));
  return {
    step(signals, nowMs, halfLifeMul = {}) {
      if (!signals || !signals.active || !Number.isFinite(nowMs)) return false;
      for (const p of PERSONAS) {
        const b = book[p];
        if (b.lastAt !== null && nowMs > b.lastAt) b.score = decayed(b.score, nowMs - b.lastAt, HALF_LIFE_DAYS[p], halfLifeMul[p]);
        b.score = Math.min(SCORE_CAP, b.score + pointsFor(p, signals));
        b.peak = Math.max(b.peak, tierOf(b.score));
        b.cool = coolOf(b.score, b.peak, b.cool);
        b.lastAt = nowMs;
      }
      return true;
    },
    /** { score, tier, cool, floor, next } — tier is the highest reached; next is the score the following tier needs. */
    get(persona) {
      const b = book[persona];
      if (!b) return null;
      return { score: b.score, tier: b.peak, cool: b.cool, floor: TIER_FLOORS[b.peak - 1], next: TIER_FLOORS[b.peak] ?? null };
    },
    snapshot() { return Object.fromEntries(PERSONAS.map((p) => [p, { ...book[p] }])); },
    encode() { return encodeEngagement(book); },
  };
}
