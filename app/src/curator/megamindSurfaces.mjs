// megamindSurfaces.mjs — #1526 MegaMind S2: the accommodation register's non-persona surfaces, pure.
//
// Plan §6b names what must land WITH the adapter stage, beyond the trio's verdicts: the #1145 pacing
// interface, crown-time assistance, dev-panel narration, the docs-grounded visitor guide — plus the
// 2026-10-15 hook amendment's two XGBoost narration surfaces (Davis reason prose, drift narration with
// retrain PROPOSALS). Every surface here is the same shape as the persona adapter: a request builder
// (what the model is shown — real data only), a reply validator (shape + grounding; a bad reply is a
// discarded reply), and, where the instrument must judge a proposal, a pure judge that reads the
// instrument's own state and outranks the model.
//
// Laws held: proposals are records, never edits — the #1145 scheduler is not touched by anything here
// (its room readout is one-way, directorRoom.js); a retrain is proposed, never performed (taste.json
// stays a versioned trainer artifact); the guide answers from the shipped corpus only; narration must
// quote the numbers it was given or it is discarded (grounding is mechanical, not a vibe).
import { MAX_LINE } from './mindContract.js';
import { hasCjk, parseJsonText } from './megamindVoice.mjs';
import { HELP_TOPICS } from '../data/helpCopy.js';
import { ABOUT_TITLE, ABOUT_TAGLINE, ABOUT_BIO } from '../data/aboutCopy.mjs';
import lore from './lore.json' with { type: 'json' };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cleanLine = (v, max) =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max && !hasCjk(v) ? v.trim() : null;

const SURFACE_SYSTEM =
  'You are a backstage hand inside KC-1, a generative visual instrument. You answer with exactly one JSON object and nothing else — no prose around it, no reasoning. Answer in English only, every word. You work only from the facts you are given: invent nothing, name no feature you were not shown, and when the facts do not support an answer, say so in the shape allowed.';

// ── #1145 pacing proposals ─────────────────────────────────────────────────────────────────────────────────

export const PACING_MOVES = Object.freeze(['widen', 'hold', 'push']);

/** The pacing ask: the session's recent Director rooms (the readout history — verdicts and bands, never gains). */
export function buildPacingRequest(history) {
  const rooms = (Array.isArray(history) ? history : []).slice(-12).map((r) => ({
    verdict: r && typeof r.verdict === 'string' ? r.verdict : null,
    intensity: r && typeof r.intensity === 'string' ? r.intensity : null,
    relaxing: !!(r && r.relaxing),
    phase: r && typeof r.phase === 'string' ? r.phase : null,
  }));
  return [
    { role: 'system', content: SURFACE_SYSTEM },
    {
      role: 'user',
      content:
        'You are the pacing brain above KC-1\'s Director. The Director runs rooms (an argument between its two personas) at an intensity band and forces peak/relax cycles over a set; the room table is its reflexes, you are its patience. From the recent rooms below, propose ONE pacing move for what comes next: "widen" (broaden the room — more freedom, new material), "hold" (stay the course), or "push" (drive toward a peak). Reply: {"move": "widen"|"hold"|"push", "line": "<one short deadpan line, optional>"}. The scheduler validates your move against the room as it stands; an invalid move is discarded, so read the last room carefully.\n' +
        JSON.stringify({ rooms }),
    },
  ];
}

/** A pacing proposal as a clean record, or null. */
export function validatePacingProposal(raw) {
  if (!isObj(raw) || !PACING_MOVES.includes(raw.move)) return null;
  const out = { move: raw.move };
  if (raw.line !== undefined) {
    const line = cleanLine(raw.line, MAX_LINE);
    if (!line) return null;
    out.line = line;
  }
  return out;
}

/**
 * The scheduler-side judgement of a pacing proposal — pure, reading the Director's room readout exactly
 * as the minds hear it (directorRoom: verdict, intensity band, relaxing, phase; never gains). This is
 * validation only: nothing here moves the Director. Whether a validated proposal may ever ACT on the
 * scheduler is one of #1145's open questions, and those are Matt's calls (plan §0c) — until he rules,
 * proposals are produced, validated, and shown in the dev panel, and the Director runs untouched.
 */
