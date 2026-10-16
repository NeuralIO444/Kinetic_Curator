// node src/curator/shelfCensus.selfcheck.mjs
//
// #1592 (Keeps K4) — the census shelf readout. Pins the issue's
// acceptance criteria:
//   - a seeded shelf (known fills, swaps, exports): EVERY figure in
//     the readout matches a hand count from the ledger — the pure
//     fixture is counted by hand below, and the store blocks recount
//     the live ledger with the test's own arithmetic;
//   - neglect coverage MOVES after a fill that deals neglected slots
//     (the lane's success evidence): every keep the neglected rule
//     dealt was never-staged before the fill;
//   - the wiring is alive: turn a preferences knob (table, bound) and
//     the readout's setting + footprint change to match;
//   - an empty shelf says so in words instead of showing zeros with
//     confidence; a rule that dealt nothing shows its zero;
//   - PURITY: deep-frozen inputs, identical view twice, no mutation.
import assert from 'node:assert';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };

const { shelfCensusView, SHELF_CENSUS_FILL_WINDOW } = await import('./censusReadout.mjs');
const { createDavisSlice, KEEPS_KEY, STAGE_KEY } = await import('../state/slices/davisSlice.js');
const { runShelfExports } = await import('../loot/shelfDiskRun.mjs');
const { DEFAULT_SHELF_PREFS } = await import('./shelfPrefs.mjs');
const { ASSETS } = await import('../data/assets/index.js');
const { PALETTES } = await import('../data/palettes.js');

const lines = [];
const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));
const deepFreeze = (o) => {
  if (o && typeof o === 'object') { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); }
  return o;
};

// The acceptance hand count: tallies straight off the raw state with
// the test's own loops — deliberately NOT the view's code.
function handCount({ keeps, stageIds, history, stubs }) {
  const stageSet = new Set(stageIds);
  const staged = new Set(stageIds);
  let exports = 0; let imports = 0;
  const fills = [];
  for (const r of history) {
    if (r.kind === 'fill') { fills.push(r); for (const s of r.slots) staged.add(s.keepId); }
    if (r.kind === 'swap') staged.add(r.inId);
    if (r.kind === 'crown' && r.tier === 'stage') staged.add(r.keepId);
    if (r.kind === 'export') exports++;
    if (r.kind === 'import') imports++;
  }
  for (const k of keeps) if (k.stagedCount >= 1) staged.add(k.id);
  for (const s of Object.values(stubs)) if (s.stagedCount >= 1) staged.add(s.id);
  const pop = new Set([...keeps.map((k) => k.id), ...Object.keys(stubs)]);
  const win = fills.slice(-SHELF_CENSUS_FILL_WINDOW);
  const dist = {};
  for (const f of win) for (const s of f.slots) dist[s.rule] = (dist[s.rule] || 0) + 1;
  return {
    total: pop.size,
    stage: stageIds.length,
    stagedEver: [...pop].filter((id) => staged.has(id)).length,
    fillsTotal: fills.length,
    fillsCounted: win.length,
    dist, exports, imports,
    slotsTotal: Object.values(dist).reduce((n, x) => n + x, 0),
  };
}

