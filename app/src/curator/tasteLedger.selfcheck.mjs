// node src/curator/tasteLedger.selfcheck.mjs
// #1173 — the taste flywheel ledgers: every keep door (F, J, the star) and the
// pass gesture (X) append exactly one well-formed JSONL line; passes never
// touch store state (no live influence); a corrupt line is skipped with a
// warning, never silently.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
};

const {
  ledgerRow, isLedgerRow, parseLedger, appendToLedger, readLedgerText, ledgerCounts,
  LEDGER_STORAGE_KEYS, LEDGER_FILES,
} = await import('./tasteLedger.js');
const { createDavisSlice } = await import('../state/slices/davisSlice.js');
const { SEED_OFFSET_GROUPS } = await import('../engine/kernel/rng.js');
const G = SEED_OFFSET_GROUPS[0];

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };

const rec = (seed, extra = {}) => ({
  seed,
  seedOffsets: { [G]: 3 },
  timestamp: '2026-10-13T22:00:00.000Z',
  context: { audio: null, paletteWarmth: 0.72, dwellMs: 4100 },
  config: { layout: { mode: 'grid', count: 40 }, palette: { id: 'bone' }, assets: ['xsh01', 'xsh07'] },
  ...extra,
});

function boot(projectTitle = '') {
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = { ...createDavisSlice(set, () => state), projectTitle };
  return { get: () => state, call: (name, ...a) => state[name](...a) };
}
const lines = (kind) => readLedgerText(kind).split('\n').filter((l) => l.trim());
const reset = () => mem.clear();

await ok('a row has the spec shape {seed, recipe, timestamp, keepContext, projectRef}', () => {
  const r = ledgerRow(rec(0xdeadbeef), 'night set');
  assert.deepStrictEqual(Object.keys(r).sort(), ['keepContext', 'projectRef', 'recipe', 'seed', 'timestamp']);
  assert.strictEqual(r.seed, 0xdeadbeef);
  assert.deepStrictEqual(r.recipe.layoutParams, { mode: 'grid', count: 40 });
  assert.strictEqual(r.recipe.paletteId, 'bone');
  assert.deepStrictEqual(r.recipe.assets, ['xsh01', 'xsh07']);
  assert.strictEqual(r.recipe.seedOffsets[G], 3);
  assert.deepStrictEqual(r.keepContext, { audio: null, paletteWarmth: 0.72, dwellMs: 4100 });
  assert.strictEqual(r.projectRef, 'night set');
  assert.ok(isLedgerRow(r));
});

await ok('absent stays absent: legacy record has no offsets/cast, null context and ref', () => {
  const r = ledgerRow({ seed: 5, timestamp: 't', config: { palette: { id: '' } } }, '');
  assert.ok(!('seedOffsets' in r.recipe) && !('assets' in r.recipe));
  assert.strictEqual(r.recipe.layoutParams, null);
  assert.strictEqual(r.recipe.paletteId, null);
  assert.strictEqual(r.keepContext, null);
  assert.strictEqual(r.projectRef, null);
  assert.ok(isLedgerRow(r));
});

await ok('no seed or no timestamp → no line (nothing invented)', () => {
  assert.strictEqual(ledgerRow({ seed: 'nope', timestamp: 't' }), null);
  assert.strictEqual(ledgerRow({ seed: 1 }), null);
  assert.strictEqual(ledgerRow(null), null);
  reset();
  assert.strictEqual(appendToLedger('keeps', { seed: NaN, timestamp: 't' }, '', { fileSink: null }), null);
  assert.strictEqual(readLedgerText('keeps'), '');
});

await ok('append-only: two appends are two lines, in order, on the right key', () => {
  reset();
  appendToLedger('keeps', rec(1), '', { fileSink: null });
  appendToLedger('keeps', rec(2), '', { fileSink: null });
  appendToLedger('passes', rec(3), '', { fileSink: null });
  assert.deepStrictEqual(lines('keeps').map((l) => JSON.parse(l).seed), [1, 2]);
  assert.deepStrictEqual(lines('passes').map((l) => JSON.parse(l).seed), [3]);
  assert.ok(mem.get(LEDGER_STORAGE_KEYS.keeps).endsWith('\n'), 'every line newline-terminated');
  assert.deepStrictEqual(ledgerCounts(), { keeps: 2, passes: 1 });
  assert.throws(() => appendToLedger('clicks', rec(4), '', { fileSink: null }), /unknown ledger/, 'two ledgers only');
});

