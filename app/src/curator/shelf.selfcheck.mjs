// node src/curator/shelf.selfcheck.mjs
//
// #1589 (Keeps K1) — the shelf suite. Spec:
// docs/research/keeps-machinery-spec-2026-10-14.md (§2 tiers, §4 crown
// flows, §7 migration) + issue #1589. Pins, at the deepest level that
// runs headlessly (pure shelf law + the davisSlice store stand-in):
//   - migration is LOSSLESS on the real record shapes (legacy keeps
//     with no keptAt/provenance/context, ISO-stamped records, mined
//     records) and a one-time, idempotent step: the derived stage is
//     persisted, and a stored stage — even an empty one — is law;
//   - the stage derives as the most recently kept the 16-slot budget
//     admits (hand 1 · mined 2), in collection order;
//   - crowns route: stage slot while the budget has room, collection +
//     the line when it doesn't — for hand AND mined crowns — and the
//     old 200-cap silent eviction is dead: crown #201+ lands, the
//     collection's prefix never moves, the Queen's input set only grows;
//   - hand-swap: position preserved, the performing Look's slot refuses
//     with its line (S1), the budget refuses overfilling swaps with
//     its line, both keeps' lastStagedAt update, only the incoming
//     keep's stagedCount grows;
//   - the favorites rider (S2): a cap trim speaks;
//   - the collection view's rows: search + the three sorts, with
//     never-staged honestly absent-stamped, never invented.
import assert from 'node:assert';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
};

const {
  STAGE_BUDGET,
  ON_SHELF_COPY,
  ON_DECK_COPY,
  SWAP_BUDGET_COPY,
  COLLECTION_SOFT_BOUND,
  stageRecords,
  stageSlotsUsed,
  tierOf,
  stageFits,
  routeCrown,
  admitToStage,
  deriveStageIds,
  sanitizeStageIds,
  swapSlots,
  shelfRows,
  crownHistoryRecord,
  swapHistoryRecord,
  sanitizeHistoryRecord,
} = await import('./shelf.mjs');
const { LOOK_SLOT_BUDGET, MINED_SLOT_COST } = await import('./candidateTray.mjs');
const { createDavisSlice, sanitizeFavorite, KEEPS_KEY, STAGE_KEY } = await import('../state/slices/davisSlice.js');
const { keptCentroid } = await import('./queenLean.mjs');
const { ASSETS } = await import('../data/assets/index.js');
const { PALETTES } = await import('../data/palettes.js');

const lines = [];
const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));
const radialIds = ASSETS.filter((a) => a.category === 'radial')
  .slice(0, 3)
  .map((a) => a.id);

const hand = (id, extra = {}) => ({
  id,
  seed: 100,
  timestamp: '2026-10-01T00:00:00.000Z',
  config: { layout: { mode: 'grid', count: 30 }, palette: { id: 'bone' }, assets: radialIds.slice(0, 2) },
  ...extra,
});
const mined = (id, extra = {}) =>
  hand(id, {
    provenance: {
      source: 'explorer',
      run: 'xpl-1',
      corner: 'haeckel',
      axes: { layout: 'radial', palette: 'hydra', castSize: 3 },
    },
    ...extra,
  });
const handList = (n, from = 0) => Array.from({ length: n }, (_, i) => hand(`k${from + i}`));

function boot() {
  let state;
  const set = (p) => {
    state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
  };
  state = createDavisSlice(set);
  return { get: () => state, call: (name, ...a) => state[name](...a) };
}
const resetStorage = () => {
  mem.delete(KEEPS_KEY);
  mem.delete(STAGE_KEY);
};

// ── the budget is the E3 budget, folded into the stage ───────────────
{
  assert.strictEqual(STAGE_BUDGET, LOOK_SLOT_BUDGET, 'the stage budget IS the look-slot budget (16)');
  assert.strictEqual(STAGE_BUDGET, 16);
  assert.strictEqual(COLLECTION_SOFT_BOUND, 400, 'the shipped soft-bound default (a K2 preferences setting)');
  lines.push('budget: stage = 16 slot costs (the E3 accounting, folded in); collection soft bound named at 400');
}

