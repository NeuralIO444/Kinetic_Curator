// spinMoodLive.js — the Queen's mood, handed to ROTATE SPIN's follow (gl/spinFollow.mjs). Listens to her decisions on the
// bus (live, or re-published from a take's record, so a replay hears the same moods) and keeps the latest mood in the
// module holder the live loop reads. A lean only: nothing surfaces it, and it never asks the stage for anything.
import { on, Events } from '../composition/eventBus.js';
import { setSpinMood } from '../gl/spinFollow.mjs';

/** @returns stop() */
export function startSpinMood() {
  const off = on(Events.MIND_DECISION, (d) => {
    if (d && d.persona === 'queen' && d.reply && typeof d.reply.mood === 'string') setSpinMood(d.reply.mood);
  });
  return () => { off(); setSpinMood(null); };
}
