// node src/loot/lootIngest.selfcheck.mjs
// #1479 slice 6 — SVGs from the loot folder into the asset pool, through the app's REAL ingest rules (hostile markup,
// nesting, the tag allow-list, the 48 KB cap, the 32-slot pool) and a fake folder of genuinely weird files. Nothing is
// trusted because it came from the user's own folder; nothing throws; a refused file says why and is not retried.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { takeInImages, ingestVia, MAX_SVG_BYTES } from './lootIngest.mjs';
import { emptyIndex, withRoot, applyPlan, markTaken, countItems, asPrev } from './lootIndex.mjs';
import { planScan } from './lootScan.mjs';
import { lootId, lootHint, slug, LOOT_STEM_MAX } from './lootClassify.mjs';
import { ingestIntoOverlay, OVERLAY_CAP } from '../assets/overlay.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const ROOT = '/Users/me/Loot';
const NOW = 7_000_000;
const OLD = NOW - 90_000;

const GOOD = (c) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="${c}"/></svg>`;
const enc = (s) => new TextEncoder().encode(s);

/** A fake folder + a real overlay + the real ingest. Files: rel -> Uint8Array. */
function world(files, overlay0 = []) {
  const state = { overlay: overlay0 };
  const native = {
    read: async (_root, rel) =>
      files[rel] ? { ok: true, bytes: files[rel] } : { ok: false, reason: 'unreadable: gone' },
  };
  const ingest = (svg, hint) => {
    const r = ingestIntoOverlay(svg, state.overlay, hint, { source: 'loot' });
    if (!r.ok) return { ok: false, reason: r.hint || r.error, poolFull: r.error === 'overlay full' };
    state.overlay = r.overlay;
    return { ok: true, id: r.asset.id };
  };
  const entries = Object.entries(files).map(([rel, b]) => ({
    rel,
    size: b.length,
    mtimeMs: OLD,
    hash: createHash('sha256').update(rel).digest('hex'),
  }));
  const plan = planScan({ entries, prev: null, nowMs: NOW });
  const { index } = applyPlan(withRoot(emptyIndex(), ROOT), plan, { nowMs: NOW });
  return { state, native, ingest, index };
}

await ok('a good SVG becomes a pool asset with the id the index promised, off until enabled, source loot', async () => {
  const w = world({ 'images/circle.svg': enc(GOOD('#e05030')) });
  const r = await takeInImages({ native: w.native, index: w.index, ingest: w.ingest });
  assert.deepEqual(r.summary, { taken: 1, rejected: 0, poolFull: 0, unreadable: 0 });
  const [id, it] = Object.entries(r.index.items)[0];
  assert.equal(it.ingested, true);
  assert.equal(it.hold, null);
  assert.equal(it.assetId, id, 'the pool id IS the loot id (the 40-char rule)');
  assert.equal(w.state.overlay.length, 1);
  assert.equal(w.state.overlay[0].source, 'loot');
  assert.ok(w.state.overlay[0].tags.includes('loot'));
  assert.equal(r.index.log[0].outcome, 'taken-in');
});

await ok('the ids fit the pool exactly: a 100-character name still lands on its loot id', async () => {
  const long = `images/${'wing-'.repeat(20)}.svg`;
  const w = world({ [long]: enc(GOOD('#2030e0')) });
  const [id] = Object.keys(w.index.items);
  assert.ok(id.length - 'user:'.length <= 40, `${id.length}`);
  const r = await takeInImages({ native: w.native, index: w.index, ingest: w.ingest });
  assert.equal(r.index.items[id].assetId, id);
  assert.equal(lootHint(id), id.replace(/^user:/, ''));
  assert.equal(slug('x'.repeat(100), LOOT_STEM_MAX).length, LOOT_STEM_MAX);
  assert.equal(lootId('a'.repeat(100), 'abcdef').length - 5, 40);
});

await ok("weird files: each refused by the app's own rules with its reason, none thrown, none trusted", async () => {
  const files = {
    'images/hostile.svg': enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    'images/photo-inside.svg': enc(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>',
    ),
    'images/remote.svg': enc(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
    ),
    'images/foreign.svg': enc('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>'),
    'images/entity.svg': enc(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>',
    ),
    'images/png-renamed.svg': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x01]),
    'images/zero.svg': new Uint8Array(0),
    'images/text.svg': enc('this is a note, not an svg'),
    'images/huge.svg': enc(`<svg xmlns="http://www.w3.org/2000/svg">${'<path d="M0 0L10 10"/>'.repeat(4000)}</svg>`),
    'images/ok.svg': enc(GOOD('#00aa66')),
  };
  const w = world(files);
  const r = await takeInImages({ native: w.native, index: w.index, ingest: w.ingest });
  assert.equal(r.summary.taken, 1, 'only the good one');
  assert.equal(r.summary.rejected, 9);
  assert.deepEqual(
    w.state.overlay.map((a) => a.id.startsWith('user:loot_ok_')),
    [true],
  );
  const reason = (rel) => Object.values(r.index.items).find((i) => i.rel === rel).hold;
  assert.match(reason('images/hostile.svg'), /^rejected:/);
  assert.match(reason('images/png-renamed.svg'), /not text/);
  assert.equal(reason('images/zero.svg'), 'empty file');
  for (const rel of Object.keys(files).filter((k) => !k.endsWith('ok.svg')))
    assert.ok(reason(rel), `${rel} has a reason`);
  // no overlay content from a refused file ever reached the pool
  assert.ok(!JSON.stringify(w.state.overlay).includes('alert(1)'));
  assert.ok(!JSON.stringify(w.state.overlay).includes('evil.example'));
});

await ok('a refused file is not retried until its bytes change', async () => {
  const w = world({ 'images/bad.svg': enc('<svg><script/></svg>'), 'images/ok.svg': enc(GOOD('#112233')) });
  let reads = 0;
  const native = {
    read: async (...a) => {
      reads++;
      return w.native.read(...a);
    },
  };
  const first = await takeInImages({ native, index: w.index, ingest: w.ingest });
  assert.equal(reads, 2);
  const again = await takeInImages({ native, index: first.index, ingest: w.ingest });
  assert.equal(reads, 2, 'neither file is read again');
  assert.deepEqual(again.summary, { taken: 0, rejected: 0, poolFull: 0, unreadable: 0 });
  // new bytes (a `changed` row clears the hold and un-ingests) are tried again
  const [id] = Object.entries(first.index.items).find(([, i]) => i.rel === 'images/bad.svg');
  const cleared = {
    ...first.index,
    items: { ...first.index.items, [id]: { ...first.index.items[id], hold: null, ingested: false } },
  };
  const retried = await takeInImages({ native, index: cleared, ingest: w.ingest });
  assert.equal(reads, 3);
  assert.equal(retried.summary.rejected, 1);
});

await ok('the pool holds 32: the rest are indexed and held "pool full", then taken in when a slot frees', async () => {
  const files = {};
  for (let i = 0; i < OVERLAY_CAP + 5; i++)
    files[`images/m${String(i).padStart(2, '0')}.svg`] = enc(GOOD(`#${(0x100000 + i * 997).toString(16).slice(0, 6)}`));
  const w = world(files);
  const r = await takeInImages({ native: w.native, index: w.index, ingest: w.ingest });
  assert.equal(r.summary.taken, OVERLAY_CAP);
  assert.equal(r.summary.poolFull, 5);
  assert.equal(w.state.overlay.length, OVERLAY_CAP);
  assert.deepEqual(countItems(r.index), { items: 37, ok: 37, missing: 0, pending: 0, held: 5, taken: 32 });
  assert.ok(r.index.log.some((x) => x.outcome === 'pool-full' && /free a slot and rescan/.test(x.reason)));
  // a slot frees; a rescan takes the held ones in (pool full is retried, other holds are not)
  w.state.overlay = w.state.overlay.slice(0, OVERLAY_CAP - 2);
  const later = await takeInImages({ native: w.native, index: r.index, ingest: w.ingest });
  assert.equal(later.summary.taken, 2);
  assert.equal(w.state.overlay.length, OVERLAY_CAP);
  assert.equal(countItems(later.index).held, 3);
});