// ── migration derivation: newest the budget admits, collection order ──
{
  const twenty = handList(20);
  const stage = deriveStageIds(twenty);
  assert.deepStrictEqual(
    stage,
    twenty.slice(4).map((k) => k.id),
    'all-hand: the 16 most recent, in collection order',
  );

  const mixed = [...handList(15), mined('m15')];
  const mixedStage = deriveStageIds(mixed);
  assert.strictEqual(mixedStage.length, 15, 'a mined tail (2) + 14 hand fill the budget exactly');
  assert.strictEqual(mixedStage[0], 'k1', 'the oldest hand keep yields its slot to the budget, not to silence');
  assert.strictEqual(mixedStage.at(-1), 'm15');
  assert.strictEqual(stageSlotsUsed(mixed, mixedStage), 16);

  const huge = handList(250);
  assert.deepStrictEqual(
    deriveStageIds(huge),
    huge.slice(-16).map((k) => k.id),
    'past the old cap: still exactly the newest 16',
  );
  assert.deepStrictEqual(deriveStageIds([]), []);
  lines.push(
    'derive: newest-first admission under the budget, returned in collection order; all-hand = the 16 most recent',
  );
}

// ── the stored stage is a trust boundary ──────────────────────────────
{
  const keeps = handList(20);
  assert.deepStrictEqual(
    sanitizeStageIds(['k19', 'k19', 'nope', 7, 'k18'], keeps),
    ['k19', 'k18'],
    'dupes, junk and unknown ids drop; real membership survives',
  );
  const over = sanitizeStageIds([...handList(15).map((k) => k.id), 'mX'], [...handList(15), mined('mX')]);
  assert.strictEqual(
    stageSlotsUsed([...handList(15), mined('mX')], over),
    16,
    'an over-budget stored stage (17) trims its OLDEST ids back to the budget',
  );
  assert.ok(!over.includes('k0'), 'the trimmed id is the oldest staged one');
  assert.deepStrictEqual(sanitizeStageIds('junk', keeps), []);
  lines.push('sanitize stage: strings only, deduped, must name real keeps, budget repaired from the oldest end');
}

// ── crown routing: stage while it fits, collection + the line after ──
{
  const keeps = handList(15);
  const stageIds = deriveStageIds(keeps);
  const r1 = routeCrown(keeps, stageIds, hand('new'));
  assert.strictEqual(r1.lands, 'stage');
  assert.strictEqual(r1.stageIds.at(-1), 'new');
  const r2 = routeCrown(keeps, stageIds, mined('newM'));
  assert.strictEqual(
    r2.lands,
    'collection',
    'at 15 slots a mined crown (cost 2) lands in the collection — not refused, not evicting',
  );
  assert.deepStrictEqual(r2.stageIds, stageIds, 'a collection landing leaves the stage untouched');
  assert.strictEqual(stageFits([], [], mined('x')).fits, true, 'an empty stage takes a mined crown');
  assert.strictEqual(tierOf('k0', stageIds), 'stage');
  assert.strictEqual(tierOf('k0', []), 'collection');
  assert.deepStrictEqual(
    stageRecords(keeps, ['k2', 'k0']).map((k) => k.id),
    ['k2', 'k0'],
    'stage order is the id list order',
  );
  lines.push('route: fits → stage slot (appended); full → collection, stage untouched; the crown always lands');
}

