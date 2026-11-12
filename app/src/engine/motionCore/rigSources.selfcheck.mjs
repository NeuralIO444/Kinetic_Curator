// node src/engine/motionCore/rigSources.selfcheck.mjs
//
// #2114 — Motion Core P2b: the rig adapter. Gaits, the Jansen linkage and the roam as motion sources, NO behaviour change.
// Every source is registered and obeys the anchor law; every delta is exactly `pose − rest` of what poseRig / poseLinkage /
// roamAt return (Object.is), and rest + delta is the pose to within one ulp; the three kinematic files are untouched and
// nothing outside this selfcheck imports the adapter.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { POSE_IDENTITY, MOTION_FAMILIES, getMotionSource, listMotionSources, composePose } from './index.js';
import {
  RIG_SOURCE_IDS,
  RIG_COST_TIER,
  LINKAGE_SOURCE_ID,
  ROAM_SOURCE_ID,
  gaitSourceId,
  poseFigure,
} from './rigSources.js';
import { poseRig, LOIS_GAITS } from '../creatureRig.js';
import { poseLinkage, strideTileUnits } from '../beastRig.js';
import { roamAt, sanitizeRoam } from '../beastRoam.js';
import { sanitizeMeasures } from '../beastBuilder.js';
import { wildTypeMeasures } from '../jansenMeasures.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// hand-written rigs (poseRig reads only id / role / chain / parent / x / y / angle / len); no record assembly in this file
// on purpose: a guard elsewhere pins which files may read creature records
const head = { id: 'h', role: 'head', chain: -1, parent: null, x: 50, y: 20, angle: -90, len: 14 };
const limb = (chain, depth, x, y, angle, len) => ({
  id: `l${chain}.${depth}`,
  role: 'limb',
  chain,
  parent: depth ? `l${chain}.${depth - 1}` : null,
  x,
  y,
  angle,
  len,
});
const RIGS = [
  { bones: [head, limb(0, 0, 35, 70, 120, 30), limb(0, 1, 0, 0, 20, 24), limb(1, 0, 65, 70, 60, 30), limb(1, 1, 0, 0, -20, 24)] },
  { bones: [head, limb(0, 0, 40, 65, 100, 28), limb(0, 1, 0, 0, 15, 22)] },
  {
    bones: [
      { ...head, y: 12.345678, angle: -77.7 },
      limb(0, 0, 30, 72, 140, 31.5),
      limb(0, 1, 0, 0, 33, 25.25),
      limb(0, 2, 0, 0, -12, 14.125),
      limb(1, 0, 50, 80, 90, 29.9),
      limb(1, 1, 0, 0, 10, 23.3),
      limb(2, 0, 70, 72, 40, 31.1),
      limb(2, 1, 0, 0, -30, 24.7),
    ],
  },
];
const GAITS = Object.keys(LOIS_GAITS);
const TIMES = [0, 0.3, 1.4, 2.75, 9.1, 123.456];
const wild = sanitizeMeasures(wildTypeMeasures());
const LINKAGES = [
  { measures: wild, phase: 0 },
  { measures: sanitizeMeasures({ ...wildTypeMeasures(), legCount: 8, scale: 0.8 }), phase: 0.25 },
];
// one ulp of the larger operand: rest + (pose − rest) rounds against the bigger of the two, not against the pose
const ulp = (x, r = 0) => Number.EPSILON * Math.max(Math.abs(x), Math.abs(r), 1e-300);

ok('fixtures are real: three rigs with bones, two linkages that stand', () => {
  for (const r of RIGS) assert.ok(r && r.bones.length >= 3);
  for (const l of LINKAGES) assert.ok(poseLinkage(l, 0), 'a feasible linkage');
});

ok('every source is registered, with a family, the kineme time base and the adapter cost tier', () => {
  assert.deepEqual(RIG_SOURCE_IDS, [...GAITS.map(gaitSourceId), LINKAGE_SOURCE_ID, ROAM_SOURCE_ID]);
  for (const id of RIG_SOURCE_IDS) {
    const s = getMotionSource(id);
    assert.ok(s, id);
    assert.ok(MOTION_FAMILIES.includes(s.family));
    assert.equal(s.timeBase, 'kineme', `${id}: the live callers pass kinemeTime`);
    assert.equal(s.costTier, RIG_COST_TIER);
  }
  assert.equal(getMotionSource('gait:NOD').family, 'gait');
  assert.equal(getMotionSource(LINKAGE_SOURCE_ID).family, 'linkage');
  assert.equal(getMotionSource(ROAM_SOURCE_ID).family, 'transport');
});

