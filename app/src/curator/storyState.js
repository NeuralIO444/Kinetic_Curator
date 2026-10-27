// storyState.js — #1560 S3: THE ROOM's story machine, pure. The design is docs/research/room-codec/04-story-generator.md
// on 01-personas.md's relationship model and 02-the-queen.md's suspicion arc, with the mechanics of
// story-lore-research-2026-10-14.md §1.6–§1.9. No clock, no storage, no randomness of its own: the caller folds
// distilled story events (storyEventFromRecord turns real kc-voice/1 bus records into them) and injects the rolls.
//
// Law 3 (honest signals): every number here derives from records that actually happened — verdicts the judge
// recorded, crowns the dice landed, blooms, the artist's keeps, the room's verdicts, and the third persona's
// recorded leans. Nothing is inferred from dwell, attention, or a timer.
//
// The machine's output is BEATS: small descriptors ({ kind, persona, form, referent }) chosen against the current
// story state under the 8 anti-repetition rules — or silence, which is a valid beat (rule 8). A beat carries no
// text: what a persona may say is the backends' business (the rules backend speaks no lines by standing design);
// the machine decides what the moment is ABOUT, and only that. It changes no recorded decision shape.
import { Events } from '../composition/eventBus.js';

// ── the relationship model (01 + research §1.6) ──────────────────────────────────────────────────────────────
/** Slow standing's learning rate per event (research: α ≈ 0.05–0.15). Mood takes the full weight at once. */
export const STORY_ALPHA = 0.1;
/** Mood's per-bar decay toward 0 (fast mood over slow standing; half-life ≈ 138 bars). */
export const MOOD_DECAY_PER_BAR = 0.995;
/** The event → regard weights (08-Q1 default, flagged in the staging report). Mood points, ±100 scale. */
export const STORY_WEIGHTS = Object.freeze({
  verdictEsteemPerDelta: 48, // a verdict moves the judge's regard by its delta (contract caps |delta| at 0.25 → ±12)
  burnEsteem: -14, // she burns a flat show: the strongest ordinary verdict
  crownEsteem: 4,
  crownTrust: 3,
  bloomEsteem: 6,
  bloomTrust: 5,
  keepEsteem: 3,
  keepTrust: 6,
  proposalTrust: -1, // every proposal is a small exposure
});
/** A verdict at or below this delta is an offence (a cut, not a nudge); at or above its mirror, praise. */
export const OFFENCE_DELTA = -0.1;
export const PRAISE_DELTA = 0.1;
/** The third recurrence of the same offence promotes it to a named grudge (research §1.6.4). */
export const GRUDGE_PROMOTE_AT = 3;
/** A standing crossing this line (either direction is not armed — warmth only) arms a truce beat. */
export const TRUCE_LINE = 25;
/** Believed vs true standing gap that arms a misread beat (belief ≠ truth, research §1.6.5). */
export const MISREAD_THRESHOLD = 12;

// ── episodes (04 + research §1.7): callback → working → build → ONE peak → release ───────────────────────────
export const INTENSITY_WEIGHTS = Object.freeze({
  verdict: 0.25,
  crown: 0.2,
  bloom: 0.35,
  keep: 0.15,
  proposal: 0.1,
  route: 0.05,
  room: 0.15,
  promotion: 0.5,
});
export const INTENSITY_DECAY_PER_BAR = 0.99;
export const BUILD_INTENSITY = 0.55;
export const RELEASE_INTENSITY = 0.15;
export const VALLEY_INTENSITY = 0.2;
/** 08-Q7 default: story + peak beats per session before the machine goes quiet (bed lines exempt). */
export const STORY_BEAT_BUDGET = 12;
export const PEAKS_PER_SESSION = 1;

// ── anti-repetition (research §1.9, the 8 rules) ─────────────────────────────────────────────────────────────
/** The cleverest forms fire at most this often when drawn (rule 3, L4D's ~10%). */
export const CLEVER_GATE = 0.1;
/** Bars before the same topic may carry another story beat (rule 4, topic level). */
export const TOPIC_COOLDOWN_BARS = 96;
/** Bars between bed verdict-notes (the floor may repeat, not chatter). */
export const NOTE_COOLDOWN_BARS = 8;
/** Beat forms per kind. A form is a way of telling it, not a line: the referent fills it (rule 5).
 * 'onthisday' (S4) is the lore cold open: its pattern is seeded by the driver from the lore bank, its
 * referent is a lore entry id — this module stays free of the bank itself; it only knows the shape. */
