// spectrumWarp.mjs — #1490 (spectral path P4): the FX feedback warp, the MilkDrop move. Pure driver + the
// amount's address. No clock, no DOM, no store: the caller hands in the spectrum state and the frame's dt.
//
// THE SHAPE. The instrument's previous-frame feedback is the ACCUM recipe (gl/accum.mjs): its fade pass already
// carries a per-frame zoom (tunnelZoom), a spin (tunnelSpin), a decay (keep) and a radial channel split
// (prismUv), and its glow pass carries the stipple grain. This module turns the spectrum into those numbers:
//
//   zoom    from bass DEVIATION — the core's relative mode (rel: smoothed level minus its own 6 s average),
//           averaged over the bass bins. Above-normal bass pushes in, below-normal relaxes out.
//   spin    from ATTENUATED mids — MilkDrop's mid_att: the mids level through this pass's own slow per-bin
//           smoothing (below), so the rotation is a swell, not a jitter.
//   decay   the feedback keep, mapped into 0.92..0.985 by the attenuated overall level: louder = longer
//           trails. At silence the target is the band's floor (0.92) — the brief's neutral: identity warp,
//           decay only, never a frame frozen mid-zoom.
//   treble  to chromatic aberration (prismUv) and to grain (the glow pass's optics, headroom-relative in
//           accum.applySpectrumWarp, the same form the band envelope's swell uses).
//
// PER-BIN SMOOTHING, IN THIS PASS ONLY (the TouchDesigner TimeSlice lesson, the issue's own words). The
// attenuated state below is one exponential per bin, stepped from the core's smoothed levels. The spectrum
// core is never written back to, and no other consumer (the marks, the readout, the take's record) sees the
// attenuated values — they read the core exactly as before. Nothing here smooths ACROSS bins: a hot bin's
// neighbour stays exactly as quiet as the core said (suite-proven — a block-smoothed variant leaks and fails).
//
// THE ADDRESS (why there is no dial and no layout key). The warp's amount lives on the FX stratum's existing
// item-param surface: an FX layer effect { kind: 'feedbackWarp', params: { amount } }, sanitized by
// fx/fxFilters.js like every other FX item. A document without the item carries no warp key anywhere — no
// DEFAULT_LAYOUT_PARAMS entry, no contract key, no recipe key — so off is byte-identical by construction,
// and a document with the item records the amount in the item, where FX params have always lived. The item
// is a carrier, not a chain filter: it registers no shader, so the FX chain compiles no step for it (no extra
// pass, live or export); its work is done here, on the accum recipe, live only — the spectrum COLOUR
// precedent (spectral-path.md P3: live-path only, stated on the section).
import { LOG_BINS, logBinCentre } from './spectrumCore.mjs';
import { registerCostTier } from './costTiers.mjs';
import { opticsDerived, spectralKeep } from './accum.mjs';

export const FEEDBACK_WARP_KIND = 'feedbackWarp';

/** Decay band (the issue's numbers): the feedback keep the warp drives toward, floor at silence. */
export const WARP_KEEP_MIN = 0.92;
export const WARP_KEEP_MAX = 0.985;

/** Per-frame warp ceilings at amount 1 — tuned against the accum family's own scales (tunnel 1 = +0.01 zoom
 *  and +0.01 rad spin per frame; prism 1 = 0.001 UV), so a full warp is the same class of move the artist
 *  can already dial by hand, not a new order of magnitude. */
export const WARP_ZOOM_MAX = 0.02; // ± on tunnelZoom - 1, from bass deviation ±1
export const WARP_SPIN_MAX = 0.015; // rad/frame at attenuated mids 1
export const WARP_PRISM_MAX = 0.0015; // UV at attenuated treble 1
export const WARP_GRAIN_MAX = 0.25; // headroom-relative optics lift at attenuated treble 1

/** The attenuated state's time constant: one exponential per bin, frame-rate independent (the core's coef
 *  form). 600 ms is MilkDrop's att class — slow enough to swell, fast enough to let go within a second of
 *  silence. */
export const WARP_ATT_MS = 600;
const SNAP = 0.002; // the core's own silence snap: below this, with nothing coming in, a level is exactly 0

