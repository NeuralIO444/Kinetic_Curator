// replayGate.selfcheck.mjs — #1638: THE GATE. A recorded take, replayed and hash-compared, in CI.
//
// Determinism used to be proven locally, by hand, when someone remembered. This suite is the memory:
// it replays the committed 60-second fixture (src/gl/fixtures/replayGate.kcperf — provenance beside
// it) through a fresh resolver and compares every checkpoint hash. A change that breaks replay —
// a state order flip, an unseeded call, a clock leak — turns this suite red and names the first
// divergent checkpoint, in the ordinary selfcheck jobs. No separate CI step, no advisory mode.
//
// The fixture was recorded with the spectrum marks' dials up and carries its spectrum section, as
// the issue specifies (#1534: the section is what playback hears). The checkpoint chain itself is
// the resolver's — the marks ride the render contract assembled after the resolve, and never
// entered it; the gate asserts the section is present and valid, and compares the chain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPerformance, unpackPerformance } from './performanceFile.mjs';
import { checkSpectrumRecord } from '../curator/spectrumRecord.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const perf = await unpackPerformance(readFileSync(join(HERE, 'fixtures/replayGate.kcperf')));
const clone = () => JSON.parse(JSON.stringify(perf));
const firstCheckpointAtOrAfter = (f) => perf.checkpoints.find((c) => c.frame >= f).frame;

// the fixture is what the gate stands on: a full-length take whose hearing is in the file
const section = checkSpectrumRecord(perf.spectrum);
assert.ok(section, 'the fixture carries a valid spectrum section (#1534)');
assert.equal(section.bytes.length / section.bins, perf.frames, 'one recorded row per frame');
assert.equal(perf.checkpoints.length, 61, 'a 60-second take: 61 checkpoints');

// THE GATE: replay the fixture and compare every checkpoint.
{
  const t0 = Date.now();
  const v = verifyPerformance(perf);
  assert.equal(v.kernelMismatch, false, 'the fixture was recorded by this kernel');
  assert.equal(v.firstMismatchFrame, null, 'no checkpoint diverges');
  assert.equal(v.ok, true, 'the take replays to the same performance');
  assert.equal(v.checked, perf.checkpoints.length, 'every checkpoint was compared');
  console.log(`replayGate: fixture replayed green in ${((Date.now() - t0) / 1000).toFixed(1)}s (${v.frames} frames, ${v.checked} checkpoints)`);
}

// A perturbed recorded input turns the gate red at the expected checkpoint — the first checkpoint
// at or after the altered frame, so the failure names where to start looking, not just THAT it
// failed. Proven at two points of the take: an early alteration brackets to the next checkpoint,
// a mid-take one likewise.
for (const F of [5, 1801]) {
  const p2 = clone();
  const step = { ...(p2.inputs.steps[F] || {}) };
  step.k = { ...(step.k || {}), seed: 4242 };
  p2.inputs.steps[F] = step;
  const v = verifyPerformance(p2);
  assert.equal(v.ok, false, `an input altered at frame ${F} must fail the gate`);
  assert.equal(v.firstMismatchFrame, firstCheckpointAtOrAfter(F), `divergence from frame ${F} is named at checkpoint ${firstCheckpointAtOrAfter(F)}`);
}

console.log('replayGate.selfcheck: ok');
