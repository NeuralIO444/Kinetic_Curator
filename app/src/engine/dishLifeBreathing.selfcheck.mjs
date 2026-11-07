// node src/engine/dishLifeBreathing.selfcheck.mjs
// #1923 Phase 2 slice B — the coupling's second consumer: FIELD glyph breathing. The field culture's
// ACTIVITY under a glyph drives the DEPTH of the breath the glyph already has — the kineme breath
// driver (engine/kineme.js) — read through slice A's seam (engine/dishLifeCouple.mjs), on the SAME
// dial (input.dishFieldCoupling), the SAME shed fold, the SAME one-frame-behind publication. Pinned:
//   seam      the factor law is exact (neutral at mid activity, ±BREATH_SWELL at the extremes, linear
//             in the dial, clamped); breath reads ACTIVITY, never level (scale's field)
//   driver    the modulation multiplies the breath TERM only: the anchor at driver time 0 stays
//             exact, the phase/zero-crossings never move (depth, not rate), other drivers are
//             untouched, off-canvas marks breathe their own breath, the field is never mutated
//   tracking  the same glyph at the same loop time breathes by the CURRENT publication: swap the
//             activity under it (by hand, and through a real stage's evolving publication) and the
//             breath follows by the factor ratio
//   build     through buildPlacements: mid activity is the dealt breath exactly; the deviation law
//             holds at both extremes; scale (level) and breath (activity) compose with neither
//             applied twice; FORM items and still-pinned marks are out of reach
//   resolver  with the living-motion floor LIVE (default amounts): dial 0 / publication alone / a
//             dial with no field are byte-identical to plain; the consumer acts from the second
//             frame; shed 2 drops BOTH consumers together; drop-out, snapshot/restore and replay
//             hold bit-identically
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cultureBreathFactor,
  cultureScaleFactor,
  fieldSampler,
  BREATH_NEUTRAL_ACTIVITY,
  BREATH_SWELL,
  SCALE_SWELL,
} from './dishLifeCouple.mjs';
import { createDishLifeStage } from './dishLifeStage.mjs';
import { evaluateKineme } from './kineme.js';
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
ok('cultureBreathFactor: neutral at mid activity, ±BREATH_SWELL at the extremes, linear in the dial', () => {
  assert.equal(cultureBreathFactor(BREATH_NEUTRAL_ACTIVITY, 1), 1, 'a mid field is neutral at full dial');
  assert.equal(cultureBreathFactor(BREATH_NEUTRAL_ACTIVITY, 0.3), 1, 'neutral at any dial');
  assert.equal(cultureBreathFactor(1, 1), 1 + BREATH_SWELL, 'fully lively at full dial: the deep bound');
  assert.equal(cultureBreathFactor(0, 1), 1 - BREATH_SWELL, 'fully dead at full dial: the shallow bound');
  assert.ok(1 - BREATH_SWELL > 0, 'the floor is a shallower breath, never silence or inversion');
  assert.equal(cultureBreathFactor(1, 0.5), 1 + BREATH_SWELL / 2, 'the dial scales the effect linearly');
  assert.equal(cultureBreathFactor(0.75, 1), 1 + BREATH_SWELL / 2);
  assert.equal(cultureBreathFactor(1, 0), 1, 'dial 0: no activity moves anything');
  assert.equal(cultureBreathFactor(0, 0), 1);
  assert.equal(cultureBreathFactor(9, 1), 1 + BREATH_SWELL, 'activities clamp');
  assert.equal(cultureBreathFactor(-3, 1), 1 - BREATH_SWELL, 'activities clamp below too');
  assert.equal(cultureBreathFactor(1, 'x'), 1, 'a junk dial is off');
  for (let a = 0; a <= 1.0001; a += 0.05)
    for (const d of [0.25, 0.5, 1]) {
      const f = cultureBreathFactor(a, d);
      assert.ok(f >= 1 - BREATH_SWELL && f <= 1 + BREATH_SWELL, `bounded (activity ${a}, dial ${d})`);
    }
});

