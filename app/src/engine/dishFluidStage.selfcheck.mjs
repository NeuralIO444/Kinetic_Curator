// dishFluidStage.selfcheck.mjs — FERROFLUID (#1997): the resolver's fluid stage.
//
//   A absent     no stamp = no state, no publication, no plan; the stage touches nothing
//   B bookkeeping the grid sim steps toward the stamp at the rung's bound; the plan carries
//                the attachment terms (the published density, the stamped magnets + dials,
//                the rung's seating grid + matter fraction) for the body's render
//   C wake       a new wake re-seeds; a stamp behind the stage rebuilds from the cycle seed
//                and lands on the same field
//   D snapshot   snapshot/restore round-trips the grid field exactly — the field itself rides
//                (state), so restore is exact even though the coupling input CHANGED during
//                the wake (the fixture varies it); a state-less snapshot is refused by shape
//   E coupling   the stage consumes the culture field it is handed (the field differs from
//                the uncoupled run) and publishes density at the dish grid
import assert from 'node:assert/strict';
import { createDishFluidStage } from './dishFluidStage.mjs';
import { fluidStamp } from './dishFluid.mjs';

const W = 1000;
const H = 700;
const stamp = (t, shed = 0) => fluidStamp(t, { shed });
const ctx = (over = {}) => ({
  seed: 7,
  magnets: [{ x: 0.5, y: 0.5 }],
  dial: { flow: 0.5, pull: 0.7, couple: 0.5 },
  coupleField: null,
  W,
  H,
  ...over,
});
/** Drive a stage through consecutive 1/60s frames, landing a final frame exactly at `until`. */
const drive = (stage, until, over = {}) => driveFrom(stage, 0, until, over);
/** Drive from loop time `from` (exclusive) to `until` (inclusive) — the continuation driver. */
const driveFrom = (stage, from, until, over = {}) => {
  for (let t = from + 16.7; t < until; t += 16.7) stage.apply(stamp(t, over.shed || 0), ctx(over));
  stage.apply(stamp(until, over.shed || 0), ctx(over));
};

// ---- A: absent stamp
{
  const st = createDishFluidStage();
  assert.equal(st.apply(null, ctx()), false, 'no stamp, no fluid');
  assert.equal(st.apply(undefined, ctx()), false);
  assert.equal(st.publishedFluid.active, false, 'nothing is published');
  assert.equal(st.plan.active, false, 'no plan is published');
  assert.equal(st.snapshot(), null, 'nothing to snapshot');
  drive(st, 2000);
  assert.equal(st.publishedFluid.active, true, 'stamps wake the fluid');
  st.apply(null, ctx());
  assert.equal(st.publishedFluid.active, false, 'the stamp leaving drops the state');
  assert.equal(st.snapshot(), null);
}

// ---- B: bookkeeping + the plan
{
  const st = createDishFluidStage();
  drive(st, 1000);
  assert.ok(st.publishedFluid.step > 20, `the grid sim advances (${st.publishedFluid.step})`);
  assert.equal(st.publishedFluid.density.length, 96 * 54, 'density publishes at the dish grid');
  assert.equal(st.plan.density, st.publishedFluid.density, 'the plan carries the published density itself');
  assert.equal(st.plan.step, st.publishedFluid.step, 'and the grid step it was published at');
  assert.deepEqual([st.plan.seatCols, st.plan.seatRows], [96, 54], 'rung 0 seats the body at the full dish grid');
  assert.equal(st.plan.matterFrac, 1, 'rung 0 keeps the whole body');
  assert.deepEqual(st.plan.magnets, [{ x: 0.5, y: 0.5 }], 'the stamped magnets ride the plan');
  assert.deepEqual(st.plan.dial, { flow: 0.5, pull: 0.7, couple: 0.5 }, 'and the stamped dials');
  const held = createDishFluidStage();
  drive(held, 1000, { shed: 9 });
  assert.equal(held.publishedFluid.step, 0, 'the held rung holds the grid instance');
  assert.equal(held.plan.active, true, 'a held fluid still publishes its plan (its body stands)');
  const coarse = createDishFluidStage();
  drive(coarse, 500, { shed: 5 });
  assert.deepEqual([coarse.plan.seatCols, coarse.plan.seatRows], [48, 27], 'seat rungs ride the plan');
  const thin = createDishFluidStage();
  drive(thin, 500, { shed: 8 });
  assert.equal(thin.plan.matterFrac, 0.25, 'matter rungs ride the plan');
}

