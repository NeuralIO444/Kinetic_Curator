// rollKits.selfcheck.mjs — #1944 (asset descriptors, slice 3): kits and the three-kit deal.
//
//   door        sanitizeKit: slug id, ≤ 24-char name, vocabulary-only `where`, weights clamped, cap 1..12; a kit that
//               constrains nothing is refused; the document list is deduped, capped and never shadows a seed kit
//   seeds       the six seed kits survive their own door and each resolve to a real sub-pool
//   determinism same seed + kits → same deal; the order the three kits are passed in changes nothing
//   proportion  over 500 rolls: every kit shows up every roll, within a seat of its seeded share, none under 20%,
//               and no fourth source (every dealt asset belongs to the kit it was dealt for)
//   fallback    an empty kit is named and its seats dropped (a smaller deal, never a random one); all empty → named,
//               nothing dealt; dealPoolFor falls back to today's deal WITH the note
//   untouched   rolls without kits are byte-identical to main (golden hash), and consume the same random stream
//   rolls       a standing triad drives the look pass and CHAOS; a Look's own kits are honoured; the triad beats them;
//               START: OFF (curated sets) ignores kits; the store door, the document round trip
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ASSETS } from '../data/assets/index.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { mkRng } from '../engine/prng.js';
import {
  SEED_KITS,
  sanitizeKit,
  sanitizeKitsDoc,
  sanitizeKitTriad,
  kitsById,
  resolveKit,
  KITS_MAX,
} from '../data/kits.js';
import {
  dealableRecords,
  dealPoolFor,
  dealMixedPool,
  dealKitTriad,
  kitDescriptors,
  KIT_MIN_SHARE,
} from './rollPool.mjs';
import { lookPass } from './kineticSweep.mjs';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const records = dealableRecords(ASSETS, []);
const desc = kitDescriptors(records, { assets: ASSETS });
const kits3 = kitsById(['kanji', 'big-shapes', 'botanica']);
const poolOf = (kit) => new Set(resolveKit(kit, desc).ids);

// ---- door
assert.equal(sanitizeKit(null), null);
assert.equal(sanitizeKit({ id: 'Bad Id', name: 'x', where: { categories: ['radial'] } }), null, 'id must be a slug');
assert.equal(sanitizeKit({ id: 'ok', name: '', where: { categories: ['radial'] } }), null, 'a name is required');
assert.equal(sanitizeKit({ id: 'ok', name: 'x', where: {} }), null, 'a kit that constrains nothing is refused');
assert.equal(
  sanitizeKit({ id: 'ok', name: 'x', where: { categories: ['nonsense'], styles: ['nope'] } }),
  null,
  'unknown vocabulary is dropped, leaving nothing',
);
const k = sanitizeKit({
  id: 'mine',
  name: 'A very long name that must be cut down',
  where: {
    facets: { subject: ['leaf', 'form-term', 7], form: ['leaf'] },
    categories: ['radial', 'zzz'],
    minRole: { limb: 0.5, body: 7, head: 'x' },
  },
  weights: { leaf: 99, flower: 0, limb: 2, bogus: 3 },
  cap: 99,
});
assert.deepEqual(
  k.where,
  { facets: { subject: ['leaf'] }, categories: ['radial'], minRole: { limb: 0.5 } },
  'where holds only vocabulary',
);
assert.equal(k.name.length, 24);
assert.deepEqual(k.weights, { leaf: 4, flower: 0.25, limb: 2 }, 'weights clamp to [¼, 4] and key on the vocabulary');
assert.equal(k.cap, 12, 'cap clamps');
assert.equal(sanitizeKit({ id: 'ok', name: 'x', where: { categories: ['radial'] } }).cap, 4, 'default cap');
assert.equal(sanitizeKitsDoc('x'), null);
const doc = sanitizeKitsDoc([k, k, { ...k, id: 'kanji' }, { nope: 1 }]);
assert.deepEqual(
  doc.map((x) => x.id),
  ['mine'],
  'deduped, and a seed id is never shadowed',
);
const many = sanitizeKitsDoc(
  Array.from({ length: 40 }, (_, i) => ({ id: `k${i}`, name: `K${i}`, where: { categories: ['radial'] } })),
);
assert.equal(many.length, KITS_MAX, 'artist kits are capped');
assert.deepEqual(
  sanitizeKitTriad(['kanji', 'nope', 'kanji', 'bloom', 'signal', 'botanica']),
  ['kanji', 'bloom', 'signal'],
  'a triad is up to three distinct known ids',
);

// ---- seeds
assert.equal(SEED_KITS.length, 6);
for (const kit of SEED_KITS) {
  assert.deepEqual(sanitizeKit(kit), kit, `${kit.id} survives its own door`);
  assert.ok(poolOf(kit).size >= 15, `${kit.id} resolves to a real sub-pool (${poolOf(kit).size})`);
}

