// node src/state/sceneApply.selfcheck.mjs
// #2322 (recipes-v3-spec §3.2) — a recipe is an edit of the stage: it replaces the scene it carries, never touches
// the rig, and lands as ONE undo step that really brings the old scene back (world, light, canvas, not just seed).
import assert from 'node:assert';
import { useStore } from './store.js';
import { on, Events } from '../composition/eventBus.js';
import { recipeToProjectDoc } from './recipes.js';
import { sceneFieldsFor, sceneFieldsFromDoc, rigFieldsFromDoc } from './sceneApply.js';
import { DOC_FIELD_CLASS, sceneOf } from './projectDocument.js';
import { sanitizeWorld, WORLD_STOCK } from '../data/world.js';
import { sanitizeLight, LIGHT_DEFAULT } from '../data/light.js';
import { sanitizeCanvasSpec } from '../data/canvasPresets.js';

const st = () => useStore.getState();
const clone = (v) => JSON.parse(JSON.stringify(v));
const RIG_KEYS = [
  'projectTitle',
  'canvasFps',
  'stageMode',
  'audioRoutes',
  'midiBanks',
  'midiActiveBank',
  'midiMap',
  'mathMacros',
  'paletteLocks',
  'kits',
  'assetTags',
  'quality',
  'autoQuality',
];

// The rig and the stage a performer has built, set directly: applyScene must leave every rig key alone.
const RIG = {
  projectTitle: 'MY SET',
  canvasFps: 30,
  stageMode: 'live',
  audioRoutes: [{ marker: 'routes' }],
  midiBanks: [{ name: 'A', map: { cc1: 'x' } }],
  midiActiveBank: 0,
  midiMap: { cc1: 'x' },
  mathMacros: [{ marker: 'macro' }],
  paletteLocks: { 0: true },
  kits: [{ marker: 'kit' }],
  assetTags: { a: ['tag'] },
  quality: 'performance',
  autoQuality: false,
};
const STAGE = {
  seed: 111,
  paletteId: 'praystation',
  world: clone(WORLD_STOCK.marks[0]),
  light: { ...LIGHT_DEFAULT },
  canvasW: 1080,
  canvasH: 1920,
  canvasPresetId: 'story',
  constructRecords: [{ marker: 'construct' }],
  shapeShelf: [{ marker: 'shape' }],
  constructLead: true,
};
const OLD_RECIPE = recipeToProjectDoc({
  seed: 4242,
  paletteId: 'praystation',
  layoutParams: { mode: 'grid', count: 77 },
  seedOffsets: { spatial: 3, color: 0, asset: 0, noise: 0 },
});

function dress() {
  useStore.setState(useStore.getInitialState(), true);
  useStore.setState({ ...clone(RIG), ...clone(STAGE) });
}
const pick = (keys) => Object.fromEntries(keys.map((k) => [k, clone(st()[k] ?? null)]));

// 1. An old-format recipe: rig untouched, uncarried scene untouched, carried scene replaced.
{
  dress();
  const rigBefore = pick(RIG_KEYS);
  const keepBefore = pick([
    'world',
    'light',
    'canvasW',
    'canvasH',
    'canvasPresetId',
    'constructRecords',
    'shapeShelf',
    'constructLead',
    'enabledAssets',
    'assetKineme',
    'regionKinemes',
    'assetStill',
    'customAssets',
  ]);
  st().applyScene(clone(OLD_RECIPE));
  assert.deepStrictEqual(pick(RIG_KEYS), rigBefore, 'a recipe never touches the rig');
  assert.deepStrictEqual(
    pick(Object.keys(keepBefore)),
    keepBefore,
    'an old-format recipe leaves the scene keys it does not carry as they were',
  );
  assert.strictEqual(st().seed, 4242, 'the carried seed lands');
  assert.strictEqual(st().layoutParams.mode, 'grid');
  assert.strictEqual(st().layoutParams.count, 77);
  assert.strictEqual(st().seedOffsets.spatial, 3, 'the carried offsets land');
  assert.strictEqual(st().paletteChosen, false);
}

// 2. replaceAll (kc-r/3 carries the whole scene): a scene key it omits is cleared; rig still untouched; cast kept.
{
  dress();
  const rigBefore = pick(RIG_KEYS);
  const castBefore = clone(st().enabledAssets);
  st().applyScene(clone(OLD_RECIPE), { replaceAll: true });
  assert.deepStrictEqual(pick(RIG_KEYS), rigBefore, 'replaceAll still never touches the rig');
  assert.strictEqual(st().world, sanitizeWorld(undefined), 'an omitted world is cleared');
  assert.deepStrictEqual(st().light, sanitizeLight(undefined), 'an omitted light is cleared');
  assert.strictEqual(st().constructLead, false);
  assert.deepStrictEqual(st().constructRecords, []);
  assert.deepStrictEqual(st().shapeShelf, []);
  assert.strictEqual(st().canvasW, sanitizeCanvasSpec({}).canvasW, 'an omitted canvas is the default canvas');
  assert.deepStrictEqual(st().enabledAssets, castBefore, "a recipe that lists no cast never blanks the receiver's");
}