// ── swaps: position, pin, budget, membership ──────────────────────────
{
  const keeps = [...handList(3), hand('x')];
  const ids = ['k0', 'k1', 'k2'];
  const ok = swapSlots(keeps, ids, 'k1', 'x');
  assert.deepStrictEqual(ok.stageIds, ['k0', 'x', 'k2'], 'the incoming keep takes the exact slot');
  const pinned = swapSlots(keeps, ids, 'k1', 'x', { performingKeepId: 'k1' });
  assert.strictEqual(pinned.ok, false);
  assert.strictEqual(pinned.copy, ON_DECK_COPY, 'the performing Look’s slot refuses, with its line (S1)');
  assert.deepStrictEqual(pinned.stageIds, ids, 'a refused swap changes nothing');
  const full = [...handList(16), mined('mIn')];
  const over = swapSlots(
    full,
    handList(16).map((k) => k.id),
    'k0',
    'mIn',
  );
  assert.strictEqual(over.ok, false);
  assert.strictEqual(
    over.copy,
    SWAP_BUDGET_COPY,
    'a hand→mined exchange at a full stage overfills (+1) and refuses, with its line',
  );
  assert.strictEqual(swapSlots(keeps, ids, 'k1', 'k2').ok, false, 'the incoming keep must be off-stage');
  assert.strictEqual(swapSlots(keeps, ids, 'zz', 'x').ok, false, 'the outgoing keep must be on-stage');
  const adm = admitToStage(keeps, ids, keeps[3]);
  assert.strictEqual(adm.ok, true);
  assert.deepStrictEqual(adm.stageIds, ['k0', 'k1', 'k2', 'x'], 'a free slot admits by append');
  assert.strictEqual(admitToStage(full, deriveStageIds(full), mined('mIn')).ok, false, 'no room, no admission');
  lines.push('swap: slot position preserved · deck pin refuses · budget refuses · membership checked on both sides');
}

// ── history records: the §5 shapes, sanitize honest ───────────────────
{
  assert.deepStrictEqual(crownHistoryRecord('a', 'stage', 5), { kind: 'crown', keepId: 'a', tier: 'stage', at: 5 });
  assert.deepStrictEqual(swapHistoryRecord(null, 'b', 6), { kind: 'swap', outId: null, inId: 'b', at: 6 });
  assert.deepStrictEqual(sanitizeHistoryRecord({ kind: 'crown', keepId: 'a', tier: 'stage', at: 5.7 }), {
    kind: 'crown',
    keepId: 'a',
    tier: 'stage',
    at: 5,
  });
  assert.strictEqual(
    sanitizeHistoryRecord({ kind: 'fill', keepId: 'a' }),
    null,
    'K2 kinds are not K1 records — junk to this reader',
  );
  assert.strictEqual(sanitizeHistoryRecord({ kind: 'crown', keepId: 'a', tier: 'attic' }), null);
  lines.push('history: crown/swap flat records; sanitize floors the stamp and drops off-shape records whole');
}

// ── the collection view: search + sorts ───────────────────────────────
{
  const keeps = [
    hand('a', { keptAt: 100, config: { layout: { mode: 'grid' }, palette: { id: 'bone' }, assets: radialIds } }),
    hand('b', {
      keptAt: 300,
      stagedCount: 2,
      lastStagedAt: 50,
      config: { layout: { mode: 'phi' }, palette: { id: 'hydra' }, assets: radialIds.slice(0, 1) },
    }),
    mined('c', { keptAt: 200, config: { layout: { mode: 'radial' }, palette: { id: 'hydra' }, assets: radialIds } }),
  ];
  const rows = shelfRows(keeps, ['b'], { assetsById, palettesById });
  assert.deepStrictEqual(
    rows.map((r) => r.id),
    ['b', 'c', 'a'],
    'kept sort: newest kept first',
  );
  assert.strictEqual(rows.find((r) => r.id === 'b').tier, 'stage');
  assert.strictEqual(rows.find((r) => r.id === 'a').stagedCount, null, 'never staged reads null — absent, not zero');
  assert.ok(rows.find((r) => r.id === 'a').families.includes('radial'), 'families derive from the cast');
  assert.strictEqual(rows.find((r) => r.id === 'c').origin, 'explorer');
  assert.deepStrictEqual(
    shelfRows(keeps, [], { query: 'hydra', assetsById, palettesById }).map((r) => r.id),
    ['b', 'c'],
    'search hits palette',
  );
  assert.deepStrictEqual(
    shelfRows(keeps, [], { query: 'explorer', assetsById, palettesById }).map((r) => r.id),
    ['c'],
    'search hits origin',
  );
  assert.deepStrictEqual(
    shelfRows(keeps, [], { query: 'radial', assetsById, palettesById }).length,
    3,
    'search hits family words',
  );
  assert.deepStrictEqual(
    shelfRows(keeps, [], { sort: 'staged', assetsById, palettesById }).map((r) => r.id),
    ['b', 'a', 'c'],
    'staged sort: stamped first, never-staged last in collection order',
  );
  assert.deepStrictEqual(
    shelfRows(keeps, [], { sort: 'never', assetsById, palettesById }).map((r) => r.id),
    ['a', 'c', 'b'],
    'never sort: never-staged first (oldest kept leads), then least-staged',
  );
  lines.push(
    'view rows: label/families/origin derived · search across palette+origin+family · kept/staged/never sorts honest about absent stamps',
  );
}

