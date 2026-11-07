// fieldReviewVoice.mjs — #2006 SLICE 2: the review loop gets its VOICE
// (spec §3.6 the voice, §3.7 the backend proposal contract, §4 slice 2).
//
// Slice 1 banked the verdict in silence. Slice 2 speaks it — and still
// ACTS ON NOTHING: no adjustment, no re-deal, no CUT (slices 3/4). The
// spoken lines ride the standing FIELD whisper idiom onto the ONE tape the
// room already has — the footer LoisPill crawl fed by loisRank's verdict
// slot (loisTicker.js). DAVIS speaks CLEAN (the woohoo — the continuous
// side of the KC-1 DS), LOIS speaks JANKY (the gates talking: the first
// failing gate, its measured value against its limit, in her pan register)
// and names the repair she WOULD run, as a proposal — the record says a
// proposal, §4.2, because nothing here may act. EXEMPT landings stay
// silent: the poem was never judged, so there is no verdict to speak.
//
// The Mind backend may be ASKED to phrase a line (mindThinker discipline:
// Apple Intelligence via kc-mind, rules the silent fallback — the asking
// and the fallback live in fieldReviewVoiceLive.mjs). What the model may
// do is bounded HERE, in this module's pure functions:
//
//   - it may phrase the spoken line and order the rules-approved rung
//     set for a later slice (REVIEW_LADDER below);
//   - it may NOT change a verdict, invent a gate, or speak when the
//     rules say silence — validateReviewProposal never reads a verdict,
//     a gate or a measure out of a reply, and a janky line must carry
//     the rules' own figures (the failing measure and its limit,
//     formatted exactly as the rules line formats them) or the whole
//     proposal is dropped and the rules line stands.
//
// Everything in this module is pure: same record in, same line out. The
// spoken line's provenance (persona, bar, backend, seed) rides the
// banked record as its `voice` extension — sanitizeReviewVoice is the
// fail-closed shape the store enforces when the extension is written.
import { MAX_LINE } from './mindContract.js';

/**
 * The rungs the voice may name, in ladder order (spec §3.6): 1 SHRINK,
 * 2 SHIFT, 4 RE-DEAL, 5 CUT. Rung 3 (QUIET, the plate's room seam)
 * joins the spoken ladder only when slice 4 arms it; until then it is
 * out of the approved set and a proposal naming it is dropped whole.
 */
export const REVIEW_LADDER = Object.freeze([1, 2, 4, 5]);

/** Which rung leads the repair for each failing gate (the rules' proposal). */
export const LEAD_RUNG = Object.freeze({
  selfOverlap: 1, // doubled ink → shrink the type
  markCover: 1, // the spec's own example: covered → shrunk it
  coverage: 1, // too much of the dish is ink → shrink
  coverageLow: 4, // barely there → a fresh deal, not a nudge
  crop: 2, // glyphs over the edge → shift it back on the dish
});

/** The ladder order slice 3 will walk for a gate: the lead rung first. */
export const proposedOrder = (gate) => {
  const lead = LEAD_RUNG[gate] ?? 1;
  return [lead, ...REVIEW_LADDER.filter((r) => r !== lead)];
};

/** A share as the tape says it: whole percents once they read clean,
 * two significant decimals below that (0.15% is a real reading). */
export const pct = (v) => {
  if (!Number.isFinite(v)) return '—';
  const p = v * 100;
  if (p >= 9.95) return `${Math.round(p)}%`;
  return `${p.toFixed(2).replace(/\.?0+$/, '')}%`;
};

/** The failing gate's measure and limit, read off the banked record. */
export const gateMeasure = (record) => {
  if (!record || !record.measures || !record.gates) return null;
  const m = record.measures;
  const g = record.gates;
  switch (record.gate) {
    case 'selfOverlap':
      return { value: m.m1, limit: g.selfOverlap };
    case 'markCover':
      return { value: m.m2, limit: g.markCover };
    case 'coverage':
      return { value: m.m3, limit: g.coverageMax };
    case 'coverageLow':
      return { value: m.m3, limit: g.coverageMin };
    case 'crop':
      return { value: m.m4, limit: g.crop };
    default:
      return null;
  }
};

// DAVIS on CLEAN — the woohoo, and nothing else to say: a clean landing
// needs no figures. Picked by the record's seed, so the same landing
// always cheers the same way.
const CLEAN_LINES = Object.freeze(['WOO HOO.', 'Woohoo — landed clean.', 'WOO HOO — the poem stands.']);

