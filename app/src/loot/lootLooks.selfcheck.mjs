// node src/loot/lootLooks.selfcheck.mjs
// #2148 step 4 — Look files in the loot folder's looks/ join the Look Library through the REAL installLookFile (the same door as
// Pipeline IMPORT), against a fake folder of awkward files. Pins: .kclook / .kcpack classify as supported; they install into the
// Library ONLY (no keeps, no slots); a bad file is held with its named reason and the good ones still install; a file is read once
// (remove a Look and a rescan does not bring it back); the shelf's own .json exports are untouched and the shelf run never sees a
// Look file.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
};
const { useStore } = await import('../state/store.js');
const { takeInLookFiles, isLookFileRel } = await import('./lootLooks.mjs');
const { takeInLooks } = await import('./shelfDiskRun.mjs');
const { classify } = await import('./lootClassify.mjs');
const { emptyIndex, withRoot, applyPlan } = await import('./lootIndex.mjs');
const { planScan } = await import('./lootScan.mjs');
const { MODE_IDS } = await import('../data/layout-modes.js');

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const ROOT = '/Users/me/Loot';
const NOW = 8_000_000;
const OLD = NOW - 90_000;
const enc = (s) => new TextEncoder().encode(s);
const MODE = MODE_IDS[0];
const look = (name, over = {}) => ({
  format: 'kc-look/1',
  name,
  mode: MODE,
  layoutParams: { count: 40 },
  paletteId: 'sepia-plate',
  ...over,
});
const pack = (items) => ({ format: 'kc-pack/1', kind: 'looks', name: 'Set', author: '', version: 1, items });

function folder(files) {
  const bytes = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? enc(v) : v]));
  const native = {
    read: async (_r, rel) => (bytes[rel] ? { ok: true, bytes: bytes[rel] } : { ok: false, reason: 'gone' }),
  };
  const entries = Object.entries(bytes).map(([rel, b]) => ({
    rel,
    size: b.length,
    mtimeMs: OLD,
    hash: createHash('sha256').update(rel).update(Buffer.from(b)).digest('hex'),
  }));
  const { index } = applyPlan(withRoot(emptyIndex(), ROOT), planScan({ entries, prev: null, nowMs: NOW }), {
    nowMs: NOW,
  });
  return { native, index };
}
const S = () => useStore.getState();
const install = (text) => S().installLookFile(text);

await ok('classify: .kclook and .kcpack are supported Look files; the shelf .json stays a look too', () => {
  assert.equal(classify('looks/a.kclook').ok, true);
  assert.equal(classify('looks/a.kcpack').ok, true);
  assert.equal(classify('looks/a.json').ok, true);
  assert.equal(classify('palettes/a.kclook').ok, false, 'only looks/ takes Look files');
  assert.ok(isLookFileRel('looks/a.KCLOOK') && isLookFileRel('looks/b.kcpack') && !isLookFileRel('looks/c.json'));
});

const files = {
  'looks/one.kclook': JSON.stringify(look('Slow tide')),
  'looks/set.kcpack': JSON.stringify(
    pack([look('Hot seed', { seed: 7, layoutParams: { count: 90 } }), { name: 'Bad', format: 'nope' }]),
  ),
  'looks/broken.kclook': '{ not json',
  'looks/empty.kclook': '',
  'looks/binary.kclook': new Uint8Array([0xff, 0xfe, 0xfd]),
  'looks/nothing-good.kcpack': JSON.stringify(pack([{ name: 'X', format: 'nope' }])),
  'looks/k_0123456789abcdef.json': JSON.stringify({ not: 'a keeps export' }),
};

await ok('the folder installs the good Looks into the Library and holds the bad ones, named', async () => {
  const f = folder(files);
  const before = { keeps: S().keeps.length, stage: S().keepStage.length, lp: S().layoutParams };
  const r = await takeInLookFiles({ native: f.native, index: f.index, installLookFile: install });
  assert.equal(r.summary.files, 2, 'the single Look and the pack with one good item');
  assert.equal(r.summary.looks, 2);
  assert.deepEqual(
    S()
      .lookLibrary.map((e) => e.name)
      .sort(),
    ['Hot seed', 'Slow tide'],
  );
  assert.equal(r.summary.rejected + r.summary.unreadable, 4, 'broken, empty, binary, nothing-good');
  const items = Object.values(r.index.items);
  const heldReasons = items.filter((i) => i.hold).map((i) => `${i.rel}: ${i.hold}`);
  assert.equal(heldReasons.length, 4, heldReasons.join('\n'));
  assert.ok(heldReasons.some((h) => /broken\.kclook: not readable as a Look file/.test(h)));
  assert.ok(heldReasons.some((h) => /empty\.kclook: empty file/.test(h)));
  assert.ok(heldReasons.some((h) => /binary\.kclook: not text/.test(h)));
  assert.ok(heldReasons.some((h) => /nothing-good\.kcpack: .*quarantined/.test(h)));
  assert.equal(
    items.find((i) => i.rel === 'looks/k_0123456789abcdef.json').ingested,
    false,
    'the shelf .json is not ours',
  );
  assert.equal(S().keeps.length, before.keeps, 'no keeps made');
  assert.equal(S().keepStage.length, before.stage, 'no slots touched');
  assert.equal(S().layoutParams, before.lp, 'the scene is untouched');
});

await ok('a file is read once: remove a Look, rescan, it does not come back', async () => {
  const f = folder({ 'looks/one.kclook': files['looks/one.kclook'] });
  const a = await takeInLookFiles({ native: f.native, index: f.index, installLookFile: install });
  const id = S().lookLibrary.find((e) => e.name === 'Slow tide')?.id;
  assert.ok(id);
  S().removeLibraryLook(id);
  const b = await takeInLookFiles({ native: f.native, index: a.index, installLookFile: install });
  assert.equal(b.summary.files, 0, 'already taken: not read again');
  assert.ok(!S().lookLibrary.some((e) => e.name === 'Slow tide'), 'the removal stands');
});

await ok('the shelf run never sees a Look file (it would have held it as "not a keeps export")', async () => {
  const f = folder({ 'looks/one.kclook': files['looks/one.kclook'], 'looks/set.kcpack': files['looks/set.kcpack'] });
  const r = await takeInLooks({ backend: f.native, index: f.index, isInApp: () => false, isLoaded: () => false });
  assert.equal(r.summary.held, 0, 'nothing held by the shelf');
  assert.ok(
    Object.values(r.index.items).every((i) => !i.hold),
    'no hold put on a Look file',
  );
});

console.log(`lootLooks.selfcheck: ${n} ok`);
process.exit(0);
