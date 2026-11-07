// fieldReviewVoice.mjs — #2006 SLICE 2: the review loop gets its VOICE
// (spec §3.6 the voice, §3.7 the backend proposal contract, §4 slice 2).
//
// Slice 1 banked the verdict in silence. Slice 2 speaks it — and still
// ACTS ON NOTHING: no adjustment, no re-deal, no CUT (slices 3/4).
// Slice 3 (fieldReviewLadder.mjs) gives the loop its hand: the ladder
// acts INSIDE the deal commit, before this voice ever runs, so an
// acted record is spoken of in the past tense — LOIS reports the
// resolving rung's act (or the cut) with the plan that ran as the
// record's rung order, and the validator fences a model's rephrase to
// reporting: no 'would', no other rung's act, no rung order at all.
// The spoken lines ride the standing FIELD whisper idiom onto the ONE tape the
// room already has — the footer LoisPill crawl fed by loisRank's verdict
// slot (loisTicker.js). DAVIS speaks CLEAN (the woohoo — the continuous
// side of the KC-1 DS), LOIS speaks JANKY (the gates talking: the first
// failing gate, its measured value against its limit, in her pan register)
// and names the repair she WOULD run, as a proposal — the record says a
// proposal, §4.2, because nothing in THIS slice acts (slice 3's ladder
// is what acts, and its records are reported, above). EXEMPT landings
// stay silent: the poem was never judged, so there is no verdict to speak.
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
//     formatted exactly as the rules line formats them, in the rules'
//     own roles — the value spoken before its limit; crop's limit is
//     the absence of crossing, and the figure the rules line withholds
//     stays withheld) and those must be ALL the figures it carries —
//     any further percent figure is a number the record does not own,
//     in any script: figure enumeration reads Unicode decimal digits
//     and the percent-sign variants, and pct speaks ASCII only, so a
//     non-ASCII figure is unowned by construction —
//     or the whole proposal is dropped and the rules line stands. A clean line must carry no figure at all: DAVIS's
//     rules lines have none to quote.
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
// {l} is pct(limit); the templates are written so the figures land in
// the sentence exactly as pct formats them, value before limit — a
// model proposal must carry the same strings in the same roles (crop
// states its value only: its limit is none, and no limit figure may be
// added — see validateReviewProposal).
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

// Slice 3: the act LOIS reports, per resolving rung — past tense,
// because by the time the record banks the ladder has already run
// (it acts inside the deal commit; the voice only ever reports).
const ACTS = Object.freeze({
  1: 'Shrunk it.',
  2: 'Shifted it back.',
  4: 'Dealt it again.',
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
  if (record.verdict !== 'janky' && record.verdict !== 'cut') return null;
  const gm = gateMeasure(record);
  const clause = JANKY_CLAUSES[record.gate];
  if (!gm || !clause) return null;
  const measured = clause(pct(gm.value), pct(gm.limit));
  if (record.verdict === 'cut') {
    // The ladder exhausted and the poem left the stage: the gate's
    // clause (the LANDING's figures — a cut record keeps them) and the
    // act, in the pan register. The rung order is the plan that ran.
    return {
      persona: 'lois',
      line: `${measured} Cut it.`,
      rungOrder: record.adjustment ? [...record.adjustment.plan] : null,
    };
  }
  if (record.adjustment?.outcome === 'repaired') {
    // Slice 3 acted before the voice ever speaks: the line reports the
    // resolving rung's act, and the order spoken is the plan that ran
    // (adjustment.plan), not a fresh proposal.
    const act = ACTS[record.rung] ?? ACTS[1];
    return { persona: 'lois', line: `${measured} ${act}`, rungOrder: [...record.adjustment.plan] };
  }
  const order = proposedOrder(record.gate);
  const proposal = PROPOSALS[order[0]] ?? PROPOSALS[1];
  return { persona: 'lois', line: `${measured} ${proposal}`, rungOrder: order };
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
    // Slice 3: an ACTED record (and every cut) offers no rungs to order —
    // the ladder already ran inside the deal commit; the ask is phrasing
    // only, and validateReviewProposal drops a rung order there whole.
    rungSet: record.verdict === 'janky' && !record.adjustment ? [...REVIEW_LADDER] : [],
    leadRung: record.verdict === 'janky' && !record.adjustment ? (LEAD_RUNG[record.gate] ?? null) : null,
    seed: askSeedFor(record),
  };
};

