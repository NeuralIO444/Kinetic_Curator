// spectrumLive.mjs — #1482 P2: the live spectrum. Once a frame it reads the spectrum analyser (useAudioInput's third,
// float dB, unsmoothed) and the synthetic set's answer for that frame, and steps the core (spectrumCore). A module
// holder like motionMeterTap: not store state, read-only for everyone but this driver. Nothing here touches the bands.
import { createSpectrumCore, spectrumFromBands, expandSpectrum, RECORD_BINS, LOG_BINS } from './spectrumCore.mjs';
import { peekSourceFeed } from './sourceFeed.mjs';

let core = createSpectrumCore();
let shape = '';
let db = null;
let wave = null;
const synth = new Float32Array(LOG_BINS);

// #1534 — the take's hearing, when a take with a spectrum section plays: the recorded rows feed the core
// in the analyser's place and the live analyser is ignored, as the audio input already is. The frame tap
// in the App steps it once per played frame; the ballistics re-derive peak and flux from the recorded
// smoothed levels, exactly as they do live.
let pbBytes = null; // Uint8Array(frames * RECORD_BINS) while a take's spectrum plays, else null
const pbRow = new Float32Array(LOG_BINS);
const PB_DT_MS = 1000 / 60; // one recorded frame is one resolved frame: the nominal step

/** Start feeding a take's recorded rows (the decoded section bytes). The core starts from silence. */
export function beginSpectrumPlayback(bytes) {
  pbBytes = bytes instanceof Uint8Array && bytes.length % RECORD_BINS === 0 ? bytes : null;
  if (pbBytes) core.reset();
}

/** Step the core with the recorded row for `frame` (clamped to the record's length). */
export function stepSpectrumPlayback(frame) {
  if (!pbBytes) return core.state;
  const frames = pbBytes.length / RECORD_BINS;
  const f = Math.max(0, Math.min(frames - 1, Math.floor(Number(frame) || 0)));
  expandSpectrum(pbBytes.subarray(f * RECORD_BINS, (f + 1) * RECORD_BINS), pbRow);
  return core.update(null, PB_DT_MS, null, pbRow, 1);
}

/** The take ended (or had no section): the live spectrum belongs to the room again. */
export function endSpectrumPlayback() {
  pbBytes = null;
}

/** Whether a take's spectrum is currently the core's source. */
export function isSpectrumPlayback() {
  return pbBytes !== null;
}

// The recording tap: while a take records, each live step offers its state to the take's spectrum
// section (curator/spectrumRecord). One listener (or null); a throwing listener is dropped.
let spectrumTap = null;
export function setSpectrumTap(fn) {
  spectrumTap = typeof fn === 'function' ? fn : null;
}

/**
 * One step. `analyser` may be null (audio off: the measured part is silence and the envelopes release).
 * The synthetic source's bands, when it plays, are spread over the bins and mixed in by its own mix.
 */
export function stepSpectrum(analyser, sampleRate, dtMs) {
  if (pbBytes) return core.state; // #1534: a take is playing — its recorded hearing is the only source
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
  const state = core.update(dbIn, dtMs, waveIn, mix > 0 ? synth : null, mix);
  if (spectrumTap) { try { spectrumTap(state); } catch { spectrumTap = null; } }
  return state;
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
