// instanceStreams.mjs — #2183 WS4: split-stream instance upload (pure, DOM- and GL-free).
//
// The renderer packs every instance as 51 floats (204 B) and used to push the whole array to the GPU every draw.
// #533 measured that only ~29% of those bytes change between frames, but the changes are scattered through every
// item (an item that moves changes x,y even when nothing else about it does), so per-item dirty ranges coalesce
// back into a full upload and #533 was closed "measured not worth it".
//
// The measurement that was missing is WHICH floats change. On the two committed takes (replayGate, 60 s;
// creatureRepipe) only floats 0–5, 10–11 and 21–23 move in more than 2% of item-frames — the quad's position,
// size, rotation, opacity, velocity and deform axis. Everything else (atlas cell, colours, kineme state, material,
// engraving, distort, break-up) holds still for long stretches. So the instance is split in two streams:
//
//   dynamic  15 floats/item — floats 0..11 and 21..23 — uploaded whole every draw (60 B/item)
//   static   36 floats/item — floats 12..20 and 24..50 — uploaded only where an item's bytes differ from what is
//            already in the GPU buffer (144 B/item, usually ~0 of it)
//
// The GPU reads exactly the values packInstanceData wrote: this module moves bytes, it never changes a value, so
// the picture is bit-identical (selfcheck: every frame of both takes reassembles to the packed array; the A/B
// pixel proof lives with the PR). packInstanceData itself is untouched.
//
// Correctness rests on one invariant: `slot.shadow` mirrors what is in that slot's static GPU buffer. The diff is
// taken against the shadow, never against "last frame's draw", so a slot that sees a different batch than last
// frame simply sees more dirty items — never stale ones. If the GPU buffer is reallocated the renderer calls
// invalidate() and the next plan uploads everything.

export const INSTANCE_STRIDE_EXPECTED = 51;
export const DYN_FLOATS = 15;
export const STATIC_FLOATS = 36;
/** [from, to) float spans of the packed instance that ride each stream, in order. */
export const DYN_SPANS = Object.freeze([
  [0, 12],
  [21, 24],
]);
export const STATIC_SPANS = Object.freeze([
  [12, 21],
  [24, 51],
]);
/** Dirty ranges closer than this many items apart are merged (re-uploading a clean item is harmless). */
export const MERGE_GAP_ITEMS = 1;
/** Above this share of dirty items the whole static stream goes up in one call. */
export const FULL_UPLOAD_SHARE = 0.5;

let dynScratch = new Float32Array(0);
let statScratch = new Float32Array(0);

/** One slot per persistent static GPU buffer. */
export function createStreamSlot() {
  return { shadow: new Uint32Array(0), n: 0 };
}

/** The slot's GPU buffer was reallocated or lost: forget the shadow so the next plan uploads everything. */
export function invalidateSlot(slot) {
  slot.n = 0;
}

/**
 * Plan one draw's uploads.
 * @param {Float32Array} packed  packInstanceData output (n * 51 floats)
 * @param {{shadow: Uint32Array, n: number}} slot
 * @returns {{ n:number, dynamic:Float32Array, statics:Float32Array, ranges:Array<[number,number]>,
 *            dynBytes:number, staticBytes:number }}
 *   `dynamic` / `statics` are scratch views valid until the next call. `ranges` are [startItem, endItem) over the
 *   static stream; the slot's shadow is already updated to match once the caller uploads them.
 */
export function planStreams(packed, slot) {
  const n = Math.floor(packed.length / INSTANCE_STRIDE_EXPECTED);
  if (dynScratch.length < n * DYN_FLOATS)
    dynScratch = new Float32Array(Math.max(n * DYN_FLOATS, dynScratch.length * 2));
  if (statScratch.length < n * STATIC_FLOATS)
    statScratch = new Float32Array(Math.max(n * STATIC_FLOATS, statScratch.length * 2));
  const dyn = dynScratch;
  const stat = statScratch;
  for (let i = 0; i < n; i++) {
    const s = i * INSTANCE_STRIDE_EXPECTED;
    const d = i * DYN_FLOATS;
    for (let k = 0; k < 12; k++) dyn[d + k] = packed[s + k];
    dyn[d + 12] = packed[s + 21];
    dyn[d + 13] = packed[s + 22];
    dyn[d + 14] = packed[s + 23];
    const t = i * STATIC_FLOATS;
    for (let k = 0; k < 9; k++) stat[t + k] = packed[s + 12 + k];
    for (let k = 0; k < 27; k++) stat[t + 9 + k] = packed[s + 24 + k];
  }

  // Diff the static stream against the shadow BY BITS (so -0 vs 0 and NaN payloads are exact, not "equal").
  const bits = new Uint32Array(stat.buffer, 0, n * STATIC_FLOATS);
  if (slot.shadow.length < n * STATIC_FLOATS) {
    const grown = new Uint32Array(Math.max(n * STATIC_FLOATS, slot.shadow.length * 2));
    grown.set(slot.shadow.subarray(0, slot.n * STATIC_FLOATS));
    slot.shadow = grown;
  }
  const shadow = slot.shadow;
  const known = Math.min(slot.n, n);
  const ranges = [];
  let dirtyItems = 0;
  let runStart = -1;
  let lastDirty = -1;
  for (let i = 0; i < n; i++) {
    let dirty = i >= known;
    if (!dirty) {
      const t = i * STATIC_FLOATS;
      for (let k = 0; k < STATIC_FLOATS; k++) {
        if (bits[t + k] !== shadow[t + k]) {
          dirty = true;
          break;
        }
      }
    }
    if (!dirty) continue;
    dirtyItems++;
    if (runStart >= 0 && i - lastDirty - 1 <= MERGE_GAP_ITEMS) {
      lastDirty = i;
    } else {
      if (runStart >= 0) ranges.push([runStart, lastDirty + 1]);
      runStart = i;
      lastDirty = i;
    }
  }
  if (runStart >= 0) ranges.push([runStart, lastDirty + 1]);

  let out = ranges;
  if (n > 0 && dirtyItems > n * FULL_UPLOAD_SHARE) out = [[0, n]];
  // Commit: the shadow now equals what the caller is about to put on the GPU.
  for (const [a, b] of out) shadow.set(bits.subarray(a * STATIC_FLOATS, b * STATIC_FLOATS), a * STATIC_FLOATS);
  slot.n = n;

  let uploadedItems = 0;
  for (const [a, b] of out) uploadedItems += b - a;
  return {
    n,
    dynamic: dyn.subarray(0, n * DYN_FLOATS),
    statics: stat.subarray(0, n * STATIC_FLOATS),
    ranges: out,
    dynBytes: n * DYN_FLOATS * 4,
    staticBytes: uploadedItems * STATIC_FLOATS * 4,
  };
}

/** Test/proof helper: rebuild the packed 51-float array from the two streams (what the GPU effectively reads). */
export function reassemble(dynamic, statics, n) {
  const out = new Float32Array(n * INSTANCE_STRIDE_EXPECTED);
  for (let i = 0; i < n; i++) {
    const s = i * INSTANCE_STRIDE_EXPECTED;
    const d = i * DYN_FLOATS;
    const t = i * STATIC_FLOATS;
    for (let k = 0; k < 12; k++) out[s + k] = dynamic[d + k];
    out[s + 21] = dynamic[d + 12];
    out[s + 22] = dynamic[d + 13];
    out[s + 23] = dynamic[d + 14];
    for (let k = 0; k < 9; k++) out[s + 12 + k] = statics[t + k];
    for (let k = 0; k < 27; k++) out[s + 24 + k] = statics[t + 9 + k];
  }
  return out;
}
