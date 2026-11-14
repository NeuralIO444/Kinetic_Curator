// node src/data/world.selfcheck.mjs — #2104 the Canon world record, steps 1–4: the record, its door, the landing deal, the recording, and the style response's bound seams.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HOUSE_WORLD, WORLD_GRAIN_MAX, WORLD_STOCK, sanitizeWorld, worldForChapter } from './world.js';
import { BOIL_FPS_DEFAULT, BOIL_FPS_MIN, BOIL_FPS_MAX, boilSec, boilStep } from '../engine/kineme.js';
import { createPatternFrames, patternKey } from '../pattern/patternSource.js';
import { assignGlyph, glyphMoverMap, rasterGlyph, rasterGlyphReference } from '../pattern/engine.js';
import { cellUvWindow } from './cellKinemes.js';
import { packInstanceData } from '../gl/renderer.mjs';
import { createLiveResolver, getLastFrameMotion } from '../gl/liveResolve.mjs';
import { startPlayback, stopPlayback, playbackStep, overlayScene } from '../gl/playback.mjs';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import {
  createPerformanceRecorder,
  checkPerformance,
  packPerformance,
  unpackPerformance,
} from '../gl/performanceFile.mjs';
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

// ── step 3: the recording — the document carries the standing world ──────
// In the sun's shape (ruling 6): written only when one stands, read back
// through the door; a world-less document is byte-identical to one written
// before recording existed, and its absence is a lawful state, not an error.
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
assert.deepStrictEqual(
  doc.world,
  { ...HOUSE_WORLD, finish: { ...HOUSE_WORLD.finish } },
  'the standing world is written, through the door',
);
const back = parseProject(JSON.parse(JSON.stringify(doc)));
assert.ok(back.ok);
assert.deepStrictEqual(back.doc.world, doc.world, '…and parses back through the door, unchanged');
const bareDoc = serializeProject({ ...base, light: null, world: null });
assert.ok(
  !('world' in bareDoc),
  'no world standing → no world key: a world-less piece exports exactly as before step 3',
);
const bareBack = parseProject(JSON.parse(JSON.stringify(bareDoc)));
assert.ok(bareBack.ok);
assert.strictEqual(bareBack.doc.world, null, 'a document that predates the field loads world-less — absence is lawful');
assert.deepStrictEqual(
  Object.keys(doc).sort(),
  [...Object.keys(bareDoc), 'world'].sort(),
  'recording adds exactly one field — the standing world; no chapter-to-world map rides along (ruling 3)',
);
{
  // A hostile world in a document is repaired by the door, like every other
  // document field — one bad field never costs the document.
  const hostile = parseProject({
    ...JSON.parse(JSON.stringify(doc)),
    world: { chapter: 7, ground: 'red', ink: '#000000', boilFps: 99, finish: { grain: 7 } },
  });
  assert.ok(hostile.ok);
  assert.strictEqual(hostile.doc.world.chapter, HOUSE_WORLD.chapter, 'a non-string provenance → the house');
  assert.strictEqual(hostile.doc.world.ground, HOUSE_WORLD.ground, 'not a colour → house paper');
  assert.strictEqual(hostile.doc.world.ink, '#000000', '…while a good ink stands');
  assert.strictEqual(hostile.doc.world.boilFps, BOIL_FPS_MAX, 'the boil is clamped to the named band');
  assert.strictEqual(hostile.doc.world.finish.grain, WORLD_GRAIN_MAX, 'the grain is clamped to the finish ceiling');
}
const contract = buildSceneContract({ doc: { seed: 1 }, resolvedLayers: [] });
assert.ok(!('world' in contract), 'the scene contract carries no world key — nothing renders it yet (step 4)');