// ---- C: wake + seek-back
{
  const a = createDishFluidStage();
  drive(a, 5000);
  const snapA = a.snapshot();
  const b = createDishFluidStage();
  drive(b, 5000);
  assert.deepEqual([...b.publishedFluid.density], [...a.publishedFluid.density], 'same stamps, same field');
  // a stamp from the NEXT cycle re-seeds (new wake)
  const before = [...a.publishedFluid.density];
  drive(a, 6500);
  assert.notDeepEqual([...a.publishedFluid.density], before, 'a new wake deals a new field');
  assert.equal(a.snapshot().wakeMs, 6000);
  assert.equal(snapA.wakeMs, 0);
  // seek back inside the cycle: rebuild from the cycle seed, land on the same field
  const c = createDishFluidStage();
  drive(c, 5000);
  c.apply(stamp(2500), ctx());
  drive(c, 5000);
  assert.deepEqual([...c.publishedFluid.density], [...b.publishedFluid.density], 'seek-back rebuilds exactly');
}

// ---- D: snapshot / restore
{
  const a = createDishFluidStage();
  // the coupling input CHANGES mid-wake (two different fields): a step-count replay under a
  // held field could not land here — the state rider is what makes restore exact
  const cfA = { active: true, cols: 96, rows: 54, gen: 1, level: new Float32Array(96 * 54).fill(0.3) };
  const cfB = { active: true, cols: 96, rows: 54, gen: 2, level: new Float32Array(96 * 54).fill(0.9) };
  drive(a, 1500, { coupleField: cfA });
  drive(a, 3000, { coupleField: cfB });
  const snap = a.snapshot();
  assert.ok(snap.state && Array.isArray(snap.state.u) && Array.isArray(snap.state.v), 'the field itself rides');
  assert.equal(snap.state.u.length, 96 * 54);
  const b = createDishFluidStage();
  b.restore(JSON.parse(JSON.stringify(snap)));
  assert.deepEqual([...b.publishedFluid.density], [...a.publishedFluid.density], 'restore lands on the same field');
  assert.equal(b.publishedFluid.step, a.publishedFluid.step);
  // and the continuation agrees: both stages step on under the same stamps
  driveFrom(a, 3000, 4200, { coupleField: cfB });
  driveFrom(b, 3000, 4200, { coupleField: cfB });
  assert.deepEqual([...b.publishedFluid.density], [...a.publishedFluid.density], 'the continuation stays exact');
  const bare = createDishFluidStage();
  drive(bare, 3000);
  const bareB = createDishFluidStage();
  bareB.restore(JSON.parse(JSON.stringify(bare.snapshot())));
  assert.deepEqual(
    [...bareB.publishedFluid.density],
    [...bare.publishedFluid.density],
    'uncoupled restore is exact too',
  );
  const junk = createDishFluidStage();
  junk.restore(null);
  junk.restore({ wakeMs: 'x' });
  junk.restore({ wakeMs: 0, gridStep: 4, magnets: [], state: { u: [1], v: [2] } });
  assert.equal(junk.publishedFluid.step, 0, 'a state of the wrong shape is not loaded');
}

// ---- E: the coupling read shapes the field
{
  const level = new Float32Array(96 * 54).fill(1);
  const cf = { active: true, cols: 96, rows: 54, gen: 1, level };
  const coupled = createDishFluidStage();
  drive(coupled, 4000, { coupleField: cf, dial: { flow: 0.5, pull: 0.7, couple: 1 } });
  const plain = createDishFluidStage();
  drive(plain, 4000, { dial: { flow: 0.5, pull: 0.7, couple: 0 } });
  assert.notDeepEqual(
    [...coupled.publishedFluid.density],
    [...plain.publishedFluid.density],
    'the culture field it is handed moves the fluid',
  );
  const inactive = createDishFluidStage();
  drive(inactive, 1000, { coupleField: { active: false, cols: 96, rows: 54, gen: 0, level } });
  const noField = createDishFluidStage();
  drive(noField, 1000);
  assert.deepEqual(
    [...inactive.publishedFluid.density],
    [...noField.publishedFluid.density],
    'an inactive publication is not consumed as a coupling field',
  );
}

console.log('dishFluidStage.selfcheck: ok');
