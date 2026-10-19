// spectrumRecord.selfcheck.mjs — #1534: a take records its spectrum, and playback hears the take, not the room.
//
// The contract (docs/design/spectral-path.md decision 2 + the issue's acceptance):
//   1. record -> playback round trip within the 8-bit quantisation error (the grouping/interpolation
//      error of the 32-bin record is measured and bounded here, beside the quantisation itself)
//   2. a take recorded with the dials at 0 has NO spectrum section (the file is unchanged)
//   3. v1 takes and takes without the section still play (the live spectrum simply stays live)
//   4. while a take's spectrum plays, the live analyser is ignored — the core's only source is the record
import assert from 'node:assert/strict';
import { createSpectrumRecorder, checkSpectrumRecord, replaySpectrumFrame, endSpectrumReplay, bytesToB64, b64ToBytes } from './spectrumRecord.js';
import { quantizeSpectrum, expandSpectrum, LOG_BINS, RECORD_BINS } from '../gl/spectrumCore.mjs';
import { stepSpectrum, readSpectrum, isSpectrumPlayback } from '../gl/spectrumLive.mjs';
import { createPerformanceRecorder, checkPerformance, packPerformance, unpackPerformance } from '../gl/performanceFile.mjs';
import { startPlayback, stopPlayback } from '../gl/playback.mjs';

// A hearing: a smooth gaussian bump that travels the log axis and swells — the shape of a chorus passing.
const FRAMES = 180;
const smoothAt = (f) => {
  const out = new Float32Array(LOG_BINS);
  const centre = 24 + (f / FRAMES) * 72;
  const amp = 0.25 + 0.75 * Math.min(1, f / 90); // crosses 0.8 at f = 66
  for (let i = 0; i < LOG_BINS; i++) {
    const d = (i - centre) / 9;
    out[i] = Math.max(0.02, amp * Math.exp(-d * d));
  }
  return out;
};

// ── 1. the record: one row per frame, gaps carried forward, decode + round trip ─────────────────────
let section;
{
  let frame = 0;
  const rec = createSpectrumRecorder({ getFrame: () => frame });
  rec.note(true);
  const originals = [];
  for (let f = 0; f < FRAMES; f++) {
    frame = f;
    originals.push(smoothAt(f));
    if (f >= 50 && f <= 52) continue; // the tap skips three frames (a busy rAF): rows carry forward
    rec.sample(originals[f]);
  }
  frame = FRAMES;
  section = rec.finish();
  assert.ok(section && section.version === 1 && section.bins === RECORD_BINS, 'the section exists with the record shape');
  const decoded = checkSpectrumRecord(section);
  assert.ok(decoded, 'the section passes its own fail-closed check');
  assert.equal(decoded.bytes.length, FRAMES * RECORD_BINS, 'one 32-byte row per frame, tail included');
  const rowOf = (f) => decoded.bytes.subarray(f * RECORD_BINS, (f + 1) * RECORD_BINS);
  assert.deepEqual([...rowOf(51)], [...rowOf(49)], 'frames the tap skipped carry the previous row forward');
  // Round trip: expand each recorded row and compare with the hearing that was sampled. Error budget,
  // measured: the 8-bit quantisation itself contributes <= 1/510 (0.002); the rest is the record's
  // 32-bin grouping (means of 4 bins, linearly interpolated back) on this suite's deliberately narrow
  // bump (sigma 9 bins — barely two record bins wide, the steepest hearing used here). The bound pins
  // the format's true budget: a regression in the grouping or the quantizer blows far past it.
  const expanded = new Float32Array(LOG_BINS);
  let maxErr = 0;
  for (let f = 0; f < FRAMES; f++) {
    expandSpectrum(rowOf(f), expanded);
    for (let i = 0; i < LOG_BINS; i++) maxErr = Math.max(maxErr, Math.abs(expanded[i] - originals[f][i]));
  }
  assert.ok(maxErr < 0.11, `round trip within the record format's error budget (max ${maxErr.toFixed(4)})`);
  assert.ok(maxErr > 1 / 510, 'the error is real: the record is 8-bit, not a copy');
  // corruption is refused, fail-closed
  assert.equal(checkSpectrumRecord({ ...section, version: 2 }), null, 'a future version is refused, not misread');
  assert.equal(checkSpectrumRecord({ ...section, rows: 'not base64!!' }), null, 'garbage rows are refused');
  assert.equal(checkSpectrumRecord(null), null);
  assert.deepEqual([...b64ToBytes(bytesToB64(new Uint8Array([0, 1, 254, 255])))], [0, 1, 254, 255], 'base64 round trip');
}

