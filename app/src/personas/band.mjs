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
import { decisionFeatures } from '../curator/decisionFeatures.mjs';
import { scoreTreeHeadWith } from '../curator/tasteHead.js';

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
/** The slot a head-steered bandleader cut draws on (A1, #2394). Slots 0 (trade gate), 1 (soloist) and
 * 2..6 (one per answerer) were already taken; every draw is index-stable by (phrase, slot), so this
 * draw — which exists only when a cut head has earned in — can never shift another decision's draw. */
const CUT_DRAW_SLOT = 7;

// ── persona heads (Adapters A1, #2394): the head sets the odds ────────────────────────────────────────
//
// A head that has earned in (the gate lives in curator/tasteHead.js: steeringHeads admits only heads
// with ≥200 labeled turns and held-out ≥ 0.3) supplies the probability its decision is a keep, and
// that probability REPLACES the tuning odds in the decision's draw (ruling Q2) — the decision stays a
// draw off the same slot, the band keeps its stochastic feel, and a decision with no earned-in head
// runs on the tuning table exactly as before. With no heads at all (every take before A1, and every
// taste without a personas section) each path below is the pre-A1 code path untouched.

const headEntry = (heads, id, kind) => (heads && heads[id] && heads[id][kind]) || null;

/** One head's keep-probability for one decision, walked over the decision-feature universe. */
const headScore = (entry, input) => scoreTreeHeadWith(entry.head, decisionFeatures(input));

/** The decision fields the BAND owns: the call being answered (caller, verdict, move), the cut's
 * target, the deciding persona's heat, the standing solo's age. A caller-supplied decisionCtx may
 * carry phrase context, census and recipe inputs — never these (stepBand's documented law). */
const BAND_OWNED_FIELDS = Object.freeze(['caller', 'verdict', 'move', 'target', 'heat', 'soloAge']);

/** One decision's feature input: baseInput with the band's own facts for THIS decision laid over
 * it, and every other band-owned field stripped. A fact that is not a fact of this decision (a
 * solo pick has no caller; a cut has no verdict) never reaches the vector — a hostile or merely
 * careless decisionCtx cannot smuggle it in. (Pressure needs no handling here: baseInput already
 * pins it over decisionCtx.) */
function decisionInput(baseInput, owned) {
  const input = { ...baseInput };
  for (const k of BAND_OWNED_FIELDS) delete input[k];
  return Object.assign(input, owned);
}

/** The move a verdict makes for a seat (verdictOf's own mapping, restated for the feature vector). */
const moveOf = (id, verdict) =>
  verdict === 'agree' ? 'build' : verdict === 'layOut' ? 'rest' : BAND_SEATS[id].cuts ? 'cut' : 'counter';

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