// LOIS on JANKY — the measured clause per gate. {v} is pct(measured),
// {l} is pct(limit); the templates are written so both figures land in
// the sentence exactly as pct formats them — a model proposal must
// carry the same two strings (see validateReviewProposal).
const JANKY_CLAUSES = Object.freeze({
  selfOverlap: (v, l) => `The poem prints over itself. ${v} of its ink is doubled — ${l} is the limit.`,
  markCover: (v, l) => `The marks are eating the poem. ${v} of its ink is covered — ${l} is the limit.`,
  coverage: (v, l) => `The poem eats the dish. ${v} of the dish is ink — ${l} is the limit.`,
  coverageLow: (v, l) => `The poem is barely there. ${v} of the dish is ink — ${l} is the floor.`,
  crop: (v) => `The frame cuts the poem. ${v} of its glyphs cross the edge — the limit is none.`,
});

// The repair LOIS names, per lead rung — phrased as a proposal (slice 2
// acts on nothing; slice 3 is where a named rung may actually run).
const PROPOSALS = Object.freeze({
  1: 'Would shrink it.',
  2: 'Would shift it back.',
  4: 'Would deal it again.',
});

/**
 * The rules voice for a banked record: { persona, line, rungOrder } or
 * null when the record is not spoken (no record, exempt, unmeasured).
 * Pure and deterministic — this is the line that stands whenever the
 * backend is unavailable, late, malformed or out-of-set.
 */
export const rulesVoice = (record) => {
  if (!record || record.verdict === 'exempt' || !record.measures) return null;
  if (record.verdict === 'clean') {
    const line = CLEAN_LINES[(record.seed >>> 0) % CLEAN_LINES.length];
    return { persona: 'davis', line, rungOrder: null };
  }
  if (record.verdict !== 'janky') return null;
  const gm = gateMeasure(record);
  const clause = JANKY_CLAUSES[record.gate];
  if (!gm || !clause) return null;
  const order = proposedOrder(record.gate);
  const proposal = PROPOSALS[order[0]] ?? PROPOSALS[1];
  return { persona: 'lois', line: `${clause(pct(gm.value), pct(gm.limit))} ${proposal}`, rungOrder: order };
};

/**
 * The record's `voice` extension as the RULES speak it:
 * { persona, line, bar, backend: 'rules', seed, rungOrder? } — seed is
 * the record's own seed (the rules speak for this landing; a model's
 * extension carries the ASK seed instead). null = not spoken.
 */
export const voiceForRecord = (record, bar) => {
  const rv = rulesVoice(record);
  if (!rv) return null;
  const voice = {
    persona: rv.persona,
    line: rv.line,
    bar: Number.isInteger(bar) && bar >= 0 ? bar : null,
    backend: 'rules',
    seed: record.seed,
  };
  if (rv.rungOrder) voice.rungOrder = [...rv.rungOrder];
  return voice;
};

/** FNV-1a over a string (mindLive's contextHash idiom). */
const fnv = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * The seed an ask for this record rides: derived from the record alone
 * (its banked seed XOR its stream), so the same landing always asks the
 * same way and a replay — which never asks — needs nothing stored.
 */
export const askSeedFor = (record) => (((record?.seed ?? 0) >>> 0) ^ fnv(String(record?.stream ?? ''))) >>> 0;

const r4 = (x) => Math.round(x * 10000) / 10000;

/**
 * The §3.7 ask context: a mindContext-shaped block carrying NAMES and
 * MEASURES ONLY (no frame image in v1) — who dealt, the room, the
 * verdict the rules already reached, every measure with its gate value
 * and pass/fail, the rules' own line as the idiom anchor, and the
 * rules-approved rung set the reply may order. null = not spoken.
 */