// ── sanitize carries the staging facts; junk stays absent ─────────────
{
  const s = sanitizeFavorite({ seed: 1, stagedCount: 3.9, lastStagedAt: 123.4, config: {} });
  assert.strictEqual(s.stagedCount, 3);
  assert.strictEqual(s.lastStagedAt, 123);
  assert.ok(
    !('stagedCount' in sanitizeFavorite({ seed: 1, stagedCount: 0, config: {} })),
    'a zero count is not a staging fact',
  );
  assert.ok(!('lastStagedAt' in sanitizeFavorite({ seed: 1, lastStagedAt: 'soon', config: {} })));
  lines.push('sanitize: stagedCount/lastStagedAt round-trip when real, stay absent when junk or legacy');
}

// ── store: migration is lossless + one-time ───────────────────────────
{
  resetStorage();
  // Real v1 shapes: pure-legacy (HH:MM:SS, nothing else), ISO legacy,
  // a mined record, a modern stamped record — 200 in all, the old cap.
  const legacy = {
    id: 'legacy1',
    seed: 11,
    timestamp: '12:00:00',
    config: { layout: { mode: 'grid' }, palette: { id: 'bone' } },
  };
  const isoLegacy = {
    id: 'iso1',
    seed: 22,
    timestamp: '2026-09-01T10:00:00.000Z',
    config: { layout: { mode: 'phi' }, palette: { id: 'hydra' } },
  };
  const fixture = [legacy, isoLegacy];
  for (let i = 2; i < 190; i++)
    fixture.push({
      id: `mid${i}`,
      seed: 1000 + i,
      timestamp: '2026-10-01T00:00:00.000Z',
      config: { layout: { mode: 'grid' }, palette: { id: 'bone' } },
    });
  for (let i = 190; i < 200; i++) fixture.push(mined(`fx${i}`, { seed: 2000 + i }));
  mem.set(KEEPS_KEY, JSON.stringify(fixture));

  const a = boot();
  const st = a.get();
  assert.strictEqual(st.keeps.length, 200, 'every stored keep loads — the read path trims nothing');
  const expected = fixture.map((f) => sanitizeFavorite(f));
  assert.deepStrictEqual(
    st.keeps.map((k) => k.id),
    expected.map((k) => k.id),
    'ids preserved (sanitize is the only transformation)',
  );
  assert.deepStrictEqual(st.keeps[0], expected[0], 'the pure-legacy record survives byte-for-byte as sanitized');
  assert.ok(!('keptAt' in st.keeps[0]) && !('stagedCount' in st.keeps[0]), 'legacy gains nothing invented');
  // the tail is 10 mined (cost 20): the newest 8 fill the budget exactly
  assert.deepStrictEqual(
    st.keepStage,
    fixture.slice(192).map((f) => f.id),
    'stage = the newest keeps the budget admits (8 mined × 2 = 16)',
  );
  assert.ok(mem.has(STAGE_KEY), 'migration persists the derived stage — the step is one-time');

  // a swap in session A is still the stage in session B (no re-derive)
  const outId = st.keepStage[0];
  const inKeep = st.keeps.find((k) => !st.keepStage.includes(k.id) && !k.provenance);
  a.call('swapStageSlot', outId, inKeep.id);
  const stageAfterSwap = [...a.get().keepStage];
  assert.ok(stageAfterSwap.includes(inKeep.id) && !stageAfterSwap.includes(outId));
  const b = boot();
  assert.deepStrictEqual(b.get().keepStage, stageAfterSwap, 'reload takes the stored stage as law');

  // a present-but-empty stored stage is a real state, not a migration trigger
  mem.set(STAGE_KEY, '[]');
  assert.deepStrictEqual(boot().get().keepStage, []);
  lines.push(
    'migration: 200 real-shape records lossless (ids + content) · stage derived once, persisted, swap-stable across reloads',
  );
}

