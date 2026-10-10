import { MAX_TRACKS, lumaToFlow } from './trackGraph.js';

export function createFeedDelay(w, h) {
  const width = Math.max(1, w | 0);
  const height = Math.max(1, h | 0);
  const prev = Array.from({ length: MAX_TRACKS }, () => new Float32Array(width * height));
  // #1244: back buffer per slot. The rasterize path writes into stage[id]
  // (zero-alloc: rasterize fills then stamps, never allocates), and swap()
  // promotes it to the delay slot on commit — no per-frame allocation AND no
  // element-wise copy. lumaToFlow() is pure in its luma input (fresh output
  // arrays, never aliases the slot), so recycling the old front buffer as the
  // next stage buffer cannot corrupt previously returned fields.
  const stage = Array.from({ length: MAX_TRACKS }, () => new Float32Array(width * height));
  const ready = new Uint8Array(MAX_TRACKS);
  // #1231: lumaToFlow() is pure in its luma input, so the flow field only
  // changes when new luma lands. push() marks the slot dirty; field()
  // recomputes at most once per push, so steady-state frames do zero
  // Float32Array allocation on this path. The recomputed object is
  // value-identical to a fresh lumaToFlow() call (pinned by the selfcheck).
  const cached = new Array(MAX_TRACKS).fill(null);
  const dirty = new Uint8Array(MAX_TRACKS);
  const zeroField = lumaToFlow(new Float32Array(width * height), width, height);
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
      dirty[id] = 1;
    },
    // #1244: borrow the staging buffer for track id. Rasterize into it (fill
    // then stamp), then hand it to swap(). Same buffer object every frame —
    // no allocation on the rasterize path.
    stageBuffer(trackId) {
      const id = trackId | 0;
      if (id < 0 || id >= MAX_TRACKS) return null;
      return stage[id];
    },
    // #1244: the commit point — promote the staged buffer to the delay slot.
    // The slot now holds exactly what a copy-push would have written, with no
    // copy. Commit-point contract: like push(), this makes the slot's
    // contents new — any flow cache keyed on slot contents (e.g. #1231) must
    // treat swap() as invalidating, exactly as it treats push().
    swap(trackId) {
      const id = trackId | 0;
      if (id < 0 || id >= MAX_TRACKS) return;
      const tmp = prev[id];
      prev[id] = stage[id];
      stage[id] = tmp;
      ready[id] = 1;
      dirty[id] = 1;
    },
    field(trackId) {
      const id = trackId | 0;
      if (id < 0 || id >= MAX_TRACKS || !ready[id]) return zeroField;
      if (dirty[id]) {
        cached[id] = lumaToFlow(prev[id], width, height);
        dirty[id] = 0;
      }
      return cached[id];
    },
    hasHistory(trackId) {
      const id = trackId | 0;
      return id >= 0 && id < MAX_TRACKS && ready[id] === 1;
    },
    reset() {
      for (let i = 0; i < MAX_TRACKS; i++) {
        prev[i].fill(0);
        stage[i].fill(0);
        ready[i] = 0;
        cached[i] = null;
        dirty[i] = 0;
      }
    },
  };
}
