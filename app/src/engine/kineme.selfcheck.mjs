// node src/engine/kineme.selfcheck.mjs
// Slice 1 (kineme-time): the time core — shared loop-time source, boil
// clock, sine-free per-instance phase, anchored driver clock.
import assert from 'node:assert';
import {
  BOIL_FPS_DEFAULT,
  BOIL_FPS_MIN,
  BOIL_FPS_MAX,
  kinemeLoopSec,
  boilStep,
  boilSec,
  clampBoilFps,
  kinemePhase2,
  createDriverClock,
  driverTimeSec,
} from './kineme.js';

// ── loop seconds ─────────────────────────────────────────────────────────
assert.strictEqual(kinemeLoopSec(1000), 1);
assert.strictEqual(kinemeLoopSec(250), 0.25);
assert.strictEqual(kinemeLoopSec(0), 0, 'unobserved mirror (0) is not a stamp');
assert.strictEqual(kinemeLoopSec(-50), 0);
assert.strictEqual(kinemeLoopSec(NaN), 0);
assert.strictEqual(kinemeLoopSec('nope'), 0);

// ── boil clock ───────────────────────────────────────────────────────────
assert.strictEqual(BOIL_FPS_DEFAULT, 8);
assert.strictEqual(BOIL_FPS_MIN, 6);
assert.strictEqual(BOIL_FPS_MAX, 12);
assert.strictEqual(clampBoilFps(8), 8);
assert.strictEqual(clampBoilFps(3), 6, 'below range clamps');
assert.strictEqual(clampBoilFps(99), 12, 'above range clamps');
assert.strictEqual(clampBoilFps(NaN), 8, 'garbage → default');
assert.strictEqual(boilStep(0.13, 8), 1);
assert.strictEqual(boilSec(0.13, 8), 0.125);
assert.strictEqual(boilSec(0.13, 8), boilSec(0.2, 8), 'holds inside a frame');
assert.notStrictEqual(boilSec(0.124, 8), boilSec(0.126, 8), 'jumps at the frame edge');
assert.strictEqual(boilStep(2.0, 8), 16);

// ── per-instance phase: deterministic, decorrelated ──────────────────────
{
  const a = kinemePhase2(7, 3);
  const b = kinemePhase2(7, 3);
  assert.deepStrictEqual(a, b, 'same (seed, index) → same phase');
  assert.ok(a[0] >= 0 && a[0] < 1 && a[1] >= 0 && a[1] < 1, 'both in [0,1)');
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(kinemePhase2(7, i).join(','));
  assert.ok(seen.size >= 50, 'copies do not move in lockstep');
  let same = 0;
  for (let i = 0; i < 60; i++) {
    const [u, v] = kinemePhase2(7, i);
    if (u === v) same++;
  }
  assert.ok(same < 5, 'noise and boil offsets are decorrelated');
  assert.notDeepStrictEqual(kinemePhase2(7, 3), kinemePhase2(8, 3), 'seed matters');
}

// ── anchored driver clock: rate 1 is loop time, 0 freezes, changes anchor ─
{
  const c = createDriverClock();
  for (const t of [0, 0.25, 3.7]) assert.strictEqual(driverTimeSec(c, t * 1000, 1), t);
  const d = createDriverClock();
  assert.strictEqual(driverTimeSec(d, 2000, 1), 2);
  assert.strictEqual(driverTimeSec(d, 2000, 3), 2, 'rate change re-anchors, never jumps');
  assert.ok(Math.abs(driverTimeSec(d, 3000, 3) - 5) < 1e-12, 'then runs 3x');
  const f = createDriverClock();
  assert.strictEqual(driverTimeSec(f, 4000, 1), 4);
  assert.strictEqual(driverTimeSec(f, 4000, 0), 4, 'rate 0 freezes where it is');
  assert.strictEqual(driverTimeSec(f, 9000, 0), 4, 'held while loop time would advance');
  assert.strictEqual(driverTimeSec(f, 4000, 1), 4, 'rate restore at the held instant never jumps');
  assert.strictEqual(driverTimeSec(f, 5000, 1), 5, 'resume continues from the held pose');
}

console.log('kineme.selfcheck: OK (time core)');

// ── slice 2: driver API + evaluator ────────────────────────────────────────
import {
  KINEME_DRIVERS,
  getKinemeDriver,
  isKinemeDriver,
  evaluateKineme,
  applyKinemeDrivers,
  kinemeStillSec,
} from './kineme.js';

