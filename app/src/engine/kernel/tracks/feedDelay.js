/**
 * 1-frame FEED ring (#345).
 *
 * Contract: field() THEN push(). Push-then-field is same-frame and forbidden
 * by the selfcheck. Frame 0 field is zeros (OFF).
 */
import { MAX_TRACKS, lumaToFlow } from './trackGraph.js';

export function createFeedDelay(w, h) {
  const width = Math.max(1, w | 0);
  const height = Math.max(1, h | 0);
  const prev = Array.from({ length: MAX_TRACKS }, () => new Float32Array(width * height));
  const ready = new Uint8Array(MAX_TRACKS);

  return {
    w: width,
    h: height,
    push(trackId, luma) {
      const id = trackId | 0;
      if (id < 0 || id >= MAX_TRACKS) return;
      const src = luma || [];
      const dst = prev[id];
      const n = Math.min(dst.length, src.length);
      for (let i = 0; i < n; i++) dst[i] = src[i] || 0;
      for (let i = n; i < dst.length; i++) dst[i] = 0;
      ready[id] = 1;
    },
    field(trackId) {
      const id = trackId | 0;
      if (id < 0 || id >= MAX_TRACKS || !ready[id]) {
        return lumaToFlow(new Float32Array(width * height), width, height);
      }
      return lumaToFlow(prev[id], width, height);
    },
    hasHistory(trackId) {
      const id = trackId | 0;
      return id >= 0 && id < MAX_TRACKS && ready[id] === 1;
    },
    reset() {
      for (let i = 0; i < MAX_TRACKS; i++) {
        prev[i].fill(0);
        ready[i] = 0;
      }
    },
  };
}
