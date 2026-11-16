// node src/data/lookPack.selfcheck.mjs
// #2148 step 1 (DLC Look phase, the pipeline loader): the pure install path. Pins: a .kclook preset and a kc-pack/1 of
// Looks both read; every item goes through the kc-look/1 type (unknown format refused BY NAME, a newer version refused
// plainly, unreadable layoutParams refused, cross-scope fields stripped, clamping kept); a bad item is QUARANTINED with its
// name and never installed while the good ones still are; hostile text and non-Look packs are refused, never thrown; the
// same Look is one entry (content id); installing merges (an installed Look is never overwritten), caps, and never touches
// anything but the Library; the Library read back from storage is a trust boundary; the export round-trips through the
// import; the IMPORT row's sniff sends Looks here and leaves every other kind where it was.
import assert from 'node:assert/strict';
import {
  parseLookFile,
  installLooks,
  sanitizeLookLibrary,
  lookReceipt,
  buildLookPack,
  lookId,
  sniffLookFile,
  KC_PACK_VERSION,
  MAX_PACK_ITEMS,
  LOOK_LIBRARY_MAX,
  MAX_NAME,
} from './lookPack.mjs';
import { MODE_IDS } from './layout-modes.js';
import { sniffImportKind } from '../panels/pipeline/bundleFile.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const MODE = MODE_IDS[0];
const look = (over = {}) => ({
  format: 'kc-look/1',
  mode: MODE,
  layoutParams: { count: 90, density: 55 },
  paletteId: 'sepia-plate',
  ...over,
});
const pack = (items, over = {}) => ({
  format: 'kc-pack/1',
  kind: 'looks',
  name: 'Test pack',
  author: 'M',
  version: 1,
  items,
  ...over,
});

ok('a single kc-look/1 (a .kclook file or pasted JSON) installs as one Look', () => {
  for (const input of [look(), JSON.stringify(look())]) {
    const r = parseLookFile(input);
    assert.equal(r.ok, true);
    assert.equal(r.items.length, 1);
    assert.deepEqual(r.quarantined, []);
    assert.equal(r.items[0].look.format, 'kc-look/1');
    assert.match(r.items[0].id, /^look:[0-9a-f]{16}$/);
  }
});

ok('a kc-pack/1 of Looks reads every item, with names; the name is pack metadata the type never sees', () => {
  const r = parseLookFile(
    pack([look({ name: 'Slow tide' }), look({ name: 'Hot', layoutParams: { count: 20 }, seed: 7 })]),
  );
  assert.equal(r.ok, true);
  assert.equal(r.pack, 'Test pack');
  assert.equal(r.author, 'M');
  assert.deepEqual(
    r.items.map((i) => i.name),
    ['Slow tide', 'Hot'],
  );
  for (const i of r.items) assert.ok(!('name' in i.look), 'the normalised Look carries no pack metadata');
  assert.equal(r.items[1].look.seed, 7);
});

ok('a bad item is quarantined with its NAME and the reason; the good items still install; nothing is repaired', () => {
  const r = parseLookFile(
    pack([
      look({ name: 'Good' }),
      { name: 'Alien', format: 'kc-style/1', mode: MODE },
      look({ name: 'Future', format: 'kc-look/9' }),
      look({ name: 'NoMode', mode: 'not-a-mode' }),
      look({ name: 'NoPalette', paletteId: '' }),
      look({ name: 'BadParams', layoutParams: { count: 'many' } }),
      look({ name: 'BadSeed', seed: -1 }),
      'not even an object',
      null,
    ]),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.items.map((i) => i.name),
    ['Good'],
  );
  const q = Object.fromEntries(r.quarantined.map((x) => [x.name, x.error]));
  assert.match(q.Alien, /unknown file format "kc-style\/1"/);
  assert.match(q.Future, /newer version/);
  assert.match(q.NoMode, /unknown mode/);
  assert.match(q.NoPalette, /paletteId/);
  assert.match(q.BadParams, /unreadable layoutParams/);
  assert.match(q.BadSeed, /Invalid seed/);
  assert.ok(q['item 8'] && q['item 9'], 'an unnamed item is named by its place');
  assert.equal(r.quarantined.length, 8);
});

ok('scope never crosses and out-of-range clamps: the type strips FX / voice data, the layout module clamps', () => {
  const r = parseLookFile(
    look({
      fx: [{ id: 'blur' }],
      voice: { mark: 'x' },
      layoutParams: { count: 90, fx: ['x'], __proto__: { polluted: 1 } },
    }),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.items[0].look).sort(), ['format', 'layoutParams', 'mode', 'paletteId']);
  assert.ok(!('fx' in r.items[0].look.layoutParams));
  assert.equal({}.polluted, undefined);
});

