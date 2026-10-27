// node src/curator/shelfDisk.selfcheck.mjs
//
// #1591 (Keeps K3) — the disk tier's pure law. Spec:
// docs/research/keeps-machinery-spec-2026-10-14.md (§2.3 disk tier,
// §5 history, §6 consumers, §10 API) + issue #1591 + audit S5. Pins:
//   - the export preferences parse off the same preferences.json:
//     shipped defaults, named clamps — including the K2 placeholder
//     'ask', which clamps to 'export' WITH its line, never silently;
//   - the file contract: looks/<keep-id>.json, loot-relative POSIX,
//     the record verbatim (a still rides unless the prefs say out),
//     parse(serialize(k)) === k, and no absolute path in any export;
//   - the planner: longest-unstaged first; a staged keep, the
//     performing keep, and a keep staged this session are NEVER
//     victims; 'off' exports nothing; a shortfall is a named line;
//   - the anchor account (S5): disk keeps count at full weight when
//     read; the unread are named, never silently dropped;
//   - the stub index: sanitized, round-tripped, junk refused (a stub
//     whose rel disagrees with its id is not a stub);
//   - the merged collection rows: one listing, three locations;
//   - the ledger: export/import records sanitize; a record carrying
//     an absolute path is refused whole.
import assert from 'node:assert';

const {
  EXPORT_FOLDER,
  DEFAULT_EXPORT_PREFS,
  parseShelfExportPrefs,
  exportRelFor,
  keepIdFromLookRel,
  exportDocumentFor,
  serializeExport,
  parseExportDocument,
  planExports,
  anchorAccount,
  diskStubFor,
  sanitizeDiskStub,
  sanitizeDiskIndex,
} = await import('./shelfDisk.mjs');
const { shelf, shelfDiskRows, sanitizeHistoryRecord, exportHistoryRecord, importHistoryRecord } =
  await import('./shelf.mjs');
const { dealFill } = await import('./shelfFill.mjs');
const { DEFAULT_SHELF_PREFS } = await import('./shelfPrefs.mjs');
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

// ── export preferences: defaults + named clamps ─────────────────────
{
  const d = parseShelfExportPrefs(null);
  assert.deepStrictEqual(d.exportPrefs, DEFAULT_EXPORT_PREFS, 'no file → shipped defaults');
  assert.deepStrictEqual(d.lines, [], 'no file → the main parser already spoke; no double line');
  const bad = parseShelfExportPrefs('{oops');
  assert.deepStrictEqual(bad.exportPrefs, DEFAULT_EXPORT_PREFS, 'unparseable → defaults');
  assert.deepStrictEqual(bad.lines, []);

  const ask = parseShelfExportPrefs(JSON.stringify({ shelf: { export: { onSoftBound: 'ask' } } }));
  assert.strictEqual(ask.exportPrefs.onSoftBound, 'export', "the K2 placeholder 'ask' lands on the live behaviour");
  assert.ok(
    ask.lines.some((l) => l.includes('"ask"') && l.includes('export stands')),
    'and the clamp is NAMED',
  );

  const off = parseShelfExportPrefs(
    JSON.stringify({ shelf: { export: { onSoftBound: 'off', includeStills: false, folder: 'elsewhere' } } }),
  );
  assert.strictEqual(off.exportPrefs.onSoftBound, 'off');
  assert.strictEqual(off.exportPrefs.includeStills, false);
  assert.strictEqual(off.exportPrefs.folder, 'looks', 'the loot contract has exactly one looks folder');
  assert.ok(
    off.lines.some((l) => l.includes('elsewhere')),
    'a foreign folder is clamped, named',
  );
  lines.push('export prefs: defaults silent, every clamp named — ask→export, folder→looks');
}

// ── the file contract ───────────────────────────────────────────────
{
  assert.strictEqual(EXPORT_FOLDER, 'looks');
  assert.strictEqual(exportRelFor('keep-abc'), 'looks/keep-abc.json');
  assert.strictEqual(keepIdFromLookRel('looks/keep-abc.json'), 'keep-abc');
  assert.strictEqual(keepIdFromLookRel('looks/sub/keep-abc.json'), null, 'exports are flat');
  assert.strictEqual(keepIdFromLookRel('images/keep-abc.json'), null, 'the looks folder only');
  assert.strictEqual(keepIdFromLookRel('looks/keep-abc.kclook'), null, 'the export shape only');
  assert.strictEqual(keepIdFromLookRel('looks/.hidden.json'), null, 'no dot-led ids');
  assert.strictEqual(keepIdFromLookRel('looks/two words.json'), null, 'no spaces in ids');

  for (const k of [hand('rt-hand', { keptAt: 111, stagedCount: 2 }), mined('rt-mined', { keptAt: 222 })]) {
    const parsed = parseExportDocument(serializeExport(k));
    assert.deepStrictEqual(parsed.keep, k, 'the record rides verbatim, round-trip exact');
  }
  const withStill = hand('rt-still', { still: 'data:image/png;base64,AAAA' });
  assert.strictEqual(
    parseExportDocument(serializeExport(withStill)).keep.still,
    'data:image/png;base64,AAAA',
    'a baked still rides by default',
  );
  const stripped = parseExportDocument(serializeExport(withStill, { ...DEFAULT_EXPORT_PREFS, includeStills: false }));
  assert.ok(!('still' in stripped.keep), 'includeStills: false leaves the still behind');
  assert.strictEqual(parseExportDocument('not json'), null);
  assert.strictEqual(parseExportDocument('{"nope":1}'), null, 'a JSON that names no keep is not an export');
  lines.push('file contract: looks/<id>.json verbatim, round-trip exact, still honoured both ways');
}

