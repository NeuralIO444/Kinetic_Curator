// audioLive.js — #1459: the live driver of the audio event detector. One call per resolved frame with the loop time,
// the meter's band levels (or null when audio is off) and the source kind; it publishes the discrete detections on
// the bus (audio:input / onset / tempo / energy / silenceStart / silenceEnd) stamped with the musical clock.
//
// The bus carries decisions, not frames: the continuous band levels stay in the meter buffer (hooks/audioMeterTap)
// that the renderer and the routes read directly. Nothing here is saved or replayed from a file: these are
// measurements of the live signal, and the decisions they lead to are recorded where they are made.
import { createAudioEventDetector } from '../gl/audioEvents.mjs';
import { emit, Events } from './eventBus.js';
import './clockLive.js'; // installs the musical stamp provider the envelope reads

const detector = createAudioEventDetector();

const EVENT_OF = {
  input: Events.AUDIO_INPUT,
  onset: Events.AUDIO_ONSET,
  tempo: Events.AUDIO_TEMPO,
  energy: Events.AUDIO_ENERGY,
  silenceStart: Events.AUDIO_SILENCE_START,
  silenceEnd: Events.AUDIO_SILENCE_END,
};

/**
 * @param loopTimeMs  the loop clock
 * @param bands       { sub, bass, mud, mids, edge, pres, air } 0..1, or null when audio is off
 * @param sourceType  'mic' | 'file' | other (anything but 'file' reads as mic while bands are present)
 * @returns the detections made this frame (the bus has been told)
 */
export function observeAudio(loopTimeMs, bands, sourceType) {
  const events = detector.update(loopTimeMs, bands, { source: sourceType === 'file' ? 'file' : 'mic' });
  for (const e of events) {
    const { type, ...payload } = e;
    emit(EVENT_OF[type], payload, { cause: 'audio' });
  }
  return events;
}

/** The latest tempo estimate published, or null (the Queen reads this with its confidence from audio:tempo). */
export function getAudioTempo() {
  return detector.tempo();
}

/** Start over (tests; a fresh take). */
export function resetAudioEvents() {
  detector.reset();
}