export const BEAT_FORMS = Object.freeze({
  callback: Object.freeze(['last-ending', 'debt', 'grudge', 'onthisday']),
  grudge: Object.freeze(['name-it', 'with-count']),
  streak: Object.freeze(['name-it', 'with-count']),
  reversal: Object.freeze(['noted', 'dry']),
  misread: Object.freeze(['stale', 'perceptive']),
  note: Object.freeze(['plain', 'with-count', 'dry']),
});
/** Forms gated as clever (rule 3). */
export const CLEVER_FORMS = Object.freeze({ reversal: 'dry', misread: 'perceptive', note: 'dry' });

// ── the suspicion arc (02 + research §1.8): internal only — no view of this module exposes it ────────────────
/** Certainty is unreachable by construction: increments shrink toward this cap and never pass it. */
export const SUSPICION_CAP = 85;
/** One increment's full-size step, before the asymptotic shrink. */
export const SUSPICION_STEP = 6;
/** Milestone beats arm at these crossings, each with its mundane exit. */
export const SUSPICION_MILESTONES = Object.freeze([20, 40, 60, 80]);
/** The milestone's form: how the noticing is phrased at that depth (§1.8.4). */
export const MILESTONE_FORMS = Object.freeze({ 20: 'joke', 40: 'citation', 60: 'half-theory', 80: 'too-quick' });
/** Increments are rationed in sessions, never bars (§1.8.6). */
export const SUSPICION_SESSION_GAP = 3;
/** Firing a milestone beat talks the persona back down this far — and no further than the last milestone's floor. */
export const MILESTONE_TALKDOWN = 5;
/** Suspicion beats exist only for a persona at this engagement tier or above (§1.8.3). */
export const SUSPICION_TIER = 3;
/** Internal stage names (08-Q4): derived from the value, never surfaced, never a resolution. */
export const SUSPICION_STAGES = Object.freeze(['dismissal', 'noticing', 'patterns', 'theories', 'vigilance']);

const clamp = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const clamp100 = (v) => clamp(v, -100, 100);
const topicOf = (t) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, 40) : null);

// ── the book: everything that persists across sessions ───────────────────────────────────────────────────────
export function createStoryBook() {
  return {
    sessions: 0,
    esteem: { mood: 0, standing: 0 }, // the judge's regard for the generator (directed; §1.6.2)
    trust: { mood: 0, standing: 0 }, // the generator's trust in the judge (≠ the reverse)
    believed: { davis: { esteem: 0, trust: 0 }, lois: { esteem: 0, trust: 0 } }, // each one's last taken-stock read
    topics: {}, // topic -> { praise, blame }: the verdict history a grudge is about
    grudges: [], // { topic, count, promoted, lastFiredSession }: records, not moods (§1.6.4)
    suspicion: { value: 0, lastIncrementSession: null, anomalySeq: 0, anomalies: [], pending: null }, // anomalies: { id, kind, session, bar, witness }; pending: an armed milestone { at, witness }
    lastLean: null, // { mood, sig }: the third's last recorded lean, for lean-shift verification
    bags: {}, // kind -> [forms remaining]: the shuffle-bags' persistent seen flags (rule 1)
  };
}

