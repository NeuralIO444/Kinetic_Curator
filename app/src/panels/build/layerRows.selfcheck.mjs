// layerRows.selfcheck.mjs — the BUILD layer list reads like the fold (#1037).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { SECTION_ORDER, rowsTopFirst, moveNeighbor, canMoveUp, canMoveDown } from './layerRows.mjs';
import { steppedStopValue } from './te/modeStops.mjs';
import { STRATUM_ROTATIONS } from '../../state/stratumRotation.js';
import { useStore } from '../../state/store.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const ids = (ls) => ls.map((l) => l.id);

ok('the stack reads like the fold: one list, frontmost first (#1037; #1203 block stack)', () => {
  assert.deepEqual(
    [...SECTION_ORDER],
    ['math', 'fx', 'content'],
    'the fold order the array holds: CONTENT ground, FX, MATH front',
  );
  const src = readFileSync(new URL('./LayerStack.jsx', import.meta.url), 'utf8');
  assert.match(
    src,
    /const stack = rowsTopFirst\(layers\);/,
    'the whole roster renders frontmost-first as one block stack',
  );
  assert.match(src, /<MixSeam upperFine=/, 'adjacent blocks are joined by a mix seam');
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
  // #2038: two content strata can no longer be added by the actions —
  // seed the pre-rebuild shape directly; swapLayerPositions and the
  // row helpers are the units under test.
  const mkC = (id) => ({
    id,
    name: id,
    type: 'content',
    visible: true,
    layerBlendMode: 'normal',
    layerOpacity: 1,
    patch: { mode: 'off', to: null, strength: 0.16 },
  });
  useStore.setState({ layers: [mkC('kc-a'), mkC('kc-b')], activeLayerId: 'kc-a', layerSnapshots: {} });
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

ok('#2038 QA fix: the ROTATE stepper offers exactly the detents — nothing the data law erases', () => {
  // Walking + from 0 visits STRATUM_ROTATIONS in order and nothing
  // else; the ends clamp (stepping off an end stays on it).
  const walked = [0];
  let v = 0;
  for (let i = 0; i < STRATUM_ROTATIONS.length + 2; i++) {
    v = steppedStopValue(STRATUM_ROTATIONS, v, 1);
    if (v !== walked[walked.length - 1]) walked.push(v);
  }
  assert.deepEqual(walked, [...STRATUM_ROTATIONS], 'the + walk is exactly the detent table');
  assert.equal(steppedStopValue(STRATUM_ROTATIONS, 90, 1), 90, 'the top detent clamps');
  assert.equal(steppedStopValue(STRATUM_ROTATIONS, 0, -1), 0, 'the bottom detent clamps');
  assert.equal(steppedStopValue(STRATUM_ROTATIONS, 45, -1), 15);
  assert.equal(steppedStopValue(STRATUM_ROTATIONS, 15, -1), 0);
  // The values the old step-15 slider offered land on detents too —
  // an off-detent start steps to the first detent in that direction,
  // so no editor path can emit 30/60/75 (which sanitizeStratumRotation
  // would silently drop to 0).
  for (const off of [30, 60, 75]) {
    for (const dir of [-1, 1]) {
      const landed = steppedStopValue(STRATUM_ROTATIONS, off, dir);
      assert.ok(STRATUM_ROTATIONS.includes(landed), `from ${off} stepping ${dir} lands on a detent (got ${landed})`);
    }
  }
  assert.equal(steppedStopValue(STRATUM_ROTATIONS, 30, 1), 45);
  assert.equal(steppedStopValue(STRATUM_ROTATIONS, 30, -1), 15);
  assert.equal(steppedStopValue(null, 0, 1), null, 'no table, no offer');
});

ok('#2038 QA fix: the ROTATE row’s dock editor is the detent stepper, not the step-15 slider', () => {
  const src = readFileSync(new URL('./LayerStack.jsx', import.meta.url), 'utf8');
  const start = src.indexOf('#2038 — ROTATE');
  const end = src.indexOf('PATCH — FEED amount', start);
  assert.ok(start > 0 && end > start, 'the ROTATE block is locatable in LayerStack.jsx');
  const block = src.slice(start, end);
  assert.match(block, /<StepperEditor/, 'the open editor is the stepper');
  assert.match(block, /stops=\{STRATUM_ROTATIONS\}/, 'the stepper is fed the detent table itself');
  assert.ok(!block.includes('<SliderEditor'), 'no slider remains on the ROTATE row');
  const editors = readFileSync(new URL('./te/editors.jsx', import.meta.url), 'utf8');
  assert.match(
    editors,
    /steppedStopValue\(stops, value, dir\)/,
    'the stepper routes a stops table through the adjacent-stop arithmetic',
  );
});

console.log(`layerRows.selfcheck: ${n} checks passed`);