await ok('an unreadable file and a throwing ingest are rows, not crashes', async () => {
  const w = world({ 'images/a.svg': enc(GOOD('#aa0000')), 'images/b.svg': enc(GOOD('#00aa00')) });
  const native = {
    read: async (_r, rel) =>
      rel === 'images/a.svg' ? { ok: false, reason: 'permission denied' } : { ok: true, bytes: enc(GOOD('#00aa00')) },
  };
  const r1 = await takeInImages({ native, index: w.index, ingest: w.ingest });
  assert.equal(r1.summary.unreadable, 1);
  assert.equal(r1.summary.taken, 1);
  const r2 = await takeInImages({
    native: w.native,
    index: w.index,
    ingest: () => {
      throw new Error('store exploded');
    },
  });
  assert.equal(r2.summary.rejected, 2);
  assert.ok(r2.index.log.some((x) => /store exploded/.test(x.reason)));
});

await ok('missing files: an asset already in the pool keeps working; only the index marks it', async () => {
  const w = world({ 'images/a.svg': enc(GOOD('#aa0000')) });
  const first = await takeInImages({ native: w.native, index: w.index, ingest: w.ingest });
  const plan = planScan({ entries: [], prev: asPrev(first.index), nowMs: NOW + 5000 });
  const after = applyPlan(first.index, plan, { nowMs: NOW + 5000 });
  assert.equal(countItems(after.index).missing, 1);
  assert.equal(w.state.overlay.length, 1, 'the pool is untouched');
  const [it] = Object.values(after.index.items);
  assert.equal(it.state, 'missing');
  assert.equal(it.ingested, true, 'still recorded as taken in');
});