// ── P: the pure fixture, counted by hand ──────────────────────────────
{
  const hand = (id, keptAt, extra = {}) => ({ id, seed: 1, keptAt, config: { layout: { mode: 'grid' }, palette: { id: 'bone' }, assets: [] }, ...extra });
  const mined = (id, keptAt, extra = {}) => hand(id, keptAt, { provenance: { source: 'explorer' }, ...extra });
  const keeps = deepFreeze([
    // a1/a2 were dealt by fills 3/4 below — like the real store, the
    // dealt keeps carry the fill's stamps (stagedCount/lastStagedAt).
    hand('a1', 100, { stagedCount: 1, lastStagedAt: 3200 }),
    hand('a2', 200, { stagedCount: 1, lastStagedAt: 4200 }),
    hand('a3', 300), hand('a4', 400),
    mined('m1', 500), mined('m2', 600, { stagedCount: 1, lastStagedAt: 4500 }),
    hand('a5', 700, { stagedCount: 2, lastStagedAt: 5000 }),
    hand('a6', 800, { stagedCount: 1, lastStagedAt: 3000 }),
  ]);
  const stubs = deepFreeze({
    d1: { id: 'd1', rel: 'looks/d1.json', label: 'disk one', keptAt: 50, stagedCount: null, lastStagedAt: null, missing: false },
    d2: { id: 'd2', rel: 'looks/d2.json', label: 'disk two', keptAt: 150, stagedCount: null, lastStagedAt: null, missing: false },
    d3: { id: 'd3', rel: 'looks/d3.json', label: 'disk three', keptAt: 250, stagedCount: null, lastStagedAt: null, missing: true },
  });
  const diskRecords = deepFreeze({ d1: hand('d1', 50, { stagedCount: 3, lastStagedAt: 2000 }) });
  // 12 fills; the window keeps the last 10 (fills 3–12). Fill i deals
  // (i mod 3) consensus + 1 neglected; fill 3 also deals a1, fill 4 a2,
  // fill 5 m2; lois is undealt in fills 11 and 12, wild in fill 11.
  const fill = (i) => {
    const slots = [];
    for (let j = 0; j < i % 3; j++) slots.push({ keepId: `f${i}c${j}`, rule: 'consensus' });
    slots.push({ keepId: `f${i}n`, rule: 'neglected' });
    if (i === 3) slots.push({ keepId: 'a1', rule: 'wild' });
    if (i === 4) slots.push({ keepId: 'a2', rule: 'consensus' });
    if (i === 5) slots.push({ keepId: 'm2', rule: 'lois' });
    const undealt = i === 11 ? ['lois', 'wild'] : i === 12 ? ['lois'] : [];
    return { kind: 'fill', seed: i, table: 'shipped defaults · FULL WEIRD', slots, undealt, notes: [], at: i * 1000 };
  };
  const history = deepFreeze([
    { kind: 'crown', keepId: 'a1', tier: 'collection', at: 100 },
    { kind: 'crown', keepId: 'a5', tier: 'stage', at: 700 },
    ...Array.from({ length: 12 }, (_, i) => fill(i + 1)),
    { kind: 'swap', outId: 'a2', inId: 'a6', at: 9000 },
    { kind: 'export', keepId: 'd1', path: 'looks/d1.json', at: 9500 },
    { kind: 'export', keepId: 'd2', path: 'looks/d2.json', at: 9600 },
    { kind: 'import', keepId: 'd1', path: 'looks/d1.json', at: 9700 },
  ]);
  const input = deepFreeze({
    keeps, stageIds: ['a5', 'm1'], history, stubs, diskRecords,
    prefs: null, exportPrefs: null, labels: { a3: 'ay three' },
  });
  const v = shelfCensusView(input);
  const v2 = shelfCensusView(input);
  assert.deepEqual(v, v2, 'the same shelf yields the identical readout twice');

  // tiers — counted by hand from the fixture
  assert.equal(v.empty, false);
  assert.equal(v.tiers.stage, 2, 'stage: a5 + m1');
  assert.equal(v.tiers.slotsUsed, 3, 'slots: a5 hand 1 + m1 mined 2 (the E3 accounting)');
  assert.equal(v.tiers.slotsBudget, 16);
  assert.equal(v.tiers.collection, 6, 'collection: the 6 in-app keeps off stage');
  assert.equal(v.tiers.disk, 3, 'disk: d1 + d2 + d3');
  assert.equal(v.tiers.diskRead, 1, 'one disk record in hand (d1)');
  assert.equal(v.tiers.diskUnread, 2);
  assert.equal(v.tiers.diskMissing, 1, 'd3 is missing');
  assert.equal(v.tiers.total, 11, 'every known keep exactly once');
  assert.equal(v.tiers.overBy, 0, 'under the shipped bound of 400');
  assert.equal(v.anchor.partial, true, 'the anchor is partial — 2 disk keeps unread');
  assert.equal(v.anchor.unread, 2);

  // the ledger moves
  assert.deepEqual(v.moves, { crowns: 2, swaps: 1, exports: 2, imports: 1 });

  // distribution — the window is fills 3–12; fills 1–2 do not count.
  const expect = handCount({ keeps, stageIds: ['a5', 'm1'], history, stubs });
  assert.equal(v.fills.total, 12);
  assert.equal(v.fills.counted, 10, 'the stated window: last 10 fills');
  assert.equal(v.fills.window, SHELF_CENSUS_FILL_WINDOW);
  const distOf = Object.fromEntries(v.fills.rows.map((r) => [r.rule, r.dealt]));
  assert.deepEqual(distOf, {
    consensus: expect.dist.consensus || 0, neglected: expect.dist.neglected || 0,
    wild: expect.dist.wild || 0, lois: expect.dist.lois || 0,
    contrarian: 0, pinned: 0,
  }, 'every rule\'s dealt count matches the hand count — including the zeros');
  assert.equal(v.fills.slotsTotal, expect.slotsTotal);
  const loisRow = v.fills.rows.find((r) => r.rule === 'lois');
  assert.equal(loisRow.undealt, 2, 'lois named undealt in fills 11 + 12');
  assert.equal(loisRow.fillsDealt, 1, 'lois dealt only in fill 5');
  assert.equal(v.fills.rows.find((r) => r.rule === 'wild').undealt, 1);

  // neglect — staged-ever by union of stage, ledger, and stamps:
  // {a5, m1} on stage · {a1, a2, m2} dealt · {a6} swapped in · {a5} crown
  // · stamps {a5, a6, m2, d1} → {a1, a2, a5, a6, m1, m2, d1} = 7 of 11.
  assert.equal(v.neglect.stagedEver, 7);
  assert.equal(v.neglect.neverStaged, 4, 'a3, a4, d2, d3 have never reached the stage');
  assert.equal(v.neglect.coverage, 7 / 11);
  assert.equal(v.neglect.tailTotal, 9, 'everyone off-stage is in the tail pool');
  assert.deepEqual(v.neglect.tail.map((t) => t.id), ['d2', 'd3', 'a3', 'a4', 'a6', 'a1', 'a2', 'm2'],
    'the tail reads neglect in the fill\'s own order: never-staged by oldest kept, then least-staged, then longest since staged (d1, staged 3×, falls past the cap)');
  assert.equal(v.neglect.tail.find((t) => t.id === 'a3').label, 'ay three', 'the tail names keeps');
  assert.equal(v.neglect.tail.find((t) => t.id === 'a1').neverStaged, false, 'a dealt keep is not never-staged, stamps or no');
  assert.equal(v.neglect.tail.find((t) => t.id === 'd3').location, 'missing');
  assert.ok(!v.neglect.tail.some((t) => t.id === 'd1'), 'd1 — staged 3× — is the least neglected keep on the shelf');

  // wiring footprints trace to the same ledger
  const wire = Object.fromEntries(v.wiring.map((w) => [w.key, w]));
  assert.ok(wire.table.setting.includes('FULL WEIRD'));
  assert.ok(wire.table.footprint.includes(`${expect.slotsTotal} slots dealt across the last 10 fills`));
  assert.ok(wire.recencyWindow.setting.includes('recency window 2 fills'));
  assert.ok(wire.collectionSoftBound.footprint.includes('under the bound'));
  assert.ok(wire.export.footprint.startsWith('2 exports · 1 imports'));
  lines.push('P: the pure readout matches a hand count from the fixture ledger — tiers, distribution (zeros shown), neglect, wiring');
}

