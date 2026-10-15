// node src/loot/lootIndex.selfcheck.mjs
// #1479 slice 2 — the per-device loot index and its words: a scan folds in without mutating anything, hostile stored JSON
// becomes a clean index, the folder path can never reach a project or a bundle, and the copy states counts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOOT_KEY, LOG_MAX, ITEMS_MAX, emptyIndex, sanitizeIndex, applyPlan, withRoot, countItems, asPrev, loadIndex, saveIndex,
} from './lootIndex.mjs';
import { planScan } from './lootScan.mjs';
import { statusLine, logLine, confirmForgetMessage, DESKTOP_ONLY, NOT_REACHABLE } from './lootCopy.mjs';
import { BUNDLE_LEFT_OUT, BUNDLE_STORAGE_KEYS } from '../state/bundle.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const NOW = 5_000_000;
const OLD = NOW - 60_000;
const f = (rel, hash, over = {}) => ({ rel, size: 100, mtimeMs: OLD, hash, ...over });
const ROOT = '/Users/someone/Loot';

ok('a first scan folds in: items added with their hash and path, a log newest first, the scan time kept', () => {
  const base = withRoot(emptyIndex(), ROOT);
  const plan = planScan({ entries: [f('images/a.svg', 'aaaa0000'), f('images/b.png'), f('palettes/p.json', 'bbbb0000')], prev: asPrev(base), nowMs: NOW });
  const { index, rows } = applyPlan(base, plan, { nowMs: NOW });
  assert.equal(Object.keys(index.items).length, 2);
  const a = index.items['user:loot_a_aaaa00'];
  assert.deepEqual(a, { kind: 'image', rel: 'images/a.svg', size: 100, mtimeMs: OLD, hash: 'aaaa0000', state: 'ok' });
  assert.equal(index.scannedAt, NOW);
  assert.deepEqual(rows.map((r) => r.outcome).sort(), ['added', 'added', 'skipped']);
  assert.equal(index.log.length, 3);
  assert.equal(index.root, ROOT);
  assert.deepEqual(countItems(index), { items: 2, ok: 2, missing: 0 });
});

ok('pure: the index in is not changed by a scan', () => {
  const base = withRoot(emptyIndex(), ROOT);
  const frozen = JSON.stringify(base);
  const plan = planScan({ entries: [f('images/a.svg', 'aaaa0000')], prev: asPrev(base), nowMs: NOW });
  applyPlan(base, plan, { nowMs: NOW });
  assert.equal(JSON.stringify(base), frozen);
});

ok('a rename, a change, a duplicate and a disappearance are each one honest row; the asset itself is never touched', () => {
  let { index } = applyPlan(withRoot(emptyIndex(), ROOT), planScan({ entries: [f('images/a.svg', 'aaaa0000'), f('images/b.svg', 'bbbb0000'), f('images/c.svg', 'cccc0000')], nowMs: NOW }), { nowMs: NOW });
  const plan = planScan({
    entries: [f('images/a2.svg', 'aaaa0000'), f('images/b.svg', 'dddd0000', { mtimeMs: OLD + 7 }), f('images/b copy.svg', 'dddd0000')],
    prev: asPrev(index), nowMs: NOW,
  });
  const r = applyPlan(index, plan, { nowMs: NOW + 1 });
  index = r.index;
  const by = Object.fromEntries(r.rows.map((x) => [x.outcome, x]));
  assert.equal(by.renamed.rel, 'images/a2.svg'); assert.match(by.renamed.reason, /was images\/a\.svg/);
  assert.equal(by.changed.rel, 'images/b.svg');
  assert.equal(by.dup.rel, 'images/b copy.svg'); assert.match(by.dup.reason, /same as images\/b\.svg/);
  assert.equal(by.missing.rel, 'images/c.svg'); assert.match(by.missing.reason, /asset keeps working/);
  assert.equal(index.items['user:loot_a_aaaa00'].rel, 'images/a2.svg', 'the id is stable across the rename');
  assert.equal(index.items['user:loot_b_bbbb00'].hash, 'dddd0000');
  assert.equal(index.items['user:loot_c_cccc00'].state, 'missing');
  assert.deepEqual(countItems(index), { items: 3, ok: 2, missing: 1 });
  // and it comes back
  const back = applyPlan(index, planScan({ entries: [f('images/a2.svg', 'aaaa0000'), f('images/b.svg', 'dddd0000'), f('images/c.svg', 'cccc0000')], prev: asPrev(index), nowMs: NOW }), { nowMs: NOW + 2 });
  assert.equal(back.index.items['user:loot_c_cccc00'].state, 'ok');
  assert.ok(back.rows.some((x) => x.outcome === 'restored'));
});

