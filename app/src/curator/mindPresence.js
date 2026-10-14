// mindPresence.js — #1464 Mind 3: the personality layer on top of every decision. Pure: (decision, tier, temperament,
// modulation, seed) in, (decision, traits) out. It runs the same on Apple Intelligence and on the rules — personality
// never depends on a model being present.
//
// Tiers govern FREQUENCY and STRENGTH, never which states exist (Matt, 2026-10-13):
//   - LOIS and Davis: how often a face moves, how strongly it shows (face fidelity), and how long a line may be.
//     A model's move is scaled to the tier and rested when it comes too soon after the last one; when nothing else
//     moves the face, the persona may make a move of her own — one of her zodiac sign's micro-expressions. Those are
//     INVENTED states and recorded as invented (and as `g`: the personality layer made it), never passed off as a
//     measured verdict.
//   - The third: her ghost in the Stimuli panel. Tier 1 is near-silent and deniable; higher tiers make her presences
//     come more often and read more clearly. Still never named anywhere.
//   - A tier-up eases in over EASE_BARS bars (the eased `level` interpolates every number below).
//   - Cool-down makes a persona quieter, rarer and softer instead of demoting her.
//
// Every number that shaped a decision is written into its traits and recorded with the take: a behaviour that cannot
// be explained from the recorded inputs is a bug.
import { isInvented } from './mindContract.js';
import { SIGNS, TEMPERAMENT, UNMODULATED } from './mindZodiac.js';

/** Bars a tier-up takes to ease in. */
export const EASE_BARS = 4;
/**
 * Per tier: chance per bar of a move of her own, strength (face intensity), gap (× the sign's recharge), the longest
 * line in characters, and the third's strongest presence (0..1).
 */
export const TIER_SHAPE = Object.freeze({
  1: Object.freeze({ freq: 0.02, strength: 0.35, gap: 4, lineMax: 50, ghostMax: 0.08 }),
  2: Object.freeze({ freq: 0.05, strength: 0.5, gap: 2, lineMax: 80, ghostMax: 0.25 }),
  3: Object.freeze({ freq: 0.09, strength: 0.7, gap: 1.25, lineMax: 110, ghostMax: 0.5 }),
  4: Object.freeze({ freq: 0.14, strength: 0.9, gap: 1, lineMax: 140, ghostMax: 0.8 }),
});
/** Cool-down: multipliers on frequency and strength, and on the rest between moves. */
export const COOL = Object.freeze({ freq: 0.4, strength: 0.6, gap: 2 });
/** Which kind of presence a mood calls up in the third. */
export const GHOST_FOR_MOOD = Object.freeze({ lift: 'warm', drive: 'warm', calm: 'drift', sparse: 'drift', shift: 'lean', weird: 'lean' });
export const GHOST_KINDS = Object.freeze(['warm', 'drift', 'lean']);
export const METER_BAND_COUNT = 7;

const round2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The tier shape at an eased level (1..4), linearly between the two tiers around it. */
export function shapeAt(level) {
  const l = clamp(Number.isFinite(level) ? level : 1, 1, 4);
  const a = TIER_SHAPE[Math.floor(l)];
  const b = TIER_SHAPE[Math.min(4, Math.floor(l) + 1)];
  const f = l - Math.floor(l);
  const mix = (k) => a[k] + (b[k] - a[k]) * f;
  return { freq: mix('freq'), strength: mix('strength'), gap: mix('gap'), lineMax: Math.round(mix('lineMax')), ghostMax: mix('ghostMax') };
}