// declarations
assert.strictEqual(KINEME_DRIVERS.length, 5, 'v1 set + palette-breath (Matt decision 6, extended #1151)');
for (const d of KINEME_DRIVERS) {
  assert.ok(typeof d.id === 'string' && d.id, 'stable id');
  assert.ok(Array.isArray(d.targets) && d.targets.length, `${d.id}: targets`);
  assert.ok(typeof d.amountMeaning === 'string', `${d.id}: amount meaning in real units`);
  assert.deepStrictEqual(d.amountRange, [0, 1], `${d.id}: 0..1`);
  assert.ok(['per-instance', 'global'].includes(d.phaseMode), `${d.id}: phase mode`);
  assert.ok(['boil', 'smooth'].includes(d.clock), `${d.id}: clock`);
  assert.ok(typeof d.costTier === 'string', `${d.id}: cost tier declared once`);
}
assert.strictEqual(getKinemeDriver('breath').clock, 'smooth');
assert.strictEqual(getKinemeDriver('brush-wobble').clock, 'boil');
assert.strictEqual(getKinemeDriver('nope'), undefined);
assert.ok(isKinemeDriver('drift') && !isKinemeDriver('nope'));
// #1151 — palette-breath declaration
{
  const d = getKinemeDriver('palette-breath');
  assert.ok(d, 'palette-breath registered');
  assert.deepStrictEqual(d.targets, ['paletteShift']);
  assert.strictEqual(d.amountMeaning, 'palette sweep reach, fraction of palette length');
  assert.deepStrictEqual(d.amountRange, [0, 1]);
  assert.strictEqual(d.phaseMode, 'per-instance');
  assert.strictEqual(d.clock, 'smooth');
  assert.strictEqual(d.costTier, 'cpu-cheap');
  assert.ok(isKinemeDriver('palette-breath'));
}

const mkSoa = (n, seed) => ({
  n,
  index: Array.from({ length: n }, (_, k) => k * 7 + 1),
  scale: new Float64Array(n).fill(1),
  x: new Float64Array(n),
  y: new Float64Array(n),
});
const ctx0 = {
  seed: 42,
  driverSec: 3.25,
  boilStep: 26,
  amounts: { breath: 0, drift: 0, pulse: 0, brushWobble: 0 },
  canvasW: 1000,
  canvasH: 700,
};

// amount 0 → hard gate: inactive, zeros, applier leaves channels untouched
{
  const soa = mkSoa(24);
  const before = { scale: [...soa.scale], x: [...soa.x], y: [...soa.y] };
  const d = evaluateKineme(soa, ctx0);
  assert.strictEqual(d.active, false, 'all-zero amounts → inactive');
  assert.ok(d.dScale.every((v) => v === 0) && d.dx.every((v) => v === 0));
  applyKinemeDrivers(soa, ctx0);
  assert.deepStrictEqual([...soa.scale], before.scale, 'bit-identical: skip, not ×0');
  assert.deepStrictEqual([...soa.x], before.x);
  assert.deepStrictEqual([...soa.y], before.y);
}

// breath: bounded swell, periodic, per-instance phases differ
{
  const soa = mkSoa(24);
  const d = evaluateKineme(soa, { ...ctx0, amounts: { breath: 1 } });
  assert.ok(d.active);
  assert.ok(
    d.dScale.every((v) => v >= -0.09 - 1e-12 && v <= 0.09 + 1e-12),
    '±9% bound',
  );
  assert.ok(new Set([...d.dScale].map((v) => v.toFixed(6))).size > 12, 'phases differ');
  const d2 = evaluateKineme(soa, { ...ctx0, driverSec: 3.25 + 1 / 0.11, amounts: { breath: 1 } });
  for (let k = 0; k < 24; k++) assert.ok(Math.abs(d.dScale[k] - d2.dScale[k]) < 1e-9, 'one period returns');
}

// drift: bounded wander in canvas units
{
  const soa = mkSoa(16);
  const d = evaluateKineme(soa, { ...ctx0, amounts: { drift: 1 } });
  const bound = 0.02 * 700 + 1e-9;
  assert.ok(d.dx.every((v) => Math.abs(v) <= bound) && d.dy.every((v) => Math.abs(v) <= bound));
}

