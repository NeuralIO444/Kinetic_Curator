// layerRows.selfcheck.mjs — the BUILD layer list reads like the fold (#1037).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { SECTION_ORDER, rowsTopFirst, moveNeighbor, canMoveUp, canMoveDown } from './layerRows.mjs';
import { useStore } from '../../state/store.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const ids = (ls) => ls.map((l) => l.id);

ok('sections read MATH, FX, CONTENT top to bottom', () => {
  assert.deepEqual([...SECTION_ORDER], ['math', 'fx', 'content']);
  const src = readFileSync(new URL('./LayerStack.jsx', import.meta.url), 'utf8');
  const at = (t) => src.indexOf(`title: '${t}', count:`);
  assert.ok(at('Math') > 0 && at('FX') > 0 && at('Content') > 0, 'all three section heads are present');
  assert.ok(at('Math') < at('FX') && at('FX') < at('Content'), 'MATH above FX above CONTENT in the rendered JSX');
});

ok('rows are listed frontmost first: array [a,b,c] draws c,b,a', () => {
  const group = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(ids(rowsTopFirst(group)), ['c', 'b', 'a']);
  assert.deepEqual(ids(group), ['a', 'b', 'c'], 'the input is not mutated');
  assert.deepEqual(rowsTopFirst([]), []);
});

ok('▲ trades with the neighbor at the next-higher index (later in the chain), ▼ the lower', () => {
  const group = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(moveNeighbor(group, 'b', 'up').id, 'c');
  assert.equal(moveNeighbor(group, 'b', 'down').id, 'a');
  assert.equal(moveNeighbor(group, 'c', 'up'), null, 'the top row has no ▲');
  assert.equal(moveNeighbor(group, 'a', 'down'), null, 'the bottom row has no ▼');
  assert.equal(moveNeighbor(group, 'zzz', 'up'), null);
});

ok('the ▲▼ disabled states match: top row cannot go up, bottom row cannot go down', () => {
  const group = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(canMoveUp(group, 'c'), false);
  assert.equal(canMoveDown(group, 'c'), true);
  assert.equal(canMoveUp(group, 'a'), true);
  assert.equal(canMoveDown(group, 'a'), false);
  assert.equal(canMoveUp([{ id: 'only' }], 'only'), false);
  assert.equal(canMoveDown([{ id: 'only' }], 'only'), false);
});

ok('through the real store: ▲ on a KC track moves it later in the chain, so it draws higher', () => {
  const S = () => useStore.getState();
  S().addLayer(); S().addLayer();
  const kc = () => S().layers.filter((l) => l.type === 'content');
  const [first, second] = kc();
  const group = kc();
  const nb = moveNeighbor(group, first.id, 'up');
  assert.equal(nb.id, second.id, 'the neighbor above the bottom track is the next one in the array');
  S().swapLayerPositions(first.id, nb.id);
  assert.deepEqual(ids(kc()).slice(0, 2), [second.id, first.id], 'the track moved later in the chain');
  const drawn = ids(rowsTopFirst(kc()));
  assert.ok(drawn.indexOf(first.id) < drawn.indexOf(second.id), 'and now draws above the one it passed');
});

console.log(`layerRows.selfcheck: ${n} checks passed`);
