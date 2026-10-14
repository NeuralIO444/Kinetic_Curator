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
import { PERSONAS, wantsStage } from './mindContract.js';
import { createMindReplay, decisionOf } from './mindRecord.js';

let tap = null;
/** Observe every live decision: fn(decision, requested). One listener (or null); the take recorder uses it. */
export function setMindTap(fn) {
  tap = typeof fn === 'function' ? fn : null;
}

const requestOf = (d) => ({ persona: d.persona, bar: d.bar, backend: d.backend, invented: d.invented, reply: d.reply });

/**
 * @param getSnapshot () => the plain object buildContext takes
 * @param getSeed     () => the document seed
 * @param apple       optional { ask(persona, context, { seed, bar }) => Promise<reply>, available() => boolean } — the
 *                    Apple Intelligence helper (Mind 3, #1464). Absent = rules only.
 * @param isReplaying () => boolean: a take is playing back (the personas are muted)
 * @returns stop()
 */
export function startMind({ getSnapshot, getSeed, apple = null, isReplaying = () => false, log = () => {} }) {
  const available = () => { try { return !!(apple && apple.available()); } catch { return false; } };
  const thinkers = PERSONAS.map((persona) => createThinker({
    persona, log, available, backend: 'apple',
    mind: apple ? (context, meta) => apple.ask(persona, context, meta) : null,
  }));
  let status = null;
  const publishStatus = () => {
    const up = available();
    const next = { available: up, backend: up ? 'apple' : 'rules' };
    if (status && status.backend === next.backend) return;
    status = next;
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
      if (requested) emitOn('bar', Events.MIND_REQUEST, requestOf(d), { cause: 'mind' });
      if (tap !== null) { try { tap(d, requested); } catch { tap = null; } }
    }
  });
  return () => { off(); thinkers.forEach((t) => t.reset()); status = null; };
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
