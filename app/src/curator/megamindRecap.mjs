// megamindRecap.mjs — #1529 MegaMind follow-on: replay recaps (#1461) + retro-capture summaries
// (#1367), told from the take's own log.
//
// THE HONEST-NARRATION LAW, mechanised (the issue's core law): every claim in a recap traces to a
// logged event, and the tracing is not a hope. A recap is built in three steps, each checkable:
//
//   1. FACTS. `takeFacts` reads the take's sections and input log and derives fact records — one
//      per logged event worth retelling (a birth, a persona verdict, a palette move, a held
//      frame…), each stamped from the log itself (frame → bar via the take's clock section, frame
//      → seconds via the strip's own nominal clock). A section the take does not carry yields NO
//      facts of its kind: absence is never narrated as an event, and where the take predates the
//      persona record entirely, the digest says so instead of inventing a voice for it.
//   2. RULES LINES. The rules backend renders each digest fact as a sentence in its persona's
//      bucket (Davis conducts the room; LOIS judges the picture; the record itself speaks for the
//      span and the aggregates). These lines are the complete recap: with no model linked at all,
//      this module alone produces the whole honest artifact.
//   3. MODEL CLAIMS. A linked model may re-voice a persona's facts, one claim per fact, citing the
//      fact's id. `validateRecapClaims` walks every claim against the digest before it is kept: an
//      unknown id (an event that never happened) drops the claim; a number the cited fact does not
//      carry drops the claim; a line that quotes none of the fact's own forms drops the claim.
//      `verifyRecap` re-walks a finished record the same way, so a shipped recap can always be
//      audited line by line against its own facts — and the facts against the log.
//
// Recaps are records of the take, generated only after playback completes (the #1461 muting law is
// untouched — nothing here runs during a performance or a replay), and retro summaries are built
// from the capture alone: the capture's frames ARE the window, and facts outside it cannot exist
// here because the capture's log does not hold them.
import { replayInputs } from '../engine/kernel/replay/inputLog.js';
import { barAtFrame, checkClockRecord, loopTimesOf, rebuildBars } from './clockRecord.js';
import { checkMindRecord } from './mindRecord.js';
import { hasCjk, parseJsonText, stripThink } from './megamindVoice.mjs';

// The surfaces module's reply parse, inlined: it is the same one-liner over the voice core's
// parser, and importing megamindSurfaces here would drag the whole register-surfaces module
// (guide corpus and all) into the eager entry graph for one function.
const parseSurfaceReply = (text) => parseJsonText(typeof text === 'string' ? text : '');

export const RECAP_VERSION = 1;
/** The capability consumer this surface reads through (registry, stage '#1529', tier C). */
export const RECAP_CONSUMER = 'narration.recap';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const FRAME_MS = 1000 / 60; // the strip's own nominal clock (takeStripModel's MS_PER_FRAME)

/** m:ss, the strip's label shape. */
export const recapClock = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const numbersIn = (text) => {
  const out = new Set();
  for (const m of String(text).matchAll(/\d+(?:\.\d+)?/g)) out.add(m[0]);
  return out;
};

// ── fact extraction: the take's log, read whole ──────────────────────────────────────────────────

// The persona verdicts that headline a recap (mind-core's own glosses): LOIS's NOD is a
// keep-worthy frame, her BURN a flat show, her CUT the cut; Davis's BLOOM and STUCK are the
// room's bloom and stall. Every other recorded verdict is counted, not headlined.
const HEADLINE_STATES = {
  lois: { NOD: 'keep', BURN: 'burn', CUT: 'cut' },
  davis: { BLOOM: 'bloom', STUCK: 'stuck' },
};
const STATE_PHRASE = {
  keep: (line) => `LOIS called a keep${line ? `: "${line}"` : ''}`,
  burn: (line) => `LOIS burned the show${line ? `: "${line}"` : ''}`,
  cut: (line) => `LOIS cut${line ? `: "${line}"` : ''}`,
  bloom: (line) => `Davis called a bloom${line ? `: "${line}"` : ''}`,
  stuck: (line) => `Davis called the room stuck${line ? `: "${line}"` : ''}`,
};