export function judgePacingProposal(proposal, room) {
  if (!proposal || !PACING_MOVES.includes(proposal.move)) return { ok: false, reason: 'malformed proposal' };
  if (!room || typeof room.verdict !== 'string' || !room.verdict) return { ok: false, reason: 'no room is standing' };
  if (proposal.move === 'push' && room.relaxing)
    return { ok: false, reason: 'the Director is relaxing — a push fights the relax' };
  if (proposal.move === 'push' && room.intensity === 'peak')
    return { ok: false, reason: 'already at peak — nothing to push toward' };
  if (proposal.move === 'widen' && room.intensity === 'peak')
    return { ok: false, reason: 'already at peak — widening is spent' };
  return { ok: true, reason: 'inside the room as it stands' };
}

// ── crown-time assistance ──────────────────────────────────────────────────────────────────────────────────

/** The crown ask: one crowned keep (the crown log's own record) + Davis's citation when the head gave one. */
export function buildCrownRequest(crown, citation = null) {
  const c = crown && typeof crown === 'object' ? crown : {};
  const facts = {
    layout: typeof c.layoutId === 'string' ? c.layoutId : null,
    cast: Array.isArray(c.assetIds) ? c.assetIds.filter((a) => typeof a === 'string').slice(0, 12) : [],
    davisState: typeof c.davisCode === 'string' ? c.davisCode : null,
    ...(Number.isFinite(c.xgbScore) ? { tasteScore: Math.round(c.xgbScore * 1000) / 1000 } : {}),
    ...(typeof citation === 'string' && citation ? { davisReason: citation } : {}),
  };
  return [
    { role: 'system', content: SURFACE_SYSTEM },
    {
      role: 'user',
      content:
        'A frame was just crowned (kept) in KC-1. Draft the paperwork for the artist to edit — nothing you write is final. Reply: {"note": "<a keep note, one terse line, from the facts only>", "caption": "<a caption for the crowned frame, at most 80 characters, deadpan>", "lookNames": ["<up to 3 name suggestions for saving this as a Look>"]}. Look names follow the house copy law: plain, deadpan, UPPERCASE, short — a word or two, no exclamation, no marketing. Facts:\n' +
        JSON.stringify(facts),
    },
  ];
}

const LOOK_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,23}$/;

/** A crown draft as clean copy for editing, or null. Names are normalised to the deadpan-uppercase law. */
export function validateCrownDraft(raw) {
  if (!isObj(raw)) return null;
  const note = cleanLine(raw.note, MAX_LINE);
  const caption = cleanLine(raw.caption, 80);
  if (!note || !caption) return null;
  const names = [];
  if (raw.lookNames !== undefined) {
    if (!Array.isArray(raw.lookNames)) return null;
    for (const n of raw.lookNames.slice(0, 3)) {
      if (typeof n !== 'string' || !LOOK_NAME_RE.test(n.trim()) || hasCjk(n) || n.includes('!')) return null;
      names.push(n.trim().toUpperCase());
    }
  }
  return { note, caption, lookNames: names };
}

// ── dev-panel narration ────────────────────────────────────────────────────────────────────────────────────

/** How a fact value may appear in a narration line: verbatim, or (for a 0..1 share) as a whole percent. */
export function factForms(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const forms = [String(value)];
    if (value > 0 && value < 1) forms.push(`${Math.round(value * 100)}%`);
    return forms;
  }
  return typeof value === 'string' && value ? [value] : [];
}

/** Grounding, mechanically: the line must carry at least one of the fact values it was given. */
export function lineQuotesFacts(line, facts) {
  if (typeof line !== 'string' || !Array.isArray(facts)) return false;
  return facts.some((f) => f && factForms(f.value).some((form) => form && line.includes(form)));
}

const factsText = (facts) =>
  (Array.isArray(facts) ? facts : [])
    .filter((f) => f && typeof f.label === 'string')
    .map((f) => `${f.label}: ${f.value}`)
    .join(' · ');

/** The narration ask: a kind ('telemetry' | 'census') and the real numbers, from the real logs. */
export function buildNarrationRequest(kind, facts) {
  const subject =
    kind === 'census'
      ? 'the session census — what the room kept, passed and crowned, and how the taste head agrees with it'
      : 'the session telemetry — how the personas were consulted and what answered';
  return [
    { role: 'system', content: SURFACE_SYSTEM },
    {
      role: 'user',
      content:
        `Summarise ${subject} for the dev panel. Reply: {"line": "<one or two terse sentences>"}. The line MUST quote at least one of the numbers verbatim, exactly as written below — a summary that cites none of its numbers is discarded. Facts: ` +
        factsText(facts),
    },
  ];
}