// ── store: crowns past the old cap — the eviction is dead ─────────────
{
  resetStorage();
  const a = boot();
  for (let i = 0; i < 200; i++)
    a.call('addKeep', {
      seed: 5000 + i,
      timestamp: '2026-10-02T00:00:00.000Z',
      config: { layout: { mode: 'grid' }, palette: { id: 'bone' } },
    });
  let st = a.get();
  assert.strictEqual(st.keeps.length, 200);
  assert.strictEqual(stageSlotsUsed(st.keeps, st.keepStage), 16, 'the first 16 crowns filled the stage');
  assert.strictEqual(st.keeps[0].stagedCount, 1, 'a stage crown stamps its first staging');
  assert.ok(Number.isFinite(st.keeps[0].lastStagedAt));
  assert.ok(!('stagedCount' in st.keeps[100]), 'a collection crown carries no staging stamp');
  const prefix = st.keeps.map((k) => k.id);
  const centroidBefore = keptCentroid(st.keeps);

  for (let i = 0; i < 5; i++)
    a.call('addKeep', {
      seed: 6000 + i,
      timestamp: '2026-10-03T00:00:00.000Z',
      config: { layout: { mode: 'phi' }, palette: { id: 'hydra' } },
    });
  st = a.get();
  assert.strictEqual(st.keeps.length, 205, 'crown #201+ LANDS — no cap, no eviction');
  assert.deepStrictEqual(
    st.keeps.slice(0, 200).map((k) => k.id),
    prefix,
    'the collection prefix never moves: every prior keep still stands, in order',
  );
  assert.strictEqual(st.shelfNotice, ON_SHELF_COPY, 'the landing speaks its line');
  assert.deepStrictEqual(st.shelfHistory.at(-1).kind, 'crown');
  assert.strictEqual(st.shelfHistory.at(-1).tier, 'collection');
  assert.notDeepStrictEqual(
    keptCentroid(st.keeps),
    centroidBefore,
    'the Queen’s input set only GREW (addition moves it; deletion never does)',
  );
  assert.strictEqual(st.keepStage.length, 16, 'the stage is untouched by collection crowns');
  lines.push(
    'crowns past 200: all land in the collection with the line · prefix intact · history records the landing tier',
  );
}

// ── store: mined crown at a nearly-full stage ─────────────────────────
{
  resetStorage();
  const a = boot();
  for (let i = 0; i < 15; i++)
    a.call('addKeep', {
      seed: 7000 + i,
      timestamp: 't',
      config: { layout: { mode: 'grid' }, palette: { id: 'bone' } },
    });
  a.call('addKeep', mined('mx', { seed: 7999, timestamp: 't' }));
  const st = a.get();
  assert.strictEqual(st.keeps.length, 16, 'the mined crown landed');
  assert.strictEqual(
    tierOf(st.keeps.at(-1).id, st.keepStage),
    'collection',
    'at 15 slots the mined crown (cost 2) takes the collection',
  );
  assert.strictEqual(st.shelfNotice, ON_SHELF_COPY);
  lines.push(
    'mined crown at 15/16: lands in the collection with the line — the tray refusal is dead for mined crowns too',
  );
}

