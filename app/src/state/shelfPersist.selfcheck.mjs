// node src/state/shelfPersist.selfcheck.mjs
// #1642 — shelf persistence speaks: a refused save and a lossy load each produce ONE visible
// line on the shelf's own surface (shelfNotice), never only a console warning; records a
// lossy load leaves behind are quarantined under `<key>:quarantine` before any persist can
// overwrite them, and the failure line is gated to once per failure episode.
import assert from 'node:assert/strict';

const mem = new Map();
let failWrites = false;
let failReads = false;
globalThis.localStorage = {
  getItem: (k) => { if (failReads) throw new Error('storage blocked'); return mem.has(k) ? mem.get(k) : null; },
  setItem: (k, v) => { if (failWrites) throw new Error('QuotaExceededError'); mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
};

const { createDavisSlice, FAVORITES_KEY, KEEPS_KEY, STAGE_KEY, SHELF_HISTORY_KEY, SHELF_HISTORY_SHED_KEY } = await import('./slices/davisSlice.js');

function boot() {
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = createDavisSlice(set);
  return { get: () => state, call: (name, ...a) => state[name](...a) };
}
const rec = (seed) => ({ seed, timestamp: 't', config: { layout: { mode: 'grid' }, palette: { id: 'bone' } } });
const reset = () => { mem.clear(); failWrites = false; failReads = false; mem.set(STAGE_KEY, '[]'); };
// #1643 extended the blocked-crown line: the same refused write also loses
// the crown's ledger label, and both losses speak in the one notice.
const SAVE_LINE = 'the shelf did not save — storage refused the write — the keeps ledger would not save — export from PIPELINE';

// ── 1. the happy path stays silent ──
{
  reset();
  const a = boot();
  assert.equal(a.get().shelfNotice, null, 'a clean boot has nothing to report');
  a.call('addKeep', rec(101));
  assert.equal(a.get().keeps.length, 1);
  assert.ok(!(a.get().shelfNotice || '').includes('did not save'), 'a saving crown says nothing about saving');
  assert.equal(JSON.parse(mem.get(KEEPS_KEY)).length, 1, 'the crown persisted');
}

// ── 2. a blocked crown speaks — once per failure episode ──
{
  reset();
  failWrites = true;
  const a = boot();
  assert.equal(a.get().shelfNotice, null, 'boot itself lost nothing (the stage was already migrated)');
  a.call('addKeep', rec(201));
  assert.equal(a.get().keeps.length, 1, 'the crown still lands in the session');
  assert.equal(a.get().shelfNotice, SAVE_LINE, 'the refused save is a visible line, not a console warning');
  a.call('setShelfNotice', null);
  a.call('addKeep', rec(202));
  assert.equal(a.get().keeps.length, 2);
  assert.equal(a.get().shelfNotice, null, 'the same episode does not nag: no second line');
  failWrites = false;
  a.call('addKeep', rec(203));
  assert.equal(JSON.parse(mem.get(KEEPS_KEY)).length, 3, 'when storage recovers, the whole shelf persists');
  failWrites = true;
  a.call('setShelfNotice', null);
  a.call('addKeep', rec(204));
  assert.equal(a.get().shelfNotice, SAVE_LINE, 'a NEW episode speaks again');
  failWrites = false;
  a.call('addKeep', rec(205)); // a success closes the episode for the next scenario
}

// ── 3. a corrupted-record reload counts the loss and quarantines the raw ──
{
  reset();
  const raw = JSON.stringify([rec(301), { seed: 'abc' }, rec(302), 42]);
  mem.set(KEEPS_KEY, raw);
  const a = boot();
  assert.equal(a.get().keeps.length, 2, 'the readable keeps load');
  assert.equal(a.get().shelfNotice, '2 stored keeps could not be read and were left out', 'the loss is counted out loud at boot');
  const q = JSON.parse(mem.get(`${KEEPS_KEY}:quarantine`));
  assert.equal(q.raw, raw, 'the original stored string was set aside before anything overwrote it');
  a.call('addKeep', rec(303));
  assert.equal(JSON.parse(mem.get(KEEPS_KEY)).length, 3, 'the next persist writes the clean list');
  assert.equal(JSON.parse(mem.get(`${KEEPS_KEY}:quarantine`)).raw, raw, 'and the quarantined original survives it — recoverable');
}

// ── 4. an unparseable blob is named and set aside, not mistaken for an empty shelf ──
{
  reset();
  mem.set(FAVORITES_KEY, 'not json{{');
  const a = boot();
  assert.deepEqual(a.get().favorites, []);
  assert.equal(a.get().shelfNotice, 'the stored favorites could not be read — the original was set aside');
  assert.equal(JSON.parse(mem.get(`${FAVORITES_KEY}:quarantine`)).raw, 'not json{{');
}

// ── 5. a refused read boots empty but says so ──
{
  reset();
  failReads = true;
  const a = boot();
  assert.deepEqual(a.get().keeps, []);
  assert.ok((a.get().shelfNotice || '').includes('could not be read — storage refused'), 'a refused read is spoken, not silent');
  failReads = false;
}

// ── 8. #1645: the history cap counts its trims — at boot and at append, persisted, never twice ──
{
  reset();
  const stored = Array.from({ length: 1005 }, (_, i) => ({ kind: 'crown', keepId: `k${i}`, tier: 'stage', at: i + 1 }));
  mem.set(SHELF_HISTORY_KEY, JSON.stringify(stored));
  const a = boot();
  assert.equal(a.get().shelfHistory.length, 1000, 'the cap still holds at boot');
  assert.equal(a.get().shelfHistoryShed, 5, 'the five the cap shed at load are counted');
  assert.equal(JSON.parse(mem.get(SHELF_HISTORY_SHED_KEY)), 5, 'the merged total persisted');
  assert.equal(JSON.parse(mem.get(SHELF_HISTORY_KEY)).length, 1000, 'the boot wrote the history back capped');
  assert.ok(!(a.get().shelfNotice || '').includes('could not be read'), 'cap trims are not misreported as unreadable records');
  const b = boot();
  assert.equal(b.get().shelfHistoryShed, 5, 'a reload reads the counter — the same trims never count twice');
  // fill the stage (16 slots) so the next keep lands in the collection —
  // a staged keep can never be exported from under the artist.
  for (let i = 0; i < 17; i++) b.call('addKeep', rec(1000 + i));
  const collectionKeep = b.get().keeps.find((k) => !b.get().keepStage.includes(k.id));
  assert.ok(collectionKeep, 'the seventeenth keep landed in the collection');
  const shedBefore = b.get().shelfHistoryShed;
  b.call('shelfExported', collectionKeep.id, { id: collectionKeep.id, rel: 'keeps/x.json', label: 'x' });
  assert.equal(b.get().shelfHistory.length, 1000, 'the cap holds after the append');
  assert.equal(b.get().shelfHistoryShed, shedBefore + 1, 'the append-time trim incremented the counter with the update');
  assert.equal(JSON.parse(mem.get(SHELF_HISTORY_SHED_KEY)), shedBefore + 1, 'and persisted it');
}

console.log('shelfPersist.selfcheck: ok (#1642)');
