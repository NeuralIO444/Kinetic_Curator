// gestureRecord.mjs — #1802 (narrowed 2026-10-28): a take carries its ACCUM gestures, so playback re-fires them.
//
// FREEZE / CLEAR / SWELL (DavisPanel PERFORM row, MIDI) travel the bus as Events.ACCUM_GESTURE and land on the
// live loop's ACCUM session — beside the resolver, never inside it. The take recorder's taps see resolver inputs
// and outputs only, and no section carried the gestures, so a recorded freeze left zero trace in the file and
// playback ran the take's frames with today's loop state instead (proven by probe, 2026-10-28: four gestures
// fired mid-take, the finished take held none of them, replay verified clean without them). This records the
// gesture stream by frame — the route section's shape — and playback (playback.mjs) re-emits each event on the
// bus at its frame, so the SAME path that applies a live press applies the take's: CanvasPanel's subscriber,
// the loop methods, the Davis button mirror. No parallel implementation.
//
// THE LOG WINS like the other take sections: while a take plays, its recorded freeze state is the authority —
// playback asserts it when the take loads and whenever a seek lands, because a seek skips the frames whose
// events would have set it. A take without the section (recorded before it existed) plays exactly as before.
// Deliberate takes only, like the other sections: the retro ring carries none.
//
// Playback's own re-emissions are stamped with the bus envelope's cause 'playback', and the recorder ignores
// that cause: a take can never record its own playback. When playback stops, the take's last freeze state
// stands in the loop (the Davis button mirror stayed in sync through the bus, so what the artist sees is the
// state they are in) — the next live press continues from there.

export const GESTURE_RECORD_VERSION = 1;
/** Gestures are hand-fired (or conducted): a few a minute in a wild set. Far above any real take. */
export const GESTURE_RECORD_MAX = 2000;

const ACTIONS = new Set(['freeze', 'clear', 'swell']);

/**
 * A bus payload as a recordable gesture: ['freeze', bool] | ['clear'] | ['swell'], or null for anything else.
 * The same read CanvasPanel makes (freeze takes its value, the others are momentary), tightened to a whitelist.
 */
function gestureOf(p) {
  if (!p || typeof p !== 'object' || !ACTIONS.has(p.action)) return null;
  return p.action === 'freeze' ? ['freeze', !!p.value] : [p.action];
}

/**
 * Recorder. `getFrame()` returns the take's current frame index. Feed it every ACCUM_GESTURE off the bus
 * (payload and the bus's meta): `initial` is the loop's frozen state when the take begins (read from the loop
 * itself, the one truth — the bus carries changes, not state).
 */
export function createGestureRecorder({ initial = false, getFrame = () => 0 } = {}) {
  const start = !!initial;
  let frozen = start;
  let lastFrame = 0;
  const events = []; // [frame, action] | [frame, 'freeze', bool]
  return {
    push(p, meta) {
      if (meta && meta.cause === 'playback') return; // a take never records its own playback
      const g = gestureOf(p);
      if (!g) return;
      if (g[0] === 'freeze') {
        if (g[1] === frozen) return; // no change is not an event (the routes rule)
        frozen = g[1];
      }
      if (events.length >= GESTURE_RECORD_MAX) return;
      const f = Math.max(lastFrame, getFrame() | 0); // frames only advance; a record never runs backwards
      lastFrame = f;
      events.push([f, ...g]);
    },
    finish() {
      return { version: GESTURE_RECORD_VERSION, initial: start, events: events.map((e) => [...e]) };
    },
  };
}

/** Fail-closed shape check: the record, or null. */
export function checkGestureRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (r.version !== GESTURE_RECORD_VERSION) return null;
  if (typeof r.initial !== 'boolean') return null;
  if (!Array.isArray(r.events) || r.events.length > GESTURE_RECORD_MAX) return null;
  let prev = -1;
  for (const e of r.events) {
    if (!Array.isArray(e) || e.length < 2 || e.length > 3) return null;
    if (!Number.isInteger(e[0]) || e[0] < prev) return null; // frames never go backwards
    if (!ACTIONS.has(e[1])) return null;
    if (e[1] === 'freeze' ? e.length !== 3 || typeof e[2] !== 'boolean' : e.length !== 2) return null;
    prev = e[0];
  }
  return r;
}

/** The freeze state in force at `frame`: the take's starting state, folded with every freeze up to it. */
export function frozenAt(record, frame) {
  let frozen = record.initial;
  for (const e of record.events) {
    if (e[0] > frame) break;
    if (e[1] === 'freeze') frozen = e[2];
  }
  return frozen;
}
