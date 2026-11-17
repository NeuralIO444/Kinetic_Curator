// node src/engine/dishLifeRollEase.selfcheck.mjs
// #2152 slice 3 — the cycle-roll ease (Matt, 2026-11-17: "ease back in"). When the field culture re-seeds, the consumers blend
// from the grid it rolled from to the new one over ROLL_EASE_GENS generations, so dead marks fade back up instead of popping.
// Pinned:
//   law       no ease asked, no grid, or outside the window → exactly the live level; generation 0 reads the old grid, the
//             window's end the new one, straight between; a mismatched grid is ignored; the sampler eases the same way
//   stage     the first wake publishes no grid; a roll publishes the old culture's last level grid; a "seed from stage" press
//             does too; a replay seek-back keeps it; a snapshot inside the window carries it and restore() eases the same;
//             outside the window the snapshot carries no key
//   resolver  without the recorded marker every frame is byte-identical to slice 2 (older takes replay unchanged); with it,
//             frames differ only inside the window after a roll, and the biggest one-frame jump in the marks' opacity at
//             the roll is smaller; copies ease too; the stream replays bit-identically
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { easedLevel, fieldSampler, ROLL_EASE_GENS } from './dishLifeCouple.mjs';
import { lifeBornItems, isLifeBorn } from './dishLifeBorn.mjs';
import { createDishLifeStage } from './dishLifeStage.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- the law
const pub = (gen, over = {}) => ({
  active: true,
  cols: 4,
  rows: 1,
  gen,
  level: new Float32Array([1, 0, 0.5, 1]),
  activity: new Float32Array(4),
  rollFrom: new Float32Array([0, 1, 0.5, 1]),
  ...over,
});

ok('law: no ease, no grid or outside the window reads the live level; inside it blends straight', () => {
  for (const g of [0, 1, 2, 3]) assert.equal(easedLevel(pub(g), 0, false), 1, 'not asked: live');
  assert.equal(easedLevel(pub(0, { rollFrom: null }), 1, true), 0, 'no grid: live');
  assert.equal(easedLevel(pub(ROLL_EASE_GENS), 0, true), 1, 'the window end: live');
  assert.equal(easedLevel(pub(9), 1, true), 0, 'past the window: live');
  assert.equal(easedLevel(pub(0, { rollFrom: new Float32Array(3) }), 0, true), 1, 'a mismatched grid is ignored');
  assert.equal(easedLevel(pub(0), 0, true), 0, 'generation 0: the old grid exactly (no pop)');
  assert.equal(easedLevel(pub(0), 1, true), 1);
  for (let g = 0; g < ROLL_EASE_GENS; g++) {
    assert.ok(near(easedLevel(pub(g), 0, true), g / ROLL_EASE_GENS), 'a dead mark fades back up');
    assert.ok(near(easedLevel(pub(g), 1, true), 1 - g / ROLL_EASE_GENS), 'a mark the new seed leaves dead fades out');
    assert.equal(easedLevel(pub(g), 3, true), 1, 'unchanged cells never move');
  }
});

ok('law: the sampler eases only when asked, and only inside the window', () => {
  const out = { level: -1, activity: -1 };
  fieldSampler(pub(1), 400, 100).sample(50, 50, out);
  assert.equal(out.level, 1, 'not asked');
  fieldSampler(pub(1), 400, 100, { ease: true }).sample(50, 50, out);
  assert.ok(near(out.level, 1 / ROLL_EASE_GENS), 'asked, inside');
  fieldSampler(pub(ROLL_EASE_GENS), 400, 100, { ease: true }).sample(50, 50, out);
  assert.equal(out.level, 1, 'asked, past the window');
});

ok('law: copies read the eased level', () => {
  const p = pub(0, {
    cols: 20,
    rows: 10,
    level: new Float32Array(200).fill(0),
    rollFrom: new Float32Array(200).fill(1),
  });
  const mark = { x: 550, y: 550, scale: 0.02, scaleY: 0.02, alpha: 80, key: 'm', assetId: 'a' };
  const args = { W: 2000, H: 1000, life: 1, share: Infinity };
  assert.equal(
    lifeBornItems(p, [{ items: [mark] }], args).flat().length,
    0,
    'not eased: the new seed is dead, no copies',
  );
  assert.ok(
    lifeBornItems(p, [{ items: [mark] }], { ...args, ease: true }).flat().length > 0,
    'eased: the old copies stay',
  );
});

// ---------------------------------------------------------------- the stage
const marksLayer = () => [
  {
    items: Array.from({ length: 60 }, (_, k) => ({
      x: 40 + ((k * 97) % 1200),
      y: 40 + ((k * 53) % 640),
      scale: 0.6,
      alpha: 80,
      key: `m${k}`,
      assetId: 'a',
    })),
  },
];
const fst = (wakeMs, gen, extra = {}) => ({ mode: 'field', wakeMs, gen, cycleGens: 48, shed: 0, ...extra });

