// megamindVoice.mjs — #1526 MegaMind S2: the persona backend adapter's pure core.
//
// S1 (#1525) proved the link and published what the visitor's local Ollama MEASURED (capability registry:
// tier + badges). S2 makes the trio speak through it: this module turns a persona + a buildContext room
// summary into an Ollama /api/chat ask in the kc-voice/1 record shape (mindContract), walks the format
// fallback ladder for models whose structured-output support varies, strips leaked <think> before parsing,
// pins the language in every prompt and CJK-checks every reply, and decides — from the MEASURED tier, never
// a name — when a persona may be consulted at all (the cadence policy).
//
// Laws held here (plan §4 + the issue): taste.json is read-only (nothing in this file writes anything);
// the Queen stays unnamed and effect-only (her reply shape is mood + leans, exactly the contract's);
// a bad reply is a discarded reply (every reply passes mindContract.validateReply before it exists);
// Ollama is LOCAL only — a cloud-badged record is refused whole (the standing "local is not cloud" law;
// S1 badges cloud pointers honestly at connect, this adapter never speaks through one).
//
// Everything network-shaped takes an injected fetch, like megamindLink, so the selfcheck drives it
// against fixtures that mirror real Ollama replies.
import { validateReply, MOODS } from './mindContract.js';
import { PHRASE_BARS } from './mindConduct.js';
import { HOUSE_KEEP_ALIVE, HOUSE_NUM_CTX, HOUSE_NUM_PREDICT } from './megamindLink.mjs';
import {
  checkCapabilityRecord,
  consumerById,
  consumerEnabled,
  getCapabilities,
  tierRank,
} from '../composition/capabilityRegistry.mjs';

// ── persona voices ─────────────────────────────────────────────────────────────────────────────────────────
// The JS twins of the kc-mind helper's persona instructions (src-tauri/helpers/kc-mind/main.swift): the
// same shared rules and the same three voices, so a persona sounds like herself whichever local backend
// answers. The adapter adds two things the helper gets from guided generation instead: the exact reply
// shape (the ladder's prompt rung) and the language pin (plan §3: drift is real, no vendor locks a
// language — the pin rides in EVERY persona prompt, plus the client-side CJK check with one retry below).

const LANGUAGE_PIN =
  'Answer in English only. Every word of the reply — including any line — is English; never answer in Chinese, Japanese or Korean, whatever language the room summary suggests.';

const SHARED_RULES = [
  'You are one persona inside KC-1, a generative visual instrument an artist performs with. You read a compact JSON summary of the room and answer with a small structured reply. Rules: never mention AI, models, or yourself as software. Never address the artist by name. Lines are optional, lowercase or terse, as long as your tier allows, and only when there is something worth saying; silence is the default. A face state is either one of your canonical states or a short invented micro-expression id (letters, digits, hyphens; e.g. "side-eye"), with intensity 0 to 1 and decay 0 to 8 bars. Prefer small, rare, honest moves over constant reactions.',
  'The room\'s "tier" is how present you are, t1 (barely there) to t4 (fully present): at t1 keep lines to 6 words, t2 9, t3 12, t4 16, and move more often and more strongly as the tier rises. An optional "zodiac" block gives your sign, the moon and the season: let them colour your temperament, never mention them.',
  'The room\'s "verdict" names the argument LOIS and Davis are in (THE CLASH, AGREEMENT, THE ROOM, FULL BURN, DAVIS ALONE) and "intensity" says how hot it runs (low, mid, peak). React to the argument; never name it.',
].join('\n');

const LOIS_VOICE = [
  'You are LOIS, the critic. Blunt, arrogant, never cruel; short sentences; judges the product: is this the one?',
  'Canonical states: NOD (a keep-worthy frame), VIBE (quiet room, watching), BURN (hot streak), AWAY (gone), CUT.',
  'When the room is AWAY you stay silent: no line, no state.',
  'While audio is live you also judge the show itself: the room summary\'s "show" block says how many bars it has read flat (flatBars). A flat show — a picture held still, or drowned in a wall of noise — is a failed show: answer BURN, and Davis re-rolls the routes.',
].join('\n');