// ── no absolute path in any exported file (acceptance, grepped) ────
{
  const doc = serializeExport(mined('grep-1', { keptAt: 5 }));
  for (const pat of ['/Users/', '/home/', '/Volumes/', 'C:\\', 'file://']) {
    assert.ok(!doc.includes(pat), `no ${pat} in an export`);
  }
  lines.push('no absolute path in any exported file (grepped: /Users/ /home/ /Volumes/ C:\\ file://)');
}

// ── the planner ─────────────────────────────────────────────────────
{
  const keeps = [
    hand('p1', { keptAt: 300 }), // never staged, kept later
    hand('p2', { keptAt: 100 }), // never staged, kept first → leads
    hand('p3', { keptAt: 200, lastStagedAt: 900 }), // staged long ago
    hand('p4', { keptAt: 150, lastStagedAt: 800 }), // staged longer ago → before p3
    hand('p5', { keptAt: 120 }), // never staged
  ];
  const plan = planExports({ keeps, stageIds: [], bound: 2, sessionStartMs: 10_000 });
  assert.strictEqual(plan.over, 3);
  assert.deepStrictEqual(
    plan.victims.map((k) => k.id),
    ['p2', 'p5', 'p1'],
    'never-staged first (oldest kept leads), then longest-unstaged',
  );
  assert.deepStrictEqual(planExports({ keeps, stageIds: [], bound: 5 }).victims, [], 'at the bound: nothing moves');
  assert.deepStrictEqual(
    planExports({ keeps, stageIds: [], bound: 2, exportPrefs: { ...DEFAULT_EXPORT_PREFS, onSoftBound: 'off' } })
      .victims,
    [],
    "'off' exports nothing",
  );
  assert.strictEqual(
    planExports({ keeps, stageIds: [], bound: 2, exportPrefs: { ...DEFAULT_EXPORT_PREFS, onSoftBound: 'off' } }).over,
    3,
    'but the overflow is still counted',
  );

  const guarded = planExports({
    keeps,
    stageIds: ['p2'],
    bound: 0,
    sessionStartMs: 850,
    performingKeepId: 'p5',
  });
  assert.deepStrictEqual(
    guarded.victims.map((k) => k.id),
    ['p1', 'p4'],
    'staged (p2), performing (p5), session-staged (p3 @900 ≥ 850) are never victims',
  );
  assert.ok(
    guarded.lines.some((l) => l.includes('nothing more exportable')),
    'the shortfall is a named line',
  );
  lines.push('planner: longest-unstaged first; stage / performing / this-session are untouchable; shortfalls named');
}

// ── the anchor account (S5) ─────────────────────────────────────────
{
  const stub = (id) => ({ id, rel: exportRelFor(id) });
  const acct = anchorAccount({
    stubs: { a: stub('a'), b: stub('b'), c: stub('c') },
    diskRecords: { a: hand('a') },
    inAppIds: new Set(['c']),
  });
  assert.strictEqual(acct.known, 2, 'an in-app keep is never a disk keep (c is a fossil)');
  assert.strictEqual(acct.loaded, 1);
  assert.deepStrictEqual(acct.unread, ['b']);
  assert.strictEqual(acct.partial, true);
  assert.strictEqual(
    anchorAccount({ stubs: {}, diskRecords: {} }).partial,
    false,
    'no disk tier: a full read by vacuity',
  );
  lines.push('anchor account: read disk keeps at full weight; the unread are named (S5)');
}