ok('stage: the first wake has no grid; a roll and a press publish the old culture; seek-back keeps it', () => {
  const s = createDishLifeStage();
  for (let g = 0; g <= 10; g++) s.apply(fst(0, g), marksLayer(), 1280, 720);
  assert.equal(s.publishedField.rollFrom, null, 'first wake: nothing to ease from');
  const before = Float32Array.from(s.publishedField.level);
  s.apply(fst(6000, 0), marksLayer(), 1280, 720);
  assert.deepEqual([...s.publishedField.rollFrom], [...before], 'the roll keeps the old culture grid');
  const rolled = Float32Array.from(s.publishedField.rollFrom);
  s.apply(fst(6000, 2), marksLayer(), 1280, 720);
  s.apply(fst(6000, 1), marksLayer(), 1280, 720); // a replay seeking back
  assert.deepEqual([...s.publishedField.rollFrom], [...rolled], 'seek-back: the same seed, the same grid');
  const pre = Float32Array.from(s.publishedField.level);
  s.apply(fst(6000, 1, { seed: true }), marksLayer(), 1280, 720);
  assert.deepEqual([...s.publishedField.rollFrom], [...pre], 'a press eases from where it stood');
  s.apply(null, marksLayer(), 1280, 720);
  assert.equal(s.publishedField.rollFrom, null, 'off: nothing published');
});

ok('stage: a snapshot inside the window carries the grid and restores it; outside it carries none', () => {
  const s = createDishLifeStage();
  for (let g = 0; g <= 6; g++) s.apply(fst(0, g), marksLayer(), 1280, 720);
  s.apply(fst(6000, 1), marksLayer(), 1280, 720);
  const snap = s.snapshot();
  assert.ok(Array.isArray(snap.rollFrom), 'inside the window: the rider');
  const r = createDishLifeStage();
  r.restore(JSON.parse(JSON.stringify(snap)));
  assert.deepEqual([...r.publishedField.rollFrom], [...s.publishedField.rollFrom], 'restored exactly');
  s.apply(fst(6000, ROLL_EASE_GENS + 2), marksLayer(), 1280, 720);
  assert.ok(!('rollFrom' in s.snapshot()), 'past the window: no key');
});

// ---------------------------------------------------------------- the real resolver
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    count: 60,
    particleCount: 60,
    mode: 'random',
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
  },
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 0,
  dtSec: 1 / 60,
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
  ...over,
});
const DT = 16.7;
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    if (ArrayBuffer.isView(v)) return `${v.constructor.name}[${[...v].join(',')}]`;
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${k}:${canon(v[k])}`)
      .join(',')}}`;
  }
  return String(v);
};
const hash = (layers) => createHash('sha256').update(canon(layers)).digest('hex').slice(0, 16);
const fstamp = (gen, shed = 0, wakeMs = 0) => ({ mode: 'field', wakeMs, gen, cycleGens: 48, shed });
const itemsOf = (out) => out.find((l) => Array.isArray(l.items))?.items ?? [];
// a stream with a roll at frame ROLL: wake 0 for frames 0..ROLL-1, then the next wake from generation 0
const ROLL = 20;
const FRAMES = 36;
const stampOf = (f) => (f < ROLL ? fstamp(f, 0, 0) : fstamp(f - ROLL, 0, 6000));
const run = ({ ease, life = 1, coupling = 0.6 } = {}) => {
  const r = createLiveResolver();
  const hashes = [];
  const outs = [];
  for (let f = 0; f < FRAMES; f++) {
    const out = r.resolveLayers(
      baseInput({
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        dishField: stampOf(f),
        dishFieldCoupling: coupling,
        dishFieldLife: life,
        dishFieldBorn: 1,
        ...(ease ? { dishFieldEase: 1 } : {}),
      }),
    );
    hashes.push(hash(out));
    outs.push(itemsOf(out).map((it) => ({ key: it.key, alpha: it.alpha })));
  }
  r.dispose();
  return { hashes, outs };
};
const biggestJump = (outs, f) => {
  const prev = new Map(outs[f - 1].filter((it) => !isLifeBorn(it)).map((it) => [it.key, it.alpha]));
  let most = 0;
  for (const it of outs[f])
    if (!isLifeBorn(it) && prev.has(it.key)) most = Math.max(most, Math.abs(it.alpha - prev.get(it.key)));
  return most;
};

ok('resolver: without the marker the roll is exactly slice 2; with it frames differ only inside the window', () => {
  const plain = run({ ease: false });
  const eased = run({ ease: true });
  // the field is read one frame behind: the new wake's generations 0..ROLL_EASE_GENS-1 are read on frames ROLL+1 .. ROLL+4
  for (let f = 0; f < FRAMES; f++) {
    const inside = f > ROLL && f <= ROLL + ROLL_EASE_GENS;
    if (!inside) assert.equal(eased.hashes[f], plain.hashes[f], `frame ${f}: outside the window, identical`);
  }
  assert.ok(
    eased.hashes.some((h, f) => h !== plain.hashes[f]),
    'inside the window the ease really acts',
  );
  const jp = biggestJump(plain.outs, ROLL + 1);
  const je = biggestJump(eased.outs, ROLL + 1);
  assert.ok(je < jp, `the roll pops less (biggest one-frame opacity jump: ${je.toFixed(1)} eased vs ${jp.toFixed(1)})`);
  console.log(`    biggest opacity jump at the roll: ${jp.toFixed(1)} → ${je.toFixed(1)}`);
});

ok('resolver: the eased stream replays bit-identically', () => {
  assert.deepEqual(run({ ease: true }).hashes, run({ ease: true }).hashes);
});

console.log(`[selfcheck] dishLifeRollEase (#2152 slice 3): ${n} cases passed`);
