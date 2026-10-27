// node src/data/styleLooks.selfcheck.mjs
// #1770 (epic #1766, slice 4) — 64 dealable Looks. Pins: the count reads 64 from data; every look names its group,
// its asset categories and its S3 styles; every recipe validates clean through the #1550 door; no near-duplicate
// padding (inside a style group no two looks share a mode; across all 64 no two share a recipe signature); every
// look's pairing deals a COHERENT pool from the real library; and every look survives a headless render — the
// #952 rule, the roll is the review: frames resolve, marks exist, and they land on the canvas.
import assert from 'node:assert/strict';
import { COMPOSITION_PRESETS, PRESET_GROUPS, getPresetsByGroup } from './presets.js';
import { STYLE_LOOKS, STYLE_LOOK_GROUPS } from './styleLooks.js';
import { ALL_CATEGORIES } from './categories.js';
import { STYLES, assetRecords } from './assetStyle.js';
import { PALETTES } from './palettes.js';
import { ASSETS } from './assets/index.js';
import { DEFAULT_LAYOUT_PARAMS, validateLayoutParams, normalizeLayoutParams } from './layout-modes.js';
import { dealPoolFor, poolToEnabled } from '../state/rollPool.mjs';
import { mkRng } from '../engine/prng.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';

// 1. the count, from data
assert.equal(COMPOSITION_PRESETS.length, 64, `the dealable Look count reads 64, got ${COMPOSITION_PRESETS.length}`);
assert.equal(STYLE_LOOKS.length, 31, '33 + 31 style looks');
assert.equal(PRESET_GROUPS.length, 14, '7 original groups + 7 style groups');
const ids = COMPOSITION_PRESETS.map((p) => p.id);
assert.equal(new Set(ids).size, ids.length, 'look ids stay unique');
const menuCount = getPresetsByGroup().reduce((n, g) => n + g.presets.length, 0);
assert.equal(menuCount, 64, 'the LOOKS menu lists all 64 (no look orphaned from its group)');
assert.ok(
  getPresetsByGroup().every((g) => g.presets.length > 0),
  'the LOOKS menu shows no empty group',
);

// 2. every look names its group, categories and styles; the recipe validates clean
const groupIds = new Set(PRESET_GROUPS.map((g) => g.id));
const styleSet = new Set(STYLES);
const palIds = new Set(PALETTES.map((p) => p.id));
for (const p of COMPOSITION_PRESETS) {
  assert.ok(groupIds.has(p.group), `${p.id}: group ${p.group} is a menu group`);
  assert.ok(p.categories?.length && p.categories.every((c) => ALL_CATEGORIES.includes(c)), `${p.id}: categories`);
  assert.ok(p.styles?.length && p.styles.every((s) => styleSet.has(s)), `${p.id}: styles ${p.styles}`);
  const { rejected } = validateLayoutParams({ ...p.params, composition: p.id });
  assert.deepEqual(rejected, [], `${p.id}: params validate clean (rejected ${rejected})`);
}
for (const p of STYLE_LOOKS) {
  assert.ok(palIds.has(p.paletteId), `${p.id}: paired palette ${p.paletteId} is in the catalog`);
  assert.ok(p.desc && p.desc.length > 20, `${p.id}: a designer brief`);
}
for (const g of STYLE_LOOK_GROUPS) {
  const looks = STYLE_LOOKS.filter((p) => p.group === g.id);
  assert.ok(looks.length >= 4, `${g.label}: at least four looks`);
  const modes = looks.map((p) => p.params.mode);
  assert.equal(new Set(modes).size, modes.length, `${g.label}: no two looks share a mode (${modes})`);
  assert.ok(
    looks.every((p) => p.styles.includes(g.id)),
    `${g.label}: every look in the group pairs with its own style`,
  );
}

// 2b. a dealt look meets any palette: none may multiply (on a dark ground it erases the marks — rollSafety, #1107)
assert.deepEqual(
  COMPOSITION_PRESETS.filter((p) => p.params.blendMode === 'multiply').map((p) => p.id),
  [],
  'no look multiplies',
);

// 3. no near-duplicate padding across the whole rack
const sig = (p) =>
  JSON.stringify([
    p.params.mode,
    [...p.categories].sort(),
    p.paletteShift,
    p.params.count,
    p.params.scale,
    p.params.blendMode ?? null,
  ]);
const sigs = COMPOSITION_PRESETS.map(sig);
assert.equal(new Set(sigs).size, sigs.length, 'no two looks share a recipe signature');

// 4. every look's pairing deals a coherent pool from the real library
const records = assetRecords(ASSETS);
for (const p of COMPOSITION_PRESETS) {
  for (let k = 0; k < 6; k++) {
    const pool = dealPoolFor(records, mkRng(1770 + k * 31), p);
    assert.ok(pool.coherent, `${p.id}: deals a coherent pool for ${p.categories}/${p.styles}`);
    const want = new Set(p.categories);
    assert.ok(
      pool.ids.every((id) => want.has(records.find((r) => r.id === id).category)),
      `${p.id}: every dealt asset is in a paired category`,
    );
  }
}

// 5. the roll is the review: every look renders headless, with marks on the canvas
const W = 1080;
const H = 1080;
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const input = (p, pool, t) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 1770,
  seedOffsets: null,
  paletteId: p.paletteId || 'praystation',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...p.params, composition: p.id }),
  caGrid: null,
  enabledAssets: pool,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: t,
  dtSec: 1 / 60,
  perfClampOverride: null,
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  scaleMul: 1,
  alphaBoost: 0,
  effectiveScale: p.params.scale || [0.5, 1.5],
  effectiveAlpha: p.params.alpha || [20, 100],
  phraseWrapGen: 0,
  attractor: null,
  mixSeconds: 0,
  canvasW: W,
  canvasH: H,
});
const blank = []; // LOOKS_VERBOSE=1 prints id / marks / marks on canvas
for (const p of COMPOSITION_PRESETS) {
  const pool = poolToEnabled(dealPoolFor(records, mkRng(4242), p).ids);
  const r = createLiveResolver();
  let out;
  for (let f = 0; f < 24; f++) out = r.resolveLayers(input(p, pool, f * 16.7));
  r.dispose();
  const items = out.find((l) => l.id === 'lyr-a')?.items || [];
  const finite = items.filter((it) => Number.isFinite(it.x) && Number.isFinite(it.y));
  const onCanvas = finite.filter((it) => it.x >= 0 && it.x <= W && it.y >= 0 && it.y <= H);
  assert.equal(finite.length, items.length, `${p.id}: every mark has a finite position`);
  assert.ok(
    items.every((it) => pool[it.assetId]),
    `${p.id}: marks are drawn from the dealt pool`,
  );
  // blank/broken = too few marks, or most of them thrown off the plate (measured floor across the 64: 0.44, 10 marks)
  if (onCanvas.length < 8 || onCanvas.length < items.length * 0.3) blank.push(p.id);
  if (process.env.LOOKS_VERBOSE) console.log(p.id, items.length, onCanvas.length);
}
assert.deepEqual(blank, [], `looks that render blank: ${blank}`);

console.log(
  `styleLooks.selfcheck: ok (#1770 — ${COMPOSITION_PRESETS.length} looks in ${PRESET_GROUPS.length} groups, all render)`,
);