/**
 * Every fact a take's log supports, in frame order. `from`/`to` bound the window in take frames
 * (a retro capture passes its own bounds — which are the whole capture; the range exists so the
 * scoping is provable, and so a caller can recap a span). Facts are
 * { id, frame, bar, sec, kind, persona, text, forms } — `text` is the fact's own sentence WITH its
 * stamp; `forms` are its quotable grounding forms (names, ids, state words, its numbers).
 */
export function takeFacts(perf, { from = 0, to = Infinity } = {}) {
  if (!isObj(perf) || !Number.isInteger(perf.frames) || perf.frames < 1) return [];
  const lo = Math.max(0, from | 0);
  const hi = Math.min(perf.frames, to === Infinity ? perf.frames : to | 0);
  if (hi <= lo) return [];
  const facts = [];
  const push = (frame, kind, persona, text, forms) => {
    if (!Number.isInteger(frame) || frame < lo || frame >= hi) return;
    facts.push({ frame, kind, persona, text, forms });
  };

  // Timestamps from the log: bars from the take's clock section (loop times + BPM changes),
  // seconds from the frame count at the strip's nominal clock.
  const loopTimes = loopTimesOf(perf);
  const clock = checkClockRecord(perf.clock);
  const { downbeats } = clock ? rebuildBars(clock, loopTimes) : { downbeats: [] };
  const barOf = (frame) => (downbeats.length ? barAtFrame(downbeats, frame) : null);
  const secOf = (frame) => (frame * FRAME_MS) / 1000;
  const stamp = (frame) => {
    const bar = barOf(frame);
    return bar === null ? `at ${recapClock(secOf(frame))}` : `bar ${bar} · ${recapClock(secOf(frame))}`;
  };

  // ── the input log (every take carries it; a retro capture's log may also carry recorder sections) ──
  let prev = null;
  let holdStart = null;
  let shedStart = null;
  const closeSpan = (start, end, kind, persona, phrase) => {
    if (start === null || end - start < 60) return; // a breath under a second is not an event
    push(
      start,
      kind,
      persona,
      `${stamp(start)} — ${phrase} for about ${Math.round(((end - start) * FRAME_MS) / 1000)}s`,
      [phrase],
    );
  };
  let f = -1;
  for (const input of replayInputs(perf.inputs)) {
    f += 1;
    if (f >= hi) break;
    if (f < lo) {
      prev = input;
      continue;
    }
    if (prev) {
      if (input.paletteId !== prev.paletteId && typeof input.paletteId === 'string')
        push(f, 'palette', 'lois', `${stamp(f)} — the palette moved to ${input.paletteId}`, [
          input.paletteId,
          'palette',
        ]);
      if (input.seed !== prev.seed && Number.isFinite(input.seed))
        push(f, 'seed', 'lois', `${stamp(f)} — a new seed was dealt (${input.seed})`, [String(input.seed), 'seed']);
      const layerKey = (inp) =>
        Array.isArray(inp.layers) ? inp.layers.map((l) => (l && (l.name || l.id)) || '').join('|') : '';
      if (layerKey(input) !== layerKey(prev)) {
        const names = (Array.isArray(input.layers) ? input.layers : [])
          .map((l) => (l && (l.name || l.id)) || '')
          .filter(Boolean);
        if (names.length)
          push(f, 'layers', 'lois', `${stamp(f)} — the layers became ${names.join(', ')}`, [...names, 'layers']);
      }
    }
    if (input.slowRender && holdStart === null) holdStart = f;
    if (!input.slowRender && holdStart !== null) {
      closeSpan(holdStart, f, 'hold', 'davis', 'the frame was held');
      holdStart = null;
    }
    if (input.perfTier1 && shedStart === null) shedStart = f;
    if (!input.perfTier1 && shedStart !== null) {
      closeSpan(shedStart, f, 'shed', 'davis', 'the governor shed load');
      shedStart = null;
    }
    prev = input;
  }
  closeSpan(holdStart, hi, 'hold', 'davis', 'the frame was held');
  closeSpan(shedStart, hi, 'shed', 'davis', 'the governor shed load');

  // ── the clock section: the beat moved ──
  if (clock) {
    for (const [frame, bpm] of clock.changes)
      push(frame, 'bpm', 'davis', `${stamp(frame)} — the beat moved to ${bpm} BPM`, [String(bpm), 'BPM', 'beat']);
  }

  // ── the mind section: what the room actually said and did ──
  const mind = checkMindRecord(perf.mind);
  if (mind) {
    let spoken = 0;
    const byPersona = { davis: 0, lois: 0 };
    for (const d of mind.decisions) {
      const [frame, persona, , , , , , reply] = d;
      if (persona !== 'davis' && persona !== 'lois') continue;
      if (!Number.isInteger(frame) || frame < lo || frame >= hi) continue; // aggregates count the window only
      spoken += 1;
      byPersona[persona] += 1;
      // A recorded reply carries its face state as { id, intensity, decay } (mindContract's
      // validated shape); a bare string is read too, for older rows.
      const stateId =
        reply && typeof reply.state === 'string'
          ? reply.state
          : reply && isObj(reply.state) && typeof reply.state.id === 'string'
            ? reply.state.id
            : null;
      const kind = stateId ? HEADLINE_STATES[persona][stateId] : undefined;
      if (!kind) continue;
      const line = reply && typeof reply.line === 'string' ? reply.line : '';
      push(frame, kind, persona, `${stamp(frame)} — ${STATE_PHRASE[kind](line)}`, [
        stateId,
        ...(line ? [line] : []),
        persona === 'lois' ? 'LOIS' : 'Davis',
      ]);
    }
    if (spoken)
      push(
        lo,
        'spoken',
        null,
        `the room spoke ${spoken} times in the take (Davis ${byPersona.davis} · LOIS ${byPersona.lois})`,
        [String(spoken), 'room spoke'],
      );
    let applied = 0;
    let dropped = 0;
    for (const c of Array.isArray(mind.conduct) ? mind.conduct : []) {
      const [frame, status, , , , op] = c;
      if (!Number.isInteger(frame) || frame < lo || frame >= hi) continue;
      if (status === 'applied') {
        applied += 1;
        const move =
          isObj(op) && typeof op.op === 'string'
            ? `${op.op}${typeof op.target === 'string' ? ` → ${op.target}` : ''}`
            : 'a route';
        push(frame, 'conduct', 'davis', `${stamp(frame)} — Davis moved the room: ${move}`, [
          move,
          'Davis',
          'moved the room',
        ]);
      } else if (status === 'dropped') dropped += 1;
    }
    if (dropped)
      push(lo, 'conduct-missed', null, `${dropped} of Davis's proposed moves were dropped by the room's own gates`, [
        String(dropped),
        'dropped',
      ]);
    void applied;
  } else {
    // The hook law (#1529, 2026-10-15): where a record predates the stamps, say so instead of
    // inventing a score. A take with no persona record gets exactly this one honest line.
    push(lo, 'no-record', null, 'the take carries no persona record — nothing the room said can be retold', [
      'no persona record',
    ]);
  }

  // ── the births section: what bloomed, and what did not ──
  if (isObj(perf.births) && Array.isArray(perf.births.events)) {
    let misses = 0;
    let rolls = 0;
    for (const e of perf.births.events) {
      if (!Array.isArray(e)) continue;
      const [frame, press, via, outcome, record] = e;
      if (!Number.isInteger(frame) || frame < lo || frame >= hi) continue;
      rolls += 1;
      if (outcome === 'born' && isObj(record)) {
        const body = typeof record.body === 'string' ? record.body : null;
        push(
          frame,
          'birth',
          'davis',
          `${stamp(frame)} — a child was born, ${record.id || 'unnamed'}${body ? ` on ${body}` : ''} (press ${press}, via ${via})`,
          [String(record.id || ''), ...(body ? [body] : []), 'born', 'child'],
        );
      } else misses += 1;
    }
    if (rolls && misses === rolls)
      push(lo, 'birth-missed', null, `no child was born in the take — ${rolls} rolls, all stillborn or declined`, [
        String(rolls),
        'no child was born',
      ]);
    else if (misses)
      push(lo, 'birth-missed', null, `${misses} further birth rolls were stillborn or declined`, [
        String(misses),
        'stillborn',
      ]);
  }

  // ── the formation section: hierarchies that formed ──
  if (isObj(perf.formation) && Array.isArray(perf.formation.forms)) {
    for (const row of perf.formation.forms) {
      if (!Array.isArray(row)) continue;
      push(row[0], 'form', 'davis', `${stamp(row[0])} — a hierarchy formed at pin ${row[1]}`, [
        String(row[1]),
        'hierarchy formed',
      ]);
    }
  }

  // ── the stress section: the room's band changes ──
  if (isObj(perf.stress) && Array.isArray(perf.stress.bands)) {
    const phrase = { tighten: 'the room tightened', relax: 'the room relaxed', normal: 'the room settled to normal' };
    for (const [frame, band] of perf.stress.bands)
      if (phrase[band]) push(frame, 'band', 'davis', `${stamp(frame)} — ${phrase[band]}`, [phrase[band], band]);
  }

  // ── the gestures section: the performer's own acts ──
  if (isObj(perf.gestures) && Array.isArray(perf.gestures.events)) {
    for (const e of perf.gestures.events) {
      if (!Array.isArray(e)) continue;
      const [frame, action, value] = e;
      if (action === 'freeze')
        push(
          frame,
          'gesture',
          'davis',
          `${stamp(frame)} — the performer ${value ? 'froze the accumulation' : 'lifted the freeze'}`,
          [value ? 'froze the accumulation' : 'lifted the freeze'],
        );
      else if (action === 'clear')
        push(frame, 'gesture', 'davis', `${stamp(frame)} — the performer cleared the dish`, ['cleared the dish']);
      else if (action === 'swell')
        push(frame, 'gesture', 'davis', `${stamp(frame)} — the performer called a swell`, ['swell']);
    }
  }

  facts.sort((a, b) => a.frame - b.frame);
  return facts.map((fact, i) => ({
    id: `f${i}`,
    frame: fact.frame,
    bar: barOf(fact.frame),
    sec: Math.round(secOf(fact.frame) * 10) / 10,
    kind: fact.kind,
    persona: fact.persona,
    text: fact.text,
    forms: fact.forms.filter((x) => typeof x === 'string' && x.length >= 2),
  }));
}

