// node src/engine/kineme.driverTable.selfcheck.mjs
// #2115 — Motion Core P3: the kineme drivers are TABLE-DRIVEN, and the refactor is BYTE-IDENTICAL.
//
// The reference below is a FROZEN COPY of evaluateKineme as it stood on main at f08fd8d, before the drivers moved onto
// their KINEME_DRIVERS records. Do not "tidy" it, do not re-point it at kineme.js: its whole job is to be the old
// arithmetic, in the old order, so every channel of the new evaluator can be compared against it with Object.is.
// The only edits to the copy are mechanical: the per-instance phase comes from the exported kinemePhase2 (the cached
// phasesFor is bit-identical to it by construction) and the module constants are repeated here as literals.
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import {
  KINEME_DRIVERS,
  KINEME_TARGET_CHANNELS,
  CULTURE_SCALE,
  CULTURE_FRAY,
  evaluateKineme,
  evaluateKinemeScratch,
  registerKinemeDriver,
  getKinemeDriver,
  isKinemeDriver,
  kinemePhase2,
} from './kineme.js';
import { kinemePhase } from '../data/kinemes.js';
import { cultureBreathFactor } from './dishLifeCouple.mjs';
import { registerCostTier } from './kernel/costRegistry.mjs';

const TAU = Math.PI * 2;
const BREATH_DEPTH = 0.09;
const BREATH_HZ = 0.11;
const DRIFT_REACH = 0.02;
const DRIFT_HZ_X = 0.07;
const DRIFT_HZ_Y = 0.083;
const PULSE_DEPTH = 0.16;
const PULSE_HZ = 0.5;
const PALETTE_HZ = 0.04;

