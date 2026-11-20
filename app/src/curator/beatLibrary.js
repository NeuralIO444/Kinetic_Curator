// beatLibrary.js — #1475: a small library of synthetic beats, as DATA (kc-beat/1), not recordings.
//
// Each pattern is 16 steps (sixteenths of a 4-beat bar) per lane: 'x' a full hit, 'o' a soft one, '.' a rest.
// Lanes: kick, snare, hat, bass. `bed` is the level of a slow bed under the hits (0..0.2). `swing` delays the odd
// sixteenths (0 straight .. 0.5 hard shuffle). `bpm` is the range the pattern feels right in; `intensity` 0..1 is how
// much it asks of the stage; `vibes` are the moods it fits.
//
// Hidden by design (DS rule 10): nothing here is surfaced, named in the UI, or listed anywhere a performer can see.
// It plays silently into the band feed (curator/setLive.js); a pack may add patterns later through the same format.
//
// #2389 (Persona Kernel P9, spec §4 Q9) — her own beats grow: BEAT_CRATE is a bigger shelf of patterns in the same
// kc-beat/1 format, and composePattern() makes seeded variations of a pattern INSIDE its vibe (same lanes, same tempo
// range, same swing and moods; a few steps re-voiced). Same seed + slot = the same pattern, always. Both are reached
// only while the band is on (setLive's `grow`); with the band off the set picks from BEATS exactly as before.
import { hashU01 } from '../engine/kernel/rng.js';

export const BEAT_VERSION = 'kc-beat/1';
export const STEPS = 16;
export const LANES = Object.freeze(['kick', 'snare', 'hat', 'bass']);
export const VIBES = Object.freeze(['calm', 'drive', 'lift', 'sparse', 'shift', 'weird']);

const P = (id, name, bpm, swing, intensity, vibes, lanes, bed = 0.05) => ({
  id,
  name,
  bpm,
  swing,
  intensity,
  vibes,
  lanes,
  bed,
});

