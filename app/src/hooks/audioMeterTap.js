// audioMeterTap.js — the STIMULI meter's read-only view of the live audio (#613).
//
// useAudioInput publishes a meter-only AnalyserNode here (plus the source
// kind); the meter reads it straight from its own rAF draw. Keeping spectrum
// and waveform arrays out of the React store means the meter never re-renders
// the app 60x a second. null = audio off (the meter reads honestly idle).
let tap = null;

/** @param {{analyser: AnalyserNode, sampleRate: number, kind: 'MIC'|'FILE'}|null} next */
export function setAudioMeterTap(next) {
  tap = next;
}

/** The live meter tap, or null when audio is off. */
export function getAudioMeterTap() {
  return tap;
}
