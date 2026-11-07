// node src/engine/dishLifeCoupling.selfcheck.mjs
// #1923 Phase 2 slice A — the coupling's first consumer: SCALE, reading the field culture through
// the shared seam (engine/dishLifeCouple.mjs). Matt's rulings (2026-11-06): coupling above zero is
// the on-switch (no chip; the dial starts at 0); scale is the first modulation — marks swell where
// the culture is alive, shrink where it is dead. Pinned here:
//   seam        the factor law is exact (neutral at mid level, ±SCALE_SWELL at the extremes, linear
//               in the dial); the governor's CULTURE HELD folds the effective coupling to 0
//   sampler     nearest cell over the stage's published holder; the seed → field → sample round-trip
//               reads the culture's own arrays; sampling never mutates the field
//   applier     gates closed = untouched; the artist's still pins are skipped; scale and scaleY move
//               together; the same inputs give the same fold, twice
//   form        FIELD form items are structurally out of reach (built outside the SoA): with a
//               uniformly alive or dead field the marks move and the poem does not
//   resolver    coupling 0 (or publication alone, or a dial with no field) is byte-identical to the
//               pre-Phase-2 resolver; coupling up modulates from the second frame, bounded by the
//               ruled factors, in both directions, tracking the culture as it evolves and re-seeds;
//               shed 2 restores the plain frame exactly; dropping the stamp drops the effect with
//               it; a mid-coupling snapshot restores and continues bit-identically; a non-field
//               stamp on the field slot can never make the field stage draw
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  clampCoupling,
  effectiveCoupling,
  cultureScaleFactor,
  fieldSampler,
  applyCultureScale,
  COUPLING_MAX,
  SCALE_NEUTRAL_LEVEL,
  SCALE_SWELL,
  SHED_HOLD,
} from './dishLifeCouple.mjs';
import { createDishLifeStage } from './dishLifeStage.mjs';
import { buildPlacements } from './buildPlacements.js';
import { createLiveResolver, checkResolverSnapshot } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { fieldDealReport } from '../poets/fieldForm.js';
import { mkRng } from './prng.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

// ---------------------------------------------------------------- seam: the factor law
ok('clampCoupling: the dial range, junk reads as off', () => {
  assert.equal(clampCoupling(0), 0);
  assert.equal(clampCoupling(0.5), 0.5);
  assert.equal(clampCoupling(1), COUPLING_MAX);
  assert.equal(clampCoupling(7), 1, 'clamped to the range');
  assert.equal(clampCoupling(-2), 0);
  for (const junk of [NaN, 'x', undefined, null, {}]) assert.equal(clampCoupling(junk), 0);
});

ok('effectiveCoupling: the governor’s hold folds the dial to 0; trickle passes it through', () => {
  assert.equal(effectiveCoupling(0.8, 0), 0.8);
  assert.equal(effectiveCoupling(0.8, 1), 0.8, 'shed 1 (trickle): the dial stays live');
  assert.equal(effectiveCoupling(0.8, SHED_HOLD), 0, 'shed 2 (CULTURE HELD): coupling reads as 0');
  assert.equal(effectiveCoupling(0.8, 5), 0, 'any deeper shed reads as held too');
  assert.equal(effectiveCoupling(0, 0), 0);
  assert.equal(effectiveCoupling('x', 0), 0);
});

ok('cultureScaleFactor: neutral at mid level, ±SWELL at the extremes, linear in the dial', () => {
  assert.equal(cultureScaleFactor(SCALE_NEUTRAL_LEVEL, 1), 1, 'a mid field is neutral at full dial');
  assert.equal(cultureScaleFactor(SCALE_NEUTRAL_LEVEL, 0.3), 1, 'neutral at any dial');
  assert.equal(cultureScaleFactor(1, 1), 1 + SCALE_SWELL, 'fully alive at full dial: the swell bound');
  assert.equal(cultureScaleFactor(0, 1), 1 - SCALE_SWELL, 'fully dead at full dial: the shrink bound');
  assert.equal(cultureScaleFactor(1, 0.5), 1 + SCALE_SWELL / 2, 'the dial scales the effect linearly');
  assert.equal(cultureScaleFactor(0.75, 1), 1 + SCALE_SWELL / 2);
  assert.equal(cultureScaleFactor(1, 0), 1, 'dial 0: no level moves anything');
  assert.equal(cultureScaleFactor(0, 0), 1);
  assert.equal(cultureScaleFactor(9, 1), 1 + SCALE_SWELL, 'levels clamp');
  assert.equal(cultureScaleFactor(1, 'x'), 1, 'a junk dial is off');
});

