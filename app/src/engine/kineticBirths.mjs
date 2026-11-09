// kineticBirths.mjs — #2037: KINETIC births. The deal can breed.
//
// Matt's rulings (issue #2037, spec kinetic-births-spec-2026-11-08):
//   1. Parents are the standing breeding sources and no others: creatures currently ON STAGE (their tile
//      stands in the press's standing enabled set) plus assemblies built from pool assets currently on
//      stage, wearing the room's standing look and voice. A whole stage is never a parent (the triad law).
//   2. Every KINETIC press rolls — when at least BREED_PARENTS (3) parents are available. Under 3, the
//      press does not roll at all.
//   3. The chance is ~1 in 8: KINETIC_BIRTH_RATE, a named constant pinned by the selfcheck, the same
//      discipline as breeding's MUTATION_RATE.
//   4. Cultivate GATES the birth on this path: a child that reads stillborn never appears. (Scoped
//      exception — the WetLab's cultivate still never blocks anything; this gate is the deal's own.)
//   5. A viable child is born on stage, unbanked; it is banked only if the take it was born in is kept.
//   6. No control, no toggle: always live when the conditions hold.
//
// The amendment — the pre-made hand: candidate children are pre-bred and pre-cultivated whenever the
// eligible parent population changes; stillborns die in the hand. The trio (LOIS / Davis / TE) only
// scores and orders the hand — ranking never gates and never deals. A hit births the top of the hand;
// an empty or stale hand falls back to breeding on the spot, under the same gate.
//
// Engineering law: the roll, the draw and the birth are pure functions of the recorded conversation —
// the project seed, the per-press counter, the standing population and the room. No Math.random, no
// clocks anywhere in this module: same recorded conversation in, identical births out, across fresh
// resolvers and across snapshot/restore. Divergent-freeze parents decline safely through the standing
// machinery (breedCreature returns null when the door refuses the child) — a decline is a quiet
// no-birth, never a crash and never a forced child.

import { breedCreature, sourceRecord, BREED_PARENTS } from './creatureBreed.js';
import { withCultivation } from './creatureAssembler.js';
import { cultivationNote } from '../components/cultivate.model.mjs';

/** #2037 ruling 3 — the birth chance per eligible KINETIC press: ~1 in 8, pinned by the selfcheck. */
export const KINETIC_BIRTH_RATE = 1 / 8;

/** #2037 amendment — the pre-made hand holds at most this many viable, pre-cultivated candidates. */
export const KINETIC_BIRTH_HAND_SIZE = 3;

/** The hand's breeding walk is bounded: at most this many triad draws per derivation (declines,
 *  duplicates and stillborns consume draws; the walk stops early once the hand is full). */
export const KINETIC_BIRTH_HAND_DRAWS = 24;

/** The on-the-spot fallback is bounded the same way: at most this many triad draws for one press. */
export const KINETIC_BIRTH_SPOT_ATTEMPTS = 8;

