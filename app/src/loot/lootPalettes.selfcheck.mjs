// node src/loot/lootPalettes.selfcheck.mjs
// #1479 slice 7 — palette files from the loot folder into the user palette library, through the app's REAL sanitiser and
// the REAL library slice, against a fake folder of awkward files. A loot palette can never replace one you made.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
};
const { createPaletteLibrarySlice, USER_PALETTES_KEY } = await import('../state/slices/paletteLibrarySlice.js');
const {
  takeInPalettes,
  palettesFromText,
  entriesOf,
  lootPalette,
  MAX_PALETTES_PER_FILE,
  MAX_SWATCHES,
  MAX_PALETTE_BYTES,
} = await import('./lootPalettes.mjs');
const { emptyIndex, withRoot, applyPlan, countItems } = await import('./lootIndex.mjs');
const { planScan } = await import('./lootScan.mjs');

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
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

/** The real library slice as a tiny store. */
function library(initial = []) {
  mem.clear();
  let state;
  const set = (p) => {
    state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
  };
  state = { ...createPaletteLibrarySlice(set, () => state), userPalettes: initial };
  return { get: () => state, import: (l) => state.importUserPalettes(l) };
}
function folder(files) {
  const native = {
    read: async (_r, rel) => (files[rel] ? { ok: true, bytes: files[rel] } : { ok: false, reason: 'gone' }),
  };
  const entries = Object.entries(files).map(([rel, b]) => ({
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
const DUSK = { id: 'dusk', name: 'Dusk', swatches: ['#1b2a4a', '#e05030', '#f2e6d0'], bg: '#0a0a14' };

await ok('a single palette, a list, and { palettes: [...] } all read; ids are namespaced `loot-`', async () => {
  assert.equal(entriesOf(DUSK).length, 1);
  assert.equal(entriesOf([DUSK, { ...DUSK, id: 'b' }]).length, 2);
  assert.equal(entriesOf({ palettes: [DUSK] }).length, 1);
  assert.equal(entriesOf({ userPalettes: [DUSK, DUSK] }).length, 2, "the app's own export shape");
  assert.equal(entriesOf(null).length, 0);
  assert.equal(entriesOf('x').length, 0);
  assert.equal(entriesOf(7).length, 0);
  const p = lootPalette(DUSK, 'dusk.json');
  assert.equal(p.id, 'loot-dusk');
  assert.equal(p.name, 'Dusk');
  assert.deepEqual(p.swatches, ['#1b2a4a', '#e05030', '#f2e6d0']);
  assert.equal(lootPalette({ swatches: ['#fff'] }, 'my-file').id, 'loot-my_file_1', 'no id, no name: the file name');
  assert.equal(lootPalette({ name: 'Warm Tide', swatches: ['#fff'] }, 'x').id, 'loot-warm_tide');
});

await ok('it goes into the real library, and a loot palette can never replace one you made or a built-in', async () => {
  const mine = {
    id: 'dusk',
    name: 'MY Dusk',
    era: 'user palette',
    bg: '#000000',
    ink: '#ffffff',
    swatches: ['#112233'],
    user: true,
  };
  const lib = library([mine]);
  const f = folder({
    'palettes/dusk.json': enc(JSON.stringify(DUSK)),
    'palettes/praystation.json': enc(JSON.stringify({ id: 'praystation', name: 'Imposter', swatches: ['#ff0000'] })),
  });
  const r = await takeInPalettes({ native: f.native, index: f.index, importPalettes: lib.import });
  assert.equal(r.summary.palettes, 2);
  const ids = lib
    .get()
    .userPalettes.map((p) => p.id)
    .sort();
  assert.deepEqual(ids, ['dusk', 'loot-dusk', 'loot-praystation']);
  assert.equal(lib.get().userPalettes.find((p) => p.id === 'dusk').name, 'MY Dusk', 'yours is untouched');
  assert.ok(r.index.log.some((x) => x.outcome === 'taken-in' && /1 palette in your library: Dusk/.test(x.reason)));
});

await ok('the same file again is the same palette; an edited file updates the palette it made', async () => {
  const lib = library();
  let f = folder({ 'palettes/dusk.json': enc(JSON.stringify(DUSK)) });
  await takeInPalettes({ native: f.native, index: f.index, importPalettes: lib.import });
  f = folder({ 'palettes/dusk.json': enc(JSON.stringify(DUSK)) });
  await takeInPalettes({ native: f.native, index: f.index, importPalettes: lib.import });
  assert.equal(lib.get().userPalettes.length, 1, 'no duplicate');
  f = folder({ 'palettes/dusk.json': enc(JSON.stringify({ ...DUSK, swatches: ['#000000', '#ffffff'] })) });
  await takeInPalettes({ native: f.native, index: f.index, importPalettes: lib.import });
  assert.equal(lib.get().userPalettes.length, 1);
  assert.deepEqual(lib.get().userPalettes[0].swatches, ['#000000', '#ffffff']);
});

await ok(
  'awkward files: each refused with its reason, none thrown, and unusable entries are skipped and counted',
  async () => {
    const many = Array.from({ length: MAX_PALETTES_PER_FILE + 20 }, (_, i) => ({ id: `p${i}`, swatches: ['#123456'] }));
    const files = {
      'palettes/broken.json': enc('{ this is not json'),
      'palettes/empty.json': new Uint8Array(0),
      'palettes/array-of-junk.json': enc('[1, "x", null, {"swatches": []}, {"swatches": ["nope", 5]}]'),
      'palettes/not-an-object.json': enc('"just a string"'),
      'palettes/binary.json': new Uint8Array([0xff, 0xfe, 0x00, 0xfd]),
      'palettes/huge.json': enc(JSON.stringify({ swatches: ['#aaaaaa'], pad: 'x'.repeat(MAX_PALETTE_BYTES + 10) })),
      'palettes/mixed.json': enc(
        JSON.stringify([DUSK, { name: 'bad', swatches: ['zzz'] }, { id: 'ok2', name: 'Two', swatches: ['#00ff00'] }]),
      ),
      'palettes/many.json': enc(JSON.stringify(many)),
      'palettes/proto.json': enc('{"__proto__": {"polluted": true}, "swatches": ["#abcdef"], "id": "__proto__"}'),
    };
    const lib = library();
    const f = folder(files);
    const r = await takeInPalettes({ native: f.native, index: f.index, importPalettes: lib.import });
    const hold = (rel) => Object.values(r.index.items).find((i) => i.rel === rel).hold;
    assert.equal(hold('palettes/broken.json'), 'not valid JSON');
    assert.equal(hold('palettes/empty.json'), 'empty file');
    assert.equal(hold('palettes/array-of-junk.json'), 'no usable swatches in file');
    assert.equal(hold('palettes/not-an-object.json'), 'no palettes in file');
    assert.equal(hold('palettes/binary.json'), 'not text');
    assert.equal(hold('palettes/huge.json'), 'too big for a palette file');
    const mixed = r.index.log.find((x) => x.rel === 'palettes/mixed.json');
    assert.equal(mixed.outcome, 'taken-in');
    assert.match(mixed.reason, /2 palettes in your library: Dusk, Two.*1 unusable skipped/);
    assert.equal(
      lib.get().userPalettes.filter((p) => /^loot-p\d+$/.test(p.id)).length,
      MAX_PALETTES_PER_FILE,
      'a file is capped',
    );
    assert.equal({}.polluted, undefined, 'no prototype pollution');
    assert.ok(
      lib.get().userPalettes.every((p) => /^loot-/.test(p.id)),
      'every id is namespaced',
    );
    assert.ok(lib.get().userPalettes.every((p) => p.swatches.length <= MAX_SWATCHES));
  },
);

await ok('a retained file is not read again; a throwing import is a row, not a crash', async () => {
  const lib = library();
  const f = folder({ 'palettes/a.json': enc(JSON.stringify(DUSK)) });
  let reads = 0;
  const native = {
    read: async (...a) => {
      reads += 1;
      return f.native.read(...a);
    },
  };
  const first = await takeInPalettes({ native, index: f.index, importPalettes: lib.import });
  await takeInPalettes({ native, index: first.index, importPalettes: lib.import });
  assert.equal(reads, 1);
  const boom = await takeInPalettes({
    native: f.native,
    index: f.index,
    importPalettes: () => {
      throw new Error('disk full');
    },
  });
  assert.equal(boom.summary.rejected, 1);
  assert.match(Object.values(boom.index.items)[0].hold, /refused: disk full/);
  assert.equal(countItems(boom.index).held, 1);
});

await ok('swatches are capped and the library stays in the instrument: nothing in a project', () => {
  const p = lootPalette(
    { id: 'long', swatches: Array.from({ length: 500 }, (_, i) => `#${(i % 4096).toString(16).padStart(6, '0')}`) },
    'x',
  );
  assert.equal(p.swatches.length, MAX_SWATCHES);
  const code = src('./lootPalettes.mjs');
  assert.ok(!/projectDocument|customAssets|layoutParams/.test(code), 'palettes join the library, never the project');
  assert.match(
    src('../panels/pipeline/LootRow.jsx'),
    /importPalettes: \(list\) => useStore\.getState\(\)\.importUserPalettes\(list\)/,
  );
  assert.ok(USER_PALETTES_KEY === 'kc:user-palettes:v1');
});

console.log(`lootPalettes.selfcheck: ${n} checks passed`);
