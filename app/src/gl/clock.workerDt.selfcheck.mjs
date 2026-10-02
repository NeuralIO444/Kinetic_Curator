// #809 — renderWorker speaks the same clock as the in-thread liveLoop.
// Ballistics take milliseconds; the resolver payload's clock fields match
// the in-thread resolver input shape (names + units): dtSec in seconds,
// loopTimeMs in milliseconds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(DIR, 'renderWorker.js'), 'utf8');
const LOOP = readFileSync(join(DIR, 'liveLoop.mjs'), 'utf8');

/** Extract the object literal passed to resolver.resolveLayers({...}). */
function resolveLayersArg(src, label) {
  const anchor = 'resolveLayers({';
  const start = src.indexOf(anchor);
  assert.ok(start !== -1, `${label}: resolveLayers({ call not found`);
  let depth = 0;
  for (let i = start + anchor.length - 1; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`${label}: unbalanced braces in resolveLayers call`);
}

test('#809 worker computes both dtMs and dtSec', () => {
  assert.match(SRC, /let dtMs, dtSec, frameTimeMs;/);
  assert.match(SRC, /dtSec = dtMs \/ 1000;/);
});

test('#809 ballistics get dtMs, resolver gets dtSec', () => {
  assert.match(SRC, /processBallistics\(ballisticsState, audioBands, dtMs\)/);
  assert.match(SRC, /dtSec,/);
  assert.doesNotMatch(SRC, /processBallistics\(ballisticsState, audioBands, dtSec\)/);
});

test('#809 worker clock runs in ms, dtSec is seconds', () => {
  // dtMs from a millisecond performance.now() delta; loopTimeMs accumulates ms.
  // (Live-tick branch; the peek branch overrides both — see the capture test.)
  assert.match(SRC, /dtMs = lastTickMs \? Math\.min\(now - lastTickMs, 100\) : 16\.667;/);
  assert.match(SRC, /loopTimeMs \+= dtMs;/);
  assert.match(SRC, /frameTimeMs = loopTimeMs;/);
  // In-thread reference: same shape, clamped ms delta.
  assert.match(LOOP, /const dtSec = clampedDtMs \/ 1000;/);
  assert.match(LOOP, /loopTimeMs \+= clampedDtMs;/);
});

test('#809 resolver payload clock fields match in-thread shape (names + units)', () => {
  const workerArg = resolveLayersArg(SRC, 'renderWorker.js');
  const loopArg = resolveLayersArg(LOOP, 'liveLoop.mjs');
  for (const field of ['dtSec', 'loopTimeMs']) {
    assert.match(workerArg, new RegExp(`\\b${field}\\b`), `worker payload missing ${field}`);
    assert.match(loopArg, new RegExp(`\\b${field}\\b`), `liveLoop payload missing ${field}`);
  }
  // dtSec must never be fed milliseconds: no dtMs inside the worker payload.
  assert.doesNotMatch(workerArg, /\bdtMs\b/);
});

test('#809 worker tint clock is the ms clock (frameTimeMs), like in-thread loopTimeMs', () => {
  // Tint machines stamp startMs/durMs — both paths hand them a millisecond
  // clock. The worker's frameTimeMs is loopTimeMs on live ticks (see the
  // 'worker clock runs in ms' test above).
  assert.match(SRC, /now: frameTimeMs,/);
  assert.match(LOOP, /now: loopTimeMs,/);
});

test('#809 worker CAPTURE_FRAME is a non-advancing peek (drive-by)', () => {
  // A capture resolves at the current clock without consuming wall dt or
  // moving loopTimeMs — mirrors in-thread buildFrame(0, loopTimeMs) (#810).
  assert.match(SRC, /function buildFrame\(dtSecOverride, loopTimeMsOverride\)/);
  assert.match(SRC, /const frame = buildFrame\(0, loopTimeMs\);/);
  assert.doesNotMatch(SRC, /case 'CAPTURE_FRAME':[\s\S]{0,400}?const frame = buildFrame\(\);/);
});
