// node src/data/world.selfcheck.mjs — #2104 the Canon world record, step 1: the record and its door.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HOUSE_WORLD, WORLD_GRAIN_MAX, sanitizeWorld } from './world.js';
import { BOIL_FPS_DEFAULT, BOIL_FPS_MIN, BOIL_FPS_MAX } from '../engine/kineme.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { createLayoutSlice } from '../state/slices/layoutSlice.js';
import { DEFAULT_LAYOUT_PARAMS } from './layout-modes.js';

// ── the door: fail-closed, like every other document field ───────────────
for (const off of [null, undefined, 0, 'world', [], true])
  assert.strictEqual(sanitizeWorld(off), null, `${off} → no world`);
assert.strictEqual(sanitizeWorld([HOUSE_WORLD, HOUSE_WORLD]), null, 'a list of worlds is not a world');

// ── missing fields take the standing defaults: the house world itself ────
const d = sanitizeWorld({});
assert.deepStrictEqual(d, { ...HOUSE_WORLD, finish: { ...HOUSE_WORLD.finish } }, 'empty object → the house world');
assert.notStrictEqual(d, HOUSE_WORLD, 'the door hands back a fresh record, never the frozen house constant');
assert.notStrictEqual(d.finish, HOUSE_WORLD.finish, '…and a fresh finish');
assert.ok(Object.isFrozen(HOUSE_WORLD) && Object.isFrozen(HOUSE_WORLD.finish), 'the authored house world is frozen');

// ── an authored world survives the door unchanged (the baseline rule) ────
const authored = { chapter: 'swiss', ground: '#f0f0e8', ink: '#141310', boilFps: 8, finish: { grain: 0.25 } };
assert.deepStrictEqual(sanitizeWorld(authored), authored, 'a valid record passes through untouched');
assert.deepStrictEqual(sanitizeWorld(HOUSE_WORLD), { ...HOUSE_WORLD, finish: { ...HOUSE_WORLD.finish } });

// ── fixed shape: unknown keys are dropped, at both levels ────────────────
const shaped = sanitizeWorld({ ...authored, sun: { x: 1 }, trail: 'long', finish: { grain: 0.5, blur: 9 } });
assert.deepStrictEqual(
  Object.keys(shaped),
  ['chapter', 'ground', 'ink', 'boilFps', 'finish'],
  'no sun, no trail policy',
);
assert.deepStrictEqual(Object.keys(shaped.finish), ['grain'], 'the finish is the grain amount, nothing else');

// ── the boil: clamped to the named band, garbage takes the default ──────
assert.strictEqual(sanitizeWorld({ boilFps: 99 }).boilFps, BOIL_FPS_MAX);
assert.strictEqual(sanitizeWorld({ boilFps: 1 }).boilFps, BOIL_FPS_MIN);
assert.strictEqual(sanitizeWorld({ boilFps: 'fast' }).boilFps, BOIL_FPS_DEFAULT);
assert.strictEqual(sanitizeWorld({ boilFps: NaN }).boilFps, BOIL_FPS_DEFAULT);
assert.strictEqual(HOUSE_WORLD.boilFps, BOIL_FPS_DEFAULT, 'the house tempo is the classic rate, inside the band');
assert.ok(HOUSE_WORLD.boilFps >= BOIL_FPS_MIN && HOUSE_WORLD.boilFps <= BOIL_FPS_MAX);

// ── colours: validated as colours, each field falls back on its own ─────
assert.strictEqual(sanitizeWorld({ ground: '#AABBCC' }).ground, '#aabbcc', 'normalized to the palette form');
assert.strictEqual(sanitizeWorld({ ground: 'aabbcc' }).ground, '#aabbcc', 'a bare hex is a colour');
assert.strictEqual(
  sanitizeWorld({ ground: 'red', ink: '#000000' }).ground,
  HOUSE_WORLD.ground,
  'not a colour → house paper',
);
assert.strictEqual(sanitizeWorld({ ground: 'red', ink: '#000000' }).ink, '#000000', '…while a good ink stands');
assert.strictEqual(sanitizeWorld({ ink: '#12345' }).ink, HOUSE_WORLD.ink, 'a short hex is not a colour');
assert.strictEqual(sanitizeWorld({ ink: 42 }).ink, HOUSE_WORLD.ink, 'a number is not a colour');

// ── chapter: provenance, not a pointer — any named landing stands ───────
assert.strictEqual(sanitizeWorld({ chapter: 'swiss' }).chapter, 'swiss');
assert.strictEqual(sanitizeWorld({ chapter: 'a-chapter-nobody-wrote-yet' }).chapter, 'a-chapter-nobody-wrote-yet');
assert.strictEqual(sanitizeWorld({ chapter: '' }).chapter, HOUSE_WORLD.chapter, 'an unnamed provenance → the house');
assert.strictEqual(sanitizeWorld({ chapter: 7 }).chapter, HOUSE_WORLD.chapter);

// ── the finish: grain clamped to the finish family's own ceiling ────────
assert.strictEqual(sanitizeWorld({ finish: { grain: 7 } }).finish.grain, WORLD_GRAIN_MAX);
assert.strictEqual(sanitizeWorld({ finish: { grain: -2 } }).finish.grain, 0);
assert.strictEqual(sanitizeWorld({ finish: { grain: 'lots' } }).finish.grain, HOUSE_WORLD.finish.grain);
assert.deepStrictEqual(
  sanitizeWorld({ finish: 'grainy' }).finish,
  { ...HOUSE_WORLD.finish },
  'a non-object finish → house finish',
);
assert.strictEqual(WORLD_GRAIN_MAX, 1, "the ceiling is the grain amount's own 0..1 range");

// ── the store: a fresh stage stands in the house world ───────────────────
{
  let state = {};
  const set = (p) => {
    state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
  };
  state = { ...createLayoutSlice(set) };
  assert.deepStrictEqual(
    state.world,
    { ...HOUSE_WORLD, finish: { ...HOUSE_WORLD.finish } },
    'the house world stands from the open',
  );
  assert.notStrictEqual(state.world, HOUSE_WORLD, 'the standing record is the door’s copy, not the frozen constant');
}

// ── step 1's boundary: documents and the scene contract do not know it ──
// Recording is step 3 of the build order; until then a world standing in the
// store leaves every document and every contract byte-identical to today.
const base = {
  seed: 7,
  seedOffsets: {},
  paletteId: 'praystation',
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  enabledAssets: {},
  quality: 'balanced',
  autoQuality: true,
};
const doc = serializeProject({ ...base, light: null, world: sanitizeWorld(HOUSE_WORLD) });
assert.ok(!('world' in doc), 'step 1 records nothing: no world key in the document');
const back = parseProject(JSON.parse(JSON.stringify(doc)));
assert.ok(back.ok);
assert.ok(!('world' in back.doc), '…and none parses back');
const contract = buildSceneContract({ doc: { seed: 1 }, resolvedLayers: [] });
assert.ok(!('world' in contract), 'the scene contract carries no world key (hash stable)');

// ── the law is written where the next person looks ───────────────────────
const here = dirname(fileURLToPath(import.meta.url));
assert.match(readFileSync(join(here, 'world.js'), 'utf8'), /no world standing is byte-identical/);

console.log('world.selfcheck: OK');