// ---------------------------------------------------------------- driver: evaluateKineme
const holder = (over = {}) => ({
  active: true,
  cols: 2,
  rows: 1,
  gen: 3,
  level: new Float32Array([0.3, 0.7]),
  activity: new Float32Array([1, 0]),
  ...over,
});
const mkSoa = () => ({
  n: 4,
  index: [1, 8, 15, 22],
  scale: new Float64Array([1, 1, 1, 1]),
  // marks 0,2 in the lively left cell; mark 1 in the dead right cell; mark 3 outside the 100-wide canvas
  x: new Float64Array([25, 75, 25, 500]),
  y: new Float64Array([25, 25, 25, 25]),
});
const breathCtx = (over = {}) => ({
  seed: 42,
  driverSec: 3.25,
  boilStep: 0,
  amounts: { breath: 1, drift: 0, pulse: 0, brushWobble: 0, paletteBreath: 0 },
  canvasW: 100,
  canvasH: 50,
  anchored: true,
  ...over,
});
const samplerOf = (h) => fieldSampler(h, 100, 50);

ok('driver: activity scales the breath term per mark — lively deepens, dead shallows, off-canvas untouched', () => {
  const base = evaluateKineme(mkSoa(), breathCtx());
  const mod = evaluateKineme(mkSoa(), breathCtx({ fieldBreath: { coupling: 1, sampler: samplerOf(holder()) } }));
  let checked = 0;
  for (const k of [0, 1, 2]) {
    if (Math.abs(base.dScale[k]) < 1e-3) continue;
    const want = k === 1 ? 1 - BREATH_SWELL : 1 + BREATH_SWELL;
    assert.ok(near(mod.dScale[k], base.dScale[k] * want, 1e-12), `mark ${k}: term × ${want}`);
    checked++;
  }
  assert.ok(checked >= 2, 'the fixture really exercises breathing marks in both cells');
  assert.equal(mod.dScale[3], base.dScale[3], 'a mark outside the canvas has no cell to read: its own breath');
});

ok('driver: breath reads ACTIVITY, never level — same activity at another level is the same breath', () => {
  const a = evaluateKineme(mkSoa(), breathCtx({ fieldBreath: { coupling: 1, sampler: samplerOf(holder()) } }));
  const b = evaluateKineme(
    mkSoa(),
    breathCtx({
      fieldBreath: { coupling: 1, sampler: samplerOf(holder({ level: new Float32Array([0.95, 0.05]) })) },
    }),
  );
  assert.deepEqual([...a.dScale], [...b.dScale], 'level is scale’s field; the breath never sees it');
});

ok('driver: mid activity and dial 0 are the dealt breath, number for number', () => {
  const base = evaluateKineme(mkSoa(), breathCtx());
  const mid = evaluateKineme(
    mkSoa(),
    breathCtx({
      fieldBreath: { coupling: 1, sampler: samplerOf(holder({ activity: new Float32Array([0.5, 0.5]) })) },
    }),
  );
  assert.deepEqual([...mid.dScale], [...base.dScale], 'activity at the neutral point: factor exactly 1');
  const off = evaluateKineme(mkSoa(), breathCtx({ fieldBreath: { coupling: 0, sampler: samplerOf(holder()) } }));
  assert.deepEqual([...off.dScale], [...base.dScale], 'a handed-over seam at dial 0 still cannot move the breath');
});