function cultureHash(gen, index) {
  let h = Math.imul((gen | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((index | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

function num01(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(1, n) : 0;
}

// ── the frozen reference ─────────────────────────────────────────────────────────────────────────────────────
function evaluateKinemeReference(soa, ctx) {
  const n = soa?.n | 0;
  const out = {
    active: false,
    dScale: new Float64Array(n),
    dx: new Float64Array(n),
    dy: new Float64Array(n),
    dWobble: new Float64Array(n),
    dPalette: new Float64Array(n),
  };
  if (!n || !ctx) return out;
  const t = Number(ctx.driverSec);
  if (!Number.isFinite(t)) return out;
  const step = ctx.boilStep | 0;
  const amounts = ctx.amounts || {};
  const seed = ctx.seed | 0;
  const anchored = !!ctx.anchored;

  const breath = num01(amounts.breath);
  if (breath > 0) {
    out.active = true;
    // #1923 Phase 2 slice B — FIELD glyph breathing: when the resolver hands over the coupling seam
    // (ctx.fieldBreath = { coupling, sampler }, the same object slice A's scale fold reads), the field
    // CULTURE's activity under each mark scales the DEPTH of the breath term it is about to add — never
    // its rate (the phase law above stays the dealt law, anchor intact), never any other driver. The
    // factor comes from the seam (engine/dishLifeCouple.mjs); a mark outside the canvas has no cell to
    // read and breathes its own breath. Absent the seam the term is the dealt term, number for number.
    const fb = ctx.fieldBreath;
    const fbSampler = fb && typeof fb.sampler?.sample === 'function' ? fb.sampler : null;
    const fbCell = fbSampler ? { level: 0, activity: 0 } : null;
    for (let k = 0; k < n; k++) {
      const uN = kinemePhase2(seed, soa.index[k])[0];
      const s = Math.sin(TAU * (BREATH_HZ * t + uN));
      let term = breath * BREATH_DEPTH * (anchored ? s - Math.sin(TAU * uN) : s);
      if (fbSampler && fbSampler.sample(soa.x[k], soa.y[k], fbCell))
        term *= cultureBreathFactor(fbCell.activity, fb.coupling);
      out.dScale[k] += term;
    }
  }

  const drift = num01(amounts.drift);
  if (drift > 0) {
    out.active = true;
    const m = Math.min(Number(ctx.canvasW) || 0, Number(ctx.canvasH) || 0);
    const reach = drift * DRIFT_REACH * m;
    if (reach > 0) {
      for (let k = 0; k < n; k++) {
        const ph = kinemePhase2(seed, soa.index[k]);
        const uN = ph[0];
        const uB = ph[1];
        const sx = Math.sin(TAU * (DRIFT_HZ_X * t + uN));
        const sy = Math.sin(TAU * (DRIFT_HZ_Y * t + uB));
        out.dx[k] += reach * (anchored ? sx - Math.sin(TAU * uN) : sx);
        out.dy[k] += reach * (anchored ? sy - Math.sin(TAU * uB) : sy);
      }
    }
  }

  const pulse = num01(amounts.pulse);
  if (pulse > 0) {
    out.active = true;
    for (let k = 0; k < n; k++) {
      const uN = kinemePhase2(seed, soa.index[k])[0];
      const ph = (((PULSE_HZ * t + uN) % 1) + 1) % 1;
      const thump = (1 - ph) * (1 - ph) * (1 - ph);
      const rph = ((uN % 1) + 1) % 1; // the phase at driver time 0, written exactly as above so the difference is exactly 0
      const rest = (1 - rph) * (1 - rph) * (1 - rph);
      out.dScale[k] += pulse * PULSE_DEPTH * (anchored ? thump - rest : thump);
    }
  }

  const wobble = num01(amounts.brushWobble);
  if (wobble > 0) {
    out.active = true;
    for (let k = 0; k < n; k++) {
      // Boiled value noise: one hash per (frame, slot), snapped to the
      // boil frame — the line holds, then jumps. Sine-free (djb2).
      const w = kinemePhase(step, `wb:${soa.index[k]}`);
      out.dWobble[k] += wobble * 2 * (w - 0.5);
    }
  }

  // #1151 — palette-breath: per-instance oscillator sweeping the palette
  // sampling position (Davis colorOsc, homage — the principle, not his
  // code). Traveling color waves via the same index-phase trick as breath:
  // copies never move in lockstep. Reach is in slots: amount 1 sweeps the
  // whole palette, the default (~0.12) shimmers ±a few slots. The applier
  // rounds and wraps modulo palette length, so a palette switch never pops —
  // the offset is relative and the phase is continuous.
  const paletteBreath = num01(amounts.paletteBreath);
  if (paletteBreath > 0) {
    const swatches = ctx.palette?.swatches;
    const len = Array.isArray(swatches) ? swatches.length : 0;
    const reach = paletteBreath * len;
    if (reach > 0) {
      out.active = true;
      for (let k = 0; k < n; k++) {
        const uN = kinemePhase2(seed, soa.index[k])[0];
        const s = Math.sin(TAU * (PALETTE_HZ * t + uN));
        out.dPalette[k] += reach * (anchored ? s - Math.sin(TAU * uN) : s);
      }
    }
  }

  // #1923 — DISH LIFE as a SECONDARY read. The quiet culture (engine/dishLifeQuiet.mjs) is one more motion source on
  // this system, read-only like weather: it never owns a mark, it only lets the marks near a living colony breathe a
  // little and fray a little. ctx.culture = { strength 0..1, gen, sample(x, y, out) }; strength 0 / no culture = this
  // block is skipped (the hard gate), so a scene without it is byte-identical. Small by design: at full strength the
  // swell is CULTURE_SCALE of the mark and the fray CULTURE_FRAY of the smaller canvas side — the primary read
  // (the marks, the Director, the other drivers) always outweighs it.
  const culture = ctx.culture;
  const cs = num01(culture?.strength);
  if (cs > 0 && typeof culture.sample === 'function') {
    const m = Math.min(Number(ctx.canvasW) || 0, Number(ctx.canvasH) || 0);
    const reach = cs * CULTURE_FRAY * m;
    const gen = culture.gen | 0;
    const local = { level: 0, activity: 0 };
    for (let k = 0; k < n; k++) {
      if (!culture.sample(soa.x[k], soa.y[k], local)) continue;
      const a = local.activity;
      const v = Math.min(1, 0.5 * local.level + a);
      if (!(v > 0)) continue;
      out.active = true;
      out.dScale[k] += cs * CULTURE_SCALE * v;
      if (a > 0 && reach > 0) {
        // the fray: boiled to the generation (the culture's own tick), per mark — a flicker, not a drift
        const h = cultureHash(gen, soa.index[k]);
        out.dx[k] += reach * a * ((h & 0xffff) / 32767.5 - 1);
        out.dy[k] += reach * a * (((h >>> 16) & 0xffff) / 32767.5 - 1);
      }
    }
  }

  return out;
}

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────────────
let failed = 0;
const ok = (name, fn) => {
  try {
    fn();
    console.log(`  [ok] ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  [FAIL] ${name}\n    ${e && e.message}`);
  }
};

const N = 200;
function mkSoa(n = N) {
  const soa = {
    n,
    index: Array.from({ length: n }, (_, k) => k * 7 + 1),
    scale: new Float64Array(n).fill(1),
    x: new Float64Array(n),
    y: new Float64Array(n),
  };
  for (let k = 0; k < n; k++) {
    soa.x[k] = ((k * 37) % 1000) + 0.5;
    soa.y[k] = ((k * 53) % 700) + 0.25;
  }
  return soa;
}

const AMOUNT_SETS = [
  { breath: 0, drift: 0, pulse: 0, brushWobble: 0, paletteBreath: 0 },
  { breath: 1, drift: 1, pulse: 1, brushWobble: 1, paletteBreath: 1 },
  { breath: 0.4, drift: 0, pulse: 0.7, brushWobble: 0, paletteBreath: 0 },
  { breath: 0, drift: 0.35, pulse: 0, brushWobble: 0.6, paletteBreath: 0.12 },
];
const TIMES = [0, 0.37, 1.9, 6.25, 41.5];
const PALETTE = { swatches: ['#111', '#222', '#333', '#444', '#555', '#666'] };
const CHANNELS = ['dScale', 'dx', 'dy', 'dWobble', 'dPalette'];

// a deterministic stand-in for the dish: the same sampler object feeds the reference and the new evaluator
const dishSampler = {
  sample(x, y, out) {
    const a = ((Math.floor(x) * 31 + Math.floor(y) * 17) % 11) / 10;
    out.level = ((Math.floor(x) + Math.floor(y)) % 7) / 6;
    out.activity = a;
    return (Math.floor(x) + Math.floor(y)) % 5 !== 0; // some marks have no cell under them
  },
};

function ctxFor(amounts, t, anchored, extra = {}) {
  return {
    seed: 1234,
    driverSec: t,
    boilStep: Math.floor(t * 8),
    amounts,
    canvasW: 1000,
    canvasH: 700,
    palette: PALETTE,
    anchored,
    ...extra,
  };
}

function sameChannels(label, got, want) {
  assert.ok(Object.is(got.active, want.active), `${label}: active ${got.active} vs ${want.active}`);
  for (const ch of CHANNELS) {
    assert.strictEqual(got[ch].length, want[ch].length, `${label}: ${ch} length`);
    for (let k = 0; k < want[ch].length; k++) {
      assert.ok(Object.is(got[ch][k], want[ch][k]), `${label}: ${ch}[${k}] ${got[ch][k]} vs ${want[ch][k]}`);
    }
  }
}

// ── 1. byte-identical against the frozen reference ──────────────────────────────────────────────────────────
ok('every channel is Object.is-equal to the frozen reference: 4 amount sets × 5 times × anchored on/off', () => {
  const soa = mkSoa();
  let compared = 0;
  for (const [ai, amounts] of AMOUNT_SETS.entries()) {
    for (const t of TIMES) {
      for (const anchored of [false, true]) {
        const c = ctxFor(amounts, t, anchored);
        const want = evaluateKinemeReference(soa, c);
        sameChannels(`set ${ai} t=${t} anchored=${anchored} (fresh)`, evaluateKineme(soa, c), want);
        compared += 1;
      }
    }
  }
  assert.strictEqual(compared, 40);
});

ok('the scratch twin agrees with the reference on the same grid (and with itself across calls)', () => {
  const soa = mkSoa();
  for (const [ai, amounts] of AMOUNT_SETS.entries()) {
    for (const t of TIMES) {
      for (const anchored of [false, true]) {
        const c = ctxFor(amounts, t, anchored);
        sameChannels(
          `set ${ai} t=${t} anchored=${anchored} (scratch)`,
          evaluateKinemeScratch(soa, c),
          evaluateKinemeReference(soa, c),
        );
      }
    }
  }
});

ok('the couplings ride through ctx unchanged: the FIELD breath seam and the culture read', () => {
  const soa = mkSoa();
  const amounts = AMOUNT_SETS[1];
  const culture = { strength: 0.8, gen: 5, sample: dishSampler.sample };
  for (const t of TIMES) {
    for (const anchored of [false, true]) {
      for (const extra of [
        { fieldBreath: { coupling: 1, sampler: dishSampler } },
        { fieldBreath: { coupling: 0.35, sampler: dishSampler } },
        { culture },
        { fieldBreath: { coupling: 1, sampler: dishSampler }, culture },
      ]) {
        const c = ctxFor(amounts, t, anchored, extra);
        sameChannels(
          `t=${t} anchored=${anchored} ${Object.keys(extra).join('+')}`,
          evaluateKineme(soa, c),
          evaluateKinemeReference(soa, c),
        );
      }
    }
  }
  assert.ok(CULTURE_SCALE > 0 && CULTURE_FRAY > 0 && cultureBreathFactor(0.5, 1) > 0);
});

ok('the edges agree too: no soa, no ctx, a non-finite clock, an empty soa, junk amounts', () => {
  const soa = mkSoa();
  const empties = [
    [null, ctxFor(AMOUNT_SETS[1], 1, false)],
    [soa, null],
    [soa, ctxFor(AMOUNT_SETS[1], NaN, false)],
    [mkSoa(0), ctxFor(AMOUNT_SETS[1], 1, false)],
    [soa, ctxFor({ breath: 'x', drift: -3, pulse: 9, brushWobble: null, paletteBreath: undefined }, 2, true)],
    [soa, { ...ctxFor(AMOUNT_SETS[1], 2, false), amounts: undefined }],
  ];
  for (const [i, [s, c]] of empties.entries()) {
    sameChannels(`edge ${i} fresh`, evaluateKineme(s, c), evaluateKinemeReference(s, c));
    sameChannels(`edge ${i} scratch`, evaluateKinemeScratch(s, c), evaluateKinemeReference(s, c));
  }
});

ok('dWobble is still evaluated, and the table order is the sum order', () => {
  const soa = mkSoa();
  const d = evaluateKineme(soa, ctxFor({ brushWobble: 1 }, 1, false));
  assert.ok(d.active && [...d.dWobble].some((v) => v !== 0), 'dWobble is evaluated');
  assert.deepStrictEqual(
    KINEME_DRIVERS.map((r) => r.id),
    ['breath', 'drift', 'pulse', 'brush-wobble', 'palette-breath'],
  );
});

// ── 2. the scratch is reused and cleared ────────────────────────────────────────────────────────────────────
ok('two consecutive scratch calls with the same input return equal values, from one reused set', () => {
  const soa = mkSoa();
  const c = ctxFor(AMOUNT_SETS[1], 3.1, true);
  const a = evaluateKinemeScratch(soa, c);
  const first = { active: a.active, ...Object.fromEntries(CHANNELS.map((ch) => [ch, Float64Array.from(a[ch])])) };
  const b = evaluateKinemeScratch(soa, c);
  assert.strictEqual(a, b, 'the same scratch object comes back for the same soa (no per-frame allocation)');
  sameChannels('second call', b, first);
  for (const ch of CHANNELS) assert.strictEqual(a[ch], b[ch], `${ch}: same buffer`);
});

ok('the scratch is zero-filled per call: a loud frame leaves nothing behind for a quiet one', () => {
  const soa = mkSoa();
  evaluateKinemeScratch(soa, ctxFor(AMOUNT_SETS[1], 2, false));
  const quiet = evaluateKinemeScratch(soa, ctxFor(AMOUNT_SETS[0], 2, false));
  assert.strictEqual(quiet.active, false);
  for (const ch of CHANNELS)
    assert.ok(
      [...quiet[ch]].every((v) => Object.is(v, 0)),
      `${ch} is back to +0`,
    );
});

ok('a soa of a different length gets its own right-sized set; two soas never share one', () => {
  const a = mkSoa(10);
  const b = mkSoa(10);
  const ra = evaluateKinemeScratch(a, ctxFor(AMOUNT_SETS[1], 1, false));
  const rb = evaluateKinemeScratch(b, ctxFor(AMOUNT_SETS[1], 1, false));
  assert.notStrictEqual(ra, rb);
  a.n = 25;
  a.index = Array.from({ length: 25 }, (_, k) => k + 1);
  assert.strictEqual(evaluateKinemeScratch(a, ctxFor(AMOUNT_SETS[1], 1, false)).dScale.length, 25);
});

ok('the fresh evaluator still returns new arrays every call (a caller may hold one across the next)', () => {
  const soa = mkSoa();
  const c = ctxFor(AMOUNT_SETS[1], 1, false);
  const a = evaluateKineme(soa, c);
  const b = evaluateKineme(soa, c);
  assert.notStrictEqual(a.dScale, b.dScale);
});

// ── 3. registration ─────────────────────────────────────────────────────────────────────────────────────────
const good = () => ({
  id: 'test-six',
  targets: ['x'],
  amountMeaning: 'test-only nudge, fraction of one pixel',
  amountRange: [0, 1],
  phaseMode: 'global',
  clock: 'smooth',
  costTier: 'cpu-cheap',
  evaluate(out, soa, ctx) {
    const a = num01((ctx.amounts || {}).testSix);
    if (!(a > 0)) return;
    out.active = true;
    for (let k = 0; k < (soa.n | 0); k++) out.dx[k] += a * (k + 1);
  },
});

ok(
  'a malformed record is refused: duplicate id, unknown target, bad range, bad clock, bad phase mode, unregistered tier, no evaluate',
  () => {
    const bad = (patch, re) => assert.throws(() => registerKinemeDriver({ ...good(), ...patch }), re);
    bad({ id: 'breath' }, /already registered/);
    bad({ id: '' }, /non-empty string id/);
    bad({ targets: ['rotation'] }, /unknown target/);
    bad({ targets: [] }, /non-empty array/);
    bad({ amountRange: [0, 2] }, /amountRange/);
    bad({ amountRange: [0.5, 0.5] }, /amountRange/);
    bad({ amountRange: [-1, 1] }, /amountRange/);
    bad({ clock: 'wall' }, /unknown clock/);
    bad({ phaseMode: 'nope' }, /unknown phaseMode/);
    bad({ costTier: 'gl/not-declared' }, /costTier/);
    bad({ evaluate: null }, /evaluate must be a function/);
    assert.throws(() => registerKinemeDriver(null), /must be an object/);
    assert.strictEqual(KINEME_DRIVERS.length, 5, 'none of the refused records got in');
    assert.ok(!isKinemeDriver('test-six'));
    for (const target of Object.keys(KINEME_TARGET_CHANNELS))
      assert.ok(CHANNELS.includes(KINEME_TARGET_CHANNELS[target]));
  },
);

ok('a registered cost-tier id is accepted as a driver cost tier', () => {
  registerCostTier('kineme-test/cost', { tier: 1, timeMs: 0.2, memoryBytes: 0, notes: 'test-only' });
  const rec = registerKinemeDriver({ ...good(), id: 'test-cost', costTier: 'kineme-test/cost' });
  assert.strictEqual(rec.costTier, 'kineme-test/cost');
  assert.strictEqual(KINEME_DRIVERS.pop().id, 'test-cost'); // the table is shared in this process: take it back out
});

// ── 4. the table is the Canon's table ───────────────────────────────────────────────────────────────────────
ok('evaluate is a function, so the serialised table the Canon pins carries no new key', () => {
  for (const d of KINEME_DRIVERS) {
    assert.strictEqual(typeof d.evaluate, 'function');
    assert.ok(Object.isFrozen(d));
    assert.deepStrictEqual(Object.keys(JSON.parse(JSON.stringify(d))), [
      'id',
      'targets',
      'amountMeaning',
      'amountRange',
      'phaseMode',
      'clock',
      'costTier',
    ]);
  }
});

// ── 5. last: a sixth driver is one record ───────────────────────────────────────────────────────────────────
ok('registering a sixth, test-only driver changes only the channels it targets', () => {
  const soa = mkSoa();
  const base = AMOUNT_SETS[1];
  const before = AMOUNT_SETS.map((a) => TIMES.map((t) => evaluateKineme(soa, ctxFor(a, t, true))));
  registerKinemeDriver(good());
  assert.ok(isKinemeDriver('test-six') && getKinemeDriver('test-six').targets[0] === 'x');
  for (const [ai, a] of AMOUNT_SETS.entries()) {
    for (const [ti, t] of TIMES.entries()) {
      // without its amount the sixth driver is silent: every channel, and `active`, is exactly what it was
      sameChannels(`silent set ${ai} t=${t}`, evaluateKineme(soa, ctxFor(a, t, true)), before[ai][ti]);
      // with its amount it moves dx — and only dx
      const on = evaluateKineme(soa, ctxFor({ ...a, testSix: 0.5 }, t, true));
      assert.ok(on.active);
      for (const ch of CHANNELS.filter((c) => c !== KINEME_TARGET_CHANNELS.x)) {
        for (let k = 0; k < N; k++) assert.ok(Object.is(on[ch][k], before[ai][ti][ch][k]), `${ch}[${k}] untouched`);
      }
      assert.ok(Object.is(on.dx[0], before[ai][ti].dx[0] + 0.5 * 1), 'dx[0] gained exactly the test driver amount');
    }
  }
  const only = evaluateKineme(soa, ctxFor({ testSix: 1 }, 1, true));
  assert.strictEqual(only.active, true);
  assert.ok(only.dx[3] === 4 && only.dScale.every((v) => v === 0));
  assert.ok(base.breath === 1);
});

if (failed) {
  console.error(`kineme.driverTable.selfcheck: ${failed} FAILED`);
  process.exit(1);
}
console.log('kineme.driverTable.selfcheck: all checks passed');
