// node src/panels/layout/lookLibraryRows.selfcheck.mjs
// #2148 step 2 — the Look Library browser's view model. Pins: rows are the Library in install order with a plain-words detail
// line; selection toggles without mutating and never keeps a ghost (a removed Look cannot be exported); export-selected is a
// kc-pack/1 of exactly the picked Looks that imports back identically; an empty selection exports nothing; the count line and the
// empty state say what is true; the browser is wired into BUILD as the last section and only LISTS (it imports no apply path).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lookLibraryRows,
  toggleSelected,
  pruneSelection,
  selectedEntries,
  exportSelectionPack,
  libraryCountLine,
  LIBRARY_EMPTY_LINE,
} from './lookLibraryRows.mjs';
import { parseLookFile, installLooks } from '../../data/lookPack.mjs';
import { MODE_IDS } from '../../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const MODE = MODE_IDS[0];
const look = (name, over = {}) => ({
  name,
  format: 'kc-look/1',
  mode: MODE,
  layoutParams: { count: 40, density: 50 },
  paletteId: 'sepia-plate',
  ...over,
});
const lib = installLooks(
  [],
  parseLookFile({
    format: 'kc-pack/1',
    kind: 'looks',
    name: 'P',
    author: '',
    version: 1,
    items: [
      look('One'),
      look('Two', { seed: 5, layoutParams: { count: 20 } }),
      look('Three', { paletteId: 'dusk', layoutParams: {} }),
    ],
  }).items,
).library;

ok('rows are the Library in install order, with a plain-words detail line', () => {
  const rows = lookLibraryRows(lib);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['One', 'Two', 'Three'],
  );
  assert.equal(rows[0].detail, `${MODE} · sepia-plate · 2 params`);
  assert.equal(rows[1].detail, `${MODE} · sepia-plate · 1 param · seeded`);
  assert.equal(rows[2].detail, `${MODE} · dusk · 0 params`);
  assert.deepEqual(
    rows.map((r) => r.seeded),
    [false, true, false],
  );
  assert.deepEqual(lookLibraryRows(null), []);
  assert.deepEqual(lookLibraryRows([]), []);
});

ok('selection toggles without mutating; a removed Look is pruned so a ghost cannot be exported', () => {
  const a = [];
  const b = toggleSelected(a, lib[0].id);
  assert.deepEqual(a, []);
  assert.deepEqual(b, [lib[0].id]);
  assert.deepEqual(toggleSelected(b, lib[0].id), []);
  assert.deepEqual(toggleSelected(b, lib[2].id), [lib[0].id, lib[2].id]);
  const sel = [lib[0].id, lib[1].id];
  assert.strictEqual(pruneSelection(sel, lib), sel, 'nothing stale: the same array back');
  assert.deepEqual(pruneSelection(sel, lib.slice(1)), [lib[1].id]);
  assert.deepEqual(pruneSelection(['look:gone'], lib), []);
});

ok(
  'export-selected is a kc-pack/1 of exactly the picked Looks, in Library order, that imports back identically',
  () => {
    const pack = exportSelectionPack(lib, [lib[2].id, lib[0].id]);
    assert.equal(pack.format, 'kc-pack/1');
    assert.equal(pack.kind, 'looks');
    assert.deepEqual(
      pack.items.map((i) => i.name),
      ['One', 'Three'],
    );
    const back = parseLookFile(JSON.stringify(pack));
    assert.equal(back.ok, true);
    assert.deepEqual(back.quarantined, []);
    assert.deepEqual(back.items, [lib[0], lib[2]]);
    assert.equal(exportSelectionPack(lib, [lib[1].id]).name, 'Two', 'one Look: the pack carries its name');
    assert.equal(exportSelectionPack(lib, []), null, 'nothing picked, nothing exported');
    assert.equal(exportSelectionPack(lib, ['look:gone']), null);
    assert.deepEqual(selectedEntries(lib, [lib[1].id]), [lib[1]]);
  },
);

ok('the count line and the empty state say what is true', () => {
  assert.equal(libraryCountLine([], []), 'No Looks installed yet');
  assert.equal(libraryCountLine(lib, []), '3 Looks');
  assert.equal(libraryCountLine(lib, [lib[0].id]), '3 Looks · 1 selected');
  assert.equal(libraryCountLine(lib.slice(0, 1), []), '1 Look');
  assert.equal(libraryCountLine(lib, ['look:gone']), '3 Looks', 'a ghost is not counted as picked');
  assert.match(LIBRARY_EMPTY_LINE, /IMPORT.*\.kclook.*\.kcpack.*PASTE LOOK/);
});

ok(
  'wiring: BUILD ends with the Looks section; the browser lists and exports only — no apply, slot or scene path',
  () => {
    const panel = readFileSync(new URL('../BuildPanel.jsx', import.meta.url), 'utf8');
    assert.match(panel, /<BuildSection num="7" title="Looks">\s*<LookLibrarySection \/>/);
    assert.ok(
      panel.indexOf('title="Unlocks"') < panel.indexOf('title="Looks"'),
      'Looks follows Unlocks: nothing renumbered',
    );
    const view = readFileSync(new URL('./LookLibrarySection.jsx', import.meta.url), 'utf8');
    for (const banned of ['applyPreset', 'APPLY_PRESET', 'setLayoutParam', 'emit(', 'lookSlots', 'EXPORT_LOAD_PROJECT'])
      assert.ok(!view.includes(banned), `the browser never touches ${banned}`);
    assert.ok(view.includes('removeLibraryLook'), 'remove goes through the store action');
  },
);

console.log(`lookLibraryRows.selfcheck: ${n} ok`);
