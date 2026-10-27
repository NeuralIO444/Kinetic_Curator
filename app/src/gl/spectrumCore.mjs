// spectrumCore.mjs — #1482 P1: the analysis core of the spectral path. Pure: no clock, no DOM, no allocation per frame.
//
// A browser analyser hands over linear frequency bins in dB. The picture wants something perceptual: 128 log-spaced
// bins from 30 Hz to 16 kHz, tilted so treble is not buried, mapped to 0..1, with attack and release that are the
// same at 30 and 144 fps. This module is that, and nothing else; the live feed (P2) and the renderer (P3) sit on it.
//
//   fftBins  linear bins of the analyser (frequencyBinCount: 1024 for fftSize 2048)
//   outputs  smooth (0..1), peak (0..1), rel (-1..1: smooth minus its own slow average), flux (0..1), centroid, rms
//
// Numbers are the issue's (docs/design/spectral-path.md, Matt's decisions of 2026-10-14): attack 8 ms, release 180 ms,
// peak hold 120 ms then a 350 ms fall, a 6 s slow average for the relative mode, a -72..-36 dB window, +3 dB/octave
// above 1 kHz.

export const LOG_BINS = 128;
export const F_LO = 30;
export const F_HI = 16000;
export const TEX_W = 256;
export const TEX_H = 4;

export const ATTACK_MS = 8;
export const RELEASE_MS = 180;
export const PEAK_HOLD_MS = 120;
export const PEAK_FALL_MS = 350;
export const SLOW_AVG_MS = 6000;
export const DB_FLOOR = -72;
export const DB_CEIL = -36;
export const TILT_DB_PER_OCT = 3;
export const TILT_FROM_HZ = 1000;
export const TILT_MAX_DB = 12;
const SNAP = 0.002; // below this, with nothing coming in, a level is silence
const SILENCE_DB = -100; // below this a bin is exactly silent

/** Centre frequency (Hz) of log bin i. */
export const logBinCentre = (i) => F_LO * Math.pow(F_HI / F_LO, (i + 0.5) / LOG_BINS);

/** The perceptual tilt in dB at a frequency: +3 dB per octave above 1 kHz, clamped. */
export function tiltDb(hz) {
  if (!(hz > TILT_FROM_HZ)) return 0;
  return Math.min(TILT_MAX_DB, TILT_DB_PER_OCT * Math.log2(hz / TILT_FROM_HZ));
}

/** dB (after tilt) to 0..1 through the -72..-36 window. */
export function dbToUnit(db) {
  return Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
}

/**
 * Sparse map from linear bins to log bins: for each log bin the first and last linear bin that belong to it (a bin
 * narrower than one linear bin still gets its nearest one, so none is ever empty).
 */