// ── store: swap law end-to-end (pin, stamps, history, persistence) ────
{
  resetStorage();
  const a = boot();
  for (let i = 0; i < 20; i++)
    a.call('addKeep', {
      seed: 8000 + i,
      timestamp: 't',
      config: { layout: { mode: 'grid' }, palette: { id: 'bone' } },
    });
  let st = a.get();
  const stage0 = [...st.keepStage];
  const onDeck = st.keeps.find((k) => k.id === stage0[0]);
  a.call('recallFavorite', onDeck); // load it: it is now the performing Look
  st = a.get();
  assert.strictEqual(st.performingKeepId, onDeck.id, 'loading a keep pins it as the performing Look');
  a.call('swapStageSlot', onDeck.id, st.keeps.find((k) => !stage0.includes(k.id)).id);
  st = a.get();
  assert.strictEqual(st.shelfNotice, ON_DECK_COPY, 'the deck slot refuses the swap, with its line');
  assert.deepStrictEqual(st.keepStage, stage0, 'the refused swap moved nothing');

  const out = st.keeps.find((k) => k.id === stage0[1]);
  const inn = st.keeps.find((k) => !stage0.includes(k.id));
  a.call('swapStageSlot', out.id, inn.id);
  st = a.get();
  assert.strictEqual(st.keepStage[1], inn.id, 'the swap takes the exact slot');
  const inAfter = st.keeps.find((k) => k.id === inn.id);
  const outAfter = st.keeps.find((k) => k.id === out.id);
  assert.strictEqual(inAfter.stagedCount, 1, 'the incoming keep is stamped staged');
  assert.ok(Number.isFinite(inAfter.lastStagedAt));
  assert.ok(Number.isFinite(outAfter.lastStagedAt), 'the swapped-out keep’s lastStagedAt updates too (§3.6)');
  assert.ok(
    !('stagedCount' in outAfter) || outAfter.stagedCount === 1,
    'the outgoing keep gains no new staging count from being chosen against',
  );
  assert.strictEqual(st.shelfHistory.at(-1).kind, 'swap');
  const b = boot();
  assert.deepStrictEqual(b.get().keepStage, st.keepStage, 'the swap persists across a reload');
  lines.push('swap end-to-end: deck pin refuses · stamps land on both records · history records it · reload keeps it');
}

// ── store: the favorites rider — the trim speaks ──────────────────────
{
  resetStorage();
  const a = boot();
  for (let i = 0; i < 201; i++)
    a.call('addFavorite', {
      seed: 9000 + i,
      timestamp: 't',
      config: { layout: { mode: 'grid' }, palette: { id: 'bone' } },
    });
  const st = a.get();
  assert.strictEqual(st.favorites.length, 200, 'the favorites cap still trims (restructure is out of scope)');
  assert.ok(
    typeof st.shelfNotice === 'string' && st.shelfNotice.includes('favorites full — the oldest favorite was let go'),
    `the trim speaks its line, got: ${st.shelfNotice}`,
  );
  assert.strictEqual(st.keeps.length, 201, 'meanwhile every implied keep landed — keeps have no silent cap anymore');
  lines.push('favorites rider: the 201st favorite trims the oldest — and the shelf says so; its keep still landed');
}

// ── store: import replaces the shelf whole ────────────────────────────
{
  resetStorage();
  const a = boot();
  const many = Array.from({ length: 250 }, (_, i) => ({
    seed: 3000 + i,
    timestamp: 't',
    config: { layout: { mode: 'grid' }, palette: { id: 'bone' } },
  }));
  const counts = a.call('importShelf', { keeps: many });
  const st = a.get();
  assert.strictEqual(counts.keeps, 250);
  assert.strictEqual(st.keeps.length, 250, 'an imported shelf is not sliced to the old cap');
  assert.strictEqual(st.keepStage.length, 16, 'its stage re-derives by the migration rule');
  lines.push('import: 250 keeps land whole; the stage re-derives; the counts line stays honest');
}

console.log('shelf.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('shelf.selfcheck: PASS');
