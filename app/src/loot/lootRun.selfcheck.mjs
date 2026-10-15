// node src/loot/lootRun.selfcheck.mjs
// #1479 slice 5 — one scan end to end over a fake native side: list, plan, hash only what changed, fold in. Nothing is
// dropped silently, a failed hash is a row and not a crash, and a folder that cannot be listed changes nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runScan } from './lootRun.mjs';
import { createLootNative } from './lootNative.mjs';
import { emptyIndex, withRoot, countItems } from './lootIndex.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };
const NOW = 9_000_000; const OLD = NOW - 120_000;
const ROOT = '/Users/me/Loot';

/** A fake folder: files by rel -> { bytes, mtimeMs }, plus options. Counts native calls. */
function folder(files, { unreachable = false, skipped = [], truncated = false, hashFails = [] } = {}) {
  const calls = { scan: 0, hash: [] };
  const sha = (s) => Buffer.from(s).toString('hex').padEnd(64, '0').slice(0, 64);
  const invoke = async (cmd, args) => {
    if (cmd === 'loot_scan') {
      calls.scan++;
      if (unreachable) return { reachable: false, entries: [], skipped: [], truncated: false };
      const entries = Object.entries(files).map(([rel, f]) => ({ rel, size: f.bytes.length, mtimeMs: f.mtimeMs ?? OLD })).sort((a, b) => (a.rel < b.rel ? -1 : 1));
      return { reachable: true, entries, skipped, truncated };
    }
    if (cmd === 'loot_hash') {
      calls.hash.push(args.rel);
      if (hashFails.includes(args.rel)) throw new Error('unreadable: permission denied');
      return sha(files[args.rel].bytes);
    }
    throw new Error(cmd);
  };
  return { native: createLootNative({ invoke, isDesktop: () => true, confirmed: true }), calls, files };
}
const F = (bytes, mtimeMs) => ({ bytes, mtimeMs });

await ok('a first scan adds, logs what it cannot use, and reads every file once', async () => {
  const fo = folder({ 'images/a.svg': F('<svg>a</svg>'), 'images/b.svg': F('<svg>b</svg>'), 'images/p.png': F('png'), 'palettes/x.json': F('{}'), 'audio/l.wav': F('RIFFx') });
  const progress = [];
  const r = await runScan({ native: fo.native, index: withRoot(emptyIndex(), ROOT), nowMs: NOW, onProgress: (p) => progress.push(p) });
  assert.equal(r.ok, true);
  assert.equal(r.summary.add, 4); assert.equal(r.summary.skipped, 1);
  assert.deepEqual(r.rows.map((x) => x.outcome).sort(), ['added', 'added', 'added', 'added', 'skipped']);
  assert.ok(r.rows.find((x) => x.outcome === 'skipped').reason.includes('raster'));
  assert.equal(fo.calls.hash.length, 4, 'the png is classified out before it is ever read');
  assert.deepEqual(countItems(r.index), { items: 4, ok: 4, missing: 0, pending: 4, held: 0, taken: 0 });
  assert.deepEqual(progress.at(-1), { done: 4, total: 4 });
});

await ok('a rescan reads nothing that has not changed', async () => {
  const files = { 'images/a.svg': F('<svg>a</svg>'), 'images/b.svg': F('<svg>b</svg>') };
  let fo = folder(files);
  const first = await runScan({ native: fo.native, index: withRoot(emptyIndex(), ROOT), nowMs: NOW });
  fo = folder(files);
  const again = await runScan({ native: fo.native, index: first.index, nowMs: NOW + 1000 });
  assert.equal(fo.calls.hash.length, 0, 'no hashing at all');
  assert.equal(again.summary.unchanged, 2); assert.equal(again.rows.length, 0);
  // one file changes (new bytes, new mtime): only it is read
  fo = folder({ ...files, 'images/b.svg': F('<svg>B!</svg>', OLD + 5000) });
  const changed = await runScan({ native: fo.native, index: first.index, nowMs: NOW + 2000 });
  assert.deepEqual(fo.calls.hash, ['images/b.svg']);
  assert.deepEqual(changed.rows.map((x) => x.outcome), ['changed']);
});

await ok('rename keeps the item; a deleted file is missing; the asset keeps working', async () => {
  let fo = folder({ 'images/a.svg': F('<svg>a</svg>'), 'images/gone.svg': F('<svg>g</svg>') });
  const first = await runScan({ native: fo.native, index: withRoot(emptyIndex(), ROOT), nowMs: NOW });
  fo = folder({ 'images/renamed.svg': F('<svg>a</svg>') });
  const r = await runScan({ native: fo.native, index: first.index, nowMs: NOW + 1000 });
  assert.deepEqual(r.rows.map((x) => x.outcome).sort(), ['missing', 'renamed']);
  assert.equal(countItems(r.index).missing, 1);
  const renamed = Object.values(r.index.items).find((i) => i.rel === 'images/renamed.svg');
  assert.ok(renamed && renamed.state === 'ok');
});

