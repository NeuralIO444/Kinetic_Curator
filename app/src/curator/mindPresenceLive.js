// mindPresenceLive.js — #1464 Mind 3: the live personality layer startMind takes as `presence`.
//
// Owns what the pure modules may not touch: the wall clock (engagement accrues and decays in real time, across
// sessions), localStorage (scores persist on this machine, personas stored by index), and the ONE startup calendar
// reading (taken when the driver is made, cached for the session; a failed reading means no modulation, nothing else
// changes). Every bar it turns the artist's activity into engagement, and hands each persona her tier and zodiac.
//
// Hidden by design: no main-UI surface reads this. The dev panel's MIND tab reads getPresenceView() for tuning.
import { PERSONAS } from './mindContract.js';
import { createEngagement, decodeEngagement, TIER_FLOORS, WEIGHTS, HALF_LIFE_DAYS, COOL_ENTER } from './mindEngage.js';
import { createPresence, TIER_SHAPE, COOL } from './mindPresence.js';
import { readCalendar, modulation, zodiacBlock, SIGNS, TEMPERAMENT, BIRTHDAYS } from './mindZodiac.js';

export const STORAGE_KEY = 'kc:mind:presence';
/** Save the scores every this many bars (and when the driver stops). */
export const SAVE_EVERY_BARS = 16;
/** How each persona is shown in the dev readout (the third is never named on any surface, the dev panel included). */
const LABELS = Object.freeze({ lois: 'LOIS', davis: 'DAVIS', queen: 'III' });

let view = null;
const listeners = new Set();
const notify = () => { for (const fn of listeners) { try { fn(); } catch { /* a listener must not break the loop */ } } };

/** The dev readout, or null before the driver runs: { reading, rows: [...], constants }. */
export function getPresenceView() { return view; }
export function subscribePresence(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const delta = (now, prev, k) => Math.max(0, (Number(now && now[k]) || 0) - (Number(prev && prev[k]) || 0));

/**
 * @param getSignals () => cumulative counters { active, keeps, exports, returns, evolves, dwelling, audio }
 *                   (counts only ever grow within a session; this driver takes the per-bar difference)
 * @param storage    { getItem, setItem } (localStorage by default; absent or throwing = scores live for this session only)
 * @param now        () => ms (Date.now by default)
 * @param today      the Date the startup reading is taken from (new Date() by default)
 */
export function createPresenceDriver({ getSignals, storage = globalThis.localStorage, now = () => Date.now(), today = undefined } = {}) {
  let saved;
  try { saved = storage ? storage.getItem(STORAGE_KEY) : null; } catch { saved = null; }
  const book = createEngagement(decodeEngagement(saved));
  let reading = null;
  try { reading = readCalendar(today instanceof Date ? today : new Date()); } catch { reading = null; }
  const mods = Object.fromEntries(PERSONAS.map((p) => [p, modulation(p, reading)]));
  const halfLifeMul = Object.fromEntries(PERSONAS.map((p) => [p, mods[p].halfLife]));
  const personas = Object.fromEntries(PERSONAS.map((p) => [p, createPresence(p, { level: book.get(p).tier })]));
  const last = Object.fromEntries(PERSONAS.map((p) => [p, null])); // the last shaped decision's traits, for the readout
  let prev = null;
  let bars = 0;

  const save = () => { try { if (storage) storage.setItem(STORAGE_KEY, book.encode()); } catch { /* private mode: this session only */ } };
  const publish = () => {
    view = {
      reading: reading ? { ...reading } : null,
      rows: PERSONAS.map((p) => {
        const e = book.get(p);
        const tr = last[p];
        return {
          label: LABELS[p], sign: SIGNS[p], score: Math.round(e.score * 10) / 10, tier: e.tier, level: personas[p].level,
          cool: e.cool, floor: e.floor, next: e.next, mod: mods[p], halfLifeDays: HALF_LIFE_DAYS[p] * mods[p].halfLife,
          moved: tr ? (tr.g ? 'own move' : tr.r ? 'rested' : tr.gh ? `presence ${tr.gh.k} ${tr.gh.s}` : '') : '',
          weights: WEIGHTS[p], temperament: TEMPERAMENT[SIGNS[p]], born: BIRTHDAYS[p].join('-'),
        };
      }),
      constants: { floors: TIER_FLOORS, shape: TIER_SHAPE, cool: COOL, coolEnter: COOL_ENTER },
    };
    notify();
  };
  publish();

  return {
    /** One live bar: activity → engagement. */
    beforeBar() {
      let sig;
      try { sig = getSignals(); } catch { sig = null; }
      if (sig) {
        const step = {
          active: !!sig.active, dwelling: !!sig.dwelling, audio: !!sig.audio,
          keeps: delta(sig, prev, 'keeps'), exports: delta(sig, prev, 'exports'), returns: delta(sig, prev, 'returns'), evolves: delta(sig, prev, 'evolves'),
        };
        prev = sig;
        book.step(step, now(), halfLifeMul);
      }
      if (++bars % SAVE_EVERY_BARS === 0) save();
    },
    /** The persona's own context additions: her tier, and the zodiac block when the startup reading worked. */
    contextFor(persona) {
      const z = zodiacBlock(persona, reading);
      return { tier: `t${book.get(persona).tier}`, ...(z ? { zodiac: z } : {}) };
    },
    shape(d, ctx) {
      const e = book.get(d.persona);
      const out = personas[d.persona].shape(d, { tier: e.tier, cool: e.cool, mod: mods[d.persona], room: ctx && ctx.room });
      last[d.persona] = out.traits;
      if (d.persona === PERSONAS[PERSONAS.length - 1]) publish(); // once a bar, after the last persona
      return out;
    },
    stop() { save(); },
    /** For the selfcheck. */
    get reading() { return reading; },
    engagement: (p) => book.get(p),
  };
}
