// node src/gl/simBackends.selfcheck.mjs
// K1 slice 1 (#2186, K0 R1/R4): the sim stamp in a take.
//   A the pure module: the law follows the backends; a malformed or inconsistent stamp is refused; absent is lawful
//   B a fresh recording carries the stamp (all-JS, 'js-exact'); both committed fixtures (recorded before the stamp
//     existed) still parse and verify, read as all-JS
//   C the file door is fail-closed: lone keys, unknown backends, a law that contradicts the backends all refuse
//   D a take naming a backend this build cannot run (the future GPU fluid) parses, and verify REPORTS it
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SIM_KERNELS,
  DEFAULT_SIM_BACKENDS,
  simLawFor,
  currentSimStamp,
  checkSimStamp,
  unrunnableSimBackends,
} from '../engine/kernel/simBackends.js';
import { unpackPerformance, checkPerformance, verifyPerformance, PerformanceFileError } from './performanceFile.mjs';

let n = 0;
const ok = (name, fn) =>
  Promise.resolve(fn()).then(() => {
    n++;
    console.log(`  [ok] ${name}`);
  });

await ok('A: the law follows the backends; stamps are validated; absent is lawful', () => {
  assert.deepEqual(currentSimStamp(), { simLaw: 'js-exact', simBackends: DEFAULT_SIM_BACKENDS });
  assert.equal(simLawFor({ ...DEFAULT_SIM_BACKENDS, fluid: 'gpu.gs.v1' }), 'decisions-exact');
  assert.deepEqual(checkSimStamp(undefined, undefined), { simLaw: 'js-exact', simBackends: DEFAULT_SIM_BACKENDS });
  const gpu = currentSimStamp({ ...DEFAULT_SIM_BACKENDS, fluid: 'gpu.gs.v1' });
  assert.equal(gpu.simLaw, 'decisions-exact');
  assert.deepEqual(checkSimStamp(gpu.simLaw, gpu.simBackends), gpu);
  assert.throws(() => checkSimStamp('js-exact', undefined), /come together/);
  assert.throws(() => checkSimStamp(undefined, DEFAULT_SIM_BACKENDS), /come together/);
  assert.throws(() => checkSimStamp('js-exact', { fluid: 'js.gs.v1' }), /exactly/);
  assert.throws(() => checkSimStamp('js-exact', { ...DEFAULT_SIM_BACKENDS, swarm: 'warp.9' }), /not a known backend/);
  assert.throws(() => checkSimStamp('js-exact', gpu.simBackends), /does not match/);
  assert.throws(() => checkSimStamp('decisions-exact', DEFAULT_SIM_BACKENDS), /does not match/);
  assert.deepEqual(unrunnableSimBackends(DEFAULT_SIM_BACKENDS), []);
  assert.deepEqual(unrunnableSimBackends(gpu.simBackends), ['fluid']);
  assert.deepEqual([...SIM_KERNELS], ['fluid', 'culture', 'swarm']);
});

const fixtures = ['replayGate', 'creatureRepipe'];
const perfs = {};
for (const f of fixtures)
  perfs[f] = await unpackPerformance(
    new Uint8Array(fs.readFileSync(new URL(`./fixtures/${f}.kcperf`, import.meta.url))),
  );

await ok('B: pre-stamp fixtures still parse and verify, read as all-JS', () => {
  for (const f of fixtures) {
    const p = perfs[f];
    assert.equal(p.simLaw, undefined, `${f} was recorded before the stamp`);
    const v = verifyPerformance(p);
    assert.equal(v.ok, true, `${f} verifies`);
    assert.equal(v.simLaw, 'js-exact');
    assert.deepEqual(v.simBackends, DEFAULT_SIM_BACKENDS);
    assert.deepEqual(v.simUnrunnable, []);
  }
});

await ok('C: the file door is fail-closed', () => {
  const base = perfs.replayGate;
  const bad = (patch, re) =>
    assert.throws(
      () => checkPerformance({ ...base, ...patch }),
      (e) => e instanceof PerformanceFileError && re.test(e.message),
    );
  bad({ simLaw: 'js-exact' }, /come together/);
  bad({ simBackends: DEFAULT_SIM_BACKENDS }, /come together/);
  bad({ simLaw: 'js-exact', simBackends: { ...DEFAULT_SIM_BACKENDS, culture: 'nope' } }, /not a known backend/);
  bad({ simLaw: 'decisions-exact', simBackends: DEFAULT_SIM_BACKENDS }, /does not match/);
  checkPerformance({ ...base, ...currentSimStamp() }); // a well-formed stamp passes
});

await ok('D: a take naming a backend this build cannot run parses, and verify reports it', () => {
  const stamp = currentSimStamp({ ...DEFAULT_SIM_BACKENDS, fluid: 'gpu.gs.v1' });
  const p = { ...perfs.replayGate, ...stamp };
  checkPerformance(p);
  const v = verifyPerformance(p);
  assert.equal(v.simLaw, 'decisions-exact');
  assert.deepEqual(v.simUnrunnable, ['fluid']);
  assert.equal(v.ok, true, 'the decision chain still verifies — nothing here re-ran the fluid on another backend');
});

console.log(`simBackends.selfcheck: OK (${n} groups) — K1 slice 1 #2186`);