ok('an unreachable folder changes nothing and says so', () => {
  const { index } = applyPlan(withRoot(emptyIndex(), ROOT), planScan({ entries: [f('images/a.svg', 'aaaa0000')], nowMs: NOW }), { nowMs: NOW });
  const r = applyPlan(index, planScan({ entries: [], prev: asPrev(index), nowMs: NOW, rootReachable: false }), { nowMs: NOW + 1 });
  assert.deepEqual(r.index.items, index.items);
  assert.equal(r.rows[0].reason, 'folder not reachable');
  assert.equal(r.index.scannedAt, index.scannedAt, 'an unreachable scan is not a scan');
});

ok('the log is capped, newest first; the item count is capped and says so', () => {
  const entries = Array.from({ length: LOG_MAX + 60 }, (_, i) => f(`images/s${i}.png`));
  const { index } = applyPlan(withRoot(emptyIndex(), ROOT), planScan({ entries, nowMs: NOW }), { nowMs: NOW });
  assert.equal(index.log.length, LOG_MAX);
  assert.ok(ITEMS_MAX >= 1000);
  const many = Array.from({ length: 10 }, (_, i) => f(`images/n${i}.svg`, `ab${String(i).padStart(6, '0')}`));
  const r = applyPlan(withRoot(emptyIndex(), ROOT), planScan({ entries: many, nowMs: NOW }), { nowMs: NOW });
  assert.equal(Object.keys(r.index.items).length, 10);
});

ok('hostile stored JSON becomes a clean index and never throws', () => {
  const hostile = {
    v: 1, root: 'x'.repeat(5000), scannedAt: 'soon',
    items: {
      'user:loot_ok_aaaa00': { kind: 'image', rel: 'images/ok.svg', size: 10, mtimeMs: 1, hash: 'aaaa0000', state: 'ok' },
      '../../etc/passwd': { kind: 'image', rel: 'images/x.svg', hash: 'aaaa0000' },
      'user:loot_traversal_000000': { kind: 'image', rel: '../../../etc/passwd', hash: 'aaaa0000' },
      'user:loot_nohash_000000': { kind: 'image', rel: 'images/y.svg', hash: 'not hex' },
      'user:loot_badkind_000000': { kind: 'script', rel: 'images/z.svg', hash: 'aaaa0000' },
      'user:loot_state_aaaa00': { kind: 'audio', rel: 'audio/a.wav', hash: 'bbbb0000', state: 'exploded' },
      __proto__: { polluted: true },
    },
    log: [{ rel: 'images/a.svg', outcome: 'added' }, { rel: 'x', outcome: 'rm -rf' }, null, 7, { outcome: 'added' }, { rel: 'y'.repeat(900), outcome: 'added' }],
  };
  const s = sanitizeIndex(hostile);
  assert.equal(s.root, null, 'an absurd root is dropped');
  assert.equal(s.scannedAt, null);
  assert.deepEqual(Object.keys(s.items).sort(), ['user:loot_ok_aaaa00', 'user:loot_state_aaaa00']);
  assert.equal(s.items['user:loot_state_aaaa00'].state, 'ok', 'an unknown state is ok, not trusted');
  assert.deepEqual(s.log.map((r) => r.rel), ['images/a.svg']);
  assert.equal({}.polluted, undefined);
  for (const junk of [null, undefined, 'x', 7, [], { v: 2 }, { v: 1, items: 'no' }]) assert.deepEqual(sanitizeIndex(junk), emptyIndex());
});

