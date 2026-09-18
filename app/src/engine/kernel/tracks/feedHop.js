/**
 * FEED hop — GL upload contract for delay-1 curl fields.
 *
 * Not wired to accum.mjs / rAF. ACCUM Phase B2 still uses in-shader noise.
 * This pack is what a later compositor binds as u_feed when two tracks exist.
 *
 * Layout: quarter-res RGBA16F (8 bytes/texel). RG = flow.xy, BA unused.
 * Sample with the same bilinear as trackGraph.sampleFlow.
 */
import { FEED_SCALE, feedTextureBytes, lumaToFlow, sampleFlow } from './trackGraph.js';
import { createFeedDelay } from './feedDelay.js';

export function hopSize(frameW, frameH) {
  const w = Math.max(1, Math.round((frameW || 0) * FEED_SCALE));
  const h = Math.max(1, Math.round((frameH || 0) * FEED_SCALE));
  return { w, h, bytes: feedTextureBytes(frameW, frameH) };
}

/** Pack a {w,h,flow} field into RGBA float (4 floats/texel) for texImage2D. */
export function packFlowRgba(field) {
  const w = field?.w | 0;
  const h = field?.h | 0;
  const src = field?.flow;
  const out = new Float32Array(w * h * 4);
  if (!src) return { w, h, rgba: out };
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    out[p] = src[i * 2] || 0;
    out[p + 1] = src[i * 2 + 1] || 0;
    out[p + 2] = 0;
    out[p + 3] = 1;
  }
  return { w, h, rgba: out };
}

export function unpackFlowRgba(rgba, w, h) {
  const flow = new Float32Array(w * h * 2);
  const src = rgba || [];
  for (let i = 0; i < w * h; i++) {
    flow[i * 2] = src[i * 4] || 0;
    flow[i * 2 + 1] = src[i * 4 + 1] || 0;
  }
  return { w, h, flow };
}

export function createFeedHop(frameW, frameH) {
  const { w, h, bytes } = hopSize(frameW, frameH);
  const delay = createFeedDelay(w, h);
  return {
    w,
    h,
    bytes,
    /** Sample last frame's encoded field. Then push this frame's luma. */
    tick(trackId, luma) {
      const field = delay.field(trackId);
      delay.push(trackId, luma);
      return field;
    },
    pack(trackId, luma) {
      const field = this.tick(trackId, luma);
      return packFlowRgba(field);
    },
    sample(field, u, v) {
      return sampleFlow(field, u, v);
    },
    reset() {
      delay.reset();
    },
  };
}

export function lumaFromRgba(rgba, w, h) {
  const luma = new Float32Array(w * h);
  const src = rgba || [];
  for (let i = 0; i < w * h; i++) {
    const r = src[i * 4] || 0;
    const g = src[i * 4 + 1] || 0;
    const b = src[i * 4 + 2] || 0;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return luma;
}

export { lumaToFlow };