ok('anchor law: a source with no figure is rest, and a figure at t = 0 is rest, for every source', () => {
  for (const id of RIG_SOURCE_IDS) {
    const s = getMotionSource(id);
    const bare = s.evaluate({ key: 'x', seedOffset: 0, phase01: 0.4 }, 0, {});
    assert.deepEqual({ ...POSE_IDENTITY, ...bare }, { ...POSE_IDENTITY });
  }
  for (const rig of RIGS)
    for (const g of GAITS)
      for (const b of rig.bones) {
        const d = getMotionSource(gaitSourceId(g)).evaluate({ key: b.id }, 0, { rig, phase: 0.3 });
        for (const v of Object.values(d)) assert.ok(v === 0, `${g} ${b.id} at 0`);
      }
  for (const l of LINKAGES)
    for (const b of poseLinkage(l, 0)) {
      const d = getMotionSource(LINKAGE_SOURCE_ID).evaluate({ key: b.id }, 0, { linkage: l });
      for (const v of Object.values(d)) assert.ok(v === 0, `linkage ${b.id} at 0`);
    }
  const spec = { seedKey: 'a', stride: strideTileUnits(wild), params: sanitizeRoam({}) };
  const d = getMotionSource(ROAM_SOURCE_ID).evaluate({ key: 'body' }, 0, { roam: spec });
  for (const v of Object.values(d)) assert.ok(v === 0, 'roam at 0');
});

ok('gaits: 3 rigs × 5 gaits × 6 times — each delta is exactly poseRig(t) − poseRig(0), recomposed within an ulp', () => {
  let cells = 0;
  for (const rig of RIGS)
    for (const g of GAITS)
      for (const phase of [0, 0.37])
        for (const t of TIMES) {
          const now = poseRig(rig, t, LOIS_GAITS[g], phase);
          const rest = poseRig(rig, 0, LOIS_GAITS[g], phase);
          const src = getMotionSource(gaitSourceId(g));
          now.forEach((b, i) => {
            const d = src.evaluate({ key: b.id }, t, { rig, phase });
            const r = rest[i];
            assert.ok(Object.is(d.dx, b.x - r.x) && Object.is(d.dy, b.y - r.y), `${g} ${b.id} t=${t} offset`);
            assert.ok(Object.is(d.dRot, b.angle - r.angle), `${g} ${b.id} t=${t} angle`);
            assert.ok(Object.is(d.dtx, b.tx - r.tx) && Object.is(d.dty, b.ty - r.ty), 'tip');
            assert.ok(Object.is(d.dlen, b.len - r.len), 'length');
            assert.ok(Math.abs(r.x + d.dx - b.x) <= ulp(b.x, r.x), `${g} ${b.id} t=${t} x within an ulp`);
            assert.ok(Math.abs(r.y + d.dy - b.y) <= ulp(b.y, r.y), 'y within an ulp');
            assert.ok(Math.abs(r.angle + d.dRot - b.angle) <= ulp(b.angle, r.angle), 'angle within an ulp');
            cells++;
          });
        }
  assert.ok(cells >= 900, `${cells} cells`);
  // a rig really moves somewhere (the check is not vacuously zero)
  const moved = poseFigure(RIGS[0], 0.3, { gait: 'BURN' });
  assert.ok(Object.values(moved).some((d) => d.dRot !== 0));
});

ok('gaits: the sources keep the poseRig rules (phase offsets the stride, a frozen t = 0 is rest, unknown gait refused)', () => {
  const a = poseFigure(RIGS[0], 0.8, { gait: 'NOD', phase: 0 });
  const b = poseFigure(RIGS[0], 0.8, { gait: 'NOD', phase: 0.5 });
  assert.notDeepEqual(a, b);
  assert.deepEqual(poseFigure(RIGS[0], 0, { gait: 'CUT' })['h'], { dx: 0, dy: 0, dRot: 0, dtx: 0, dty: 0, dlen: 0 });
  assert.throws(() => poseFigure(RIGS[0], 1, { gait: 'NOPE' }), /unknown gait/);
});

ok('linkage: 2 linkages × 6 times × drives — each delta is exactly poseLinkage(t) − poseLinkage(0)', () => {
  const src = getMotionSource(LINKAGE_SOURCE_ID);
  let cells = 0;
  for (const l of LINKAGES)
    for (const drive of [1, 1.5])
      for (const t of TIMES) {
        const now = poseLinkage(l, t, drive);
        const rest = poseLinkage(l, 0, drive);
        now.forEach((b, i) => {
          const d = src.evaluate({ key: b.id }, t, { linkage: l, drive });
          assert.ok(Object.is(d.dx, b.x - rest[i].x) && Object.is(d.dy, b.y - rest[i].y), `${b.id} t=${t}`);
          assert.ok(Object.is(d.dRot, b.angle - rest[i].angle));
          assert.ok(Object.is(d.dtx, b.tx - rest[i].tx) && Object.is(d.dlen, b.len - rest[i].len));
          assert.ok(Math.abs(rest[i].x + d.dx - b.x) <= ulp(b.x, rest[i].x));
          cells++;
        });
      }
  assert.ok(cells > 500, `${cells} cells`);
  assert.ok(Object.values(poseFigure(LINKAGES[0], 0.4)).some((d) => d.dx !== 0 || d.dy !== 0));
});

