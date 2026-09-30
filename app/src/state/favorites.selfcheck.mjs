// node src/state/favorites.selfcheck.mjs
// #568 — favorites survive a reload (curate -> reload -> intact), and what
// comes back out of localStorage is sanitized (it is a trust boundary).
import assert from 'node:assert';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
};
const { SEED_OFFSET_GROUPS } = await import('../engine/kernel/rng.js');
const G = SEED_OFFSET_GROUPS[0];
const { createDavisSlice, sanitizeFavorite, FAVORITES_KEY, captureFavorite, sanitizeCast, FAVORITE_CAST_MAX } = await import('./slices/davisSlice.js');

/** A tiny zustand stand-in: one slice, real set semantics. */
function boot() {
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = createDavisSlice(set, () => state);
  return { api: state, get: () => state, call: (name, ...a) => state[name](...a) };
}

const fav = (seed) => ({
  seed, seedOffsets: { [G]: 3 }, timestamp: '12:00:00',
  config: { layout: { mode: 'grid', count: 40 }, palette: { id: 'bone' } },
});

// curate -> reload -> intact
{
  const a = boot();
  assert.deepStrictEqual(a.get().favorites, [], 'starts empty');
  a.call('addFavorite', fav(11));
  a.call('addFavorite', fav(22));
  a.call('addFavorite', fav(33));
  const ids = a.get().favorites.map((f) => f.id);
  a.call('reorderFavorite', ids[2], -1);
  a.call('removeFavorite', ids[0]);
  const before = a.get().favorites;
  assert.deepStrictEqual(before.map((f) => f.seed), [33, 22], 'reorder + remove applied');

  const b = boot(); // "reload": a fresh store over the same localStorage
  assert.deepStrictEqual(b.get().favorites, before, 'favorites are intact after a reload');
  assert.strictEqual(b.get().favorites[0].config.layout.mode, 'grid');
  assert.strictEqual(b.get().favorites[0].config.palette.id, 'bone');
  assert.deepStrictEqual(b.get().favorites[0].seedOffsets[G], 3, 'stream offsets ride along (#305)');
}

// what comes back is sanitized, never trusted
assert.strictEqual(sanitizeFavorite(null), null);
assert.strictEqual(sanitizeFavorite({ seed: 'NaN' }), null, 'no finite seed -> dropped');
assert.strictEqual(sanitizeFavorite({ seed: Infinity }), null);
{
  const hostile = sanitizeFavorite({
    seed: 5, id: 'x'.repeat(500), timestamp: 't'.repeat(500),
    config: { layout: { mode: '__proto__', count: 1e12, jitter: NaN }, palette: { id: 42 } },
  });
  assert.ok(hostile.id.length <= 80 && hostile.timestamp.length <= 32, 'strings are bounded');
  assert.notStrictEqual(hostile.config.layout.mode, '__proto__', 'layout is normalized like any project layout');
  assert.ok(Number.isFinite(hostile.config.layout.count) && Number.isFinite(hostile.config.layout.jitter));
  assert.strictEqual(hostile.config.palette.id, '', 'non-string palette id -> empty, never a number');
}

// corrupt / hostile storage boots empty, never throws
for (const junk of ['{not json', '"a string"', '{"a":1}', 'null', '[null, 3, {"seed":"x"}]']) {
  mem.set(FAVORITES_KEY, junk);
  assert.deepStrictEqual(boot().get().favorites, [], `junk storage boots empty: ${junk}`);
}

// the tray is bounded
mem.delete(FAVORITES_KEY);
{
  const c = boot();
  for (let i = 0; i < 230; i++) c.call('addFavorite', fav(i));
  assert.strictEqual(c.get().favorites.length, 200, 'capped at 200');
  assert.strictEqual(c.get().favorites.at(-1).seed, 229, 'newest kept');
  c.call('addFavorite', { seed: 'not-a-seed' });
  assert.strictEqual(c.get().favorites.length, 200, 'an unusable favorite is not stored');
}

// #719 — a keep records the full recipe, cast included, from ONE capture helper
{
  const live = {
    seed: 77, seedOffsets: { [G]: 5 }, layoutParams: { mode: 'grid', count: 40 },
    enabledAssets: { xsh07: true, xsh01: true, geo_hex_01: false },
  };
  const f = captureFavorite(live, 'chiaroscuro');
  assert.strictEqual(f.seed, 77);
  assert.strictEqual(f.seedOffsets[G], 5, 'offsets captured (the f hotkey used to drop them)');
  assert.deepStrictEqual(f.config.assets, ['xsh01', 'xsh07'], 'cast = enabled ids only, sorted');
  assert.strictEqual(f.config.palette.id, 'chiaroscuro');
  const kept = sanitizeFavorite({ ...f, id: 'k' });
  assert.deepStrictEqual(kept.config.assets, ['xsh01', 'xsh07'], 'cast survives sanitize');

  // cast is a trust boundary too: junk dropped, deduped, capped
  assert.deepStrictEqual(sanitizeCast(['b', 'a', 'a', 7, null, '', 'x'.repeat(81)]), ['a', 'b']);
  assert.strictEqual(sanitizeCast(Array.from({ length: 999 }, (_, i) => `id${i}`)).length, FAVORITE_CAST_MAX);
  assert.strictEqual(sanitizeCast('xsh01'), undefined, 'non-array → no cast');
  assert.ok(!('assets' in sanitizeFavorite(fav(3)).config), 'legacy keep: cast omitted, never invented');

  // recall + morph bring the cast back; a legacy keep leaves the pool alone
  const c = boot();
  c.call('recallFavorite', kept);
  assert.deepStrictEqual(c.get().enabledAssets, { xsh01: true, xsh07: true }, 'recall restores the cast');
  const before = { only: true };
  const d = boot();
  d.call('recallFavorite', sanitizeFavorite(fav(4)));
  assert.strictEqual(d.get().enabledAssets, undefined, 'legacy recall does not touch the pool');
  const m = boot();
  Object.assign(m.get(), { layoutParams: { mode: 'grid', count: 10 }, enabledAssets: before });
  m.call('morphToFavorite', kept);
  assert.deepStrictEqual(m.get().enabledAssets, { xsh01: true, xsh07: true }, 'morph swaps the cast at the press');
}

// no localStorage at all (private mode / node) still works in memory
delete globalThis.localStorage;
{
  const warn = console.warn; console.warn = () => {}; // the save-failed warning is the expected path
  const d = boot();
  d.call('addFavorite', fav(1));
  assert.strictEqual(d.get().favorites.length, 1, 'works without localStorage');
  console.warn = warn;
}

console.log('favorites.selfcheck: OK');
