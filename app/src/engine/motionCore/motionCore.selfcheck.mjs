// node src/engine/motionCore/motionCore.selfcheck.mjs
//
// #2112 — Motion Core P1: the contract and the registry. Anchor law enforced at registration, duplicate / unknown
// family / unknown time base / unregistered cost tier refused, composePose associative with identity neutral, timeFor
// exact for every time base the motion map lists, and the module imports nothing from gl/, state/, curator/, panels/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  POSE_IDENTITY,
  MOTION_FAMILIES,
  TIME_BASES,
  registerMotionSource,
  getMotionSource,
  listMotionSources,
  composePose,
  timeFor,
} from './index.js';
import { registerCostTier } from '../kernel/costRegistry.mjs';
import { kinemePhase } from '../../data/kinemes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

registerCostTier('motionCore/test', { tier: 3, notes: 'selfcheck probe' });
const good = (over = {}) => ({
  id: 'kineme:test-rock',
  family: 'kineme',
  timeBase: 'kineme',
  costTier: 'motionCore/test',
  // a rock: zero at t = 0, then a swing
  evaluate: (node, t) => ({ dRot: 10 * Math.sin(t * 2 * Math.PI + node.phase01 * 2 * Math.PI) - 10 * Math.sin(node.phase01 * 2 * Math.PI) }),
  ...over,
});

ok('a well-formed source registers, comes back frozen, and is listed', () => {
  const rec = registerMotionSource(good());
  assert.ok(Object.isFrozen(rec));
  assert.equal(getMotionSource('kineme:test-rock'), rec);
  assert.ok(listMotionSources().includes(rec));
  assert.equal(getMotionSource('nope'), undefined);
  assert.ok(Object.isFrozen(POSE_IDENTITY));
  assert.deepEqual({ ...POSE_IDENTITY }, { dx: 0, dy: 0, dRot: 0, sx: 1, sy: 1, dAlpha: 0 });
});

ok('anchor law: a source that is not identity at t = 0 cannot register', () => {
  assert.throws(() => registerMotionSource(good({ id: 'bad:offset', evaluate: () => ({ dx: 1 }) })), /anchor law/);
  assert.throws(() => registerMotionSource(good({ id: 'bad:scale', evaluate: () => ({ sx: 1.1 }) })), /anchor law/);
  // bakes the node's phase into its rest value: caught by the second probe node (phase 0.37)
  assert.throws(
    () => registerMotionSource(good({ id: 'bad:phase', evaluate: (node) => ({ dRot: node.phase01 * 20 }) })),
    /anchor law/,
  );
  assert.throws(() => registerMotionSource(good({ id: 'bad:nan', evaluate: () => ({ dx: NaN }) })), /finite/);
  assert.equal(getMotionSource('bad:offset'), undefined, 'a refused source is not registered');
  // a sparse delta that is identity where it speaks is fine (a missing field is rest)
  registerMotionSource(good({ id: 'kineme:test-sparse', evaluate: (node, t) => (t === 0 ? {} : { dy: t }) }));
});

ok('duplicate id, unknown family, unknown time base, unregistered cost tier, malformed record all fail', () => {
  assert.throws(() => registerMotionSource(good()), /already registered/);
  assert.throws(() => registerMotionSource(good({ id: 'x:fam', family: 'mystery' })), /unknown family/);
  assert.throws(() => registerMotionSource(good({ id: 'x:base', timeBase: 'weeks' })), /unknown time base/);
  assert.throws(() => registerMotionSource(good({ id: 'x:tier', costTier: 'never/registered' })), /cost tier/);
  assert.throws(() => registerMotionSource(good({ id: 'x:fn', evaluate: undefined })), /evaluate/);
  assert.throws(() => registerMotionSource(good({ id: '' })), /id/);
  assert.throws(() => registerMotionSource(null), /object/);
  for (const f of MOTION_FAMILIES) assert.ok(typeof f === 'string');
});

ok('composePose is associative on a fixture, and identity is neutral on both sides', () => {
  const A = { dx: 2, dy: -1, dRot: 15, sx: 2, sy: 0.5, dAlpha: 0.25 };
  const B = { dx: 0.5, dy: 4, dRot: -7.5, sx: 4, sy: 2, dAlpha: -0.125 };
  const C = { dx: -3, dy: 0.25, dRot: 90, sx: 0.5, sy: 8, dAlpha: 0.5 };
  assert.deepEqual(composePose(composePose(A, B), C), composePose(A, composePose(B, C)));
  assert.deepEqual(composePose(POSE_IDENTITY, A), composePose(A, POSE_IDENTITY));
  assert.deepEqual({ ...composePose(POSE_IDENTITY, A) }, A);
  assert.deepEqual({ ...composePose(A, POSE_IDENTITY) }, A);
  assert.deepEqual({ ...composePose(POSE_IDENTITY, POSE_IDENTITY) }, { ...POSE_IDENTITY });
  assert.deepEqual({ ...composePose({ dx: 1 }, { dx: 2 }) }, { ...POSE_IDENTITY, dx: 3 }, 'a sparse delta is rest elsewhere');
  assert.ok(Object.isFrozen(composePose(A, B)));
});

