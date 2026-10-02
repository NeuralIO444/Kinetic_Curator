// #810 — capture / stills do not advertise Date.now as the sim clock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('#810 loop-capture docs loopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/hooks/useLoopCapture.js'), 'utf8');
  assert.match(src, /loopTimeMs from the live loop/);
  assert.doesNotMatch(src, /Date\.now drives the noise field/);
});

test('#810 liveLoop captureFrame exists next to getLoopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/gl/liveLoop.mjs'), 'utf8');
  assert.match(src, /captureFrame/);
  assert.match(src, /getLoopTimeMs/);
});

test('#810 bake origin is pinned', () => {
  const src = readFileSync(join(APP, 'src/engine/kernel/bake/index.js'), 'utf8');
  assert.match(src, /BAKE_TIME_ORIGIN/);
});

test('#810 in-thread captureFrame samples the live loop clock (#452)', () => {
  // The default (in-thread) capture path must resolve with the CURRENT
  // loopTimeMs — never 0 (which rewinds warp/morph, #452) — and a zero
  // dtSec so the capture is a true peek at the presented frame rather
  // than an extra, uncounted physics step outside the tick cadence.
  const src = readFileSync(join(APP, 'src/gl/liveLoop.mjs'), 'utf8');
  assert.match(src, /const frame = buildFrame\(0, loopTimeMs\);/);
  // Scope the no-arg check to captureFrame's own body: a bare buildFrame()
  // there would default loopTimeMs back to 0.
  const start = src.indexOf('function captureFrame(opts');
  const end = src.indexOf('\n  function ', start + 1);
  const captureBody = src.slice(start, end).replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(captureBody, /buildFrame\(\s*\)/, 'captureFrame must not call buildFrame() with no args');
});

test('#810 capture orchestration uses no wall clock', () => {
  // useLoopCapture (loop takes) and useMediaExport (stills/REC) must not
  // sample Date.now()/performance.now() for sim time. Wall-clock sleeps
  // that pace the MediaRecorder are recorder honesty, not sim time (#805
  // is CI flake on WebM duration — explicitly out of scope per #810).
  for (const f of ['src/hooks/useLoopCapture.js', 'src/hooks/useMediaExport.js']) {
    const src = readFileSync(join(APP, f), 'utf8');
    assert.doesNotMatch(src, /Date\.now\s*\(/, `${f} must not use Date.now()`);
    assert.doesNotMatch(src, /performance\.now\s*\(/, `${f} must not use performance.now()`);
  }
});

test('#810 worker capture delegates via CAPTURE_FRAME', () => {
  // The opt-in worker path captures through the worker's CAPTURE_FRAME
  // message. The no-advance resolve (current loopTimeMs + last dtSec,
  // same as the presented frame) lives in renderWorker.js — #809's
  // in-flight lane owns that file, so this test only pins the delegation
  // contract, not the clock behavior.
  const src = readFileSync(join(APP, 'src/gl/workerLiveLoop.js'), 'utf8');
  assert.match(src, /CAPTURE_FRAME/);
});
