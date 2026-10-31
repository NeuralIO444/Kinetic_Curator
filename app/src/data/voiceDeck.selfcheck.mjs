// node src/data/voiceDeck.selfcheck.mjs
// #1771 (epic #1766, slice 5) — 72 dealable voices. Pins: the count reads 72 from data (4 flagships + 15 promoted
// stubs + 53 family variants — Marks added 8 under #1854, Matt's 2026-10-31 ruling); the flagships are the SAME
// objects, byte-identical; every voice is kc-voice/1-shaped
// (resolveVoiceState, clean validation, a real mode, a full palette, real assets) and declares its S3 pairing, its
// accumulation and its cost tier truthfully; a promoted stub's SHAPES chip lights exactly when its full set is the
// pool; and every voice renders headless within its tier's mark budget.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VOICE_DECK, VOICE_DECK_COUNT, VOICE_COST_TIERS, FAMILY_PAIRING, deckVoice } from './voiceDeck.js';
import {
  FLAGSHIP_VOICES,
  STUB_VOICES,
  SHAPE_SETS,
  isShapeSetActive,
  resolveVoiceState,
  VOICE_SWATCH_COUNT,
  MODE_IDS,
} from './voices.js';
import { STYLE_LOOK_GROUPS } from './styleLooks.js';
import { ALL_CATEGORIES } from './categories.js';
import { STYLES, assetRecords } from './assetStyle.js';
import { ASSETS } from './assets/index.js';
import { DEFAULT_LAYOUT_PARAMS, validateLayoutParams } from './layout-modes.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';

// 1. the count, from data
assert.equal(VOICE_DECK_COUNT, 72, `the dealable voice count reads 72, got ${VOICE_DECK_COUNT}`);
const kinds = VOICE_DECK.reduce((m, v) => ({ ...m, [v.kind]: (m[v.kind] || 0) + 1 }), {});
assert.deepEqual(kinds, { flagship: 4, promoted: 15, family: 53 });
const ids = VOICE_DECK.map((v) => v.id);
assert.equal(new Set(ids).size, ids.length, 'voice ids are unique');
assert.equal(deckVoice('kintsugi').def.title, 'Kintsugi');
assert.equal(deckVoice('nope'), null);

// 2. the flagships: the same objects, byte-identical (goldens hold unless Matt rules a change)
FLAGSHIP_VOICES.forEach((f, i) => assert.equal(VOICE_DECK[i].def, f, `${f.id}: the deck carries the flagship itself`));
assert.equal(
  createHash('sha256').update(JSON.stringify(FLAGSHIP_VOICES)).digest('hex').slice(0, 16),
  'bd4c6b0a5809840d',
  'FLAGSHIP_VOICES are byte-identical to their pre-#1771 definition',
);

// 3. every voice: kc-voice/1-shaped, truthful declarations, a coherent wardrobe
const records = new Map(assetRecords(ASSETS).map((r) => [r.id, r]));
for (const v of VOICE_DECK) {
  const st = resolveVoiceState(v.def);
  assert.ok(MODE_IDS.includes(st.params.mode), `${v.id}: lands on a real mode`);
  assert.equal(st.palette.swatches.length, VOICE_SWATCH_COUNT, `${v.id}: a full palette`);
  if (v.kind !== 'flagship') {
    const { rejected } = validateLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...v.def.params });
    assert.deepEqual(rejected, [], `${v.id}: params validate clean (rejected ${rejected})`);
  }
  assert.ok(v.categories.length && v.categories.every((c) => ALL_CATEGORIES.includes(c)), `${v.id}: categories`);
  assert.ok(v.styles.length && v.styles.every((s) => STYLES.includes(s)), `${v.id}: styles`);
  assert.equal(v.accumulation, v.def.params.accumulation === true, `${v.id}: declares its accumulation truthfully`);
  assert.ok(VOICE_COST_TIERS[v.costTier], `${v.id}: a known cost tier`);
  if (v.accumulation) assert.notEqual(v.costTier, 'light', `${v.id}: a wake is never 'light'`);
  const wear = Object.keys(v.def.assets).filter((id) => v.def.assets[id]);
  assert.ok(wear.length >= 4, `${v.id}: wears at least four shapes`);
  for (const id of wear) {
    assert.ok(records.has(id), `${v.id}: ${id} is a real asset`);
    assert.ok(v.categories.includes(records.get(id).category), `${v.id}: ${id} is in a paired category`);
  }
  if (v.kind === 'family') {
    assert.deepEqual(v.categories, FAMILY_PAIRING[v.def.family]);
    assert.ok(
      wear.every((id) => records.get(id).style === v.def.family),
      `${v.id}: a family voice wears its own style`,
    );
  }
}

