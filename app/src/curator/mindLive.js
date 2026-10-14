// mindLive.js — #1462 Mind 1: the live driver. Once a bar each persona thinks about the room.
//
//   - every decision is published as `mind:decision` telemetry { persona, bar, backend, seed, invented, reply }
//   - a decision that asks the stage for something (a face state the room is not already showing, a line, a proposal,
//     a critique — mindContract.wantsStage) becomes a `mind:request` through emitOn('bar'), so it lands on the next
//     downbeat. The rules backend only ever reports the face the room already shows, so on rules alone nothing is
//     requested and the picture does not change; the faces' handling of a request arrives with Matt's design.
//   - `mind:status` { available, backend } says which backend is answering (for the dev panel; no UI announces it)
//   - while a take plays back the personas are muted: nothing thinks, and the take's own decisions are re-published
//     from its record (replayMindFrame), so a replay never calls a backend
import { on, emit, emitOn, Events } from '../composition/eventBus.js';
import { buildContext } from './mindContext.js';
import { createThinker } from './mindThinker.js';
import { PERSONAS, wantsStage, validateReply } from './mindContract.js';
import { createMindReplay, decisionOf } from './mindRecord.js';

let tap = null;
/** Observe every live decision: fn(decision, requested). One listener (or null); the take recorder uses it. */
export function setMindTap(fn) {
  tap = typeof fn === 'function' ? fn : null;
}

// latency telemetry only (never a decision input): the page's monotonic clock, 0 where there is none
const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : 0);
let system = null; // the answering model's identity, for the take's record
/** The model and system the current backend runs on, or null on the rules: { backend, model?, os? }. */
export function getMindSystem() {
  return system ? { ...system } : null;
}

/** A short stable hash of the context: mind:req names WHAT was asked without carrying it. */
export function contextHash(ctx) {
  const s = JSON.stringify(ctx);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const requestOf = (d) => ({ persona: d.persona, bar: d.bar, backend: d.backend, invented: d.invented, reply: d.reply });

/**
 * @param getSnapshot () => the plain object buildContext takes
 * @param getSeed     () => the document seed
 * @param model       optional { name?, ask(persona, context, { seed, bar }) => Promise<reply>, available() => boolean } —
 *                    the model backend: the Apple Intelligence helper (Mind 2, #1463, name 'apple'), or the ?debug=mind
 *                    demo (name 'demo'). Absent = rules only. The name is what the books record.
 * @param isReplaying () => boolean: a take is playing back (the personas are muted)
 * @returns stop()
 */
export function startMind({ getSnapshot, getSeed, model = null, isReplaying = () => false, log = () => {} }) {
  const name = model && model.name === 'demo' ? 'demo' : 'apple';
  const available = () => { try { return !!(model && model.available()); } catch { return false; } };
  // #1463 — every model ask is announced (mind:req) and every answer reported (mind:reply: the validated reply or
  // null, with its latency) whatever happens to it next; the thinker still decides whether it is used.
  const ask = (persona) => (context, meta) => {
    const t0 = now();
    emit(Events.MIND_REQ, { persona, bar: meta.bar, seed: meta.seed, contextHash: contextHash(context) }, { cause: 'mind' });
    const done = (reply, error) => {
      emit(Events.MIND_REPLY, { persona, bar: meta.bar, backend: name, latencyMs: Math.round(now() - t0), reply, ...(error ? { error } : {}) }, { cause: 'mind' });
    };
    return Promise.resolve()
      .then(() => model.ask(persona, context, meta))
      .then((raw) => { const v = validateReply(persona, raw); done(v, v ? null : 'malformed'); return raw; },
        (e) => { done(null, String(e && e.message ? e.message : e).slice(0, 120)); throw e; });
  };
  const thinkers = PERSONAS.map((persona) => createThinker({
    persona, log, available, backend: name,
    mind: model ? ask(persona) : null,
  }));
  let status = null;
  const publishStatus = () => {
    const up = available();
    let info;
    try { info = model && typeof model.info === 'function' ? model.info() : null; } catch { info = null; }
    const next = { available: up, backend: up ? name : 'rules', ...(up && info && info.model ? { model: info.model } : {}) };
    if (status && status.backend === next.backend) return;
    status = next;
    system = up ? { backend: name, ...(info && info.model ? { model: info.model } : {}), ...(info && info.os ? { os: info.os } : {}) } : null;
    emit(Events.MIND_STATUS, next, { cause: 'mind' });
  };
  publishStatus();
  const off = on(Events.CLOCK_BAR, (p) => {
    if (!p || !Number.isInteger(p.bar)) return;
    let replaying;
    try { replaying = !!isReplaying(); } catch { replaying = false; }
    if (replaying) return; // muted: the take's record speaks for the personas
    publishStatus();
    let ctx;
    try { ctx = buildContext(getSnapshot()); } catch { return; }
    const seed = ((Number(getSeed()) >>> 0) ^ Math.imul(p.bar + 1, 0x9e3779b1)) >>> 0; // the document seed, the bar
    for (const t of thinkers) {
      const d = t.onBar({ bar: p.bar, context: ctx, seed });
      if (!d) continue;
      const requested = wantsStage(d.persona, d.reply, ctx.room);
      emit(Events.MIND_DECISION, d, { cause: 'mind' });
      if (d.backend === 'rules') emit(Events.MIND_REPLY, { persona: d.persona, bar: d.bar, backend: 'rules', latencyMs: 0, reply: d.reply }, { cause: 'mind' });
      if (requested) emitOn('bar', Events.MIND_REQUEST, requestOf(d), { cause: 'mind' });
      if (tap !== null) { try { tap(d, requested); } catch { tap = null; } }
    }
  });
  return () => { off(); thinkers.forEach((t) => t.reset()); status = null; system = null; };
}

let replay = null; // { record, cursor }
/**
 * Playback: called once per played frame with the take's frame index and its `mind` record (seeked = the cursor
 * jumped). Re-publishes the decisions recorded up to that frame — and their requests, straight away (the take's
 * frame is already the downbeat it landed on). Nothing is asked of any backend.
 */
export function replayMindFrame(frame, record, { seeked = false } = {}) {
  if (!record) { replay = null; return 0; }
  if (!replay || replay.record !== record) replay = { record, cursor: createMindReplay(record) };
  if (seeked) { replay.cursor.seek(frame); }
  const rows = replay.cursor.step(frame);
  for (const row of rows) {
    const d = decisionOf(row);
    emit(Events.MIND_DECISION, d, { cause: 'replay' });
    if (row[6] === 1) emit(Events.MIND_REQUEST, requestOf(d), { cause: 'replay' });
  }
  return rows.length;
}

/** Leave playback: forget the replay cursor. */
export function endMindReplay() {
  replay = null;
}
