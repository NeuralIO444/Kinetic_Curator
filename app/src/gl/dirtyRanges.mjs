// dirtyRanges.mjs — #533 PR2: dirty sub-range computation for instance uploads.
//
// Pure, DOM-free, GL-free: given the previous frame's uploaded Float32Array
// (what's currently in the GL buffer) and this frame's data, compute which
// float ranges changed, coalesce adjacent/nearby spans, and decide whether
// the change is small enough that sub-range uploads beat one full upload.
//
// The renderer keeps a shadow copy of exactly what it last wrote to the GL
// buffer, so "differs from shadow" ⟺ "differs from the buffer". After the
// renderer uploads the returned spans (or a full upload), the buffer holds
// exactly `next` — pixel-identical to the old always-full-upload path.
//
// Browser-safe, no Node imports. Unit-tested in uploadDirtyRange.selfcheck.mjs.

/** Max gap (in floats) between two dirty spans that still gets merged. */
export const COALESCE_GAP_FLOATS = 16;
/** If more than this fraction of floats are dirty, recommend a full upload. */
export const FULL_UPLOAD_DIRTY_FRACTION = 0.5;
/** If more spans than this survive coalescing, recommend a full upload
 *  (each span is a GL call; past this point call overhead wins). */
export const FULL_UPLOAD_MAX_SPANS = 16;

const isNaN32 = (v) => v !== v; // NaN is the only float != itself

/**
 * Diff `next` against `prev` and return the coalesced dirty spans.
 *
 * @param {Float32Array|null} prev — shadow of the GL buffer contents (may be
 *   shorter than `next`; bytes past its end count as dirty). Null = unknown.
 * @param {Float32Array} next — the data about to be uploaded.
 * @returns {{
 *   spans: Array<[number, number]>,  // half-open [f0, f1) float-index spans
 *   dirtyFloats: number,             // floats that differ (spans may cover more)
 *   coveredFloats: number,           // floats inside the returned spans
 *   full: boolean,                   // true → do one full upload instead
 * }}
 *   `full` is true when prev is null (nothing to diff against), when nothing
 *   is dirty (spans is empty — caller may skip the upload entirely), or when
 *   the change is too big/scattered for sub-ranges to win.
 */
export function computeDirtySpans(prev, next) {
  const n = next.length;
  if (prev === null || prev === undefined) {
    return { spans: n > 0 ? [[0, n]] : [], dirtyFloats: n, coveredFloats: n, full: true };
  }
  const m = prev.length < n ? prev.length : n;
  let dirtyFloats = 0;
  const spans = [];
  let s0 = -1; // open span start, -1 = none
  let gap = 0;
  for (let i = 0; i < m; i++) {
    const a = prev[i];
    const b = next[i];
    const dirty = a !== b && !(isNaN32(a) && isNaN32(b)); // NaN↔NaN counts as clean
    if (dirty) {
      dirtyFloats++;
      if (s0 < 0) {
        s0 = i; // start a new span
      } else if (gap > COALESCE_GAP_FLOATS) {
        spans.push([s0, i - gap]); // close the old span before the gap
        s0 = i;
      }
      gap = 0;
    } else if (s0 >= 0) {
      gap++;
    }
  }
  if (s0 >= 0) spans.push([s0, m - gap]);
  // Bytes past the end of the shadow are unknown → fully dirty.
  if (n > prev.length) {
    dirtyFloats += n - prev.length;
    if (spans.length && spans[spans.length - 1][1] === prev.length) {
      spans[spans.length - 1][1] = n; // extend the trailing span
    } else {
      spans.push([prev.length, n]);
    }
  }
  let coveredFloats = 0;
  for (const [f0, f1] of spans) coveredFloats += f1 - f0;

  const full =
    dirtyFloats > FULL_UPLOAD_DIRTY_FRACTION * n || spans.length > FULL_UPLOAD_MAX_SPANS;
  return { spans, dirtyFloats, coveredFloats, full };
}