/** A narration line, or null: bounded, English, and grounded in a quoted fact. */
export function validateNarration(raw, facts) {
  if (!isObj(raw)) return null;
  const line = cleanLine(raw.line, 300);
  if (!line) return null;
  return lineQuotesFacts(line, facts) ? { line } : null;
}

// ── the hook amendment: Davis reason prose + drift narration ───────────────────────────────────────────────

/**
 * Split a Davis citation clause (tasteHead's explainTreeScore: facts joined ' · ', each opening on the
 * feature's plain noun — "density under 0.62") into its grounding words: the head word of each fact.
 */
export function citationHeads(clause) {
  if (typeof clause !== 'string' || !clause) return [];
  return clause
    .split('·')
    .map((f) => f.trim().split(/\s+/)[0])
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** The reason-prose ask: Davis writes his line fresh, grounded in the tree's own clause — nothing else. */
export function buildReasonRequest(clause) {
  return [
    { role: 'system', content: SURFACE_SYSTEM },
    {
      role: 'user',
      content:
        'You are Davis. The taste tree scored a candidate, and its own splits gave this reason clause: ' +
        JSON.stringify(clause) +
        '. Write the line Davis would say for that pick, fresh, in his voice (humble, generous, playful; the process, not the product). Reply: {"line": "<the line>"}. The line must rest on the clause — build it from at least one of the clause\'s own words (its opening nouns). Invent no reason the splits do not support: no new features, no numbers that are not in the clause.',
    },
  ];
}

/** Davis's prose line, or null: bounded, English, and mechanically grounded in the clause's own words. */
export function validateReasonLine(raw, clause) {
  if (!isObj(raw)) return null;
  const line = cleanLine(raw.line, MAX_LINE);
  if (!line) return null;
  const heads = citationHeads(clause);
  const lower = line.toLowerCase();
  return heads.some((h) => lower.includes(h)) ? { line } : null;
}

/** AUC under this, or keeps scoring at/below passes, reads as the head and the room diverging. */
export const DRIFT_AUC = 0.65;

/** Divergence from an agreementView-shaped readout (censusReadout.agreementView). The data decides. */
export function agreementDiverged(agreement) {
  if (!agreement || agreement.present !== true) return false;
  if (Number.isFinite(agreement.auc) && agreement.auc < DRIFT_AUC) return true;
  return (
    Number.isFinite(agreement.keepsMean) &&
    Number.isFinite(agreement.passesMean) &&
    agreement.keepsMean <= agreement.passesMean &&
    agreement.keepsN > 0 &&
    agreement.passesN > 0
  );
}

const agreementFacts = (agreement) => {
  if (!agreement || agreement.present !== true) return [];
  return [
    { label: 'keeps mean score', value: agreement.keepsMean },
    { label: 'keeps', value: agreement.keepsN },
    { label: 'passes mean score', value: agreement.passesMean },
    { label: 'passes', value: agreement.passesN },
    { label: 'separation AUC', value: agreement.auc },
    { label: 'unscored rows', value: agreement.unscored },
    { label: 'taste version', value: agreement.tasteVersion },
  ].filter((f) => f.value !== null && f.value !== undefined);
};

/** The drift ask: narrate the census agreement readout; a retrain may be PROPOSED when the numbers diverge. */
export function buildDriftRequest(agreement) {
  return [
    { role: 'system', content: SURFACE_SYSTEM },
    {
      role: 'user',
      content:
        'Below is the taste-agreement readout: how the taste head\'s scores separate what the room kept from what it passed. Narrate it for the dev panel. Reply: {"line": "<one or two terse sentences>", "proposeRetrain": <true or false>}. The line MUST quote at least one number verbatim. If the head and the room have diverged (keeps scoring no better than passes, a weak separation), say so plainly and you may set proposeRetrain true — a proposal only: retraining happens in the Studio, by hand, never from here. If they agree, proposeRetrain is false. Facts: ' +
        factsText(agreementFacts(agreement)),
    },
  ];
}

/**
 * A drift narration, or null. The retrain proposal survives validation ONLY when the readout itself
 * diverges — the data outranks the model: a proposal over agreeing numbers is stripped, never shown.
 */
export function validateDriftReply(raw, agreement) {
  const base = validateNarration(raw, agreementFacts(agreement));
  if (!base) return null;
  return { line: base.line, proposeRetrain: isObj(raw) && raw.proposeRetrain === true && agreementDiverged(agreement) };
}

// ── the docs-grounded visitor guide ────────────────────────────────────────────────────────────────────

/**
 * The guide's corpus: ONLY what the app itself ships — the help topics (the single source of truth the
 * ? overlay reads, data/helpCopy.js), the lore bank (curator/lore.json), and the About copy. Nothing is
 * fetched, nothing is scraped: if it is not in here, the guide cannot know it, and says so.
 */
export function buildGuideCorpus() {
  const chunks = [];
  for (const t of HELP_TOPICS) {
    chunks.push({ id: `help:${t.id}`, title: `${t.group} · ${t.title}`, text: t.text });
  }
  const entries = lore && Array.isArray(lore.entries) ? lore.entries : [];
  for (const e of entries) {
    if (!e || typeof e.fact !== 'string') continue;
    const tags = e.tags && typeof e.tags === 'object' ? Object.values(e.tags).filter(Boolean).join(' ') : '';
    chunks.push({ id: `lore:${e.id}`, title: `${e.kind || 'lore'} ${tags}`.trim(), text: e.fact });
  }
  chunks.push({ id: 'about:about', title: ABOUT_TITLE, text: `${ABOUT_TAGLINE} ${ABOUT_BIO.join(' ')}` });
  return chunks;
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'it',
  'its',
  'how',
  'what',
  'does',
  'do',
  'can',
  'i',
  'you',
  'my',
  'me',
  'this',
  'that',
  'when',
  'where',
  'which',
]);
const words = (s) =>
  String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