ok('timeFor: 120 BPM, bar 2 beat 1 (0-based, as the musical clock) maps exactly to seconds / frames / bars', () => {
  // gl/musicalClock.mjs: bar and beat are 0-based, phase 0..1 in the beat. bar 2 beat 1 = beat 9 of the loop.
  const view = { bar: 2, beat: 1, phase: 0, bpm: 120, fps: 60 };
  assert.equal(timeFor({ timeBase: 'seconds' }, view), 4.5, '9 beats at 120 BPM = 4.5 s');
  assert.equal(timeFor({ timeBase: 'frames' }, view), 270, '4.5 s at 60 fps');
  assert.equal(timeFor({ timeBase: 'bars' }, view), 2.25, '2 bars and a quarter');
  // a half-way phase moves each exactly
  const half = { ...view, phase: 0.5 };
  assert.equal(timeFor({ timeBase: 'seconds' }, half), 4.75);
  assert.equal(timeFor({ timeBase: 'bars' }, half), 2.375);
  // an explicit seconds / frame in the view wins over derivation
  assert.equal(timeFor({ timeBase: 'seconds' }, { seconds: 1.5, bar: 2, beat: 1, bpm: 120 }), 1.5);
  assert.equal(timeFor({ timeBase: 'frames' }, { frame: 99, seconds: 4.5, fps: 60 }), 99);
  // bars from seconds when there is no musical position
  assert.equal(timeFor({ timeBase: 'bars' }, { seconds: 4.5, bpm: 120 }), 2.25);
  // a 3-beat bar
  assert.equal(timeFor({ timeBase: 'bars' }, { bar: 1, beat: 1, phase: 0, beatsPerBar: 3 }), 4 / 3);
});

ok('timeFor covers all six time bases the motion map lists, plus bars, and never substitutes one for another', () => {
  assert.deepEqual([...TIME_BASES], ['seconds', 'kineme', 'driver', 'frames', 'travel', 'boil', 'bars']);
  const view = { seconds: 10, kinemeSeconds: 12.5, driverSeconds: 7.25, frame: 600, travel: 3.5, boilStep: 41 };
  assert.equal(timeFor({ timeBase: 'seconds' }, view), 10, 'loop time');
  assert.equal(timeFor({ timeBase: 'kineme' }, view), 12.5, 'kinemeTime (audio-routed rate)');
  assert.equal(timeFor({ timeBase: 'driver' }, view), 7.25, 'driverSec (rate only): can differ from kinemeTime');
  assert.equal(timeFor({ timeBase: 'frames' }, view), 600, 'resolver-frame counter');
  assert.equal(timeFor({ timeBase: 'travel' }, view), 3.5, 'travel integrator');
  assert.equal(timeFor({ timeBase: 'boil' }, view), 41, 'boil step');
  // no silent fallback: a view without kinemeSeconds does not hand back loop seconds
  assert.throws(() => timeFor({ timeBase: 'kineme' }, { seconds: 10 }), /kinemeSeconds/);
  assert.throws(() => timeFor({ timeBase: 'driver' }, { seconds: 10, kinemeSeconds: 10 }), /driverSeconds/);
  assert.throws(() => timeFor({ timeBase: 'travel' }, {}), /travel/);
  assert.throws(() => timeFor({ timeBase: 'boil' }, {}), /boilStep/);
  assert.throws(() => timeFor({ timeBase: 'frames' }, { seconds: 1 }), /frame/);
  assert.throws(() => timeFor({ timeBase: 'weeks' }, view), /unknown time base/);
});

ok('a node phase from the house seed hash is deterministic, and a registered source evaluates as a pure function', () => {
  const node = { key: 'a#1', seedOffset: 3, phase01: kinemePhase(3, 'a#1') };
  assert.equal(node.phase01, kinemePhase(3, 'a#1'));
  const src = getMotionSource('kineme:test-rock');
  assert.deepEqual(src.evaluate(node, 0.3, {}), src.evaluate(node, 0.3, {}), 'same input, same pose');
  const rest = composePose(POSE_IDENTITY, src.evaluate(node, 0, {}));
  assert.deepEqual({ ...rest }, { ...POSE_IDENTITY }, 'rest at t = 0');
});

ok('the module imports nothing from gl/, state/, curator/ or panels/, and uses no clock or chance', () => {
  const text = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const imports = [...text.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['../kernel/costRegistry.mjs'], `imports: ${imports.join(', ')}`);
  for (const spec of imports) assert.ok(!/(^|\/)(gl|state|curator|panels)\//.test(spec), `forbidden import ${spec}`);
  const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/Date\.now|performance\.now|Math\.random/.test(code), 'no Date.now / performance.now / Math.random');
});

console.log(`motionCore.selfcheck: ${n} checks passed`);
