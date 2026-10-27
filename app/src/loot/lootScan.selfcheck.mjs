// node src/loot/lootScan.selfcheck.mjs
// #1479 slice 1 — the loot folder's scan, on a fake filesystem: what a path is, what changed since last time, and that
// nothing is ever dropped silently or marked missing on a guess. Pure; the Rust commands and the UI are later slices.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, relSegments, slug, lootId, LOOT_SUBFOLDERS } from './lootClassify.mjs';
import { planScan, summarize, SETTLE_MS } from './lootScan.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const NOW = 1_000_000;
const OLD = NOW - 60_000; // long settled
const f = (rel, hash, over = {}) => ({ rel, size: 100, mtimeMs: OLD, hash, ...over });
const idx = (items) => ({ items });

ok('the folder contract: the subfolder is the intent; anything outside is ignored, not logged', () => {
  assert.deepEqual({ ...LOOT_SUBFOLDERS }, { images: 'image', audio: 'audio', palettes: 'palette', looks: 'look' });
  assert.equal(classify('images/a.svg').ok, true);
  assert.equal(classify('IMAGES/Deep/Nest/A.SVG').ok, true, 'case-insensitive, nested');
  assert.equal(classify('audio/loop.wav').kind, 'audio');
  assert.equal(classify('palettes/dusk.json').kind, 'palette');
  // #1591 (Keeps K3): a look JSON is a real file now — the shelf's own
  // exports live in looks/ and the scan reads them (the pin below this
  // one used to say 'looks not supported yet' for exactly this path).
  assert.equal(classify('looks/pretty.json').kind, 'look');
  assert.equal(classify('looks/pretty.json').ok, true);
  assert.equal(classify('notes/readme.txt').ignored, true);
  assert.equal(classify('readme.txt').ignored, true);
  assert.equal(classify('images').reason, 'a folder, not a file');
});

ok('what is recognised but not supported yet is reported with a reason, never guessed at', () => {
  assert.equal(classify('images/photo.png').reason, 'raster not supported yet');
  assert.equal(classify('images/photo.JPEG').reason, 'raster not supported yet');
  assert.equal(classify('looks/pretty.kclook').reason, 'looks not supported yet'); // the future format stays named + skipped (K3)
  assert.equal(classify('audio/song.flac').reason, 'not a audio file (.flac)');
  assert.equal(classify('palettes/noext').reason, 'no file extension');
  assert.equal(classify('images/a.svg.txt').ok, false);
});

ok(
  'the things that are not the artist\'s: hidden files, iCloud placeholders, system files and sync conflicts, but not names like "wing 2"',
  () => {
    assert.equal(classify('images/.DS_Store').reason, 'hidden file');
    assert.equal(classify('images/.leaf.svg.icloud').reason, 'iCloud placeholder (not downloaded)');
    assert.equal(classify('images/leaf.svg.icloud').reason, 'iCloud placeholder (not downloaded)');
    assert.equal(classify('images/.hidden/a.svg').reason, 'hidden folder');
    assert.equal(classify('images/Thumbs.db').reason, 'system file');
    assert.equal(classify("images/leaf (Matt's conflicted copy 2026-10-14).svg").reason, 'sync conflict copy');
    for (const keep of ['images/wing 2.svg', 'images/wing copy.svg', 'images/leaf (1).svg'])
      assert.equal(classify(keep).ok, true, `${keep} is the artist's`);
  },
);

ok('unsafe and unreadable names fail closed', () => {
  for (const bad of [
    '',
    null,
    undefined,
    5,
    '../x.svg',
    'images/../../etc/passwd',
    'images/a\0.svg',
    'images/�name.svg',
    'x'.repeat(600),
  ]) {
    const c = classify(bad);
    assert.equal(c.ok, false, JSON.stringify(bad));
    assert.ok(c.reason || c.ignored, 'a reason, or ignored');
  }
  assert.equal(classify('images\\win\\a.svg').ok, true, 'backslashes are separators');
  assert.deepEqual(relSegments('./images//a.svg'), ['images', 'a.svg']);
  assert.equal(relSegments('..'), null);
});

ok('ids are stable and readable: the stem and the first six of the content hash, so a rename keeps it', () => {
  assert.equal(slug('My Leaf #3!'), 'my_leaf_3');
  assert.equal(slug('日本語'), 'item');
  assert.equal(slug('a'.repeat(80)).length, 32);
  assert.equal(lootId('Leaf', 'ABCDEF0123'), 'user:loot_leaf_abcdef');
  assert.equal(lootId('Leaf', null), 'user:loot_leaf_000000');
  assert.equal(lootId('Leaf', 'abcdef0123'), lootId('LEAF', 'abcdef9999'), 'the same stem and first six: same id');
});

