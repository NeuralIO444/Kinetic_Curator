// queenTiming.selfcheck — Persona Adapters A6 (#2399): her timing-inclination head.
//
//   node src/curator/queenTiming.selfcheck.mjs
//
// The laws under test:
//   - her feature universe is hers alone (kind + the three sway sizes), versioned separately;
//   - the taste's queenTiming section validates like a persona entry (same head bounds, her
//     universe) and neutralizes when malformed — the taste stands;
//   - earn-in is counted in TAKES: ≥200 labeled takes AND held-out ≥0.3 (ruling on #2399);
//   - the inclination is the earned-in head's keep-probability in [0, 1], else null — and the
//     lean scale only ever relaxes (1 = today's size; a sway never grows past the caps);
//   - the boot bridge lands her entry from the store file — and writes NO launch note for it:
//     her learning is never spoken of (the note diffs persona entries only).
import assert from 'node:assert/strict';
import { queenTimingFeatures, queenTimingFeatureNames, QUEEN_TIMING_FEATURES_VERSION } from './queenTimingFeatures.mjs';
import {
  validateQueenTimingSection,
  queenTimingEarnedIn,
  queenTimingInclination,
  validateTaste,
  QUEEN_TIMING_MIN_TAKES,
} from './tasteHead.js';
import { FEATURES_VERSION } from './recipeFeatures.js';
import { queenTimingOverlayFromStoreText, personasOverlayFromStoreText } from './personaHeadsBridge.mjs';
import { loadPersonaHeadsAtBoot, LAUNCH_NOTE_KEY, HEADS_SNAPSHOT_KEY } from './personaHeadsLive.js';
import { scaleBandTiming } from './queenLean.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const stump = {
  kind: 'xgboost-trees',
  objective: 'binary:logistic',
  baseScore: 0,
  fidelity: 0.8,
  fitOn: 200,
  features: ['num.enterEarlyMs'],
  trees: [{ f: 0, op: '<', v: 20, gain: 1, y: { leaf: -2 }, n: { leaf: 2 } }],
};
const qEntry = (over = {}) => ({
  version: 1,
  kind: 'timing',
  head: stump,
  labeledTakes: 240,
  heldOut: 0.6,
  trainedAt: '2026-11-22T03:30:00.000Z',
  featuresVersion: QUEEN_TIMING_FEATURES_VERSION,
  ...over,
});

await ok('the universe: kind + the three sway sizes, nothing about content', () => {
  assert.deepEqual(queenTimingFeatureNames(), ['kind', 'num.breathePct', 'num.enterEarlyMs', 'num.tightMs']);
  const f = queenTimingFeatures({ kind: 'solo', enterEarlyMs: 12, breathePct: 0.04, tightMs: 0, junk: 1 });
  assert.deepEqual(f, { kind: 'solo', num: { enterEarlyMs: 12, breathePct: 0.04, tightMs: 0 } });
  assert.deepEqual(queenTimingFeatures({}), { num: {} }, 'absent stays absent');
  assert.deepEqual(queenTimingFeatures({ enterEarlyMs: NaN }), { num: {} }, 'non-finite stays absent');
});

await ok('the section validates whole — and neutralizes whole when malformed', () => {
  const clean = validateQueenTimingSection({ ...qEntry(), junk: 'dropped' });
  assert.equal(clean.version, 1);
  assert.equal(clean.junk, undefined, 'rebuilt from known fields only');
  assert.equal(validateQueenTimingSection(qEntry({ kind: 'solo' })), null, 'her only kind is timing');
  assert.equal(validateQueenTimingSection(qEntry({ labeledTakes: -1 })), null);
  assert.equal(validateQueenTimingSection(qEntry({ heldOut: 2 })), null);
  assert.equal(validateQueenTimingSection(qEntry({ featuresVersion: 99 })), null, 'a stale universe is malformed');
  assert.equal(
    validateQueenTimingSection(qEntry({ head: { ...stump, features: ['num.heat'] } })),
    null,
    'a head naming a persona-universe feature is outside hers',
  );
  assert.equal(validateQueenTimingSection(null), null);
  // validateTaste: the section rides when valid, drops when not — the taste stands either way.
  const baseTaste = () => ({
    kind: 'kc-taste',
    version: 1,
    featuresVersion: FEATURES_VERSION,
    model: 'm',
    dims: 1152,
    labels: { likes: 42, passes: 180 },
    trainedAt: '2026-09-30T00:00:00Z',
    head: { terms: { 'scale=large': 1.5 }, num: { count: -2 }, bias: 0.1, fidelity: 0.71, fitOn: 222 },
  });
  const good = validateTaste({ ...baseTaste(), queenTiming: qEntry() });
  assert.equal(good.ok, true);
  assert.equal(good.taste.queenTiming.labeledTakes, 240);
  const bad = validateTaste({ ...baseTaste(), queenTiming: qEntry({ heldOut: 7 }) });
  assert.equal(bad.ok, true);
  assert.equal(bad.taste.queenTiming, undefined);
});