/** The index at which `line` first carries `figure` as a whole figure
 * — '5%' inside '15%' or '0.5%' does not count (a lookbehind keeps
 * figures honest: a decimal digit of ANY script before the figure
 * means the figure is part of a longer number) — or -1 when the
 * figure is not carried. */
const figureIndex = (line, figure) => {
  const esc = figure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?<![\\p{Nd}.])${esc}`, 'u').exec(line);
  return m ? m.index : -1;
};

/** Every percent figure `line` speaks, as maximal whole tokens:
 * '173%' extracts as the figure '173%' — not as an occurrence of
 * '73%' hiding inside it — and a malformed token ('10.05%', a shape
 * pct never emits) is still extracted: an unowned figure, never
 * "not a figure" slipping past the fence. Figures are figures in
 * ANY script: the digits are Unicode decimal digits (\p{Nd}) and
 * the percent sign may be %, ％ (U+FF05), ٪ (U+066A) or ﹪
 * (U+FE6A). Each token is returned AS SPOKEN, digits and percent
 * sign together — pct speaks ASCII only, so a token carrying a
 * non-ASCII digit or percent sign can never equal one of the
 * record's own figures: unowned by construction, and a maximal
 * token means an owned ASCII figure cannot hide behind a
 * non-ASCII digit prefix ('٩73%' is one token, and not '73%'). */
const lineFigures = (line) => {
  const figures = [];
  for (const m of line.matchAll(/(\p{Nd}[\p{Nd}.]*)\s*([%％٪﹪])/gu)) figures.push(`${m[1]}${m[2]}`);
  return figures;
};

/**
 * Validate a backend proposal against the standing record, on
 * mindContract.validateReply's pattern (shape first, fail-closed,
 * never throws). Returns { line, rungOrder|null } or null = drop the
 * proposal whole; the rules line stands. A reply can carry NO verdict,
 * gate or measure this function would read — and a janky line must
 * carry the rules' figures for the failing gate, verbatim as pct
 * formats them AND in their roles (the measured value before its
 * limit; crop states no limit figure, so none may be added), and
 * those must be every figure it carries — the set is closed, so an
 * extra figure beside a correct pair is still an invented number —
 * or it is inventing numbers and is dropped. A clean line is fenced the other
 * way: DAVIS's rules lines carry no figures, name no verdict but the
 * landing's own and propose no repair — a clean proposal doing any of
 * those is out of the idiom and drops whole.
 */
// Slice 3: the acts' own words, one per rung — the vocabulary a line
// about an ACTED record may name, and only for the rung that resolved
// it (the cut's word belongs to cut records alone).
const ACT_WORDS = Object.freeze({ 1: 'shrunk', 2: 'shifted', 4: 'dealt', 5: 'cut' });

export const validateReviewProposal = (raw, record) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!record || (record.verdict !== 'clean' && record.verdict !== 'janky' && record.verdict !== 'cut')) return null;
  const line = typeof raw.line === 'string' ? raw.line.trim() : '';
  if (!line || line.length > MAX_LINE) return null;
  let rungOrder = null;
  if (raw.rungOrder !== undefined) {
    // A clean landing approves no ladder — a rung order there is
    // out-of-set, and out-of-set drops the proposal whole (§3.7).
    // Slice 3: an ACTED record (and every cut) approves none either —
    // the order that ran is a banked fact (adjustment.plan), not
    // something a reply may re-propose after the fact.
    if (record.verdict !== 'janky' || record.adjustment) return null;
    if (!Array.isArray(raw.rungOrder) || raw.rungOrder.length === 0) return null;
    const seen = new Set();
    for (const r of raw.rungOrder) {
      if (!Number.isInteger(r) || !REVIEW_LADDER.includes(r) || seen.has(r)) return null;
      seen.add(r);
    }
    rungOrder = [...raw.rungOrder];
  }
  if (record.verdict === 'clean') {
    // DAVIS's rules lines carry NO figures — there is no measure behind
    // a clean line to quote — so a clean proposal speaking a percent
    // figure is inventing a reading and drops whole. The test is the
    // lineFigures enumeration itself, so a figure spoken in any script
    // (a non-ASCII digit, a fullwidth percent sign) is a figure here
    // too. It may not name
    // the verdict it is not ('janky': a reply carries no verdict, least
    // of all the contrary one), and it may not name a repair: a clean
    // landing approves no ladder (a rungOrder already dropped above)
    // and its rules lines propose none, so the rungs' own imperative
    // names are out of set in prose too. Contradicting prose beyond
    // these fences cannot be pattern-fenced; that residue stands, by
    // design — the rule fence, not a prose censor.
    if (lineFigures(line).length > 0) return null;
    if (/\bjanky\b/i.test(line)) return null;
    if (/\b(?:shrink|shift|cut|re-?deal)\b/i.test(line)) return null;
  }
  if (record.verdict === 'janky' || record.verdict === 'cut') {
    // Slice 3 — the acted fences. A cut record is fenced as the janky
    // landing it was (its figures are the landing's, kept on the
    // record). An ACTED record's line reports a completed act, so the
    // proposal mood is a falsehood there: 'would' drops the line
    // whole. And the act the line may name is the record's own — the
    // resolving rung's word, no other rung's: a line claiming a
    // different repair than the one banked contradicts the record.
    if (record.adjustment) {
      if (/\bwould\b/i.test(line)) return null;
      const own = ACT_WORDS[record.rung];
      for (const word of Object.values(ACT_WORDS)) {
        if (word === own) continue;
        if (new RegExp(`\\b${word}\\b`, 'i').test(line)) return null;
      }
    }
    const gm = gateMeasure(record);
    if (!gm) return null;
    const valueFigure = pct(gm.value);
    const limitFigure = pct(gm.limit);
    // The figure set is CLOSED: every percent figure the line speaks
    // must be one of the record's own — the measured value and its
    // limit (crop speaks its value only: its limit is no figure at
    // all). An extra figure riding alongside a correct pair — another
    // gate's reading, an invented peak — is a number the record does
    // not own and drops the line whole, and so is a figure spoken in
    // another script: lineFigures extracts it whole, and no non-ASCII
    // token equals an owned ASCII figure. Repeats of an owned figure
    // are fine: a rephrase may restate the value.
    const owned = record.gate === 'crop' ? [valueFigure] : [valueFigure, limitFigure];
    for (const figure of lineFigures(line)) {
      if (!owned.includes(figure)) return null;
    }
    const valueAt = figureIndex(line, valueFigure);
    if (valueAt < 0) return null; // the measured figure must be spoken
    if (record.gate === 'crop') {
      // Crop's limit is the ABSENCE of crossing, not a number — the
      // rules line says "the limit is none" and never states
      // pct(limit) ('0%'). The closed set above already drops a
      // proposal carrying that figure: it is unowned, the one figure
      // the rules line withholds. Nothing further is owed here.
    } else {
      const limitAt = figureIndex(line, limitFigure);
      if (limitAt < 0) return null; // the limit figure must be spoken
      // Roles, not just presence: every rules template speaks the
      // measured value BEFORE its limit. A proposal speaking the limit
      // first has swapped the roles — it would put numbers on the tape
      // the record contradicts — and drops whole. When value and limit
      // format to the same string, presence is the whole fence and
      // position is vacuous.
      if (limitFigure !== valueFigure && limitAt < valueAt) return null;
    }
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
  if (!record || (record.verdict !== 'clean' && record.verdict !== 'janky' && record.verdict !== 'cut')) return null;
  const persona = record.verdict === 'clean' ? 'davis' : 'lois';
  if (raw.persona !== persona) return null;
  const line = typeof raw.line === 'string' ? raw.line.trim() : '';
  if (!line || line.length > MAX_LINE) return null;
  if (raw.backend !== 'rules' && raw.backend !== 'apple' && raw.backend !== 'demo') return null;
  if (!Number.isInteger(raw.seed)) return null;
  if (raw.bar !== null && !(Number.isInteger(raw.bar) && raw.bar >= 0)) return null;
  const voice = { persona, line, bar: raw.bar, backend: raw.backend, seed: raw.seed >>> 0 };
  if (raw.rungOrder !== undefined) {
    // Slice 3: a cut record's voice may carry the plan that ran (its
    // rungOrder is a report, not a proposal) on the same discipline.
    if (
      (record.verdict !== 'janky' && record.verdict !== 'cut') ||
      !Array.isArray(raw.rungOrder) ||
      raw.rungOrder.length === 0
    )
      return null;
    const seen = new Set();
    for (const r of raw.rungOrder) {
      if (!Number.isInteger(r) || !REVIEW_LADDER.includes(r) || seen.has(r)) return null;
      seen.add(r);
    }
    voice.rungOrder = [...raw.rungOrder];
  }
  return voice;
};
