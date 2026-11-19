// personas/band.mjs — the band (spec: docs/design/persona-kernel-spec.md §3b, §3c; #2387, Persona Kernel P7).
//
// The cast plays as a jazz band on the phrase clock that already exists. This module is the band's brain and
// nothing else: pure, no store, no bus, no clock, no Math.random. Every draw comes off the kernel's rng, on its
// own `band` channel, index-stable by (phrase, slot) — so a draw never depends on which branch ran before it and
// the same seed with the same chart gives the same conversation.
//
//   The chart     the phrase clock (clock:bar, PHRASE_BARS). The caller hands each phrase boundary in; there is no
//                 second clock here. The 32-bar Trio ownership and the double-tap hand-back are the ARTIST's hold
//                 (ctx.hold): while the artist holds, the band yields.
//   A solo        one persona owns the next move for a run of phrases, one small capped step (the cap is recorded).
//   A trade       the standing solo is a call; the room answers it: agree (build on it), disagree (counter-move,
//                 or LOIS's cut), lay out (rest). Odds come from the tuning table, shifted by the relation bias.
//   The seats     QUEEN: rhythm section, never solos, never answers (her only seat is timing, P9). GOVERNOR:
//                 bandleader — counts in, calls the ending, cuts a solo the room can't afford. DAVIS: lead soloist.
//                 LOIS: arranger — never takes a solo; answers, and her disagreement is the cut. The horns (CARSON,
//                 GREIMAN, ASHWORTH — BLAST, HYBRID, SWISS GRIT on a surface) trade solos and answer.
//
// Three laws held here:
//   1. The artist wins. A keep, or a lock on everything, silences the band that phrase and ends any solo; a lock
//      on a persona keeps that persona out of every solo and every answer.
//   2. Tuning changes how much, never what is allowed. Who may solo, who may answer and what each verdict means
//      are structure in this file and in the records; the table only sets lengths, caps, odds, biases and rates.
//   3. Null is unruled. The band's numbers are not ruled yet (Matt, 2026-11-19), and they ship null. A band that
//      is asked to play on a table with any number it reads still null does NOTHING — it returns the state it was
//      given and no turn, and says which paths are missing. There is no fallback number in this file; the only
//      place a made-up table exists is the selfcheck fixture.
//
// Callsign law: nothing here is a surface string. Ids are code ids; QUEEN and GOVERNOR are never named on a surface.

import { hashU01 } from '../engine/kernel/rng.js';
import { personaTuning, validateTuning } from './tuning.mjs';

export const BAND_SCHEMA = 'kc-band/1';
/** The rng channel every band draw rides (registered in engine/kernel/rng.js STRING_CHANNEL_GROUPS). */
export const BAND_CHANNEL = 'band';
/** Draw slots per phrase: 0 the trade, 1 the soloist, 2.. one per answerer (by cast index). Fixed, never branch-shifted. */
export const BAND_SLOTS = 16;

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

/** The seats, in cast order. `solos` / `answers` are structure (what is allowed), not tuning. */
export const BAND_SEATS = deepFreeze({
  queen: { role: 'rhythm', solos: false, answers: false, sways: 'timing' },
  governor: { role: 'bandleader', solos: false, answers: false, counts: true, cuts: true },
  davis: { role: 'lead', solos: true, answers: true },
  lois: { role: 'arranger', solos: false, answers: true, cuts: true },
  carson: { role: 'horn', solos: true, answers: true },
  greiman: { role: 'horn', solos: true, answers: true },
  ashworth: { role: 'horn', solos: true, answers: true },
});

const idsWhere = (pred) => Object.freeze(Object.keys(BAND_SEATS).filter((id) => pred(BAND_SEATS[id])));
/** Who may take a solo, in cast order. */
export const BAND_SOLOISTS = idsWhere((s) => s.solos);
/** Who may answer a call, in cast order. */
export const BAND_ANSWERERS = idsWhere((s) => s.answers);
/** The horn section, in cast order. */
export const BAND_HORNS = idsWhere((s) => s.role === 'horn');

export const BAND_VERDICTS = Object.freeze(['agree', 'disagree', 'layOut']);
/** What each verdict does. A disagreement is a counter-move, or — LOIS only — the cut. */
export const BAND_MOVES = Object.freeze({ agree: ['build'], disagree: ['counter', 'cut'], layOut: ['rest'] });
export const BAND_TURN_KINDS = Object.freeze(['in', 'out', 'solo', 'trade', 'cut', 'yield']);

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const get = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const clamp01 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

// ── readiness: which numbers the band reads, and whether they are ruled ───────────────────────────────────

/** Every tuning path the band reads. Pure and fixed: the shape of what "ruled" means. */
export function bandRequirements() {
  const paths = ['band.tradeRate', 'band.maxHornsPerCall', 'band.bandleaderCut'];
  for (const id of BAND_SOLOISTS)
    for (const f of ['soloLengthPhrases', 'stepCap', 'heat']) paths.push(`personas.${id}.${f}`);
  for (const id of BAND_ANSWERERS) {
    for (const k of ['agree', 'disagree', 'layOut']) paths.push(`personas.${id}.odds.${k}`);
    paths.push(`personas.${id}.answersFirst`);
    for (const caller of BAND_SOLOISTS) if (caller !== id) paths.push(`relations.${id}->${caller}`);
  }
  return paths;
}

