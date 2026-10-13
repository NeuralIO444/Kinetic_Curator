// sourceArbiter.mjs — #1475: who is driving the bands right now. One small pure state machine.
//
//   ambient  nothing but the always-alive motion and the metro's own breath
//   set      her beats are playing (after a while with nothing happening)
//   audio    real audio (mic or file) has the bands
//
// Rules (Matt, 2026-10-13): after IDLE_MS with nothing happening and no real audio, the set fades IN over two bars.
// When the artist acts, or real audio arrives, it YIELDS: a short crossfade over two bars, then only what is left.
// Each stage only adds: unplug the mic and she is back; stop touching things and it is ambiance.
//
// Pure: the same (time, idle, audio level) sequence gives the same weights. Time is the loop clock.

export const IDLE_MS = 60 * 1000; // "a while": shorter than LOIS's AWAY (5 min), so she is already in when he leaves
export const FADE_BARS = 2;
export const MIN_FADE_MS = 1500; // a very fast tempo still gets a visible crossfade
export const SOUND_ON = 0.05; // real audio is "there" above this smoothed level
export const SOUND_OFF = 0.025; // and gone below this (hysteresis)
const LEVEL_EMA = 0.1;

export function createSourceArbiter() {
  let last = null; // loop ms at the last update
  let mix = 0; // the set's weight 0..1
  let level = 0; // smoothed real audio level
  let audio = false;
  return {
    /**
     * @param t         loop ms
     * @param idleMs    how long since the artist last did anything
     * @param level01   the overall level of the REAL audio (0 when off)
     * @param barMs     a bar in ms at the current BPM (the fade is two bars)
     * @returns { mix, source: 'ambient' | 'set' | 'audio', audio }
     */
    update(t, idleMs, level01, barMs) {
      const dt = last === null ? 0 : Math.max(0, Math.min(1000, t - last));
      last = Number.isFinite(t) ? t : last;
      level += LEVEL_EMA * ((Number.isFinite(level01) ? level01 : 0) - level);
      if (!audio && level > SOUND_ON) audio = true;
      else if (audio && level < SOUND_OFF) audio = false;
      const want = !audio && Number.isFinite(idleMs) && idleMs >= IDLE_MS ? 1 : 0;
      const fade = Math.max(MIN_FADE_MS, FADE_BARS * (Number.isFinite(barMs) ? barMs : 2000));
      const step = dt / fade;
      mix = want > mix ? Math.min(want, mix + step) : Math.max(want, mix - step);
      const source = audio ? 'audio' : mix > 0.02 ? 'set' : 'ambient';
      return { mix, source, audio };
    },
    mix: () => mix,
    reset() { last = null; mix = 0; level = 0; audio = false; },
  };
}
