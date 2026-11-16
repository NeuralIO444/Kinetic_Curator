// node src/engine/dishFluidPoem.selfcheck.mjs
// One force seam slice 3 (docs/design/one-force-seam.md) — the ferrofluid leans the poem by WHOLE WORDS. Matt's rulings
// 2026-11-16: whole words (letters inside a word stay intact), the poem is never copied, and never culture-faded.
// Pinned:
//   words     over every poet's piece × density × aspect × seed (placement's own sweep): a break inside a line only
//             falls past a word gap (wider than any track — a word is never torn), and every pair of glyphs in
//             DIFFERENT groups is separated by more than both caps of lean — so ink can never close, whatever the field
//   lean      a word moves rigidly (its letters keep their offsets), toward the magnet, by at most POEM_LEAN_EM of its
//             em; no field / no magnet moves nothing
//   build     buildPlacements with the lean field leans the poem's items and nothing else of the form changes; without
//             it the build is byte-identical; LIFE never touches a poem glyph
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { poemWords, applyPoemLean, POEM_LEAN_EM, POEM_WORD_GAP_EM } from './dishFluidDrift.mjs';
import { FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import { buildPlacements } from './buildPlacements.js';
import { fluidStamp } from './dishFluid.mjs';
import { isFluidDuplicate } from './dishFluidDuplicates.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { placePiece, stampWidthEm } from '../poets/placement.js';
import { POETS } from '../curator/fieldDirector.js';
import { fieldDealReport } from '../poets/fieldForm.js';
import { mkRng } from './prng.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const inkBox = (s) => {
  const hw = (stampWidthEm(s.assetId, s.ch) * s.em) / 2;
  return { l: s.x - hw, r: s.x + hw, t: s.y - s.em / 2, b: s.y + s.em / 2 };
};

ok('words: never torn, and different groups are always more than two leans apart (the full placement sweep)', () => {
  let forms = 0;
  let breaks = 0;
  let spelled = 0;
  for (const deck of Object.values(POETS)) {
    for (const piece of deck) {
      for (const density of [0, 0.4, 0.8, 1]) {
        for (const aspect of [0.6, 1, 10 / 7, 16 / 9, 2.6]) {
          for (let seed = 1; seed <= 6; seed++) {
            const { stamps } = placePiece({ ...piece, density }, mkRng(seed * 31 + 7), { aspect });
            forms++;
            const words = poemWords(stamps);
            const group = new Int32Array(stamps.length);
            words.forEach((w, g) => w.forEach((j) => (group[j] = g)));
            assert.equal(
              words.reduce((a, w) => a + w.length, 0),
              stamps.length,
              'every stamp is in exactly one word',
            );
            // the truth: the piece's own words, walked in reading order over the stamps (where the stamps spell
            // the lines in order — a layout that re-orders glyphs is skipped here, and still covered below)
            const truth = [];
            let wid = 0;
            for (const line of piece.lines) {
              for (const word of line.split(/\s+/).filter(Boolean)) {
                for (const ch of word) truth.push({ ch, wid });
                wid++;
              }
            }
            if (truth.length === stamps.length && truth.every((t, j) => t.ch === stamps[j].ch)) {
              spelled++;
              for (let j = 1; j < stamps.length; j++) {
                if (truth[j].wid !== truth[j - 1].wid) continue;
                if (Math.abs(stamps[j].y - stamps[j - 1].y) > 1e-9) continue; // a word the layout itself wrapped
                assert.equal(group[j], group[j - 1], `${piece.id}: a word is torn at "${stamps[j].ch}"`);
              }
            }
            const boxes = stamps.map(inkBox);
            // a break between neighbours on one line: real air, at least a space
            for (let j = 1; j < stamps.length; j++) {
              if (group[j] === group[j - 1]) continue;
              if (Math.abs(stamps[j].y - stamps[j - 1].y) > 1e-9) continue; // a new line
              breaks++;
              const gap = boxes[j].l - boxes[j - 1].r;
              const em = Math.max(stamps[j].em, stamps[j - 1].em);
              assert.ok(
                gap > POEM_WORD_GAP_EM * em,
                `${piece.id}: a break only past a word gap (${(gap / em).toFixed(2)} em)`,
              );
            }
            // any two glyphs of different groups: separated on some axis by more than both caps together
            for (let i = 0; i < boxes.length; i++) {
              for (let j = i + 1; j < boxes.length; j++) {
                if (group[i] === group[j]) continue;
                const a = boxes[i];
                const c = boxes[j];
                const sep = Math.max(c.l - a.r, a.l - c.r, c.t - a.b, a.t - c.b);
                const need = POEM_LEAN_EM * (stamps[i].em + stamps[j].em);
                assert.ok(
                  sep > need - 1e-9,
                  `${piece.id} d${density} a${aspect.toFixed(2)} s${seed}: groups ${group[i]}/${group[j]} too close to lean (${sep.toFixed(4)} ≤ ${need.toFixed(4)})`,
                );
              }
            }
          }
        }
      }
    }
  }
  assert.equal(forms, 1920, 'the same sweep placement asserts');
  assert.ok(breaks > 0, `word breaks were taken (${breaks})`);
  assert.ok(spelled > forms / 2, `the true-word check ran on most forms (${spelled}/${forms})`);
});