ok('driver: depth, not rate — the anchor at t=0 stays exact and the phase never moves', () => {
  const fb = { coupling: 1, sampler: samplerOf(holder()) };
  const at0 = evaluateKineme(mkSoa(), breathCtx({ driverSec: 0, fieldBreath: fb }));
  assert.ok(
    at0.dScale.every((v) => v === 0),
    'anchored: at driver time 0 every mark sits at its placed scale, modulated or not',
  );
  for (const t of [0.7, 1.9, 3.25, 5.8, 11.4]) {
    const base = evaluateKineme(mkSoa(), breathCtx({ driverSec: t }));
    const mod = evaluateKineme(mkSoa(), breathCtx({ driverSec: t, fieldBreath: fb }));
    for (const k of [0, 1, 2]) {
      assert.equal(Math.sign(mod.dScale[k]), Math.sign(base.dScale[k]), `t=${t} mark ${k}: zero-crossings unmoved`);
      if (Math.abs(base.dScale[k]) > 1e-3) {
        const want = k === 1 ? 1 - BREATH_SWELL : 1 + BREATH_SWELL;
        assert.ok(
          near(mod.dScale[k] / base.dScale[k], want, 1e-9),
          `t=${t} mark ${k}: the ratio is the factor, at every t`,
        );
      }
    }
  }
});

ok('driver: only the breath term is modulated — drift and wobble read exactly as dealt', () => {
  const amounts = { breath: 1, drift: 0.8, pulse: 0.5, brushWobble: 0.4, paletteBreath: 0 };
  const base = evaluateKineme(mkSoa(), breathCtx({ amounts }));
  const mod = evaluateKineme(
    mkSoa(),
    breathCtx({ amounts, fieldBreath: { coupling: 1, sampler: samplerOf(holder()) } }),
  );
  assert.deepEqual([...mod.dx], [...base.dx], 'drift x untouched');
  assert.deepEqual([...mod.dy], [...base.dy], 'drift y untouched');
  assert.deepEqual([...mod.dWobble], [...base.dWobble], 'brush wobble untouched');
  assert.notDeepEqual([...mod.dScale], [...base.dScale], '…while the breath inside dScale really moved');
});

ok('driver: sampling never mutates the field (one-way read)', () => {
  const h = holder();
  const before = [...h.level].join(',') + '|' + [...h.activity].join(',');
  const fb = { coupling: 1, sampler: samplerOf(h) };
  for (const t of [0.5, 2, 4.5]) evaluateKineme(mkSoa(), breathCtx({ driverSec: t, fieldBreath: fb }));
  assert.equal([...h.level].join(',') + '|' + [...h.activity].join(','), before);
});

// ---------------------------------------------------------------- tracking: a moving culture
ok('tracking: swap the activity under a still glyph and its breath follows by the factor ratio', () => {
  const uniform = (activity) => ({
    sample(x, y, out) {
      out.level = 0.5;
      out.activity = activity;
      return true;
    },
  });
  const dead = evaluateKineme(mkSoa(), breathCtx({ fieldBreath: { coupling: 1, sampler: uniform(0) } }));
  const alive = evaluateKineme(mkSoa(), breathCtx({ fieldBreath: { coupling: 1, sampler: uniform(1) } }));
  let checked = 0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dead.dScale[k]) < 1e-3) continue;
    assert.ok(
      near(alive.dScale[k] / dead.dScale[k], (1 + BREATH_SWELL) / (1 - BREATH_SWELL), 1e-12),
      `mark ${k}: the same glyph, the same loop time — only the culture moved`,
    );
    checked++;
  }
  assert.ok(checked >= 2);
});