export function buildLogBinMap(fftBins = 1024, sampleRate = 48000) {
  const nyq = sampleRate / 2;
  const hzPerBin = nyq / fftBins;
  const lo = new Int32Array(LOG_BINS);
  const hi = new Int32Array(LOG_BINS);
  const tilt = new Float32Array(LOG_BINS);
  const ratio = Math.pow(F_HI / F_LO, 1 / LOG_BINS);
  for (let i = 0; i < LOG_BINS; i++) {
    const f0 = F_LO * Math.pow(ratio, i);
    const f1 = f0 * ratio;
    let a = Math.floor(f0 / hzPerBin);
    let b = Math.ceil(f1 / hzPerBin) - 1;
    if (b < a) {
      const nearest = Math.min(fftBins - 1, Math.max(0, Math.round((f0 + f1) / 2 / hzPerBin)));
      a = nearest;
      b = nearest;
    }
    lo[i] = Math.min(fftBins - 1, Math.max(0, a));
    hi[i] = Math.min(fftBins - 1, Math.max(lo[i], b));
    tilt[i] = tiltDb(logBinCentre(i));
  }
  return { lo, hi, tilt, fftBins, sampleRate };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const coef = (dtMs, tauMs) => 1 - Math.exp(-Math.max(0, dtMs) / tauMs); // frame-rate independent smoothing

/**
 * @returns the core: update(dbBins, dtMs, waveform?) -> state. State arrays are reused every frame.
 */
export function createSpectrumCore({ fftBins = 1024, sampleRate = 48000 } = {}) {
  const map = buildLogBinMap(fftBins, sampleRate);
  const now = new Float32Array(LOG_BINS); // the instantaneous (tilted, windowed) level
  const prev = new Float32Array(LOG_BINS);
  const state = {
    smooth: new Float32Array(LOG_BINS),
    peak: new Float32Array(LOG_BINS),
    rel: new Float32Array(LOG_BINS),
    flux: new Float32Array(LOG_BINS),
    slow: new Float32Array(LOG_BINS),
    wave: new Float32Array(TEX_W),
    rms: 0,
    centroid: 0,
    fluxTotal: 0,
  };
  const holdLeft = new Float32Array(LOG_BINS); // ms of hold remaining per bin
  let primed = false;

  return {
    state,
    map,
    /**
     * @param dbBins   Float32Array of dB per linear bin (as getFloatFrequencyData gives), length fftBins; may be null
     * @param dtMs     ms since the last update (clamped to 0..200 here: a stalled tab must not slam the envelopes)
     * @param waveform optional Float32Array of time-domain samples (-1..1) to decimate into the waveform row
     * @param synth    optional Float32Array(LOG_BINS) of 0..1 levels (a synthetic source, e.g. spectrumFromBands)
     * @param mix      0..1: how much of `synth` replaces the measured level, before the ballistics
     */
    update(dbBins, dtMs, waveform = null, synth = null, mix = 0) {
      const dt = clamp(Number.isFinite(dtMs) ? dtMs : 16.7, 0, 200);
      const m = synth && Number.isFinite(mix) ? clamp(mix, 0, 1) : 0;
      // 1. log bins: power-mean of the members, back to dB, tilt, window to 0..1
      for (let i = 0; i < LOG_BINS; i++) {
        let level = 0;
        if (dbBins) {
          let p = 0;
          const a = map.lo[i];
          const b = map.hi[i];
          for (let k = a; k <= b; k++) {
            const d = dbBins[k];
            if (d > SILENCE_DB) p += Math.pow(10, d / 10); // a non-finite or -Infinity bin is silence
          }
          if (p > 0) {
            const db = 10 * Math.log10(p / (b - a + 1)) + map.tilt[i];
            level = dbToUnit(db);
          }
        }
        if (m > 0) {
          const v = synth[i];
          level = level * (1 - m) + (Number.isFinite(v) ? clamp(v, 0, 1) : 0) * m;
        }
        now[i] = level;
      }
      // 2. per-bin ballistics, peaks, the slow average, flux
      const ka = coef(dt, ATTACK_MS);
      const kr = coef(dt, RELEASE_MS);
      const ks = coef(dt, SLOW_AVG_MS);
      const fall = dt / PEAK_FALL_MS;
      let fluxSum = 0;
      let wSum = 0;
      let wxSum = 0;
      let sq = 0;
      for (let i = 0; i < LOG_BINS; i++) {
        const x = now[i];
        const s = state.smooth[i];
        let sNew = s + (x > s ? ka : kr) * (x - s);
        if (x === 0 && sNew < SNAP) sNew = 0; // an exponential tail never arrives: silence is exactly zero
        state.smooth[i] = sNew;
        // peaks: jump up, hold, then fall at a fixed rate toward the smoothed value
        if (sNew >= state.peak[i]) {
          state.peak[i] = sNew;
          holdLeft[i] = PEAK_HOLD_MS;
        } else if (holdLeft[i] > 0) holdLeft[i] = Math.max(0, holdLeft[i] - dt);
        else state.peak[i] = Math.max(sNew, state.peak[i] - fall);
        if (sNew === 0 && state.peak[i] < SNAP) state.peak[i] = 0;
        // the slow average primes at the first signal so "deviation from normal" does not start with a huge jump
        if (!primed) state.slow[i] = sNew;
        else state.slow[i] += ks * (sNew - state.slow[i]);
        state.rel[i] = clamp(sNew - state.slow[i], -1, 1);
        const rise = Math.max(0, x - prev[i]);
        state.flux[i] = rise;
        fluxSum += rise;
        prev[i] = x;
        wSum += sNew;
        wxSum += sNew * i;
        sq += sNew * sNew;
      }
      primed = true;
      state.fluxTotal = fluxSum / LOG_BINS;
      state.rms = Math.sqrt(sq / LOG_BINS);
      state.centroid = wSum > 1e-6 ? wxSum / wSum / (LOG_BINS - 1) : 0; // 0..1 along the log axis
      // 3. the waveform row: decimate the time-domain block to 256 samples, centred on 0.5
      if (waveform && waveform.length > 0) {
        const step = waveform.length / TEX_W;
        for (let j = 0; j < TEX_W; j++)
          state.wave[j] = clamp(0.5 + 0.5 * waveform[Math.min(waveform.length - 1, Math.floor(j * step))], 0, 1);
      } else if (!waveform) {
        state.wave.fill(0.5);
      }
      return state;
    },
    reset() {
      for (const k of ['smooth', 'peak', 'rel', 'flux', 'slow']) state[k].fill(0);
      state.wave.fill(0.5);
      prev.fill(0);
      now.fill(0);
      holdLeft.fill(0);
      state.rms = 0;
      state.centroid = 0;
      state.fluxTotal = 0;
      primed = false;
    },
  };
}

/**
 * Pack the state into the 256 x 4 R8 rows the renderer samples (row 0 smoothed, 1 peak, 2 waveform, 3 flux). The 128
 * log bins are linearly interpolated across the 256-wide rows. `out` is Uint8Array(TEX_W * TEX_H), reused.
 */
export function packSpectrumTexture(state, out = new Uint8Array(TEX_W * TEX_H)) {
  const rows = [state.smooth, state.peak, null, state.flux];
  for (let r = 0; r < TEX_H; r++) {
    const o = r * TEX_W;
    for (let x = 0; x < TEX_W; x++) {
      let v;
      if (r === 2) v = state.wave[x];
      else {
        const pos = (x / (TEX_W - 1)) * (LOG_BINS - 1);
        const i0 = Math.floor(pos);
        const i1 = Math.min(LOG_BINS - 1, i0 + 1);
        const t = pos - i0;
        v = rows[r][i0] * (1 - t) + rows[r][i1] * t;
        if (r === 3) v = Math.min(1, v * 4); // flux is small frame to frame: lift it into a usable range
      }
      out[o + x] = Math.round(clamp(v, 0, 1) * 255);
    }
  }
  return out;
}

// ── the Queen's set as a spectrum (decision 3) ──────────────────────────────────────────────────────────────────
const BAND_EDGES = [
  [20, 60],
  [60, 250],
  [250, 500],
  [500, 2000],
  [2000, 4000],
  [4000, 6000],
  [6000, 20000],
]; // meterBands
const BAND_CENTRES_LOG = BAND_EDGES.map(([a, b]) => Math.log(Math.sqrt(a * b)));

/**
 * Smooth 7 band levels (sub..air, 0..1) into 128 log bins: linear interpolation in log-frequency between band
 * centres, flat beyond the ends. Deterministic, cheap, and honest: it is the band energy spread out, not invented detail.
 * @param out Float32Array(LOG_BINS), reused
 */
export function spectrumFromBands(bands, out = new Float32Array(LOG_BINS)) {
  const lv = Array.isArray(bands)
    ? bands
    : [
        bands && bands.sub,
        bands && bands.bass,
        bands && bands.mud,
        bands && bands.mids,
        bands && bands.edge,
        bands && bands.pres,
        bands && bands.air,
      ];
  const v = lv.map((x) => (Number.isFinite(x) ? clamp(x, 0, 1) : 0));
  for (let i = 0; i < LOG_BINS; i++) {
    const lf = Math.log(logBinCentre(i));
    if (lf <= BAND_CENTRES_LOG[0]) {
      out[i] = v[0];
      continue;
    }
    if (lf >= BAND_CENTRES_LOG[6]) {
      out[i] = v[6];
      continue;
    }
    let j = 0;
    while (j < 5 && lf > BAND_CENTRES_LOG[j + 1]) j++;
    const t = (lf - BAND_CENTRES_LOG[j]) / (BAND_CENTRES_LOG[j + 1] - BAND_CENTRES_LOG[j]);
    out[i] = v[j] * (1 - t) + v[j + 1] * t;
  }
  return out;
}

// ── the compact take record (decision 2): 32 bins, 8-bit ────────────────────────────────────────────────────────
export const RECORD_BINS = 32;

/** 128 smoothed log bins (0..1) to 32 bytes: the mean of each group of 4. */
export function quantizeSpectrum(smooth, out = new Uint8Array(RECORD_BINS)) {
  const g = LOG_BINS / RECORD_BINS;
  for (let i = 0; i < RECORD_BINS; i++) {
    let s = 0;
    for (let k = 0; k < g; k++) s += smooth[i * g + k] || 0;
    out[i] = Math.round(clamp(s / g, 0, 1) * 255);
  }
  return out;
}

/** 32 bytes back to 128 log bins, linearly interpolated between the group centres. */
export function expandSpectrum(bytes, out = new Float32Array(LOG_BINS)) {
  const g = LOG_BINS / RECORD_BINS;
  for (let i = 0; i < LOG_BINS; i++) {
    const pos = clamp((i + 0.5) / g - 0.5, 0, RECORD_BINS - 1);
    const a = Math.floor(pos);
    const b = Math.min(RECORD_BINS - 1, a + 1);
    const t = pos - a;
    out[i] = ((bytes[a] || 0) * (1 - t) + (bytes[b] || 0) * t) / 255;
  }
  return out;
}