// pulse: thump peaks at phase 0, decays across the period
{
  const soa = mkSoa(8);
  const at = (t) => evaluateKineme(soa, { ...ctx0, seed: 5, driverSec: t, amounts: { pulse: 1 } }).dScale[0];
  const [uN] = kinemePhase2(5, soa.index[0]);
  const peak = at(-uN / 0.5); // phase 0
  assert.ok(Math.abs(peak - 0.16) < 1e-9, 'thump peaks at 16%');
  assert.ok(at(-uN / 0.5 + 1.5) < peak * 0.05, 'decays across the period');
}

// brush-wobble: boil-quantized, deterministic, bounded
{
  const soa = mkSoa(12);
  const c = { ...ctx0, amounts: { brushWobble: 1 } };
  const a = evaluateKineme(soa, c).dWobble;
  const b = evaluateKineme(soa, { ...c, driverSec: 3.3 }).dWobble; // same boil frame
  assert.deepStrictEqual([...a], [...b], 'holds inside a boil frame');
  const d = evaluateKineme(soa, { ...c, boilStep: 27 }).dWobble;
  assert.ok(!a.every((v, k) => v === d[k]), 'jumps on the next frame');
  assert.ok(
    a.every((v) => v >= -1 && v <= 1),
    '±1 edge-band fraction',
  );
}

// #1151 — palette-breath: bounded sweep in slots, periodic, per-instance
{
  const soa = mkSoa(8);
  const pal = { swatches: ['#111', '#222', '#333', '#444'] };
  const d = evaluateKineme(soa, { ...ctx0, amounts: { paletteBreath: 1 }, palette: pal });
  assert.ok(d.active);
  assert.ok(
    d.dPalette.every((v) => Math.abs(v) <= 4 + 1e-12),
    'reach = amount × palette length (slots)',
  );
  assert.ok(new Set([...d.dPalette].map((v) => v.toFixed(6))).size > 4, 'phases differ: traveling waves');
  const d2 = evaluateKineme(soa, { ...ctx0, driverSec: 3.25 + 25, amounts: { paletteBreath: 1 }, palette: pal });
  for (let k = 0; k < 8; k++) assert.ok(Math.abs(d.dPalette[k] - d2.dPalette[k]) < 1e-9, 'one period (25s) returns');
  const d0 = evaluateKineme(soa, {
    ...ctx0,
    driverSec: 0,
    anchored: true,
    amounts: { paletteBreath: 1 },
    palette: pal,
  });
  assert.ok(
    d0.dPalette.every((v) => v === 0),
    'anchored: t=0 is rest, byte-identical still',
  );
  // amount 0 / no palette → hard gate: zeros
  const off = evaluateKineme(soa, { ...ctx0, amounts: { paletteBreath: 0 }, palette: pal });
  assert.ok(
    off.dPalette.every((v) => v === 0),
    'amount 0: no deltas',
  );
  const nopal = evaluateKineme(soa, { ...ctx0, amounts: { paletteBreath: 1 } });
  assert.ok(
    nopal.dPalette.every((v) => v === 0),
    'no palette: no deltas',
  );
}

// #1151 — palette-breath applier: slots wrap modulo length, undo restores
{
  const soa = mkSoa(8);
  soa.palSlot = [0, 1, 2, 3, 0, 1, 2, 3];
  const swatches = ['#111', '#222', '#333', '#444'];
  const baseColors = soa.palSlot.map((s) => swatches[s]);
  const baseAccents = soa.palSlot.map((s) => swatches[(s + 3) % 4]);
  const colors = [...baseColors];
  const accents = [...baseAccents];
  const ctx = {
    ...ctx0,
    seed: 42,
    driverSec: 3.25,
    anchored: true,
    amounts: { paletteBreath: 1 },
    palette: { swatches },
    colorArrays: { colors, accents },
  };
  const undo = applyKinemeDrivers(soa, ctx);
  assert.ok(typeof undo === 'function', 'applier ran with palette ctx');
  const d = evaluateKineme(soa, ctx);
  let moved = 0;
  for (let k = 0; k < 8; k++) {
    const s = (((soa.palSlot[k] + Math.round(d.dPalette[k])) % 4) + 4) % 4;
    assert.strictEqual(colors[k], swatches[s], `k=${k}: slot wraps modulo length`);
    assert.strictEqual(accents[k], swatches[(s + 3) % 4], `k=${k}: accent re-derives from shifted slot`);
    assert.ok(swatches.includes(colors[k]), `k=${k}: shifted color is a swatch`);
    if (colors[k] !== baseColors[k]) moved++;
  }
  assert.ok(moved > 0, 'full-reach sweep visibly moves marks');
  undo();
  assert.deepStrictEqual(colors, baseColors, 'undo restores base colors (no accumulation)');
  assert.deepStrictEqual(accents, baseAccents, 'undo restores base accents');
}