// ── P2: empty + untouched shelves speak in words ───────────────────────
{
  const empty = shelfCensusView({});
  assert.equal(empty.empty, true);
  assert.ok(empty.emptyLine.includes('the shelf is empty'), 'words, not zeros with confidence');
  const fresh = shelfCensusView({
    keeps: [{ id: 'x1', seed: 1, keptAt: 5, config: { layout: { mode: 'grid' }, palette: { id: 'bone' }, assets: [] } }],
    stageIds: ['x1'], history: [], stubs: {}, diskRecords: {},
  });
  assert.equal(fresh.empty, false);
  assert.equal(fresh.fills.none, true, 'no fills yet is its own line, not a table of zeros');
  assert.equal(fresh.neglect.stagedEver, 1, 'standing on the stage is staged — membership is evidence');
  assert.equal(fresh.neglect.coverage, 1);
  lines.push('P2: an empty shelf and a never-filled shelf both speak in words');
}

// ── the store harness (shelfDiskRun's boot, verbatim shape) ───────────
const K = (id, keptAt, extra = {}) => ({
  id, seed: 100, timestamp: '2026-10-01T00:00:00.000Z', keptAt,
  config: { layout: { mode: 'grid', count: 30 }, palette: { id: 'bone' }, assets: [] },
  ...extra,
});
function boot({ keeps = [], stage = [] } = {}) {
  mem.clear();
  mem.set(KEEPS_KEY, JSON.stringify(keeps));
  mem.set(STAGE_KEY, JSON.stringify(stage));
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = createDavisSlice(set);
  return { get: () => state, set, call: (name, ...a) => state[name](...a) };
}
const viewOf = (s) => shelfCensusView({
  keeps: s.keeps, stageIds: s.keepStage, history: s.shelfHistory,
  stubs: s.shelfDiskStubs || {}, diskRecords: s.shelfDiskRecords || {},
  prefs: s.shelfPrefs, exportPrefs: s.shelfExportPrefs, labels: {},
});
const recountOf = (s) => handCount({
  keeps: s.keeps, stageIds: s.keepStage, history: s.shelfHistory, stubs: s.shelfDiskStubs || {},
});
const expectMatchesRecount = (s, tag) => {
  const v = viewOf(s); const e = recountOf(s);
  assert.equal(v.tiers.total, e.total, `${tag}: total`);
  assert.equal(v.tiers.stage, e.stage, `${tag}: stage`);
  assert.equal(v.neglect.stagedEver, e.stagedEver, `${tag}: staged-ever`);
  assert.equal(v.fills.total, e.fillsTotal, `${tag}: fills`);
  assert.equal(v.fills.counted, e.fillsCounted, `${tag}: fills in window`);
  assert.equal(v.fills.slotsTotal, e.slotsTotal, `${tag}: slots`);
  assert.equal(v.moves.exports, e.exports, `${tag}: exports`);
  assert.equal(v.moves.imports, e.imports, `${tag}: imports`);
  const distOf = Object.fromEntries(v.fills.rows.map((r) => [r.rule, r.dealt]));
  for (const rule of Object.keys(distOf)) {
    assert.equal(distOf[rule], e.dist[rule] || 0, `${tag}: distribution ${rule}`);
  }
  return v;
};