// ── the digest: a bounded, chronological selection ───────────────────────────────────────────────

const KIND_CAPS = {
  birth: 3,
  keep: 3,
  bloom: 2,
  stuck: 2,
  burn: 2,
  cut: 2,
  conduct: 3,
  form: 2,
  palette: 2,
  seed: 2,
  layers: 2,
  hold: 2,
  shed: 1,
  band: 2,
  gesture: 2,
  bpm: 1,
};
const DIGEST_MAX = 24;

/** The span fact: what the record itself says about the take before anyone voices it. */
export function spanFact(perf, kind) {
  const frames = isObj(perf) && Number.isInteger(perf.frames) ? perf.frames : 0;
  const clock = isObj(perf) ? checkClockRecord(perf.clock) : null;
  let bars = null;
  if (clock) {
    const { downbeats } = rebuildBars(clock, loopTimesOf(perf));
    bars = downbeats.length ? downbeats[downbeats.length - 1].bar + 1 : 0;
  }
  const spanSec = Math.round(((frames * FRAME_MS) / 1000) * 10) / 10;
  const head = kind === 'retro' ? 'the captured window' : 'a take';
  const text =
    `${head} of ${frames} frames${bars !== null ? ` · ${bars} bars` : ''} · ${recapClock(spanSec)} on the clock` +
    (isObj(perf) && perf.initialState ? ` · beginning at session frame ${perf.initialState.atFrame}` : '');
  return {
    fact: { id: 'span', frame: 0, bar: null, sec: 0, kind: 'span', persona: null, text, forms: [head, String(frames)] },
    bars,
    spanSec,
  };
}