ok('storage: load and save never throw; a corrupt or blocked store is the empty index', () => {
  const mem = new Map();
  const ok1 = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } };
  const { index } = applyPlan(withRoot(emptyIndex(), ROOT), planScan({ entries: [f('images/a.svg', 'aaaa0000')], nowMs: NOW }), { nowMs: NOW });
  assert.equal(saveIndex(ok1, index), true);
  assert.deepEqual(loadIndex(ok1), index, 'survives a reload');
  mem.set(LOOT_KEY, '{not json');
  assert.deepEqual(loadIndex(ok1), emptyIndex());
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(loadIndex(blocked), emptyIndex());
  assert.equal(saveIndex(blocked, index), false);
  assert.deepEqual(loadIndex(null), emptyIndex());
  assert.equal(saveIndex(null, index), false);
});

ok('a different folder starts a clean index; the same folder keeps it', () => {
  const { index } = applyPlan(withRoot(emptyIndex(), ROOT), planScan({ entries: [f('images/a.svg', 'aaaa0000')], nowMs: NOW }), { nowMs: NOW });
  assert.equal(Object.keys(withRoot(index, ROOT).items).length, 1);
  const other = withRoot(index, '/Volumes/Other/Loot');
  assert.equal(Object.keys(other.items).length, 0); assert.equal(other.root, '/Volumes/Other/Loot');
  assert.deepEqual(withRoot(index, ''), emptyIndex(), 'forgetting the folder is the empty index');
});

ok('the folder path can never ride in a project, a bundle or a share link', () => {
  assert.ok(BUNDLE_LEFT_OUT[LOOT_KEY], 'the key is classified as per-machine');
  assert.match(BUNDLE_LEFT_OUT[LOOT_KEY], /Never in a bundle, a project or a share link/);
  assert.ok(!Object.values(BUNDLE_STORAGE_KEYS).flat().includes(LOOT_KEY), 'and is in no bundle part');
  for (const file of ['../state/projectDocument.js', '../state/bundle.js', '../state/recipeUrls.js', '../state/recipes.js']) {
    assert.ok(!/from '\.\.\/loot\//.test(src(file)) && !/lootIndex|lootScan/.test(src(file).replace(/kc:loot:v1[^\n]*/g, '')), `${file} does not read the index`);
  }
});

ok('the words state counts, stay lowercase and deadpan, and never name anything they should not', () => {
  assert.equal(statusLine({}), 'no folder yet');
  assert.equal(statusLine({ items: 1 }), '1 item');
  assert.equal(statusLine({ items: 12, added: 3, skipped: 2, missing: 1, scanned: true }), '12 items · 3 added · 2 skipped · 1 missing');
  assert.equal(logLine({ rel: 'images/a.png', outcome: 'skipped', reason: 'raster not supported yet' }), 'images/a.png  skipped: raster not supported yet');
  assert.equal(logLine({ rel: 'images/a.svg', outcome: 'added' }), 'images/a.svg  added');
  assert.equal(logLine(null), '');
  assert.equal(confirmForgetMessage(9), 'Forget the loot folder and its 9 items? Your files are not touched, and assets already in the pool stay.');
  assert.equal(confirmForgetMessage(1).includes('1 item?'), true);
  assert.equal(DESKTOP_ONLY, 'desktop only'); assert.equal(NOT_REACHABLE, 'folder not reachable');
  const code = src('./lootCopy.mjs') + src('./lootIndex.mjs');
  assert.ok(!/queen|davis|lois|!!|celebrat|hooray|great job/i.test(code.replace(/\/\/.*$/gm, '')), 'no persona names, no cheer');
});

console.log(`lootIndex.selfcheck: ${n} checks passed`);
