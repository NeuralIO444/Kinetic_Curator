// node src/data/world.selfcheck.mjs — #2104 the Canon world record, steps 1–2: the record, its door, and the landing deal.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HOUSE_WORLD, WORLD_GRAIN_MAX, WORLD_STOCK, sanitizeWorld, worldForChapter } from './world.js';
import { BOIL_FPS_DEFAULT, BOIL_FPS_MIN, BOIL_FPS_MAX } from '../engine/kineme.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { createLayoutSlice } from '../state/slices/layoutSlice.js';
import { useStore } from '../state/store.js';
import { CHAPTERS } from './chapters.js';
import { canonStyle } from './canon/index.js';
import { PALETTES, deriveLineInk, getCatalogPalette } from './palettes.js';
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

// ── step 2: the stock — authored for all twelve chapters, in ruled order ──
const RULED_SPINE = [
  'marks',
  'engraving',
  'organic',
  'bauhaus',
  'swiss',
  'op-art',
  'japan',
  'memphis',
  'pixel',
  'grunge',
  'techno',
  'now',
];
assert.deepStrictEqual(
  Object.keys(WORLD_STOCK),
  RULED_SPINE,
  'stock for all 12 chapters — the Book’s nine plus Organic, Pixel and Techno at their ruled positions',
);
for (const c of CHAPTERS)
  assert.ok(WORLD_STOCK[c.id]?.length, `the landable chapter ${c.id} has stock — the deal is never undefined`);
assert.ok(
  Object.isFrozen(WORLD_STOCK) && Object.isFrozen(WORLD_STOCK.marks) && Object.isFrozen(WORLD_STOCK.marks[0].finish),
  'the stock is frozen',
);
// Each chapter's palettes are its own: the family its Canon style resolves
// (data/canon/index.js). 'now' stands on the whole library.
const CHAPTER_STYLE = {
  marks: 'marks',
  engraving: 'engraved',
  organic: 'organic',
  bauhaus: 'bauhaus',
  swiss: 'swiss',
  'op-art': 'op',
  japan: 'japanese',
  memphis: 'memphis',
  pixel: 'pixel',
  grunge: 'grunge',
  techno: 'techno',
};
const familyPairs = (chapterId) => {
  const ids = chapterId === 'now' ? PALETTES.map((p) => p.id) : canonStyle(CHAPTER_STYLE[chapterId]).palettes;
  return new Set(
    ids.map((pid) => {
      const p = getCatalogPalette(pid);
      return `${p.bg}|${deriveLineInk(p)}`;
    }),
  );
};
for (const [chapterId, stock] of Object.entries(WORLD_STOCK)) {
  assert.ok(stock.length >= 2, `${chapterId}: a stock the pick can pick from`);
  assert.strictEqual(
    new Set(stock.map((e) => JSON.stringify(e))).size,
    stock.length,
    `${chapterId}: no two stock entries are the same record`,
  );
  const pairs = familyPairs(chapterId);
  for (const entry of stock) {
    assert.strictEqual(entry.chapter, chapterId, `${chapterId}: provenance names the chapter`);
    assert.deepStrictEqual(sanitizeWorld(entry), entry, `${chapterId}: authored stock survives the door unchanged`);
    assert.ok(
      entry.boilFps >= BOIL_FPS_MIN &&
        entry.boilFps <= BOIL_FPS_MAX &&
        entry.finish.grain >= 0 &&
        entry.finish.grain <= WORLD_GRAIN_MAX,
      `${chapterId}: climate inside the named bands`,
    );
    assert.ok(
      pairs.has(`${entry.ground}|${entry.ink}`),
      `${chapterId}: ground|ink ${entry.ground}|${entry.ink} is one of the chapter's own palettes (bg | derived line ink)`,
    );
  }
}

// ── step 2: the pick — from the chapter alone, the same world every time ──
for (const chapterId of RULED_SPINE) {
  const w = worldForChapter(chapterId);
  assert.ok(w, `${chapterId}: a world deals`);
  assert.strictEqual(w.chapter, chapterId);
  assert.ok(
    WORLD_STOCK[chapterId].some((e) => JSON.stringify(sanitizeWorld(e)) === JSON.stringify(w)),
    `${chapterId}: the dealt world is a member of its stock, through the door`,
  );
  assert.deepStrictEqual(
    worldForChapter(chapterId),
    w,
    `${chapterId}: the same chapter deals the same world — memory is determinism`,
  );
  assert.ok(!Object.isFrozen(w), `${chapterId}: the dealt record is the door’s fresh copy, not the frozen stock entry`);
}
assert.strictEqual(worldForChapter('atlantis'), null, 'a chapter with no stock deals no world');
assert.strictEqual(worldForChapter(null), null);
assert.strictEqual(worldForChapter(7), null);
{
  // The pick does not ride the landing's die stream: it never rolls at all.
  const realRandom = Math.random;
  Math.random = () => {
    throw new Error('the pick must not roll');
  };
  try {
    assert.deepStrictEqual(worldForChapter('swiss'), worldForChapter('swiss'), 'no dice were consulted');
  } finally {
    Math.random = realRandom;
  }
}

// ── the boundary through step 2: documents and the contract do not know it ──
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

// ── step 2 in the real store: the deal, the presses, the clearing ────────
{
  const S = () => useStore.getState();
  assert.deepStrictEqual(
    S().world,
    { ...HOUSE_WORLD, finish: { ...HOUSE_WORLD.finish } },
    'the store opens in the house world, before any landing',
  );
  S().kineticLookPass(); // a cold flip: a landing
  const landed = S().kineticChapterId;
  assert.ok(landed, 'the cold flip landed in a chapter');
  assert.deepStrictEqual(
    S().world,
    worldForChapter(landed),
    'the landing dealt that chapter’s world in the same update',
  );
  assert.strictEqual(S().world.chapter, landed, 'the standing world’s provenance is the landed chapter');
  const standing = S().world;
  S().kineticVoicePass();
  assert.deepStrictEqual(
    S().world,
    standing,
    'a warm KINETIC press keeps the standing world — it changes what stands in it, not the world',
  );
  S().kineticCuratorPass();
  assert.deepStrictEqual(S().world, standing, 'a CURATOR press keeps the standing world');
  assert.ok(
    !('world' in serializeProject(S())),
    'step 2 records nothing either: no world key in the document after a landing',
  );
  S().kineticRoll(); // CHAOS
  assert.strictEqual(S().kineticChapterId, null, 'CHAOS leaves the book');
  assert.strictEqual(S().world, null, 'CHAOS clears the world with the chapter (ruling 7)');
  S().kineticLookPass();
  assert.deepStrictEqual(S().world, worldForChapter(S().kineticChapterId), 'the next landing deals again');
  S().kineticOpenPass(); // the launch opener
  assert.strictEqual(S().kineticChapterId, null, 'the opener leaves the book');
  assert.strictEqual(S().world, null, 'the launch opener clears the world with the chapter (ruling 7)');
}

// ── the law is written where the next person looks ───────────────────────
const here = dirname(fileURLToPath(import.meta.url));
assert.match(readFileSync(join(here, 'world.js'), 'utf8'), /no world standing is byte-identical/);

console.log('world.selfcheck: OK');