// ---------------------------------------------------------------- sampler: over a hand-built holder
const holder = (over = {}) => ({
  active: true,
  cols: 2,
  rows: 1,
  gen: 3,
  level: new Float32Array([1, 0]),
  activity: new Float32Array([0.5, 0.25]),
  ...over,
});

ok('fieldSampler: null unless a field is actually published', () => {
  assert.equal(fieldSampler(null, 100, 50), null);
  assert.equal(fieldSampler(holder({ active: false }), 100, 50), null, 'an inactive holder publishes nothing');
  assert.equal(fieldSampler(holder({ level: null }), 100, 50), null);
  assert.equal(fieldSampler(holder({ cols: 0 }), 100, 50), null);
  assert.ok(fieldSampler(holder(), 100, 50), 'a live holder samples');
});

ok('fieldSampler: nearest cell, outside the canvas reads false, the field is never mutated', () => {
  const h = holder();
  const before = [...h.level].join(',') + '|' + [...h.activity].join(',');
  const s = fieldSampler(h, 100, 50);
  assert.deepEqual([s.cols, s.rows, s.gen], [2, 1, 3]);
  const out = { level: -1, activity: -1 };
  assert.equal(s.sample(25, 25, out), true);
  assert.deepEqual([out.level, out.activity], [1, 0.5], 'the left cell');
  assert.equal(s.sample(75, 25, out), true);
  assert.deepEqual([out.level, out.activity], [0, 0.25], 'the right cell');
  assert.equal(s.sample(50, 25, out), true);
  assert.equal(out.level, 0, 'the boundary belongs to the right cell (floor)');
  for (const [x, y] of [
    [-1, 25],
    [100, 25],
    [25, -1],
    [25, 50],
  ])
    assert.equal(s.sample(x, y, out), false, `outside (${x},${y})`);
  for (let i = 0; i < 200; i++) s.sample((i * 37) % 100, (i * 11) % 50, out);
  assert.equal([...h.level].join(',') + '|' + [...h.activity].join(','), before, 'sampling is a pure read');
});

// ---------------------------------------------------------------- sampler: the stage round-trip
ok('round-trip: seed → field → sample reads the culture’s own published arrays', () => {
  const stage = createDishLifeStage();
  const W = 1000;
  const H = 500;
  const mark = (x, y, extra = {}) => ({
    x,
    y,
    scale: 5,
    scaleY: 5,
    alpha: 80,
    assetId: 'a',
    color: '#111',
    accent: '#222',
    zTier: 1,
    glass: false,
    key: `m${x}-${y}`,
    ...extra,
  });
  const layers = () => [
    { id: 'L1', layoutParams: {}, items: [mark(250, 150), mark(500, 250), mark(750, 350), mark(300, 380)] },
  ];
  const fstamp = (gen) => ({ mode: 'field', wakeMs: 5000, gen, cycleGens: 48, shed: 0 });
  for (let g = 0; g <= 12; g++) stage.apply(fstamp(g), layers(), W, H);
  const pub = stage.publishedField;
  assert.equal(pub.active, true, 'the field is published');
  const s = fieldSampler(pub, W, H);
  assert.equal(s.gen, pub.gen);
  const out = { level: -1, activity: -1 };
  let alive = 0;
  for (let cy = 0; cy < pub.rows; cy++) {
    for (let cx = 0; cx < pub.cols; cx++) {
      const x = ((cx + 0.5) / pub.cols) * W;
      const y = ((cy + 0.5) / pub.rows) * H;
      assert.equal(s.sample(x, y, out), true);
      const i = cy * pub.cols + cx;
      assert.equal(out.level, pub.level[i], `cell ${cx},${cy}: level is the culture’s`);
      assert.equal(out.activity, pub.activity[i], `cell ${cx},${cy}: activity is the culture’s`);
      if (out.level > 0) alive++;
    }
  }
  assert.ok(alive > 0, 'the culture is alive somewhere over the scene');
  // the mark that seeded the colony reads a living cell at its own position in the first generations
  const fresh = createDishLifeStage();
  fresh.apply(fstamp(0), layers(), W, H);
  const s0 = fieldSampler(fresh.publishedField, W, H);
  assert.equal(s0.sample(500, 250, out), true);
  assert.ok(out.level > 0, 'a seed mark’s own cell is alive at generation 0');
});

