/**
 * 1-frame FEED ring (#345).
 *
 * Live loop writes this-frame luma after the track composites, then the
 * *next* frame samples the previous luma as flow. Frame 0 has no history,
 * so the field is zero and applyFeed is a no-op — same as OFF.
 *
 * No GL. The live renderer can later upload `field.flow` as RG16F.
 */
import { MAX_TRACKS } from './trackGraph.js';
import { lumaToFlow } from './trackGraph.js';

export function createFeedDelay(w, h) {
  const width = Math.max(1, w | 0);
  const height = Math.max(1, h | 0);
  const prev = Array.from({ length: MAX_TRACKS }, () => new Float32Array(width * height));
  const ready = new Uint8Array(MAX_TRACKS); // 1 after the first push

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
    /** Previous-frame flow, or a zero field before the first push. */
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
