// cultureRoomLive.js — CULTURE Phase 5, slice C: the live-audio → room bridge (the room door slice B left unfed).
//
// The dish's room is the same room the live gait's picker hears (curator/gaitLive.js), read off the
// same bus events from the existing audio and beat analysis — nothing new is analysed:
//
//   - audio:energy { level }            the envelope band (low | mid | high, with hysteresis)
//   - audio:silenceStart / silenceEnd   silence is `still`
//   - audio:input { source }            a new piece: the old reading is forgotten
//   - clock:beat / clock:bar { bpm }    the loop clock's tempo — the gait clock counts its beats
//
// Each change lands in the world through its one room door (engine/cultureWorld.mjs setCultureRoom), so the citizens
// wear their gaits on the beat. A reading that is not one (an unknown level, a tempo outside the door's bounds or not
// a number) is ignored, never forced into the door. The bridge is started ONLY by the gate's shell
// (hooks/useCultureWorld.js runCultureShell) while the gate is on, and stopped by its cleanup: gate off, nothing
// subscribes. It reads no clock and draws no die; the room is a pure function of the events heard, in order.
import { on, Events } from '../composition/eventBus.js';
import { setCultureRoom } from '../engine/cultureWorld.mjs';
import { CULTURE_ROOM_BPM } from '../engine/cultureGait.mjs';

/** The events the bridge listens to, in subscription order (pinned by the shell's suite). */
export const CULTURE_ROOM_EVENTS = Object.freeze([
  Events.AUDIO_ENERGY,
  Events.AUDIO_SILENCE_START,
  Events.AUDIO_SILENCE_END,
  Events.AUDIO_INPUT,
  Events.CLOCK_BEAT,
  Events.CLOCK_BAR,
]);

/**
 * Feed a world's room from the bus. `listen` is the bus's `on` (injectable for a suite); `setRoom` the world's door.
 * The room starts as the world's own (slice B's default: no reading, not silent, the default tempo) and changes only
 * when an event changes it. Returns stop() — every subscription undone.
 */
export function startCultureRoom(world, { listen = on, setRoom = setCultureRoom } = {}) {
  const room = { ...world.gait.room };
  const push = (next) => {
    if (next.energy === room.energy && next.silent === room.silent && next.bpm === room.bpm) return;
    Object.assign(room, next);
    setRoom(world, { ...room });
  };
  const tempo = (p) => {
    const bpm = p && p.bpm;
    if (typeof bpm === 'number' && Number.isFinite(bpm) && bpm >= CULTURE_ROOM_BPM.min && bpm <= CULTURE_ROOM_BPM.max)
      push({ ...room, bpm });
  };
  const handlers = [
    (p) => {
      if (p && (p.level === 'low' || p.level === 'mid' || p.level === 'high')) push({ ...room, energy: p.level });
    },
    () => push({ ...room, silent: 1 }),
    () => push({ ...room, silent: 0 }),
    () => push({ ...room, energy: null, silent: 0 }),
    tempo,
    tempo,
  ];
  const stops = CULTURE_ROOM_EVENTS.map((ev, k) => listen(ev, handlers[k]));
  return () => {
    for (const off of stops) if (typeof off === 'function') off();
  };
}