/**
 * Is the table in force ruled enough for the band to play? `{ ready, missing }`: `missing` lists every required
 * path that is null (unruled) or absent, plus a `table` entry when the table itself fails its schema.
 */
export function bandReadiness(tuning = personaTuning()) {
  const missing = [];
  if (!isPlain(tuning) || validateTuning(tuning).length) missing.push('table');
  else for (const p of bandRequirements()) if (get(tuning, p) === null || get(tuning, p) === undefined) missing.push(p);
  return { ready: missing.length === 0, missing };
}

// ── state: the fold ───────────────────────────────────────────────────────────────────────────────────────

/** A fresh band: nobody counted in, no solo standing. */
export function createBandState() {
  return deepFreeze({ schema: BAND_SCHEMA, phrase: -1, started: false, solo: null });
}

/** The solo standing in `state` at `phrase`, or null once its run has elapsed. */
export function standingSolo(state, phrase) {
  const s = state && state.solo;
  return s && phrase - s.start < s.len ? s : null;
}

/**
 * Fold ONE recorded turn into the state. This is the only place a turn changes the band, and the live band and the
 * replay both go through it — so a take rebuilds exactly the state the band had.
 */
export function applyTurn(state, turn) {
  const phrase = Math.max(state.phrase, turn.phrase);
  const solo = (by, len, cap) => ({ by, len, cap, start: turn.phrase });
  let next = state.solo;
  let started = state.started;
  switch (turn.kind) {
    case 'in':
      started = true;
      break;
    case 'out':
      started = false;
      next = null;
      break;
    case 'solo':
      next = solo(turn.by, turn.len, turn.cap);
      break;
    case 'trade':
      if (turn.owner === null) next = null;
      else if (turn.owner !== turn.by) next = solo(turn.owner, turn.len, turn.cap);
      break;
    case 'cut':
    case 'yield':
      next = null;
      break;
    default:
      break;
  }
  return deepFreeze({ schema: BAND_SCHEMA, phrase, started, solo: next });
}

/** The state a list of turns leaves behind (fold from a fresh band). */
export function foldTurns(turns) {
  return turns.reduce(applyTurn, createBandState());
}

/** Who owns the move at `phrase` given the turns so far (those at or before it): a seat id, or null. */
export function ownerAt(turns, phrase) {
  const s = standingSolo(foldTurns(turns.filter((t) => t.phrase <= phrase)), phrase);
  return s ? s.by : null;
}

// ── one phrase ────────────────────────────────────────────────────────────────────────────────────────────

const draw = (seed, phrase, slot) => hashU01(seed >>> 0, BAND_CHANNEL, phrase * BAND_SLOTS + slot);

/** Odds shifted by the relation bias b in [-1, 1]: agree × (1+b), disagree × (1−b), lay-out untouched; renormalised. */
export function shiftedOdds(odds, bias) {
  const b = Math.max(-1, Math.min(1, bias));
  const w = [odds.agree * (1 + b), odds.disagree * (1 - b), odds.layOut];
  const sum = w[0] + w[1] + w[2];
  return sum > 0 ? w.map((x) => x / sum) : [0, 0, 1];
}

/** One answerer's verdict from one uniform draw u in (0,1): [verdict, move]. */
export function verdictOf(id, odds, bias, u) {
  const [a, d] = shiftedOdds(odds, bias);
  if (u < a) return ['agree', 'build'];
  if (u < a + d) return ['disagree', BAND_SEATS[id].cuts ? 'cut' : 'counter'];
  return ['layOut', 'rest'];
}

function normalizeHold(hold) {
  const h = isPlain(hold) ? hold : {};
  const lockAll = h.lock === true;
  const locked = new Set(Array.isArray(h.lock) ? h.lock.filter((id) => typeof id === 'string') : []);
  return { all: h.keep === true || lockAll, why: h.keep === true ? 'keep' : 'lock', locked };
}

