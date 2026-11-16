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
  OPTIONAL_SIM_KERNELS,
  DEFAULT_SIM_BACKENDS,
  simLawFor,
  currentSimStamp,
  checkSimStamp,
  unrunnableSimBackends,
} from '../engine/kernel/simBackends.js';
import {
  unpackPerformance,
  checkPerformance,
  verifyPerformance,
  createPerformanceRecorder,
  PerformanceFileError,
} from './performanceFile.mjs';

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
  // K1 4c: a gpu.gs.v1 take REPLAYS everywhere (its field is the recorded input.dishFluidCells); an id this build has never heard of cannot
  assert.deepEqual(unrunnableSimBackends(gpu.simBackends), []);
  assert.deepEqual(unrunnableSimBackends({ ...DEFAULT_SIM_BACKENDS, fluid: 'warp.9' }), ['fluid']);
  // K2 2b: a gpu.life.v1 take replays everywhere too (its grid is the recorded input.dishCultureCells), and implies decisions-exact
  const gl = currentSimStamp({ ...DEFAULT_SIM_BACKENDS, culture: 'gpu.life.v1' });
  assert.equal(gl.simLaw, 'decisions-exact');
  assert.deepEqual(checkSimStamp(gl.simLaw, gl.simBackends), gl);
  assert.deepEqual(unrunnableSimBackends(gl.simBackends), []);
  const both = currentSimStamp({ ...DEFAULT_SIM_BACKENDS, fluid: 'gpu.gs.v1', culture: 'gpu.life.v1' });
  assert.deepEqual(checkSimStamp(both.simLaw, both.simBackends), both);
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

await ok(
  'D: a gpu.gs.v1 take parses, verifies, and reports itself runnable (its field is a recorded input — K1 4c)',
  () => {
    const stamp = currentSimStamp({ ...DEFAULT_SIM_BACKENDS, fluid: 'gpu.gs.v1' });
    const p = { ...perfs.replayGate, ...stamp };
    checkPerformance(p);
    const v = verifyPerformance(p);
    assert.equal(v.simLaw, 'decisions-exact');
    assert.deepEqual(v.simUnrunnable, [], 'every known backend replays here; the unrunnable report is pinned in A');
    assert.equal(v.ok, true, 'the decision chain still verifies — nothing here re-ran the fluid on another backend');
  },
);

// K3 slice 2c/2d (Matt, 2026-11-16: optional key) — `contacts` is an OPTIONAL simBackends key.
await ok(
  'E: the optional contacts key — absent = the JS-era header unchanged; present validates, implies decisions-exact, replays',
  async () => {
    // absent: the stamp is byte-for-byte what it was
    const plain = currentSimStamp();
    assert.deepEqual(Object.keys(plain.simBackends), ['fluid', 'culture', 'swarm']);
    assert.equal(plain.simLaw, 'js-exact');
    assert.deepEqual([...OPTIONAL_SIM_KERNELS], ['contacts']);
    // present, GPU: decisions-exact, validates, round-trips, runnable (its list is the recorded input.dishContactStamps)
    const gc = currentSimStamp({ ...DEFAULT_SIM_BACKENDS, contacts: 'gpu.contacts.v1' });
    assert.equal(gc.simLaw, 'decisions-exact');
    assert.equal(gc.simBackends.contacts, 'gpu.contacts.v1');
    assert.deepEqual(checkSimStamp(gc.simLaw, gc.simBackends), gc);
    assert.deepEqual(unrunnableSimBackends(gc.simBackends), []);
    // present, JS: still js-exact
    const jc = currentSimStamp({ ...DEFAULT_SIM_BACKENDS, contacts: 'js.contacts.v1' });
    assert.equal(jc.simLaw, 'js-exact');
    assert.deepEqual(checkSimStamp(jc.simLaw, jc.simBackends), jc);
    // fail closed: an unknown contacts backend, an unknown extra key, a missing required key
    assert.throws(
      () => checkSimStamp('js-exact', { ...DEFAULT_SIM_BACKENDS, contacts: 'nope' }),
      /not a known backend/,
    );
    assert.throws(() => checkSimStamp('js-exact', { ...DEFAULT_SIM_BACKENDS, grid: 'js.x.v1' }), /must name/);
    const { fluid: _f, ...noFluid } = DEFAULT_SIM_BACKENDS;
    assert.throws(() => checkSimStamp('js-exact', noFluid), /must name/);
    assert.deepEqual(unrunnableSimBackends({ ...DEFAULT_SIM_BACKENDS, contacts: 'warp.9' }), ['contacts']);
    // the recorder stamps it exactly when a frame carried a contact list
    const stamps = { nb: 4, a: Uint16Array.of(0), b: Uint16Array.of(2) };
    const rec = (withStamps) => {
      const r = createPerformanceRecorder();
      r.onInput({ loopTimeMs: 0, ...(withStamps ? { dishContactStamps: stamps } : {}) });
      r.onOutput({ layers: [] });
      return r.finish();
    };
    const g = rec(true);
    assert.equal(g.simBackends.contacts, 'gpu.contacts.v1');
    assert.equal(g.simLaw, 'decisions-exact');
    assert.equal(checkPerformance(JSON.parse(JSON.stringify(g))).simBackends.contacts, 'gpu.contacts.v1');
    const j = rec(false);
    assert.equal('contacts' in j.simBackends, false, 'no GPU contact list = the unchanged all-JS header');
    assert.equal(j.simLaw, 'js-exact');
  },
);

console.log(`simBackends.selfcheck: OK (${n} groups) — K1 slice 1 #2186`);