// #1151 — still-marked instances keep their placed color; shed tier 3 is identity
{
  const swatches = ['#111', '#222', '#333', '#444'];
  const mkPal = () => {
    const soa = mkSoa(4);
    soa.palSlot = [0, 1, 2, 3];
    const colors = ['#111', '#222', '#333', '#444'];
    const accents = ['#444', '#111', '#222', '#333'];
    return { soa, colors, accents };
  };
  const base = (p) => ({
    ...ctx0,
    amounts: { paletteBreath: 1 },
    palette: { swatches },
    colorArrays: { colors: p.colors, accents: p.accents },
  });
  {
    const p = mkPal();
    const undo = applyKinemeDrivers(p.soa, base(p), new Uint8Array([1, 0, 0, 0]));
    assert.strictEqual(p.colors[0], '#111', 'still mark keeps its placed color');
    if (undo) undo();
  }
  {
    const p = mkPal();
    const before = [...p.colors];
    const r = applyKinemeDrivers(p.soa, { ...base(p), shedTier: 3 });
    assert.strictEqual(r, null, 'shed tier 3: applier returns null');
    assert.deepStrictEqual(p.colors, before, 'shed tier 3: colors untouched');
  }
  {
    const p = mkPal();
    const before = [...p.colors];
    applyKinemeDrivers(p.soa, { ...base(p), amounts: { paletteBreath: 0 } });
    assert.deepStrictEqual(p.colors, before, 'amount 0: colors bit-identical');
  }
}

// shed tiers 3/4 → identity even with amounts up
{
  const soa = mkSoa(10);
  const before = [...soa.scale];
  applyKinemeDrivers(soa, { ...ctx0, amounts: { breath: 1, drift: 1 }, shedTier: 3 });
  applyKinemeDrivers(soa, { ...ctx0, amounts: { breath: 1, drift: 1 }, shedTier: 4 });
  assert.deepStrictEqual([...soa.scale], before, 'pin/zero → untouched channels');
}

// still instant: deterministic from seed, inside one boil period
{
  const s1 = kinemeStillSec(1234);
  assert.strictEqual(s1, kinemeStillSec(1234), 'same seed → same instant');
  assert.ok(s1 >= 0 && s1 < 1 / 8, 'inside one boil period');
  assert.notStrictEqual(s1, kinemeStillSec(1235), 'reseed → new moment');
}

console.log('kineme.selfcheck: OK (drivers)');

// ── slice 2: buildPlacements integration ─────────────────────────────────
import { buildPlacements } from './buildPlacements.js';