/**
 * The digest: the span fact, then the log's facts under per-kind caps (overflow becomes one
 * counted aggregate, never a silent cut), chronological. This is the ONLY fact set a recap may
 * cite — model claims included.
 */
export function digestFacts(perf, kind) {
  const span = spanFact(perf, kind);
  const all = takeFacts(perf);
  const counts = {};
  const kept = [];
  let overflow = 0;
  for (const fact of all) {
    if (
      fact.kind === 'spoken' ||
      fact.kind === 'no-record' ||
      fact.kind === 'conduct-missed' ||
      fact.kind === 'birth-missed'
    ) {
      kept.push(fact); // aggregates and the honesty line always ride
      continue;
    }
    counts[fact.kind] = (counts[fact.kind] || 0) + 1;
    if (counts[fact.kind] <= (KIND_CAPS[fact.kind] ?? 2)) kept.push(fact);
    else overflow += 1;
  }
  const digest = [span.fact, ...kept];
  if (digest.length > DIGEST_MAX) {
    // The total cap trims the tail — and the trim is counted into the same aggregate, never silent.
    overflow += digest.splice(DIGEST_MAX - 1).length;
  }
  if (overflow)
    digest.push({
      id: 'more',
      frame: perf.frames - 1,
      bar: null,
      sec: span.spanSec,
      kind: 'more',
      persona: null,
      text: `and ${overflow} more logged events the digest leaves in the take`,
      forms: [String(overflow), 'more logged events'],
    });
  return { facts: digest, bars: span.bars, spanSec: span.spanSec };
}