// ---------------------------------------------------------------- applier: on a fake SoA
const fakeSoa = () => ({
  n: 4,
  x: new Float64Array([25, 75, 25, 500]), // the 4th mark sits outside the 100-wide canvas
  y: new Float64Array([25, 25, 25, 25]),
  scale: new Float64Array([2, 3, 4, 5]),
  scaleY: new Float64Array([2, 3, 4, 5]),
});
const liveSampler = () => fieldSampler(holder(), 100, 50);

ok('applyCultureScale: closed gates leave the SoA untouched', () => {
  for (const ctx of [
    null,
    undefined,
    {},
    { coupling: 0, sampler: liveSampler() },
    { coupling: 1 },
    { coupling: 1, sampler: null },
  ]) {
    const soa = fakeSoa();
    assert.equal(applyCultureScale(soa, ctx), 0);
    assert.deepEqual([...soa.scale], [2, 3, 4, 5], 'untouched');
  }
});

ok('applyCultureScale: swell/shrink by the sampled level; still pins and off-canvas marks are skipped', () => {
  const soa = fakeSoa();
  const still = new Uint8Array([0, 0, 1, 0]); // the 3rd mark is the artist's pin
  const touched = applyCultureScale(soa, { coupling: 1, sampler: liveSampler() }, still);
  assert.equal(touched, 2, 'two marks moved: the alive one and the dead one');
  assert.ok(near(soa.scale[0], 2 * (1 + SCALE_SWELL)), 'alive cell: swells');
  assert.ok(near(soa.scaleY[0], 2 * (1 + SCALE_SWELL)), 'scaleY moves with scale');
  assert.ok(near(soa.scale[1], 3 * (1 - SCALE_SWELL)), 'dead cell: shrinks');
  assert.equal(soa.scale[2], 4, 'a still-pinned mark is never modulated (lock-respecting)');
  assert.equal(soa.scale[3], 5, 'a mark outside the canvas has no cell to read');
});

ok('applyCultureScale: the same inputs give the same fold twice (replay), and the field is unmutated', () => {
  const h = holder();
  const before = [...h.level].join(',');
  const sampler = fieldSampler(h, 100, 50);
  const a = fakeSoa();
  const b = fakeSoa();
  applyCultureScale(a, { coupling: 0.7, sampler });
  applyCultureScale(b, { coupling: 0.7, sampler });
  assert.deepEqual([...a.scale], [...b.scale]);
  assert.deepEqual([...a.scaleY], [...b.scaleY]);
  assert.equal([...h.level].join(','), before, 'one-way: the consumer never writes the field');
});

// ---------------------------------------------------------------- buildPlacements: the poem is out of reach
const seamAssets = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const seamPalette = { swatches: ['#111', '#222', '#333', '#444'] };
const seamParams = {
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
const seamCaps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
const uniformSampler = (level) => ({
  sample(x, y, out) {
    out.level = level;
    out.activity = 0;
    return true;
  },
});
const seamForm = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2' }, mkRng(42), { aspect: 10 / 7 }).form;
const seamBuild = (cultureScale) =>
  buildPlacements({
    layoutParams: { ...seamParams, fieldForm: seamForm },
    seed: 0x1a4f,
    activeAssets: seamAssets,
    palette: seamPalette,
    caps: seamCaps,
    canvasW: 1000,
    canvasH: 700,
    ...(cultureScale ? { cultureScale } : {}),
  });
const isFormItem = (it) => typeof it.key === 'string' && it.key.startsWith('field-');

ok('form exclusion: with the dial up the marks move and the poem does not — alive or dead field alike', () => {
  const control = new Map(seamBuild(null).items.map((it) => [it.key, it]));
  assert.ok([...control.values()].some(isFormItem), 'the fixture really carries a form');
  for (const [level, want] of [
    [1, 1 + SCALE_SWELL],
    [0, 1 - SCALE_SWELL],
  ]) {
    const coupled = seamBuild({ coupling: 1, sampler: uniformSampler(level) }).items;
    let moved = 0;
    for (const it of coupled) {
      const base = control.get(it.key);
      assert.ok(base, `same item set (${it.key})`);
      if (isFormItem(it)) {
        assert.equal(it.scale, base.scale, `form item ${it.key}: the culture never scales the poem`);
        assert.equal(it.x, base.x);
        assert.equal(it.y, base.y);
      } else {
        assert.ok(near(it.scale / base.scale, want), `mark ${it.key} folds by the field`);
        moved++;
      }
    }
    assert.ok(moved > 0, 'the marks really moved');
  }
});

// ---------------------------------------------------------------- resolver level
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
  // The resolver harness runs with the living-motion amounts ZEROED: this suite pins the SCALE fold,
  // and since slice B the same dial also drives the breath channel — with breath live, an item's
  // scale ratio would carry both consumers and the pure-factor bounds below could not hold. The
  // breath consumer's own resolver pins (dial-0 identity WITH breath on, composition, shed) live in
  // dishLifeBreathing.selfcheck.mjs.
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
// dishField slot only, no dishFieldCoupling key → the plain input shape with a publishing field
const runFieldOnly = (frames, shed = 0) => {
  const r = createLiveResolver();
  const hashes = [];
  for (let f = 0; f < frames; f++)
    hashes.push(hash(r.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f, shed) }))));
  const snap = r.snapshotState();
  r.dispose();
  return { hashes, snap };
};
const runPlain = (frames) => {
  const r = createLiveResolver();
  const hashes = [];
  for (let f = 0; f < frames; f++)
    hashes.push(hash(r.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000 }))));
  r.dispose();
  return hashes;
};
const runCoupled = (frames, { coupling = 1, shed = 0, wakeMs = 0, genOf = (f) => f } = {}) => {
  const r = createLiveResolver();
  const hashes = [];
  const outs = [];
  for (let f = 0; f < frames; f++) {
    const out = r.resolveLayers(
      baseInput({
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        dishField: fstamp(genOf(f), shed, wakeMs),
        dishFieldCoupling: coupling,
      }),
    );
    hashes.push(hash(out));
    outs.push(out);
  }
  const snap = r.snapshotState();
  r.dispose();
  return { hashes, outs, snap };
};
const itemsOf = (out) => out.find((l) => Array.isArray(l.items))?.items ?? [];