ok('tracking: through a real stage — as the published activity under a mark changes, so does its breath', () => {
  const stage = createDishLifeStage();
  const W = 1000;
  const H = 500;
  const mark = (x, y) => ({
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
  });
  const layers = () => [
    { id: 'L1', layoutParams: {}, items: [mark(250, 150), mark(500, 250), mark(750, 350), mark(300, 380)] },
  ];
  const fstamp = (gen) => ({ mode: 'field', wakeMs: 5000, gen, cycleGens: 48, shed: 0 });
  for (let g = 0; g <= 12; g++) stage.apply(fstamp(g), layers(), W, H);
  const pubA = stage.publishedField;
  const sampA = fieldSampler(pubA, W, H);
  const cell = { level: 0, activity: 0 };
  // find a cell whose activity the culture is about to change, then advance the culture and re-read
  let spot = null;
  outer: for (let cy = 0; cy < pubA.rows; cy++) {
    for (let cx = 0; cx < pubA.cols; cx++) {
      const x = ((cx + 0.5) / pubA.cols) * W;
      const y = ((cy + 0.5) / pubA.rows) * H;
      sampA.sample(x, y, cell);
      const a1 = cell.activity;
      const probe = createDishLifeStage();
      for (let g = 0; g <= 12; g++) probe.apply(fstamp(g), layers(), W, H);
      for (let g = 13; g <= 40; g++) probe.apply(fstamp(g), layers(), W, H);
      const sampB = fieldSampler(probe.publishedField, W, H);
      sampB.sample(x, y, cell);
      if (Math.abs(cell.activity - a1) > 0.25) {
        spot = { x, y, a1, a2: cell.activity, sampB };
        break outer;
      }
    }
  }
  assert.ok(spot, 'the evolving culture really changes the activity somewhere over the scene');
  const one = {
    n: 1,
    index: [8],
    scale: new Float64Array([1]),
    x: new Float64Array([spot.x]),
    y: new Float64Array([spot.y]),
  };
  const ctxAt = (sampler) => ({
    seed: 42,
    driverSec: 3.25,
    boilStep: 0,
    amounts: { breath: 1, drift: 0, pulse: 0, brushWobble: 0, paletteBreath: 0 },
    canvasW: W,
    canvasH: H,
    anchored: true,
    fieldBreath: { coupling: 0.9, sampler },
  });
  const dA = evaluateKineme(one, ctxAt(fieldSampler(pubA, W, H))).dScale[0];
  const dB = evaluateKineme(one, ctxAt(spot.sampB)).dScale[0];
  assert.ok(Math.abs(dA) > 1e-3, 'the probe glyph is mid-breath');
  assert.ok(
    near(dB / dA, cultureBreathFactor(spot.a2, 0.9) / cultureBreathFactor(spot.a1, 0.9), 1e-9),
    'the breath tracked the culture by exactly the factor ratio',
  );
});

// ---------------------------------------------------------------- build: buildPlacements
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
const uniformSampler = (level, activity) => ({
  sample(x, y, out) {
    out.level = level;
    out.activity = activity;
    return true;
  },
});
const kinemeCtx = (over = {}) => ({
  seed: 0x1a4f,
  driverSec: 2.3,
  boilStep: 0,
  amounts: { breath: 1, drift: 0, pulse: 0, brushWobble: 0, paletteBreath: 0 },
  canvasW: 1000,
  canvasH: 700,
  shedTier: 0,
  anchored: true,
  ...over,
});
const seamForm = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2' }, mkRng(42), { aspect: 10 / 7 }).form;
const build = ({ kineme = null, cultureScale = null, form = false } = {}) =>
  buildPlacements({
    layoutParams: { ...seamParams, ...(form ? { fieldForm: seamForm } : {}) },
    seed: 0x1a4f,
    activeAssets: seamAssets,
    palette: seamPalette,
    caps: seamCaps,
    canvasW: 1000,
    canvasH: 700,
    ...(kineme ? { kineme } : {}),
    ...(cultureScale ? { cultureScale } : {}),
  });
const byKey = (out) => new Map(out.items.map((it) => [it.key, it]));
const isFormItem = (it) => typeof it.key === 'string' && it.key.startsWith('field-');
const marksOf = (out) => out.items.filter((it) => !isFormItem(it));

ok('build: the deviation law — a glyph’s breath deviation scales by the factor at both extremes', () => {
  const base = byKey(build({})); // no kineme: the placed scales
  const dealt = byKey(build({ kineme: kinemeCtx() })); // the dealt breath
  for (const activity of [0, 1]) {
    const mod = byKey(
      build({ kineme: kinemeCtx({ fieldBreath: { coupling: 1, sampler: uniformSampler(0.5, activity) } }) }),
    );
    const f = cultureBreathFactor(activity, 1);
    let checked = 0;
    for (const it of marksOf(build({}))) {
      const dev0 = dealt.get(it.key).scale / base.get(it.key).scale - 1;
      const dev1 = mod.get(it.key).scale / base.get(it.key).scale - 1;
      assert.ok(near(dev1, dev0 * f), `mark ${it.key} at activity ${activity}: deviation × ${f}`);
      if (Math.abs(dev0) > 1e-4) checked++;
    }
    assert.ok(checked >= 10, `activity ${activity}: the fixture really breathes (${checked} marks checked)`);
  }
});