// 4. every S4 style group has its family, and inside a family no two voices share a mode + motion
for (const g of STYLE_LOOK_GROUPS) {
  const fam = VOICE_DECK.filter((v) => v.kind === 'family' && v.def.family === g.id);
  assert.ok(fam.length >= 6, `${g.label}: at least six family voices`);
  const sigs = fam.map((v) => `${v.def.params.mode}/${v.def.params.behave}`);
  assert.equal(new Set(sigs).size, sigs.length, `${g.label}: no two voices share a mode + motion (${sigs})`);
}

// 5. stub chips keep working: a promoted voice's chip lights exactly when its full set is the pool
for (const stub of STUB_VOICES) {
  const v = deckVoice(stub.id);
  assert.equal(v.kind, 'promoted', `${stub.id}: promoted`);
  const chip = SHAPE_SETS.find((x) => x.id === stub.id);
  const full = { ...v.def.assets };
  assert.ok(isShapeSetActive(full, chip), `${stub.id}: the chip lights on the voice's full set`);
  const [first, ...rest] = Object.keys(full);
  assert.ok(!isShapeSetActive(Object.fromEntries(rest.map((k) => [k, true])), chip), `${stub.id}: dark on 7 of 8`);
  assert.ok(!isShapeSetActive({ ...full, hae_coral_99: true }, chip), `${stub.id}: dark with an extra shape`);
  assert.ok(!isShapeSetActive({ [first]: true }, chip), `${stub.id}: dark on the old 4-set slice`);
}

// 6. every voice renders headless, within its declared tier's mark budget
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const input = (st, t) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 1771,
  seedOffsets: null,
  paletteId: 'praystation',
  paletteOverrides: { bg: st.palette.bg, ink: st.palette.ink, swatches: st.palette.swatches },
  userPalettes: [],
  layoutParams: st.params,
  caGrid: null,
  enabledAssets: st.assets === 'all' ? null : st.assets,
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
  effectiveScale: st.params.scale,
  effectiveAlpha: st.params.alpha,
  phraseWrapGen: 0,
  attractor: null,
  mixSeconds: 0,
  canvasW: 1920,
  canvasH: 1080,
});
const rows = [];
for (const v of VOICE_DECK) {
  const st = resolveVoiceState(v.def);
  const r = createLiveResolver();
  let out;
  let peak = 0;
  for (let f = 0; f < 30; f++) {
    out = r.resolveLayers(input(st, f * 16.7));
    peak = Math.max(peak, out.find((l) => l.id === 'lyr-a')?.items?.length || 0);
  }
  r.dispose();
  const items = out.find((l) => l.id === 'lyr-a')?.items || [];
  assert.ok(items.length > 0, `${v.id}: renders marks`);
  assert.ok(
    items.every((it) => Number.isFinite(it.x) && Number.isFinite(it.y)),
    `${v.id}: every mark has a finite position`,
  );
  const cap = VOICE_COST_TIERS[v.costTier].maxMarks;
  assert.ok(peak <= cap, `${v.id}: ${peak} marks over its '${v.costTier}' budget (${cap})`);
  rows.push([v.id, v.costTier, peak]);
}
if (process.env.DECK_VERBOSE) for (const r of rows) console.log(r.join(' '));

console.log(
  `voiceDeck.selfcheck: ok (#1771 — ${VOICE_DECK_COUNT} voices: 4 flagship, 15 promoted, 53 family; all render in tier)`,
);