ok('off shapes are byte-identical: publication alone, dial 0, and a dial with no field all read as plain', () => {
  const plain = runPlain(30);
  assert.deepEqual(runCoupled(30, { coupling: 0 }).hashes, plain, 'dial 0 with a live field: nothing moves');
  const fieldOnly = runFieldOnly(30);
  assert.deepEqual(fieldOnly.hashes, plain, 'a publishing field with no coupling key: nothing moves');
  assert.ok(fieldOnly.snap.dishField, '…but the field really ran and its state rides the snapshot');
  const dialNoField = (() => {
    const r = createLiveResolver();
    const hashes = [];
    for (let f = 0; f < 30; f++)
      hashes.push(hash(r.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishFieldCoupling: 1 }))));
    const snap = r.snapshotState();
    r.dispose();
    return { hashes, snap };
  })();
  assert.deepEqual(dialNoField.hashes, plain, 'a dial with no field stamp: nothing to read, nothing moves');
  assert.equal(dialNoField.snap.dishField, undefined, 'no field state without stamps');
});

ok('the consumer acts: from the second frame, bounded by the ruled factors, in both directions', () => {
  const plain = createLiveResolver();
  const coupled = createLiveResolver();
  const ratiosAt = (f) => {
    const p = itemsOf(plain.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f) })));
    const c = itemsOf(
      coupled.resolveLayers(
        baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 1 }),
      ),
    );
    const pm = new Map(p.map((it) => [it.key, it]));
    return c.map((it) => it.scale / pm.get(it.key).scale);
  };
  const f0 = ratiosAt(0);
  assert.ok(
    f0.every((r) => r === 1),
    'frame 0: nothing published yet — the modulation cannot act',
  );
  const f1 = ratiosAt(1);
  assert.ok(
    f1.every((r) => r >= 1 - SCALE_SWELL - 1e-9 && r <= 1 + SCALE_SWELL + 1e-9),
    'bounded by the factors',
  );
  assert.ok(near(Math.max(...f1), 1 + SCALE_SWELL), 'the colony’s own cells swell to the bound at the seed generation');
  assert.ok(near(Math.min(...f1), 1 - SCALE_SWELL), 'dead territory shrinks to the bound even at the seed generation');
  assert.ok(
    f1.some((r) => r > 1) && f1.some((r) => r < 1),
    'both directions at once — swell where alive, shrink where dead',
  );
  let f10;
  for (let f = 2; f <= 10; f++) f10 = ratiosAt(f);
  assert.ok(
    f10.every((r) => r >= 1 - SCALE_SWELL - 1e-9 && r <= 1 + SCALE_SWELL + 1e-9),
    'still bounded at gen 10',
  );
  const upCount = (rs) => rs.filter((r) => r > 1).length;
  assert.notEqual(upCount(f10), upCount(f1), 'the modulation tracks the culture as it evolves (the mix turns)');
  plain.dispose();
  coupled.dispose();
});

