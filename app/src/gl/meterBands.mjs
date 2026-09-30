// meterBands.mjs — the STIMULI meter's seven named bands (#613).
//
// Meter-only: read from a second, finer analyser tapped off the same input
// (useAudioInput). Modulation keeps reading its own 3 coarse bands, so the
// meter can be honest without changing the instrument's feel.
//
// Log-spaced edges in Hz. Pure.
export const METER_BANDS = Object.freeze([
  { id: 'sub', label: 'SUB', lo: 20, hi: 60 },
  { id: 'bass', label: 'BASS', lo: 60, hi: 250 },
  { id: 'mud', label: 'MUD', lo: 250, hi: 500 },
  { id: 'mids', label: 'MIDS', lo: 500, hi: 2000 },
  { id: 'edge', label: 'EDGE', lo: 2000, hi: 4000 },
  { id: 'presence', label: 'PRES', lo: 4000, hi: 6000 },
  { id: 'air', label: 'AIR', lo: 6000, hi: 20000 },
].map(Object.freeze));

/** FFT size of the meter analyser: ~23 Hz bins at 48 kHz, enough to split SUB from BASS. */
export const METER_FFT_SIZE = 2048;

/**
 * Average magnitude (0..1) per band from byte frequency data.
 * A band narrower than one bin still reads its nearest bin (never empty).
 */
export function meterBandLevels(freqBytes, sampleRate) {
  const n = freqBytes?.length || 0;
  const nyquist = (Number(sampleRate) || 48000) / 2;
  return METER_BANDS.map((b) => {
    if (!n) return 0;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor((b.lo / nyquist) * n)));
    const i1 = Math.max(i0 + 1, Math.min(n, Math.ceil((Math.min(b.hi, nyquist) / nyquist) * n)));
    let s = 0;
    for (let i = i0; i < i1; i++) s += freqBytes[i];
    return s / (i1 - i0) / 255;
  });
}

/**
 * Peak-hold: each band's peak jumps to a louder level and falls at `fallPerSec`.
 * Returns the new peaks (a fresh array).
 */
export function holdPeaks(prev, levels, dtSec, fallPerSec = 0.6) {
  return levels.map((v, i) => Math.max(v, (prev?.[i] || 0) - fallPerSec * Math.max(0, dtSec)));
}