// ── the rules recap: the complete honest artifact, no model anywhere ────────────────────────────

const lineOf = (fact) => ({ persona: fact.persona, text: fact.text, cites: [fact.id], src: 'rules' });

/** A complete recap/summary record from the log alone. Deterministic: same take, same record. */
export function buildRulesRecap(perf, { kind = 'replay' } = {}) {
  const { facts, bars, spanSec } = digestFacts(perf, kind);
  const lines = facts.map(lineOf);
  if (facts.length <= 2) {
    // An empty log is itself the honest recap: a fact of its own, so even this line cites.
    facts.push({
      id: 'quiet',
      frame: 0,
      bar: null,
      sec: 0,
      kind: 'quiet',
      persona: null,
      text: 'the log holds nothing else to tell.',
      forms: ['nothing else to tell'],
    });
    lines.push({ persona: null, text: 'the log holds nothing else to tell.', cites: ['quiet'], src: 'rules' });
  }
  return {
    version: RECAP_VERSION,
    kind,
    frames: isObj(perf) && Number.isInteger(perf.frames) ? perf.frames : 0,
    bars,
    spanSec,
    facts,
    lines,
    backend: 'rules',
    model: null,
  };
}

// ── model claims: enrichment that must prove every sentence ──────────────────────────────────────

const RECAP_SYSTEM =
  'You are a backstage hand inside KC-1, a generative visual instrument. You answer with exactly one JSON object and nothing else — no prose around it, no reasoning. Answer in English only, every word. You work only from the facts you are given: invent nothing, name no event you were not shown, use no number that is not in the fact you cite.';

const PERSONA_FRAMING = {
  davis: 'You are DAVIS, the conductor persona, looking back over a set that has finished. ',
  lois: 'You are LOIS, the critic persona, looking back over a set that has finished. ',
};