ok('first scan: new files are added once hashed; the hash is what it waits for', () => {
  const entries = [f('images/a.svg'), f('images/b.svg'), f('palettes/p.json')];
  const p1 = planScan({ entries, prev: null, nowMs: NOW });
  assert.deepEqual(p1.needHash.sort(), ['images/a.svg', 'images/b.svg', 'palettes/p.json']);
  assert.equal(p1.add.length, 0, 'nothing is added until it is hashed');
  const hashed = entries.map((e, i) => ({ ...e, hash: `a${i}${'0'.repeat(10)}` }));
  const p2 = planScan({ entries: hashed, prev: null, nowMs: NOW });
  assert.equal(p2.add.length, 3);
  assert.equal(p2.needHash.length, 0);
  assert.equal(p2.add[0].id, 'user:loot_a_a00000');
  assert.equal(summarize(p2).add, 3);
});

ok('a rescan hashes only what changed: same path, size and mtime is unchanged and costs nothing', () => {
  const prev = idx({
    'user:loot_a_aaaaaa': { rel: 'images/a.svg', size: 100, mtimeMs: OLD, hash: 'aaaaaa11', state: 'ok' },
  });
  const p = planScan({ entries: [f('images/a.svg'), f('images/new.svg')], prev, nowMs: NOW });
  assert.deepEqual(
    p.unchanged.map((u) => u.rel),
    ['images/a.svg'],
  );
  assert.deepEqual(p.needHash, ['images/new.svg']);
  const touched = planScan({ entries: [f('images/a.svg', undefined, { mtimeMs: OLD + 5 })], prev, nowMs: NOW });
  assert.deepEqual(touched.needHash, ['images/a.svg'], 'a new mtime must be re-hashed');
});

ok(
  'a changed file keeps its item; a rename keeps its id and updates the path; a copy is a duplicate, not a new item',
  () => {
    const prev = idx({
      'user:loot_a_aaaaaa': { rel: 'images/a.svg', size: 100, mtimeMs: OLD, hash: 'aaaaaa11', state: 'ok' },
      'user:loot_b_bbbbbb': { rel: 'images/b.svg', size: 100, mtimeMs: OLD, hash: 'bbbbbb11', state: 'ok' },
    });
    const changed = planScan({
      entries: [f('images/a.svg', 'ffff0000', { mtimeMs: OLD + 9 }), f('images/b.svg', 'bbbbbb11')],
      prev,
      nowMs: NOW,
    });
    assert.deepEqual(
      changed.changed.map((c) => [c.rel, c.id]),
      [['images/a.svg', 'user:loot_a_aaaaaa']],
    );
    const renamed = planScan({
      entries: [f('images/a.svg', 'aaaaaa11'), f('images/renamed.svg', 'bbbbbb11')],
      prev,
      nowMs: NOW,
    });
    assert.deepEqual(
      renamed.renamed.map((r) => [r.from, r.rel, r.id]),
      [['images/b.svg', 'images/renamed.svg', 'user:loot_b_bbbbbb']],
    );
    assert.equal(renamed.missing.length, 0, 'a rename is not a disappearance');
    assert.equal(renamed.add.length, 0);
    const copy = planScan({
      entries: [f('images/a.svg', 'aaaaaa11'), f('images/b.svg', 'bbbbbb11'), f('images/a copy.svg', 'aaaaaa11')],
      prev,
      nowMs: NOW,
    });
    assert.deepEqual(
      copy.dup.map((d) => [d.rel, d.of]),
      [['images/a copy.svg', 'images/a.svg']],
    );
    assert.equal(copy.add.length, 0);
  },
);

ok(
  'a changed file and a new copy of its new content, in one scan, are one item and a duplicate, whatever the names sort like',
  () => {
    const prev = idx({
      'user:loot_b_bbbbbb': { rel: 'images/b.svg', size: 100, mtimeMs: OLD, hash: 'bbbbbb11', state: 'ok' },
    });
    const p = planScan({
      entries: [f('images/b copy.svg', 'dddd0000'), f('images/b.svg', 'dddd0000', { mtimeMs: OLD + 7 })],
      prev,
      nowMs: NOW,
    });
    assert.deepEqual(
      p.changed.map((c) => c.rel),
      ['images/b.svg'],
    );
    assert.deepEqual(
      p.dup.map((d) => [d.rel, d.of]),
      [['images/b copy.svg', 'images/b.svg']],
    );
    assert.equal(p.add.length, 0, 'no second item with the same bytes');
  },
);