// Band membership by log-bin centre frequency, on the meter's own edges (meterBands): bass = sub+bass
// (below 250 Hz), mids = the mids band (500..2000 Hz), treble = pres+air (from 4000 Hz).
const inBand = (lo, hi) => {
  const out = [];
  for (let i = 0; i < LOG_BINS; i++) {
    const f = logBinCentre(i);
    if (f >= lo && f < hi) out.push(i);
  }
  return out;
};
export const WARP_BASS_BINS = Object.freeze(inBand(0, 250));
export const WARP_MIDS_BINS = Object.freeze(inBand(500, 2000));
export const WARP_TREBLE_BINS = Object.freeze(inBand(4000, Infinity));

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const unit = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 0;
};
const coef = (dtMs, tauMs) => 1 - Math.exp(-Math.max(0, dtMs) / tauMs); // the core's frame-rate-independent form
const meanOver = (arr, bins) => {
  let s = 0;
  for (const i of bins) s += arr[i];
  return bins.length ? s / bins.length : 0;
};

/**
 * The warp amount a scene's FX strata declare: the largest feedbackWarp amount among visible FX layers,
 * or 0 when no layer carries the item (or the governor has shed the warp — cut 1.45). Pure: reads the
 * store's layer list shape ({ type: 'fx', visible, effects: [{ kind, params }] }), fail-closed on junk.
 */
export function feedbackWarpAmount(layers, shed = false) {
  if (shed || !Array.isArray(layers)) return 0;
  let amount = 0;
  for (const layer of layers) {
    if (!layer || layer.type !== 'fx' || layer.visible === false || !Array.isArray(layer.effects)) continue;
    for (const fx of layer.effects) {
      if (fx && fx.kind === FEEDBACK_WARP_KIND) amount = Math.max(amount, unit(fx.params?.amount));
    }
  }
  return amount;
}

/**
 * The warp driver: owns the per-bin attenuated state (the feedback pass's private smoothing) and derives
 * one frame's warp targets from the spectrum state. The returned object is reused — read it before the
 * next step. `state` is the spectrum core's state ({ smooth, rel, ... }); it is read, never written.
 */
export function createSpectrumWarp() {
  const att = new Float32Array(LOG_BINS); // per-bin attenuated levels — this pass's smoothing, and only this pass's
  const warp = { bassDev: 0, attMids: 0, attTreble: 0, attAll: 0, keep: WARP_KEEP_MIN };
  return {
    att,
    step(state, dtMs) {
      const dt = clamp(Number.isFinite(dtMs) ? dtMs : 16.7, 0, 200); // the core's clamp: a stalled tab must not slam the envelopes
      const k = coef(dt, WARP_ATT_MS);
      const smooth = state && state.smooth;
      let all = 0;
      for (let i = 0; i < LOG_BINS; i++) {
        const x = smooth ? clamp(Number.isFinite(smooth[i]) ? smooth[i] : 0, 0, 1) : 0;
        let v = att[i] + k * (x - att[i]);
        if (x === 0 && v < SNAP) v = 0; // silence is exactly zero, so the warp's neutral is exact, not asymptotic
        att[i] = v;
        all += v;
      }
      warp.attAll = all / LOG_BINS;
      warp.attMids = meanOver(att, WARP_MIDS_BINS);
      warp.attTreble = meanOver(att, WARP_TREBLE_BINS);
      // Bass deviation is the core's RELATIVE mode (per-bin deviation from its own slow average), read
      // directly — zoom wants the punch of the deviation, not another smoothing on top of it. Gated on
      // bass actually sounding: once the bass bins are silent the deviation against the stale 6 s average
      // is history, not signal, and the zoom must sit at identity (the relax-to-neutral law).
      const bassNow = smooth ? meanOver(smooth, WARP_BASS_BINS) : 0;
      warp.bassDev = state && state.rel && bassNow > 0 ? clamp(meanOver(state.rel, WARP_BASS_BINS), -1, 1) : 0;
      warp.keep = WARP_KEEP_MIN + (WARP_KEEP_MAX - WARP_KEEP_MIN) * warp.attAll;
      return warp;
    },
    reset() {
      att.fill(0);
      warp.bassDev = 0;
      warp.attMids = 0;
      warp.attTreble = 0;
      warp.attAll = 0;
      warp.keep = WARP_KEEP_MIN;
    },
  };
}