{
  const assets = [
    { id: 'a', weight: 'heavy' },
    { id: 'b', weight: 'medium' },
  ];
  const palette = { swatches: ['#111', '#222', '#333'] };
  const layoutParams = {
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
    displacement: 0,
    noiseFreq: 0.005,
    noiseSpeed: 0.5,
  };
  const base = {
    layoutParams,
    seed: 0x1a4f,
    activeAssets: assets,
    palette,
    caps: { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true },
    canvasW: 1000,
    canvasH: 700,
  };
  const kin = (amounts, extra = {}) => ({
    driverSec: 3.25,
    boilStep: 26,
    seed: 0x1a4f,
    amounts,
    canvasW: 1000,
    canvasH: 700,
    shedTier: 0,
    ...extra,
  });
  const zero = { breath: 0, drift: 0, pulse: 0, brushWobble: 0 };

  const plain = buildPlacements(base).items;
  const gated = buildPlacements({ ...base, kineme: kin(zero) }).items;
  assert.strictEqual(gated.length, plain.length);
  for (let i = 0; i < plain.length; i++) {
    assert.strictEqual(gated[i].x, plain[i].x, 'amount 0: x bit-identical');
    assert.strictEqual(gated[i].y, plain[i].y, 'amount 0: y bit-identical');
    assert.strictEqual(gated[i].scale, plain[i].scale, 'amount 0: scale bit-identical');
  }

  const alive = buildPlacements({ ...base, kineme: kin({ ...zero, breath: 1, drift: 1 }) }).items;
  assert.strictEqual(alive.length, plain.length, 'same count');
  let moved = 0;
  for (let i = 0; i < plain.length; i++) {
    if (alive[i].x !== plain[i].x || alive[i].scale !== plain[i].scale) moved++;
  }
  assert.ok(moved > plain.length / 2, 'drivers move most marks');

  // shed tier 3 → identity even with amounts up
  const pinned = buildPlacements({ ...base, kineme: kin({ ...zero, breath: 1 }, { shedTier: 3 }) }).items;
  for (let i = 0; i < plain.length; i++) {
    assert.strictEqual(pinned[i].x, plain[i].x, 'shed pin: x identical');
    assert.strictEqual(pinned[i].scale, plain[i].scale, 'shed pin: scale identical');
  }

  // #1151 — palette-breath integration: colors move with amount up, bit-identical at 0
  const palKin = (amounts, extra = {}) => kin({ ...zero, ...amounts }, extra);
  const plainColors = plain.map((it) => it.color);
  const zeroPal = buildPlacements({ ...base, kineme: palKin({ paletteBreath: 0 }) }).items;
  for (let i = 0; i < plain.length; i++) {
    assert.strictEqual(zeroPal[i].color, plainColors[i], 'amount 0: color bit-identical');
  }
  const alivePal = buildPlacements({ ...base, kineme: palKin({ paletteBreath: 1 }) }).items;
  let colorMoved = 0;
  for (let i = 0; i < plain.length; i++) if (alivePal[i].color !== plainColors[i]) colorMoved++;
  assert.ok(colorMoved > 0, 'palette-breath moves some marks');
}

// ── #1198: the rhythm family ─────────────────────────────────────────────
import {
  KINEME_PATTERNS,
  isRhythmPattern,
  rhythmTypeForPattern,
  patternAmounts,
  RHYTHM_SCALE,
  RHYTHM_ROT,
  RHYTHM_DX,
  RHYTHM_DY,
  evaluateRhythm,
  applyRhythm,
} from './kineme.js';

// the strip reads KINEME_PATTERNS: the new patterns appear automatically
assert.deepStrictEqual([...KINEME_PATTERNS], ['DRIFT', 'SWELL', 'THUMP', 'ORGANIC', 'CADENCE']);
assert.ok(isRhythmPattern('ORGANIC') && isRhythmPattern('CADENCE'));
assert.ok(
  !isRhythmPattern('DRIFT') && !isRhythmPattern('SWELL') && !isRhythmPattern('THUMP') && !isRhythmPattern('nope'),
);
assert.strictEqual(rhythmTypeForPattern('ORGANIC'), 'perlin', 'ORGANIC = Perlin via createNoise');
assert.strictEqual(rhythmTypeForPattern('CADENCE'), 'sine', 'CADENCE = sine');
assert.strictEqual(rhythmTypeForPattern('DRIFT'), null);
assert.strictEqual(rhythmTypeForPattern('nope'), null);

// amplitudes: small by design — organic rhythm, never jitter
assert.ok(RHYTHM_SCALE > 0 && RHYTHM_SCALE <= 0.1, 'scale: small');
assert.ok(RHYTHM_ROT > 0 && RHYTHM_ROT <= 10, 'rotation: small (degrees, SVG convention)');
assert.ok(RHYTHM_DX > 0 && RHYTHM_DX <= 0.02 && RHYTHM_DY > 0 && RHYTHM_DY <= 0.02, 'spacing: small');

// patternAmounts: rhythm patterns don't re-weight the amounts — the pattern is the gate
{
  const b = { breath: 0.3, drift: 0.5, pulse: 0.7 };
  assert.deepStrictEqual(patternAmounts(b, 'ORGANIC'), b, 'ORGANIC leaves amounts alone');
  assert.deepStrictEqual(patternAmounts(b, 'CADENCE'), b, 'CADENCE leaves amounts alone');
}

