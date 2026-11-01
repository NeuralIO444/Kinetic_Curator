// directorRoom.js — #1145 × Mind (2026-10-14 spec update): the room the Director is running, as a bus event.
//
// The Director (Left4Dead) used to tick silently at pick time; nothing else could see which room it was in. Each tick
// now publishes `director:room` — but only when the room CHANGED — so the personas' minds can think about the argument
// they are in. The payload is a readout: which room, how hot it runs, whether it is cooling down, the explore/refine
// phase. It carries NO gain, no temperature, no sway and no tilt: those stay inside the Director, off every surface and
// out of every log (DS rule 10 for her hand; rule 3 for the rest).
//
// The traffic is one-way. The Director reads the honest feed only; no mind (Apple, the rules, a future local MegaMind)
// ever moves a gain.
//
// FIELD (2026-10-31): poetId is included when a form is armed, null when silence. Still a readout only.
import { DIRECTORS_MATRIX } from './directorsMatrix.js';

/** Every verdict a room can carry (from the 20-room copy matrix). */
export const ROOM_VERDICTS = Object.freeze([
  ...new Set(Object.values(DIRECTORS_MATRIX).flatMap((row) => Object.values(row).map((r) => r.verdict))),
]);
/** How hot the room runs, as a band: the minds hear the band, never the number. */
export const INTENSITY_BANDS = Object.freeze(['low', 'mid', 'peak']);
/** Below this the room reads low; at the Director's peak (or its peak tick) it reads peak. */
export const LOW_BELOW = 0.35;
export const PEAK_AT = 0.85;
export const PHASES = Object.freeze(['explore', 'refine']);

/** The band for an intensity level and the Director's own phase ('build' | 'peak' | 'relax'). */
export function bandOf(level, directorPhase) {
  if (directorPhase === 'peak') return 'peak';
  const l = Number.isFinite(level) ? level : 0;
  if (l >= PEAK_AT) return 'peak';
  return l < LOW_BELOW ? 'low' : 'mid';
}

/**
 * The event payload for one tick: { verdict, n, lois, davis, intensity, relaxing, phase, poetId }. Silence (no room) has a null
 * verdict and room. poetId is null when no form is armed. Deliberately built field by field from the tick: nothing else can ride along.
 */
export function roomPayload(tick, phase = null) {
  const room = tick && tick.gains && tick.gains.room;
  const poet = tick && tick.poet;
  return {
    verdict: room && ROOM_VERDICTS.includes(room.verdict) ? room.verdict : null,
    n: room && Number.isInteger(room.n) ? room.n : null,
    lois: room && typeof room.lois === 'string' ? room.lois : null,
    davis: room && typeof room.davis === 'string' ? room.davis : null,
    intensity: bandOf(tick && tick.intensity, tick && tick.directorPhase),
    relaxing: !!(tick && tick.directorPhase === 'relax'),
    phase: PHASES.includes(phase) ? phase : null,
    poetId: poet && typeof poet.poetId === 'string' ? poet.poetId : null,
  };
}

/**
 * A publisher for the Director: publish(tick, phase) emits through `emit` only when the payload differs from the last
 * one it sent. `emit` is (payload) => void, injected so the Director module needs no bus of its own in tests.
 */
export function createRoomPublisher(emit) {
  let last = null;
  return function publish(tick, phase) {
    const p = roomPayload(tick, phase);
    const key = JSON.stringify(p);
    if (key === last) return false;
    last = key;
    try {
      emit(p);
    } catch {
      /* the bus must never take a pick down */
    }
    return true;
  };
}