// ── S: store acceptance — the readout matches the live ledger, and
//       neglect coverage moves when the fill deals neglected slots ────
{
  const keeps = Array.from({ length: 30 }, (_, i) => K(`s${i + 1}`, (i + 1) * 100));
  const h = boot({ keeps, stage: ['s27', 's28', 's29', 's30'] });
  const before = expectMatchesRecount(h.get(), 'S before');
  assert.equal(before.neglect.stagedEver, 4, 'only the seeded stage has ever been staged');
  assert.equal(before.neglect.coverage, 4 / 30);

  h.call('fillStage');
  const s = h.get();
  const after = expectMatchesRecount(s, 'S after');
  const fill = [...s.shelfHistory].reverse().find((r) => r.kind === 'fill');
  assert.ok(fill, 'the fill is on the ledger');
  const beforeIds = new Set(['s27', 's28', 's29', 's30']);
  const neglectedDealt = fill.slots.filter((x) => x.rule === 'neglected').map((x) => x.keepId);
  assert.ok(neglectedDealt.length > 0, 'the fill dealt neglected slots');
  assert.ok(neglectedDealt.every((id) => !beforeIds.has(id)),
    'every neglected deal was never-staged before this fill — the cure, measured');
  assert.ok(after.neglect.stagedEver > before.neglect.stagedEver, 'neglect coverage moved');
  assert.equal(after.neglect.stagedEver, recountOf(s).stagedEver);
  lines.push(`S: neglect coverage moved ${before.neglect.stagedEver} → ${after.neglect.stagedEver} of 30 after one fill; every figure matches the ledger recount`);
}