ok('identical new files in one scan: one is added, deterministically, the rest are duplicates', () => {
  const entries = ['images/z.svg', 'images/a.svg', 'images/m.svg'].map((r) => f(r, 'same0000'));
  const p = planScan({ entries, prev: null, nowMs: NOW });
  assert.deepEqual(
    p.add.map((a) => a.rel),
    ['images/a.svg'],
    'the first by path',
  );
  assert.deepEqual(
    p.dup.map((d) => d.rel),
    ['images/m.svg', 'images/z.svg'],
  );
  const again = planScan({ entries: entries.slice().reverse(), prev: null, nowMs: NOW });
  assert.deepEqual(again.add, p.add, 'input order does not matter');
});

ok('missing: only for a folder that could be listed, only once every hash is in, and a rename is not missing', () => {
  const prev = idx({
    'user:loot_gone_cccccc': { rel: 'images/gone.svg', size: 100, mtimeMs: OLD, hash: 'cccccc11', state: 'ok' },
  });
  const gone = planScan({ entries: [], prev, nowMs: NOW });
  assert.deepEqual(
    gone.missing.map((m) => m.id),
    ['user:loot_gone_cccccc'],
  );
  const unmounted = planScan({ entries: [], prev, nowMs: NOW, rootReachable: false });
  assert.equal(unmounted.missing.length, 0, 'an unmounted volume says "not reachable" and changes nothing');
  assert.equal(unmounted.unreachable, true);
  const pending = planScan({ entries: [f('images/maybe.svg')], prev, nowMs: NOW });
  assert.equal(pending.missing.length, 0, 'a pending hash could still be this item renamed: not decided yet');
  const already = idx({
    'user:loot_gone_cccccc': { rel: 'images/gone.svg', size: 100, mtimeMs: OLD, hash: 'cccccc11', state: 'missing' },
  });
  assert.equal(
    planScan({ entries: [], prev: already, nowMs: NOW }).missing.length,
    0,
    'already missing is not re-reported',
  );
  const back = planScan({ entries: [f('images/gone.svg', 'cccccc11')], prev: already, nowMs: NOW });
  assert.deepEqual(
    back.unchanged.length + back.changed.length + back.add.length >= 1,
    true,
    'a file that comes back is not lost',
  );
});

ok('a file still being written is skipped this scan and says so; a case collision is flagged, not merged', () => {
  const p = planScan({
    entries: [f('images/live.svg', 'h1', { mtimeMs: NOW - 300 }), f('images/Dup.svg', 'h2'), f('images/dup.svg', 'h3')],
    prev: null,
    nowMs: NOW,
  });
  assert.ok(SETTLE_MS >= 1000);
  assert.deepEqual(
    p.skipped.filter((s) => s.reason === 'still changing').map((s) => s.rel),
    ['images/live.svg'],
  );
  assert.equal(p.collisions.length, 1);
  assert.equal(p.add.length, 1, 'one of the colliding pair is taken, the other is logged');
});

ok('every file that is not added has a reason in the log, and junk entries never throw', () => {
  const entries = [
    f('images/a.png'),
    f('images/.DS_Store'),
    f('images/ok.svg', 'h1'),
    f('notes/x.txt'),
    null,
    5,
    {},
    f('audio/a.flac'),
  ];
  const p = planScan({ entries, prev: null, nowMs: NOW });
  assert.equal(p.add.length, 1);
  for (const s of p.skipped) assert.ok(typeof s.reason === 'string' && s.reason.length > 0, `${s.rel}: a reason`);
  assert.equal(
    p.skipped.length,
    4,
    'png, .DS_Store, flac, and the entry with no path (logged, not lost); the outside file is ignored',
  );
  assert.doesNotThrow(() => planScan({ entries: 'nope', prev: 7, nowMs: NaN }));
  assert.doesNotThrow(() => planScan());
});

ok('5,000 files plan in well under 200 ms', () => {
  const entries = Array.from({ length: 5000 }, (_, i) =>
    f(`images/sub${i % 20}/file${i}.svg`, `hash${String(i).padStart(8, '0')}`),
  );
  const t = performance.now();
  const p = planScan({ entries, prev: null, nowMs: NOW });
  const ms = performance.now() - t;
  assert.equal(p.add.length, 5000);
  assert.ok(ms < 200, `${ms.toFixed(0)} ms`);
});

ok('pure: no filesystem, no clock, no randomness, no store', () => {
  for (const file of ['./lootClassify.mjs', './lootScan.mjs']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(
      !/Date\.now|performance\.now|Math\.random|setTimeout|from 'node:|require\(|localStorage|\bfs\b/.test(code),
      file,
    );
    assert.ok(!/from '\.\.\/(state|composition|gl|panels)/.test(code), `${file} does not reach into the app`);
  }
});

console.log(`lootScan.selfcheck: ${n} checks passed`);
