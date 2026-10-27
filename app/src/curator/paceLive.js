// paceLive.js — #1460: the live driver of the tempo ease. Listens to the audio detections and the clock; once a phrase
// it asks the host (director.js) whether the BEAT should move toward the music, and if so moves it a small step.
//
//   - audio:tempo { bpm, confidence }  the target
//   - clock:bar                         a phrase boundary (every PHRASE_BARS)
//   - beat:bpm                          an artist change silences it; our own step carries cause 'lean' and does not
//   - audio:silenceEnd / audio:input    a new piece: a silenced pace may start again
//
// The mark (curator/swayView.mjs) is the only sign of it: visible while it is easing, absent otherwise.
import { on, emit, Events } from '../composition/eventBus.js';
import { paceStep } from './director.js';
import { setPaceMagnitude } from './swayView.mjs';

export const PHRASE_BARS = 4;
/** What the mark reads while she is easing (the gap, scaled; never below a visible hand). */
const markFor = (gap) => Math.min(1, Math.max(0.4, Math.abs(gap) / 24));

/**
 * @param getBpm   () => the BEAT BPM now
 * @param context  () => { keeps, allowance } the ledger and the room's allowance, read at the phrase
 * @returns stop()
 */
export function startPace({ getBpm, context }) {
  let target = null; // { bpm, confidence }
  let silenced = false;
  const stop = [];

  stop.push(
    on(Events.AUDIO_TEMPO, (p) => {
      if (p && Number.isFinite(p.bpm)) target = { bpm: p.bpm, confidence: Number(p.confidence) || 0 };
    }),
  );
  stop.push(
    on(Events.AUDIO_SILENCE_START, () => {
      target = null;
      setPaceMagnitude(0);
    }),
  );
  stop.push(
    on(Events.AUDIO_SILENCE_END, () => {
      silenced = false;
    }),
  );
  stop.push(
    on(Events.AUDIO_INPUT, () => {
      silenced = false;
      target = null;
      setPaceMagnitude(0);
    }),
  );
  // anything that is not our own step is the artist (tap, preset, typed, MIDI): their BPM wins
  stop.push(
    on(Events.BEAT_BPM, (p, meta) => {
      if (meta && meta.cause === 'lean') return;
      silenced = true;
      setPaceMagnitude(0);
    }),
  );
  stop.push(
    on(Events.CLOCK_BAR, (p) => {
      if (!p || p.bar % PHRASE_BARS !== 0) return;
      if (silenced || !target) {
        setPaceMagnitude(0);
        return;
      }
      let ctx;
      try {
        ctx = context() || {};
      } catch {
        ctx = {};
      }
      const current = getBpm();
      const next = paceStep({
        current,
        target: target.bpm,
        confidence: target.confidence,
        keeps: ctx.keeps,
        allowance: ctx.allowance,
      });
      if (next === null) {
        setPaceMagnitude(0);
        return;
      }
      setPaceMagnitude(markFor(target.bpm - current));
      emit(Events.BEAT_BPM, { bpm: next }, { cause: 'lean' });
    }),
  );

  return () => {
    for (const off of stop) off();
    setPaceMagnitude(0);
  };
}
