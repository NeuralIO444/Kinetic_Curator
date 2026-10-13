// audioEvents.mjs — #1459: discrete audio detections from the band levels. Pure, deterministic for a given sequence.
//
// Two lanes (the bus carries decisions, not frames): the continuous band levels stay in the shared meter buffer the
// renderer reads every frame; THIS module turns that stream into the few things worth saying on the bus:
//   input     { source }            the input changed (mic | file | none)
//   onset     { strength, band }    a hit: a sudden rise of energy across the spectrum (spectral flux)
//   tempo     { bpm, confidence }   the estimate moved by more than TEMPO_STEP bpm
//   energy    { level }             low | mid | high, with hysteresis so it does not flicker
//   silence   start { ms } / end { ms }   quiet for SILENCE_MS, then sound again
//
// Time is the caller's loop time (ms), never a wall clock: the same samples give the same events. Hand-rolled first
// (docs/design/parked-directions.md): a feature library only if this falls short.

export const BANDS = Object.freeze(['sub', 'bass', 'mud', 'mids', 'edge', 'pres', 'air']);

export const REFRACTORY_MS = 120; // an onset cannot follow another sooner than this
export const MIN_FLUX = 0.03; // the flux floor: below this nothing is a hit, however quiet the room
export const FLUX_SIGMAS = 1.6; // adaptive threshold: mean + this many mean-deviations of the recent flux
export const FLUX_EMA = 0.04; // how fast the flux mean and deviation follow
export const TEMPO_MIN = 70; // onset intervals fold into this range of bpm
export const TEMPO_MAX = 170;
export const TEMPO_STEP = 2; // publish a new estimate only when it moves by more than this
export const TEMPO_MIN_ONSETS = 6;
export const TEMPO_WINDOW = 24; // most recent onsets considered
export const ENERGY_LOW = 0.12; // enter 'low' below LOW - HYST, leave it above LOW + HYST
export const ENERGY_HIGH = 0.4;
export const ENERGY_HYST = 0.03;
export const LEVEL_EMA = 0.12; // smoothing of the overall level for the energy and silence tests
export const SILENCE_LEVEL = 0.02;
export const SOUND_LEVEL = 0.04; // sound is back above this (hysteresis over SILENCE_LEVEL)
export const SILENCE_MS = 2000;

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Fold an interval's tempo into [TEMPO_MIN, TEMPO_MAX] by octaves (a half-time or double-time hit pattern). */
function foldBpm(bpm) {
  let b = bpm;
  while (b < TEMPO_MIN) b *= 2;
  while (b > TEMPO_MAX) b /= 2;
  return b;
}

/**
 * Tempo from onset times: the interval tempos (folded) vote in 1-bpm bins smoothed over ±2; the best bin's weighted
 * mean is the estimate and the share of intervals within 4% of it is the confidence.
 * @returns {{bpm:number, confidence:number}|null}
 */
export function estimateTempo(onsetTimes) {
  const t = onsetTimes.slice(-TEMPO_WINDOW);
  if (t.length < TEMPO_MIN_ONSETS) return null;
  const tempos = [];
  for (let i = 1; i < t.length; i++) {
    const d = t[i] - t[i - 1];
    if (d > 0) tempos.push(foldBpm(60000 / d));
  }
  if (tempos.length < TEMPO_MIN_ONSETS - 1) return null;
  const bins = new Float64Array(TEMPO_MAX + 6);
  for (const b of tempos) {
    const c = Math.round(b);
    for (let k = -2; k <= 2; k++) if (c + k >= 0 && c + k < bins.length) bins[c + k] += 1 - Math.abs(k) / 3;
  }
  let best = 0;
  for (let i = 1; i < bins.length; i++) if (bins[i] > bins[best]) best = i;
  const near = tempos.filter((b) => Math.abs(b - best) <= best * 0.04);
  if (near.length === 0) return null;
  const bpm = near.reduce((s, b) => s + b, 0) / near.length;
  return { bpm: Math.round(bpm * 10) / 10, confidence: Math.round((near.length / tempos.length) * 100) / 100 };
}