await ok('a file that cannot be read is a row, not a crash, and the scan carries on', async () => {
  const fo = folder({ 'images/ok.svg': F('<svg>ok</svg>'), 'images/locked.svg': F('<svg>x</svg>') }, { hashFails: ['images/locked.svg'] });
  const r = await runScan({ native: fo.native, index: withRoot(emptyIndex(), ROOT), nowMs: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.summary.add, 1);
  const bad = r.rows.find((x) => x.rel === 'images/locked.svg');
  assert.equal(bad.outcome, 'skipped'); assert.match(bad.reason, /unreadable: .*permission denied/);
});

await ok('what the native side declined to list (symlinks) and a truncated listing are rows too', async () => {
  const fo = folder({ 'images/a.svg': F('<svg/>') }, { skipped: [{ rel: 'images/link.svg', reason: 'symlink (not followed)' }], truncated: true });
  const r = await runScan({ native: fo.native, index: withRoot(emptyIndex(), ROOT), nowMs: NOW });
  assert.ok(r.rows.some((x) => x.rel === 'images/link.svg' && /symlink/.test(x.reason)));
  assert.ok(r.rows.some((x) => /listing stopped early/.test(x.reason)));
  assert.equal(r.truncated, true);
});

await ok('an unreachable folder changes nothing, marks nothing missing, and says so', async () => {
  let fo = folder({ 'images/a.svg': F('<svg>a</svg>') });
  const first = await runScan({ native: fo.native, index: withRoot(emptyIndex(), ROOT), nowMs: NOW });
  fo = folder({}, { unreachable: true });
  const r = await runScan({ native: fo.native, index: first.index, nowMs: NOW + 1000 });
  assert.equal(r.ok, true); assert.equal(r.unreachable, true);
  assert.deepEqual(r.index.items, first.index.items);
  assert.equal(countItems(r.index).missing, 0);
  assert.ok(r.rows.some((x) => x.reason === 'folder not reachable'));
});

await ok('no folder, a closed gate and a failing scan return a reason and leave the index alone', async () => {
  const fo = folder({});
  const none = await runScan({ native: fo.native, index: emptyIndex(), nowMs: NOW });
  assert.deepEqual([none.ok, none.reason], [false, 'no folder yet']);
  const web = createLootNative({ isDesktop: () => false });
  const w = await runScan({ native: web, index: withRoot(emptyIndex(), ROOT), nowMs: NOW });
  assert.deepEqual([w.ok, w.reason], [false, 'desktop only']);
  const boom = createLootNative({ invoke: async () => { throw new Error('IPC died'); }, isDesktop: () => true, confirmed: true });
  const b = await runScan({ native: boom, index: withRoot(emptyIndex(), ROOT), nowMs: NOW });
  assert.equal(b.ok, false); assert.match(b.reason, /IPC died/);
  assert.equal(b.index.root, ROOT);
});

await ok('the picker: a pick, a cancel and a refusal; gated like the rest', async () => {
  const pick = (r) => createLootNative({ pick: async () => r, isDesktop: () => true, confirmed: true });
  assert.deepEqual(await pick('/Users/me/Loot').pickFolder(), { ok: true, path: '/Users/me/Loot' });
  assert.deepEqual(await pick(['/a', '/b']).pickFolder(), { ok: true, path: '/a' });
  assert.deepEqual(await pick(null).pickFolder(), { ok: true, path: null }, 'cancel is not an error');
  assert.deepEqual(await pick('x'.repeat(2000)).pickFolder(), { ok: true, path: null }, 'an absurd path is not taken');
  const err = await createLootNative({ pick: async () => { throw new Error('dialog failed'); }, isDesktop: () => true, confirmed: true }).pickFolder();
  assert.deepEqual(err, { ok: false, reason: 'dialog failed' });
  assert.deepEqual(await createLootNative({ pick: async () => '/a', isDesktop: () => false }).pickFolder(), { ok: false, reason: 'desktop only' });
});

await ok('the row: mounted in SETUP under STAGE, desktop-only on the web, the path never in a project, picker capability enabled', () => {
  const panel = src('../panels/PipelinePanel.jsx');
  assert.ok(panel.indexOf('<StageBlock />') < panel.indexOf('<LootRow />') && panel.indexOf('<LootRow />') < panel.indexOf('ds-dev'), 'SETUP, after STAGE, before the dev area');
  const row = src('../panels/pipeline/LootRow.jsx');
  assert.match(row, /native\.unavailable\(\)/); assert.match(row, /window\.confirm\(confirmForgetMessage\(counts\.items\)\)/);
  assert.ok(!/emit\(|setState|useApp/.test(row), 'it does not write the store or the bus directly');
  assert.match(row, /ingest: ingestVia\(\(\) => useStore\.getState\(\)\)/, 'assets enter the pool only through the app\'s own ingest action');
  assert.ok(!/lootIndex|LootRow/.test(src('../state/projectDocument.js')), 'the project document knows nothing of it');
  const conf = JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.deepEqual(conf.tauri.allowlist.dialog, { all: false, open: true }, 'only the open dialog, nothing else');
  const cargo = readFileSync(new URL('../../../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  assert.match(cargo, /"dialog-open"/);
});

console.log(`lootRun.selfcheck: ${n} checks passed`);
