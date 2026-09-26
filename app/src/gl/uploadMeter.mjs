// uploadMeter.mjs — #533 PR1: upload-byte meter (measure-only).
//
// Counts what drawInstances() pushes to the GPU per bufferSubData call
// (uploadedBytes, uploadCalls) and, by byte-diffing each call against a
// shadow copy of the same call-index-in-frame from the previous frame,
// how many of those bytes actually changed (changedBytes).
//
// Wiring (all inside renderer.mjs, #533 is not allowed to touch liveLoop.mjs):
//   - renderFrameInto() calls beginFrame() once per frame
//   - drawInstances() calls noteUpload(u8 view of the uploaded data) per
//     bufferSubData
//
// Pure and DOM-free (browser-safe, no Node imports). Always on: the per-frame
// cost is one memcpy + one byte-compare of the instance buffer, small next
// to the upload + instanced draw it measures. PR2 (dirty-range uploads) uses
// these numbers at the decision gate: changed/uploaded > 0.7 → not worth it.

let frames = 0;          // beginFrame() calls since reset
let uploadedBytes = 0;   // cumulative bytes handed to bufferSubData
let changedBytes = 0;    // cumulative bytes differing from last frame's shadow
let uploadCalls = 0;     // cumulative drawInstances uploads
let callIndex = 0;       // call slot within the current frame
let shadows = [];        // per-call-slot Uint8Array shadow of the last frame

/** Start a new frame: call-slot indexing restarts at 0. */
export function beginFrame() {
  callIndex = 0;
  frames++;
}

/**
 * Record one bufferSubData upload.
 * @param {Uint8Array} bytes — the exact bytes uploaded this call
 *   (e.g. new Uint8Array(data.buffer, data.byteOffset, data.byteLength)).
 *   Copied into the shadow slot before returning; safe to reuse after.
 */
export function noteUpload(bytes) {
  const n = bytes.length >>> 0;
  uploadCalls++;
  uploadedBytes += n;
  let s = shadows[callIndex];
  if (!s || s.length !== n) {
    // First sighting of this slot (or a resized upload): everything counts
    // as changed — this is the honest "we don't know the delta" fallback.
    s = new Uint8Array(n);
    s.set(bytes);
    shadows[callIndex] = s;
    changedBytes += n;
  } else {
    let diff = 0;
    for (let i = 0; i < n; i++) {
      if (s[i] !== bytes[i]) diff++;
    }
    changedBytes += diff;
    s.set(bytes);
  }
  callIndex++;
}

/** Point-in-time read of the cumulative counters. */
export function snapshot() {
  return {
    frames,
    uploadCalls,
    uploadedBytes,
    changedBytes,
    changedPerUploaded: uploadedBytes > 0 ? changedBytes / uploadedBytes : Number.NaN,
  };
}

/** Zero every counter and drop all shadows. */
export function reset() {
  frames = 0;
  uploadedBytes = 0;
  changedBytes = 0;
  uploadCalls = 0;
  callIndex = 0;
  shadows = [];
}