export function createAudioEventDetector() {
  let prev = null; // last band levels
  let fluxMean = 0.02; let fluxDev = 0.02;
  let lastOnset = -Infinity;
  const onsets = [];
  let lastTempo = null;
  let level = 0; // smoothed overall level
  let energy = null; // 'low' | 'mid' | 'high'
  let quietSince = null; let silent = false; let silentAt = 0;
  let source = null;

  return {
    /**
     * @param tMs    loop time in ms
     * @param bands  { sub, bass, mud, mids, edge, pres, air } each 0..1, or null when audio is off
     * @param opts   { source: 'mic' | 'file' | 'none' }
     * @returns [{ type, ...payload }] in order
     */
    update(tMs, bands, opts = {}) {
      const out = [];
      const t = Number(tMs);
      if (!Number.isFinite(t)) return out;
      const src = bands ? (opts.source === 'file' ? 'file' : 'mic') : 'none';
      if (src !== source) {
        source = src;
        out.push({ type: 'input', source: src });
        if (src === 'none') { prev = null; level = 0; quietSince = null; }
      }
      if (!bands) return out;

      let sum = 0; let flux = 0; let top = 0; let topBand = BANDS[0];
      const cur = {};
      for (const k of BANDS) {
        const v = clamp01(bands[k]);
        cur[k] = v;
        sum += v;
        const rise = prev ? Math.max(0, v - prev[k]) : 0;
        flux += rise;
        if (rise > top) { top = rise; topBand = k; }
      }
      flux /= BANDS.length;
      const overall = sum / BANDS.length;
      prev = cur;

      // ── onset: flux over an adaptive threshold, with a refractory period ─────────────────────────────────────
      const thr = Math.max(MIN_FLUX, fluxMean + FLUX_SIGMAS * fluxDev);
      if (flux > thr && t - lastOnset >= REFRACTORY_MS) {
        lastOnset = t;
        onsets.push(t);
        if (onsets.length > TEMPO_WINDOW * 2) onsets.shift();
        out.push({ type: 'onset', strength: Math.round(clamp01((flux - thr) / 0.2 + 0.25) * 1000) / 1000, band: topBand });
        const est = estimateTempo(onsets);
        if (est && (lastTempo === null || Math.abs(est.bpm - lastTempo) > TEMPO_STEP)) {
          lastTempo = est.bpm;
          out.push({ type: 'tempo', bpm: est.bpm, confidence: est.confidence });
        }
      }
      // the baseline follows the flux AFTER the test, so a hit does not raise its own bar
      fluxDev += FLUX_EMA * (Math.abs(flux - fluxMean) - fluxDev);
      fluxMean += FLUX_EMA * (flux - fluxMean);

      // ── energy: low | mid | high with hysteresis ─────────────────────────────────────────────────────────────
      level += LEVEL_EMA * (overall - level);
      let next = energy;
      if (energy === null) next = level < ENERGY_LOW ? 'low' : level > ENERGY_HIGH ? 'high' : 'mid';
      else if (energy === 'low' && level > ENERGY_LOW + ENERGY_HYST) next = level > ENERGY_HIGH + ENERGY_HYST ? 'high' : 'mid';
      else if (energy === 'high' && level < ENERGY_HIGH - ENERGY_HYST) next = level < ENERGY_LOW - ENERGY_HYST ? 'low' : 'mid';
      else if (energy === 'mid') {
        if (level < ENERGY_LOW - ENERGY_HYST) next = 'low';
        else if (level > ENERGY_HIGH + ENERGY_HYST) next = 'high';
      }
      if (next !== energy) { energy = next; out.push({ type: 'energy', level: energy }); }

      // ── silence: quiet for SILENCE_MS, then sound again ──────────────────────────────────────────────────────
      if (level < SILENCE_LEVEL) {
        if (quietSince === null) quietSince = t;
        if (!silent && t - quietSince >= SILENCE_MS) {
          silent = true; silentAt = quietSince;
          out.push({ type: 'silenceStart', ms: Math.round(t - quietSince) });
        }
      } else if (level > SOUND_LEVEL) {
        quietSince = null;
        if (silent) { silent = false; out.push({ type: 'silenceEnd', ms: Math.round(t - silentAt) }); }
      }
      return out;
    },
    /** The latest tempo estimate that was published, or null. */
    tempo() { return lastTempo; },
    reset() {
      prev = null; fluxMean = 0.02; fluxDev = 0.02; lastOnset = -Infinity; onsets.length = 0; lastTempo = null;
      level = 0; energy = null; quietSince = null; silent = false; silentAt = 0; source = null;
    },
  };
}
