// node src/curator/dice.selfcheck.mjs
//
// The tasteful dice: uniform layout proposals, metadata-read casts 2–5,
// Davis-modulated wildness, scorer-interface shortlist of 3, crown log.
import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import { STUB_VOICES } from '../data/voices.js';
import {
  rollDice,
  wildnessForDavis,
  baseCastSize,
  castSizeFor,
  dealCast,
  affinity,
  priorAffinity,
  DICE_FINALISTS,
  DICE_CANDIDATES_BASE,
  DICE_CANDIDATES_WILD,
  STRATIFIED_FAMILIES,
  DICE_STRATIFIED_SHARE,
} from './dice.js';
import { createPersonaScorer } from './diceScorer.js';
import { readCrowns, recordCrown, crownPairCount, DICE_CROWNS_MAX } from './diceCrowns.js';
import { validateTaste, makeXgbScorer, XGB_HEAD_KIND } from './tasteHead.js';
import { FEATURES_VERSION } from './recipeFeatures.js';

// Deterministic stream — a roll with the same seed deals the same dice.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const scorer = createPersonaScorer({ assetsById: byId });
const layoutIds = new Set(STUB_VOICES.map((v) => v.id));
assert.strictEqual(layoutIds.size, 15, 'the dice rolls across all 15 layout modes');

// 1. Wildness: UGLY sifts wide, FLOW stays close; silence is an honest middle.
assert.strictEqual(wildnessForDavis('UGLY'), 1.0);
assert.strictEqual(wildnessForDavis('FLOW'), 0.2);
assert.ok(wildnessForDavis('STUCK') > wildnessForDavis('BLOOM'), 'STUCK wilder than BLOOM');
assert.strictEqual(wildnessForDavis(null), 0.5);
assert.strictEqual(wildnessForDavis('???'), 0.5, 'unknown state degrades to middle, never crashes');

// 2. Cast sizing: mode character 2–4, jittered to 2–5, never outside.
for (const v of STUB_VOICES) {
  const b = baseCastSize(v.id);
  assert.ok(b >= 2 && b <= 4, `${v.id} base size ${b} in 2..4`);
}
for (let i = 0; i < 500; i++) {
  const s = castSizeFor('grid', mulberry32(i), mulberry32(i + 999)());
  assert.ok(s >= 2 && s <= 5, `cast size ${s} in 2..5`);
}

// 3. A roll: 3 finalists, valid layouts, casts 2–5 of real unique assets.
const mem = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v) };
})();
const roll = rollDice({ assets: ASSETS, rng: mulberry32(7), davisCode: 'FLOW', scorer, crowns: readCrowns(mem) });
assert.strictEqual(roll.finalists.length, DICE_FINALISTS, 'LOIS shortlists exactly 3');
assert.strictEqual(
  roll.rolled,
  DICE_CANDIDATES_BASE + Math.round(0.2 * DICE_CANDIDATES_WILD),
  'FLOW deals few candidates',
);
assert.strictEqual(roll.kept, DICE_FINALISTS);
for (const f of roll.finalists) {
  assert.ok(layoutIds.has(f.layoutId), `${f.layoutId} is a real layout`);
  assert.ok(f.assetIds.length >= 2 && f.assetIds.length <= 5, 'cast 2..5');
  assert.strictEqual(new Set(f.assetIds).size, f.assetIds.length, 'no duplicate assets in a cast');
  for (const id of f.assetIds) assert.ok(byId.has(id), `${id} is a real asset`);
  assert.ok(Number.isFinite(f.score), 'every finalist carries a score');
}
// Finalists are the top 3 by score, sorted.
const sorted = [...roll.candidates].sort((a, b) => b.score - a.score).slice(0, 3);
assert.deepStrictEqual(
  roll.finalists.map((f) => f.layoutId + f.assetIds.join(',')),
  sorted.map((f) => f.layoutId + f.assetIds.join(',')),
  'finalists are the top-3 scored',
);

// 4. Determinism: same seed, same dice.
const again = rollDice({ assets: ASSETS, rng: mulberry32(7), davisCode: 'FLOW', scorer, crowns: [] });
assert.deepStrictEqual(again.finalists, roll.finalists, 'seeded roll is reproducible');