ok('governor shed: CULTURE HELD (shed 2) restores the plain frame exactly; trickle (shed 1) still acts', () => {
  const plain = runPlain(30);
  assert.deepEqual(
    runCoupled(30, { coupling: 1, shed: 2 }).hashes,
    plain,
    'shed 2: the coupling drops out cleanly — output equals coupling-0 output',
  );
  const trickle = runCoupled(30, { coupling: 1, shed: 1 });
  assert.notDeepEqual(trickle.hashes, plain, 'shed 1: the culture trickles and the dial still acts');
});

ok('drop-out: when the stamp stops, the very next frames are the plain frames again', () => {
  const plain = runPlain(30);
  const r = createLiveResolver();
  for (let f = 0; f < 30; f++) {
    const stamped = f < 10;
    const out = r.resolveLayers(
      baseInput({
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        ...(stamped ? { dishField: fstamp(f), dishFieldCoupling: 1 } : {}),
      }),
    );
    if (f >= 10) assert.equal(hash(out), plain[f], `frame ${f}: un-stamped again, exactly plain`);
  }
  r.dispose();
});

ok('re-seed tracking: a new cycle re-seeds from the stage and the modulation follows it', () => {
  const plain = runPlain(30);
  // cycle 1 wakes at 0; at frame 15 the 12 s field cycle turns over (wakeMs 12000) and gen restarts
  const r = createLiveResolver();
  const hashes = [];
  for (let f = 0; f < 30; f++) {
    const wake = f < 15 ? 0 : 12000;
    const gen = f < 15 ? f : f - 15;
    hashes.push(
      hash(
        r.resolveLayers(
          baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(gen, 0, wake), dishFieldCoupling: 1 }),
        ),
      ),
    );
  }
  r.dispose();
  assert.notDeepEqual(hashes.slice(0, 15), plain.slice(0, 15), 'cycle 1 acts');
  assert.notEqual(hashes[17], plain[17], 'two frames after the re-seed the re-published field is still driving scale');
  assert.notEqual(hashes[25], plain[25], 'and it keeps driving through the second cycle');
});

ok('snapshot/restore: a take that begins mid-coupling continues bit-identically', () => {
  const uninterrupted = runCoupled(30, { coupling: 0.8 });
  const a = createLiveResolver();
  for (let f = 0; f < 15; f++)
    a.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 0.8 }));
  const snap = JSON.parse(JSON.stringify(a.snapshotState()));
  assert.equal(checkResolverSnapshot(snap), true, 'the mid-coupling snapshot is well-formed');
  assert.ok(snap.dishField, 'the field state rides the snapshot beside the visual culture’s');
  assert.equal(checkResolverSnapshot({ ...snap, dishField: 5 }), false, 'a malformed field state is refused');
  assert.equal(checkResolverSnapshot({ ...snap, dishField: { ...snap.dishField, marks: 'x' } }), false);
  const { dishField: _drop, ...prePhase2 } = snap;
  assert.equal(checkResolverSnapshot(prePhase2), true, 'a snapshot without the field key is still well-formed');
  const b = createLiveResolver();
  b.restoreState(snap);
  for (let f = 15; f < 30; f++) {
    const out = b.resolveLayers(
      baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 0.8 }),
    );
    assert.equal(hash(out), uninterrupted.hashes[f], `frame ${f} after restore`);
  }
  a.dispose();
  b.dispose();
});

ok('replay: the same coupled input stream resolves bit-identically on a fresh resolver', () => {
  assert.deepEqual(runCoupled(30, { coupling: 0.65 }).hashes, runCoupled(30, { coupling: 0.65 }).hashes);
});

ok('the field slot is mode-guarded: a quiet stamp there can never make the field stage draw', () => {
  const plain = runPlain(10);
  const r = createLiveResolver();
  for (let f = 0; f < 10; f++) {
    const out = r.resolveLayers(
      baseInput({
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        dishField: { mode: 'quiet', wakeMs: 0, gen: 1, strength: 0.9, shed: 0 },
        dishFieldCoupling: 1,
      }),
    );
    assert.equal(hash(out), plain[f], `frame ${f}: the wrong mode reads as no stamp`);
    for (const layer of out)
      for (const it of layer.items ?? [])
        assert.ok(!String(it.key).startsWith('speck:'), 'no specks from the field slot');
  }
  r.dispose();
});

console.log(`[selfcheck] dishLifeCoupling (#1923 Phase 2 slice A): ${n} cases passed`);
