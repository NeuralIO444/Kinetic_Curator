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
} from './dice.js';
import { createPersonaScorer } from './diceScorer.js';
import { readCrowns, recordCrown, crownPairCount, DICE_CROWNS_MAX } from './diceCrowns.js';

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
assert.strictEqual(layoutIds.size, 14, 'the dice rolls across all 14 layout modes');

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
const mem = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v) }; })();
const roll = rollDice({ assets: ASSETS, rng: mulberry32(7), davisCode: 'FLOW', scorer, crowns: readCrowns(mem) });
assert.strictEqual(roll.finalists.length, DICE_FINALISTS, 'LOIS shortlists exactly 3');
assert.strictEqual(roll.rolled, DICE_CANDIDATES_BASE + Math.round(0.2 * DICE_CANDIDATES_WILD), 'FLOW deals few candidates');
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
assert.deepStrictEqual(roll.finalists.map((f) => f.layoutId + f.assetIds.join(',')), sorted.map((f) => f.layoutId + f.assetIds.join(',')), 'finalists are the top-3 scored');

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
  for (const c of rollDice({ assets: ASSETS, rng: mulberry32(1000 + i), davisCode: null, scorer, crowns: [] }).candidates) seen.add(c.layoutId);
}
assert.strictEqual(seen.size, 14, `all 14 modes proposed, saw ${seen.size}`);

// 7. Scorer interface: a fake MLX head swaps in without touching the dice.
const mlxHead = { id: 'mlx-head-v1', score: (c) => c.assetIds.length / 5 };
const swapped = rollDice({ assets: ASSETS, rng: mulberry32(7), davisCode: null, scorer: mlxHead, crowns: [] });
assert.strictEqual(swapped.finalists.length, 3, 'swapped scorer still shortlists 3');

// 8. Auto-absorb: a brand-new pack with none of the known tags still deals full casts.
const alienPack = Array.from({ length: 30 }, (_, i) => ({ id: `alien_${i}`, category: 'xenomorphic', tags: ['unseen'], weight: 'medium', density: 'medium', svg: '<circle/>' }));
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

console.log('[dice] selfcheck OK — 14 layouts, casts 2–5, 3 finalists, crowns persist');
