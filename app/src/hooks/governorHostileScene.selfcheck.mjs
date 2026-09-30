/**
 * governorHostileScene.selfcheck.mjs — the governor's deterministic bad day (#765).
 * Node-only.
 *
 * A synthetic hostile scene: every real registration site loaded plus
 * hostile/* passes at every cost tier, a GPU-saturated state with every cut
 * still available (edge AA on, full pixels, HIGH tier, a 2000 crowd), and
 * the ladder walked to exhaustion the way usePerformanceGovernor applies it.
 *
 * What it proves:
 *  A. shed order over the whole registry: tier 1 → 2 → 3, costliest-first
 *     within a tier, tier 0 last (never a shed candidate).
 *  B. tier 0 is never shed: perfTier1's coverage holds no tier-0 id, and
 *     with EVERY cut active the X-ray marks no tier-0 pass shed.
 *  C. the ladder walk is deterministic (two runs, identical sequence) and
 *     follows the step contract: fxaa → renderScale → quality → assetThin →
 *     countClamp → slowRender, then null (hold; the watchdog is separate).
 *  D. the event log records every cut with its step and reason (detail +
 *     the FPS window that fired it).
 */
import { strict as assert } from 'node:assert';
import { registerCostTier, allCostTiers, getCostTier, shedOrder } from '../gl/costTiers.mjs';
import '../gl/effects/fxShaders.mjs';
import '../gl/bridge/builtinEffects.mjs';
import '../gl/accum.mjs';
import '../gl/renderer.mjs';
import { MEASURED_COSTS } from '../gl/effects/measuredCosts.mjs';
import { nextGovernorCut, perfTier1Passes } from './governorCuts.js';
import { buildXray } from '../gl/governorXray.mjs';
import {
  recordGovernorEvent, getGovernorEvents, clearGovernorEvents, SHED_STEPS,
} from '../gl/governorEventLog.mjs';

// ── the hostile scene: passes at every tier, distinct costs ──────────────
const HOSTILE = [
  ['hostile/t0-present', 0, 9],
  ['hostile/t1-cheap', 1, 5],
  ['hostile/t1-heavy', 1, 50],
  ['hostile/t2-cheap', 2, 4],
  ['hostile/t2-heavy', 2, 40],
  ['hostile/t3-cheap', 3, 0.01],
  ['hostile/t3-heavy', 3, 0.02],
];
for (const [id, tier, timeMs] of HOSTILE) registerCostTier(id, { tier, timeMs, notes: '#765 hostile scene' });

const tiers = allCostTiers();
for (const t of [0, 1, 2, 3]) assert.ok(tiers.some((d) => d.tier === t), `hostile scene registers tier ${t}`);
const measured = (id) => MEASURED_COSTS[id]?.ms;

// ── A. shed order: 1 → 2 → 3, costliest-first, tier 0 last ───────────────
const order = shedOrder(tiers.map((d) => d.id), measured);
const rank = (id) => { const t = getCostTier(id).tier; return t === 0 ? 4 : t; };
for (let i = 1; i < order.length; i++) {
  assert.ok(rank(order[i - 1]) <= rank(order[i]), `tier order broken at ${order[i - 1]} → ${order[i]}`);
}
assert.deepEqual(
  order.filter((id) => id.startsWith('hostile/')),
  ['hostile/t1-heavy', 'hostile/t1-cheap', 'hostile/t2-heavy', 'hostile/t2-cheap',
    'hostile/t3-heavy', 'hostile/t3-cheap', 'hostile/t0-present'],
  'hostile passes shed tier 1 → 2 → 3, costliest-first, tier 0 last',
);

// ── B. tier 0 never shed ──────────────────────────────────────────────────
const tier1 = perfTier1Passes();
assert.ok(tier1.includes('hostile/t1-heavy') && tier1.includes('hostile/t1-cheap'), 'perfTier1 covers hostile tier-1 passes');
for (const id of tier1) assert.equal(getCostTier(id).tier, 1, `perfTier1 covers only tier 1 (got ${id})`);
const everythingShed = buildXray({
  tiers, measuredMs: MEASURED_COSTS,
  shed: {
    fxaaShed: true, perfTier1: true, renderScale: 0.33, assetThin: true,
    perfClampOverride: { count: 80 }, slowRender: true, watchdogTripped: true,
    quality: 'performance', qualityShedFrom: 'high',
  },
});
assert.ok(everythingShed.cuts.every((c) => c.active), 'hostile scene: every cut active');
for (const p of everythingShed.passes) {
  if (p.tier === 0) assert.equal(p.shed, false, `tier-0 pass ${p.id} shown shed`);
  if (p.tier === 1) assert.equal(p.shed, true, `tier-1 pass ${p.id} not shed under perfTier1`);
}