// ── the stub index ──────────────────────────────────────────────────
{
  const row = {
    id: 's1',
    label: 'grid · bone',
    mode: 'grid',
    paletteId: 'bone',
    families: ['radial'],
    origin: '',
    corner: '',
    keptAt: 42,
    stagedCount: 1,
    lastStagedAt: 7,
  };
  const stub = diskStubFor(row, 'looks/s1.json');
  assert.deepStrictEqual(sanitizeDiskStub(stub), stub, 'a built stub sanitizes to itself');
  const idx = sanitizeDiskIndex({
    v: 1,
    root: '/loot',
    stubs: { s1: stub, bad: { id: 'bad', rel: 'looks/other.json' }, junk: 42 },
  });
  assert.strictEqual(idx.root, '/loot');
  assert.deepStrictEqual(
    Object.keys(idx.stubs),
    ['s1'],
    'a stub whose rel disagrees with its id is refused; junk is refused',
  );
  assert.deepStrictEqual(sanitizeDiskIndex(null), { v: 1, root: null, stubs: {} });
  assert.strictEqual(
    sanitizeDiskStub({ id: 'x', rel: '/Users/matt/looks/x.json' }),
    null,
    'an absolute rel is never a stub',
  );
  lines.push('stub index: round-trips, refuses id/rel disagreement and absolute paths');
}

// ── the merged rows: one listing, three locations ───────────────────
{
  const inApp = hand('m-inapp', { keptAt: 10 });
  const onDisk = hand('m-disk', { keptAt: 20 });
  const awayStub = sanitizeDiskStub({ id: 'm-away', rel: 'looks/m-away.json', label: 'away look', keptAt: 30 });
  const goneStub = {
    ...sanitizeDiskStub({ id: 'm-gone', rel: 'looks/m-gone.json', label: 'gone look', keptAt: 40 }),
    missing: true,
  };
  const stubs = {
    'm-disk': diskStubFor({ id: 'm-disk', label: 'x' }, 'looks/m-disk.json'),
    'm-away': awayStub,
    'm-gone': goneStub,
  };
  const rows = shelfDiskRows([inApp], [], { diskRecords: [onDisk], stubs, assetsById, palettesById });
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.strictEqual(rows.length, 4, 'every keep listed exactly once');
  assert.strictEqual(byId.get('m-inapp').location, 'app');
  assert.strictEqual(byId.get('m-disk').location, 'disk');
  assert.strictEqual(byId.get('m-disk').keep.id, 'm-disk', 'a read disk keep carries its record');
  assert.strictEqual(byId.get('m-away').location, 'disk-away');
  assert.strictEqual(byId.get('m-away').keep, null, 'a stub row is a listing card, never a record');
  assert.strictEqual(byId.get('m-gone').location, 'missing');
  const found = shelfDiskRows([inApp], [], {
    diskRecords: [onDisk],
    stubs,
    query: 'gone look',
    assetsById,
    palettesById,
  });
  assert.deepStrictEqual(
    found.map((r) => r.id),
    ['m-gone'],
    'search reaches stub rows by their stub label',
  );
  lines.push('merged rows: app / disk / disk-away / missing in one searched, sorted listing');
}

// ── the ledger speaks moves; absolute paths refused ─────────────────
{
  const ex = sanitizeHistoryRecord(exportHistoryRecord('k1', 'looks/k1.json', 123));
  assert.deepStrictEqual(ex, { kind: 'export', keepId: 'k1', path: 'looks/k1.json', at: 123 });
  const im = sanitizeHistoryRecord(importHistoryRecord('k1', 'looks/k1.json', 124));
  assert.strictEqual(im.kind, 'import');
  assert.strictEqual(
    sanitizeHistoryRecord({ kind: 'export', keepId: 'k1', path: '/Users/matt/loot/looks/k1.json', at: 1 }),
    null,
    'a move record carrying an absolute path is refused whole',
  );
  lines.push('history: export/import records round-trip; absolute paths refused at the door');
}

// ── the §10 door + the fill's partial naming ────────────────────────
{
  const viaDoor = shelf.export({
    keeps: [hand('d1', { keptAt: 1 }), hand('d2', { keptAt: 2 })],
    stageIds: [],
    bound: 1,
  });
  assert.deepStrictEqual(
    viaDoor.victims.map((k) => k.id),
    ['d1'],
    'curator/shelf.export() IS the planner',
  );
  const pool = Array.from({ length: 30 }, (_, i) => hand(`f${i}`, { keptAt: i + 1 }));
  const partial = dealFill({
    keeps: pool,
    stageIds: [],
    history: [],
    prefs: DEFAULT_SHELF_PREFS,
    seed: 7,
    anchorPartial: 2,
  });
  assert.ok(
    partial.receipt.notes.some((l) => l.includes('anchor: partial — 2 keeps on disk unread')),
    'a partial anchor is named in the receipt (S5)',
  );
  const full = dealFill({ keeps: pool, stageIds: [], history: [], prefs: DEFAULT_SHELF_PREFS, seed: 7 });
  assert.ok(
    !full.receipt.notes.some((l) => l.includes('anchor: partial')),
    'a full read says nothing about partiality',
  );
  lines.push('§10: shelf.export() plans; the fill receipt names a partial anchor, never a silent one');
}

console.log('shelfDisk.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('shelfDisk.selfcheck: PASS');