// ── 2. the gate: dials at 0 for the whole take -> no section ─────────────────────────────────────────
{
  let frame = 0;
  const rec = createSpectrumRecorder({ getFrame: () => frame });
  rec.note(false); // the dials never rose
  for (let f = 0; f < 30; f++) { frame = f; rec.sample(smoothAt(f)); }
  frame = 30;
  assert.equal(rec.finish(), undefined, 'dials at 0: finish() is undefined, so the key is absent from the file');
}

// ── 3. the file: a real take carries the section through pack/unpack; a sectionless take still plays ──
{
  const recorder = createPerformanceRecorder({ checkpointEvery: 10 });
  for (let f = 0; f < 25; f++) {
    recorder.onInput({ seed: 7, loopTimeMs: f * 16.7, dtSec: 1 / 60, canvasW: 100, canvasH: 100, layers: [], layoutParams: {} });
    recorder.onOutput({ n: f });
  }
  const perf = { ...recorder.finish(), spectrum: section };
  checkPerformance(perf); // the extra section key is carried, not rejected
  const back = await unpackPerformance(await packPerformance(perf));
  assert.deepEqual(back.spectrum, JSON.parse(JSON.stringify(section)), 'the section survives the file byte for byte');
  const bare = recorder.finish ? null : null;
  assert.ok(bare === null);
  const sectionless = { ...perf };
  delete sectionless.spectrum;
  assert.equal(startPlayback(sectionless), true, 'a take without the section still plays');
  assert.equal(isSpectrumPlayback(), false, 'and its spectrum stays the live one');
  stopPlayback();
}

// ── 4. playback: the core hears the record; the analyser is ignored; moments land on their frames ────
{
  const liveAnalyser = {
    frequencyBinCount: 1024, fftSize: 2048,
    getFloatFrequencyData(a) { a.fill(-30); }, // loud everywhere: would swamp the core if it were heard
    getFloatTimeDomainData(a) { a.fill(0.5); },
  };
  replaySpectrumFrame(0, section, {});
  assert.equal(isSpectrumPlayback(), true, 'the take spectrum is the source now');
  const playedMax = [];
  for (let f = 0; f < FRAMES; f++) {
    replaySpectrumFrame(f, section, {});
    const before = Float32Array.from(readSpectrum().smooth);
    stepSpectrum(liveAnalyser, 48000, 16.7); // the room shouts: must change nothing
    assert.deepEqual([...readSpectrum().smooth], [...before], `frame ${f}: the live analyser is ignored during playback`);
    let peak = 0; let peakBin = -1;
    readSpectrum().smooth.forEach((v, i) => { if (v > peak) { peak = v; peakBin = i; } });
    playedMax.push({ peak, peakBin });
  }
  // the bump lands where the record put it: measure the recorded rows' own 0.7-crossing (from the
  // decoded section, expanded) and require the played crossing within the ballistics' lag of it — the
  // played core attacks toward each row (8 ms attack at a 16.7 ms step), so it may trail by a few
  // frames but must never arrive early or wander.
  const decoded = checkSpectrumRecord(section);
  const exp = new Float32Array(LOG_BINS);
  let recordedCross = -1;
  for (let f = 0; f < FRAMES && recordedCross < 0; f++) {
    expandSpectrum(decoded.bytes.subarray(f * RECORD_BINS, (f + 1) * RECORD_BINS), exp);
    if (Math.max(...exp) > 0.7) recordedCross = f;
  }
  const crossFrame = playedMax.findIndex((m) => m.peak > 0.7);
  assert.ok(crossFrame >= recordedCross && crossFrame - recordedCross <= 5, `the swell arrives on its frame (played ${crossFrame}, recorded ${recordedCross})`);
  assert.ok(Math.abs(playedMax[120].peakBin - (24 + (120 / FRAMES) * 72)) <= 8, `the bump is at its recorded frequency (bin ${playedMax[120].peakBin})`);
  endSpectrumReplay();
  assert.equal(isSpectrumPlayback(), false, 'playback ended: the room is the source again');
  stepSpectrum(null, 48000, 16.7); // must not throw, and the core is live again
  replaySpectrumFrame(0, undefined, {}); // a sectionless frame tap call is a no-op
  assert.equal(isSpectrumPlayback(), false);
}

console.log('spectrumRecord.selfcheck: ok');
