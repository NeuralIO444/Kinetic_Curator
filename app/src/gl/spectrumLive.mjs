// spectrumLive.mjs — #1482 P2: the live spectrum. Once a frame it reads the spectrum analyser (useAudioInput's third,
// float dB, unsmoothed) and the synthetic set's answer for that frame, and steps the core (spectrumCore). A module
// holder like motionMeterTap: not store state, read-only for everyone but this driver. Nothing here touches the bands.
import { createSpectrumCore, spectrumFromBands, LOG_BINS } from './spectrumCore.mjs';
import { peekSourceFeed } from './sourceFeed.mjs';

let core = createSpectrumCore();
let shape = '';
let db = null;
let wave = null;
const synth = new Float32Array(LOG_BINS);

/**
 * One step. `analyser` may be null (audio off: the measured part is silence and the envelopes release).
 * The synthetic source's bands, when it plays, are spread over the bins and mixed in by its own mix.
 */
export function stepSpectrum(analyser, sampleRate, dtMs) {
  let dbIn = null;
  let waveIn = null;
  if (analyser) {
    const key = `${analyser.frequencyBinCount}:${sampleRate}`;
    if (key !== shape) { core = createSpectrumCore({ fftBins: analyser.frequencyBinCount, sampleRate }); shape = key; }
    if (!db || db.length !== analyser.frequencyBinCount) db = new Float32Array(analyser.frequencyBinCount);
    if (!wave || wave.length !== analyser.fftSize) wave = new Float32Array(analyser.fftSize);
    analyser.getFloatFrequencyData(db);
    analyser.getFloatTimeDomainData(wave);
    dbIn = db; waveIn = wave;
  }
  const feed = peekSourceFeed();
  const mix = feed && feed.bands ? feed.mix : 0;
  if (mix > 0) spectrumFromBands(feed.bands, synth);
  return core.update(dbIn, dtMs, waveIn, mix > 0 ? synth : null, mix);
}

/** The latest spectrum state (smooth, peak, rel, flux, wave, rms, centroid). Read-only by contract. */
export function readSpectrum() {
  return core.state;
}

/** Drive it from its own animation frame. getTap() => the audio meter tap or null. Returns stop(). */
export function startSpectrum(getTap) {
  let raf = 0;
  let last = 0;
  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    const tap = getTap();
    stepSpectrum(tap && tap.spectrum ? tap.spectrum : null, tap ? tap.sampleRate : 48000, last ? t - last : 16.7);
    last = t;
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
