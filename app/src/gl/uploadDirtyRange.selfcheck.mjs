// uploadDirtyRange.selfcheck.mjs — #533 PR2: dirty sub-range instance uploads.
//
// Node-only, pure: computeDirtySpans() from dirtyRanges.mjs (the diff the
// renderer uses to decide which sub-ranges of the instance buffer to push).
// Deterministic: given a known dirty set, assert exactly which float spans
// are uploaded and that a no-change frame uploads nothing.
//
// The pixel-identical guarantee rests on the shadow invariant (the
// renderer's shadow always mirrors the GL buffer contents); these tests pin
// the span math that invariant depends on.

import assert from 'node:assert';
import { computeDirtySpans, COALESCE_GAP_FLOATS, FULL_UPLOAD_DIRTY_FRACTION, FULL_UPLOAD_MAX_SPANS } from './dirtyRanges.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const f32 = (arr) => new Float32Array(arr);
const fill = (len, v) => f32(new Array(len).fill(v));

// --- Span shape --------------------------------------------------------------

ok('no changes → no spans, nothing to upload', () => {
  const r = computeDirtySpans(fill(100, 1), fill(100, 1));
  assert.deepEqual(r.spans, []);
  assert.equal(r.dirtyFloats, 0);
  assert.equal(r.coveredFloats, 0);
});

ok('single dirty float → one tight span', () => {
  const prev = fill(100, 1);
  const next = fill(100, 1);
  next[42] = 2;
  const r = computeDirtySpans(prev, next);
  assert.deepEqual(r.spans, [[42, 43]]);
  assert.equal(r.dirtyFloats, 1);
  assert.equal(r.coveredFloats, 1);
  assert.equal(r.full, false);
});

ok('dirty floats past the shadow end count as fully dirty (grown buffer)', () => {
  const prev = fill(80, 1);
  const next = fill(100, 1);
  next[10] = 9;
  const r = computeDirtySpans(prev, next);
  assert.deepEqual(r.spans, [[10, 11], [80, 100]]);
  assert.equal(r.dirtyFloats, 1 + 20);
});

ok('null shadow → full upload recommendation', () => {
  const r = computeDirtySpans(null, fill(100, 1));
  assert.equal(r.full, true);
  assert.deepEqual(r.spans, [[0, 100]]);
});

ok('empty next → empty spans', () => {
  const r = computeDirtySpans(fill(10, 1), fill(0, 0));
  assert.deepEqual(r.spans, []);
});

// --- Coalescing ---------------------------------------------------------------

ok('spans within the coalesce gap merge into one', () => {
  const prev = fill(200, 1);
  const next = fill(200, 1);
  next[10] = 2;
  next[10 + COALESCE_GAP_FLOATS] = 2; // exactly at the gap limit → merges
  const r = computeDirtySpans(prev, next);
  assert.deepEqual(r.spans, [[10, 10 + COALESCE_GAP_FLOATS + 1]]);
});

ok('spans past the coalesce gap stay separate', () => {
  const prev = fill(200, 1);
  const next = fill(200, 1);
  next[10] = 2;
  next[10 + COALESCE_GAP_FLOATS + 2] = 2; // gap of 17 clean floats → separate
  const r = computeDirtySpans(prev, next);
  assert.deepEqual(r.spans, [[10, 11], [10 + COALESCE_GAP_FLOATS + 2, 10 + COALESCE_GAP_FLOATS + 3]]);
});

// --- Full-upload fallback ------------------------------------------------------

ok('more than half dirty → full upload recommended', () => {
  const len = 100;
  const prev = fill(len, 1);
  const next = fill(len, 1);
  for (let i = 0; i < len * FULL_UPLOAD_DIRTY_FRACTION + 1; i++) next[i] = 2;
  const r = computeDirtySpans(prev, next);
  assert.equal(r.full, true, `dirtyFloats=${r.dirtyFloats} of ${len}`);
});

ok('too many spans → full upload recommended even when few floats are dirty', () => {
  const len = (FULL_UPLOAD_MAX_SPANS + 1) * (COALESCE_GAP_FLOATS + 2);
  const prev = fill(len, 1);
  const next = fill(len, 1);
  for (let k = 0; k <= FULL_UPLOAD_MAX_SPANS; k++) next[k * (COALESCE_GAP_FLOATS + 2)] = 2;
  const r = computeDirtySpans(prev, next);
  assert.ok(r.spans.length > FULL_UPLOAD_MAX_SPANS, `spans=${r.spans.length}`);
  assert.equal(r.full, true);
});

ok('everything dirty → full upload (one span covering all)', () => {
  const prev = fill(50, 1);
  const next = fill(50, 2);
  const r = computeDirtySpans(prev, next);
  assert.equal(r.full, true);
  assert.deepEqual(r.spans, [[0, 50]]);
});

// --- Edge values ---------------------------------------------------------------

ok('NaN↔NaN counts as clean (no per-frame churn on uninitialized floats)', () => {
  const prev = fill(100, 1);
  const next = fill(100, 1);
  prev[5] = NaN; next[5] = NaN;
  const r = computeDirtySpans(prev, next);
  assert.deepEqual(r.spans, []);
  assert.equal(r.dirtyFloats, 0);
});

ok('NaN→number counts as dirty', () => {
  const prev = fill(100, 1);
  const next = fill(100, 1);
  prev[5] = NaN; next[5] = 3;
  const r = computeDirtySpans(prev, next);
  assert.deepEqual(r.spans, [[5, 6]]);
});

ok('dirty span at the very start and end of the buffer', () => {
  const prev = fill(100, 1);
  const next = fill(100, 1);
  next[0] = 2; next[99] = 2;
  const r = computeDirtySpans(prev, next);
  assert.deepEqual(r.spans, [[0, 1], [99, 100]]);
});

console.log(`uploadDirtyRange selfcheck: ${n} checks passed`);
