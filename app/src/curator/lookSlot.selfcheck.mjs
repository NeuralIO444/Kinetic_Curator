// node src/curator/lookSlot.selfcheck.mjs
// #2148 step 3 — loading a Library Look into a stage slot. Pins: a seeded Look keeps its seed, a seedless one is stamped from the
// session and says so; the keep carries mode inside its layout params; LOAD fills a free slot or replaces a chosen one in place;
// the performing slot is pinned and a full stage refuses out loud, in both cases with NOTHING added; the Library is untouched;
// loading never applies the Look to the scene (layoutParams / palette unchanged).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lookSeedFor, lookToKeepRecord, planLookLoad, slotChoices, lookLoadedLine } from './lookSlot.mjs';
import { MODE_IDS } from '../data/layout-modes.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const MODE = MODE_IDS[0];
const entry = (over = {}) => ({
  id: 'lk1',
  name: 'Dusk',
  look: { mode: MODE, layoutParams: { count: 40 }, paletteId: 'sepia-plate', ...over },
});

await ok('seed: a seeded Look keeps it, a seedless one is stamped from the session', () => {
  assert.deepEqual(lookSeedFor({ seed: 7 }, 99), { seed: 7, stamped: false });
  assert.deepEqual(lookSeedFor({}, 99), { seed: 99, stamped: true });
  assert.equal(lookToKeepRecord(entry({ seed: 7 }), { seed: 99, at: 1, id: 'k' }).seed, 7);
  assert.equal(lookToKeepRecord(entry(), { seed: 99, at: 1, id: 'k' }).seed, 99);
});

await ok('record: mode rides inside the layout params; palette id kept; nothing else', () => {
  const r = lookToKeepRecord(entry(), { seed: 1, at: 5, id: 'k' });
  assert.deepEqual(r.config, { layout: { count: 40, mode: MODE }, palette: { id: 'sepia-plate' } });
  assert.deepEqual(Object.keys(r).sort(), ['config', 'id', 'keptAt', 'seed', 'timestamp']);
});

const keep = (id) => ({ id, seed: 1, config: { layout: {}, palette: { id: '' } } });
const stageOf = (n) => Array.from({ length: n }, (_, i) => `s${i}`);
const shelf = (stage) => stage.map(keep);

await ok('plan: a free slot appends; a full stage refuses with the shelf line and changes nothing', () => {
  const st = stageOf(3);
  const ks = [...shelf(st), keep('new')];
  const p = planLookLoad(ks, st, 'new', null);
  assert.deepEqual(p, { ok: true, stageIds: [...st, 'new'], replaced: false });
  const full = stageOf(16);
  const r = planLookLoad([...shelf(full), keep('new')], full, 'new', null);
  assert.equal(r.ok, false);
  assert.match(r.copy, /stage full/);
  assert.deepEqual(r.stageIds, full);
});

await ok('plan: replace takes the chosen slot in place; the performing slot is pinned', () => {
  const st = stageOf(4);
  const ks = [...shelf(st), keep('new')];
  const p = planLookLoad(ks, st, 'new', 's2');
  assert.deepEqual(p.stageIds, ['s0', 's1', 'new', 's3']);
  assert.equal(p.replaced, true);
  const pinned = planLookLoad(ks, st, 'new', 's1', { performingKeepId: 's1' });
  assert.equal(pinned.ok, false);
  assert.match(pinned.copy, /deck/);
  assert.equal(planLookLoad(ks, st, 'new', 'ghost').ok, false, 'an empty slot is refused');
});

await ok('picker: numbered slots in menu order, the performing one marked, room reported', () => {
  const st = stageOf(3);
  const c = slotChoices(shelf(st), st, { performingKeepId: 's1', labelOf: (k) => `L-${k.id}` });
  assert.deepEqual(
    c.slots.map((s) => [s.n, s.outId, s.performing, s.label]),
    [
      [1, 's0', false, 'L-s0'],
      [2, 's1', true, 'L-s1'],
      [3, 's2', false, 'L-s2'],
    ],
  );
  assert.equal(c.canAddNew, true);
  const f = stageOf(16);
  assert.equal(slotChoices(shelf(f), f).canAddNew, false);
});

await ok('line: says what happened, including a stamped seed', () => {
  assert.match(lookLoadedLine('Dusk', { stamped: true, replaced: false }), /Dusk loaded.*free slot.*seed stamped/);
  assert.doesNotMatch(lookLoadedLine('Dusk', { stamped: false, replaced: true }), /stamped/);
});

// ── the real store ──
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
};
const { useStore } = await import('../state/store.js');

await ok('store: LOAD adds a hand keep to the collection and stage; scene and Library untouched', () => {
  const S = () => useStore.getState();
  S().installLookFile({
    format: 'kc-look/1',
    name: 'Seedless',
    mode: MODE,
    layoutParams: { count: 40 },
    paletteId: 'sepia-plate',
  });
  S().installLookFile({
    format: 'kc-look/1',
    name: 'Seeded',
    mode: MODE,
    layoutParams: { count: 41 },
    paletteId: 'sepia-plate',
    seed: 12345,
  });
  const [a, b] = S().lookLibrary;
  const before = {
    lp: S().layoutParams,
    pal: S().paletteId,
    lib: S().lookLibrary,
    keeps: S().keeps.length,
    stage: S().keepStage.length,
  };
  S().loadLookToSlot(a.id, null);
  assert.equal(S().keeps.length, before.keeps + 1);
  assert.equal(S().keepStage.length, before.stage + 1);
  const k = S().keeps.find((x) => x.id === S().keepStage.at(-1));
  assert.equal(k.seed, S().seed, 'seedless: stamped with the session seed');
  assert.equal(k.config.layout.mode, MODE);
  assert.match(S().shelfNotice, /Seedless loaded.*seed stamped/);
  S().loadLookToSlot(b.id, k.id);
  const k2 = S().keeps.find((x) => x.id === S().keepStage.at(-1));
  assert.equal(k2.seed, 12345, 'seeded: keeps its own seed');
  assert.equal(S().keepStage.length, before.stage + 1, 'a replace does not grow the stage');
  assert.ok(!S().keepStage.includes(k.id), 'the replaced keep left the stage');
  assert.ok(
    S().keeps.some((x) => x.id === k.id),
    '...but stays in the collection: nothing is lost',
  );
  assert.deepEqual(S().layoutParams, before.lp, 'the scene is never touched');
  assert.equal(S().paletteId, before.pal);
  assert.equal(S().lookLibrary, before.lib, 'the Library is untouched');
  const n0 = S().keeps.length;
  S().loadLookToSlot('ghost', null);
  assert.match(S().shelfNotice, /not in the Library/);
  assert.equal(S().keeps.length, n0, 'a refused load adds nothing');
});

await ok('wired: the Library section loads through the store action and confirms a replace', () => {
  const view = readFileSync(new URL('../panels/layout/LookLibrarySection.jsx', import.meta.url), 'utf8');
  assert.ok(view.includes('loadLookToSlot') && view.includes('REPLACE_PROMPT'));
  for (const banned of ['applyPreset', 'APPLY_PRESET', 'setLayoutParam', 'emit(', 'EXPORT_LOAD_PROJECT'])
    assert.ok(!view.includes(banned), `LOAD never touches ${banned}`);
});

console.log(`lookSlot.selfcheck: ${n} ok`);
process.exit(0);