const W = 1000;
const H = 700;
const grid = (v) => new Float32Array(FLUID_GRID_COLS * FLUID_GRID_ROWS).fill(v);
const field = (over = {}) => ({
  density: grid(1),
  magnets: [{ x: 0.5, y: 0.5 }],
  pull: 1,
  aspectHW: H / W,
  W,
  H,
  ...over,
});

ok('lean: whole words, toward the magnet, capped at POEM_LEAN_EM; no field moves nothing', () => {
  const { stamps } = placePiece(POETS.greenleaf[0], mkRng(5), { aspect: W / H });
  const itemsOf = () => stamps.map((s) => ({ x: (s.x / (W / H)) * W, y: s.y * H }));
  const before = itemsOf();
  const items = itemsOf();
  const emPx = (j) => stamps[j].em * H;
  const moved = applyPoemLean(items, stamps, field(), emPx);
  assert.ok(moved > 0, 'words moved');
  for (const w of poemWords(stamps)) {
    const dx = items[w[0]].x - before[w[0]].x;
    const dy = items[w[0]].y - before[w[0]].y;
    for (const j of w) {
      assert.ok(
        Math.abs(items[j].x - before[j].x - dx) < 1e-9 && Math.abs(items[j].y - before[j].y - dy) < 1e-9,
        'rigid',
      );
    }
    const em = Math.min(...w.map(emPx));
    assert.ok(Math.hypot(dx, dy) <= POEM_LEAN_EM * em + 1e-9, 'capped');
    const cx = w.reduce((a, j) => a + before[j].x, 0) / w.length;
    const cy = w.reduce((a, j) => a + before[j].y, 0) / w.length;
    if (Math.hypot(dx, dy) > 0)
      assert.ok(Math.hypot(cx + dx - W / 2, cy + dy - H / 2) < Math.hypot(cx - W / 2, cy - H / 2), 'toward the magnet');
  }
  const still = itemsOf();
  assert.equal(applyPoemLean(still, stamps, null, emPx), 0);
  assert.equal(applyPoemLean(still, stamps, field({ magnets: [] }), emPx), 0);
  assert.deepEqual(still, before);
});

// ---------------------------------------------------------------- buildPlacements
const params = {
  mode: 'grid',
  composition: 'default',
  count: 40,
  scale: [0.4, 0.8],
  rotate: [0, 45],
  alpha: [60, 100],
  jitter: 10,
  density: 100,
  zTiers: 1,
  bleed: false,
  mirror: false,
  overlap: true,
  displacement: 0,
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
};
const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2' }, mkRng(42), { aspect: W / H }).form;
const build = (extra = {}) =>
  buildPlacements({
    layoutParams: { ...params, fieldForm: form },
    seed: 0x1a4f,
    activeAssets: [
      { id: 'a', weight: 'heavy' },
      { id: 'b', weight: 'medium' },
      { id: 'c', weight: 'light' },
    ],
    palette: { swatches: ['#111', '#222', '#333', '#444'] },
    caps: { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true },
    canvasW: W,
    canvasH: H,
    ...extra,
  });
