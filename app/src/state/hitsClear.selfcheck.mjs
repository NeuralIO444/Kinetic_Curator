// node src/state/hitsClear.selfcheck.mjs
// CLEAR for the HITS row: every pill at once, behind a confirm that states the count and says the keeps stay.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confirmClearHitsMessage } from '../components/hitsCopy.mjs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) };
const { createDavisSlice, FAVORITES_KEY, KEEPS_KEY } = await import('./slices/davisSlice.js');
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

function boot() {
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = createDavisSlice(set, () => state);
  return { get: () => state, call: (name, ...a) => state[name](...a) };
}
const fav = (seed) => ({ seed, seedOffsets: {}, timestamp: '12:00:00', config: { layout: { mode: 'grid', count: 40 }, palette: { id: 'bone' } } });

ok('the confirm states the count and that the keeps stay', () => {
  assert.equal(confirmClearHitsMessage(9), 'Clear 9 hits from the setlist? Your keeps stay.');
  assert.equal(confirmClearHitsMessage(1), 'Clear 1 hit from the setlist? Your keeps stay.');
  assert.equal(confirmClearHitsMessage('junk'), 'Clear 0 hits from the setlist? Your keeps stay.');
  assert.equal(confirmClearHitsMessage(-4), 'Clear 0 hits from the setlist? Your keeps stay.');
});

ok('clearFavorites empties the row, persists it, resets the queue, and leaves the keeps alone', () => {
  const a = boot();
  for (const s of [11, 22, 33]) a.call('addFavorite', fav(s));
  assert.equal(a.get().favorites.length, 3);
  assert.ok(mem.has(KEEPS_KEY), 'every favorite implies a keep');
  const keepsBefore = mem.get(KEEPS_KEY);
  a.call('setQueueIndex', 2);
  a.call('clearFavorites');
  assert.deepEqual(a.get().favorites, []);
  assert.equal(a.get().queueIndex, 0, 'the queue goes back to the top');
  assert.deepEqual(JSON.parse(mem.get(FAVORITES_KEY)), [], 'a reload does not bring them back');
  assert.equal(mem.get(KEEPS_KEY), keepsBefore, 'the keeps ledger is the artist\'s finds: untouched');
  const b = boot();
  assert.deepEqual(b.get().favorites, [], 'a fresh boot over the same storage is empty');
});

ok('clearing an empty row is a no-op: no write, nothing changes', () => {
  const a = boot();
  const before = mem.get(FAVORITES_KEY);
  const state = a.get();
  a.call('clearFavorites');
  assert.equal(mem.get(FAVORITES_KEY), before);
  assert.deepEqual(a.get().favorites, state.favorites);
});

ok('wired: the action, the reducer, the bus, and a confirmed button in the tray', () => {
  assert.match(src('./actions.js'), /CLEAR_FAVORITES\s+=\s+'CLEAR_FAVORITES'/);
  assert.match(src('./applyAction.js'), /case A\.CLEAR_FAVORITES: return store\.clearFavorites\(\)/);
  assert.match(src('../composition/wireEventBus.js'), /fav\.action === 'clear'\) return dispatch\(\{ type: A\.CLEAR_FAVORITES \}\)/);
  const tray = src('../components/FavoritesTray.jsx');
  assert.match(tray, /window\.confirm\(confirmClearHitsMessage\(favorites\.length\)\)/, 'a confirm that states the count');
  assert.match(tray, /emit\(Events\.DAVIS_FAVORITE, \{ action: 'clear' \}\)/);
  assert.ok(tray.indexOf("favorites-tray-empty") < tray.indexOf('favorites-tray-clear'), 'the empty row has no button: it is only in the populated row');
});

console.log(`hitsClear.selfcheck: ${n} checks passed`);