/**
 * Apply one frame's warp to accum recipe params — the sibling of accum.applyAudioEnvelope (the band
 * envelope), with the same contract: pure, returns new params, and a null/zero amount returns the input
 * values exactly (the no-warp path is untouched, field for field). The warp COMPOSES with the artist's
 * own TUNNEL/PRISM sliders and with the band envelope: zoom and spin add onto the recipe's transform,
 * decay blends the keep toward the warp's target by the amount, and treble lifts the glow's grain
 * headroom-relative (the #303 form: toward the slider's ceiling, never past it), recomputed through
 * accum's own opticsDerived so every derived field agrees.
 *
 * Silence is the neutral the design law requires: the driver's attenuated state is exactly 0 and its
 * bass deviation is 0, so zoom/spin/prism/grain all land on the recipe's own values and only the decay
 * blend remains — identity warp, decay only, never frozen mid-zoom.
 *
 * @param p      accum recipe params (accumRecipeParams output, possibly envelope-modulated)
 * @param warp   the driver's frame targets ({ bassDev, attMids, attTreble, keep }) or null
 * @param amount 0..1, the FX item's amount (feedbackWarpAmount); 0 is a no-op
 */
export function applySpectrumWarp(p, warp, amount) {
  const a = unit(amount);
  if (!p || !warp || !(a > 0)) return { ...p };
  const grain = a * clamp(warp.attTreble || 0, 0, 1) * WARP_GRAIN_MAX;
  const keep = clamp(p.keep + (clamp(warp.keep, WARP_KEEP_MIN, WARP_KEEP_MAX) - p.keep) * a, 0, 0.99);
  return {
    ...p,
    keep,
    // #1800: the decay blend moves the spectral vec3 with the scalar —
    // re-derived from the blended keep, exactly like the band envelope,
    // so the warp can never leave the channels on the pre-blend clocks.
    keepVec: spectralKeep(keep),
    ...opticsDerived(clamp(p.optics + (1 - p.optics) * grain, 0, 1)),
    tunnelZoom: clamp(1 + (p.tunnelZoom - 1) + a * WARP_ZOOM_MAX * clamp(warp.bassDev || 0, -1, 1), 0.95, 1.05),
    tunnelSpin: clamp(p.tunnelSpin + a * WARP_SPIN_MAX * clamp(warp.attMids || 0, 0, 1), -0.05, 0.05),
    prismUv: clamp(p.prismUv + a * WARP_PRISM_MAX * clamp(warp.attTreble || 0, 0, 1), 0, 0.004),
  };
}

// Cost (brief: declare the tier at registration, with measured numbers). The warp adds NO GPU pass, no
// texture and no draw: it writes four uniforms' worth of numbers into the accum recipe the loop already
// runs (the fade pass's existing transform branch is the warp's shader surface). Its real cost is CPU:
// 128 per-bin exponentials + three band means per frame. timeMs is MEASURED on that work — the step loop
// driven 14,000 times over a hot spectrum state, per-step hrtime, median of 7 runs of per-step medians,
// sandbox node 2026-10-20: 0.002–0.003 ms/step across runs — at the timer's own resolution, so the honest
// statement is "a few microseconds" (see spectrumWarp.selfcheck's bench print). Declared 0.01, erring up like the
// spectrum-marks estimate. Tier 1 in the registry's shed-first sense; the ladder rung that actually sheds
// it is the governor's cut 1.45 (hooks/governorCuts.js) — after mark weather (1.4), before the creature
// count (1.5): the issue's law, "sheds before body counts", with weather still dying first.
registerCostTier('gl/spectrum-warp', {
  tier: 1,
  memoryBytes: 0,
  timeMs: 0.01,
  notes:
    '#1490 spectral warp: per-bin attenuated spectrum driving the existing ACCUM fade/glow uniforms (zoom/spin/decay/prism/grain); no extra pass, no texture. CPU step measured 0.002–0.003 ms/step (sandbox node, per-step hrtime median-of-medians, timer-bound); shed by governor cut 1.45, before creature count (1.5).',
});
