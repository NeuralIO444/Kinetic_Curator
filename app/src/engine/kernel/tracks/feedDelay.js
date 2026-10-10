import { MAX_TRACKS } from './trackGraph.js';
import { lumaToFlowInto } from './feedOps.js';

export function createFeedDelay(w, h) {
  const width = Math.max(1, w | 0);
  const height = Math.max(1, h | 0);
  const n = width * height;
  const prev = Array.from({ length: MAX_TRACKS }, () => new Float32Array(n));
  // #1244: back buffer per slot. The rasterize path writes into stage[id]
  // (zero-alloc: rasterize fills then stamps, never allocates), and swap()
  // promotes it to the delay slot on commit — no per-frame allocation AND no
  // element-wise copy. lumaToFlowInto() is pure in its luma input (writes
  // only the caller-owned back pair, never aliases the slot), so recycling
  // the old front buffer as the next stage buffer cannot corrupt previously
  // returned fields.
  const stage = Array.from({ length: MAX_TRACKS }, () => new Float32Array(n));
  const ready = new Uint8Array(MAX_TRACKS);
  // #1308 (SoA successor to #1244/#1231): the flow encode's double-buffered
  // SoA column pairs. lumaToFlow() allocated a fresh interleaved
  // Float32Array(w*h*2) on every recompute — the last per-frame allocation
  // on the delay path. Now each slot owns two preallocated (u, v) column
  // pairs; field() encodes into the BACK pair via lumaToFlowInto() and
  // swaps the front index. The recompute fully overwrites every lane of
  // the back pair before the swap publishes it, so no stale lane is ever
  // read (the acquire-contract pattern from soa/pools.js). The produced
  // columns are byte-identical to what lumaToFlow() returned — same
  // central differences, same float32 stores, only deinterleaved
  // (pinned by feedColumns.golden.json + feedColumns.selfcheck.mjs).
  const flowU = Array.from({ length: MAX_TRACKS }, () => [new Float32Array(n), new Float32Array(n)]);
  const flowV = Array.from({ length: MAX_TRACKS }, () => [new Float32Array(n), new Float32Array(n)]);
  const flowFront = new Uint8Array(MAX_TRACKS);
  // #1231: the flow field only changes when new luma lands. push()/swap()
  // mark the slot dirty; field() recomputes at most once per push, so
  // steady-state frames do zero Float32Array allocation on this path —
  // and now recompute frames do too (column pairs, no fresh arrays).
  const cached = new Array(MAX_TRACKS).fill(null);
  const dirty = new Uint8Array(MAX_TRACKS);
  // The zero field is the curl encode of zero luma — computed through the
  // encoder (not a raw zeroed pair) so the v column carries the encoder's
  // negative zeros (-dx of a zero field), bit-exact with the old
  // lumaToFlow(new Float32Array(...)) zero field. Pinned by the golden.
  const zeroField = lumaToFlowInto(new Float32Array(n), width, height, new Float32Array(n), new Float32Array(n));
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
        // #1308: encode into the back column pair, then swap. The previously
        // returned wrapper keeps aliasing the old front pair, so its values
        // are untouched by this recompute (same guarantee #1231 had).
        const back = flowFront[id] ^ 1;
        cached[id] = lumaToFlowInto(prev[id], width, height, flowU[id][back], flowV[id][back]);
        flowFront[id] = back;
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
        flowU[i][0].fill(0);
        flowU[i][1].fill(0);
        flowV[i][0].fill(0);
        flowV[i][1].fill(0);
        flowFront[i] = 0;
        ready[i] = 0;
        cached[i] = null;
        dirty[i] = 0;
      }
    },
  };
}