ok('hostile and non-Look input is refused, never thrown', () => {
  for (const bad of [
    '',
    '{',
    'null',
    '[]',
    '123',
    '"kc-pack/1"',
    '{"format":"kc-voice/1"}',
    '{"format":42}',
    '{"a":1}',
  ]) {
    const r = parseLookFile(bad);
    assert.equal(r.ok, false, bad);
    assert.equal(typeof r.error, 'string');
  }
  assert.match(parseLookFile({ format: 'kc-voice/1' }).error, /unknown file format "kc-voice\/1"/);
  assert.match(parseLookFile(pack([], { kind: 'styles' })).error, /installs Look packs; this pack is "styles"/);
  assert.match(parseLookFile(pack([], { format: 'kc-pack/2' })).error, /newer version/);
  assert.match(parseLookFile(pack([], { format: 'kc-pack/0' })).error, /no migration/);
  assert.match(parseLookFile(pack(null)).error, /items list/);
  assert.match(parseLookFile('x'.repeat(2 * 1024 * 1024 + 1)).error, /too large/);
  assert.equal(parseLookFile(Object.create(null)).ok, false);
});

ok('caps: a pack past MAX_PACK_ITEMS reads the first ones and quarantines the rest as one named line', () => {
  const items = Array.from({ length: MAX_PACK_ITEMS + 25 }, (_, i) =>
    look({ name: `L${i}`, layoutParams: { count: 10 + (i % 80), density: i % 100 }, seed: i }),
  );
  const r = parseLookFile(pack(items));
  assert.equal(r.items.length, MAX_PACK_ITEMS);
  assert.equal(r.quarantined.length, 1);
  assert.match(r.quarantined[0].error, /more than 200 items/);
  assert.equal(parseLookFile(pack([look({ name: 'x'.repeat(500) })])).items[0].name.length, MAX_NAME);
});

ok('the same Look is one entry: by content, whatever its name or key order; a repeat inside one file collapses', () => {
  const a = parseLookFile(look({ name: 'A' })).items[0];
  const b = parseLookFile({
    paletteId: 'sepia-plate',
    layoutParams: { density: 55, count: 90 },
    mode: MODE,
    format: 'kc-look/1',
    name: 'B',
  }).items[0];
  assert.equal(a.id, b.id);
  assert.equal(lookId(a.look), a.id);
  assert.notEqual(lookId({ ...a.look, seed: 1 }), a.id);
  assert.equal(parseLookFile(pack([look(), look({ name: 'again' })])).items.length, 1);
});

ok(
  'install merges: new Looks are added, an installed Look is never overwritten or renamed, the cap holds, input is not mutated',
  () => {
    const first = parseLookFile(pack([look({ name: 'One' }), look({ name: 'Two', layoutParams: { count: 20 } })]));
    const lib0 = [];
    const m1 = installLooks(lib0, first.items);
    assert.deepEqual([m1.added, m1.duplicates, m1.overflow], [2, 0, 0]);
    assert.equal(lib0.length, 0, 'the input list is untouched');
    const again = parseLookFile(
      pack([look({ name: 'Renamed' }), look({ name: 'Three', layoutParams: { count: 33 } })]),
    );
    const m2 = installLooks(m1.library, again.items);
    assert.deepEqual([m2.added, m2.duplicates], [1, 1]);
    assert.equal(m2.library.find((e) => e.id === first.items[0].id).name, 'One', 'the installed name stands');
    const cap = installLooks(
      m2.library,
      parseLookFile(pack([look({ layoutParams: { count: 51 } }), look({ layoutParams: { count: 52 } })])).items,
      3,
    );
    assert.deepEqual([cap.added, cap.overflow, cap.library.length], [0, 2, 3]);
    assert.equal(LOOK_LIBRARY_MAX, 200);
  },
);

ok(
  'the stored Library is a trust boundary: unreadable, duplicate and over-cap entries are dropped on the way in',
  () => {
    const good = parseLookFile(look({ name: 'G' })).items[0];
    const stored = [
      good,
      { ...good, name: 'dup' },
      { id: 'x', name: 'bad', look: { format: 'kc-look/9' } },
      { id: 'y', name: 'bad2', look: null },
      null,
      'str',
      { name: 'no look' },
    ];
    const out = sanitizeLookLibrary(stored);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, good.id);
    assert.deepEqual(sanitizeLookLibrary('nope'), []);
    assert.equal(
      sanitizeLookLibrary(Array.from({ length: 300 }, (_, i) => ({ name: `n${i}`, look: look({ seed: i }) }))).length,
      LOOK_LIBRARY_MAX,
    );
  },
);

