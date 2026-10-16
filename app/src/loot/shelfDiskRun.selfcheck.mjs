// node src/loot/shelfDiskRun.selfcheck.mjs
//
// #1591 (Keeps K3) — the disk tier end to end, at the deepest level
// that runs headlessly: the real davisSlice store + the real glue
// (loot/shelfDiskRun.mjs) over a fake in-memory folder. Pins the
// issue's acceptance criteria:
//   - crown past the bound with a connected folder → the oldest-
//     unstaged keeps export; the exported file's record is identical
//     to the in-app record; the shelf speaks the move (history +
//     notice) and the disk index persists;
//   - a staged keep, the performing keep, and a keep staged this
//     session are never exported;
//   - promoting an on-disk keep (stage it) re-imports it — the record
//     performs from the store, no duplicate anywhere, the file left
//     behind is a fossil the take-in never re-reads as a record;
//   - a fill deals disk keeps like in-app ones and imports what it
//     deals, in the same move, under the fill's own ledger records;
//   - the folder away → the fill receipt names the anchor partial;
//   - a keep file deleted outside the app marks its stub missing;
//   - files that are not keeps exports are held with a reason;
//   - a failed write stops the run, spoken, with nothing moved.
import assert from 'node:assert';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };

const { createDavisSlice, KEEPS_KEY, STAGE_KEY, DISK_KEY } = await import('../state/slices/davisSlice.js');
const { takeInLooks, applyShelfDiskScan, runShelfExports } = await import('./shelfDiskRun.mjs');
const { parseExportDocument, diskStubFor } = await import('../curator/shelfDisk.mjs');
const { shelfRow, shelfDiskRows } = await import('../curator/shelf.mjs');
const { DEFAULT_SHELF_PREFS } = await import('../curator/shelfPrefs.mjs');
const { ASSETS } = await import('../data/assets/index.js');
const { PALETTES } = await import('../data/palettes.js');

const lines = [];
const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));
const radialIds = ASSETS.filter((a) => a.category === 'radial').slice(0, 3).map((a) => a.id);