// ---- determinism
const ids = (kits, seed) => dealKitTriad(kits, seed, { records: desc }).ids;
for (let seed = 1; seed <= 20; seed++) {
  assert.deepEqual(ids(kits3, seed), ids(kits3, seed), 'same seed, same deal');
  const perms = [
    [0, 1, 2],
    [2, 1, 0],
    [1, 2, 0],
    [1, 0, 2],
  ].map((p) =>
    ids(
      p.map((i) => kits3[i]),
      seed,
    ),
  );
  for (const p of perms) assert.deepEqual(p, perms[0], 'the order of the three kits does not matter');
}
assert.notDeepEqual(ids(kits3, 1), ids(kits3, 2), 'a different seed deals a different hand');

// ---- proportion + anti-mush over 500 rolls
const pools = Object.fromEntries(kits3.map((x) => [x.id, poolOf(x)]));
const shareSum = { kanji: 0, 'big-shapes': 0, botanica: 0 };
for (let seed = 1; seed <= 500; seed++) {
  const d = dealKitTriad(kits3, seed * 7919, { records: desc });
  assert.ok(d.size >= 4 && d.size <= 6, 'a 4..6 asset deal');
  assert.equal(d.kits.length, 3, 'all three kits deal, every roll');
  let at = 0;
  for (const { id, count, share } of d.kits) {
    assert.ok(share >= KIT_MIN_SHARE - 1e-9, `no kit under ${KIT_MIN_SHARE * 100}% (${id} ${share})`);
    assert.ok(
      count >= 1 && Math.abs(count - share * d.size) < 1,
      `${id}: ${count} seats for a ${share} share of ${d.size}`,
    );
    for (const a of d.ids.slice(at, at + count))
      assert.ok(pools[id].has(a), `${a} belongs to ${id} (no fourth source)`);
    at += count;
    shareSum[id] += share;
  }
  assert.equal(at, d.ids.length);
  assert.equal(new Set(d.ids).size, d.ids.length, 'no asset twice');
  assert.ok(Math.abs(d.kits.reduce((a, b) => a + b.share, 0) - 1) < 0.01, 'shares sum to 1');
}
for (const [id, sum] of Object.entries(shareSum))
  assert.ok(Math.abs(sum / 500 - 1 / 3) < 0.04, `${id}: mean share ${sum / 500} ≈ ⅓`);

// ---- honest fallback
const empty = { id: 'void', name: 'Void', where: { categories: ['creature'] }, weights: {}, cap: 4 };
assert.equal(resolveKit(empty, desc).ids.length, 0, 'fixture: a kit that resolves to nothing');
const withEmpty = dealKitTriad([kits3[0], kits3[1], empty], 11, { records: desc });
assert.deepEqual(withEmpty.notes, [{ kit: 'void', note: 'empty' }], 'the empty kit is named');
assert.ok(withEmpty.ids.length > 0 && withEmpty.ids.length < withEmpty.size, 'a smaller deal, not a topped-up one');
for (const a of withEmpty.ids)
  assert.ok(pools.kanji.has(a) || pools['big-shapes'].has(a), 'still only the other kits’ assets');
const none = dealKitTriad([empty], 3, { records: desc });
assert.deepEqual(none.ids, []);
assert.equal(none.notes[0].note, 'empty');
assert.equal(dealKitTriad([], 3, { records: desc }).notes[0].note, 'no-kits');
const rngA = mkRng(5);
const fb = dealPoolFor(records, rngA, {
  kits: ['void-not-real'],
  kitContext: () => ({ artistKits: [empty], descriptors: desc }),
});
assert.ok(
  fb.ids.length >= 4 && fb.notes && fb.notes.length,
  'dealPoolFor falls back to today’s deal, with the reason named',
);

// ---- untouched: rolls without kits
const hash = (list) => createHash('sha256').update(list.join('|')).digest('hex');
const golden = [];
for (const seed of [1, 2, 3, 7]) {
  const rng = mkRng(seed);
  for (const look of COMPOSITION_PRESETS.slice(0, 6)) golden.push(dealPoolFor(records, rng, look).ids.join(','));
  golden.push(dealMixedPool(records, rng).ids.join(','));
}
// #2150 RE-PIN: the golden hash re-based on the type-exclusivity ruling — verified
// pool-by-pool against main: 11 of 28 pools differ, every one either held a glyph
// (10) or is the stream remap after one (1); no new pool deals a glyph; sizes 4–6
// unchanged. The pin's meaning is unchanged: kit-less rolls move only when a ruled
// deal change moves them.
assert.equal(
  hash(golden),
  'e6d14665b3620e7385a85e278361f0c3598919958b0c27171e37cf1c52a5791f',
  'rolls without kits are byte-identical to the #2150 deal',
);
const r1 = mkRng(9);
const r2 = mkRng(9);
dealPoolFor(records, r1, {
  categories: ['radial'],
  kits: [],
  kitContext: () => {
    throw new Error('read without kits');
  },
});
dealPoolFor(records, r2, { categories: ['radial'] });
assert.equal(r1(), r2(), 'kits: [] consumes no randomness and never builds the context');

