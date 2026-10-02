// #808 — EVOLVE stamp accepts loopTimeMs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('#808 triggerEvolve reads opts.loopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/state/slices/davisSlice.js'), 'utf8');
  assert.match(src, /opts\.loopTimeMs/);
  assert.match(src, /Number\.isFinite\(opts\.loopTimeMs\)/);
});

test('#808 live loop exposes getLoopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/gl/liveLoop.mjs'), 'utf8');
  assert.match(src, /getLoopTimeMs:\s*\(\)\s*=>\s*loopTimeMs/);
});

test('#808 App time-evolve passes loopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/App.jsx'), 'utf8');
  assert.match(src, /TRIGGER_EVOLVE, payload: \{ loopTimeMs \}/);
  assert.match(src, /triggerEvolve\(\{ loopTimeMs:/);
});

function codeLines(rel) {
  return readFileSync(join(APP, rel), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*');
    });
}

test('#808 evolve/phrase gates have no Date.now() in code', () => {
  for (const f of [
    'src/state/slices/davisSlice.js',
    'src/App.jsx',
    'src/hooks/usePhraseLoop.js',
    'src/gl/loopClock.js',
  ]) {
    const hits = codeLines(f).filter((l) => l.includes('Date.now()'));
    assert.deepEqual(hits, [], `${f} must not gate evolve/phrase timing on Date.now()`);
  }
});

test('#808 evolve/phrase intervals are loop-time accumulators, not setInterval', () => {
  for (const f of ['src/App.jsx', 'src/hooks/usePhraseLoop.js']) {
    const hits = codeLines(f).filter((l) => l.includes('setInterval'));
    assert.deepEqual(hits, [], `${f} must not drive evolve/phrase cadence with setInterval`);
  }
  for (const f of ['src/App.jsx', 'src/hooks/usePhraseLoop.js', 'src/state/slices/davisSlice.js']) {
    const src = readFileSync(join(APP, f), 'utf8');
    assert.match(src, /loopClock/, `${f} reads the loop clock`);
  }
  const accum = readFileSync(join(APP, 'src/gl/loopClock.js'), 'utf8');
  assert.match(accum, /loopIntervalTick/);
});
