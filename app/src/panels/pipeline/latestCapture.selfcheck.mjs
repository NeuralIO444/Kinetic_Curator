// latestCapture.selfcheck — LATEST readout under PIPELINE ESSENTIALS.
import assert from 'node:assert/strict';
import { latestCaptureView, statusTone } from './latestCapture.mjs';

// empty / bad input → no readout
assert.equal(latestCaptureView([]), null);
assert.equal(latestCaptureView(undefined), null);

// newest is the LAST entry (exportSlice appends)
const v = latestCaptureView([
  { seed: 1, resolution: '1X', timestamp: '10:00:00' },
  { seed: 255, resolution: '2X · ACCUM', timestamp: '10:05:00', thumb: 'data:x' },
]);
assert.equal(v.seed, 'ff');
assert.equal(v.resolution, '2X · ACCUM');
assert.equal(v.time, '10:05:00');
assert.equal(v.thumb, 'data:x');
assert.equal(v.countLabel, '2 kept');

// no thumb → format fallback
assert.equal(latestCaptureView([{ seed: 3 }]).format, 'PNG');

// status tone keeps the old DIAGNOSTICS colour rule
assert.equal(statusTone(null), 'none');
assert.equal(statusTone('Batch done: 12 PNGs'), 'good');
assert.equal(statusTone('Project loaded'), 'good');
assert.equal(statusTone('Import failed'), 'accent');

console.log('latestCapture selfcheck: ok');
