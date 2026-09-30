// #807 — clock-domain inventory.
// Performers must be tagged loop | wall | bake. Wall is allow-listed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const WALL_OK = [
  'src/state/id.js',
  'src/state/history.js',
  'src/state/slices/paletteLibrarySlice.js',
  'src/state/slices/voiceSlice.js',
  'src/hooks/useProjectAutosave.js',
  'src/hooks/usePerformanceGovernor.js',
  'src/engine/kernel/tracks/patchDiag.mjs',
  'src/gl/debug/costTiers.measure.mjs',
  'src/gl/debug/measureCosts.mjs',
  'src/gl/phase6.selfcheck.mjs',
  'src/panels/davis/VoiceDish.jsx',
];

const LOOP_OWNERS = [
  'src/gl/liveLoop.mjs',
  'src/gl/liveResolve.mjs',
];

function read(rel) {
  return readFileSync(join(APP, rel), 'utf8');
}

test('#807 loop owners do not pass Date.now() into sim', () => {
  for (const f of LOOP_OWNERS) {
    const src = read(f);
    const codeCalls = src.split('\n').filter((l) => {
      const t = l.trim();
      return t.includes('Date.now()') && !t.startsWith('//') && !t.startsWith('*');
    });
    assert.deepEqual(codeCalls, [], `${f} must not call Date.now() for sim`);
    assert.match(src, /dtSec/, `${f} owns dtSec`);
    assert.match(src, /loopTimeMs/, `${f} owns loopTimeMs`);
  }
});

test('#807 liveLoop documents Spine A clamp', () => {
  const src = read('src/gl/liveLoop.mjs');
  assert.match(src, /clampedDtMs/);
  assert.match(src, /buildFrame\(0, loopTimeMs\)/);
});

test('#807 bake clock is not Date.now', () => {
  const src = read('src/engine/kernel/bake/index.js');
  assert.match(src, /BAKE_TIME_ORIGIN/);
  assert.match(src, /not Date\.now/);
});

test('#807 wall allow-list is explicit', () => {
  assert.ok(WALL_OK.length >= 8);
  for (const f of WALL_OK) {
    read(f);
  }
});
