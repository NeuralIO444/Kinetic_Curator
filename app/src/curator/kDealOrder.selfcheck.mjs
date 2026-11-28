// node src/curator/kDealOrder.selfcheck.mjs
// #2551 — XGBoost ordering for the stage K deal's strata (the T2 pattern, extended): a tree head
// per stratum (creature, construct), trained offline on Matt's keep/cut calls, orders the dealt
// candidates WITHIN their stratum. Advisory only — it never filters, never crosses strata, and
// below the A2 earn-in bar the deal is byte-identical to the unordered deal that shipped in #2544.
//   1. the feature universes: declared names, and the extractors emit only declared names
//   2. the extractors read the assembled records' own descriptors (bindings, skeleton, drives, parts)
//   3. artifact validation: a well-formed kdeal section validates and cleans; an absent one changes nothing
//   4. validation bounds: every malformed shape neutralizes the section (the taste itself stands)
//   5. the earn-in gate: ≥200 labeled rows AND held-out Spearman ≥ 0.3, per stratum, no exceptions
//   6. the scorer contract: keep-probabilities in [0, 1], deterministic, meta carries the stamp provenance
//   7. the deal, unordered: null scorers — earned-in or not — leave the deal byte-identical to today
//   8. the deal, ordered: same candidates land with the same tiles; order and stamps follow the head
//   9. the store path: a taste with an earned-in head orders the press's births and stamps them
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KDEAL_FEATURES_VERSION,
  creatureFeatureNames,
  constructFeatureNames,
  creatureFeatures,
  constructFeatures,
} from './kDealFeatures.mjs';
import {
  validateTaste,
  validateKDealSection,
  kDealHeadEarnedIn,
  makeKDealScorer,
  makeKDealScorers,
  KDEAL_MIN_LABELED_ROWS,
} from './tasteHead.js';
import { FEATURES_VERSION } from './recipeFeatures.js';
import { resolveStageDeal } from '../state/stageKineticDeal.mjs';
import { CONSTRUCT_STYLE_IDS, constructVocabularyIds } from '../engine/constructRules.js';
import { useStore } from '../state/store.js';
import { importTaste, clearTaste } from './tasteStore.js';

const here = dirname(fileURLToPath(import.meta.url));
let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};

// ── fixtures ────────────────────────────────────────────────────────────────
const splitNum = (v, yLeaf = 1, nLeaf = -1) => ({ f: 0, op: '<', v, y: { leaf: yLeaf }, n: { leaf: nLeaf }, gain: 1 });
const treeHead = (features, split) => ({
  objective: 'binary:logistic',
  baseScore: 0,
  fidelity: 0.5,
  fitOn: 250,
  features,
  trees: [split],
});
const creatureHead = () => treeHead(['num.limbs'], splitNum(2)); // fewer limbs → higher keep-probability
const constructHead = () => treeHead(['num.parts'], splitNum(10));
const entry = (kind, head, over = {}) => ({
  version: 1,
  kind,
  head,
  labeledRows: 250,
  heldOut: 0.5,
  trainedAt: '2026-11-28',
  featuresVersion: KDEAL_FEATURES_VERSION,
  ...over,
});
const tasteFile = (kdeal) => ({
  kind: 'kc-taste',
  version: 1,
  featuresVersion: FEATURES_VERSION,
  model: 'fixture',
  dims: 0,
  trainedAt: '',
  labels: { likes: 0, passes: 0 },
  head: { terms: {}, num: {}, bias: 0, fidelity: 0.5, fitOn: 0 },
  ...(kdeal ? { kdeal } : {}),
});
const earnedKDeal = () => ({
  creature: entry('creature', creatureHead()),
  construct: entry('construct', constructHead()),
});

// ── 1. the universes ────────────────────────────────────────────────────────
{
  const cn = creatureFeatureNames();
  const kn = constructFeatureNames();
  assert.deepEqual(cn.slice(0, 4), ['body', 'look', 'voice', 'material'], 'creature categoricals bind first');
  assert.ok(
    cn.includes('num.limbs') && cn.includes('num.boredom') && cn.includes('num.costRatio'),
    'creature numerics declared',
  );
  assert.deepEqual(kn.slice(0, 1), ['style'], 'construct categorical binds first');
  assert.ok(kn.includes('num.parts') && kn.includes('num.repeatShare'), 'construct numerics declared');
  assert.equal(new Set(cn).size, cn.length, 'no duplicate creature names');
  assert.equal(new Set(kn).size, kn.length, 'no duplicate construct names');
  for (const [extract, names, rec] of [
    [
      creatureFeatures,
      cn,
      { body: 'org_petal_03', look: 'dusk-flock', voice: 'random', limbs: [], joints: [], genome: [] },
    ],
    [constructFeatures, kn, { style: 'swiss', parts: [], points: [] }],
  ]) {
    const v = extract(rec);
    for (const k of Object.keys(v)) if (k !== 'num') assert.ok(names.includes(k), `categorical ${k} is declared`);
    for (const k of Object.keys(v.num)) assert.ok(names.includes(`num.${k}`), `numeric ${k} is declared`);
  }
  ok('feature universes: binding order declared per stratum; extractors emit only declared names');
}