// 5. UGLY deals more candidates than FLOW (wildness is in the proposals).
const ugly = rollDice({ assets: ASSETS, rng: mulberry32(7), davisCode: 'UGLY', scorer, crowns: [] });
assert.strictEqual(ugly.rolled, DICE_CANDIDATES_BASE + DICE_CANDIDATES_WILD, 'UGLY deals the full spread');
assert.ok(ugly.rolled > roll.rolled, 'UGLY proposes more than FLOW');

// 6. Layout proposals are uniform-ish: every mode appears across many rolls.
const seen = new Set();
for (let i = 0; i < 40; i++) {
  for (const c of rollDice({ assets: ASSETS, rng: mulberry32(1000 + i), davisCode: null, scorer, crowns: [] })
    .candidates)
    seen.add(c.layoutId);
}
assert.strictEqual(seen.size, 15, `all 15 modes proposed, saw ${seen.size}`);

// 7. Scorer interface: a fake MLX head swaps in without touching the dice.
const mlxHead = { id: 'mlx-head-v1', score: (c) => c.assetIds.length / 5 };
const swapped = rollDice({ assets: ASSETS, rng: mulberry32(7), davisCode: null, scorer: mlxHead, crowns: [] });
assert.strictEqual(swapped.finalists.length, 3, 'swapped scorer still shortlists 3');

// 8. Auto-absorb: a brand-new pack with none of the known tags still deals full casts.
const alienPack = Array.from({ length: 30 }, (_, i) => ({
  id: `alien_${i}`,
  category: 'xenomorphic',
  tags: ['unseen'],
  weight: 'medium',
  density: 'medium',
  svg: '<circle/>',
}));
const alienCast = dealCast(alienPack, 5, mulberry32(3), 0.5, []);
assert.strictEqual(alienCast.length, 5, 'alien pack deals a full cast of 5');
assert.strictEqual(new Set(alienCast).size, 5, 'alien cast has no duplicates');

// 9. Persona scorer: role coverage outranks a bare pair; unknown ids score 0.
const lead = ASSETS.find((a) => a.weight === 'heavy' || a.density === 'solid');
const sparse = ASSETS.find((a) => a.density === 'sparse' && a.id !== lead.id);
const line = ASSETS.find((a) => a.category === 'linework' && a.id !== lead.id && a.id !== sparse.id);
const full = scorer.score({ layoutId: 'grid', assetIds: [lead.id, sparse.id, line.id] });
const bare = scorer.score({ layoutId: 'grid', assetIds: [lead.id, sparse.id] });
assert.ok(full > bare, `role-complete cast (${full.toFixed(2)}) outscores a pair (${bare.toFixed(2)})`);
assert.strictEqual(scorer.score({ layoutId: 'grid', assetIds: ['nope'] }), 0, 'unknown assets score 0');
assert.strictEqual(scorer.score({ layoutId: 'grid', assetIds: [] }), 0, 'empty cast scores 0');

// 10. Crown log: round-trips, sanitizes, caps.
assert.deepStrictEqual(readCrowns(mem), [], 'fresh log is empty');
const logged = recordCrown({ layoutId: 'grid', assetIds: ['a', 'b', 'a'], davisCode: 'UGLY' }, mem);
assert.strictEqual(logged.length, 1);
assert.deepStrictEqual(logged[0].assetIds, ['a', 'b'], 'crown asset ids deduped');
assert.strictEqual(logged[0].davisCode, 'UGLY');
assert.strictEqual(recordCrown({ layoutId: '', assetIds: [] }, mem).length, 1, 'junk crown refused');
for (let i = 0; i < DICE_CROWNS_MAX + 10; i++) recordCrown({ layoutId: 'grid', assetIds: [`x${i}`] }, mem);
assert.ok(readCrowns(mem).length <= DICE_CROWNS_MAX, 'crown log is capped');
assert.strictEqual(crownPairCount('x1', 'x2', readCrowns(mem)), 0, 'pair count honest when absent');