// ---- the look pass
const state = (extra = {}) => ({ layoutParams: { composition: null }, lockedParams: {}, armedMode: null, ...extra });
const ctx = () => ({ artistKits: [], descriptors: desc });
const looks = [
  { id: 'plain', name: 'plain', params: {}, categories: ['radial'] },
  { id: 'kitted', name: 'kitted', params: {}, kits: ['signal'] },
];
const inPool = (kitIds, list) => list.every((a) => kitIds.some((id) => poolOf(kitsById([id])[0]).has(a)));
const viaTriad = lookPass(state({ kitTriad: ['kanji', 'big-shapes', 'botanica'] }), mkRng(4), {
  looks,
  records,
  kitContext: ctx,
});
assert.ok(
  Object.keys(viaTriad.enabledAssets).length >= 3 &&
    inPool(['kanji', 'big-shapes', 'botanica'], Object.keys(viaTriad.enabledAssets)),
  'a standing triad drives the look pass',
);
const viaLook = lookPass(state(), mkRng(4), { looks: [looks[1]], records, kitContext: ctx });
assert.ok(inPool(['signal'], Object.keys(viaLook.enabledAssets)), 'a Look’s own kits are honoured');
const beat = lookPass(state({ kitTriad: ['kanji'] }), mkRng(4), { looks: [looks[1]], records, kitContext: ctx });
assert.ok(inPool(['kanji'], Object.keys(beat.enabledAssets)), 'the artist’s triad beats the Look’s kits');
const sets = lookPass(state({ kitTriad: ['kanji'] }), mkRng(4), {
  looks,
  records,
  pool: 'sets',
  sets: [['geo_circle_01', 'org_blob_01', 'line_squiggle_03', 'geo_square_01']],
  kitContext: ctx,
});
assert.deepEqual(
  Object.keys(sets.enabledAssets).sort(),
  ['geo_circle_01', 'geo_square_01', 'line_squiggle_03', 'org_blob_01'],
  'START: OFF ignores kits',
);
const plain = lookPass(state(), mkRng(4), {
  looks: [looks[0]],
  records,
  kitContext: () => {
    throw new Error('built without kits');
  },
});
assert.ok(Object.keys(plain.enabledAssets).length >= 4, 'no kits: today’s deal, context never built');
const shortDeal = lookPass(state({ kitTriad: ['void'], kits: [empty] }), mkRng(4), {
  looks: [looks[0]],
  records,
  kitContext: () => ({ artistKits: [empty], descriptors: desc }),
});
assert.ok(shortDeal.kitNotes && shortDeal.kitNotes.length, 'a short kit deal is named on the pass result');

// ---- the store, CHAOS, the document
const { useStore } = await import('./store.js');
const { serializeProject, parseProject } = await import('./projectDocument.js');
const S = () => useStore.getState();
S().setKitTriad(['kanji', 'nope', 'bloom']);
assert.deepEqual(S().kitTriad, ['kanji', 'bloom'], 'the store door drops unknown ids');
S().saveKit({ id: 'mine', name: 'Mine', where: { categories: ['radial'] }, weights: {}, cap: 3 });
S().saveKit({ id: 'kanji', name: 'Imposter', where: { categories: ['radial'] } });
S().saveKit({ id: 'bad id', name: 'x', where: { categories: ['radial'] } });
assert.deepEqual(
  S().kits.map((x) => x.id),
  ['mine'],
  'a seed id cannot be shadowed; a bad record is refused',
);
S().setKitTriad(['kanji', 'mine']);
const saved = JSON.parse(JSON.stringify(serializeProject(S())));
assert.deepEqual(saved.kitTriad, ['kanji', 'mine']);
assert.deepEqual(
  saved.kits.map((x) => x.id),
  ['mine'],
);
S().removeKit('mine');
assert.deepEqual(S().kitTriad, ['kanji'], 'removing a kit empties its slot');
assert.equal('kits' in serializeProject(S()), false, 'a piece with no artist kits exports as before');
S().applyProject(parseProject(saved).doc);
assert.deepEqual(
  S().kits.map((x) => x.id),
  ['mine'],
  'kits come back on load',
);
assert.deepEqual(S().kitTriad, ['kanji', 'mine'], 'and so does the triad');
S().setKitTriad(['kanji', 'big-shapes', 'botanica']);
const union = new Set(kits3.flatMap((x) => [...poolOf(x)]));
for (let i = 0; i < 8; i++) {
  S().kineticRoll();
  const on = Object.keys(S().enabledAssets).filter((id) => S().enabledAssets[id]);
  assert.ok(on.length >= 3 && on.every((a) => union.has(a)), 'CHAOS rolls from the standing triad');
}
S().setKitTriad([]);
S().kineticRoll();
assert.ok(Object.keys(S().enabledAssets).filter((id) => S().enabledAssets[id]).length >= 4, 'no triad: the usual deal');
console.log('rollKits.selfcheck: ok');