// ── 2. the extractors read the records ──────────────────────────────────────
{
  const rec = {
    body: 'org_petal_03',
    look: 'dusk-flock',
    voice: 'random',
    head: { x: 50, y: 2 },
    limbs: [
      { x: 50, y: 98 },
      { x: 38, y: 50 },
    ],
    joints: [{ x: 62, y: 50 }],
    genome: [
      { family: 'MATERIAL', id: 'material', value: 'japanese-brush' },
      { family: 'DRIVE', id: 'approval', value: 0.5 },
      { family: 'DRIVE', id: 'boredom', value: 2 },
    ],
    cultivated: { outcome: 'viable', cost: { score: 150, threshold: 600 }, warnings: ['w1'] },
  };
  const v = creatureFeatures(rec);
  assert.equal(v.body, 'org_petal_03');
  assert.equal(v.material, 'japanese-brush', 'the material reads from the genome gene');
  assert.equal(v.num.limbs, 2);
  assert.equal(v.num.attach, 4, 'head + limbs + joints');
  assert.equal(v.num.spanY, 96, 'the skeleton reach, head to lowest limb');
  assert.equal(v.num.approval, 0.5);
  assert.equal(v.num.costRatio, 0.25);
  assert.equal(v.num.warnings, 1);
  const crec = {
    style: 'swiss',
    parts: [
      { asset: 'geo_square_01', own: 0, x: 0, y: 0, s: 0.2, r: 0 },
      { asset: 'geo_square_01', own: 2, x: 30, y: 40, s: 0.4, r: 90 },
      { asset: 'line_solid_01', own: 2, x: 60, y: 0, s: 0.3, r: 90 },
    ],
    points: [{ x: 0, y: 0 }],
  };
  const cv = constructFeatures(crec);
  assert.equal(cv.style, 'swiss');
  assert.equal(cv.num.parts, 3);
  assert.equal(cv.num.vocab, 2);
  assert.equal(cv.num.ownMax, 2);
  assert.equal(cv.num.rotKinds, 2);
  assert.ok(Math.abs(cv.num.repeatShare - 1 / 3) < 1e-9, 'one of three parts repeats a shape');
  assert.equal(cv.num.spanX, 60);
  ok('extractors: bindings, skeleton counts/reach, drive genes, cultivation read; style, parts, hierarchy, spread');
}

// ── 3. validation: well-formed stands, absent changes nothing ──────────────
{
  const r = validateTaste(tasteFile(earnedKDeal()));
  assert.ok(r.ok, 'a taste carrying a kdeal section validates');
  assert.ok(r.taste.kdeal && r.taste.kdeal.creature && r.taste.kdeal.construct, 'both strata survive');
  assert.equal(r.taste.kdeal.creature.head.kind, 'xgboost-trees', 'the head cleans to the tree kind');
  assert.equal(r.taste.kdeal.creature.labeledRows, 250);
  const bare = validateTaste(tasteFile(null));
  assert.ok(bare.ok && !('kdeal' in bare.taste), 'no section: the taste is exactly the object it always was');
  ok('validation: a well-formed kdeal section validates and cleans; an absent one adds nothing');
}

// ── 4. validation bounds: malformed neutralizes ─────────────────────────────
{
  const deepSplit = (d) =>
    d === 0 ? { leaf: 0 } : { f: 0, op: '<', v: 1, y: deepSplit(d - 1), n: { leaf: 0 }, gain: 1 };
  const cases = {
    'an unknown stratum': { beast: entry('creature', creatureHead()) },
    'kind is not its key': { creature: entry('construct', creatureHead()) },
    'a stale featuresVersion': { creature: entry('creature', creatureHead(), { featuresVersion: 99 }) },
    'heldOut beyond the clamp band': { creature: entry('creature', creatureHead(), { heldOut: 2 }) },
    'a non-integer labeledRows': { creature: entry('creature', creatureHead(), { labeledRows: 12.5 }) },
    'a feature outside the stratum universe': {
      construct: entry(
        'construct',
        treeHead(['body'], { f: 0, op: '=', v: 'x', y: { leaf: 1 }, n: { leaf: -1 }, gain: 1 }),
      ),
    },
    'a tree deeper than the bound': { creature: entry('creature', treeHead(['num.limbs'], deepSplit(9))) },
    'one good stratum, one bad': {
      creature: entry('creature', creatureHead()),
      construct: entry('construct', constructHead(), { version: 0 }),
    },
  };
  for (const [name, kdeal] of Object.entries(cases)) {
    const r = validateTaste(tasteFile(kdeal));
    assert.ok(r.ok, `${name}: the taste itself still validates`);
    assert.ok(!('kdeal' in r.taste), `${name}: the section neutralizes whole`);
    assert.equal(validateKDealSection(kdeal), null, `${name}: the section validator refuses`);
  }
  ok(
    'validation bounds: unknown stratum, kind/key mismatch, stale universe, bad stamps, foreign features, depth — all neutralize',
  );
}

