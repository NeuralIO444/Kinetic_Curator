// mindZodiac.js — #1464 Mind 3: the personas' zodiac character. Pure: every reading takes a Date the caller supplies.
//
// Matt's canon (2026-10-13): Davis — Gemini, June 13, 1971. LOIS (George Lois) — Cancer, June 26, 1931. The third —
// Capricorn, January 8, 1977. The sign is worked out from the birthday (never typed in twice), and it colours each
// persona's ONGOING behaviour: which moves they reach for, how often, how strongly, how long they rest between moves.
// It is character, not decoration.
//
// Modulation: at startup KC-1 takes ONE calendar reading (the system calendar: moon phase and season are computed from
// today's date, on the machine, no network), caches it for the session, and modulates the base colouring by it. If the
// reading fails there is NO modulation that session (no neutral substitute) — the base colouring and the tiers run as
// normal. Season is the northern hemisphere's (KC-1 is played in Los Angeles).
import { MOON_PHASES, SEASONS } from './mindContext.js';

/** Birthdays as canon: [year, month (1-12), day]. */
export const BIRTHDAYS = Object.freeze({
  davis: Object.freeze([1971, 6, 13]),
  lois: Object.freeze([1931, 6, 26]),
  queen: Object.freeze([1977, 1, 8]),
});

// Tropical signs: the first day (month, day) each sign begins, in calendar order from Capricorn's January tail.
const SIGN_STARTS = [
  [1, 20, 'aquarius'], [2, 19, 'pisces'], [3, 21, 'aries'], [4, 20, 'taurus'], [5, 21, 'gemini'], [6, 21, 'cancer'],
  [7, 23, 'leo'], [8, 23, 'virgo'], [9, 23, 'libra'], [10, 23, 'scorpio'], [11, 22, 'sagittarius'], [12, 22, 'capricorn'],
];

/** The sun sign for a month (1-12) and day, or null for an impossible date. */
export function signOf(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  let sign = 'capricorn'; // Dec 22 – Jan 19
  for (const [m, d, s] of SIGN_STARTS) if (month > m || (month === m && day >= d)) sign = s;
  return sign;
}

/** Each persona's sign, from the canon birthday. */
export const SIGNS = Object.freeze(Object.fromEntries(Object.entries(BIRTHDAYS).map(([p, [, m, d]]) => [p, signOf(m, d)])));

/**
 * The base colouring per sign (the three the personas were born under). Few, legible numbers — the dev panel shows them.
 *   moves       the invented micro-expressions the persona reaches for (the faces); for the third, the kinds of presence
 *   tempo       how often a move comes (× the tier's frequency)
 *   intensity   how strongly it shows (× the tier's strength)
 *   recharge    bars of rest after a move before another may come (× the tier's gap)
 *   hold        bars a move holds before it eases back
 *   season      the season that suits the sign's element; the opposite season damps it
 *   moonPull    how much the moon's light moves the tempo (Cancer is ruled by the Moon)
 */
export const TEMPERAMENT = Object.freeze({
  // Gemini, mutable air: quick, curious, two-sided; many small moves, short rests
  gemini: Object.freeze({ moves: Object.freeze(['tinkering', 'double-take', 'restless', 'grin']), tempo: 1.3, intensity: 0.85, recharge: 3, hold: 1, season: 'spring', moonPull: 0.2 }),
  // Cancer, cardinal water: moody, guarded, sentimental; fewer moves, felt harder, long rests
  cancer: Object.freeze({ moves: Object.freeze(['brood', 'guarded', 'wistful', 'side-eye']), tempo: 0.8, intensity: 1.1, recharge: 8, hold: 3, season: 'summer', moonPull: 0.6 }),
  // Capricorn, cardinal earth: patient, controlled, a slow build; rare presences that stay a while
  capricorn: Object.freeze({ moves: Object.freeze(['warm', 'drift', 'lean']), tempo: 0.7, intensity: 1, recharge: 12, hold: 4, season: 'winter', moonPull: 0.2 }),
});

const OPPOSITE = Object.freeze({ spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' });
const SYNODIC_DAYS = 29.530588853;
const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
const DAY_MS = 86400000;

/** Northern-hemisphere astronomical season for a month (1-12) and day (equinox/solstice dates, ±1 day). */
export function seasonOf(month, day) {
  const md = month * 100 + day;
  if (md >= 320 && md < 621) return 'spring';
  if (md >= 621 && md < 922) return 'summer';
  if (md >= 922 && md < 1221) return 'autumn';
  return 'winter';
}

/**
 * The one startup reading: { moonPhase, illumination 0..1, season } from a Date, or null when the date is unusable.
 * The caller takes it once per session and caches it.
 */
export function readCalendar(date) {
  const ms = date instanceof Date ? date.getTime() : NaN;
  if (!Number.isFinite(ms)) return null;
  const age = ((((ms - REF_NEW_MOON_MS) / DAY_MS) % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
  const moonPhase = MOON_PHASES[Math.floor((age / SYNODIC_DAYS) * 8 + 0.5) % 8];
  const illumination = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC_DAYS)) / 2) * 100) / 100;
  const season = seasonOf(date.getMonth() + 1, date.getDate());
  if (!MOON_PHASES.includes(moonPhase) || !SEASONS.includes(season)) return null;
  return { moonPhase, illumination, season };
}

/** No modulation: what a persona runs on when the startup reading failed. */
export const UNMODULATED = Object.freeze({ tempo: 1, intensity: 1, halfLife: 1 });

/**
 * How today's reading modulates a persona's base colouring: { tempo, intensity, halfLife } multipliers.
 * A null reading skips modulation entirely (UNMODULATED) — never a neutral substitute reading.
 */
export function modulation(persona, reading) {
  const t = TEMPERAMENT[SIGNS[persona]];
  if (!t || !reading) return UNMODULATED;
  const illum = Number.isFinite(reading.illumination) ? Math.min(1, Math.max(0, reading.illumination)) : 0.5;
  const tempo = 1 + t.moonPull * (illum - 0.5); // a full moon quickens, a new moon stills
  const seasonal = reading.season === t.season ? 1.1 : reading.season === OPPOSITE[t.season] ? 0.9 : 1;
  // the decay curve shifts slightly with the season: in its own season a persona's attention lasts a little longer
  return { tempo: round2(tempo), intensity: seasonal, halfLife: seasonal };
}

/** The zodiac block the persona's context carries, or null with no reading (Mind 1: absent unless the reading worked). */
export function zodiacBlock(persona, reading) {
  const sign = SIGNS[persona];
  if (!sign || !reading) return null;
  return { sign, moonPhase: reading.moonPhase, season: reading.season };
}

function round2(v) { return Math.round(v * 100) / 100; }