/** The recap ask for one persona: their digest facts, one claim per fact, each claim citing its fact. */
export function buildRecapRequest(persona, facts) {
  const mine = (Array.isArray(facts) ? facts : []).filter((x) => x && (x.persona === persona || x.kind === 'span'));
  return [
    { role: 'system', content: RECAP_SYSTEM },
    {
      role: 'user',
      content:
        (PERSONA_FRAMING[persona] || '') +
        'Below are the logged facts of the set, each with an id. Write a short recap of the set in your own voice: at most 6 claims, each claim re-voicing ONE fact — its events, names and numbers exactly as given, nothing added. Reply: {"claims": [{"fact": "<the fact id>", "line": "<one short line>"}]}. A claim that cites an id not in the list, or uses a number the fact it cites does not carry, or quotes none of that fact\'s own forms, is discarded whole.\n' +
        JSON.stringify({ facts: mine.map((x) => ({ id: x.id, text: x.text })) }),
    },
  ];
}

const CLAIM_LINE_MAX = 220;

const claimGroundingOk = (line, fact) => {
  const factNumbers = numbersIn(`${fact.text} ${fact.forms.join(' ')}`);
  for (const num of numbersIn(line)) if (!factNumbers.has(num)) return false;
  const lower = line.toLowerCase();
  return fact.forms.some((form) => form.length >= 3 && lower.includes(form.toLowerCase()));
};

/**
 * The surviving claims of one model reply, walked against the digest: [{ fact, line }] with every
 * ungrounded claim dropped individually (an unknown id — an event that never happened — can never
 * survive). Malformed replies survive as nothing.
 */
export function validateRecapClaims(raw, facts) {
  if (!isObj(raw) || !Array.isArray(raw.claims)) return [];
  const byId = new Map((Array.isArray(facts) ? facts : []).map((x) => [x.id, x]));
  const seen = new Set();
  const out = [];
  for (const claim of raw.claims.slice(0, 8)) {
    if (!isObj(claim) || typeof claim.fact !== 'string' || typeof claim.line !== 'string') continue;
    const fact = byId.get(claim.fact);
    if (!fact || seen.has(fact.id)) continue;
    const line = stripThink(claim.line).trim().replace(/\s+/g, ' ');
    if (line.length < 8 || line.length > CLAIM_LINE_MAX || hasCjk(line)) continue;
    if (!claimGroundingOk(line, fact)) continue;
    seen.add(fact.id);
    out.push({ fact: fact.id, line });
    if (out.length >= 6) break;
  }
  return out;
}

/** Parse + validate in one step (the live driver's seam). */
export const recapClaimsFromText = (text, facts) => validateRecapClaims(parseSurfaceReply(text), facts);

/**
 * Fold one persona's surviving model claims into a rules recap: a verified model line replaces
 * the rules line for the fact it cites; every other fact keeps its rules line, so the record is
 * complete either way. Order stays chronological by cited fact.
 */
export function mergeModelLines(recap, persona, claims, model) {
  if (!isObj(recap) || !Array.isArray(claims) || !claims.length) return recap;
  const byId = new Map(recap.facts.map((x) => [x.id, x]));
  const mine = claims.filter((c) => byId.has(c.fact));
  if (!mine.length) return recap;
  const covered = new Set(mine.map((c) => c.fact));
  const lines = recap.lines.filter((l) => !(l.persona === persona && l.cites.some((id) => covered.has(id))));
  for (const c of mine) lines.push({ persona, text: c.line, cites: [c.fact], src: 'model' });
  const frameOf = (l) => (byId.get(l.cites[0]) ? byId.get(l.cites[0]).frame : 0);
  lines.sort((a, b) => frameOf(a) - frameOf(b));
  return {
    ...recap,
    lines,
    backend: typeof model === 'string' && model ? model : recap.backend,
    model: model ?? recap.model,
  };
}

// ── the audit + the fail-closed reader ───────────────────────────────────────────────────────────

/**
 * The claim-walk over a finished record: every line's citations resolve to the record's own
 * facts, every number in a line is carried by a cited fact, and every line quotes a cited fact's
 * form. Returns the list of violations (empty = the record is honest against its own digest).
 */
