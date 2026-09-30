// bandFeed.mjs — the seven meter bands as live route inputs (#790 PR3).
//
// A route may read band.sub … band.air. The bands come from the meter-only
// analyser tap (hooks/audioMeterTap.js), NOT the store, so the store's band
// shape (pinned by audioPipeline.selfcheck) and stage 1 of the envelope are
// untouched. The loop asks this feed once per frame; it costs nothing unless a
// route actually reads a band.
//
//  - Shaped by the same ballistics as the coarse bands, on the GL clock.
//  - Silence is exactly zero: audio off, no tap, or no data all read 0 and
//    the follower decays to 0 (never a frozen ghost).
//  - With a FILE sidecar driving (#618) the bands read 0: the sidecar carries
//    no per-band data, and a live FFT of the playing file would not repeat.
import { processBallistics, createBallisticsState, resetBallistics } from './audioBallistics.mjs';
import { routesUseBands } from './audioRoutes.mjs';
import { METER_BANDS } from './meterBands.mjs';

/** Route-input keys (band.sub … band.air), in meter order. */
export const BAND_KEYS = Object.freeze(METER_BANDS.map((b) => b.label.toLowerCase()));

let lastShaped = null;

/** The bands the loop last fed to the routes (what the matrix shows), or null. */
export function getShapedBands() {
  return lastShaped;
}

export function createBandFeed() {
  const state = createBallisticsState();
  return {
    /**
     * @param {object} a
     * @param {Array|null} a.routes   the scene's route table
     * @param {boolean} a.enabled     audio is on
     * @param {boolean} a.sidecar     a FILE sidecar is driving reactivity
     * @param {() => object|null} a.readBands  live band levels { sub, bass, … } or null
     * @param {number} a.dtMs
     * @param {object} [a.params]     ballistics params (defaults, like the coarse stage)
     * @returns {object|null} shaped { sub, bass, mud, mids, edge, pres, air }, or null when no route reads a band
     */
    read({ routes, enabled, sidecar, readBands, dtMs, params = {} }) {
      if (!routesUseBands(routes)) {
        resetBallistics(state);
        lastShaped = null;
        return null;
      }
      const live = enabled && !sidecar && readBands ? readBands() : null;
      const raw = {};
      for (const k of BAND_KEYS) raw[k] = live && Number.isFinite(live[k]) ? live[k] : 0;
      lastShaped = processBallistics(state, raw, dtMs, params);
      return lastShaped;
    },
  };
}