// 3. One undo step that brings the whole old scene back, and redo that re-applies it.
{
  dress();
  const before = clone(sceneOf(st()));
  assert.strictEqual(st().historyUndoStack.length, 0);
  st().applyScene(clone(OLD_RECIPE), { replaceAll: true });
  assert.strictEqual(st().historyUndoStack.length, 1, 'exactly ONE undo step');
  assert.strictEqual(st().historyUndoStack[0].kind, 'scene');
  assert.ok(st().historyUndoStack[0].bytes > 0, 'the entry is counted against the byte cap');
  assert.strictEqual(st().seed, 4242);
  const after = clone(sceneOf(st()));

  useStore.setState({ projectTitle: 'EDITED AFTER PASTE', audioRoutes: [{ marker: 'routes-2' }] });

  st().undo();
  assert.deepStrictEqual(
    clone(sceneOf(st())),
    before,
    'undo restores the whole scene: seed, layout, world, light, canvas, constructs',
  );
  assert.strictEqual(st().seed, 111);
  assert.deepStrictEqual(st().world, sanitizeWorld(STAGE.world));
  assert.strictEqual(st().canvasW, 1080);
  assert.strictEqual(st().projectTitle, 'EDITED AFTER PASTE', 'undo never rolls back a rig edit made after the paste');
  assert.deepStrictEqual(st().audioRoutes, [{ marker: 'routes-2' }]);
  assert.strictEqual(st().historyUndoStack.length, 0);
  assert.strictEqual(st().historyRedoStack.length, 1);

  st().redo();
  assert.deepStrictEqual(clone(sceneOf(st())), after, 'redo re-applies the recipe');
  assert.strictEqual(st().projectTitle, 'EDITED AFTER PASTE');
}

// 4. The boot path asks for no undo step; every apply announces the load (#2095) exactly once.
{
  dress();
  let loads = 0;
  const off = on(Events.PROJECT_LOADED, () => loads++);
  st().applyScene(clone(OLD_RECIPE), { undo: false });
  assert.strictEqual(st().historyUndoStack.length, 0, 'undo:false pushes nothing');
  assert.strictEqual(loads, 1, 'PROJECT_LOADED once per apply');
  st().applyScene(clone(OLD_RECIPE));
  assert.strictEqual(loads, 2);
  if (typeof off === 'function') off();
}

// 5. The split follows DOC_FIELD_CLASS: every field the scene half sets is a scene key (or a snapshot-only field
//    the layer stack installs), every field the rig half sets is a rig key, and the halves never overlap.
{
  dress();
  const state = st();
  const doc = clone(sceneOf(state)); // layers included, so the snapshot-installed fields appear
  const SNAPSHOT_ONLY = new Set(['lockedParams', 'caGrid']);
  const sceneKeys = Object.keys(sceneFieldsFromDoc(doc, state));
  for (const k of sceneKeys)
    assert.ok(
      DOC_FIELD_CLASS[k] === 'scene' || SNAPSHOT_ONLY.has(k),
      `${k} is set by the scene half, so it must be a scene key`,
    );
  const STORE_NAME = { projectTitle: 'title' }; // the one rig field whose store name differs from its document key
  const rigKeys = Object.keys(rigFieldsFromDoc(doc, state));
  for (const k of rigKeys)
    assert.strictEqual(
      DOC_FIELD_CLASS[STORE_NAME[k] || k],
      'rig',
      `${k} is set by the rig half, so it must be a rig key`,
    );
  for (const k of rigKeys) assert.ok(!sceneKeys.includes(k), `${k} is in one half only`);
  // A carried layer stack installs its snapshot fields; a plain recipe carries none of world, light, cast.
  const plain = Object.keys(sceneFieldsFor(clone(OLD_RECIPE), state));
  assert.ok(
    !plain.includes('world') && !plain.includes('light') && !plain.includes('enabledAssets'),
    'an old recipe carries none of world, light, cast',
  );
  assert.ok(
    Object.keys(sceneFieldsFor(doc, state)).includes('enabledAssets'),
    'a doc that carries a layer stack installs its cast',
  );
}

console.log('sceneApply.selfcheck: OK');