await ok('earn-in is counted in takes: 200 and 0.3, one law for every head', () => {
  assert.equal(QUEEN_TIMING_MIN_TAKES, 200);
  assert.equal(queenTimingEarnedIn(qEntry({ labeledTakes: 199 })), false);
  assert.equal(queenTimingEarnedIn(qEntry({ labeledTakes: 200, heldOut: 0.29 })), false);
  assert.equal(queenTimingEarnedIn(qEntry({ labeledTakes: 200, heldOut: 0.3 })), true);
  assert.equal(queenTimingEarnedIn(null), false);
});

await ok('the inclination: the earned-in head’s keep-probability, else null (no head = today)', () => {
  const taste = { queenTiming: qEntry() };
  const big = queenTimingInclination(taste, queenTimingFeatures({ kind: 'solo', enterEarlyMs: 30 }));
  const small = queenTimingInclination(taste, queenTimingFeatures({ kind: 'solo', enterEarlyMs: 5 }));
  assert.ok(big > 0.8 && small < 0.2, `the stump separates the sizes (got ${big} / ${small})`);
  assert.equal(queenTimingInclination({}, queenTimingFeatures({})), null);
  assert.equal(queenTimingInclination({ queenTiming: qEntry({ labeledTakes: 12 }) }, queenTimingFeatures({})), null);
  assert.equal(queenTimingInclination(null, queenTimingFeatures({})), null);
});

await ok('the scale only relaxes: 1 is identity, 0 is no lean, a sway never grows', () => {
  const lean = Object.freeze({ phrase: 2, enterEarlyMs: 20, breathePct: 0.06, tightMs: 10 });
  assert.equal(scaleBandTiming(lean, 1), lean, 'inclination 1 returns the lean untouched');
  assert.equal(scaleBandTiming(lean, 1.5), lean, 'above 1 clamps to identity — never a growth');
  assert.deepEqual(scaleBandTiming(lean, 0.5), { phrase: 2, enterEarlyMs: 10, breathePct: 0.03, tightMs: 5 });
  assert.equal(scaleBandTiming(lean, 0), null, 'scaled to nothing is no lean');
  const faint = Object.freeze({ phrase: 1, enterEarlyMs: 0.4, breathePct: 0.0000004, tightMs: 0.4 });
  assert.equal(scaleBandTiming(faint, 0.001), null, 'a lean that rounds to nothing is no lean');
  assert.equal(scaleBandTiming(null, 0.5), null);
  const capped = scaleBandTiming({ phrase: 0, enterEarlyMs: 40, breathePct: 0.08, tightMs: 40 }, 0.9);
  assert.ok(capped.enterEarlyMs <= 40 && capped.breathePct <= 0.08 && capped.tightMs <= 40, 'the caps hold');
});

await ok('the bridge: her entry lands from the store — and no launch note ever speaks of it', async () => {
  const store = JSON.stringify({ kind: 'kc-taste', version: 1, queenTiming: qEntry({ version: 2 }) });
  assert.equal(queenTimingOverlayFromStoreText(store).version, 2);
  assert.equal(queenTimingOverlayFromStoreText('{"queenTiming":{"kind":"timing"}}'), null, 'malformed lands nothing');
  assert.equal(queenTimingOverlayFromStoreText('not json'), null);
  assert.equal(personasOverlayFromStoreText(store), null, 'her entry is not a personas overlay');
  // A queenTiming-only store loads through the live read; the note machinery stays silent.
  const writes = {};
  const storage = { getItem: () => null, setItem: (k, v) => (writes[k] = v), removeItem: () => {} };
  let applied = null;
  const res = await loadPersonaHeadsAtBoot({
    isDesktop: () => true,
    appDataDir: async () => '/data',
    join: async (...p) => p.join('/'),
    readTextFile: async () => store,
    getTaste: () => ({ personas: {} }),
    overlay: () => false,
    overlayRelations: () => false,
    overlayQueenTiming: (e) => ((applied = e), true),
    storage,
  });
  assert.deepEqual(res, { ok: true });
  assert.equal(applied.version, 2);
  assert.equal(writes[LAUNCH_NOTE_KEY], undefined, 'no launch note for her head');
  assert.equal(writes[HEADS_SNAPSHOT_KEY], undefined, 'no snapshot churn for her head');
});

console.log(`queenTiming.selfcheck: ${n} checks passed`);
