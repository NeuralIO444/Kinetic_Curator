// kinemeSources.selfcheck.mjs — Motion Core P2a (#2113): the GPU kineme library through the Motion Core contract.
// The CPU reference matches a table derived BY HAND from the QUAD_VS formulas (gl/shaders.mjs:161-170) — worked out
// independently of the module, in a separate script, and pasted here as literals — at 8 times x 3 phases per kind;
// every library kineme is a registered source; the anchor law holds for the phase-0 node and the phase offset is the
// shader's own; nothing in the app calls the adapter yet.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { KINEMES, getKineme, spinKineme } from '../../data/kinemes.js';
import { getMotionSource, listMotionSources, registerMotionSource, POSE_IDENTITY } from './index.js';
import { registerCostTier } from '../kernel/costRegistry.mjs';
import { kinemePose, kinemeSourceId, spinPose, oscPose, pulsePose, blinkPose, bobPose } from './kinemeSources.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

const TS = [0, 0.25, 0.7, 1.0, 1.9, 2.4, 3.3, 10.01];
const PH = [0, 0.25, 0.6];
// rows = TS, columns = PH. Hand-derived: ph = fract(t / period + phase); wav = sin(ph * 2pi).
const TABLE = {
  // library `spin` (period 4, amp 0): dRot = ph * 360
  spin: [[0, 90, 216], [22.5, 112.5, 238.5], [63, 153, 279], [90, 180, 306], [171, 261, 27], [216, 306, 72], [297, 27, 153], [180.9, 270.9, 36.9]],
  // a reversed spin (period 4, amp -1): dRot = -ph * 360
  spinReverse: [[0, -90, -216], [-22.5, -112.5, -238.5], [-63, -153, -279], [-90, -180, -306], [-171, -261, -27], [-216, -306, -72], [-297, -27, -153], [-180.9, -270.9, -36.9]],
  // library `rock` (osc, period 2.4, amp 18): dRot = 18 * wav
  rock: [[0, 18, -10.580134541268], [10.957705722158, 14.280360125241, -17.258755227629], [17.386664873203, -4.658742811849, -11.327767038892], [8.999999999997, -15.588457268122, 1.881512338818], [-17.386664873202, 4.658742811846, 11.327767038895], [0, 18, -10.580134541268], [12.727922061356, -12.727922061361, -2.815820370717], [15.818708027916, 8.58885768467, -17.846007504728]],
  // library `pulse` (period 1.6, amp 0.12): sx = sy = 1 + 0.12 * wav
  pulse: [[1, 1.12, 0.929465769725], [1.099776353476, 1.066668427962, 0.880092515651], [1.045922011884, 0.889134456099, 1.028013443663], [0.915147186258, 0.915147186258, 1.118522600871], [1.110865543901, 1.045922011884, 0.883315609552], [1, 0.88, 1.070534230275], [1.045922011884, 1.110865543901, 0.897683180277], [1.119907484349, 0.995288822109, 0.905761968294]],
  // library `blink` (period 1, duty 0.5): visible while ph < 0.5 -> dAlpha 0, else -1
  blink: [[0, 0, -1], [0, -1, -1], [-1, -1, 0], [0, 0, -1], [-1, 0, -1], [0, -1, 0], [0, -1, -1], [0, 0, -1]],
  // library `bob` (period 3, amp 6): dy = 6 * wav
  bob: [[0, 6, -3.526711513756], [3, 5.196152422706, -5.481272745856], [5.96713137221, 0.627170779605, -5.196152422706], [5.196152422706, -3.000000000001, -2.440419858453], [-4.458868952865, -4.014783638152, 5.96713137221], [-5.70633909777, 1.85410196625, 3.526711513754], [3.526711513755, 4.854101966249, -5.706339097771], [5.132185560963, -3.10816205624, -2.32509351871]],
};
const RECORD = {
  spin: getKineme('spin'),
  spinReverse: { id: 'rev', kind: 'spin', period: 4.0, amp: -1 },
  rock: getKineme('rock'),
  pulse: getKineme('pulse'),
  blink: getKineme('blink'),
  bob: getKineme('bob'),
};
const FIELD = { spin: 'dRot', spinReverse: 'dRot', rock: 'dRot', bob: 'dy', blink: 'dAlpha' };
const FN = { spin: spinPose, spinReverse: spinPose, rock: oscPose, pulse: pulsePose, blink: blinkPose, bob: bobPose };

ok('the CPU reference matches the hand-derived GLSL table: 5 kinds + a reversed spin, 8 times x 3 phases', () => {
  for (const name of Object.keys(TABLE)) {
    const k = RECORD[name];
    assert.ok(k, `${name}: library record found`);
    TS.forEach((t, i) =>
      PH.forEach((p, j) => {
        const want = TABLE[name][i][j];
        const pose = FN[name](k, t, p);
        const viaDispatch = kinemePose(k, t, p);
        assert.deepEqual(pose, viaDispatch, `${name}: kinemePose dispatches to the same function`);
        if (name === 'pulse') {
          near(pose.sx, want, `pulse sx t=${t} phase=${p}`);
          near(pose.sy, want, `pulse sy t=${t} phase=${p}`);
        } else near(pose[FIELD[name]], want, `${name} t=${t} phase=${p}`);
      }),
    );
  }
});