ok('build: mid activity through the whole build is the dealt breath exactly', () => {
  const dealt = build({ kineme: kinemeCtx() });
  const mid = build({
    kineme: kinemeCtx({ fieldBreath: { coupling: 1, sampler: uniformSampler(0.5, BREATH_NEUTRAL_ACTIVITY) } }),
  });
  assert.deepEqual(
    mid.items.map((it) => [it.key, it.scale, it.x, it.y]),
    dealt.items.map((it) => [it.key, it.scale, it.x, it.y]),
    'a half-active field changes nothing, item for item',
  );
});

ok('build: composition — scale (level) and breath (activity) both land, neither twice', () => {
  const seam = uniformSampler(1, 1); // fully alive AND fully lively: both factors at their swell bound
  const base = byKey(build({}));
  const breathOnly = byKey(build({ kineme: kinemeCtx({ fieldBreath: { coupling: 1, sampler: seam } }) }));
  const both = byKey(
    build({
      kineme: kinemeCtx({ fieldBreath: { coupling: 1, sampler: seam } }),
      cultureScale: { coupling: 1, sampler: seam },
    }),
  );
  const sf = cultureScaleFactor(1, 1);
  assert.equal(sf, 1 + SCALE_SWELL);
  let moved = 0;
  for (const it of marksOf(build({}))) {
    const b = both.get(it.key).scale;
    const bo = breathOnly.get(it.key).scale;
    assert.ok(near(b / bo, sf), `mark ${it.key}: the scale fold lands exactly once on top of the breath`);
    assert.ok(
      near(b / base.get(it.key).scale, (bo / base.get(it.key).scale) * sf),
      `mark ${it.key}: total = breath-modulated scale × culture scale factor — no term applied twice`,
    );
    if (Math.abs(bo / base.get(it.key).scale - 1) > 1e-4) moved++;
  }
  assert.ok(moved >= 10, 'the breath really moved marks in the composed build');
});

ok('build: form exclusion — with the dial up the marks breathe deeper and the poem does not move', () => {
  const dealt = build({ kineme: kinemeCtx(), form: true });
  const mod = build({
    kineme: kinemeCtx({ fieldBreath: { coupling: 1, sampler: uniformSampler(1, 1) } }),
    form: true,
  });
  const dealtByKey = byKey(dealt);
  assert.ok(dealt.items.some(isFormItem), 'the fixture really carries a form');
  let moved = 0;
  for (const it of mod.items) {
    const base = dealtByKey.get(it.key);
    if (isFormItem(it)) {
      assert.equal(it.scale, base.scale, `form item ${it.key}: the culture never breathes the poem`);
      assert.equal(it.x, base.x);
      assert.equal(it.y, base.y);
    } else if (it.scale !== base.scale) moved++;
  }
  assert.ok(moved > 0, 'the marks really moved');
});

ok('build: still exclusion — a pinned asset’s marks keep their placed scale, breath and all', () => {
  const plain = build({});
  const pinned = build({
    kineme: kinemeCtx({
      stillAssets: new Set(['a', 'b', 'c']),
      fieldBreath: { coupling: 1, sampler: uniformSampler(1, 1) },
    }),
  });
  assert.deepEqual(
    pinned.items.map((it) => [it.key, it.scale, it.scaleY]),
    plain.items.map((it) => [it.key, it.scale, it.scaleY]),
    'every asset pinned still: the build is the placed build, exactly',
  );
});