export function verifyRecap(recap) {
  if (!isObj(recap) || !Array.isArray(recap.facts) || !Array.isArray(recap.lines)) return ['not a recap record'];
  const byId = new Map(recap.facts.map((x) => [x.id, x]));
  const bad = [];
  recap.lines.forEach((line, i) => {
    if (!isObj(line) || typeof line.text !== 'string' || !Array.isArray(line.cites) || !line.cites.length) {
      bad.push(`line ${i}: malformed`);
      return;
    }
    const cited = [];
    for (const id of line.cites) {
      const fact = byId.get(id);
      if (!fact) bad.push(`line ${i}: cites unknown fact ${String(id)}`);
      else cited.push(fact);
    }
    if (!cited.length) return;
    const numbers = new Set();
    const forms = [];
    for (const fact of cited) {
      for (const num of numbersIn(`${fact.text} ${fact.forms.join(' ')}`)) numbers.add(num);
      forms.push(...fact.forms);
    }
    for (const num of numbersIn(line.text))
      if (!numbers.has(num)) bad.push(`line ${i}: number ${num} not in its facts`);
    const lower = line.text.toLowerCase();
    if (!forms.some((form) => form.length >= 3 && lower.includes(form.toLowerCase())))
      bad.push(`line ${i}: quotes none of its facts`);
  });
  return bad;
}

const cleanFact = (raw) => {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.kind !== 'string' || typeof raw.text !== 'string')
    return null;
  if (raw.text.length > 400 || !(raw.persona === null || raw.persona === 'davis' || raw.persona === 'lois'))
    return null;
  return {
    id: raw.id.slice(0, 12),
    frame: Number.isInteger(raw.frame) ? raw.frame : 0,
    bar: Number.isInteger(raw.bar) ? raw.bar : null,
    sec: Number.isFinite(raw.sec) ? raw.sec : 0,
    kind: raw.kind.slice(0, 24),
    persona: raw.persona,
    text: raw.text,
    forms: Array.isArray(raw.forms) ? raw.forms.filter((x) => typeof x === 'string').slice(0, 8) : [],
  };
};

const cleanLine = (raw, factIds) => {
  if (!isObj(raw) || typeof raw.text !== 'string' || raw.text.length < 1 || raw.text.length > 400) return null;
  if (!(raw.persona === null || raw.persona === 'davis' || raw.persona === 'lois')) return null;
  if (!Array.isArray(raw.cites) || !raw.cites.length || raw.cites.some((id) => !factIds.has(id))) return null;
  return {
    persona: raw.persona,
    text: raw.text,
    cites: raw.cites.slice(0, 4),
    src: raw.src === 'model' ? 'model' : 'rules',
  };
};

/** A recap/summary record as a clean copy, or null — the fail-closed reader for attached records. */
export function checkRecapRecord(raw) {
  if (!isObj(raw) || raw.version !== RECAP_VERSION) return null;
  if (raw.kind !== 'replay' && raw.kind !== 'retro') return null;
  if (!Array.isArray(raw.facts) || !raw.facts.length || !Array.isArray(raw.lines) || !raw.lines.length) return null;
  const facts = raw.facts.map(cleanFact);
  if (facts.some((x) => !x)) return null;
  const factIds = new Set(facts.map((x) => x.id));
  const lines = raw.lines.map((l) => cleanLine(l, factIds));
  if (lines.some((x) => !x)) return null;
  return {
    version: RECAP_VERSION,
    kind: raw.kind,
    frames: Number.isInteger(raw.frames) ? raw.frames : 0,
    bars: Number.isInteger(raw.bars) ? raw.bars : null,
    spanSec: Number.isFinite(raw.spanSec) ? raw.spanSec : 0,
    facts,
    lines,
    backend: typeof raw.backend === 'string' ? raw.backend.slice(0, 80) : 'rules',
    model: typeof raw.model === 'string' ? raw.model.slice(0, 80) : null,
  };
}