function pickSoloist(seed, phrase, locked, tuning) {
  const pool = BAND_SOLOISTS.filter((id) => !locked.has(id));
  const weights = pool.map((id) => Math.max(0, tuning.personas[id].heat));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let u = draw(seed, phrase, 1) * total;
  for (let i = 0; i < pool.length; i++) {
    u -= weights[i];
    if (u < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function soloTurn(phrase, by, tuning) {
  const p = tuning.personas[by];
  return { kind: 'solo', phrase, by, len: Math.max(1, p.soloLengthPhrases), cap: p.stepCap };
}

function tradeTurn(seed, phrase, solo, locked, tuning) {
  const caller = solo.by;
  const eligible = BAND_ANSWERERS.filter((id) => id !== caller && !locked.has(id));
  // who answers first: the seats whose own `answersFirst` is the caller, then the rest, each in cast order
  const ordered = [
    ...eligible.filter((id) => tuning.personas[id].answersFirst === caller),
    ...eligible.filter((id) => tuning.personas[id].answersFirst !== caller),
  ];
  let horns = 0;
  const answers = [];
  for (const id of ordered) {
    if (BAND_SEATS[id].role === 'horn') {
      if (horns >= tuning.band.maxHornsPerCall) continue;
      horns += 1;
    }
    const u = draw(seed, phrase, 2 + BAND_ANSWERERS.indexOf(id));
    const [verdict, move] = verdictOf(id, tuning.personas[id].odds, tuning.relations[`${id}->${caller}`], u);
    answers.push({ by: id, verdict, move });
  }
  if (!answers.length) return null;
  return { kind: 'trade', phrase, by: caller, answers, ...ownerAfter(phrase, caller, answers, tuning) };
}

/** The owner after a trade: a cut ends the solo; else the first counter-mover takes it; else the soloist keeps it. */
function ownerAfter(phrase, caller, answers, tuning) {
  if (answers.some((a) => a.move === 'cut')) return { owner: null };
  const counter = answers.find((a) => a.move === 'counter' && BAND_SEATS[a.by].solos);
  if (!counter) return { owner: caller };
  const p = tuning.personas[counter.by];
  return { owner: counter.by, len: Math.max(1, p.soloLengthPhrases), cap: p.stepCap };
}

/**
 * Play one phrase boundary. Pure.
 *
 *   ctx { phrase, pressure?, hold?, ending? }
 *     phrase    the phrase index (bar / PHRASE_BARS); a phrase already played is never played twice
 *     pressure  0..1, how hard the room is pressed (the bandleader cuts a solo once it reaches band.bandleaderCut)
 *     hold      { keep?: boolean, lock?: boolean | string[] } — the artist's hand; it always wins
 *     ending    true when the bandleader should call the ending
 *   opts { seed, tuning? }   seed: the take's seed (uint32); tuning: the table (default: the table in force)
 *
 * Returns { state, turns, unruled } — `turns` is [] when nothing was played; `unruled` is the list of null/absent
 * paths when the table is not ruled enough (the band then returns `state` untouched, the SAME object).
 */
export function stepBand(state, ctx, opts = {}) {
  const tuning = opts.tuning ?? personaTuning();
  const ready = bandReadiness(tuning);
  if (!ready.ready) return { state, turns: [], unruled: ready.missing };
  if (!ctx || !Number.isInteger(ctx.phrase) || ctx.phrase < 0 || ctx.phrase <= state.phrase)
    return { state, turns: [], unruled: null };
  const seed = Number.isInteger(opts.seed) ? opts.seed >>> 0 : 0;
  const phrase = ctx.phrase;
  const pressure = clamp01(ctx.pressure);
  const hold = normalizeHold(ctx.hold);
  const turns = [];
  let cur = state;
  const push = (turn) => {
    turns.push(deepFreeze(turn));
    cur = applyTurn(cur, turn);
  };
  const done = () => {
    // a phrase that played nothing is still played: the guard against re-deciding it
    if (cur.phrase < phrase) cur = deepFreeze({ ...cur, phrase });
    return { state: cur, turns, unruled: null };
  };

  // 1. the artist wins: a keep, or a lock on everything, silences the band and ends any solo
  let solo = standingSolo(cur, phrase);
  if (hold.all) {
    if (solo) push({ kind: 'yield', phrase, by: 'artist', why: hold.why, ended: solo.by });
    return done();
  }
  // a lock on the persona holding the solo ends it; the band plays on without them
  if (solo && hold.locked.has(solo.by)) {
    push({ kind: 'yield', phrase, by: 'artist', why: 'lock', ended: solo.by });
    solo = null;
  }
  // 2. the bandleader calls the ending
  if (ctx.ending === true) {
    if (cur.started) push({ kind: 'out', phrase, by: 'governor' });
    return done();
  }
  // 3. counts in: the head plays first, no solo yet
  if (!cur.started) {
    push({ kind: 'in', phrase, by: 'governor' });
    return done();
  }
  const room = pressure >= tuning.band.bandleaderCut;
  if (solo) {
    // 4. the bandleader cuts a solo the room can't afford
    if (room) {
      push({ kind: 'cut', phrase, by: 'governor', target: solo.by });
      return done();
    }
    // 5. a trade: the solo that played last phrase is the call, and the room answers it
    if (solo.start < phrase && draw(seed, phrase, 0) < tuning.band.tradeRate) {
      const trade = tradeTurn(seed, phrase, solo, hold.locked, tuning);
      if (trade) {
        push(trade);
        return done();
      }
    }
    if (phrase - solo.start < solo.len) return done(); // the solo plays on
  }
  // 6. nobody is soloing: someone takes the next one (not while the room can't afford it)
  if (!room) {
    const by = pickSoloist(seed, phrase, hold.locked, tuning);
    if (by) push(soloTurn(phrase, by, tuning));
  }
  return done();
}