// ---------------------------------------------------------------- resolver: the floor live
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
  // the DEFAULT living-motion amounts (breath 0.3, drift 0.5, palette-breath 0.12): the floor is live
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, count: 60, particleCount: 60, mode: 'random' },
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
const runPlain = (frames) => {
  const r = createLiveResolver();
  const hashes = [];
  for (let f = 0; f < frames; f++)
    hashes.push(hash(r.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000 }))));
  r.dispose();
  return hashes;
};
const runCoupled = (frames, { coupling = 1, shed = 0 } = {}) => {
  const r = createLiveResolver();
  const hashes = [];
  for (let f = 0; f < frames; f++)
    hashes.push(
      hash(
        r.resolveLayers(
          baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f, shed), dishFieldCoupling: coupling }),
        ),
      ),
    );
  const snap = r.snapshotState();
  r.dispose();
  return { hashes, snap };
};

ok(
  'resolver: off shapes are byte-identical WITH the breath live — dial 0, publication alone, dial with no field',
  () => {
    const plain = runPlain(30);
    assert.deepEqual(runCoupled(30, { coupling: 0 }).hashes, plain, 'dial 0 with a live field: nothing moves');
    const fieldOnly = (() => {
      const r = createLiveResolver();
      const hashes = [];
      for (let f = 0; f < 30; f++)
        hashes.push(hash(r.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f) }))));
      r.dispose();
      return hashes;
    })();
    assert.deepEqual(fieldOnly, plain, 'a publishing field with no coupling key: nothing moves');
    const dialNoField = (() => {
      const r = createLiveResolver();
      const hashes = [];
      for (let f = 0; f < 30; f++)
        hashes.push(hash(r.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishFieldCoupling: 1 }))));
      r.dispose();
      return hashes;
    })();
    assert.deepEqual(dialNoField, plain, 'a dial with no field stamp: nothing to read, nothing moves');
  },
);

ok('resolver: the consumer acts from the second frame (frame 0 has no publication yet)', () => {
  const plain = runPlain(30);
  const coupled = runCoupled(30, { coupling: 1 }).hashes;
  assert.equal(coupled[0], plain[0], 'frame 0: nothing published yet — the modulation cannot act');
  assert.ok(
    coupled.some((h, f) => f >= 1 && h !== plain[f]),
    'from the second frame the coupled frames leave the plain frames',
  );
});

ok('resolver: governor shed — CULTURE HELD drops BOTH consumers together; trickle still acts', () => {
  const plain = runPlain(30);
  assert.deepEqual(
    runCoupled(30, { coupling: 1, shed: 2 }).hashes,
    plain,
    'shed 2: scale and breath fold away in the same frame — output equals the plain output',
  );
  const trickle = runCoupled(30, { coupling: 1, shed: 1 }).hashes;
  assert.ok(
    trickle.some((h, f) => h !== plain[f]),
    'shed 1: the culture trickles and the dial still acts',
  );
});

ok('resolver: drop-out — when the stamp stops, the very next frames are the plain frames again', () => {
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

ok('resolver: snapshot/restore — a take that begins mid-coupling continues bit-identically', () => {
  const uninterrupted = runCoupled(30, { coupling: 0.8 });
  const a = createLiveResolver();
  for (let f = 0; f < 15; f++)
    a.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 0.8 }));
  const snap = JSON.parse(JSON.stringify(a.snapshotState()));
  assert.equal(checkResolverSnapshot(snap), true, 'the mid-coupling snapshot is well-formed');
  assert.ok(snap.dishField, 'the field state rides the snapshot (the breath needs nothing more recorded)');
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

ok('resolver: replay — the same coupled input stream resolves bit-identically on a fresh resolver', () => {
  assert.deepEqual(runCoupled(30, { coupling: 0.65 }).hashes, runCoupled(30, { coupling: 0.65 }).hashes);
});

console.log(`[selfcheck] dishLifeBreathing (#1923 Phase 2 slice B): ${n} cases passed`);