const K = (id, keptAt, extra = {}) => ({
  id, seed: 100, timestamp: '2026-10-01T00:00:00.000Z', keptAt,
  config: { layout: { mode: 'grid', count: 30 }, palette: { id: 'bone' }, assets: radialIds.slice(0, 2) },
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

const fakeFolder = () => {
  const files = new Map(); // rel -> Uint8Array
  return {
    files,
    read: async (root, rel) => (files.has(rel) ? { ok: true, bytes: files.get(rel) } : { ok: false, reason: 'not there' }),
    write: async (root, rel, bytes) => { files.set(rel, bytes); return { ok: true }; },
  };
};
const connect = (h, root = '/loot') => h.call('setShelfDiskScan', { root, connected: true });
const setBound = (h, bound) => h.call('setShelfPrefs', { ...DEFAULT_SHELF_PREFS, collectionSoftBound: bound }, [], 'file');
const stubFor = (rec) => diskStubFor(shelfRow(rec, [], { assetsById, palettesById }), `looks/${rec.id}.json`);

// ── A: overflow exports, byte-identical, spoken, persisted ──────────
{
  const keeps = Array.from({ length: 8 }, (_, i) => K(`k${i + 1}`, (i + 1) * 100));
  const h = boot({ keeps, stage: ['k8'] });
  const folder = fakeFolder();
  connect(h);
  setBound(h, 5);
  // the reference is the IN-APP record (the store's sanitizer expands
  // a seeded fixture on read — the export must match what the app
  // held, not what the test typed)
  const inApp = Object.fromEntries(h.get().keeps.map((k) => [k.id, k]));
  const r = await runShelfExports(h.get, { backend: folder, root: '/loot', sessionStartMs: 10_000, assetsById, palettesById });
  assert.deepEqual(r.exported, ['k1', 'k2', 'k3'], 'longest-unstaged first (never staged, oldest kept leads)');
  assert.equal(r.stopped, null);
  for (const id of ['k1', 'k2', 'k3']) {
    const text = new TextDecoder().decode(folder.files.get(`looks/${id}.json`));
    assert.deepEqual(parseExportDocument(text).keep, inApp[id], 'the file record is the in-app record, verbatim');
    assert.ok(!text.includes('/loot'), 'no absolute path — the root is never written into a file');
  }
  const s = h.get();
  assert.equal(s.keeps.length, 5, 'the collection is back at the bound');
  assert.deepEqual(Object.keys(s.shelfDiskRecords).sort(), ['k1', 'k2', 'k3'], 'the records live on the disk side now');
  assert.equal(s.shelfDiskStubs.k1.rel, 'looks/k1.json');
  const exportsLogged = s.shelfHistory.filter((x) => x.kind === 'export');
  assert.equal(exportsLogged.length, 3, 'every export is a history record');
  assert.deepEqual(exportsLogged.map((x) => x.path), ['looks/k1.json', 'looks/k2.json', 'looks/k3.json']);
  assert.ok(s.shelfNotice.includes('exported 3 keeps'), 'and the shelf says so');
  const persisted = JSON.parse(mem.get(DISK_KEY));
  assert.deepEqual(Object.keys(persisted.stubs).sort(), ['k1', 'k2', 'k3'], 'the disk index persists');
  assert.equal(persisted.root, '/loot');
  lines.push('A: overflow at the bound exports longest-unstaged first — verbatim files, history + notice, index persisted');
}

// ── B: the protected never export ───────────────────────────────────
{
  const keeps = [
    K('b1', 100), K('b2', 200), K('b3', 300),
    K('b4', 400, { lastStagedAt: 600 }), // staged this session
    K('b5', 500),                        // performing
    K('b6', 600),                        // staged
  ];
  const h = boot({ keeps, stage: ['b6'] });
  h.set({ performingKeepId: 'b5' });
  const folder = fakeFolder();
  connect(h);
  setBound(h, 4); // over by 2 — only b1, b2 are exportable and needed
  const r = await runShelfExports(h.get, { backend: folder, root: '/loot', sessionStartMs: 500, assetsById, palettesById });
  assert.deepEqual(r.exported, ['b1', 'b2']);
  assert.deepEqual([...folder.files.keys()].sort(), ['looks/b1.json', 'looks/b2.json'], 'staged / performing / session-staged never move');
  assert.equal(h.get().keeps.length, 4);
  lines.push('B: a staged keep, the performing keep, and a keep staged this session are never exported');
}

// ── C: promotion re-imports; no duplicate; the file is a fossil ────
{
  const keeps = [K('c1', 100), K('c2', 200), K('c3', 300), K('c4', 400)];
  const h = boot({ keeps, stage: [] });
  const folder = fakeFolder();
  connect(h);
  setBound(h, 3);
  await runShelfExports(h.get, { backend: folder, root: '/loot', sessionStartMs: 10_000, assetsById, palettesById });
  assert.deepEqual(Object.keys(h.get().shelfDiskRecords), ['c1']);

  h.call('stageKeep', 'c1');
  const s = h.get();
  assert.ok(s.keeps.some((k) => k.id === 'c1'), 'the record is back in the collection');
  assert.ok(s.keepStage.includes('c1'), 'and on the stage — it performs');
  assert.ok(!s.shelfDiskRecords.c1 && !s.shelfDiskStubs.c1, 'no second home: the disk side let go');
  const imports = s.shelfHistory.filter((x) => x.kind === 'import');
  assert.equal(imports.length, 1);
  assert.equal(imports[0].path, 'looks/c1.json', 'the import is a ledger record with the file it came from');
  assert.ok(s.shelfNotice.includes('back from disk'), 'and the shelf says so');
  assert.ok(folder.files.has('looks/c1.json'), 'the file itself is left in place — a fossil, not a deletion');

  // the fossil's take-in: marked taken, never re-read as a record
  const fossilIndex = {
    v: 1, root: '/loot', scannedAt: 1,
    items: { 'user:loot_c1_aaaaaa': { kind: 'look', rel: 'looks/c1.json', size: 10, mtimeMs: 1, hash: 'a1b2c3d4', state: 'ok', ingested: false, hold: null, assetId: null } },
    log: [],
  };
  const t = await takeInLooks({
    backend: folder, index: fossilIndex,
    isInApp: (id) => h.get().keeps.some((k) => k.id === id),
    isLoaded: (id) => !!h.get().shelfDiskRecords[id],
    assetsById, palettesById,
  });
  assert.deepEqual(t.records, {}, 'a fossil never becomes a second record');
  assert.equal(t.index.items['user:loot_c1_aaaaaa'].ingested, true, 'it is marked taken and left alone');
  lines.push('C: stage-it re-imports the record (ledger + line), no duplicate; the leftover file is a fossil');
}

// ── D: a fill deals a disk keep and imports it in the same move ────
{
  const rec = K('dk1', 100);
  const h = boot({ keeps: [], stage: [] });
  h.call('setShelfDiskScan', {
    root: '/loot', connected: true,
    records: { dk1: rec }, freshStubs: { dk1: stubFor(rec) },
    present: [{ keepId: 'dk1', rel: 'looks/dk1.json' }], missingIds: [],
  });
  assert.equal(h.get().keeps.length, 0);
  h.call('fillStage');
  const s = h.get();
  assert.ok(s.keeps.some((k) => k.id === 'dk1'), 'the dealt disk keep lands in the collection');
  assert.ok(!s.shelfDiskRecords.dk1 && !s.shelfDiskStubs.dk1, 'its disk side let go');
  assert.ok(s.shelfHistory.some((x) => x.kind === 'fill'), 'the fill is on the ledger');
  assert.ok(s.shelfHistory.some((x) => x.kind === 'import' && x.keepId === 'dk1'), 'and so is its import, under the fill');
  const top = s.historyUndoStack?.[s.historyUndoStack.length - 1];
  assert.ok(top?.shelf?.shelfDiskRecords?.dk1, 'the fill\'s one undo snapshot holds the pre-fill disk tier');
  lines.push('D: the fill treats a disk keep as a full citizen — dealt, imported, ledgered, one undo step');
}

// ── E: folder away → the receipt names the anchor partial (S5) ─────
{
  const keeps = Array.from({ length: 24 }, (_, i) => K(`e${i + 1}`, (i + 1) * 100));
  const h = boot({ keeps, stage: [] });
  const s1 = K('e-disk1', 50); const s2 = K('e-disk2', 60);
  h.call('setShelfDiskScan', {
    root: '/loot', connected: false,
    records: {}, freshStubs: { 'e-disk1': stubFor(s1), 'e-disk2': stubFor(s2) },
    present: [{ keepId: 'e-disk1', rel: 'looks/e-disk1.json' }, { keepId: 'e-disk2', rel: 'looks/e-disk2.json' }],
    missingIds: [],
  });
  h.call('fillStage');
  const fill = [...h.get().shelfHistory].reverse().find((x) => x.kind === 'fill');
  assert.ok(fill, 'a fill happened');
  assert.ok(fill.notes.some((l) => l.includes('anchor: partial — 2 keeps on disk unread')), 'the partial anchor is named, not silent');
  lines.push('E: with the folder away, fills and readouts name the anchor partial (audit S5)');
}

// ── F: a file deleted outside the app marks its stub missing ───────
{
  const rec = K('f1', 100);
  const h = boot({ keeps: [K('f0', 50)], stage: [] });
  const folder = fakeFolder();
  folder.files.set('looks/f1.json', new TextEncoder().encode(JSON.stringify(rec)));
  const ix = {
    v: 1, root: '/loot', scannedAt: 1,
    items: { 'user:loot_f1_bbbbbb': { kind: 'look', rel: 'looks/f1.json', size: 10, mtimeMs: 1, hash: 'b1b2c3d4', state: 'ok', ingested: false, hold: null, assetId: null } },
    log: [],
  };
  const t = await takeInLooks({ backend: folder, index: ix, isInApp: () => false, isLoaded: () => false, assetsById, palettesById });
  applyShelfDiskScan(h.get, { root: '/loot', connected: true, index: t.index, records: t.records, freshStubs: t.stubs });
  assert.ok(h.get().shelfDiskRecords.f1, 'the record was read in');
  // the artist deletes the file in Finder; the next scan says missing
  const goneIx = { ...t.index, items: { 'user:loot_f1_bbbbbb': { ...t.index.items['user:loot_f1_bbbbbb'], state: 'missing' } } };
  applyShelfDiskScan(h.get, { root: '/loot', connected: true, index: goneIx });
  assert.equal(h.get().shelfDiskStubs.f1.missing, true, 'the stub is marked, not dropped');
  const rows = shelfDiskRows(h.get().keeps, h.get().keepStage, {
    diskRecords: Object.values(h.get().shelfDiskRecords), stubs: h.get().shelfDiskStubs, assetsById, palettesById,
  });
  assert.equal(rows.find((r) => r.id === 'f1').location, 'disk', 'a record in hand still lists from the record');
  const stubOnly = shelfDiskRows(h.get().keeps, h.get().keepStage, { diskRecords: [], stubs: h.get().shelfDiskStubs, assetsById, palettesById });
  assert.equal(stubOnly.find((r) => r.id === 'f1').location, 'missing', 'without the record, the row says file gone');
  lines.push('F: a keep file deleted outside the app is marked missing and said out loud (slice-9 behaviour)');
}

// ── G: files that are not keeps exports are held, with the reason ──
{
  const folder = fakeFolder();
  folder.files.set('looks/j1.json', new TextEncoder().encode('just some notes'));
  folder.files.set('looks/j2.json', new TextEncoder().encode(JSON.stringify({ id: 'someone-else' })));
  const item = (stem, rel) => ({ kind: 'look', rel, size: 10, mtimeMs: 1, hash: 'c1b2c3d4', state: 'ok', ingested: false, hold: null, assetId: null });
  const ix = {
    v: 1, root: '/loot', scannedAt: 1,
    items: {
      'user:loot_j1_cccccc': item('j1', 'looks/j1.json'),
      'user:loot_j2_cccccc': item('j2', 'looks/j2.json'),
      'user:loot_j3_cccccc': item('j3', 'looks/sub/j3.json'),
    },
    log: [],
  };
  const t = await takeInLooks({ backend: folder, index: ix, isInApp: () => false, isLoaded: () => false, assetsById, palettesById });
  assert.deepEqual(t.records, {}, 'none of them became a record');
  assert.equal(t.summary.held, 3);
  assert.ok(t.index.items['user:loot_j1_cccccc'].hold.includes('not a keeps export'));
  assert.ok(t.index.items['user:loot_j2_cccccc'].hold.includes('different keep'), 'a filename/record disagreement is named');
  assert.ok(t.index.items['user:loot_j3_cccccc'].hold, 'a nested file is not an export either');
  lines.push('G: non-export files in looks/ are held with reasons — never dropped, never guessed at');
}

// ── H: a failed write stops the run, spoken, nothing moved ─────────
{
  const keeps = [K('h1', 100), K('h2', 200), K('h3', 300), K('h4', 400)];
  const h = boot({ keeps, stage: [] });
  connect(h);
  setBound(h, 3);
  const dead = { read: async () => ({ ok: false, reason: 'gone' }), write: async () => ({ ok: false, reason: 'disk full' }) };
  const r = await runShelfExports(h.get, { backend: dead, root: '/loot', sessionStartMs: 10_000, assetsById, palettesById });
  assert.deepEqual(r.exported, []);
  assert.equal(r.stopped, 'h1');
  assert.equal(h.get().keeps.length, 4, 'nothing moved');
  assert.ok(h.get().shelfNotice.includes('export stopped — disk full'), 'the stop is spoken on the shelf line');
  lines.push('H: a failed write stops the run with its reason; every keep stays in the collection');
}

console.log('shelfDiskRun.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('shelfDiskRun.selfcheck: PASS');