function pickSoloist(seed, phrase, locked, tuning, heads, baseInput, noteSteered) {
  const pool = BAND_SOLOISTS.filter((id) => !locked.has(id));
  // A candidate with an earned-in solo head weighs in with its head's keep-probability for taking
  // this solo; a candidate without one weighs its tuned heat, exactly as before A1. Every head in
  // the pool is CONSULTED — but the stamp credits only the WINNER (ruling F1 on #2394): a head
  // whose solo never played did not steer the take, so the note waits until the pick is made.
  const entries = pool.map((id) => headEntry(heads, id, 'solo'));
  const weights = pool.map((id, i) =>
    entries[i]
      ? headScore(entries[i], decisionInput(baseInput, { heat: tuning.personas[id].heat }))
      : Math.max(0, tuning.personas[id].heat),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let u = draw(seed, phrase, 1) * total;
  let winner = pool.length - 1;
  for (let i = 0; i < pool.length; i++) {
    u -= weights[i];
    if (u < 0) {
      winner = i;
      break;
    }
  }
  if (entries[winner]) noteSteered(pool[winner], 'solo', entries[winner]);
  return pool[winner];
}

function soloTurn(phrase, by, tuning) {
  const p = tuning.personas[by];
  return { kind: 'solo', phrase, by, len: Math.max(1, p.soloLengthPhrases), cap: p.stepCap };
}

function tradeTurn(seed, phrase, solo, locked, tuning, heads, baseInput, noteSteered) {
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
    // An answerer with an earned-in trade head answers on its head's odds: the head scores each
    // candidate verdict, the three keep-probabilities normalize into the odds, and the relation
    // bias still shifts them (the bias is A5's to learn; the head replaces the table's odds only).
    const entry = headEntry(heads, id, 'trade');
    let odds = tuning.personas[id].odds;
    if (entry) {
      noteSteered(id, 'trade', entry);
      const p = {};
      for (const verdict of BAND_VERDICTS) {
        p[verdict] = headScore(
          entry,
          decisionInput(baseInput, {
            caller,
            verdict,
            move: moveOf(id, verdict),
            heat: tuning.personas[id].heat,
            soloAge: phrase - solo.start,
          }),
        );
      }
      const sum = p.agree + p.disagree + p.layOut;
      odds = sum > 0 ? { agree: p.agree / sum, disagree: p.disagree / sum, layOut: p.layOut / sum } : { agree: 0, disagree: 0, layOut: 1 };
    }
    const [verdict, move] = verdictOf(id, odds, tuning.relations[`${id}->${caller}`], u);
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
 *   opts { seed, tuning?, heads?, decisionCtx? }
 *     seed: the take's seed (uint32); tuning: the table (default: the table in force)
 *     heads: the steering bundle (curator/tasteHead.js steeringHeads) — earned-in persona heads only,
 *       or null/absent for rules exactly as before A1
 *     decisionCtx: extra decision-feature inputs the caller can supply (bar, bpm, energy, census,
 *       recipe, principles — decisionFeatures.mjs); the band's own facts (pressure, caller, the
 *       candidate verdict, the cut's target, heat, solo age) always override it on the fields the
 *       band owns — and a band-owned field that is not a fact of the decision at hand (a solo
 *       pick has no caller) is stripped, never inherited from decisionCtx
 *
 * Returns { state, turns, unruled, steered } — `turns` is [] when nothing was played; `unruled` is the list of
 * null/absent paths when the table is not ruled enough (the band then returns `state` untouched, the SAME
 * object); `steered` lists the heads credited with steering this phrase ({ id, kind, version }, deduped) —
 * the material for the take's band-section stamp (rulings Q4 + F1: every trade answerer and the cut are
 * credited as they decide, but a solo pick credits ONLY the winner's head, never the consulted losers).
 * Empty when no head steered.
 */
export function stepBand(state, ctx, opts = {}) {
  const tuning = opts.tuning ?? personaTuning();
  const ready = bandReadiness(tuning);
  if (!ready.ready) return { state, turns: [], unruled: ready.missing, steered: [] };
  if (!ctx || !Number.isInteger(ctx.phrase) || ctx.phrase < 0 || ctx.phrase <= state.phrase)
    return { state, turns: [], unruled: null, steered: [] };
  const seed = Number.isInteger(opts.seed) ? opts.seed >>> 0 : 0;
  const phrase = ctx.phrase;
  const pressure = clamp01(ctx.pressure);
  const hold = normalizeHold(ctx.hold);
  const heads = opts.heads || null;
  const baseInput = { ...(opts.decisionCtx || {}), pressure };
  const steeredByKey = new Map();
  const noteSteered = (id, kind, entry) => steeredByKey.set(`${id}|${kind}`, { id, kind, version: entry.version });
  const turns = [];
  let cur = state;
  const push = (turn) => {
    turns.push(deepFreeze(turn));
    cur = applyTurn(cur, turn);
  };
  const done = () => {
    // a phrase that played nothing is still played: the guard against re-deciding it
    if (cur.phrase < phrase) cur = deepFreeze({ ...cur, phrase });
    return { state: cur, turns, unruled: null, steered: [...steeredByKey.values()] };
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
    // 4. the bandleader cuts a solo the room can't afford. With an earned-in cut head, the head's
    // keep-probability for cutting replaces the tuned line: pressure becomes a feature, the draw
    // decides (on its own slot), and a head that says let it play lets the phrase move on to the
    // trade. Without one, the tuned line decides exactly as before.
    const cutHead = headEntry(heads, 'governor', 'cut');
    if (cutHead) {
      noteSteered('governor', 'cut', cutHead);
      const p = headScore(cutHead, decisionInput(baseInput, { target: solo.by, soloAge: phrase - solo.start }));
      if (draw(seed, phrase, CUT_DRAW_SLOT) < p) {
        push({ kind: 'cut', phrase, by: 'governor', target: solo.by });
        return done();
      }
    } else if (room) {
      push({ kind: 'cut', phrase, by: 'governor', target: solo.by });
      return done();
    }
    // 5. a trade: the solo that played last phrase is the call, and the room answers it
    if (solo.start < phrase && draw(seed, phrase, 0) < tuning.band.tradeRate) {
      const trade = tradeTurn(seed, phrase, solo, hold.locked, tuning, heads, baseInput, noteSteered);
      if (trade) {
        push(trade);
        return done();
      }
    }
    if (phrase - solo.start < solo.len) return done(); // the solo plays on
  }
  // 6. nobody is soloing: someone takes the next one (not while the room can't afford it)
  if (!room) {
    const by = pickSoloist(seed, phrase, hold.locked, tuning, heads, baseInput, noteSteered);
    if (by) push(soloTurn(phrase, by, tuning));
  }
  return done();
}