const mkRhythmSoa = (n, W = 1000, H = 700) => {
  const soa = {
    n,
    index: Array.from({ length: n }, (_, k) => k * 7 + 1),
    scale: new Float64Array(n).fill(1),
    scaleY: new Float64Array(n).fill(1), // #1202 — linked: bit-equal to scale
    rotation: new Float64Array(n),
    x: new Float64Array(n),
    y: new Float64Array(n),
  };
  for (let k = 0; k < n; k++) {
    soa.x[k] = (k / Math.max(1, n - 1)) * W; // spread across the canvas
    soa.y[k] = ((k * 0.61803) % 1) * H; // golden-ratio scatter
  }
  return soa;
};
const rctx = (type, extra = {}) => ({
  seed: 42,
  canvasW: 1000,
  canvasH: 700,
  shedTier: 0,
  rhythm: type ? { type } : null,
  ...extra,
});

// the gate: no rhythm type → inactive, zeros, applier is identity
{
  for (const ctx of [rctx(null), rctx('wobble'), { seed: 42, canvasW: 1000, canvasH: 700 }]) {
    const soa = mkRhythmSoa(12);
    const before = { x: [...soa.x], y: [...soa.y], scale: [...soa.scale], rotation: [...soa.rotation] };
    const r = evaluateRhythm(soa, ctx);
    assert.strictEqual(r.active, false, 'no rhythm type → inactive');
    assert.ok(r.dRot.every((v) => v === 0) && r.dScale.every((v) => v === 0) && r.dx.every((v) => v === 0));
    assert.strictEqual(applyRhythm(soa, ctx), null, 'inactive → applier returns null');
    assert.deepStrictEqual([...soa.x], before.x, 'channels untouched');
    assert.deepStrictEqual([...soa.scale], before.scale);
    assert.deepStrictEqual([...soa.rotation], before.rotation);
  }
  assert.strictEqual(evaluateRhythm({ n: 0 }, rctx('perlin')).active, false, 'n=0 → inactive');
  assert.strictEqual(
    evaluateRhythm(mkRhythmSoa(4), { ...rctx('perlin'), canvasW: 0 }).active,
    false,
    'no canvas → inactive',
  );
}

// perlin + sine: bounded, deterministic per seed, not one slab, seed matters
for (const type of ['perlin', 'sine']) {
  const a = evaluateRhythm(mkRhythmSoa(24), rctx(type));
  const b = evaluateRhythm(mkRhythmSoa(24), rctx(type));
  assert.ok(a.active, `${type}: active`);
  assert.deepStrictEqual([...a.dScale], [...b.dScale], `${type}: deterministic per seed`);
  assert.deepStrictEqual([...a.dRot], [...b.dRot], `${type}: deterministic per seed`);
  assert.deepStrictEqual([...a.dx], [...b.dx], `${type}: deterministic per seed`);
  assert.deepStrictEqual([...a.dy], [...b.dy], `${type}: deterministic per seed`);
  assert.ok(
    a.dScale.every((v) => Math.abs(v) <= RHYTHM_SCALE + 1e-12),
    `${type}: scale bound`,
  );
  assert.ok(
    a.dRot.every((v) => Math.abs(v) <= RHYTHM_ROT + 1e-12),
    `${type}: rotation bound`,
  );
  assert.ok(
    a.dx.every((v) => Math.abs(v) <= RHYTHM_DX * 700 + 1e-9),
    `${type}: dx bound`,
  );
  assert.ok(
    a.dy.every((v) => Math.abs(v) <= RHYTHM_DY * 700 + 1e-9),
    `${type}: dy bound`,
  );
  assert.ok(new Set([...a.dScale].map((v) => v.toFixed(5))).size > 12, `${type}: not one slab`);
  const c = evaluateRhythm(mkRhythmSoa(24), rctx(type, { seed: 43 }));
  assert.ok(!a.dScale.every((v, k) => v === c.dScale[k]), `${type}: seed matters`);
}
{
  const p = evaluateRhythm(mkRhythmSoa(24), rctx('perlin'));
  const s = evaluateRhythm(mkRhythmSoa(24), rctx('sine'));
  assert.ok(!p.dScale.every((v, k) => v === s.dScale[k]), 'ORGANIC and CADENCE are different fields');
}