// ── C/D. walk the ladder as usePerformanceGovernor applies it ─────────────
const SHED_FPS = 32;
const SUSTAIN_MS = 1600;
function walk() {
  clearGovernorEvents();
  const s = {
    fxaaShed: false, renderScale: 1, quality: 'high', assetThin: false,
    perfClampOverride: null, slowRender: false,
  };
  const cuts = [];
  for (let guard = 0; guard < 64; guard++) {
    const fps = 12; // hostile: far below the floor, every window sustained
    const cut = nextGovernorCut({
      fxaa: !s.fxaaShed, renderScale: s.renderScale, quality: s.quality,
      assetThin: s.assetThin, perfClampOverride: s.perfClampOverride,
      effectiveCount: 2000, slowRender: s.slowRender, gpuSaturated: true,
    });
    if (!cut) return cuts;
    switch (cut.kind) {
      case 'fxaa': s.fxaaShed = true; break;
      case 'renderScale': s.renderScale = cut.scale; break;
      case 'quality': s.quality = cut.quality; break;
      case 'assetThin': s.assetThin = true; break;
      case 'countClamp': s.perfClampOverride = { count: cut.count }; break;
      case 'slowRender': s.slowRender = true; break;
      default: assert.fail(`unexpected cut kind ${cut.kind}`);
    }
    recordGovernorEvent({
      type: 'shed', cutKind: cut.kind, label: cut.label,
      fps: { at: fps, threshold: SHED_FPS, sustainedMs: SUSTAIN_MS },
      detail: `FPS ${fps} < ${SHED_FPS} sustained ${SUSTAIN_MS / 1000}s (GPU-bound)`,
    });
    cuts.push(cut.label);
  }
  assert.fail('ladder never exhausted');
}

const run1 = walk();
const log = getGovernorEvents();
const run2 = walk();
assert.deepEqual(run1, run2, 'hostile scene sheds deterministically');
assert.deepEqual(run1, [
  'EDGE AA OFF',
  'PIXEL TRIM → 75%', 'PIXEL TRIM → 50%', 'PIXEL TRIM → 33%',
  'TIER DROP → BALANCED', 'TIER DROP → PERF',
  'DEAD WEIGHT — costliest assets cut first',
  'CROWD CONTROL → 1400 (live only)', 'CROWD CONTROL → 979 (live only)', // float floor: 1400 * 0.7 < 980
  'CROWD CONTROL → 685 (live only)', 'CROWD CONTROL → 479 (live only)',
  'CROWD CONTROL → 335 (live only)', 'CROWD CONTROL → 234 (live only)',
  'CROWD CONTROL → 163 (live only)', 'CROWD CONTROL → 114 (live only)',
  'FREEZE FRAME — motion held',
], 'hostile scene shed sequence');

// D. every cut logged, with its step and reason, steps never going backwards
assert.equal(log.length, run1.length, 'every cut recorded in the event log');
for (let i = 0; i < log.length; i++) {
  const e = log[i];
  assert.equal(e.type, 'shed');
  assert.equal(e.label, run1[i], `event ${i} names its cut`);
  assert.equal(e.step, SHED_STEPS[e.cutKind], `event ${i} carries its shed step`);
  assert.match(e.detail, /^FPS \d+ < \d+ sustained/, `event ${i} carries its reason`);
  assert.deepEqual(e.fps, { at: 12, threshold: SHED_FPS, sustainedMs: SUSTAIN_MS }, `event ${i} carries its FPS window`);
  if (i) assert.ok(log[i - 1].step <= e.step, `step went backwards at event ${i}`);
}
assert.deepEqual(
  [...new Set(log.map((e) => e.cutKind))],
  ['fxaa', 'renderScale', 'quality', 'assetThin', 'countClamp', 'slowRender'],
  'cut kinds follow the ladder contract',
);

console.log(`governorHostileScene selfcheck: OK — ${run1.length} cuts, ${order.length} passes in shed order, tier 0 intact`);
