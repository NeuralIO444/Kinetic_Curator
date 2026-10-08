// #817 — missing atlas cell skips the instance; live tint does not rebake.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { packInstanceData } from './renderer.mjs';
import { comboKey } from './liveAtlas.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));

function inst(over = {}) {
  return {
    asset: 'mark', tint: '#111111', accent: '#eeeeee',
    x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    ...over,
  };
}

test('#817 missing cell is skipped and the frame continues', () => {
  const cells = {
    'mark|#111111|#eeeeee': { u0: 0.1, v0: 0.2, u1: 0.3, v1: 0.4 },
  };
  const packed = packInstanceData([
    inst({ asset: 'ghost' }),
    inst(),
  ], cells);
  assert.equal(packed.length, 21, 'the present combo still packs (21-float stride since #1129 PR2)');
  assert.ok(Math.abs(packed[6] - 0.1) < 1e-6, 'uv survived the skip');
  assert.ok(packed[12] > 0, 'ink is an attribute, not a rebaked cell');
  assert.equal(packInstanceData([inst({ asset: 'ghost' })], cells).length, 0);
  assert.equal(packInstanceData([inst()], null).length, 0);
});

test('#817 live atlas key is the asset, not the ink', () => {
  assert.equal(comboKey('mark', '#111111', '#eeeeee'), 'mark');
  assert.equal(comboKey('mark', '#ffffff', '#000000'), comboKey('mark'));
  const loop = readFileSync(join(DIR, 'liveLoop.mjs'), 'utf8');
  assert.match(loop, /bakeLiveAtlas/);
  assert.match(loop, /Returns null when a bake is in flight \(hold last frame\)/);
  assert.doesNotMatch(loop, /comboKey\(c\.asset, c\.ink, c\.accent\) \+ /);
});