// ── step 3: the take stamp — a take is dealt under a world, and says so ──
{
  const dealt = worldForChapter('swiss');
  const feed = (rec) => {
    for (let f = 0; f < 130; f++) {
      rec.onInput({ frame: f });
      rec.onOutput({ f, v: [f, f * 2] });
    }
    return rec.finish();
  };
  const stamped = feed(createPerformanceRecorder({ world: dealt }));
  assert.deepStrictEqual(stamped.world, dealt, 'the recorder stamps the world the take was dealt under');
  const unstamped = feed(createPerformanceRecorder());
  assert.ok(!('world' in unstamped), 'no world option → no stamp: the file is exactly what it was before step 3');
  assert.deepStrictEqual(
    stamped.checkpoints,
    unstamped.checkpoints,
    'the stamp never enters the hash chain — a stamped take’s checkpoints are the unstamped take’s',
  );
  const worldless = feed(createPerformanceRecorder({ world: null }));
  assert.ok(!('world' in worldless), 'a world-less take stamps nothing');
  const junk = feed(createPerformanceRecorder({ world: 'not-a-world' }));
  assert.ok(!('world' in junk), 'a malformed option stamps nothing — the door at the recorder');
  const roundTripped = await unpackPerformance(await packPerformance(stamped));
  assert.deepStrictEqual(roundTripped.world, dealt, 'the stamp survives the stored form (gzip of JSON)');
  assert.deepStrictEqual(
    roundTripped,
    JSON.parse(JSON.stringify(stamped)),
    'the whole file round-trips, stamp and all',
  );
  // On read, a present world must be a fixed point of the door — fail-closed,
  // in the initialState section's shape.
  assert.throws(() => checkPerformance({ ...stamped, world: 'swiss' }), /world/, 'a non-record world refuses the file');
  assert.throws(
    () => checkPerformance({ ...stamped, world: { ...dealt, boilFps: 99 } }),
    /world/,
    'a world the door would clamp is not a recorded world',
  );
  assert.throws(
    () => checkPerformance({ ...stamped, world: { ...dealt, sun: { x: 1 } } }),
    /world/,
    'an extra key is not the door’s shape',
  );
  assert.throws(
    () => checkPerformance({ ...stamped, world: { ...dealt, finish: { grain: 0.2, blur: 1 } } }),
    /world/,
    'an extra finish key is not the door’s shape',
  );
  assert.strictEqual(checkPerformance(unstamped), unstamped, 'a take with no stamp still verifies its shape');
}

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
  assert.deepStrictEqual(
    serializeProject(S()).world,
    standing,
    'step 3 records: a document saved after a landing carries the dealt world',
  );
  S().kineticRoll(); // CHAOS
  assert.strictEqual(S().kineticChapterId, null, 'CHAOS leaves the book');
  assert.strictEqual(S().world, null, 'CHAOS clears the world with the chapter (ruling 7)');
  assert.ok(
    !('world' in serializeProject(S())),
    'a world-less stage records no world: the document is exactly a pre-recording one',
  );
  S().kineticLookPass();
  assert.deepStrictEqual(S().world, worldForChapter(S().kineticChapterId), 'the next landing deals again');
  S().kineticOpenPass(); // the launch opener
  assert.strictEqual(S().kineticChapterId, null, 'the opener leaves the book');
  assert.strictEqual(S().world, null, 'the launch opener clears the world with the chapter (ruling 7)');
}

// ── step 3 in the real store: a load stands the recorded world back up ───
{
  const S = () => useStore.getState();
  const recorded = worldForChapter('swiss');
  const docIn = parseProject(JSON.parse(JSON.stringify(serializeProject({ ...base, light: null, world: recorded }))));
  assert.ok(docIn.ok);
  S().applyProject(docIn.doc);
  assert.deepStrictEqual(S().world, recorded, 'loading a document stands its recorded world back up');
  const bareIn = parseProject(JSON.parse(JSON.stringify(serializeProject({ ...base, light: null, world: null }))));
  assert.ok(bareIn.ok);
  S().applyProject(bareIn.doc);
  assert.strictEqual(
    S().world,
    null,
    'loading a world-less document leaves the stage world-less — not the session’s leftover world, not the house default',
  );
}

// ── step 4: the contract carries the standing world ──────────────────────
// Scene-level like the sun: present only while a world stands, and always
// the door's own writing of it (a malformed doc world is doored, not carried raw).
{
  const dealt = worldForChapter('swiss');
  const withWorld = buildSceneContract({ doc: { seed: 1, world: dealt }, resolvedLayers: [] });
  assert.deepStrictEqual(withWorld.world, dealt, 'step 4: the contract carries the standing world');
  const hostile = buildSceneContract({ doc: { seed: 1, world: { ...dealt, boilFps: 99 } }, resolvedLayers: [] });
  assert.strictEqual(hostile.world.boilFps, BOIL_FPS_MAX, 'step 4: a doc world is read through the door');
  const bare = buildSceneContract({ doc: { seed: 1 }, resolvedLayers: [] });
  assert.ok(!('world' in bare), 'step 4: a world-less doc still builds a world-less contract (the step-3 pin)');
}