// ── 5. the earn-in gate ─────────────────────────────────────────────────────
{
  assert.equal(KDEAL_MIN_LABELED_ROWS, 200, 'the count is the one earn-in law’s 200');
  const good = earnedKDeal().creature;
  assert.ok(kDealHeadEarnedIn(good), '250 rows at 0.5 Spearman earns in');
  assert.ok(!kDealHeadEarnedIn({ ...good, heldOut: 0.29 }), 'below the 0.3 bar: no');
  assert.ok(kDealHeadEarnedIn({ ...good, heldOut: 0.3 }), 'at the bar exactly: yes');
  assert.ok(!kDealHeadEarnedIn({ ...good, labeledRows: 199 }), 'one row short: no');
  assert.ok(kDealHeadEarnedIn({ ...good, labeledRows: 200 }), 'at the count exactly: yes');
  assert.ok(!kDealHeadEarnedIn(null) && !kDealHeadEarnedIn(undefined), 'no entry: no');
  const mixed = validateTaste(
    tasteFile({
      creature: entry('creature', creatureHead()),
      construct: entry('construct', constructHead(), { heldOut: 0.1 }),
    }),
  ).taste;
  const scorers = makeKDealScorers(mixed);
  assert.ok(scorers && scorers.creature && !scorers.construct, 'the gate is per stratum: one earns in, one does not');
  assert.equal(makeKDealScorers(validateTaste(tasteFile(null)).taste), null, 'no section: no scorers');
  assert.equal(makeKDealScorer(mixed, 'beast'), null, 'an unknown stratum has no scorer');
  ok('earn-in gate: ≥200 labeled rows AND held-out ≥ 0.3, per stratum; below either, the stratum stays unordered');
}

// ── 6. the scorer contract ──────────────────────────────────────────────────
{
  const taste = validateTaste(tasteFile(earnedKDeal())).taste;
  const s = makeKDealScorer(taste, 'creature');
  assert.equal(s.id, 'xgb-kdeal-creature-v1');
  assert.deepEqual(s.meta, { tasteVersion: 1, headKind: 'xgboost-trees' }, 'the stamp provenance rides the scorer');
  const few = { limbs: [{ x: 0, y: 0 }], joints: [], genome: [] };
  const many = {
    limbs: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
    joints: [],
    genome: [],
  };
  const pFew = s.score(few);
  const pMany = s.score(many);
  assert.ok(
    pFew > 0.5 && pMany < 0.5,
    `the fixture head prefers fewer limbs (${pFew.toFixed(3)} vs ${pMany.toFixed(3)})`,
  );
  assert.ok(pFew <= 1 && pMany >= 0, 'scores are keep-probabilities');
  assert.equal(s.score(few), pFew, 'the walk is deterministic');
  ok('scorer contract: { id, score, meta } in the diceScorer shape; probabilities, deterministic, head-ordered');
}

// ── the deal fixtures (the stageKineticDeal suite's own setup) ─────────────
const SEED = 1234567;
const base = (over = {}) => ({
  seed: SEED,
  startupMode: 'weak',
  customAssets: [],
  creatureRecords: [],
  stageBirths: [],
  constructRecords: [],
  shapeShelf: [],
  assetAttach: {},
  layoutParams: { composition: null },
  kineticVoiceId: null,
  ...over,
});
const commit = { geo_square_01: true, org_blob_01: true };
const [STYLE, VOCAB] = CONSTRUCT_STYLE_IDS.map((s) => [s, constructVocabularyIds(s)]).find(([, v]) => v.length >= 2);
const shelf = VOCAB.slice(0, 2).map((asset) => ({ style: STYLE, asset }));

// ── 7. unordered: byte-identical ────────────────────────────────────────────
{
  const plain = resolveStageDeal(base({ shapeShelf: shelf }), 1, commit);
  const explicitNull = resolveStageDeal(base({ shapeShelf: shelf }), 1, commit, { orderScorers: null });
  assert.equal(JSON.stringify(explicitNull), JSON.stringify(plain), 'an explicit null is the default path');
  const belowBar = validateTaste(tasteFile({ creature: entry('creature', creatureHead(), { heldOut: 0.2 }) })).taste;
  assert.equal(makeKDealScorers(belowBar), null, 'a below-bar head yields no scorers');
  const viaGate = resolveStageDeal(base({ shapeShelf: shelf }), 1, commit, {
    orderScorers: makeKDealScorers(belowBar),
  });
  assert.equal(JSON.stringify(viaGate), JSON.stringify(plain), 'below the bar, the deal is byte-identical to today');
  ok('unordered deal: no scorers, or only below-bar heads, deal byte-identically to the pre-#2551 deal');
}