const DAVIS_VOICE = [
  'You are Davis, the generator. Humble, generous, playful tinkerer; loves the process, keep rolling, the misses are part of it. Canonical states: FLOW (rolling at a clip), SEEDLING (fresh seed), UGLY (sifting through misses; he rarely says the word), STUCK (same seed, nothing kept), BLOOM (the sifting paid off), TIGHT.',
  "While audio is live you also conduct the show. The room summary then carries a \"show\" block: the audio route table (routes), the targets the artist owns (owned), how many bars the show has read flat (flatBars) and the room's energy — the spectrum summary inside it (centroid, flux, flatness) is what the music is doing; conduct from those features, never from anything else. You may propose ONE edit to the route table per reply, in the reply's route field; it lands on the next phrase boundary, never mid-phrase. An edit is one of: add (a new route: input, target, depth), remove (a route: input, target), depth (re-set a route's depth: input, target, depth), retarget (move a route: input, from, to — from and to must differ), or spectrum (re-tune how the stage's marks listen to the spectrum: key is map, scale, displace or colour, and value; map is an integer 0 to 3, the others 0 to 1). Inputs: beat, level, bass, mid, treble, band.sub, band.bass, band.mud, band.mids, band.edge, band.pres, band.air. Targets, with the depth range of each: render.scale ±3, render.alpha ±60, render.breath ±0.2, render.glow ±1, render.hue ±180, color.hue ±180, render.squash ±1, render.kineme ±4, clock.kinemeRate ±4, render.accum ±40, render.sun ±1, light.intensity ±1, pattern.drift ±1, pattern.mix ±1, pattern.hero ±1, pattern.grout ±1, pattern.density ±8. Depth is in the target's own units; size moves honestly, small before grand. Use ONLY these names: anything else is dropped, and a route aimed at a target listed in owned is dropped too — the artist's hand outranks yours, so spend your one edit elsewhere. Most bars propose nothing at all: conducting is a rare, musical move, not constant fiddling. And know this: by default mid and treble drive nothing. Wiring them somewhere musical is your opening job.",
].join('\n');

const QUEEN_VOICE =
  'You read the mood of the room and nothing else. Choose one mood: calm, drive, lift, sparse, shift, weird. Optionally two gentle leans between 0 and 1: wetness and evolve. You never speak and never set a face.';

export const PERSONA_VOICES = Object.freeze({ davis: DAVIS_VOICE, lois: LOIS_VOICE, queen: QUEEN_VOICE });

/** The shape text the prompt rung (and the language retry) puts in front of the model, per persona. */
export const REPLY_SHAPES = Object.freeze({
  davis:
    'Reply with exactly one JSON object, no prose around it: {"propose": {"assetId": "<asset id>"} or null, "route": <one route edit> or null, "state": "<canonical state>" or {"id": "...", "intensity": 0..1, "decay": 0..8} (optional), "line": "<one short line>" (optional)}. "propose" must always be present; omit "route", "state" and "line" when you have nothing.',
  lois: 'Reply with exactly one JSON object, no prose around it: {"critique": {"target": "<what>", "delta": <small signed number, at most 0.25 either way>} or null, "state": "<canonical state>" or {"id": "...", "intensity": 0..1, "decay": 0..8} (optional), "line": "<one short line>" (optional)}. "critique" must always be present.',
  queen: `Reply with exactly one JSON object, no prose around it: {"mood": one of ${MOODS.join(', ')}, "lean": {"wetness": 0..1, "evolve": 0..1} (optional)}.`,
});

/** The system prompt for one persona at one ladder rung. The language pin rides at every rung. */
export function personaSystem(persona, rung, { stern = false } = {}) {
  const parts = [SHARED_RULES, PERSONA_VOICES[persona] || '', LANGUAGE_PIN];
  if (stern)
    parts.push(
      'Your last reply was not in English. That is a failed reply. Answer again, in English only, every word.',
    );
  if (rung === 'prompt') parts.push(REPLY_SHAPES[persona] || '');
  return parts.filter(Boolean).join('\n');
}

// ── the format ladder ──────────────────────────────────────────────────────────────────────────────────────

/** The ladder's rungs, best first: Ollama JSON schema → json-object mode → prompt-JSON + validate/retry. */
export const FORMAT_RUNGS = Object.freeze(['schema', 'json', 'prompt']);