export const reviewAskContext = (record, { poet = null, piece = null, room = null } = {}) => {
  if (!record || record.verdict === 'exempt' || !record.measures || !record.gates) return null;
  const m = record.measures;
  const g = record.gates;
  const entry = (value, limit, pass) => ({ value: r4(value), limit: r4(limit), pass });
  const rv = rulesVoice(record);
  return {
    v: 1,
    kind: 'field-review',
    poet,
    piece,
    room: room && typeof room.verdict === 'string' ? room.verdict : null,
    verdict: record.verdict,
    gate: record.gate,
    measures: {
      selfOverlap: entry(m.m1, g.selfOverlap, m.m1 <= g.selfOverlap),
      markCover: entry(m.m2, g.markCover, m.m2 <= g.markCover),
      coverage: entry(m.m3, g.coverageMax, m.m3 <= g.coverageMax),
      coverageLow: entry(m.m3, g.coverageMin, m.m3 >= g.coverageMin),
      crop: entry(m.m4, g.crop, m.m4 <= g.crop),
    },
    rulesLine: rv ? rv.line : null,
    rungSet: record.verdict === 'janky' ? [...REVIEW_LADDER] : [],
    leadRung: record.verdict === 'janky' ? (LEAD_RUNG[record.gate] ?? null) : null,
    seed: askSeedFor(record),
  };
};

/** Does `line` carry `figure` as a whole figure — '5%' inside '15%'
 * or '0.5%' does not count (a lookbehind keeps figures honest). */
const carriesFigure = (line, figure) => {
  const esc = figure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.])${esc}`).test(line);
};

/**
 * Validate a backend proposal against the standing record, on
 * mindContract.validateReply's pattern (shape first, fail-closed,
 * never throws). Returns { line, rungOrder|null } or null = drop the
 * proposal whole; the rules line stands. A reply can carry NO verdict,
 * gate or measure this function would read — and a janky line must
 * carry the rules' figures for the failing gate, verbatim as pct
 * formats them, or it is inventing numbers and is dropped.
 */
export const validateReviewProposal = (raw, record) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!record || (record.verdict !== 'clean' && record.verdict !== 'janky')) return null;
  const line = typeof raw.line === 'string' ? raw.line.trim() : '';
  if (!line || line.length > MAX_LINE) return null;
  let rungOrder = null;
  if (raw.rungOrder !== undefined) {
    // A clean landing approves no ladder — a rung order there is
    // out-of-set, and out-of-set drops the proposal whole (§3.7).
    if (record.verdict !== 'janky') return null;
    if (!Array.isArray(raw.rungOrder) || raw.rungOrder.length === 0) return null;
    const seen = new Set();
    for (const r of raw.rungOrder) {
      if (!Number.isInteger(r) || !REVIEW_LADDER.includes(r) || seen.has(r)) return null;
      seen.add(r);
    }
    rungOrder = [...raw.rungOrder];
  }
  if (record.verdict === 'janky') {
    const gm = gateMeasure(record);
    if (!gm) return null;
    if (!carriesFigure(line, pct(gm.value)) || !carriesFigure(line, pct(gm.limit))) return null;
  }
  return { line, rungOrder };
};

/**
 * The fail-closed shape of a `voice` extension, enforced by the store
 * when the extension is written (layoutSlice.amendFieldReviewVoice):
 * the persona must be the verdict's own, the line bounded by the Mind
 * contract's MAX_LINE, the backend one of the rails that exist, the
 * rung order a subset of the approved ladder on a janky record only.
 * Returns a clean copy with only the known keys, or null.
 */
export const sanitizeReviewVoice = (raw, record) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!record || (record.verdict !== 'clean' && record.verdict !== 'janky')) return null;
  const persona = record.verdict === 'clean' ? 'davis' : 'lois';
  if (raw.persona !== persona) return null;
  const line = typeof raw.line === 'string' ? raw.line.trim() : '';
  if (!line || line.length > MAX_LINE) return null;
  if (raw.backend !== 'rules' && raw.backend !== 'apple' && raw.backend !== 'demo') return null;
  if (!Number.isInteger(raw.seed)) return null;
  if (raw.bar !== null && !(Number.isInteger(raw.bar) && raw.bar >= 0)) return null;
  const voice = { persona, line, bar: raw.bar, backend: raw.backend, seed: raw.seed >>> 0 };
  if (raw.rungOrder !== undefined) {
    if (record.verdict !== 'janky' || !Array.isArray(raw.rungOrder) || raw.rungOrder.length === 0) return null;
    const seen = new Set();
    for (const r of raw.rungOrder) {
      if (!Number.isInteger(r) || !REVIEW_LADDER.includes(r) || seen.has(r)) return null;
      seen.add(r);
    }
    voice.rungOrder = [...raw.rungOrder];
  }
  return voice;
};