export const BEATS = Object.freeze([
  P('four-floor', 'four on the floor', [118, 128], 0, 0.8, ['drive'], {
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..o...o...o...o.',
    bass: '..x...x...x...x.',
  }),
  P(
    'slow-four',
    'slow four',
    [70, 90],
    0,
    0.5,
    ['calm'],
    { kick: 'x.......x.......', snare: '................', hat: 'o...o...o...o...', bass: '................' },
    0.1,
  ),
  P('broken', 'broken beat', [100, 124], 0.1, 0.7, ['drive', 'shift'], {
    kick: 'x..x..x...x..x..',
    snare: '....x.......x..o',
    hat: 'x.x.x.x.x.x.x.xo',
    bass: 'x.....x...x.....',
  }),
  P(
    'half-time',
    'half time',
    [68, 84],
    0,
    0.55,
    ['calm', 'shift'],
    { kick: 'x.........x.....', snare: '........x.......', hat: 'o.o.o.o.o.o.o.o.', bass: 'x...............' },
    0.08,
  ),
  P('shuffle', 'shuffle', [88, 110], 0.33, 0.6, ['drive', 'lift'], {
    kick: 'x.....x...x.....',
    snare: '....x.......x...',
    hat: 'o.o.o.o.o.o.o.o.',
    bass: 'x.....o...x.....',
  }),
  P(
    'pulse',
    'ambient pulse',
    [60, 80],
    0,
    0.3,
    ['calm', 'sparse'],
    { kick: 'x...............', snare: '................', hat: '................', bass: '................' },
    0.14,
  ),
  P('threes', 'three against four', [96, 120], 0, 0.6, ['weird', 'shift'], {
    kick: 'x..x..x..x..x..x',
    snare: '....x.......x...',
    hat: 'o...o...o...o...',
    bass: '..o.....o.....o.',
  }),
  P('build', 'build', [110, 130], 0, 0.75, ['lift'], {
    kick: 'x...x...x...x...',
    snare: '........x.xxxxxx',
    hat: 'x.x.x.x.xxxxxxxx',
    bass: '................',
  }),
  P(
    'drop',
    'drop',
    [118, 130],
    0,
    0.9,
    ['lift', 'drive'],
    { kick: 'x.......x.......', snare: '....o.......o...', hat: 'o.o.o.o.o.o.o.o.', bass: 'x...x...x...x...' },
    0.02,
  ),
  P(
    'tick',
    'sparse tick',
    [70, 100],
    0,
    0.25,
    ['sparse', 'calm'],
    { kick: '................', snare: '................', hat: 'o...............', bass: '................' },
    0.12,
  ),
  P('two-step', 'two step', [128, 140], 0.05, 0.7, ['drive'], {
    kick: 'x.....x...x...x.',
    snare: '....x.......x...',
    hat: 'o.o.xo.o.o.xo.o.',
    bass: 'x.....o...x.....',
  }),
  P('breaks', 'breaks', [130, 150], 0.08, 0.85, ['drive', 'weird'], {
    kick: 'x.......x.x.....',
    snare: '....x..o.o..x..x',
    hat: 'x.xxx.xxx.xxx.xx',
    bass: 'x.......x.x.....',
  }),
  P('clave', 'clave', [96, 116], 0, 0.5, ['shift', 'weird'], {
    kick: 'x..x..x...x.x...',
    snare: '................',
    hat: 'o.o.o.o.o.o.o.o.',
    bass: 'x..o..x...x.o...',
  }),
  P(
    'dub',
    'dub',
    [70, 82],
    0.12,
    0.5,
    ['calm', 'weird'],
    { kick: 'x.......x..x....', snare: '....x.......x...', hat: '..o.....o.....o.', bass: '..x.......x.....' },
    0.1,
  ),
  P(
    'eighths',
    'driving eighths',
    [120, 138],
    0,
    0.8,
    ['drive', 'lift'],
    { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', bass: 'xxxxxxxxxxxxxxxx' },
    0.03,
  ),
  P('glitch', 'glitch', [90, 130], 0.18, 0.65, ['weird', 'sparse'], {
    kick: 'x.....x..x......',
    snare: '...o....x..o...x',
    hat: '.x.o..x.o.x..x..',
    bass: '....x..o......x.',
  }),
]);

/** #2389: the crate — more patterns as data, the same format and validator. Never mixed into BEATS (byte-identity). */
export const BEAT_CRATE = Object.freeze([
  P('boom-bap', 'boom bap', [84, 96], 0.14, 0.65, ['drive', 'calm'], {
    kick: 'x.....x...x.....',
    snare: '....x.......x...',
    hat: 'o.o.o.o.o.o.o.o.',
    bass: 'x.........x.....',
  }),
  P('motorik', 'motorik', [120, 136], 0, 0.7, ['drive'], {
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: 'xoxoxoxoxoxoxoxo',
    bass: 'x.x.x.x.x.x.x.x.',
  }),
  P(
    'heartbeat',
    'heartbeat',
    [58, 72],
    0,
    0.3,
    ['calm', 'sparse'],
    { kick: 'x.x.............', snare: '................', hat: '................', bass: 'x...............' },
    0.12,
  ),
  P('funk', 'funk', [96, 112], 0.08, 0.75, ['drive', 'lift'], {
    kick: 'x..x..x.x.....x.',
    snare: '....x..o.o..x...',
    hat: 'xoxoxoxoxoxoxoxo',
    bass: 'x..x..x...x.x...',
  }),
  P('second-line', 'second line', [100, 118], 0.25, 0.65, ['lift', 'shift'], {
    kick: 'x.....x.x.....x.',
    snare: '..o.x..o..o.x..o',
    hat: 'o.o.o.o.o.o.o.o.',
    bass: 'x.....x.x.......',
  }),
  P(
    'brush',
    'brushes',
    [72, 92],
    0.3,
    0.35,
    ['calm', 'sparse'],
    { kick: 'x.........x.....', snare: 'o.o.o.o.o.o.o.o.', hat: '....o.......o...', bass: 'x...o...x...o...' },
    0.1,
  ),
  P('steppers', 'steppers', [130, 144], 0, 0.85, ['drive', 'weird'], {
    kick: 'x...x...x...x...',
    snare: '........x.......',
    hat: '..x...x...x...x.',
    bass: 'x..x..x.x..x..x.',
  }),
  P('fives', 'five over four', [100, 124], 0, 0.6, ['weird', 'shift'], {
    kick: 'x....x....x....x',
    snare: '....x.......x...',
    hat: 'o.o.o.o.o.o.o.o.',
    bass: '..o....o....o...',
  }),
  P('riser', 'riser', [118, 132], 0, 0.8, ['lift'], {
    kick: 'x...x...x...xxxx',
    snare: '....x...x.x.xxxx',
    hat: 'o.o.o.o.xoxoxxxx',
    bass: '................',
  }),
  P(
    'ghost',
    'ghost notes',
    [86, 104],
    0.1,
    0.45,
    ['sparse', 'shift'],
    { kick: 'x.......x.......', snare: '..o.x.o...o.x.o.', hat: 'o...o...o...o...', bass: '................' },
    0.08,
  ),
  P('jungle', 'jungle', [150, 170], 0.05, 0.9, ['drive', 'weird'], {
    kick: 'x.........x.....',
    snare: '....x..o.o..x..o',
    hat: 'xoxxxoxxxoxxxoxx',
    bass: 'x.......x.......',
  }),
  P(
    'dembow',
    'dembow',
    [92, 104],
    0,
    0.7,
    ['drive', 'lift'],
    { kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'o.o.o.o.o.o.o.o.', bass: 'x.....x...x.....' },
    0.04,
  ),
  P(
    'drone',
    'drone',
    [60, 76],
    0,
    0.2,
    ['calm', 'sparse'],
    { kick: '................', snare: '................', hat: '........o.......', bass: 'x...............' },
    0.18,
  ),
  P('stutter', 'stutter', [110, 128], 0.12, 0.7, ['weird', 'shift'], {
    kick: 'xx....x.xx......',
    snare: '....x.....x.x...',
    hat: 'x.x..x.xx.x..x.x',
    bass: 'x.....x.........',
  }),
  P('march', 'march', [104, 120], 0, 0.6, ['lift', 'drive'], {
    kick: 'x.......x.......',
    snare: 'x.o.x.o.x.o.x.oo',
    hat: '................',
    bass: 'x...x...x...x...',
  }),
  P(
    'lope',
    'lope',
    [76, 92],
    0.33,
    0.5,
    ['calm', 'lift'],
    { kick: 'x.....x.........', snare: '....x.......x...', hat: 'x.ox.ox.ox.ox.o.', bass: 'x.....x...o.....' },
    0.07,
  ),
]);

/** How many steps one composition re-voices (structure of the composer, not a persona tuning number). */
export const COMPOSE_STEPS = 3;
const COMPOSE_CHANNEL = 'beat-compose';
// what a step may become, by lane: the kick's downbeat (step 0) is never touched, the kick never gains a hit (the
// pulse stays the pattern's), hats and snare may gain a ghost; a hit may soften or a soft hit fill
const VOICINGS = Object.freeze({
  kick: { x: 'o', o: 'x', '.': null },
  snare: { x: 'o', o: 'x', '.': 'o' },
  hat: { x: 'o', o: 'x', '.': 'o' },
  bass: { x: 'o', o: 'x', '.': null },
});

/**
 * #2389 — a seeded variation of `base` inside its vibe: the same id stem, tempo range, swing, intensity, bed and
 * moods, with COMPOSE_STEPS steps re-voiced. Pure: (base, seed, slot) → the same pattern every time. The result is a
 * valid kc-beat/1 pattern (sanitizePattern-clean), or `base` itself when the base is not a valid pattern.
 */
export function composePattern(base, seed, slot = 0) {
  const clean = sanitizePattern(base);
  if (!clean) return base;
  const lanes = { ...clean.lanes };
  const s = seed >>> 0;
  const at = (i) => hashU01(s, COMPOSE_CHANNEL, ((slot | 0) >>> 0) * 64 + i);
  for (let m = 0; m < COMPOSE_STEPS; m++) {
    // each mutation tries the lanes in a seeded order and takes the first step it may re-voice
    const startLane = Math.floor(at(m * 4) * LANES.length);
    for (let li = 0; li < LANES.length; li++) {
      const lane = LANES[(startLane + li) % LANES.length];
      const k = 1 + Math.floor(at(m * 4 + 1 + li) * (STEPS - 1)); // never step 0
      const to = VOICINGS[lane][lanes[lane][k]];
      if (!to) continue;
      lanes[lane] = lanes[lane].slice(0, k) + to + lanes[lane].slice(k + 1);
      break;
    }
  }
  const id = `${clean.id.slice(0, 32)}-v${(slot | 0) & 0xff}`;
  return { ...clean, id, name: `${clean.name}`.slice(0, 40), lanes };
}

const STEP_RE = /^[xo.]{16}$/;
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/**
 * Fail-closed validator for one pattern (a pack's, or a built-in in a test). Returns a clean copy or null.
 */
export function sanitizePattern(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;
  const lanes = {};
  for (const l of LANES) {
    const v = raw.lanes && raw.lanes[l];
    if (typeof v !== 'string' || !STEP_RE.test(v)) return null;
    lanes[l] = v;
  }
  const b = Array.isArray(raw.bpm) && raw.bpm.length === 2 ? [Number(raw.bpm[0]), Number(raw.bpm[1])] : null;
  if (!b || !b.every(Number.isFinite) || b[0] < 40 || b[1] > 220 || b[0] > b[1]) return null;
  const vibes = Array.isArray(raw.vibes) ? raw.vibes.filter((v) => VIBES.includes(v)) : [];
  if (vibes.length === 0) return null;
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : id,
    bpm: b,
    swing: num(Number(raw.swing), 0, 0.5, 0),
    intensity: num(Number(raw.intensity), 0, 1, 0.5),
    vibes,
    lanes,
    bed: num(Number(raw.bed), 0, 0.2, 0.05),
  };
}

export function findBeat(id) {
  return BEATS.find((b) => b.id === id) || BEAT_CRATE.find((b) => b.id === id) || null;
}