// ── 8. ordered: same hand, head order, stamps ───────────────────────────────
{
  const plain = resolveStageDeal(base({ shapeShelf: shelf }), 1, commit);
  // a stub head: the first-dealt creature wins outright; everyone else ties (deal order must hold)
  const winnerId = plain.creatures[2].id;
  const creatureScorer = {
    id: 'stub-creature',
    meta: { tasteVersion: 7, headKind: 'xgboost-trees' },
    score: (rec) => (rec.id === winnerId ? 0.9 : 0.5),
  };
  const constructScorer = {
    id: 'stub-construct',
    meta: { tasteVersion: 7, headKind: 'xgboost-trees' },
    score: (rec) => rec.parts.length, // more parts first — a total order to check against
  };
  const ordered = resolveStageDeal(base({ shapeShelf: shelf }), 1, commit, {
    orderScorers: { creature: creatureScorer, construct: constructScorer },
  });
  assert.deepEqual(
    ordered.creatures.map((c) => c.id).sort(),
    plain.creatures.map((c) => c.id).sort(),
    'the same creatures land — ordering never filters',
  );
  assert.equal(ordered.creatures[0].id, winnerId, 'the head’s winner stands first');
  assert.deepEqual(
    ordered.creatures.slice(1).map((c) => c.id),
    plain.creatures.filter((c) => c.id !== winnerId).map((c) => c.id),
    'tied scores keep deal order behind the winner',
  );
  for (const rec of ordered.creatures) {
    assert.equal(rec.xgbScore, rec.id === winnerId ? 0.9 : 0.5, `${rec.id}: the stamp carries the score`);
    assert.equal(rec.tasteVersion, 7, `${rec.id}: the stamp carries the taste version`);
    assert.equal(rec.headKind, 'xgboost-trees', `${rec.id}: the stamp carries the head kind`);
  }
  assert.deepEqual(
    ordered.stageBirths.map((b) => b.record.id),
    ordered.creatures.map((c) => c.id),
    'the births stand in the head’s order',
  );
  const plainTiles = new Map(plain.stageBirths.map((b) => [b.record.id, JSON.stringify(b.tile)]));
  for (const b of ordered.stageBirths)
    assert.equal(
      JSON.stringify(b.tile),
      plainTiles.get(b.record.id),
      `${b.record.id}: its tile is the unordered deal’s tile`,
    );
  const partCounts = ordered.constructs.map((c) => c.parts.length);
  assert.deepEqual(
    partCounts,
    [...partCounts].sort((a, b) => b - a),
    'constructs land in the head’s order',
  );
  assert.deepEqual(
    ordered.constructRecords.map((c) => c.id),
    ordered.constructs.map((c) => c.id),
    'the bank takes the constructs in landed order',
  );
  assert.deepEqual(
    Object.keys(ordered.enabledAssets).sort(),
    Object.keys(plain.enabledAssets).sort(),
    'the same tiles join the roll',
  );
  ok('ordered deal: same candidates, same tiles, same bank set — order and the T2 stamp trio follow the head');
}

// ── 9. the store path ───────────────────────────────────────────────────────
{
  const src = readFileSync(join(here, '../state/slices/layoutSlice.js'), 'utf8');
  assert.match(src, /makeKDealScorers\(getTaste\(\)\)/, 'the wrapper builds the scorers from the loaded taste');
  const r = importTaste(tasteFile(earnedKDeal()));
  assert.ok(r.ok, 'the fixture taste imports');
  useStore.setState({
    seed: SEED,
    startupMode: 'weak',
    shapeShelf: shelf,
    stageBirths: [],
    constructRecords: [],
    stageDealPress: 0,
    enabledAssets: {},
  });
  useStore.getState().kineticLookPass();
  const births = useStore.getState().stageBirths || [];
  assert.equal(births.length, 6, `six dealt creatures stand (measured ${births.length})`);
  for (const b of births) {
    assert.ok(typeof b.record.xgbScore === 'number', `${b.record.id}: the standing birth carries its stamp`);
    assert.equal(b.record.headKind, 'xgboost-trees');
  }
  const scores = births.map((b) => b.record.xgbScore);
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
    'the standing births are in the head’s order',
  );
  clearTaste();
  ok('store path: an imported taste with earned-in heads orders the LOOK pass’s births and stamps them');
}

console.log(`kDealOrder.selfcheck: OK (${checks} checks)`);