// ── step 4: the mark clock — the living-motion boil advances on the world ─
// The brush-wobble amount opens the motion floor; its ctx boil channel is the
// seam. No world → the channel stands at 0, exactly as it has since #1128.
{
  const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
  const stable = {
    canvasW: 640,
    canvasH: 480,
    layers: [L('a')],
    activeLayerId: 'a',
    layerSnapshots: {},
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    perfClampOverride: null,
    scaleMul: 1,
    alphaBoost: 0,
    phraseWrapGen: 0,
    reducedMotion: false,
    quality: 'balanced',
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    assetAttach: {},
    attractor: null,
    dishPins: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 40, kinemeBrushWobble: 0.5 },
  };
  const resolver = createLiveResolver();
  resolver.resolveLayers({ ...stable, seed: 7, loopTimeMs: 1000, dtSec: 1 / 60 });
  const worldless = getLastFrameMotion().kineme;
  assert.ok(worldless, 'step 4: the wobble floor is alive');
  assert.strictEqual(worldless.boilStep, 0, 'step 4: no world standing → the boil channel stands at 0');
  const world = { ...HOUSE_WORLD, boilFps: 8 };
  resolver.resolveLayers({ ...stable, seed: 7, loopTimeMs: 2000, dtSec: 1 / 60, world });
  const bound = getLastFrameMotion().kineme;
  assert.strictEqual(
    bound.boilStep,
    boilStep(bound.driverSec, 8),
    'step 4: with a world standing, the boil channel is the driver clock on the world’s grid',
  );
  assert.ok(bound.boilStep > 0, 'step 4: the bound boil has advanced off zero');
}

// ── step 4: the pattern kinemes run on the boil clock ────────────────────
// The element transforms read the kineme time; the fast raster and the
// reference agree on it, and a pattern with no movers never hears it.
{
  const pal = getCatalogPalette('praystation');
  const grid = assignGlyph(1234, 6, 0.5, pal);
  const movers = glyphMoverMap(grid, 1234, 'SPIN', 1);
  assert.ok(movers && movers.size > 0, 'step 4: the probe pattern has kineme movers');
  const W = 240;
  const H = 200;
  const fast = rasterGlyph(new Uint32Array(W * H), W, H, grid, 0.5, 1.0, movers, 1.6);
  const ref = rasterGlyphReference(new Uint32Array(W * H), W, H, grid, 0.5, 1.0, movers, 1.6);
  assert.deepStrictEqual(fast, ref, 'step 4: fast and reference rasters agree on the kineme time');
  const smooth = rasterGlyph(new Uint32Array(W * H), W, H, grid, 0.5, 1.0, movers);
  assert.notDeepStrictEqual(fast, smooth, 'step 4: a boil-stepped kineme time draws a different frame than smooth t');

  const block = { mode: 'GLYPH', seed: 1234, density: 6, mix: 0.5, drift: 0.5, kin: 'SPIN', movers: 1 };
  const frames = createPatternFrames();
  const plain = frames.frame(block, pal, W, H, 1.03);
  const stepped = frames.frame(block, pal, W, H, 1.03, null, null, boilSec(1.03, 8));
  assert.strictEqual(stepped.key, patternKey(block, pal, W, H, 1.03, null, null, boilSec(1.03, 8)));
  assert.notStrictEqual(stepped.key, plain.key, 'step 4: a boil-bound frame keys apart from the smooth frame');
  const same = frames.frame(block, pal, W, H, 1.03, null, null, 1.03);
  assert.strictEqual(same.key, plain.key, 'step 4: kinT = t is the pre-world key, byte for byte');
  assert.deepStrictEqual(same.pixels, plain.pixels, 'step 4: kinT = t draws the pre-world frame');
  const still = frames.frame({ ...block, kin: 'OFF', movers: 0 }, pal, W, H, 1.0, null, null, 1.6);
  const stillPlain = frames.frame({ ...block, kin: 'OFF', movers: 0 }, pal, W, H, 1.0);
  assert.deepStrictEqual(still.pixels, stillPlain.pixels, 'step 4: no movers → the kineme time changes nothing');
}

