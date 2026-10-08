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
const { createDavisSlice, sanitizeFavorite, FAVORITES_KEY, KEEPS_KEY, captureFavorite, sanitizeCast, FAVORITE_CAST_MAX } = await import('./slices/davisSlice.js');
const { keepsFromKeeps } = await import('./hitsExport.js');

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

// #996 — keeps: K keeps without the star; F implies a keep; un-favoriting
// leaves the keep. Same record shape, own storage key.
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
};
mem.delete(FAVORITES_KEY);
mem.delete(KEEPS_KEY);
{
  const c = boot();
  assert.deepStrictEqual(c.get().keeps, [], 'starts empty');
  c.call('addKeep', fav(101));
  assert.strictEqual(c.get().keeps.length, 1, 'K keeps the plate');
  assert.strictEqual(c.get().favorites.length, 0, 'no star from K');
  // F implies a keep
  c.call('addFavorite', fav(102));
  assert.strictEqual(c.get().favorites.length, 1, 'F stars');
  assert.strictEqual(c.get().keeps.length, 2, 'F also keeps');
  assert.strictEqual(c.get().keeps[1].seed, 102, 'the implied keep is the same plate');
  // un-favoriting leaves the keep
  const fid = c.get().favorites[0].id;
  c.call('removeFavorite', fid);
  assert.strictEqual(c.get().favorites.length, 0, 'star gone');
  assert.strictEqual(c.get().keeps.length, 2, 'keep survives un-favorite');
  // reload: keeps persist like favorites
  const r = boot();
  assert.deepStrictEqual(r.get().keeps.map((k) => k.seed), [101, 102], 'keeps intact after a reload');
}

// #996 — the export ledger: favorites as a subset of keeps
{
  const keeps = [fav(1), fav(2)];
  const favorites = [fav(2), fav(9)]; // 9: legacy favorite, no keep row
  const rows = keepsFromKeeps(keeps, favorites);
  assert.deepStrictEqual(rows.map((r) => r.seed), [1, 2, 9], 'deduped by seed; legacy favorites ride along');
  assert.deepStrictEqual(rows.map((r) => r.favorite), [false, true, true], 'favorite flags = subset of keeps');
  assert.deepStrictEqual(keepsFromKeeps([], []), [], 'empty in, empty out');
}

// #1140 — per-keep session context: audio/palette-warmth/dwell descriptors.
// In node there is no meter tap (audio honestly null) and no dwell window.
{
  const { captureKeepContext, sanitizeKeepContext, paletteWarmth, audioEnergyNow, dwellMsNow } =
    await import('../curator/keepContext.js');
  assert.strictEqual(audioEnergyNow(), null, 'no meter tap in node -> null, not 0');
  assert.strictEqual(dwellMsNow(), 0, 'no dwell window in node -> 0');
  const warm = paletteWarmth('chiaroscuro');
  assert.ok(warm == null || (warm >= 0 && warm <= 1), 'warmth is 0..1 or null');
  // unknown ids fall back to the catalog default, same as rendering — deterministic, not invented
  assert.strictEqual(paletteWarmth('no-such-palette'), paletteWarmth('praystation'));

  const live = { seed: 77, seedOffsets: { [G]: 5 }, layoutParams: { mode: 'grid' }, enabledAssets: {} };
  const f = captureFavorite(live, 'chiaroscuro');
  assert.ok(f.context && typeof f.context === 'object', 'captureFavorite records context');
  assert.strictEqual(f.context.audio, null, 'silent in node -> null');
  assert.strictEqual(f.context.dwellMs, 0, 'no dwell in node -> 0');
  if (warm != null) assert.strictEqual(f.context.paletteWarmth, warm, 'warmth is deterministic per palette');

  // sanitize round-trips context; legacy keeps (no context key) stay without it
  const kept = sanitizeFavorite({ ...f, id: 'k' });
  assert.deepStrictEqual(kept.context, f.context, 'context survives sanitize');
  assert.ok(!('context' in sanitizeFavorite(fav(5))), 'legacy keep: no context key, never invented');
  // hostile context normalizes, never crashes
  const hostile = sanitizeFavorite({ seed: 6, context: { audio: 'loud', paletteWarmth: 99, dwellMs: -5, extra: 1 } });
  assert.strictEqual(hostile.context.audio, null, 'non-numeric audio -> null');
  assert.strictEqual(hostile.context.paletteWarmth, 1, 'warmth clamps to 0..1');
  assert.strictEqual(hostile.context.dwellMs, 0, 'negative dwell -> 0');
  assert.ok(!('extra' in hostile.context), 'unknown fields dropped');
  assert.strictEqual(sanitizeKeepContext(null), undefined, 'null -> undefined (key omitted)');
  assert.strictEqual(sanitizeKeepContext('junk'), undefined, 'non-object -> undefined');
}

console.log('favorites.selfcheck: OK');