// FNV-1a over UTF-16 code units — the creature family's own hash (engine/creatureBreed.js), so every
// birth stream in the instrument hashes the same way.
function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The birth streams key on trailing counters (press n, draw m), which raw FNV-1a barely separates —
// measured: u01('…|0') … u01('…|15') cluster within 0.61–0.63 and a triad draw repeats one index
// forever. A splitmix finalizer over the hash is the standard cure and keeps every stream a pure
// function of its key.
const u01 = (key) => {
  let h = hash32(key);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** The press's birth die: a pure function of the take's recorded seed and the press's place in it. */
export function birthRoll(seed, press) {
  return u01(`kinetic-birth|roll|${seed >>> 0}|${press | 0}`);
}

/**
 * The population's fingerprint: the seed, the parent sources in their canonical order, and the room
 * the assemblies wear. The pre-made hand carries the fingerprint it was bred under; a press whose
 * standing fingerprint differs finds the hand stale and breeds on the spot instead.
 */
export function birthFingerprint(pop) {
  if (!pop) return '';
  const keys = (pop.sources || []).map((s) => s.key).join(',');
  return `kb-${hash32(`${pop.seed >>> 0}|${keys}|${pop.lookId || ''}|${pop.voiceId || ''}`).toString(16)}`;
}

/** Draw one triad of distinct sources from the population, seeded by `stream`. Null under 3 sources. */
function drawTriad(sources, stream) {
  const n = sources.length;
  if (n < BREED_PARENTS) return null;
  const picked = [];
  for (let i = 0; picked.length < BREED_PARENTS && i < 16; i++) {
    const idx = Math.floor(u01(`${stream}|${i}`) * n) % n;
    if (!picked.includes(idx)) picked.push(idx);
  }
  if (picked.length < BREED_PARENTS) return null;
  return picked.map((i) => sources[i].src);
}

/**
 * Breed one candidate from a drawn triad and run the gate over it: the child is bred by the standing
 * breeder, stamped with its cultivation note (the #1872 door), and kept only when the note reads
 * viable. Returns { record } for a viable child, or { outcome } — 'declined' (the breeder/door said
 * no: bad triad, duplicate, divergent freeze), 'stillborn' (bred, but the gate refused it), or
 * 'present' (a child the stage or the bank already holds).
 */
function breedCandidate(pop, triad) {
  const records = triad.map((src) => sourceRecord(src, pop.seed));
  if (records.some((r) => !r)) return { outcome: 'declined' };
  const child = breedCreature(records, pop.seed);
  if (!child) return { outcome: 'declined' };
  if ((pop.presentIds || []).includes(child.id)) return { outcome: 'present' };
  const bodyAsset = pop.assetsById ? pop.assetsById.get(child.body) || null : null;
  const note = cultivationNote(child, bodyAsset, pop.seed);
  const stamped = note && withCultivation(child, note);
  if (!stamped) return { outcome: 'declined' };
  if (note.outcome !== 'viable') return { outcome: 'stillborn' };
  return { record: stamped };
}

/**
 * The trio's read of one viable child — three scores in [0,1] and their mean, plus the room's bias.
 * LOIS judges the child's cost against the cultivation line and its warnings; Davis reads novelty
 * (how much of the genome was crossed or mutated rather than inherited whole); TE reads discrete
 * completeness (the birth block whole, a head, limbs). The room bias is the spec's own allowance:
 * a child wearing the room's standing voice (then look) stands earlier in the hand. Scores order
 * the hand and do nothing else — they never gate and never deal.
 */
export function scoreBirthChild(record, room = {}) {
  const genome = record && Array.isArray(record.genome) ? record.genome : [];
  const note = (record && record.cultivated) || null;
  const cost = note && note.cost ? note.cost : null;
  const lois = Math.max(
    0,
    Math.min(
      1,
      (cost ? 1 - cost.score / Math.max(1, cost.threshold) : 0.5) - 0.1 * ((note && note.warnings) || []).length,
    ),
  );
  const novel = genome.filter(
    (g) => typeof g.source === 'string' && (g.source.startsWith('mut:') || g.source.startsWith('cross:')),
  ).length;
  const davis = genome.length ? novel / genome.length : 0;
  let facts = 0;
  if (genome.some((g) => g.family === 'FORM' && g.id === 'body')) facts++;
  if (record && record.head) facts++;
  if (record && Array.isArray(record.limbs) && record.limbs.length) facts++;
  if (genome.some((g) => g.family === 'MATERIAL' && g.id === 'material' && g.value)) facts++;
  const te = facts / 4;
  let total = (lois + davis + te) / 3;
  const childVoice = (genome.find((g) => g.family === 'VOICE' && g.id === 'voice') || {}).value;
  const childLook = (genome.find((g) => g.family === 'LOOK' && g.id === 'look') || {}).value;
  if (room.voiceId && childVoice === room.voiceId) total += 0.15;
  if (room.lookId && childLook === room.lookId) total += 0.1;
  return { lois, davis, te, total };
}

/**
 * Order a hand of viable candidates by the trio's scores — order only. The candidate SET is whatever
 * the breeding walk produced; scoring permutes it and can never add, remove or veto a member. Ties
 * break on the record id, so the order is a pure function of the candidates and the room. `scoreOf`
 * is injectable so the selfcheck can prove the permutation law with synthetic scores.
 */
export function orderBirthHand(candidates, room = {}, scoreOf = scoreBirthChild) {
  return (candidates || [])
    .map((record) => ({ record, scores: scoreOf(record, room) }))
    .sort(
      (a, b) => b.scores.total - a.scores.total || (a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0),
    );
}

/**
 * Derive the pre-made hand for a population: breed and cultivate candidates until the hand holds
 * KINETIC_BIRTH_HAND_SIZE viable children or the bounded walk runs out. Stillborns die here, in the
 * hand — they are counted for the record and never carried forward. Pure: same population in, same
 * hand out.
 */
export function deriveBirthHand(pop) {
  const fingerprint = birthFingerprint(pop);
  if (!pop || !pop.sources || pop.sources.length < BREED_PARENTS) {
    return { fingerprint, candidates: [], draws: 0, stillborns: 0 };
  }
  const room = { lookId: pop.lookId || null, voiceId: pop.voiceId || null };
  const viable = [];
  const held = new Set();
  let stillborns = 0;
  let draws = 0;
  for (; draws < KINETIC_BIRTH_HAND_DRAWS && viable.length < KINETIC_BIRTH_HAND_SIZE; draws++) {
    const triad = drawTriad(pop.sources, `kinetic-birth|hand|${fingerprint}|${draws}`);
    if (!triad) break;
    const got = breedCandidate(pop, triad);
    if (got.record) {
      if (held.has(got.record.id)) continue;
      held.add(got.record.id);
      viable.push(got.record);
    } else if (got.outcome === 'stillborn') stillborns++;
  }
  return { fingerprint, candidates: orderBirthHand(viable, room), draws, stillborns };
}

/**
 * The fallback: breed on the spot for one press, under the same gate. Bounded attempts; the first
 * viable child wins. When nothing viable comes up, the outcome says why — 'stillborn' when the gate
 * refused what was bred, 'declined' when the breeder/door refused every triad.
 */
export function breedOnTheSpot(pop, press) {
  let sawStillborn = false;
  for (let attempt = 0; attempt < KINETIC_BIRTH_SPOT_ATTEMPTS; attempt++) {
    const triad = drawTriad(pop.sources, `kinetic-birth|spot|${pop.seed >>> 0}|${press | 0}|${attempt}`);
    if (!triad) return { outcome: 'declined' };
    const got = breedCandidate(pop, triad);
    if (got.record) return { outcome: 'born', record: got.record };
    if (got.outcome === 'stillborn') sawStillborn = true;
  }
  return { outcome: sawStillborn ? 'stillborn' : 'declined' };
}

/**
 * Resolve one KINETIC press against the standing population and the standing hand.
 *   { rolled: false, reason: 'parents' }  — under 3 parents: the press does not roll at all.
 *   { rolled: false, reason: 'dice', roll } — the die was cast and missed; nothing changes.
 *   { rolled: true, outcome: 'born', via: 'hand'|'spot', record, roll } — a viable child.
 *   { rolled: true, outcome: 'stillborn'|'declined', via: 'spot', roll } — the dice called and the
 *     gate (or the merge law) refused: no child appears, and the refusal is on the record.
 */
export function resolveBirthPress({ pop, press, hand } = {}) {
  if (!pop || !pop.sources || pop.sources.length < BREED_PARENTS) return { rolled: false, reason: 'parents' };
  const roll = birthRoll(pop.seed, press);
  if (roll >= KINETIC_BIRTH_RATE) return { rolled: false, reason: 'dice', roll };
  const fingerprint = birthFingerprint(pop);
  if (hand && hand.fingerprint === fingerprint && Array.isArray(hand.candidates)) {
    const top = hand.candidates.find((c) => c && c.record && !(pop.presentIds || []).includes(c.record.id));
    if (top) return { rolled: true, outcome: 'born', via: 'hand', record: top.record, roll };
  }
  const spot = breedOnTheSpot(pop, press);
  return { rolled: true, via: 'spot', roll, ...spot };
}

/**
 * The resolver pool with the stage-born children merged in: a stage-born child's tile rides beside
 * the document's overlay for exactly as long as the child stands unbanked in `stageBirths`, and
 * leaves with it (banked → the tile moves into the overlay itself; the performance ends unkept →
 * the entry is gone). Memoized on the two array identities so the live loop's per-frame pool reads
 * stay allocation-free while nothing has changed.
 */
let poolMemo = { overlay: null, births: null, out: null };
export function poolWithBirths(overlay, stageBirths) {
  const births = stageBirths || [];
  if (!births.length) return overlay || [];
  if (poolMemo.overlay === overlay && poolMemo.births === stageBirths) return poolMemo.out;
  const out = [...(overlay || []), ...births.map((b) => b && b.tile).filter(Boolean)];
  poolMemo = { overlay, births: stageBirths, out };
  return out;
}
