// spinFollow.mjs — ROTATE SPIN keeps time with the music (Matt, 2026-10-14: "can the Queen, the vibe, the beat determine
// rotation speed?" -> the beat, plus her mood leaning it).
//
// The ROTATE SPIN dial is the speed (rev/s) at 120 BPM. With FOLLOW on, the spin's own clock runs at
//     tempo ratio (BEAT BPM / 120)  x  the Queen's mood lean
// eased over a couple of seconds, clamped to a gentle range, so a faster beat spins faster and a calm room turns slower,
// and a tempo or mood change is a glide, never a jump. Pure: a function of its inputs and the loop's own dt (no wall
// clock). Off (or no tempo) is exactly 1, so every scene that does not opt in renders exactly as it did.
//
// The mood is her `mood` reply (calm, drive, lift, sparse, shift, weird): an invisible lean, never surfaced. A take
// re-publishes her recorded decisions, so a replay hears the same moods.
export const SPIN_FOLLOW_MODES = Object.freeze(['off', 'beat']);
/** The BPM at which the dial's rev/s is exact. */
export const NOMINAL_BPM = 120;
/** How the room's mood leans the speed (1 = none). Gentle: about -15% to +20%. */
export const MOOD_LEAN = Object.freeze({ calm: 0.85, sparse: 0.85, shift: 1, weird: 1, lift: 1.1, drive: 1.2 });
/** The follow multiplier never leaves this range: a 40 BPM drone and a 220 BPM burst both stay watchable. */
export const SPIN_MUL_MIN = 0.4;
export const SPIN_MUL_MAX = 2.5;
/** Time constant of the glide, in loop milliseconds. */
export const SPIN_EASE_MS = 2500;

/** The multiplier the beat and mood ask for right now (1 when follow is off or the tempo is unusable). */
export function spinTarget({ follow, bpm, mood } = {}) {
  if (follow !== 'beat') return 1;
  const tempo = Number.isFinite(bpm) && bpm > 0 ? bpm / NOMINAL_BPM : 1;
  const lean = Object.prototype.hasOwnProperty.call(MOOD_LEAN, mood) ? MOOD_LEAN[mood] : 1;
  return Math.min(SPIN_MUL_MAX, Math.max(SPIN_MUL_MIN, tempo * lean));
}

/** The glide: one per live loop. step(dtMs, target) -> the multiplier to run the spin clock at this frame. */
export function createSpinFollow() {
  let cur = 1;
  return {
    step(dtMs, target) {
      const t = Number.isFinite(target) ? target : 1;
      const dt = Number.isFinite(dtMs) ? Math.min(250, Math.max(0, dtMs)) : 0; // a stalled tab must not slam it
      cur += (1 - Math.exp(-dt / SPIN_EASE_MS)) * (t - cur);
      return cur;
    },
    reset() { cur = 1; },
  };
}

// The room's mood, as a module holder (like motionTap): published by curator/spinMoodLive.js, read by the live loop.
let mood = null;
export function setSpinMood(m) { mood = typeof m === 'string' ? m : null; }
export function getSpinMood() { return mood; }