ok('linkage: the roam hands in its bank phases through ctx.crank, as expandBeast does', () => {
  const spec = { seedKey: 'k|hand|tile', stride: strideTileUnits(wild), params: sanitizeRoam({}) };
  const src = getMotionSource(LINKAGE_SOURCE_ID);
  for (const t of [0.5, 3.3, 11]) {
    const r = roamAt(spec, t);
    const crank = { a: r.phaseA, b: r.phaseB };
    const now = poseLinkage(LINKAGES[0], t, 1, crank);
    const rest = poseLinkage(LINKAGES[0], 0, 1, null);
    now.forEach((b, i) => {
      const d = src.evaluate({ key: b.id }, t, { linkage: LINKAGES[0], crank });
      assert.ok(Object.is(d.dx, b.x - rest[i].x) && Object.is(d.dRot, b.angle - rest[i].angle), `${b.id} t=${t}`);
    });
  }
});

ok('roam: body delta is exactly roamAt(t) − roamAt(0); heading, bank phases and moving ride as extensions', () => {
  const src = getMotionSource(ROAM_SOURCE_ID);
  const base = strideTileUnits(wild);
  for (const key of ['a', 'b', 'c'])
    for (const params of [{}, { turnGain: 0, pauseChance: 0 }, { drive: 2 }]) {
      const spec = { seedKey: key, stride: base, params: sanitizeRoam(params) };
      const rest = roamAt(spec, 0);
      for (const t of TIMES) {
        const now = roamAt(spec, t);
        const d = src.evaluate({ key: 'body' }, t, { roam: spec });
        assert.ok(Object.is(d.dx, now.x - rest.x) && Object.is(d.dy, now.y - rest.y), `${key} t=${t}`);
        assert.ok(Object.is(d.dRot, (now.heading - rest.heading) * (180 / Math.PI)));
        const whole = poseFigure(null, t, { roam: spec }).body;
        assert.ok(Object.is(whole.dHeading, now.heading - rest.heading));
        assert.ok(Object.is(whole.dPhaseA, now.phaseA - rest.phaseA) && Object.is(whole.dPhaseB, now.phaseB - rest.phaseB));
        assert.equal(whole.moving, now.moving);
        assert.equal('moving' in d, false, 'the registry-facing delta carries pose numbers only');
      }
    }
});

ok('sources compose: stacking two bone deltas goes through composePose and drops the extension fields', () => {
  const src = getMotionSource('gait:VIBE');
  const d = src.evaluate({ key: RIGS[0].bones[1].id }, 0.7, { rig: RIGS[0] });
  const c = composePose(d, POSE_IDENTITY);
  assert.equal(c.dx, d.dx);
  assert.equal(c.dRot, d.dRot);
  assert.equal('dtx' in c, false);
});

ok('the census: only the adapter adds sources here, and no source is a clock', () => {
  const ids = listMotionSources().map((s) => s.id);
  for (const id of RIG_SOURCE_IDS) assert.ok(ids.includes(id));
  const text = readFileSync(fileURLToPath(new URL('./rigSources.js', import.meta.url)), 'utf8');
  assert.equal(/Date\.now|performance\.now|Math\.random/.test(text), false, 'no clock, no chance');
});

ok('no behaviour change: the kinematic files are untouched and nothing outside selfchecks imports the adapter', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  let changed = '';
  try {
    changed = execFileSync(
      'git',
      ['diff', '--name-only', 'origin/main', '--', 'src/engine/creatureRig.js', 'src/engine/beastRig.js', 'src/engine/beastRoam.js'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    changed = ''; // no git / no origin/main in this checkout: the import scan below still runs
  }
  assert.equal(changed, '', 'creatureRig.js, beastRig.js, beastRoam.js unedited');
  const hits = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?js|jsx)$/.test(f) && !/\.selfcheck\.m?js$/.test(f) && /rigSources(\.js)?['"]/.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  walk(join(root, 'src'));
  assert.deepEqual(
    hits.filter((p) => !p.endsWith('rigSources.js')),
    [],
    'only selfchecks import the rig adapter',
  );
});

console.log(`rigSources selfcheck: ${n} ok`);