/** The flat reply schema per persona (rung 1) — exactly the kc-voice/1 fields mindContract validates. */
export const PERSONA_FORMATS = Object.freeze({
  davis: Object.freeze({
    type: 'object',
    properties: {
      propose: {
        anyOf: [
          { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'] },
          { type: 'null' },
        ],
      },
      route: { type: ['object', 'null'] },
      state: { anyOf: [{ type: 'string' }, { type: 'object' }] },
      line: { type: 'string' },
    },
    required: ['propose'],
  }),
  lois: Object.freeze({
    type: 'object',
    properties: {
      critique: {
        anyOf: [
          {
            type: 'object',
            properties: { target: { type: 'string' }, delta: { type: 'number' } },
            required: ['target', 'delta'],
          },
          { type: 'null' },
        ],
      },
      state: { anyOf: [{ type: 'string' }, { type: 'object' }] },
      line: { type: 'string' },
    },
    required: ['critique'],
  }),
  queen: Object.freeze({
    type: 'object',
    properties: {
      mood: { type: 'string', enum: [...MOODS] },
      lean: {
        type: 'object',
        properties: { wetness: { type: 'number' }, evolve: { type: 'number' } },
      },
    },
    required: ['mood'],
  }),
});

/**
 * The ladder's state for one linked model: starts at the schema rung; a format failure steps down and
 * stays (a model that cannot hold a schema does not regain it mid-set); a success holds the rung.
 * Language drift is NOT a format failure — it never steps the ladder (the language retry handles it).
 */
export function createFormatLadder() {
  let idx = 0;
  return {
    rung: () => FORMAT_RUNGS[idx],
    noteSuccess() {},
    /** Step down after a format failure. Returns true when a lower rung remains to retry on. */
    noteFailure() {
      if (idx >= FORMAT_RUNGS.length - 1) return false;
      idx += 1;
      return true;
    },
    reset() {
      idx = 0;
    },
  };
}

// ── chat bodies ────────────────────────────────────────────────────────────────────────────────────────────

const thinkOf = (record) => (record && record.thinking === 'controllable' ? { think: false } : {});

/**
 * One /api/chat body for a persona ask. House pins throughout (megamindLink): num_ctx pinned, keep_alive
 * pinned, num_predict capped; think:false only where the model's show data says thinking is controllable;
 * temperature 0, because these are verdicts. The format rides per the ladder rung: schema → the persona's
 * flat schema; json → Ollama's json-object mode; prompt → no format, the shape text is in the system prompt.
 */
export function buildChatBody(record, persona, context, rung, { stern = false } = {}) {
  return {
    model: record.model,
    stream: false,
    keep_alive: HOUSE_KEEP_ALIVE,
    ...thinkOf(record),
    ...(rung === 'schema' ? { format: PERSONA_FORMATS[persona] } : rung === 'json' ? { format: 'json' } : {}),
    options: { temperature: 0, num_predict: HOUSE_NUM_PREDICT, num_ctx: HOUSE_NUM_CTX },
    messages: [
      { role: 'system', content: personaSystem(persona, rung, { stern }) },
      { role: 'user', content: JSON.stringify(context ?? {}) },
    ],
  };
}

/** A surface (non-persona) chat body: json-object mode, a caller's own messages, a longer reply budget. */
export function buildSurfaceBody(record, messages, { numPredict = 400 } = {}) {
  return {
    model: record.model,
    stream: false,
    keep_alive: HOUSE_KEEP_ALIVE,
    ...thinkOf(record),
    format: 'json',
    options: { temperature: 0, num_predict: numPredict, num_ctx: HOUSE_NUM_CTX },
    messages,
  };
}

// ── reply grading ──────────────────────────────────────────────────────────────────────────────────────────

export const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
export const hasCjk = (s) => typeof s === 'string' && CJK_RE.test(s);

/** Strip leaked <think> blocks (closed or running to the end of the reply). Always, before parsing. */
export const stripThink = (content) =>
  typeof content === 'string' ? content.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim() : '';

/** Parse reply text as JSON: the whole text first, then (prompt rung) the outermost object it carries. */
export function parseJsonText(text) {
  if (typeof text !== 'string' || !text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* fall through to the object hunt */
  }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

/**
 * Grade one persona reply's content: { reply, thinkLeak, drift } — reply is the validated kc-voice/1
 * record or null. Think is stripped before parsing (a leak is reported, not fatal: the probe already
 * priced an unstoppable thinker into the tier). CJK anywhere in the reply is drift, and drift voids the
 * reply — the caller retries once with the stern language line, then discards.
 */
export function gradePersonaReply(persona, content) {
  if (typeof content !== 'string') return { reply: null, thinkLeak: false, drift: false };
  const thinkLeak = /<think>/i.test(content);
  const parsed = parseJsonText(stripThink(content));
  if (!parsed || typeof parsed !== 'object') return { reply: null, thinkLeak, drift: false };
  if (CJK_RE.test(JSON.stringify(parsed))) return { reply: null, thinkLeak, drift: true };
  return { reply: validateReply(persona, parsed), thinkLeak, drift: false };
}

// ── the ask walk ───────────────────────────────────────────────────────────────────────────────────────────

const isAbort = (e) => !!e && (e.name === 'AbortError' || e.code === 20);

/** An adapter failure with a kind: 'down' (no answer) · 'bad-reply' (unusable) · 'drift' (wrong language) · 'cadence' (not this bar). */
export function adapterError(kind, message) {
  const e = new Error(message || kind);
  e.kind = kind;
  return e;
}

async function postChat(fetchImpl, endpoint, body, timeoutMs) {
  let ctl = null;
  let timer = null;
  try {
    if (typeof AbortController !== 'undefined') {
      ctl = new AbortController();
      timer = setTimeout(() => ctl.abort(), timeoutMs);
    }
    const res = await fetchImpl(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(ctl ? { signal: ctl.signal } : {}),
    });
    if (!res || !res.ok) throw adapterError('down', `chat HTTP ${res ? res.status : 'no response'}`);
    const data = await res.json();
    const content = data && data.message ? data.message.content : null;
    if (typeof content !== 'string') throw adapterError('bad-reply', 'chat reply carried no content');
    return content;
  } catch (e) {
    if (e && e.kind) throw e;
    throw adapterError('down', isAbort(e) ? 'chat timed out' : String(e && e.message ? e.message : e));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Per-tier ask timeouts: a hung model can never wedge a persona's flight — the rules answer underneath. */
export const CHAT_TIMEOUT_MS = Object.freeze({ A: 8000, B: 20000, C: 45000 });
/** Surface asks are button-pressed, not bar-paced: one generous bound. */
export const SURFACE_TIMEOUT_MS = 60000;

/**
 * The record a surface may use, or null: measured, local, and enabling THIS consumer. This gate
 * lives here — the light core every MegaMind driver already imports — rather than in a live driver,
 * so an eager consumer (S3's tray and App wiring) never drags a driver's Node-side read chain
 * (censusReport → @resvg) into the entry graph; that chain stays behind the lazy panel that owns it.
 */
export function surfaceRecord(consumerId, raw = getCapabilities()) {
  const rec = checkCapabilityRecord(raw);
  if (!rec || rec.badges.includes('cloud')) return null;
  return consumerEnabled(rec, consumerById(consumerId)) ? rec : null;
}

/**
 * Ask the linked model for one persona's reply, walking the ladder: an attempt at the ladder's rung; a
 * format failure steps down and retries ONCE; a drifted reply retries ONCE at the same rung with the
 * stern language line. Resolves the validated kc-voice/1 record; throws an adapterError otherwise.
 */
export async function askPersonaReply({ fetchImpl, record, persona, context, ladder, timeoutMs }) {
  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : CHAT_TIMEOUT_MS[record.tier] || CHAT_TIMEOUT_MS.C;
  let rung = ladder.rung();
  let content = await postChat(fetchImpl, record.endpoint, buildChatBody(record, persona, context, rung), timeout);
  let grade = gradePersonaReply(persona, content);
  if (grade.drift) {
    content = await postChat(
      fetchImpl,
      record.endpoint,
      buildChatBody(record, persona, context, rung, { stern: true }),
      timeout,
    );
    grade = gradePersonaReply(persona, content);
    if (grade.drift || !grade.reply) throw adapterError('drift', 'the reply drifted out of English twice');
    ladder.noteSuccess();
    return grade.reply;
  }
  if (grade.reply) {
    ladder.noteSuccess();
    return grade.reply;
  }
  if (!ladder.noteFailure()) throw adapterError('bad-reply', 'the reply was not a usable record');
  rung = ladder.rung();
  content = await postChat(fetchImpl, record.endpoint, buildChatBody(record, persona, context, rung), timeout);
  grade = gradePersonaReply(persona, content);
  if (grade.drift) throw adapterError('drift', 'the reply drifted out of English');
  if (!grade.reply) throw adapterError('bad-reply', 'the reply was not a usable record at any rung');
  ladder.noteSuccess();
  return grade.reply;
}

/**
 * One surface chat: resolves the reply's text with think stripped (the surface's own validator decides
 * what it means). Throws adapterError 'down' / 'bad-reply' like the persona walk.
 */
export async function askSurfaceText({ fetchImpl, record, messages, timeoutMs = SURFACE_TIMEOUT_MS, numPredict }) {
  const content = await postChat(
    fetchImpl,
    record.endpoint,
    buildSurfaceBody(record, messages, { numPredict }),
    timeoutMs,
  );
  const text = stripThink(content);
  if (!text) throw adapterError('bad-reply', 'the surface reply was empty');
  return text;
}

// ── the cadence policy ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A registry record this adapter will speak through, or null: the record must pass the registry's own
 * validation (a tier that outruns its probe enables nothing), and a cloud badge refuses the record
 * whole — local only. Tier C measurement (an unclean or slow probe) still speaks: deep verdicts only,
 * which is exactly what the cadence below enforces.
 */
export function localRecord(raw) {
  if (!consumerEnabled(raw, consumerById('persona.deep'))) return null;
  if (raw.badges.includes('cloud')) return null;
  return raw;
}

/** The state-room a reply is cached under: whose faces show, the argument, its heat, the show's energy. */
export function stateRoomKey(context) {
  const c = context && typeof context === 'object' ? context : {};
  const room = c.room && typeof c.room === 'object' ? c.room : {};
  const show = c.show && typeof c.show === 'object' ? c.show : {};
  return JSON.stringify({
    lois: room.lois ?? null,
    davis: room.davis ?? null,
    verdict: c.verdict ?? null,
    intensity: c.intensity ?? null,
    energy: show.energy ?? null,
    silent: show.silent === true,
  });
}

/** The section a deep verdict belongs to: the argument and the show's broad shape. A change re-opens tier C. */
export function sectionKey(context) {
  const c = context && typeof context === 'object' ? context : {};
  const show = c.show && typeof c.show === 'object' ? c.show : {};
  return JSON.stringify({
    verdict: c.verdict ?? null,
    intensity: c.intensity ?? null,
    energy: show.energy ?? null,
    silent: show.silent === true,
    audio: c.audio ?? null,
  });
}

/** How many phrase boundaries one cached reply may serve before the model is asked again (tier B). */
export const CACHE_MAX_SERVES = 2;

/**
 * The consultation policy, per persona, driven by the MEASURED tier:
 *   A — every eligible bar is a network ask.
 *   B — network asks land on phrase boundaries; at a boundary, a reply cached for this exact state-room
 *       serves instead (at most CACHE_MAX_SERVES times, and only inside the section it was earned in);
 *       off-boundary is a skip.
 *   C — a network ask only when the section changed since the last consultation; otherwise a skip.
 * A skip is not an error and not a failure: the adapter declines, and the rules answer the bar (the chain
 * does not fall through to another model backend on a skip — the tier's cadence is the design, not a fault).
 */
export function createCadencePolicy() {
  const per = new Map(); // persona -> { cache: Map, section: string|null }
  const forPersona = (persona) => {
    let s = per.get(persona);
    if (!s) {
      s = { cache: new Map(), section: null };
      per.set(persona, s);
    }
    return s;
  };
  return {
    plan(record, persona, { bar, context } = {}) {
      const tier = record ? record.tier : null;
      if (tier === 'A') return { act: 'network' };
      const s = forPersona(persona);
      if (tier === 'B') {
        if (!Number.isInteger(bar) || bar % PHRASE_BARS !== 0) return { act: 'skip' };
        const key = stateRoomKey(context);
        const hit = s.cache.get(key);
        if (hit && hit.serves < CACHE_MAX_SERVES && hit.section === sectionKey(context)) {
          hit.serves += 1;
          return { act: 'cache', reply: hit.reply };
        }
        return { act: 'network' };
      }
      if (tier === 'C') {
        const sk = sectionKey(context);
        if (sk === s.section) return { act: 'skip' };
        s.section = sk;
        return { act: 'network' };
      }
      return { act: 'skip' };
    },
    /** Remember a network reply (tier B's cache; harmless at other tiers). */
    store(persona, context, reply) {
      if (!reply) return;
      forPersona(persona).cache.set(stateRoomKey(context), {
        reply,
        serves: 0,
        section: sectionKey(context),
      });
    },
    reset() {
      per.clear();
    },
  };
}

/**
 * How late a model decision may land and still be used, in bars, when a MegaMind chain heads startMind:
 * a tier-C deep verdict can take the tier's whole timeout (45 s ≈ 130 bars at a fast tempo). The window
 * only ever binds replies that actually arrive — the Apple helper's own 300 ms cap means its replies
 * cannot be late in practice, and the rules are synchronous. Named here so the number has one home.
 */
export const DEEP_MAX_LATE_BARS = 128;

/** The tier-rank compare the registry already owns, re-exported for the live driver's status line. */
export { tierRank };