ok('the id-keyed osc `bend` is the same math as an osc (its articulation is the pack\'s, not the shader\'s)', () => {
  const bend = getKineme('bend');
  assert.equal(bend.kind, 'osc');
  near(kinemePose(bend, 1.1, 0.3).dRot, 6 * Math.sin((((1.1 / 3.6 + 0.3) % 1) + 0) * 6.28318530718), 'bend');
});

ok('a negative-amp spin from spinKineme (#1127) turns the other way; a spin with amp 0 turns forward', () => {
  const fwd = spinKineme(1, 0);
  const rev = spinKineme(1, 4);
  assert.ok(fwd.amp === 0 && rev.amp === -1);
  assert.ok(kinemePose(fwd, 0.3, 0).dRot > 0);
  assert.ok(kinemePose(rev, 0.3, 0).dRot < 0);
});

ok('listMotionSources() contains every KINEMES id as kineme:<id>, family kineme, on the kineme time base', () => {
  const listed = new Set(listMotionSources().map((s) => s.id));
  for (const k of KINEMES) {
    const id = kinemeSourceId(k.id);
    assert.equal(id, `kineme:${k.id}`);
    assert.ok(listed.has(id), `${id} is listed`);
    const s = getMotionSource(id);
    assert.equal(s.family, 'kineme');
    assert.equal(s.timeBase, 'kineme', 'the shader reads u_kinemeTime, the kineme clock');
    assert.equal(s.costTier, 'motionCore/kineme-adapter');
  }
  assert.equal(KINEMES.length, 6, 'the library is spin, rock, pulse, blink, bob, bend');
});

ok('a registered source evaluates to the same pose as the reference, reading the node\'s phase', () => {
  for (const k of KINEMES) {
    const s = getMotionSource(kinemeSourceId(k.id));
    for (const t of TS)
      for (const p of PH) {
        const got = s.evaluate({ key: 'x', seedOffset: 0, phase01: p }, t, {});
        assert.deepEqual(got, kinemePose(k, t, p), `${k.id} t=${t} phase=${p}`);
      }
  }
});

ok('anchor law: every library source is identity at t = 0 for the phase-0 node; a phased node starts at the shader\'s own pose', () => {
  for (const k of KINEMES) {
    const s = getMotionSource(kinemeSourceId(k.id));
    const at0 = { ...POSE_IDENTITY, ...s.evaluate({ key: 'rest', seedOffset: 0, phase01: 0 }, 0, {}) };
    assert.deepEqual(at0, { ...POSE_IDENTITY }, `${k.id}: rest at phase 0`);
  }
  // the phase is a desync offset: at t = 0 a phased rock is mid-swing, exactly as QUAD_VS draws it (fract(0/per + phase))
  near(getMotionSource('kineme:rock').evaluate({ key: 'p', phase01: 0.37 }, 0).dRot, 18 * Math.sin(0.37 * 6.28318530718), 'rock at phase .37');
  assert.ok(Object.isFrozen(getMotionSource('kineme:rock').anchorNodes), 'the declared probe nodes are frozen on the record');
  assert.deepEqual(getMotionSource('kineme:rock').anchorNodes.map((x) => x.phase01), [0]);
});

ok('honest edge: a blink with a zero duty is hidden at rest, so it cannot register (the probe says so)', () => {
  registerCostTier('motionCore/kineme-adapter-test', { tier: 3, notes: 'selfcheck' });
  assert.throws(
    () =>
      registerMotionSource({
        id: 'kineme:test-zero-duty',
        family: 'kineme',
        timeBase: 'kineme',
        costTier: 'motionCore/kineme-adapter-test',
        anchorNodes: [{ key: 'a', seedOffset: 0, phase01: 0 }],
        evaluate: (node, t) => blinkPose({ period: 1, amp: 0 }, t, node.phase01),
      }),
    /anchor law/,
  );
});

ok('unknown kinds throw; the library records are untouched', () => {
  assert.throws(() => kinemePose({ kind: 'warp', period: 1, amp: 1 }, 0, 0), /unknown kineme kind/);
  assert.throws(() => kinemePose(null, 0, 0), /unknown kineme kind/);
  assert.ok(Object.isFrozen(KINEMES) && KINEMES.every((k) => Object.isFrozen(k)));
});

// "The renderer does not call the adapter": no module outside this directory's selfchecks imports kinemeSources.
ok('nothing in the app imports the adapter (renderer untouched); the module is pure and imports only data/kinemes, the cost registry and the contract', () => {
  const srcRoot = fileURLToPath(new URL('../../', import.meta.url));
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(m?js|jsx)$/.test(name)) files.push(full);
    }
  };
  walk(srcRoot);
  const importers = files.filter((f) => /kinemeSources/.test(readFileSync(f, 'utf8')));
  const names = importers.map((f) => f.slice(srcRoot.length)).sort();
  assert.deepEqual(names, ['engine/motionCore/kinemeSources.js', 'engine/motionCore/kinemeSources.selfcheck.mjs'].sort(), names.join(', '));
  const text = readFileSync(new URL('./kinemeSources.js', import.meta.url), 'utf8');
  const imports = [...text.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['../../data/kinemes.js', '../kernel/costRegistry.mjs', './index.js']);
  assert.ok(!/Date\.now|performance\.now|Math\.random/.test(text), 'no clock, no chance');
});

console.log(`kinemeSources.selfcheck: ${n} checks passed`);
