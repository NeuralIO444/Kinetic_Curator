// node scripts/refreshFixtureCheckpoints.selfcheck.mjs
// The checkpoint-only re-record tool is trustworthy only if, on a tree where the fixtures already verify, it
// reproduces them byte-for-byte (no stray re-encoding), deterministically — and if it notices a real divergence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshFile, diffLeaves } from './refreshFixtureCheckpoints.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../src/data/layout-modes.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../src/gl/fixtures');

for (const name of ['replayGate.kcperf', 'creatureRepipe.kcperf']) {
  const bytes = readFileSync(join(FIX, name));
  const { report } = await refreshFile(bytes);
  assert.equal(report.originalVerifies, true, `${name}: the committed fixture verifies on this tree`);
  assert.equal(report.diffLeaves, 0, `${name}: nothing to refresh`);
  assert.equal(report.deterministic, true, `${name}: deterministic`);
  assert.equal(report.outSha, report.inSha, `${name}: the refresh reproduces the committed file byte-for-byte`);
  console.log(`[ok] ${name} — reproduced byte-for-byte (${report.checkpoints} checkpoints)`);
}

// a real divergence is noticed: a key ADDED to the shared defaults echoes into the hashed output, so every
// checkpoint moves while the inputs stay untouched (the shape of every sanctioned re-record so far)
{
  const bytes = readFileSync(join(FIX, 'creatureRepipe.kcperf'));
  DEFAULT_LAYOUT_PARAMS.__selfcheckProbe = 0;
  try {
    const { report } = await refreshFile(bytes);
    assert.equal(report.originalVerifies, false, 'a new default key moves the chain');
    assert.ok(report.diffLeaves > 0, 'the refresh rewrites checkpoints');
    assert.deepEqual(report.nonCheckpointDiffs, [], 'and only checkpoints');
    assert.equal(report.deterministic, true);
    // the strip proof undoes it
    const stripped = await refreshFile(bytes, { strip: ['__selfcheckProbe'] });
    assert.equal(stripped.report.originalVerifies, true, '--strip: with the key removed the original verifies');
  } finally {
    delete DEFAULT_LAYOUT_PARAMS.__selfcheckProbe;
  }
  assert.ok(!('__selfcheckProbe' in DEFAULT_LAYOUT_PARAMS), 'defaults restored');
  console.log('[ok] a new default key moves checkpoints only; --strip proves it');
}

assert.deepEqual(diffLeaves({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }], c: 1 }), ['$.a.1.b', '$.c']);
console.log('refreshFixtureCheckpoints.selfcheck: ok');