await ok(
  "markTaken ignores unknown ids and junk; the store adapter reads the result of the app's own action",
  async () => {
    const ix = withRoot(emptyIndex(), ROOT);
    assert.deepEqual(markTaken(ix, 'user:loot_nope_000000', { status: 'taken' }).items, {});
    const calls = [];
    const state = {
      customAssets: [],
      ingestError: null,
      ingestAsset(svg, hint, opts) {
        calls.push([hint, opts]);
        if (/bad/.test(svg)) this.ingestError = 'Asset pool is full (32)';
        else this.customAssets = [{ id: `user:${hint}` }];
      },
    };
    const ing = ingestVia(() => state);
    assert.deepEqual(ing('<svg/>', 'loot_a_aaaaaa'), { ok: true, id: 'user:loot_a_aaaaaa' });
    assert.deepEqual(calls[0], ['loot_a_aaaaaa', { source: 'loot' }]);
    assert.deepEqual(ing('bad', 'loot_b_bbbbbb'), { ok: false, reason: 'Asset pool is full (32)', poolFull: true });
  },
);

await ok("wired: images go in through the app's own action only, after every scan; the byte cap is bounded", () => {
  const row = src('../panels/pipeline/LootRow.jsx');
  assert.match(row, /await takeInImages\(\{/);
  assert.match(row, /ingestVia\(\(\) => useStore\.getState\(\)\)/);
  const mod = src('./lootIngest.mjs');
  assert.ok(
    !/customAssets\s*=|setState|\.set\(/.test(mod.replace(/ingestVia[\s\S]*$/, '')),
    'the pure part writes no state',
  );
  assert.ok(MAX_SVG_BYTES <= 1024 * 1024);
});

console.log(`lootIngest.selfcheck: ${n} checks passed`);
