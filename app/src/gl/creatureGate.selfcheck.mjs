// creatureGate.selfcheck.mjs — #1694 slice 1: THE CREATURE GATE. The pre-repipe take, replayed and hash-compared.
//
// The standing replay gate (#1638) cannot see a creature divergence: its fixture's session never raises
// creatureCount, so the take carries no creatures. This gate's fixture (src/gl/fixtures/creatureRepipe.kcperf —
// provenance beside it) was recorded from the PRISTINE pre-repipe code, through the channel as it stood (App's
// frame tap → the singleton trackers → providers → resolver inputs), with auto spawn, formation, Davis birth
// traits, limb growth and dish hosting all exercised. Slice 1 moves spawning inside the resolver; this suite is
// the contract that the move changed nothing: the fixture replays through the repiped resolver, unmodified,
// every checkpoint. If it ever goes red, the slice stops — the fixture is never re-recorded to make it green.
// (Checkpoint re-record, 2026-10-19, #1694 S3, Matt's ruling — the provenance file beside the fixture has the
// full record: S3 made the count a BUILD layout param, the hashed output gained the `creatures` key, and all
// 16 checkpoints moved. The fixture's INPUTS are still the pristine pre-repipe take, byte-identical; only the
// checkpoint hashes were re-recorded, after proving the original checkpoints verify 16/16 on S3 code with the
// key stripped. The contract below is unchanged: the recorded decisions in the take are the creatures.)
// (Second checkpoint re-record, 2026-10-21 at publish, #1356, Matt's ruling — the provenance file has the
// record: the finishing look pass landed the layered part art (F1) and the dish accent split (F2); items
// embed the full asset record, so 15 of 16 checkpoints moved — checkpoint 0 stands, frame 0 precedes any
// creature draw. Inputs byte-identical, deep diff hashes-only, same refresh discipline as S3. A first
// re-record staged 2026-10-20 against the pre-travel fixture was superseded by the publish rebase and
// re-done against main bd9a181d; the staged dish-golden re-pins reproduced exactly.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPerformance, unpackPerformance } from './performanceFile.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const perf = await unpackPerformance(readFileSync(join(HERE, 'fixtures/creatureRepipe.kcperf')));
const clone = () => JSON.parse(JSON.stringify(perf));
const firstCheckpointAtOrAfter = (f) => perf.checkpoints.find((c) => c.frame >= f).frame;

// the fixture is what the gate stands on: a creature-bearing take, both families, decisions in the file
assert.equal(perf.frames, 901, 'the scripted 15-second take');
assert.equal(perf.checkpoints.length, 16, 'a checkpoint every 60 frames');
{
  const steps = perf.inputs.steps;
  assert.ok(steps.some((s) => s.k && Array.isArray(s.k.dishFormed) && s.k.dishFormed.some(Boolean)), 'pins formed in the take');
  assert.ok(steps.some((s) => s.k && Array.isArray(s.k.dishTraits) && s.k.dishTraits.some(Boolean)), 'Davis stamped a birth in the take');
  assert.ok(steps.some((s) => s.k && Array.isArray(s.k.dishLimbs) && s.k.dishLimbs.some((n) => n >= 2)), 'a second pair of wings grew in the take');
  assert.ok(steps.some((s) => s.k && Array.isArray(s.k.dishHosted) && s.k.dishHosted.some(Boolean)), 'the dish creature was hosted in the take');
}

// THE GATE: replay the pre-repipe fixture and compare every checkpoint.
{
  const t0 = Date.now();
  const v = verifyPerformance(perf);
  assert.equal(v.kernelMismatch, false, 'the fixture was recorded by this kernel');
  assert.equal(v.firstMismatchFrame, null, 'no checkpoint diverges');
  assert.equal(v.ok, true, 'the pre-repipe take replays identically on the current path');
  assert.equal(v.checked, perf.checkpoints.length, 'every checkpoint was compared');
  console.log(`creatureGate: pre-repipe fixture replayed green in ${((Date.now() - t0) / 1000).toFixed(1)}s (${v.frames} frames, ${v.checked} checkpoints)`);
}

// A perturbed recorded decision turns the gate red at the expected checkpoint: the creatures are in the
// take, not recomputed — wipe the recorded formed flags and the replay names the divergence (the same
// forged-take idiom as the spawn suite's). The recorded homes bite the same way: move one, get red.
{
  const p2 = clone();
  const j = p2.inputs.steps.findIndex((s) => s.k && Array.isArray(s.k.dishFormed) && s.k.dishFormed.some(Boolean));
  assert.ok(j >= 0, 'a step carries recorded formed flags to tamper with');
  for (const s of p2.inputs.steps.slice(j)) if (s.k && Array.isArray(s.k.dishFormed)) s.k.dishFormed = s.k.dishFormed.map(() => false);
  const v = verifyPerformance(p2);
  assert.equal(v.ok, false, 'un-forming every pin is caught');
  assert.equal(v.firstMismatchFrame, firstCheckpointAtOrAfter(j), 'divergence is named at the first checkpoint at or after the edit');
}
{
  const p3 = clone();
  const j = p3.inputs.steps.findIndex((s) => s.k && Array.isArray(s.k.dishPins) && s.k.dishPins.length > 0);
  assert.ok(j >= 0, 'a step carries recorded homes to tamper with');
  p3.inputs.steps[j].k.dishPins[0] = { ...p3.inputs.steps[j].k.dishPins[0], x: p3.inputs.steps[j].k.dishPins[0].x + 40 };
  const v = verifyPerformance(p3);
  assert.equal(v.ok, false, 'a moved home is caught');
  assert.equal(v.firstMismatchFrame, firstCheckpointAtOrAfter(j), 'divergence is named at the first checkpoint at or after the edit');
}

console.log('creatureGate.selfcheck: ok');