// ── step 4: the cell library's line-boil runs on the boil clock ──────────
// At the pack seam: line_squiggle_01 (line-boil, 7 cells) under a standing
// boil picks its cell from the boil step; every other strip keeps its period.
{
  const cell = { u0: 0, v0: 0, u1: 0.7, v1: 0.25 };
  const cellsObj = { line_squiggle_01: cell, line_squiggle_02: cell };
  const inst = (asset) => ({
    asset,
    tint: '#111111',
    accent: '#eeeeee',
    x: 10,
    y: 20,
    scaleX: 2,
    scaleY: 2,
    rotation: 0,
    opacity: 1,
  });
  const t = 0.3;
  const boiled = packInstanceData([inst('line_squiggle_01')], cellsObj, 1, { motionTime: t, shed: false, boilFps: 8 });
  const wantBoil = cellUvWindow(cell, boilStep(t, 8) % 7, 7);
  assert.ok(Math.abs(boiled[6] - wantBoil.u0) < 2e-7, 'step 4: line-boil packs the boil step’s cell');
  const period = packInstanceData([inst('line_squiggle_01')], cellsObj, 1, { motionTime: t, shed: false });
  assert.ok(Math.abs(period[6] - boiled[6]) > 1e-6, 'step 4: the boil cell is not the period cell at this t');
  const shed = packInstanceData([inst('line_squiggle_01')], cellsObj, 1, { motionTime: t, shed: true, boilFps: 8 });
  assert.ok(Math.abs(shed[6] - cell.u0) < 2e-7, 'step 4: shed still parks line-boil on cell 0');
  const rollPlain = packInstanceData([inst('line_squiggle_02')], cellsObj, 1, { motionTime: t, shed: false });
  const rollBoiled = packInstanceData([inst('line_squiggle_02')], cellsObj, 1, {
    motionTime: t,
    shed: false,
    boilFps: 8,
  });
  assert.deepStrictEqual(rollBoiled, rollPlain, 'step 4: wave-roll keeps its own period under a standing boil');
}

// ── step 4: playback stands a take's recorded world back up ──────────────
{
  const dealt = worldForChapter('swiss');
  const feed = (rec, inputs) => {
    inputs.forEach((input, f) => {
      rec.onInput(input);
      rec.onOutput({ f, v: [f, f * 2] });
    });
    return rec.finish();
  };
  const stamped = feed(createPerformanceRecorder({ world: dealt }), [{ frame: 0 }, { frame: 1 }, { frame: 2 }]);
  assert.strictEqual(startPlayback(stamped), true, 'step 4: the stamped take loads');
  assert.deepStrictEqual(overlayScene({}).world, dealt, 'step 4: the loop’s store view stands in the take’s world');
  const step = playbackStep({});
  assert.deepStrictEqual(step.input.world, dealt, 'step 4: a frame carrying no world resolves under the stamp');
  stopPlayback();
  assert.strictEqual(overlayScene({}).world, undefined, 'step 4: playback over → the view is the live state again');

  const unstamped = feed(createPerformanceRecorder(), [{ frame: 0 }, { frame: 1 }]);
  assert.strictEqual(startPlayback(unstamped), true);
  assert.strictEqual(
    overlayScene({}).world,
    null,
    'step 4: an unstamped take plays world-less, never under a leftover',
  );
  assert.strictEqual(playbackStep({}).input.world, null, 'step 4: its frames resolve world-less too');
  stopPlayback();

  const other = worldForChapter('grunge');
  const perFrame = feed(createPerformanceRecorder({ world: dealt }), [
    { frame: 0, world: other },
    { frame: 1, world: other },
  ]);
  assert.strictEqual(startPlayback(perFrame), true);
  assert.deepStrictEqual(
    playbackStep({}).input.world,
    other,
    'step 4: a frame’s own recorded world wins over the stamp (a landing mid-take replays exactly)',
  );
  assert.deepStrictEqual(overlayScene({}).world, other, 'step 4: the store view agrees with the frame’s world');
  stopPlayback();
}

// ── the law is written where the next person looks ───────────────────────
const here = dirname(fileURLToPath(import.meta.url));
assert.match(readFileSync(join(here, 'world.js'), 'utf8'), /no world standing is byte-identical/);
// Step 4's GL seams sit behind the loop and the renderer, where node cannot
// reach: they are pinned at the source, in the house's layout-tolerant shape.
const loopSrc = readFileSync(join(here, '../gl/liveLoop.mjs'), 'utf8');
assert.match(
  loopSrc,
  /bg: worldNow \? worldNow\.ground : activePalette\.bg/,
  'step 4: the ground seam — the tint machines soak toward the world’s ground',
);
const rendererSrc = readFileSync(join(here, '../gl/renderer.mjs'), 'utf8');
assert.match(rendererSrc, /layerId: 'world'/, 'step 4: the world finish chain is appended in the renderer');
assert.match(
  rendererSrc,
  /boilSec\(layer\.pattern\.t, worldBoilFps\)/,
  'step 4: pattern kinemes snap to the boil grid in the renderer',
);
const resolveSrc = readFileSync(join(here, '../gl/liveResolve.mjs'), 'utf8');
assert.match(resolveSrc, /boilStepAt\(driverSec, worldBoilFps\)/, 'step 4: the mark boil binds in the resolver');

console.log('world.selfcheck: OK');