await ok('desktop mirror gets the same line; a failing sink warns, never throws', async () => {
  reset();
  const got = [];
  appendToLedger('passes', rec(9), '', { fileSink: (kind, line) => { got.push([kind, line]); } });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepStrictEqual(got, [['passes', readLedgerText('passes')]]);
  const warned = [];
  appendToLedger('keeps', rec(9), '', { fileSink: () => { throw new Error('disk'); }, warn: (m) => warned.push(m) });
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(warned.length, 1);
  assert.match(warned[0], /desktop file append failed/);
  assert.strictEqual(LEDGER_FILES.keeps, 'keeps.jsonl');
});

await ok('a full localStorage is reported, not swallowed', () => {
  const warned = [];
  const full = { getItem: () => '', setItem: () => { throw new Error('QuotaExceededError'); } };
  appendToLedger('keeps', rec(1), '', { storage: full, fileSink: null, warn: (m) => warned.push(m) });
  assert.strictEqual(warned.length, 1);
  assert.match(warned[0], /local save failed/);
});

await ok('corrupt / off-schema lines are skipped WITH a warning', () => {
  const good = JSON.stringify(ledgerRow(rec(7), ''));
  const text = [good, '{not json', '', JSON.stringify({ seed: 1 }), good].join('\n');
  const warned = [];
  const { rows, skipped } = parseLedger(text, (m) => warned.push(m));
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(skipped, 2);
  assert.deepStrictEqual(warned.map((w) => w.match(/line (\d+)/)[1]), ['2', '4']);
});

await ok('slice: F (favorite) → one keep line; J (keep) → one keep line; with project ref', () => {
  reset();
  const a = boot('night set');
  a.call('addFavorite', rec(11));
  a.call('addKeep', rec(22));
  const ks = lines('keeps').map((l) => JSON.parse(l));
  assert.deepStrictEqual(ks.map((k) => k.seed), [11, 22]);
  assert.ok(ks.every(isLedgerRow));
  assert.ok(ks.every((k) => k.projectRef === 'night set'));
  assert.strictEqual(lines('passes').length, 0);
});

await ok('slice: X (pass) → one pass line and NO store change (no live influence)', () => {
  reset();
  const a = boot();
  const before = a.get();
  a.call('addPass', rec(33));
  const after = a.get();
  assert.strictEqual(after.keeps, before.keeps, 'keeps untouched');
  assert.strictEqual(after.favorites, before.favorites, 'favorites untouched');
  const ps = lines('passes').map((l) => JSON.parse(l));
  assert.strictEqual(ps.length, 1);
  assert.strictEqual(ps[0].seed, 33);
  assert.ok(isLedgerRow(ps[0]));
  assert.strictEqual(lines('keeps').length, 0, 'a pass is never a keep');
});

await ok('slice: a setlist duplicate and a shelf import are NOT new keep lines (two-ledger rule)', () => {
  reset();
  const a = boot();
  a.call('addFavorite', rec(44));
  a.call('duplicateFavorite', a.get().favorites[0].id);
  a.call('importShelf', { favorites: [rec(55)], keeps: [rec(66)] });
  assert.deepStrictEqual(lines('keeps').map((l) => JSON.parse(l).seed), [44]);
});

await ok('wiring: X is bound in App.jsx and documented on the help line', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..');
  const app = readFileSync(join(src, 'App.jsx'), 'utf8');
  assert.match(app, /'x':\s*\(\)\s*=>\s*piped\(\{\s*type:\s*A\.ADD_PASS/);
  const help = readFileSync(join(src, 'data/helpCopy.js'), 'utf8');
  assert.match(help, /key: 'X', desc: 'Pass/);
  assert.match(help, /key: 'J', desc: 'Keep/);
});

console.log(`tasteLedger selfcheck: ${passed} ok`);
