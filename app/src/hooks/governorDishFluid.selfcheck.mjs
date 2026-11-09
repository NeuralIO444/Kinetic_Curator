// governorDishFluid.selfcheck.mjs — #1997: the FERROFLUID rung of the governor ladder (cut 1.395).
//
// The fluid is the culture's sibling — a dish surface, never the picture itself — so it sheds
// right after the culture on the same family business, ahead of weather, the ACCUM family, the
// population and the tier. Its ladder is the kernel's (engine/dishFluid.mjs FLUID_SHED_RUNGS):
// steps fall 8 → 4 → 2 → 1, then the attached body's seating grid coarsens 96 → 64 → 48 → 32
// wide, then the body's count falls to ½ and ¼, then the fluid holds — nine cuts, restoring
// whole. Opt-in per caller (dishFluidActive === true), so every older ladder walk stays as it
// was. Registration: like the culture, the fluid carries no cost-registry tier of its own —
// the registry's tier 1 is contractually the ACCUM chain; the family registers HERE, with
// the governor alone (the system is invisible — no renderer programme carries it).
import assert from 'node:assert';
import { nextGovernorCut, shedSummary, GOVERNOR_RESTORE_CUTS } from './governorCuts.js';
import { useStore } from '../state/store.js';
import { FLUID_SHED_RUNGS } from '../engine/dishFluid.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const PRESSURE = {
  fxaa: false,
  renderScale: 0.33,
  quality: 'high',
  assetThin: false,
  perfClampOverride: null,
  effectiveCount: 400,
  creatureCount: 2,
  creatureShed: 0,
  slowRender: false,
  gpuSaturated: true,
};

const walk = (state, steps = 24) => {
  const cuts = [];
  let s = { ...state };
  for (let i = 0; i < steps; i++) {
    const c = nextGovernorCut(s);
    if (!c) break;
    cuts.push(c);
    if (c.kind === 'dishLife') s = { ...s, dishLifeShed: c.dishLifeShed };
    else if (c.kind === 'dishFluid') s = { ...s, dishFluidShed: c.dishFluidShed };
    else if (c.kind === 'creatureCount') s = { ...s, creatureShed: c.creatureShed };
    else if (c.kind === 'quality') s = { ...s, quality: c.quality };
    else if (c.kind === 'assetThin') s = { ...s, assetThin: true };
    else if (c.kind === 'countClamp') s = { ...s, perfClampOverride: { count: c.count, mirror: false } };
    else if (c.kind === 'slowRender') s = { ...s, slowRender: true };
    else break;
  }
  return cuts;
};

ok('an awake fluid sheds right after its sibling the culture, nine rungs deep', () => {
  const cuts = walk({ ...PRESSURE, dishLifeActive: true, dishLifeShed: 0, dishFluidActive: true, dishFluidShed: 0 });
  const kinds = cuts.map((c) => c.kind);
  assert.deepEqual(kinds.slice(0, 2), ['dishLife', 'dishLife'], 'the culture spends its two steps first');
  assert.deepEqual(kinds.slice(2, 11), Array(9).fill('dishFluid'), 'then the fluid spends its nine rungs');
  assert.deepEqual(
    cuts.slice(2, 11).map((c) => c.dishFluidShed),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    'one rung at a time, in ladder order',
  );
  assert.equal(kinds[11], 'creatureCount', 'the population sheds only after the whole dish family');
  assert.ok(kinds.indexOf('dishFluid') < kinds.indexOf('quality'), 'before the tier');
});

ok('steps shed before the seat, the seat before the count, rung for rung', () => {
  const labels = [];
  for (let rung = 0; rung < FLUID_SHED_RUNGS.length - 1; rung++) {
    const c = nextGovernorCut({ ...PRESSURE, dishFluidActive: true, dishFluidShed: rung });
    assert.equal(c.kind, 'dishFluid');
    assert.equal(c.dishFluidShed, rung + 1);
    labels.push(c.label);
    const want = FLUID_SHED_RUNGS[rung + 1];
    assert.equal(c.label, want.label, 'the label is the ladder’s own');
  }
  assert.match(labels[0], /4 a frame/, 'first the tempo halves');
  assert.match(labels[3], /64 wide/, 'the seat coarsens only once tempo is spent');
  assert.match(labels[6], /THIN/, 'the count thins only once the seat is spent');
  assert.match(labels[8], /HELD/, 'the last rung holds');
  const spent = nextGovernorCut({ ...PRESSURE, dishFluidActive: true, dishFluidShed: 9 });
  assert.notEqual(spent?.kind, 'dishFluid', 'a held fluid has nothing left to shed');
});

ok('no awake fluid, no rung — older walks are untouched', () => {
  const cuts = walk({ ...PRESSURE, dishLifeActive: true, dishLifeShed: 0, dishFluidShed: 0 });
  assert.ok(!cuts.some((c) => c.kind === 'dishFluid'), 'dishFluidActive absent: the rung never fires');
  const off = nextGovernorCut({ ...PRESSURE, dishFluidActive: false, dishFluidShed: 0, creatureCount: 0 });
  assert.notEqual(off?.kind, 'dishFluid');
});

ok('the restore table carries the kind, ordered to restore fluid before culture', () => {
  const kinds = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  assert.equal(
    kinds.indexOf('dishFluid'),
    kinds.indexOf('dishLife') + 1,
    'directly after dishLife (reverse walk: fluid first)',
  );
  const entry = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'dishFluid');
  assert.equal(entry.needsRestore({ dishFluidShed: 3 }, { healthy: true }), true);
  assert.equal(entry.needsRestore({ dishFluidShed: 0 }, { healthy: true }), false);
  assert.equal(entry.needsRestore({ dishFluidShed: 3 }, { healthy: false }), false, 'no restore while unhealthy');
});

ok('the badge is honest about a fluid shed', () => {
  assert.ok(shedSummary({ renderScale: 1, dishFluidShed: 2 })?.includes('ferrofluid slowed'));
  assert.ok(shedSummary({ renderScale: 1, dishFluidShed: 5 })?.includes('ferrofluid coarsened'));
  assert.ok(shedSummary({ renderScale: 1, dishFluidShed: 8 })?.includes('ferrofluid thinned'));
  assert.ok(shedSummary({ renderScale: 1, dishFluidShed: 9 })?.includes('ferrofluid held'));
  assert.equal(shedSummary({ renderScale: 1, dishFluidShed: 0 }), null, 'no shed, no badge line');
});

ok('the store carries the rung clamped to the ladder, and the awake sensor', () => {
  const s = useStore.getState();
  s.setDishFluidShed(99);
  assert.equal(useStore.getState().dishFluidShed, FLUID_SHED_RUNGS.length - 1);
  s.setDishFluidShed(-2);
  assert.equal(useStore.getState().dishFluidShed, 0);
  s.setDishFluidAwake(true);
  assert.equal(useStore.getState().dishFluidAwake, true);
  s.setDishFluidAwake(false);
  s.setDishFluidShed(0);
});

console.log(`governorDishFluid.selfcheck: ok (${n} groups)`);
