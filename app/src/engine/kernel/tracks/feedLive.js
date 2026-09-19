/** Delay-1 hop: applyTo reads last commit; pushSource stages this frame. */
import { createFeedDelay } from './feedDelay.js';
import { applyFeed, normalizePatch, FEED_SCALE } from './trackGraph.js';

export function createFeedLive(frameW = 1000, frameH = 700) {
  const w = Math.max(8, Math.round(frameW * FEED_SCALE));
  const h = Math.max(8, Math.round(frameH * FEED_SCALE));
  const delay = createFeedDelay(w, h);
  const pending = new Map();

  function rasterize(points) {
    const luma = new Float32Array(w * h);
    const pts = Array.isArray(points) ? points : [];
    for (const p of pts) {
      const x = Math.max(0, Math.min(w - 1, Math.floor((Number(p.x) || 0) * w)));
      const y = Math.max(0, Math.min(h - 1, Math.floor((Number(p.y) || 0) * h)));
      luma[y * w + x] = 1;
    }
    return luma;
  }

  return {
    w,
    h,
    delay,
    pushSource(trackId, points) {
      pending.set(trackId | 0, rasterize(points));
    },
    applyTo(targetPts, patch) {
      const p = normalizePatch(patch);
      if (p.mode !== 'feed') return targetPts;
      if (!delay.hasHistory(p.from)) return targetPts;
      return applyFeed(targetPts, delay.field(p.from), p);
    },
    commit() {
      for (const [id, luma] of pending) delay.push(id, luma);
      pending.clear();
    },
    reset() {
      pending.clear();
      delay.reset();
    },
  };
}