/**
 * Retrieval over the corpus: title words weigh double, text words single; a chunk must share at least
 * one word to be returned at all. Deterministic, no embeddings (that slot is #1528, not this stage).
 */
export function retrieveGuide(query, corpus, k = 4) {
  const q = new Set(words(query));
  if (!q.size || !Array.isArray(corpus)) return [];
  const scored = [];
  for (const chunk of corpus) {
    let score = 0;
    for (const w of words(chunk.title)) if (q.has(w)) score += 2;
    for (const w of words(chunk.text)) if (q.has(w)) score += 1;
    if (score > 0) scored.push({ chunk, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.chunk.id < b.chunk.id ? -1 : 1));
  return scored.slice(0, k).map((s) => s.chunk);
}

/** The guide's refusal when retrieval finds nothing: honest, and never sent to the model. */
export const GUIDE_DECLINE =
  'That is not in the shipped docs I can read — I will not guess at a feature. Try the ? overlay.';

/** The guide ask: the question plus ONLY the retrieved excerpts, ids attached for citation. */
export function buildGuideRequest(query, chunks) {
  const excerpts = (Array.isArray(chunks) ? chunks : []).map((c) => `[${c.id}] ${c.title}: ${c.text}`).join('\n');
  return [
    { role: 'system', content: SURFACE_SYSTEM },
    {
      role: 'user',
      content:
        'You are KC-1\'s visitor guide. Answer the question using ONLY the excerpts below — they are the whole of what you know. Reply: {"answer": "<the answer, plain and short>", "sources": ["<the excerpt ids you used>"]}. Cite every excerpt you draw on. If the excerpts do not answer the question, reply {"answer": "That is not in the shipped docs I can read.", "sources": []} — never invent a feature, a control, or a step.\nExcerpts:\n' +
        excerpts +
        '\nQuestion: ' +
        String(query || ''),
    },
  ];
}

/**
 * A guide answer, or null: bounded, English, and every cited source must be one of the excerpts the
 * model was actually shown — a citation to an unshown chunk voids the whole reply (no invented features
 * can launder through a footnote). An answer with no sources is the decline and is returned as such.
 */
export function validateGuideReply(raw, chunks) {
  if (!isObj(raw)) return null;
  const answer = cleanLine(raw.answer, 600);
  if (!answer) return null;
  const shown = new Set((Array.isArray(chunks) ? chunks : []).map((c) => c.id));
  const sources = [];
  if (raw.sources !== undefined) {
    if (!Array.isArray(raw.sources)) return null;
    for (const s of raw.sources) {
      if (typeof s !== 'string' || !shown.has(s)) return null;
      if (!sources.includes(s)) sources.push(s);
    }
  }
  return { answer, sources };
}

/** Parse a surface reply's text (json-object mode) — shared by every surface validator's caller. */
export const parseSurfaceReply = (text) => parseJsonText(typeof text === 'string' ? text : '');
