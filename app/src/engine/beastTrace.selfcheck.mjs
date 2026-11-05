// beastTrace.selfcheck.mjs — #1868 S5b: the dish writing (the feet's fading signed trace).
//
//   marks     one ovoid per crank turn, each set where the beast stood when the turn ended; the signature's own extent
//   fade      a mark only fades (opacity falls with age, ramps in from nothing); it never slides; the count caps the cost
//   replay    pure: same answer at the same t, whatever was asked before
//   switches  frozen / walking in place / trace off / a stillbirth leave none; params clamp
//   contract  through the real expansion: marks are instances behind the legs, the beast's own count is unchanged
import assert from 'node:assert/strict';
import { wildTypeMeasures } from './jansenMeasures.js';
import { sanitizeMeasures } from './beastBuilder.js';
import { strideTileUnits, LINKAGE_CRANK_HZ } from './beastRig.js';
import { roamAt, sanitizeRoam } from './beastRoam.js';
import { traceMarks, sanitizeTrace, BEAST_TRACE } from './beastTrace.js';
import { isStillborn } from './jansenSolver.js';
import { footSignature } from './beastTrails.js';
import { expandCreatureInstances, BEAST_TRACE_MARK } from './creatureRig.js';

const wild = sanitizeMeasures(wildTypeMeasures());
const spec = { seedKey: 'tr', stride: strideTileUnits(wild), params: sanitizeRoam({ pauseChance: 0 }) };
const turn = 1 / LINKAGE_CRANK_HZ;

// ---- params
{
  assert.deepEqual(sanitizeTrace(null), { ...BEAST_TRACE });
  const p = sanitizeTrace({ count: 999, fade: -4, alpha: 7, ramp: 'x', size: NaN });
  assert.equal(p.count, 24, 'count clamps');
  assert.equal(p.fade, 0.2, 'fade clamps');
  assert.equal(p.alpha, 1, 'alpha clamps');
  assert.equal(p.ramp, BEAST_TRACE.ramp, 'junk is ignored');
  assert.equal(p.size, BEAST_TRACE.size, 'NaN is ignored');
}

// ---- marks
{
  assert.deepEqual(traceMarks(wild, spec, 0), [], 'nothing before the first turn');
  assert.deepEqual(traceMarks(wild, spec, turn * 0.9), [], 'nor before it completes');
  const m = traceMarks(wild, spec, turn * 3.5);
  assert.equal(m.length, 3, 'one per completed turn');
  // each mark is set where the beast stood when its turn ended
  m.forEach((k, i) => {
    const r = roamAt(spec, (i + 1) * turn);
    assert.ok(Math.hypot(k.x - 50 - r.x, k.y - 50 - r.y) < 60, 'near where the beast stood');
    assert.ok(Math.abs(k.heading - r.heading) < 1e-9, 'its axis is the heading then');
  });
  // the ovoid is the signature's own extent
  const sig = footSignature(wild);
  const w = Math.max(...sig.map((p) => p.x)) - Math.min(...sig.map((p) => p.x));
  const h = Math.max(...sig.map((p) => p.y)) - Math.min(...sig.map((p) => p.y));
  assert.ok(Math.abs(m[0].w / m[0].h - w / h) < 1e-9, "the signature's aspect");
  const big = traceMarks(wild, spec, turn * 3.5, { size: 2 });
  assert.ok(Math.abs(big[0].w / m[0].w - 2) < 1e-9, 'size scales it');
}

// ---- fade
{
  const t = turn * 4.2;
  const a = traceMarks(wild, spec, t);
  const b = traceMarks(wild, spec, t + 1);
  const byAge = (ms) => ms.map((k) => k.alpha);
  // the same mark, a second later: same place, less opaque
  const old = a.find((k) => k.age > 1);
  const same = b.find((k) => Math.abs(k.age - old.age - 1) < 1e-9);
  assert.equal(same.x, old.x, 'a mark never slides');
  assert.equal(same.y, old.y);
  assert.ok(same.alpha < old.alpha, 'and only fades');
  assert.ok(Math.abs(same.alpha / old.alpha - Math.exp(-1 / BEAST_TRACE.fade)) < 1e-9, 'by the fade constant');
  // a fresh mark inks in from nothing
  const fresh = traceMarks(wild, spec, turn * 2 + 0.01).at(-1);
  assert.ok(fresh.alpha < 0.05 * BEAST_TRACE.alpha, 'no pop');
  assert.ok(byAge(a).every((x) => x > 0 && x <= BEAST_TRACE.alpha));
  // the count caps what lives
  assert.equal(traceMarks(wild, spec, turn * 40.3, { count: 4, fade: 60 }).length, 4, 'the count caps the cost');
  assert.deepEqual(traceMarks(wild, spec, turn * 40.3, { count: 0 }), []);
}

// ---- replay
{
  const x = traceMarks(wild, spec, turn * 5.5);
  traceMarks(wild, { ...spec, seedKey: 'other' }, turn * 9);
  assert.deepEqual(traceMarks(wild, spec, turn * 5.5), x, 'pure');
}

// ---- stillbirth
{
  let dead = null;
  for (const k of Object.keys(wild)) {
    if (typeof wild[k] !== 'number' || /^(legCount|scale|phase)/.test(k)) continue;
    for (const f of [0.3, 2.5]) {
      const m = sanitizeMeasures({ ...wild, [k]: wild[k] * f });
      if (m && isStillborn(m, m.scale)) dead = dead || m;
    }
  }
  assert.ok(dead, 'found a stillbirth to test with');
  assert.deepEqual(traceMarks(dead, spec, turn * 5), [], 'a beast that was never alive leaves no mark');
}

// ---- the contract
{
  const rec = { category: 'creature', source: 'wetlab', rig: { body: '', linkage: { measures: wild, phase: 0 } } };
  const overlay = new Map([['user:beast', rec]]);
  const inst = (asset, key, x) => ({
    asset,
    key,
    x,
    y: 300,
    scaleX: 3,
    scaleY: 3,
    rotation: 0,
    opacity: 1,
    seedOffset: 0,
  });
  const scene = [inst('geo_tri_02', 's0', 60), inst('org_petal_01', 's1', 200), inst('user:beast', 'b', 400)];
  const run = (extra) => expandCreatureInstances(scene, overlay, { seed: 7, t: turn * 4.5, ...extra });
  const marks = (o) => o.filter((i) => i.key.startsWith('b#trace'));
  const on = run({});
  const off = run({ beastTrace: false });
  assert.equal(marks(on).length, 4, 'a mark per completed turn');
  assert.ok(marks(on).every((i) => i.asset === BEAST_TRACE_MARK && i.opacity > 0 && i.opacity < 1));
  assert.equal(marks(off).length, 0, 'the switch leaves none');
  assert.equal(on.length - marks(on).length, off.length, "the beast's own instances are unchanged");
  const firstLeg = on.findIndex((i) => i.key.startsWith('b#') && !i.key.startsWith('b#trace'));
  const lastMark = on.map((i) => i.key.startsWith('b#trace')).lastIndexOf(true);
  assert.ok(lastMark < firstLeg, 'the trace is drawn behind the legs');
  assert.equal(marks(run({ frozen: true })).length, 0, 'frozen leaves none');
  assert.equal(marks(run({ beastRoam: false })).length, 0, 'walking in place leaves none');
  assert.equal(marks(run({ beastTrace: { count: 2 } })).length, 2, 'the override reaches the contract');
}
console.log('beastTrace.selfcheck: ok');
