// governorDishLife.selfcheck.mjs — #1923: the DISH LIFE rung of the governor ladder (cut 1.39).
//
// The idle culture is the lightest sacrifice there is: it exists only while the performer's hands are off. So it is
// the first cut after the pixel trim (edge AA and pixels cost the picture nothing; the culture costs the picture
// nothing while someone is playing), ahead of weather, the ACCUM family, the population and the tier. It falls in two
// balanced steps — TRICKLE (the dish slows) then HELD (it stops, still drawn) — and restores whole. Opt-in per caller
// (dishLifeActive === true), so every older ladder walk stays exactly as it was.
import assert from 'node:assert';
import { nextGovernorCut, shedSummary, GOVERNOR_RESTORE_CUTS } from './governorCuts.js';
import { useStore } from '../state/store.js';
import { SHED_STEPS } from '../engine/dishLifeStage.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const walk = (state, steps = 16) => {
  const kinds = [];
  let s = { ...state };
  for (let i = 0; i < steps; i++) {
    const c = nextGovernorCut(s);
    if (!c) break;
    kinds.push(c.kind);
    if (c.kind === 'renderScale') s = { ...s, renderScale: c.scale };
    else if (c.kind === 'dishLife') s = { ...s, dishLifeShed: c.dishLifeShed };
    else if (c.kind === 'creatureCount') s = { ...s, creatureShed: c.creatureShed };
    else if (c.kind === 'quality') s = { ...s, quality: c.quality };
    else if (c.kind === 'assetThin') s = { ...s, assetThin: true };
    else if (c.kind === 'countClamp') s = { ...s, perfClampOverride: { count: c.count, mirror: false } };
    else if (c.kind === 'slowRender') s = { ...s, slowRender: true };
    else if (c.kind === 'fxaa') s = { ...s, fxaa: false };
  }
  return { kinds, end: s };
};

const PRESSURE = {
  fxaa: false,
  renderScale: 1,
  quality: 'high',
  assetThin: false,
  perfClampOverride: null,
  effectiveCount: 400,
  slowRender: false,
  gpuSaturated: true,
};

ok('an awake culture is the first cut after the pixel trim, in two balanced steps', () => {
  const { kinds } = walk({ ...PRESSURE, dishLifeActive: true, dishLifeShed: 0, creatureCount: 2, creatureShed: 0 });
  assert.deepEqual(kinds.slice(0, 6), [
    'renderScale',
    'renderScale',
    'renderScale',
    'dishLife',
    'dishLife',
    'creatureCount',
  ]);
  assert.equal(kinds.filter((k) => k === 'dishLife').length, 2, 'two steps, then it is spent');
  assert.ok(kinds.indexOf('dishLife') < kinds.indexOf('quality'), 'before the tier');
});

ok('the steps are TRICKLE then HELD, matching the stage’s shed levels', () => {
  const a = nextGovernorCut({ ...PRESSURE, renderScale: 0.33, dishLifeActive: true, dishLifeShed: 0 });
  assert.deepEqual([a.kind, a.dishLifeShed], ['dishLife', 1]);
  assert.match(a.label, /TRICKLE/);
  const b = nextGovernorCut({ ...PRESSURE, renderScale: 0.33, dishLifeActive: true, dishLifeShed: 1 });
  assert.deepEqual([b.kind, b.dishLifeShed], ['dishLife', 2]);
  assert.match(b.label, /HELD/);
  assert.equal(SHED_STEPS[1], 1, 'level 1 trickles one generation per frame');
  assert.equal(SHED_STEPS[2], 0, 'level 2 holds');
  const c = nextGovernorCut({ ...PRESSURE, renderScale: 0.33, dishLifeActive: true, dishLifeShed: 2 });
  assert.notEqual(c && c.kind, 'dishLife', 'a held culture has no further step');
});

ok('no awake culture, no rung — a dish asleep never costs the ladder a cut', () => {
  for (const extra of [{}, { dishLifeActive: false }, { dishLifeActive: undefined, dishLifeShed: 0 }]) {
    const { kinds } = walk({ ...PRESSURE, ...extra, creatureCount: 1, creatureShed: 0 });
    assert.ok(!kinds.includes('dishLife'), `no rung for ${JSON.stringify(extra)}`);
  }
});

ok('a state that predates DISH LIFE walks the historical ladder untouched', () => {
  const { kinds } = walk({ ...PRESSURE });
  assert.ok(!kinds.includes('dishLife'));
});

ok('restore: a table entry restores whole, only when healthy, after weather in the reverse walk', () => {
  const entry = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'dishLife');
  assert.ok(entry, 'the kind is in the restore table');
  assert.equal(entry.needsRestore({ dishLifeShed: 1 }, { healthy: true }), true);
  assert.equal(entry.needsRestore({ dishLifeShed: 2 }, { healthy: true }), true);
  assert.equal(entry.needsRestore({ dishLifeShed: 2 }, { healthy: false }), false, 'only when healthy');
  assert.equal(entry.needsRestore({ dishLifeShed: 0 }, { healthy: true }), false, 'nothing shed, nothing to restore');
  const order = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  assert.ok(order.indexOf('dishLife') > order.indexOf('renderScale'), 'sheds after the pixel trim');
  assert.ok(order.indexOf('dishLife') < order.indexOf('markWeather'), 'sheds before weather, so restores after it');
});

ok('the badge is honest about a culture shed', () => {
  assert.ok(shedSummary({ renderScale: 1, dishLifeShed: 1 }).some((x) => /culture slowed/.test(x)));
  assert.ok(shedSummary({ renderScale: 1, dishLifeShed: 2 }).some((x) => /culture held/.test(x)));
  const none = shedSummary({ renderScale: 1, dishLifeShed: 0 });
  assert.ok(!none || !none.some((x) => /culture/.test(x)), 'nothing shed, nothing said');
});

ok('the store: the shed overlay clamps 0..2 and the awake flag is a plain boolean, neither serialized', () => {
  const st = useStore.getState();
  st.setDishLifeShed(5);
  assert.equal(useStore.getState().dishLifeShed, 2);
  st.setDishLifeShed(-3);
  assert.equal(useStore.getState().dishLifeShed, 0);
  st.setDishLifeShed(NaN);
  assert.equal(useStore.getState().dishLifeShed, 0);
  st.setDishLifeAwake(1);
  assert.equal(useStore.getState().dishLifeAwake, true);
  st.setDishLifeAwake(0);
  assert.equal(useStore.getState().dishLifeAwake, false);
});

console.log(`[selfcheck] governorDishLife (#1923): ${n} cases passed`);