const num = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Fail-closed decode (mindEngage's pattern): a malformed section starts that section fresh, never the whole book. */
export function decodeStoryBook(raw) {
  const book = createStoryBook();
  let o;
  try {
    o = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return book;
  }
  if (!o || o.v !== 1) return book;
  if (Number.isInteger(o.s) && o.s >= 0) book.sessions = o.s;
  const pair = (a) => (Array.isArray(a) && a.length === 2 ? [num(a[0], -100, 100), num(a[1], -100, 100)] : null);
  const e = pair(o.e);
  if (e) book.esteem = { mood: e[0] ?? 0, standing: e[1] ?? 0 };
  const t = pair(o.t);
  if (t) book.trust = { mood: t[0] ?? 0, standing: t[1] ?? 0 };
  if (o.b && typeof o.b === 'object') {
    for (const p of ['davis', 'lois']) {
      const b = pair(o.b[p === 'davis' ? 'd' : 'l']);
      if (b) book.believed[p] = { esteem: b[0] ?? 0, trust: b[1] ?? 0 };
    }
  }
  if (o.topics && typeof o.topics === 'object' && !Array.isArray(o.topics)) {
    for (const [k, v] of Object.entries(o.topics).slice(0, 24)) {
      const topic = topicOf(k);
      if (
        topic &&
        Array.isArray(v) &&
        v.length === 2 &&
        Number.isInteger(v[0]) &&
        Number.isInteger(v[1]) &&
        v[0] >= 0 &&
        v[1] >= 0
      ) {
        book.topics[topic] = { praise: v[0], blame: v[1] };
      }
    }
  }
  if (Array.isArray(o.g)) {
    for (const g of o.g.slice(0, 12)) {
      if (!Array.isArray(g) || g.length !== 4) continue;
      const topic = topicOf(g[0]);
      if (
        topic &&
        Number.isInteger(g[1]) &&
        g[1] > 0 &&
        (g[2] === 0 || g[2] === 1) &&
        (g[3] === null || Number.isInteger(g[3]))
      ) {
        book.grudges.push({ topic, count: g[1], promoted: g[2] === 1, lastFiredSession: g[3] });
      }
    }
  }
  if (o.sus && typeof o.sus === 'object') {
    const v = num(o.sus.v, 0, SUSPICION_CAP);
    if (v !== null) book.suspicion.value = v;
    if (o.sus.l === null || Number.isInteger(o.sus.l)) book.suspicion.lastIncrementSession = o.sus.l;
    if (Number.isInteger(o.sus.n) && o.sus.n >= 0) book.suspicion.anomalySeq = o.sus.n;
    if (Array.isArray(o.sus.a)) {
      for (const a of o.sus.a.slice(-40)) {
        if (
          Array.isArray(a) &&
          a.length === 5 &&
          Number.isInteger(a[0]) &&
          (a[1] === 'f' || a[1] === 'l') &&
          Number.isInteger(a[2]) &&
          Number.isInteger(a[3]) &&
          (a[4] === 'd' || a[4] === 'l')
        ) {
          book.suspicion.anomalies.push({
            id: a[0],
            kind: a[1] === 'f' ? 'flip' : 'lean',
            session: a[2],
            bar: a[3],
            witness: a[4] === 'd' ? 'davis' : 'lois',
          });
        }
      }
    }
    if (
      Array.isArray(o.sus.p) &&
      o.sus.p.length === 2 &&
      SUSPICION_MILESTONES.includes(o.sus.p[0]) &&
      (o.sus.p[1] === 'd' || o.sus.p[1] === 'l')
    ) {
      book.suspicion.pending = { at: o.sus.p[0], witness: o.sus.p[1] === 'd' ? 'davis' : 'lois' };
    }
  }
  if (o.ll && typeof o.ll === 'object' && typeof o.ll.m === 'string' && typeof o.ll.s === 'string') {
    book.lastLean = { mood: o.ll.m, sig: o.ll.s };
  }
  if (o.bags && typeof o.bags === 'object' && !Array.isArray(o.bags)) {
    for (const [kind, forms] of Object.entries(o.bags)) {
      if (BEAT_FORMS[kind] && Array.isArray(forms)) {
        const clean = forms.filter((f) => BEAT_FORMS[kind].includes(f));
        if (clean.length) book.bags[kind] = clean;
      }
    }
  }
  return book;
}

/** The book as the string to save. Compact; the third persona is never named in it (anomalies store a witness initial). */
export function encodeStoryBook(book) {
  const pair = (s) => [Math.round(s.mood * 100) / 100, Math.round(s.standing * 100) / 100];
  return JSON.stringify({
    v: 1,
    s: book.sessions,
    e: pair(book.esteem),
    t: pair(book.trust),
    b: {
      d: [book.believed.davis.esteem, book.believed.davis.trust],
      l: [book.believed.lois.esteem, book.believed.lois.trust],
    },
    topics: Object.fromEntries(Object.entries(book.topics).map(([k, v]) => [k, [v.praise, v.blame]])),
    g: book.grudges.map((g) => [g.topic, g.count, g.promoted ? 1 : 0, g.lastFiredSession]),
    sus: {
      v: Math.round(book.suspicion.value * 100) / 100,
      l: book.suspicion.lastIncrementSession,
      n: book.suspicion.anomalySeq,
      a: book.suspicion.anomalies.map((a) => [
        a.id,
        a.kind === 'flip' ? 'f' : 'l',
        a.session,
        a.bar,
        a.witness === 'davis' ? 'd' : 'l',
      ]),
      p: book.suspicion.pending
        ? [book.suspicion.pending.at, book.suspicion.pending.witness === 'davis' ? 'd' : 'l']
        : null,
    },
    ll: book.lastLean ? { m: book.lastLean.mood, s: book.lastLean.sig } : null,
    bags: book.bags,
  });
}

// ── the episode: one session's shape (never persisted) ───────────────────────────────────────────────────────
/**
 * A fresh episode for the book's current session. `ledgerPatterns` are the driver's session-start sift of the
 * keeps/passes ledgers (debts, palette streaks, the last ending); any promoted grudge in the book also enters
 * as a callback-able pattern.
 */
export function createEpisode(book, ledgerPatterns = []) {
  const ep = {
    session: book.sessions,
    phase: 'callback',
    phaseEpoch: 0,
    bar: 0,
    intensity: 0,
    peakFired: false,
    callbackFired: false,
    storyBeats: 0,
    patterns: [],
    topicCool: {},
    phaseMoves: new Set(),
    lastBeatBar: -Infinity,
    lastNoteBar: -Infinity,
    lastActor: null,
    lastVerdict: null,
    verdictRun: null,
    lastWorkSeq: -1,
    seq: 0,
    lastVerdictByTopic: {},
    freshVerdict: null,
    misread: null,
    truce: null,
    lastRoomVerdict: null,
  };
  for (const p of Array.isArray(ledgerPatterns) ? ledgerPatterns : []) {
    if (p && typeof p.kind === 'string') ep.patterns.push({ ...p, fresh: true });
  }
  for (const g of book.grudges) {
    if (g.promoted) ep.patterns.push({ kind: 'grudge', topic: g.topic, count: g.count, fresh: true, opening: true });
  }
  return ep;
}

const setPhase = (ep, phase) => {
  if (ep.phase !== phase) {
    ep.phase = phase;
    ep.phaseEpoch++;
    ep.phaseMoves = new Set();
  }
};

const sift = (ep, pattern) => {
  const key = (p) => `${p.kind}|${p.topic || ''}|${p.seed ?? ''}`;
  const old = ep.patterns.find((p) => key(p) === key(pattern));
  if (old) Object.assign(old, pattern, { fresh: true });
  else {
    ep.patterns.push({ ...pattern, fresh: true });
    if (ep.patterns.length > 8) ep.patterns.splice(0, ep.patterns.length - 8);
  }
  if (ep.phase === 'working') setPhase(ep, 'build'); // a sifted pattern is the build knocking (§1.7)
};

/** The witness's held evidence: the anomaly ids they personally saw (the split of §02 / §1.8.4). */
export function evidenceOf(book, persona) {
  return book.suspicion.anomalies.filter((a) => a.witness === persona).map((a) => a.id);
}

/** The arc's internal stage (08-Q4): derived, named only here, never a resolution. */
export function suspicionStage(book) {
  const v = book.suspicion.value;
  let i = 0;
  for (const m of SUSPICION_MILESTONES) if (v >= m) i++;
  return SUSPICION_STAGES[i];
}

// ── anomalies: the only things that move the arc, each verifiable from the record itself ─────────────────────
function noteAnomaly(book, ep, kind, witness, bar) {
  const s = book.suspicion;
  const anomaly = { id: ++s.anomalySeq, kind, session: book.sessions, bar, witness };
  s.anomalies.push(anomaly);
  if (s.anomalies.length > 40) s.anomalies.splice(0, s.anomalies.length - 40);
  // rationed in sessions: an increment lands at most once per SUSPICION_SESSION_GAP sessions
  if (s.lastIncrementSession !== null && book.sessions - s.lastIncrementSession < SUSPICION_SESSION_GAP) return anomaly;
  const before = s.value;
  s.value = Math.min(SUSPICION_CAP, s.value + (SUSPICION_STEP * (SUSPICION_CAP - s.value)) / SUSPICION_CAP);
  s.lastIncrementSession = book.sessions;
  // a crossed milestone arms its beat for the persona who holds this anomaly's evidence — in the BOOK, not the
  // episode: if it cannot fire this session (the peak is spent, the tier is not earned) it stays armed (§1.8.6)
  for (const m of SUSPICION_MILESTONES) {
    if (before < m && s.value >= m) s.pending = { at: m, witness };
  }
  return anomaly;
}

// ── the fold: one distilled event into book + episode ────────────────────────────────────────────────────────
export function applyStoryEvent(book, ep, ev) {
  if (!ev || typeof ev.kind !== 'string') return;
  if (ev.kind === 'bar') {
    ep.bar = Number.isInteger(ev.bar) ? ev.bar : ep.bar + 1;
    book.esteem.mood *= MOOD_DECAY_PER_BAR;
    book.trust.mood *= MOOD_DECAY_PER_BAR;
    ep.intensity = Math.max(0, ep.intensity * INTENSITY_DECAY_PER_BAR);
    if (ep.phase === 'peak') setPhase(ep, 'release');
    else if (ep.phase === 'release' && ep.intensity < RELEASE_INTENSITY) setPhase(ep, 'working');
    else if (ep.phase === 'build' && ep.intensity < VALLEY_INTENSITY) setPhase(ep, 'working'); // the valley is read off intensity alone — a pattern merely waiting out a cooldown must not pin the build open
    return;
  }
  ep.seq++;
  if (Number.isInteger(ev.bar)) ep.bar = ev.bar;
  const bump = (scalar, moodPts) => {
    scalar.mood = clamp100(scalar.mood + moodPts);
    scalar.standing = clamp100(scalar.standing + STORY_ALPHA * moodPts);
  };
  const takeStock = (p) => {
    book.believed[p] = { esteem: book.esteem.standing, trust: book.trust.standing };
  };
  // belief ≠ truth, caught in the act: a persona who moves while their last taken-stock read is far from the
  // true standing has acted on a misread — noted BEFORE their stock refreshes, or the moment erases itself
  const misreadCheck = (p) => {
    const b = book.believed[p];
    const gap = Math.max(Math.abs(b.esteem - book.esteem.standing), Math.abs(b.trust - book.trust.standing));
    if (gap >= MISREAD_THRESHOLD) ep.misread = { persona: p, gap };
  };
  const heat = (kind) => {
    ep.intensity = clamp(ep.intensity + (INTENSITY_WEIGHTS[kind] || 0), 0, 1);
  };

  switch (ev.kind) {
    case 'proposal': {
      ep.lastActor = 'davis';
      ep.lastWorkSeq = ep.seq;
      misreadCheck('davis');
      bump(book.trust, STORY_WEIGHTS.proposalTrust);
      takeStock('davis');
      heat('proposal');
      if (ep.phase === 'callback') setPhase(ep, 'working');
      break;
    }
    case 'route': {
      heat('route');
      break;
    }
    case 'verdict': {
      const topic = topicOf(ev.topic) || 'show';
      const delta = clamp(Number(ev.delta) || 0, -0.25, 0.25);
      ep.lastActor = 'lois';
      misreadCheck('lois');
      bump(book.esteem, delta * STORY_WEIGHTS.verdictEsteemPerDelta);
      takeStock('lois');
      heat('verdict');
      ep.freshVerdict = { topic, delta, bar: ep.bar };
      const t = (book.topics[topic] ||= { praise: 0, blame: 0 });
      if (delta >= PRAISE_DELTA) t.praise++;
      else if (delta <= OFFENCE_DELTA) t.blame++;
      // grudges are records: an offence on a topic counts; praise on the same topic is its forgiveness condition
      if (delta <= OFFENCE_DELTA) {
        let g = book.grudges.find((x) => x.topic === topic);
        if (!g) {
          g = { topic, count: 0, promoted: false, lastFiredSession: null };
          book.grudges.push(g);
        }
        g.count++;
        if (g.count >= GRUDGE_PROMOTE_AT && !g.promoted) {
          g.promoted = true;
          sift(ep, { kind: 'promotion', topic });
          heat('promotion');
        } else if (g.promoted) {
          sift(ep, { kind: 'grudge', topic, count: g.count, opening: false });
        }
      } else if (delta >= PRAISE_DELTA) {
        const g = book.grudges.find((x) => x.topic === topic);
        if (g) {
          g.count = Math.max(0, g.count - 1);
          if (g.count < GRUDGE_PROMOTE_AT) g.promoted = false;
          if (g.count === 0) book.grudges.splice(book.grudges.indexOf(g), 1);
        }
      }
      // streaks and reversals, sifted from the stream (§1.6.6)
      const prev = ep.lastVerdictByTopic[topic];
      if (prev && Math.sign(prev.delta) !== Math.sign(delta) && delta !== 0 && prev.delta !== 0) {
        sift(ep, { kind: 'reversal', topic });
        // a flip with no work between the two verdicts is ledger-verifiable — and not the artist's doing (§1.8.1)
        if (ep.lastWorkSeq <= prev.seq) noteAnomaly(book, ep, 'flip', 'davis', ep.bar);
      }
      ep.lastVerdictByTopic[topic] = { delta, seq: ep.seq };
      if (delta !== 0) {
        if (ep.verdictRun && ep.verdictRun.topic === topic && Math.sign(ep.verdictRun.delta) === Math.sign(delta))
          ep.verdictRun.count++;
        else ep.verdictRun = { topic, delta, count: 1 };
        if (ep.verdictRun.count >= 3)
          sift(ep, { kind: 'streak', topic, count: ep.verdictRun.count, sign: Math.sign(delta) });
      }
      ep.lastVerdict = { topic, delta };
      if (ep.phase === 'callback') setPhase(ep, 'working');
      break;
    }
    case 'crown': {
      ep.lastWorkSeq = ep.seq;
      bump(book.esteem, STORY_WEIGHTS.crownEsteem);
      bump(book.trust, STORY_WEIGHTS.crownTrust);
      heat('crown');
      if (ep.phase === 'callback') setPhase(ep, 'working');
      break;
    }
    case 'bloom': {
      ep.lastWorkSeq = ep.seq;
      bump(book.esteem, STORY_WEIGHTS.bloomEsteem);
      bump(book.trust, STORY_WEIGHTS.bloomTrust);
      heat('bloom');
      if (ep.phase === 'callback') setPhase(ep, 'working');
      break;
    }
    case 'keep': {
      ep.lastWorkSeq = ep.seq;
      bump(book.esteem, STORY_WEIGHTS.keepEsteem);
      bump(book.trust, STORY_WEIGHTS.keepTrust);
      heat('keep');
      break;
    }
    case 'room': {
      if (typeof ev.verdict === 'string' && ev.verdict && ev.verdict !== ep.lastRoomVerdict) {
        ep.lastRoomVerdict = ev.verdict;
        heat('room');
      }
      break;
    }
    case 'lean': {
      // the third's recorded lean: a sway fact on the record. It moves NO standing — she is not in the marriage's
      // books — and it is an anomaly only when it SHIFTS under an unchanged mood (she pushed differently while
      // the room she read stayed the same: verifiable from her own consecutive decisions, §1.8.1).
      const sig = Array.isArray(ev.keys) ? ev.keys.slice().sort().join('+') : '';
      if (sig) {
        const mood = typeof ev.mood === 'string' ? ev.mood : '';
        if (book.lastLean && book.lastLean.mood === mood && book.lastLean.sig !== sig) {
          noteAnomaly(book, ep, 'lean', ep.lastActor || 'davis', ep.bar);
        }
        book.lastLean = { mood, sig };
      }
      break;
    }
    default:
      break;
  }
  // a warmth crossing arms a truce (checked after every standing move)
  if (!ep.truce) {
    if (book.esteem.standing >= TRUCE_LINE) ep.truce = { scalar: 'esteem' };
    else if (book.trust.standing >= TRUCE_LINE) ep.truce = { scalar: 'trust' };
  }
  if (ep.phase === 'working' && ep.intensity >= BUILD_INTENSITY) setPhase(ep, 'build');
}

// ── beat selection: salience first, the 8 rules as gates, silence as a valid answer ──────────────────────────
function drawForm(book, kind, roll, fits) {
  const forms = BEAT_FORMS[kind];
  if (!forms) return null;
  let bag = book.bags[kind];
  if (!Array.isArray(bag) || !bag.length) {
    bag = forms.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(roll() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    book.bags[kind] = bag;
  }
  for (let i = bag.length - 1; i >= 0; i--) {
    const form = bag[i];
    if (fits && !fits(form)) continue;
    if (CLEVER_FORMS[kind] === form && roll() >= CLEVER_GATE) continue; // rule 3: the clever form usually stays holstered
    bag.splice(i, 1);
    return form;
  }
  return null;
}

const freshPattern = (ep, kind, topic) =>
  ep.patterns.find((p) => p.fresh && p.kind === kind && (topic === undefined || p.topic === topic));

/**
 * Choose the next beat, or null (silence — rule 8). Consumes what it fires: patterns go stale, bags draw down,
 * cooldowns arm. `tiers` is { davis, lois } engagement tiers (the milestone gate); `roll` is the caller's seeded
 * 0..1 source — the same (book, episode, tiers, rolls) always selects the same beat.
 */
export function selectStoryBeat(book, ep, { tiers = {}, roll = () => 0.5 } = {}) {
  if (ep.phase === 'peak') return null; // the peak is sounding; nothing talks over it
  const budgeted = ep.storyBeats < STORY_BEAT_BUDGET;
  const base = { phase: ep.phase, bar: ep.bar };
  const fire = (beat) => {
    ep.storyBeats += beat.cls === 'bed' ? 0 : 1;
    ep.lastBeatBar = ep.bar;
    ep.phaseMoves.add(beat.kind);
    if (beat.topic) ep.topicCool[beat.topic] = ep.bar + TOPIC_COOLDOWN_BARS;
    if (beat.cls === 'peak') {
      ep.peakFired = true;
      setPhase(ep, 'peak');
    }
    return beat;
  };
  const topicCool = (topic) => topic && ep.topicCool[topic] > ep.bar;
  const moveFree = (kind) => !ep.phaseMoves.has(kind);

  // ── peak class (build phase only; the session's ONE peak, §1.7) ──
  if (ep.phase === 'build' && !ep.peakFired && budgeted) {
    const promo = freshPattern(ep, 'promotion');
    if (promo && moveFree('promotion')) {
      promo.fresh = false;
      return fire({
        ...base,
        kind: 'promotion',
        cls: 'peak',
        persona: 'lois',
        topic: promo.topic,
        referent: { topic: promo.topic },
      });
    }
    // a milestone loses the priority contest to a genuine peak (promotion, above) — §1.8.6
    const ms = book.suspicion.pending;
    if (ms && moveFree('milestone') && (tiers[ms.witness] || 0) >= SUSPICION_TIER) {
      book.suspicion.pending = null;
      // the mundane exit: fired, the persona talks themselves back down — never below the previous milestone's floor
      const floor = Math.max(0, ...SUSPICION_MILESTONES.filter((m) => m < ms.at));
      book.suspicion.value = Math.max(book.suspicion.value - MILESTONE_TALKDOWN, floor);
      return fire({
        ...base,
        kind: 'milestone',
        cls: 'peak',
        persona: ms.witness,
        form: MILESTONE_FORMS[ms.at],
        milestone: ms.at,
        mundaneExit: true,
        referent: { evidence: evidenceOf(book, ms.witness).slice(-3) },
      });
    }
  }

  // ── story class ──
  if (budgeted && ep.phase !== 'release') {
    if (ep.phase === 'callback' && !ep.callbackFired) {
      const streak = ep.patterns.find((p) => p.fresh && p.kind === 'streak' && p.paletteId);
      if (streak) {
        streak.fresh = false;
        ep.callbackFired = true;
        return fire({
          ...base,
          kind: 'callback',
          cls: 'story',
          form: 'streak',
          persona: 'lois',
          referent: { paletteId: streak.paletteId, count: streak.count || 3 },
        });
      }
      const form = drawForm(book, 'callback', roll, (f) => !!freshPattern(ep, f));
      if (form) {
        const p = freshPattern(ep, form);
        if (p) {
          p.fresh = false;
          ep.callbackFired = true;
          return fire({
            ...base,
            kind: 'callback',
            cls: 'story',
            form,
            persona: form === 'grudge' ? 'lois' : 'davis',
            ...(p.topic ? { topic: p.topic } : {}),
            referent: {
              ...(p.seed !== undefined ? { seed: p.seed } : {}),
              ...(p.paletteId ? { paletteId: p.paletteId } : {}),
              ...(p.topic ? { topic: p.topic } : {}),
              ...(p.loreId ? { loreId: p.loreId } : {}),
            },
          });
        }
      }
    }
    if (moveFree('grudge')) {
      const p = freshPattern(ep, 'grudge');
      const g = p && book.grudges.find((x) => x.topic === p.topic && x.promoted);
      if (
        p &&
        g &&
        !p.opening &&
        (g.lastFiredSession === null || ep.session - g.lastFiredSession >= 1) &&
        !topicCool(p.topic)
      ) {
        const form = drawForm(book, 'grudge', roll);
        if (form) {
          p.fresh = false;
          g.lastFiredSession = ep.session;
          return fire({
            ...base,
            kind: 'grudge',
            cls: 'story',
            form,
            persona: 'lois',
            topic: p.topic,
            referent: { topic: p.topic, count: g.count },
          });
        }
      }
    }
    if (moveFree('streak')) {
      const p = freshPattern(ep, 'streak');
      if (p && p.topic && !topicCool(p.topic)) {
        const form = drawForm(book, 'streak', roll);
        if (form) {
          p.fresh = false;
          return fire({
            ...base,
            kind: 'streak',
            cls: 'story',
            form,
            persona: 'lois',
            topic: p.topic,
            referent: { topic: p.topic, count: p.count || 3 },
          });
        }
      }
    }
    if (moveFree('reversal')) {
      const p = freshPattern(ep, 'reversal');
      if (p && p.topic && !topicCool(p.topic)) {
        const form = drawForm(book, 'reversal', roll);
        if (form) {
          p.fresh = false;
          return fire({
            ...base,
            kind: 'reversal',
            cls: 'story',
            form,
            persona: 'davis',
            topic: p.topic,
            referent: { topic: p.topic },
          });
        }
      }
    }
    if (moveFree('misread') && ep.misread) {
      const form = drawForm(book, 'misread', roll);
      if (form) {
        const m = ep.misread;
        ep.misread = null;
        return fire({
          ...base,
          kind: 'misread',
          cls: 'story',
          form,
          persona: m.persona,
          referent: { gap: Math.round(m.gap) },
        });
      }
    }
  }
  if (budgeted && ep.truce && moveFree('truce')) {
    const truce = ep.truce;
    ep.truce = null;
    return fire({
      ...base,
      kind: 'truce',
      cls: 'story',
      persona: truce.scalar === 'esteem' ? 'lois' : 'davis',
      referent: { scalar: truce.scalar },
    });
  }

  // ── bed class: the functional floor (rule 6 — exempt from bags and the budget, not from manners) ──
  if (
    ep.freshVerdict &&
    (ep.phase === 'working' || ep.phase === 'build' || ep.phase === 'release') &&
    ep.bar - ep.lastNoteBar >= NOTE_COOLDOWN_BARS
  ) {
    const form = drawForm(book, 'note', roll) || 'plain'; // rule 6: the floor is never gated out of existence
    {
      const v = ep.freshVerdict;
      ep.freshVerdict = null;
      ep.lastNoteBar = ep.bar;
      return fire({
        ...base,
        kind: 'note',
        cls: 'bed',
        form,
        persona: 'lois',
        topic: v.topic,
        referent: { topic: v.topic, delta: v.delta },
      });
    }
  }
  return null;
}

// ── distillation: a kc-voice/1 bus record → a story event, or null ───────────────────────────────────────────
/**
 * Pure. `bar` is the driver's current bar (records that carry no bar of their own are stamped with it).
 * Only facts the bus already carries become events (the S1 law): a governor shed, for instance, has no bus
 * record today, so it is honestly absent here until the bus carries it.
 */
export function storyEventFromRecord(event, p, bar = 0) {
  const at = p && Number.isInteger(p.bar) ? p.bar : bar;
  if (event === Events.MIND_DECISION) {
    if (!p || typeof p !== 'object') return null;
    const r = p.reply || {};
    if (p.persona === 'davis') {
      if (r.propose && typeof r.propose.assetId === 'string')
        return { kind: 'proposal', assetId: r.propose.assetId, bar: at };
      if (r.route) return { kind: 'route', bar: at };
      return null;
    }
    if (p.persona === 'lois') {
      if (r.critique && typeof r.critique.target === 'string' && Number.isFinite(r.critique.delta)) {
        return { kind: 'verdict', topic: r.critique.target, delta: r.critique.delta, bar: at };
      }
      if (r.state && r.state.id === 'BURN')
        return { kind: 'verdict', topic: 'show', delta: -0.25, burn: true, bar: at };
      return null;
    }
    // the third's decision: only her lean is story matter — her sway, on the record (never her name, never a line)
    if (r.lean && typeof r.lean === 'object') {
      const keys = Object.keys(r.lean).filter((k) => Number.isFinite(r.lean[k]));
      if (keys.length) return { kind: 'lean', keys, mood: typeof r.mood === 'string' ? r.mood : '', bar: at };
    }
    return null;
  }
  if (event === Events.DIRECTOR_ROOM) {
    return p && typeof p.verdict === 'string' && p.verdict ? { kind: 'room', verdict: p.verdict, bar } : null;
  }
  if (event === Events.DICE_CAST) {
    const n = p && Array.isArray(p.assetIds) ? p.assetIds.length : 0;
    return { kind: 'crown', n, bar };
  }
  if (event === Events.BLOOM) {
    return { kind: 'bloom', rolls: p && Number.isFinite(p.rolls) ? p.rolls : null, bar };
  }
  if (event === Events.KEEP_ADD) {
    const keep = p && p.keep;
    if (!keep || !Number.isFinite(Number(keep.seed))) return null;
    const paletteId =
      keep.config && keep.config.palette && typeof keep.config.palette.id === 'string' ? keep.config.palette.id : null;
    return { kind: 'keep', seed: Number(keep.seed) >>> 0, paletteId, bar };
  }
  if (event === Events.CLOCK_BAR) {
    return p && Number.isInteger(p.bar) ? { kind: 'bar', bar: p.bar } : null;
  }
  return null;
}

/** A new session: the count rises, fast mood resets, slow standing and every record carry over (§1.7). */
export function beginSession(book) {
  book.sessions++;
  book.esteem.mood = 0;
  book.trust.mood = 0;
  return book.sessions;
}

/**
 * The session-start sift of the artist's ledgers (research §1.6.6): debts (a seed passed, then later kept),
 * palette streaks at the tail, and the last ending to call back to. Rows are tasteLedger rows (seed, recipe,
 * timestamp); patterns come out in callback salience order.
 */
export function siftLedgers(keeps = [], passes = []) {
  const out = [];
  const passedAt = new Map();
  for (const p of Array.isArray(passes) ? passes : []) {
    if (p && Number.isInteger(p.seed) && typeof p.timestamp === 'string') {
      if (!passedAt.has(p.seed) || p.timestamp < passedAt.get(p.seed)) passedAt.set(p.seed, p.timestamp);
    }
  }
  for (const k of Array.isArray(keeps) ? keeps : []) {
    if (
      k &&
      Number.isInteger(k.seed) &&
      typeof k.timestamp === 'string' &&
      passedAt.has(k.seed) &&
      passedAt.get(k.seed) < k.timestamp
    ) {
      out.push({ kind: 'debt', seed: k.seed });
      break; // one debt is a callback; a list is a spreadsheet
    }
  }
  const ks = (Array.isArray(keeps) ? keeps : []).filter((k) => k && k.recipe && typeof k.recipe.paletteId === 'string');
  if (ks.length) {
    const last = ks[ks.length - 1];
    let run = 1;
    for (let i = ks.length - 2; i >= 0 && ks[i].recipe.paletteId === last.recipe.paletteId; i--) run++;
    if (run >= 3) out.push({ kind: 'streak', paletteId: last.recipe.paletteId, count: run });
    out.push({ kind: 'last-ending', seed: last.seed, paletteId: last.recipe.paletteId });
  }
  return out;
}