// 11. Affinity: same-category prior favors kin; crowns outvote it with evidence.
const kinA = { id: 'k1', category: 'organic' };
const kinB = { id: 'k2', category: 'organic' };
const farB = { id: 'f1', category: 'geometric' };
assert.ok(priorAffinity(kinA, kinB) > priorAffinity(kinA, farB), 'prior favors same category');
const ev = [];
for (let i = 0; i < 60; i++) ev.push({ ts: i, layoutId: 'grid', assetIds: ['k1', 'f1'], davisCode: null });
assert.ok(affinity(kinA, farB, ev) > affinity(kinA, kinB, []), 'sustained crowned pairings outvote the empty prior');

// 12. XGBoost T2: a tree head orders WITHIN the deal's strata. The deal
// (stream, casts, shares) is untouched; scores never gate; the anchored
// stratum keeps a finalist voice in the deal's own proportion; a crown
// from an ordered tray carries the model's stamp (spec §5/§6).
const chainOf = (pairs, rest) =>
  pairs.length === 0
    ? { leaf: rest }
    : { f: 0, op: '=', v: pairs[0][0], gain: 1, y: { leaf: pairs[0][1] }, n: chainOf(pairs.slice(1), rest) };
const XGB_TASTE = validateTaste({
  kind: 'kc-taste',
  version: 1,
  featuresVersion: FEATURES_VERSION,
  model: 'dice fixture',
  dims: 1152,
  labels: { likes: 10, passes: 10 },
  head: {
    kind: XGB_HEAD_KIND,
    objective: 'binary:logistic',
    baseScore: 0,
    fidelity: 0.9,
    features: ['system'],
    trees: [
      chainOf(
        [
          ['fibonacci', 1.2],
          ['orbit', 0.9],
          ['grid', 0.4],
          ['swarm', -0.9],
          ['eden', -0.5],
        ],
        0,
      ),
    ],
  },
}).taste;
const xgbScorer = makeXgbScorer(XGB_TASTE);
assert.ok(xgbScorer && xgbScorer.id === 'xgb-head-v1', 'fixture head yields the xgb scorer');
const META = { tasteVersion: 1, headKind: XGB_HEAD_KIND };
const orderedArgs = {
  assets: ASSETS,
  rng: mulberry32(7),
  davisCode: 'FLOW',
  scorer,
  crowns: [],
  orderScorer: xgbScorer,
  orderMeta: META,
};
const oroll = rollDice(orderedArgs);
const oroll2 = rollDice({ ...orderedArgs, rng: mulberry32(7) });
assert.deepStrictEqual(oroll2, oroll, 'ordered roll is deterministic');
const plain7 = rollDice({ assets: ASSETS, rng: mulberry32(7), davisCode: 'FLOW', scorer, crowns: [] });
const castKey = (c) => `${c.layoutId}|${c.assetIds.join(',')}`;
assert.deepStrictEqual(
  oroll.candidates.map(castKey).sort(),
  plain7.candidates.map(castKey).sort(),
  'ordering deals the SAME casts — the stream is untouched, only the order changes',
);
// stamps: score + stratum on every candidate; anchored = the stratified tail.
const stratCount7 = Math.max(1, Math.round(oroll.rolled * DICE_STRATIFIED_SHARE));
const anchored7 = oroll.candidates.filter((c) => c.stratum === 'anchored');
const open7 = oroll.candidates.filter((c) => c.stratum === 'open');
assert.strictEqual(anchored7.length, stratCount7, 'anchored stratum = the #1546 share of the roll');
assert.strictEqual(open7.length + anchored7.length, oroll.rolled);
for (const c of oroll.candidates) {
  assert.ok(Number.isFinite(c.xgbScore) && c.xgbScore > 0 && c.xgbScore < 1, 'xgb score stamped, in (0,1)');
  assert.strictEqual(c.xgbScore, xgbScorer.score(c), 'stamp is the scorer reading of the candidate');
}
for (const c of open7) assert.strictEqual(c.anchorFamily, null, 'open candidates anchor nothing');
for (const c of anchored7) {
  assert.ok(
    STRATIFIED_FAMILIES.some((f) => f.category === c.anchorFamily),
    'anchored family is a stratified family',
  );
  assert.strictEqual(byId.get(c.assetIds[0]).category, c.anchorFamily, 'the cast leads with its anchor family');
}
// allocation: finalist slots follow the strata proportions — for this
// roll (11 dealt, 3 anchored) exactly 1 anchored + 2 open — and each
// slot goes to its stratum's model-best. Scores never gate: the
// anchored finalist is a finalist by winning its stratum alone.
const anchoredSlots7 = Math.min(
  anchored7.length,
  Math.max(1, Math.round((DICE_FINALISTS * anchored7.length) / oroll.rolled)),
);
assert.strictEqual(
  oroll.finalists.filter((f) => f.stratum === 'anchored').length,
  anchoredSlots7,
  'anchored finalist share = deal proportion',
);
assert.ok(oroll.finalists.includes(anchored7[0]), 'anchored finalist is the anchored stratum’s model-best');
assert.ok(
  oroll.finalists.includes(open7[0]) && oroll.finalists.includes(open7[1]),
  'open slots go to the open stratum’s model-best',
);
for (let i = 1; i < oroll.finalists.length; i++) {
  assert.ok(oroll.finalists[i - 1].xgbScore >= oroll.finalists[i].xgbScore, 'the tray is presented in model order');
}
assert.deepStrictEqual(oroll.orderMeta, META, 'the roll echoes which head ordered it');
// ties fall to the persona score: a constant model still orders each
// stratum by the persona ranking — and gates nothing.
const flat = rollDice({ ...orderedArgs, rng: mulberry32(7), orderScorer: { id: 'xgb-head-v1', score: () => 0.5 } });
const flatAnchored = flat.candidates.filter((c) => c.stratum === 'anchored');
const flatAnchoredBest = flatAnchored.reduce((a, b) => (b.score > a.score ? b : a));
assert.ok(flat.finalists.includes(flatAnchoredBest), 'flat model: the anchored persona-best still reaches the tray');
// T3: Davis's citable reasons ride the ordered candidates — the clause
// from each candidate's own tree path (this fixture splits on system
// only, so the citation names the mode in the trainer's words). A scorer
// that cannot explain itself stamps null, and the tray stays silent.
for (const c of oroll.candidates) {
  assert.strictEqual(c.xgbReason, `${c.layoutId} layouts`, 'reason stamped from the candidate’s own path');
  assert.strictEqual(c.xgbReason, xgbScorer.explain(c), 'stamp is the scorer’s explanation of the candidate');
}
for (const c of flat.candidates) {
  assert.strictEqual(c.xgbReason, null, 'an unexplaining scorer stamps null reasons');
}
// no head: the pre-T2 surface exactly — no stamps, no orderMeta.
assert.ok(!('orderMeta' in plain7), 'unordered roll carries no orderMeta');
for (const c of plain7.candidates) {
  assert.ok(
    !('xgbScore' in c) && !('stratum' in c) && !('anchorFamily' in c),
    'unordered candidates carry no T2 stamps',
  );
}
// crown stamps: the trio round-trips through the log; persona crowns
// and junk both file as honest nulls.
const mem2 = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v) };
})();
recordCrown(
  { layoutId: 'grid', assetIds: ['a', 'b'], davisCode: null, xgbScore: 0.77, tasteVersion: 1, headKind: XGB_HEAD_KIND },
  mem2,
);
recordCrown({ layoutId: 'grid', assetIds: ['a', 'c'], davisCode: null }, mem2);
recordCrown(
  { layoutId: 'grid', assetIds: ['a', 'd'], davisCode: null, xgbScore: 'high', tasteVersion: -1, headKind: 42 },
  mem2,
);
const logged2 = readCrowns(mem2);
assert.strictEqual(logged2[0].xgbScore, 0.77, 'crown keeps the model score');
assert.strictEqual(logged2[0].tasteVersion, 1, 'crown keeps the taste version');
assert.strictEqual(logged2[0].headKind, XGB_HEAD_KIND, 'crown keeps the head kind');
assert.deepStrictEqual(
  [logged2[1].xgbScore, logged2[1].tasteVersion, logged2[1].headKind],
  [null, null, null],
  'a persona crown files the trio as nulls',
);
assert.deepStrictEqual(
  [logged2[2].xgbScore, logged2[2].tasteVersion, logged2[2].headKind],
  [null, null, null],
  'junk stamp values sanitize to nulls',
);

console.log('[dice] selfcheck OK — 15 layouts, casts 2–5, 3 finalists, crowns persist');
