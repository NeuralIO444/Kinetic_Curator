// audioMeterTap.js — the STIMULI meter's read-only view of the live audio (#613).
//
// useAudioInput publishes a meter-only AnalyserNode here (plus the source
// kind); the meter reads it straight from its own rAF draw. Keeping spectrum
// and waveform arrays out of the React store means the meter never re-renders
// the app 60x a second. null = audio off (the meter reads honestly idle).
import { meterBandLevels } from '../gl/meterBands.mjs';
import { BAND_KEYS } from '../gl/bandFeed.mjs';

let tap = null;

/** @param {{analyser: AnalyserNode, sampleRate: number, kind: 'MIC'|'MIC·PROC'|'FILE'}|null} next — MIC·PROC: the browser kept speech processing on (#1052) */
export function setAudioMeterTap(next) {
  tap = next;
}

/** The live meter tap, or null when audio is off. */
export function getAudioMeterTap() {
  return tap;
}

let freqBytes = null;
/**
 * Current level (0..1) of each named band from the meter analyser, keyed by the
 * route-input names (sub, bass, mud, mids, edge, pres, air); null when audio is
 * off. Reads the analyser directly, so it works whether or not the meter panel
 * is mounted (#790: routes can read bands with STIMULI closed).
 */
export function readMeterBandLevels() {
  if (!tap) return null;
  const n = tap.analyser.frequencyBinCount;
  if (!freqBytes || freqBytes.length !== n) freqBytes = new Uint8Array(n);
  tap.analyser.getByteFrequencyData(freqBytes);
  const levels = meterBandLevels(freqBytes, tap.sampleRate);
  const out = {};
  BAND_KEYS.forEach((k, i) => { out[k] = levels[i]; });
  return out;
}