const isForm = (it) => typeof it.key === 'string' && it.key.startsWith('field-');
const hash = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);

ok('build: no lean field is byte-identical; with it the poem leans and nothing else of the form changes', () => {
  const plain = build();
  assert.equal(hash(build().items), hash(plain.items), 'deterministic');
  assert.equal(hash(build({ fluidDrift: null }).items), hash(plain.items), 'null field: byte-identical');
  const leaned = build({ fluidDrift: field() });
  const p = plain.items.filter(isForm);
  const l = leaned.items.filter(isForm);
  assert.ok(p.length > 0 && l.length === p.length, 'the same glyphs');
  let moved = 0;
  for (let k = 0; k < p.length; k++) {
    const a = p[k];
    const b = l.find((x) => x.key === a.key);
    assert.ok(b, 'every glyph stays');
    for (const f of ['assetId', 'scale', 'scaleY', 'rotation', 'alpha', 'color', 'accent'])
      assert.deepEqual(b[f], a[f], `glyph ${f} unchanged`);
    if (a.x !== b.x || a.y !== b.y) moved++;
  }
  assert.ok(moved > 0, `poem glyphs leaned (${moved})`);
});

ok('build: LIFE never touches a poem glyph (a held form is present, not a ghost)', () => {
  const dead = { coupling: 0, life: 1, sampler: { sample: (x, y, o) => ((o.level = 0), (o.activity = 0), true) } };
  const plain = build().items.filter(isForm);
  const faded = build({ cultureScale: dead }).items.filter(isForm);
  assert.equal(hash(faded), hash(plain));
});

// ---------------------------------------------------------------- the live resolver
ok('resolver: the poem leans with a magnet, and is never copied (a stage of poem only seats no copy)', () => {
  const L = { id: 'lyr-a', name: 'lyr-a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
  const input = (f, fluid) => ({
    layers: [L],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
    seed: 4242,
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: {
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'random',
      count: 0,
      particleCount: 0,
      kinemeBreath: 0,
      kinemeDrift: 0,
      kinemePaletteBreath: 0,
      fieldForm: fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2' }, mkRng(42), { aspect: 1280 / 720 }).form,
    },
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    quality: 'balanced',
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    loopTimeMs: f * 16.7,
    dtSec: 0.0167,
    perfClampOverride: null,
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    phraseWrapGen: 0,
    attractor: null,
    mixSeconds: 0,
    canvasW: 1280,
    canvasH: 720,
    ...(fluid
      ? {
          dishFluid: fluidStamp(f * 16.7, { shed: 0 }),
          dishFluidMagnets: [{ x: 0.5, y: 0.5 }],
          dishFluidDial: { flow: 0.5, pull: 0.7, couple: 0 },
          dishFluidMarks: 1,
        }
      : {}),
  });
  const plain = createLiveResolver();
  const fluid = createLiveResolver();
  let leaned = 0;
  let poemSeen = 0;
  for (let f = 0; f < 90; f++) {
    const p = plain.resolveLayers(input(f, false)).flatMap((l) => (Array.isArray(l.items) ? l.items : []));
    const q = fluid.resolveLayers(input(f, true)).flatMap((l) => (Array.isArray(l.items) ? l.items : []));
    assert.equal(q.filter(isFluidDuplicate).length, 0, `frame ${f}: the poem is never copied`);
    const pf = p.filter(isForm);
    poemSeen += pf.length;
    for (const a of pf) {
      const b = q.find((x) => x.key === a.key);
      assert.ok(b, 'every poem glyph stays');
      if (a.x !== b.x || a.y !== b.y) leaned++;
    }
  }
  assert.ok(poemSeen > 0, 'the poem was on stage');
  assert.ok(leaned > 0, `poem glyphs leaned in the live resolver (${leaned} glyph-frames)`);
});

console.log(`dishFluidPoem: ${n} checks ok`);