// applier: folds all four channels; the undo restores the cached x/y only
{
  const soa = mkRhythmSoa(8);
  const ctx = rctx('perlin');
  const r = evaluateRhythm(soa, ctx);
  const bx = [...soa.x],
    by = [...soa.y];
  const undo = applyRhythm(soa, ctx);
  assert.ok(typeof undo === 'function', 'applier ran');
  for (let k = 0; k < 8; k++) {
    assert.strictEqual(soa.x[k], bx[k] + r.dx[k], `k=${k}: dx folded`);
    assert.strictEqual(soa.y[k], by[k] + r.dy[k], `k=${k}: dy folded`);
    assert.strictEqual(soa.rotation[k], r.dRot[k], `k=${k}: dRot folded`);
    assert.strictEqual(soa.scale[k], 1 + r.dScale[k], `k=${k}: dScale folds scale`);
    assert.strictEqual(soa.scaleY[k], 1 + r.dScale[k], `k=${k}: dScale folds scaleY (uniform, not sheared)`);
  }
  undo();
  assert.deepStrictEqual([...soa.x], bx, 'undo: x bit-identical (no cache stacking)');
  assert.deepStrictEqual([...soa.y], by, 'undo: y bit-identical');
}

// still-marked instances keep their placed everything; shed tier 3 is identity
{
  const soa = mkRhythmSoa(4);
  const bx = [...soa.x],
    brot = [...soa.rotation];
  const undo = applyRhythm(soa, rctx('sine'), new Uint8Array([1, 0, 0, 0]));
  assert.strictEqual(soa.x[0], bx[0], 'still mark keeps its placed x');
  assert.strictEqual(soa.rotation[0], brot[0], 'still mark keeps its placed rotation');
  let moved = 0;
  for (let k = 1; k < 4; k++) if (soa.x[k] !== bx[k] || soa.rotation[k] !== 0) moved++;
  assert.ok(moved > 0, 'free marks still move');
  if (undo) undo();
  assert.deepStrictEqual([...soa.x], bx, 'undo restores all x');
}
{
  const soa = mkRhythmSoa(4);
  const bx = [...soa.x];
  assert.strictEqual(applyRhythm(soa, rctx('perlin', { shedTier: 3 })), null, 'shed tier 3: applier returns null');
  assert.deepStrictEqual([...soa.x], bx, 'shed tier 3: channels untouched');
}

// buildPlacements integration: the pattern is the gate — zero amounts still switch the layer on
{
  const assets = [
    { id: 'a', weight: 'heavy' },
    { id: 'b', weight: 'medium' },
  ];
  const palette = { swatches: ['#111', '#222', '#333'] };
  const layoutParams = {
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
    displacement: 0,
    noiseFreq: 0.005,
    noiseSpeed: 0.5,
  };
  const cache = {};
  const mkBase = (kineme) => ({
    layoutParams,
    seed: 0x1a4f,
    activeAssets: assets,
    palette,
    caps: { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true },
    canvasW: 1000,
    canvasH: 700,
    cache,
    kineme,
  });
  const zero = { breath: 0, drift: 0, pulse: 0, brushWobble: 0, paletteBreath: 0 };
  const rkin = (type) => ({
    driverSec: 3.25,
    boilStep: 26,
    seed: 0x1a4f,
    amounts: zero,
    canvasW: 1000,
    canvasH: 700,
    shedTier: 0,
    anchored: true,
    rhythm: { type },
  });
  const snap = (items) =>
    items
      .map((it) => [it.key, it.x, it.y, it.scale, it.rotation])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); // key order: the overlap sort shuffles slot order
  const plain = snap(buildPlacements(mkBase(null)).items);
  const organic = snap(buildPlacements(mkBase(rkin('perlin'))).items);
  let moved = 0;
  for (let i = 0; i < plain.length; i++) {
    if (organic[i][1] !== plain[i][1] || organic[i][3] !== plain[i][3] || organic[i][4] !== plain[i][4]) moved++;
  }
  assert.ok(moved > plain.length / 2, 'rhythm moves marks with every amount at 0');
  const cadence = snap(buildPlacements(mkBase(rkin('sine'))).items);
  let differs = 0;
  for (let i = 0; i < plain.length; i++) if (cadence[i][1] !== organic[i][1]) differs++;
  assert.ok(differs > 0, 'ORGANIC and CADENCE are different fields');
  const back = snap(buildPlacements(mkBase(null)).items);
  assert.deepStrictEqual(back, plain, 'no stacking: the undos restored the cached picture');
}

console.log('kineme.selfcheck: OK (rhythm)');

console.log('kineme.selfcheck: OK (placements integration)');