/** A small seeded generator: the same (seed, salt) always rolls the same numbers. */
export function rng(seed, salt) {
  let s = ((seed >>> 0) ^ Math.imul((salt >>> 0) + 1, 0x85ebca6b)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SALT = { lois: 11, davis: 23, queen: 37 };

/** Is this reply's state just the face the room already shows (a reading, not a move)? */
const isReading = (persona, state, room) => !!state && room && state.id === room[persona] && state.intensity === 1 && state.decay === 0;

/**
 * One persona's personality. The caller feeds it every decision (in bar order) with the persona's current tier and
 * cool-down; it returns the decision as the stage should see it, plus its traits.
 * @param persona 'lois' | 'davis' | 'queen'
 * @param level   the eased tier to start at (a fresh session starts AT its tier: the ease is for tier-ups)
 */
export function createPresence(persona, { level = 1 } = {}) {
  const temper = TEMPERAMENT[SIGNS[persona]];
  if (!temper) throw new TypeError(`[mind] no temperament for ${String(persona)}`);
  let eased = clamp(level, 1, 4);
  let lastMove = -Infinity;
  let episode = null; // the third: { kind, from, until, strength, band }

  return {
    get level() { return eased; },
    /**
     * @param d        a decision from the thinker { persona, bar, backend, seed, invented, reply }
     * @param tier     1..4 (the highest reached)
     * @param cool     in cool-down
     * @param mod      modulation(persona, reading) — UNMODULATED when the reading failed
     * @param room     { lois, davis } as the context saw it
     * @returns the shaped decision with `traits`: { t, l, c, g?, r?, gh? }
     */
    shape(d, { tier = 1, cool = false, mod = UNMODULATED, room = {} } = {}) {
      const t = TIER_SHAPE[tier] ? tier : 1;
      eased = eased < t ? Math.min(t, eased + 1 / EASE_BARS) : t; // tier-ups ease in; the tier never drops (cool-down instead)
      const sh = shapeAt(eased);
      const freq = sh.freq * temper.tempo * mod.tempo * (cool ? COOL.freq : 1);
      const strength = clamp(sh.strength * temper.intensity * mod.intensity * (cool ? COOL.strength : 1), 0.05, 1);
      const gap = Math.max(1, Math.ceil(temper.recharge * sh.gap * (cool ? COOL.gap : 1)));
      const traits = { t, l: round2(eased), c: cool ? 1 : 0 };
      const roll = rng(d.seed, SALT[persona] || 1);
      const reply = JSON.parse(JSON.stringify(d.reply));
      const bar = d.bar;
      const away = room && room.lois === 'AWAY';

      if (persona === 'queen') {
        if (episode && bar >= episode.until) episode = null;
        if (!episode && !away && bar - lastMove >= gap && roll() < freq) {
          const len = temper.hold + Math.floor(eased);
          episode = { kind: GHOST_FOR_MOOD[reply.mood] || 'drift', from: bar, until: bar + len, strength: round2(clamp(sh.ghostMax * temper.intensity * mod.intensity * (cool ? COOL.strength : 1), 0, 1)), band: Math.floor(roll() * METER_BAND_COUNT) };
          lastMove = bar;
        }
        if (episode) {
          // a swell: half on the first and last bar, full between — the surface eases between bars
          const edge = bar === episode.from || bar === episode.until - 1;
          traits.gh = { k: episode.kind, s: round2(episode.strength * (edge ? 0.5 : 1)), b: episode.band };
        }
        return { ...d, reply, traits };
      }

      const moved = !!reply.line || (!!reply.state && !isReading(persona, reply.state, room));
      if (moved) {
        if (bar - lastMove < gap) { // too soon after the last move: she rests, the face stays honest
          if (reply.state && !isReading(persona, reply.state, room)) delete reply.state;
          delete reply.line;
          traits.r = 1;
        } else {
          if (reply.state && !isReading(persona, reply.state, room)) reply.state = { ...reply.state, intensity: round2(clamp(reply.state.intensity * strength, 0.05, 1)) };
          if (reply.line && reply.line.length > sh.lineMax) delete reply.line; // longer lines are earned, never cut mid-thought
          lastMove = bar;
        }
      } else if (!away && bar - lastMove >= gap && roll() < freq) {
        const id = temper.moves[Math.floor(roll() * temper.moves.length)];
        reply.state = { id, intensity: round2(strength), decay: temper.hold };
        lastMove = bar;
        traits.g = 1;
      }
      return { ...d, reply, invented: isInvented(persona, reply), traits };
    },
    reset(nextLevel = eased) { eased = clamp(nextLevel, 1, 4); lastMove = -Infinity; episode = null; },
  };
}

/** Fail-closed check of a recorded traits object (mindRecord). */
export function checkTraits(tr) {
  if (!tr || typeof tr !== 'object' || Array.isArray(tr)) return false;
  for (const k of Object.keys(tr)) if (!['t', 'l', 'c', 'g', 'r', 'gh'].includes(k)) return false;
  if (!TIER_SHAPE[tr.t] || !Number.isFinite(tr.l) || tr.l < 1 || tr.l > 4 || (tr.c !== 0 && tr.c !== 1)) return false;
  if (tr.g !== undefined && tr.g !== 1) return false;
  if (tr.r !== undefined && tr.r !== 1) return false;
  if (tr.gh !== undefined) {
    const g = tr.gh;
    if (!g || typeof g !== 'object' || !GHOST_KINDS.includes(g.k) || !Number.isFinite(g.s) || g.s < 0 || g.s > 1) return false;
    if (!Number.isInteger(g.b) || g.b < 0 || g.b >= METER_BAND_COUNT || Object.keys(g).length !== 3) return false;
  }
  return true;
}
