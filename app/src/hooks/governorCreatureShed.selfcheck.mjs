// governorCreatureShed.selfcheck.mjs — #1694 slice 2: the creature rung of the governor ladder.
//
// Matt's ruling (#1694 Q2): under governor pressure the creature count sheds
// FIRST — population before finishes. Only edge AA (cut 0) and the pixel
// trim (cut 1) precede it, because they cost the picture nothing; the rung
// sits before the quality tier and everything below it. The shed is the
// creatureShed overlay: one creature per governor step, the artist's count
// never written, and the population restores WHOLE when pressure clears.
//
// This suite walks the pure ladder (hooks/governorCuts.js) the way
// usePerformanceGovernor drives it, and pins the scene end to end:
// forced pressure sheds a creature by the ruled rung before any finish
// moves; sustained pressure sheds the population one by one; recovery
// restores it. A state that predates the citizen (no creature fields)
// walks the historical ladder untouched.
import assert from 'node:assert';
import { nextGovernorCut, shedSummary, GOVERNOR_RESTORE_CUTS } from './governorCuts.js';
import { useStore } from '../state/store.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// Drive the ladder the way the hook does: ask for the next cut, apply it to
// the state, repeat — collecting the kinds in order.
const walk = (state, steps = 14) => {
  const kinds = [];
  let s = { ...state };
  for (let i = 0; i < steps; i++) {
    const c = nextGovernorCut(s);
    if (!c) break;
    kinds.push(c.kind);
    if (c.kind === 'renderScale') s = { ...s, renderScale: c.scale };
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

ok('forced pressure sheds a creature by the ruled rung — before the quality tier moves', () => {
  const { kinds } = walk({ ...PRESSURE, creatureCount: 2, creatureShed: 0 });
  assert.deepEqual(
    kinds.slice(0, 5),
    ['renderScale', 'renderScale', 'renderScale', 'creatureCount', 'creatureCount'],
    'the pixel trim steps (they cost the picture nothing), then the population, one creature per step',
  );
  assert.ok(kinds.indexOf('creatureCount') < kinds.indexOf('quality'), 'population before finishes');
  assert.equal(kinds.filter((k) => k === 'creatureCount').length, 2, 'the shed stops at the artist\u2019s count');
});

ok('with the pixel trim exhausted the creature rung is the FIRST content cut', () => {
  const c = nextGovernorCut({ ...PRESSURE, renderScale: 0.33, creatureCount: 4, creatureShed: 0 });
  assert.deepEqual([c.kind, c.creatureShed], ['creatureCount', 1]);
  assert.equal(c.label, 'CREATURES → 3');
});

ok('a state that predates the citizen walks the historical ladder untouched', () => {
  const { kinds } = walk({ ...PRESSURE });
  assert.ok(!kinds.includes('creatureCount'), 'no creature fields → no creature rung');
  assert.deepEqual(kinds, [
    'renderScale',
    'renderScale',
    'renderScale',
    'quality',
    'quality',
    'assetThin',
    'countClamp',
    'countClamp',
    'countClamp',
    'countClamp',
    'slowRender',
  ]);
});

ok('an artist count of zero sheds nothing (the rung is gated on a standing population)', () => {
  const c = nextGovernorCut({ ...PRESSURE, renderScale: 0.33, creatureCount: 0, creatureShed: 0 });
  assert.equal(c.kind, 'quality');
});

ok('recovery restores the whole population in one pass, only when healthy', () => {
  const entry = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'creatureCount');
  assert.ok(entry, 'the rung has a restore entry (the #264 structural law)');
  const order = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  assert.ok(
    order.indexOf('renderScale') < order.indexOf('creatureCount') &&
      order.indexOf('creatureCount') < order.indexOf('quality'),
    'the restore table keeps shed order — the population returns after pixels, before finishes',
  );
  assert.equal(entry.needsRestore({ creatureShed: 2 }, { healthy: true }), true);
  assert.equal(entry.needsRestore({ creatureShed: 2 }, { healthy: false }), false, 'never while pressure stands');
  assert.equal(entry.needsRestore({ creatureShed: 0 }, { healthy: true }), false, 'nothing shed, nothing to restore');
  assert.equal(entry.needsRestore({}, { healthy: true }), false, 'absent fields read as nothing shed');
});

ok('the badge is honest about a population shed', () => {
  assert.deepEqual(shedSummary({ renderScale: 1, creatureShed: 2 }), ['creatures −2']);
  assert.equal(shedSummary({ renderScale: 1, creatureShed: 0 }), null);
  assert.equal(shedSummary({ renderScale: 1 }), null, 'pre-citizen states stay silent');
});

ok('the store overlay clamps to a whole, non-negative shed', () => {
  const S = useStore.getState();
  S.setCreatureShed(2);
  assert.equal(useStore.getState().creatureShed, 2);
  S.setCreatureShed(-3);
  assert.equal(useStore.getState().creatureShed, 0);
  S.setCreatureShed(NaN);
  assert.equal(useStore.getState().creatureShed, 0);
  S.setCreatureShed(0);
});

console.log(`governorCreatureShed.selfcheck: ok (#1694 S2 — ${n} checks)`);