// ── W: the wiring is alive — knobs turned, readout follows ────────────
{
  const keeps = Array.from({ length: 24 }, (_, i) => K(`w${i + 1}`, (i + 1) * 100));
  const h = boot({ keeps, stage: [] });
  h.call('setShelfPrefs', { ...DEFAULT_SHELF_PREFS, collectionSoftBound: 10 }, [], 'file');
  let v = viewOf(h.get());
  assert.equal(v.tiers.overBy, 14, 'the bound knob bites in the readout: 24 in-app, bound 10');
  assert.ok(v.wiring.find((w) => w.key === 'collectionSoftBound').footprint.includes('14 over the bound'));
  // a consensus-only table: the next fill's deal must follow it
  h.call('setShelfPrefs', {
    ...DEFAULT_SHELF_PREFS, collectionSoftBound: 400,
    table: { consensus: 16, neglected: 0, wild: 0, lois: 0, contrarian: 0 },
  }, [], 'file');
  v = viewOf(h.get());
  assert.ok(v.wiring.find((w) => w.key === 'table').setting.includes('consensus 16'),
    'the table in force is the table the readout names');
  h.call('fillStage');
  const fill = [...h.get().shelfHistory].reverse().find((r) => r.kind === 'fill');
  assert.ok(fill.slots.every((x) => x.rule === 'consensus' || x.rule === 'pinned'),
    'the deal followed the turned table — no neglected/wild/lois/contrarian slots');
  v = expectMatchesRecount(h.get(), 'W after');
  assert.ok(v.fills.rows.find((r) => r.rule === 'neglected').dealt === 0);
  lines.push('W: bound + table knobs turned at the preferences door move the readout and the deal itself');
}

// ── D: disk figures at store level ────────────────────────────────────
{
  const keeps = Array.from({ length: 8 }, (_, i) => K(`d${i + 1}`, (i + 1) * 100));
  const h = boot({ keeps, stage: ['d8'] });
  const files = new Map();
  const folder = {
    files,
    read: async (root, rel) => (files.has(rel) ? { ok: true, bytes: files.get(rel) } : { ok: false, reason: 'not there' }),
    write: async (root, rel, bytes) => { files.set(rel, bytes); return { ok: true }; },
  };
  h.call('setShelfDiskScan', { root: '/loot', connected: true });
  h.call('setShelfPrefs', { ...DEFAULT_SHELF_PREFS, collectionSoftBound: 5 }, [], 'file');
  await runShelfExports(h.get, { backend: folder, root: '/loot', sessionStartMs: 10_000, assetsById, palettesById });
  const v = expectMatchesRecount(h.get(), 'D');
  assert.equal(v.tiers.disk, 3, 'three keeps live on disk');
  assert.equal(v.tiers.diskRead, 3, 'their records are in hand this session');
  assert.equal(v.tiers.inApp, 5, 'the collection is back at the bound');
  assert.equal(v.tiers.collection, 4, 'in-app off-stage: 5 minus the staged d8');
  assert.equal(v.tiers.total, 8, 'nothing lost in the move — 5 in-app + 3 on disk');
  assert.equal(v.moves.exports, 3);
  assert.equal(v.anchor.partial, false, 'all disk records read — the anchor is full weight');
  lines.push('D: after a real export run, tier counts span app + disk and still total the whole shelf');
}

console.log('shelfCensus.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('shelfCensus.selfcheck: PASS');