ok('the receipt is quiet and honest: installed, already there, full, quarantined (named, capped at three)', () => {
  const r = parseLookFile(
    pack([
      look({ name: 'A' }),
      { name: 'X1', format: 'bad' },
      { name: 'X2', format: 'bad' },
      { name: 'X3', format: 'bad' },
      { name: 'X4', format: 'bad' },
    ]),
  );
  const m = installLooks([], r.items);
  const t = lookReceipt(r, m);
  assert.match(t, /^Look pack "Test pack" · 1 Look installed to Library/);
  assert.match(t, /4 items quarantined — X1: .*; X2: .*; X3: .* \(\+1 more\)$/);
  assert.equal(
    lookReceipt(parseLookFile(look()), { added: 0, duplicates: 1, overflow: 0 }),
    'Look · 0 Looks installed to Library · 1 already there',
  );
  assert.match(
    lookReceipt(parseLookFile(look()), { added: 0, duplicates: 0, overflow: 2 }),
    /2 Looks not installed — the Library is full \(200\)/,
  );
  assert.equal(lookReceipt({ ok: false, error: 'boom' }, null), 'Look import: boom');
});

ok('export is a kc-pack/1 that imports back to the same Library (round trip is a fixed point)', () => {
  const read = parseLookFile(
    pack([look({ name: 'One' }), look({ name: 'Two', seed: 99, layoutParams: { count: 33 } })]),
  );
  const lib = installLooks([], read.items).library;
  const out = buildLookPack(lib, { name: 'Mine', author: 'Matt' });
  assert.equal(out.format, `kc-pack/${KC_PACK_VERSION}`);
  assert.equal(out.kind, 'looks');
  const back = parseLookFile(JSON.stringify(out));
  assert.equal(back.ok, true);
  assert.deepEqual(back.quarantined, []);
  assert.deepEqual(back.items, lib);
  assert.deepEqual(buildLookPack(installLooks([], back.items).library, { name: 'Mine', author: 'Matt' }), out);
  assert.equal(buildLookPack([]).items.length, 0);
});

ok("the IMPORT row's sniff sends Looks here and leaves every other kind where it was", () => {
  assert.equal(sniffLookFile(look()), 'look');
  assert.equal(sniffLookFile(pack([])), 'pack');
  assert.equal(sniffLookFile({ format: 'kc-style/1' }), null);
  assert.equal(sniffLookFile([look()]), null);
  assert.equal(sniffImportKind(look()), 'looks');
  assert.equal(sniffImportKind(pack([])), 'looks');
  assert.equal(
    sniffImportKind(look({ format: 'kc-look/9' })),
    'looks',
    'a newer Look reaches the loader and is refused there, by name',
  );
  assert.equal(sniffImportKind([]), 'palettes');
  assert.equal(sniffImportKind({ swatches: [] }), 'palettes');
  assert.equal(sniffImportKind({ hits: [] }), 'hits');
  assert.equal(sniffImportKind({ format: 'kc-style/1', fx: [] }), 'unknown');
  assert.equal(sniffImportKind(null), 'unknown');
});

// ── the store: install lands in the Library only ──────────────────────
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
};
const store = await import('../state/store.js');
{
  const { useStore } = store;
  const before = useStore.getState();
  const keysBefore = Object.keys(before).filter((k) => typeof before[k] !== 'function' && k !== 'lookLibrary');
  const snap = Object.fromEntries(keysBefore.map((k) => [k, before[k]]));
  const r1 = useStore.getState().installLookFile(pack([look({ name: 'S1' }), { name: 'Bad', format: 'nope' }]));
  assert.equal(r1.merged.added, 1);
  assert.equal(r1.read.quarantined.length, 1);
  assert.equal(useStore.getState().lookLibrary.length, 1);
  const r2 = useStore.getState().installLookFile(look({ name: 'S1 again' }));
  assert.equal(r2.merged.added, 0);
  assert.equal(r2.merged.duplicates, 1);
  assert.equal(useStore.getState().lookLibrary.length, 1);
  const r3 = useStore.getState().installLookFile('not json');
  assert.equal(r3.read.ok, false);
  assert.equal(useStore.getState().lookLibrary.length, 1);
  const stored = JSON.parse(mem.get('kc:look-library:v1'));
  assert.equal(stored.length, 1, 'the Library is persisted');
  assert.equal(stored[0].name, 'S1');
  const after = useStore.getState();
  for (const k of keysBefore) assert.strictEqual(after[k], snap[k], `${k} did not move`);
  const id = useStore.getState().lookLibrary[0].id;
  useStore.getState().removeLibraryLook('nope');
  assert.equal(useStore.getState().lookLibrary.length, 1);
  useStore.getState().removeLibraryLook(id);
  assert.equal(useStore.getState().lookLibrary.length, 0);
  n++;
  console.log(
    '  [ok] store: install lands in lookLibrary only (persisted, deduped), a bad file changes nothing, no slot / scene / palette state moves, remove works',
  );
}

console.log(`lookPack.selfcheck: ${n} ok`);
process.exit(0);
