// node src/engine/dishPigment.selfcheck.mjs
//
// Petri dish B3 (#1412) — pigment exchange: the law in
// dishPigment.mjs, pinned.
//
//   (a) the trade law, closed form: nothing moves below the dwell
//       gate; past it each body closes (1 − exp(−rate·dt)) × merge
//       factor of the gap per step; over 60 s of contact the pair
//       measurably converges (the issue's acceptance probe) and the
//       visible colours land on the same quantized hex;
//   (b) history: a pair separated after trading keeps its earned
//       colours bit for bit — exchange is history, not a shader;
//   (c) symmetry: the pair's mean colour is conserved exactly and
//       the gap shrinks monotonically, never overshooting;
//   (d) physics byte-identity: exchange on vs off, same seeded run,
//       every physics bit equal; off never writes a colour;
//   (e) reduced-motion: no trade accrues while the dwell tracks
//       underneath, physics untouched;
//   (f) the governor rung: cost tier 2 with deform; the shed
//       predicate is deform's rule; a shed step trades nothing;
//   (g) bake equals live: identical runs trade identically, step
//       for step (working copy + visible colours); another seed
//       trades differently;
//   (h) a palette re-deal re-seeds the working copy — the new
//       palette takes over, no body repaints from the old one;
//   (i) the wiring: call sites in particles.js only; the resolver
//       forwards the shed; the rate law stays in the module.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import {
  stepDishCoalesce,
  coalescePairs,
  coalesceFactor,
  COALESCE_DWELL_GATE,
  COALESCE_RAMP_STEPS,
} from './dishCoalesce.mjs';
import { stepDishPigment, syncDishPigment, pigmentHex, PIGMENT_RATE_PER_SEC } from './dishPigment.mjs';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { dishPigmentShed } from '../gl/sceneContract.js';
import { getCostTier, tier1ShedIds } from '../gl/costTiers.mjs';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const DT = 1 / 60;
const BASE_K = 1 - Math.exp(-PIGMENT_RATE_PER_SEC * DT);

// The resting-pair harness (B2's idiom): discs r=20 overlapping by
// 10, at rest — depenetration parks them at the disc sum, where the
// near-touch rule keeps the contact sustained. Colours set against
// the palette's grain, then synced into the working copy.
const CTX = {
  radius: 20,
  restitution: 1,
  repel: 0,
  mode: 'none',
  umask: 0xffffffff,
  breedCap: 10,
  seed: SEED,
  organism: false,
  minScale: 0.4,
  maxScale: 1.6,
  minAlpha: 40,
  maxAlpha: 100,
};
const restingPair = () => {
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400;
  sys.y[0] = 350;
  sys.x[1] = 430;
  sys.y[1] = 350;
  sys.vx[0] = 0;
  sys.vy[0] = 0;
  sys.vx[1] = 0;
  sys.vy[1] = 0;
  sys.mass[0] = 1;
  sys.mass[1] = 1;
  sys.scale[0] = 1;
  sys.scale[1] = 1;
  sys.color[0] = '#ff0000';
  sys.color[1] = '#0000ff';
  syncDishPigment(sys); // the working copy starts at the visible colours
  sys._layout = { contactRadius: 20 };
  return sys;
};
const stepTrio = (sys, opts = {}) => {
  sys._contactPass(CTX);
  stepDishCoalesce(sys, {});
  stepDishPigment(sys, DT, opts);
};
const rgb = (sys, i) => [sys.leakRgb[i * 3], sys.leakRgb[i * 3 + 1], sys.leakRgb[i * 3 + 2]];

// (a) + (c) — the trade law, closed form; symmetry throughout.
{
  const sys = restingPair();
  let gapProd = 1; // Π (1 − 2·k·f) over traded steps
  let prevR0 = 255;
  for (let s = 1; s <= 3600; s++) {
    stepTrio(sys);
    const f = coalesceFactor(s); // dwell after s steps of sustained contact
    if (s <= COALESCE_DWELL_GATE) {
      assert.deepStrictEqual(rgb(sys, 0), [255, 0, 0], `step ${s}: below the gate nothing trades (dwell-weighted)`);
      assert.deepStrictEqual(rgb(sys, 1), [0, 0, 255], `step ${s}: below the gate, partner untouched`);
    } else {
      gapProd *= 1 - 2 * BASE_K * f;
      const [r0, g0, b0] = rgb(sys, 0);
      const [r1, g1, b1] = rgb(sys, 1);
      // (c) — the pair's mean is conserved exactly, per channel.
      assert.ok(Math.abs(r0 + r1 - 255) < 1e-9, `step ${s}: red mean conserved (${r0}+${r1})`);
      assert.ok(Math.abs(b0 + b1 - 255) < 1e-9, `step ${s}: blue mean conserved (${b0}+${b1})`);
      assert.ok(g0 === 0 && g1 === 0, `step ${s}: an equal channel never moves`);
      // closed form: each body sits mean ± half the shrunk gap.
      const expR0 = 127.5 + 127.5 * gapProd;
      assert.ok(Math.abs(r0 - expR0) < 1e-6, `step ${s}: red follows the rate law (${r0} vs ${expR0})`);
      // monotone approach, never an overshoot past the mean.
      assert.ok(r0 < prevR0 && r0 >= 127.5 - 1e-9, `step ${s}: monotone, no overshoot (${r0})`);
      prevR0 = r0;
      if (s === 200) {
        assert.notStrictEqual(
          sys.color[0],
          '#ff0000',
          'by step 200 the quantized write-back has visibly traded (it lags the working copy by design — the atlas discipline)',
        );
      }
    }
  }
  // The acceptance probe: 60 s of contact — measurably converged.
  const [r0, , b0] = rgb(sys, 0);
  const [r1, , b1] = rgb(sys, 1);
  assert.ok(
    Math.abs(r0 - r1) < 1 && Math.abs(b0 - b1) < 1,
    `after 60 s the channel gap is under 1/255 of its start (${Math.abs(r0 - r1)})`,
  );
  assert.strictEqual(sys.color[0], sys.color[1], 'the visible colours converge to the same hex');
  assert.strictEqual(sys.color[0], '#800080', 'the converged colour is the pair mean, quantized');
  assert.strictEqual(pigmentHex(127.5, 0, 127.5), '#800080', 'write-back quantization is the #287 discipline');
}

// (b) — history: separation keeps the earned colour, bit for bit.
{
  const sys = restingPair();
  for (let s = 0; s < 200; s++) stepTrio(sys);
  const earnedRgb = [...sys.leakRgb];
  const earnedColor = [...sys.color];
  assert.notStrictEqual(earnedColor[0], '#ff0000', 'fixture: the pair actually traded');
  sys.x[1] = 900; // far apart: the tracker drains and forgets the pair
  for (let s = 0; s < 120; s++) stepTrio(sys);
  assert.strictEqual(sys._coalesce.pairs.size, 0, 'the separated pair is forgotten by the tracker');
  assert.deepStrictEqual([...sys.leakRgb], earnedRgb, 'the earned pigment is kept exactly (history)');
  assert.deepStrictEqual([...sys.color], earnedColor, 'the visible colour is kept exactly (not a shader trick)');
}

// (j) — the pair read API B3 consumes: canonical, factor-carrying.
{
  const sys = restingPair();
  for (let s = 0; s < COALESCE_DWELL_GATE; s++) stepTrio(sys);
  assert.deepStrictEqual(coalescePairs(sys), [], 'no pairs read below the gate');
  for (let s = COALESCE_DWELL_GATE; s < COALESCE_DWELL_GATE + COALESCE_RAMP_STEPS; s++) stepTrio(sys);
  assert.deepStrictEqual(coalescePairs(sys), [{ i: 0, j: 1, f: 1 }], 'one canonical pair at full factor');
}

// Seeded full-update harness for (d), (e), (g). 'stick' so bodies
// genuinely rest against each other and merge (B2's harness).
const lpSwarm = (over = {}) =>
  normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    particleCount: 90,
    contactRadius: 26,
    contactMode: 'stick',
    contactRestitution: 0.6,
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
    lifeDrift: 0,
    ...over,
  });
const runSys = (lp, steps, extra = {}, seed = SEED) => {
  const sys = new ParticleSystem();
  sys.init(lp.particleCount, 1000, 700, assets, palette, seed, null, { graze: lp.graze || 0 });
  const trail = [];
  for (let s = 0; s < steps; s++) {
    sys.update({ ...lp, maxParticles: 200, ...extra }, assets, palette, seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    trail.push({ leak: [...sys.leakRgb], color: [...sys.color] });
  }
  return { sys, trail };
};
const assertSamePhysics = (a, b, label) => {
  for (const fld of ['x', 'y', 'vx', 'vy']) {
    for (let i = 0; i < a.n; i++) {
      assert.ok(Object.is(a[fld][i], b[fld][i]), `${label}: ${fld}[${i}] ${a[fld][i]} vs ${b[fld][i]}`);
    }
  }
};

// (d) — physics byte-identity, exchange on vs off.
{
  const on = runSys(lpSwarm(), 90);
  const off = runSys(lpSwarm(), 90, { pigment: false });
  assertSamePhysics(on.sys, off.sys, 'pigment on == off');
  assert.ok(
    on.sys.color.some((c) => !palette.swatches.includes(c)),
    'the on run earned colours outside the palette (the comparison is not vacuous)',
  );
  assert.ok(
    off.sys.color.every((c) => palette.swatches.includes(c)),
    'the off run never writes a colour: every body keeps its dealt swatch',
  );
  for (let s = 1; s < off.trail.length; s++) {
    assert.deepStrictEqual(
      off.trail[s].leak,
      off.trail[0].leak,
      `off step ${s}: the working copy never moves (the trade is the only writer here)`,
    );
  }
  for (let i = 0; i < off.sys.n; i++) {
    const [r, g, b] = rgb(off.sys, i);
    assert.strictEqual(pigmentHex(r, g, b), off.sys.color[i], `off body ${i}: working copy still its dealt colour`);
  }
}

// (e) — reduced-motion: no accrual, the state tracks, physics same.
{
  const on = runSys(lpSwarm(), 90);
  const rm = runSys(lpSwarm(), 90, { reducedMotion: true });
  const off = runSys(lpSwarm(), 90, { pigment: false });
  assert.ok(
    rm.sys._coalesce && rm.sys._coalesce.pairs.size > 0,
    'the dwell state still tracks underneath the stillness',
  );
  assert.deepStrictEqual(
    rm.trail,
    off.trail,
    'reduced-motion accrues no trade at any step (working copy + colours equal the off run)',
  );
  assertSamePhysics(on.sys, rm.sys, 'reduced-motion == full motion, physically');
}

// (f) — the governor rung + the shed.
{
  const decl = getCostTier('engine/dish-pigment');
  assert.ok(decl, 'pigment cost tier registered');
  assert.strictEqual(decl.tier, 2, 'pigment sheds on tier 2, deform\u2019s rung');
  assert.ok(!tier1ShedIds().includes('engine/dish-pigment'), 'the tier-1 shed set does not name it');
  assert.strictEqual(
    dishPigmentShed({ perfTier1: true, quality: 'performance' }),
    true,
    'shed: tier 1 gone AND quality at performance',
  );
  assert.strictEqual(
    dishPigmentShed({ perfTier1: true, quality: 'balanced' }),
    false,
    'no shed: tier 1 gone but quality not stepped down',
  );
  assert.strictEqual(dishPigmentShed({ perfTier1: false, quality: 'performance' }), false, 'no shed: tier 1 still on');
  assert.strictEqual(dishPigmentShed({}), false, 'no shed: a still/export doc carries no governor state');

  const sys = restingPair();
  for (let s = 0; s < COALESCE_DWELL_GATE + COALESCE_RAMP_STEPS; s++) stepTrio(sys);
  const before = [...sys.leakRgb];
  stepTrio(sys, { shed: true });
  assert.deepStrictEqual([...sys.leakRgb], before, 'a shed step trades nothing');
  stepTrio(sys); // unshed: the trade resumes from the earned state
  assert.notDeepStrictEqual([...sys.leakRgb], before, 'the trade resumes after the shed lifts');
}

// (g) — bake equals live: identical runs, identical trades.
{
  const a = runSys(lpSwarm(), 90);
  const b = runSys(lpSwarm(), 90);
  assert.deepStrictEqual(a.trail, b.trail, 'the trade trail is a pure function of (seed, params, steps)');
  const other = runSys(lpSwarm(), 90, {}, SEED + 7);
  assert.notDeepStrictEqual(other.trail, a.trail, 'a different seed trades differently (seeded, not canned)');
}

// (h) — a palette re-deal re-seeds the working copy.
{
  const lp = lpSwarm({ contactRadius: 0, contactMode: 'none' }); // no contacts: sync is the only mover
  const sys = new ParticleSystem();
  sys.init(6, 1000, 700, assets, palette, SEED);
  sys.update({ ...lp, maxParticles: 50 }, assets, palette, SEED, BAKE_TIME_ORIGIN, null);
  const paletteB = { swatches: ['#101010', '#203040', '#f0e0d0'] };
  sys.update({ ...lp, maxParticles: 50 }, assets, paletteB, SEED, BAKE_TIME_ORIGIN + BAKE_DT_MS, null);
  for (let i = 0; i < sys.n; i++) {
    assert.strictEqual(sys.color[i], paletteB.swatches[i % 3], `body ${i}: re-dealt from the new palette`);
    const [r, g, b] = rgb(sys, i);
    assert.strictEqual(
      pigmentHex(r, g, b),
      sys.color[i],
      `body ${i}: working copy re-seeded (no repaint from the old palette)`,
    );
  }
}

// (i) — the wiring: call sites only, law in the module.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const resolve = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  assert.ok(
    particles.includes('stepDishPigment(this') && particles.includes('syncDishPigment(this)'),
    'particles.js takes the step + palette-sync call sites',
  );
  assert.ok(
    particles.includes('_pigmentOn = layoutParams.pigment !== false'),
    'the spread-only switch is read in update()',
  );
  assert.ok(!particles.includes('PIGMENT_RATE_PER_SEC'), 'the rate law stays in the module, not the integrator');
  assert.ok(
    resolve.includes('pigmentShed: !!ctx.pigmentShed') && resolve.includes('dishPigmentShed({'),
    'the resolver forwards the governor\u2019s shed into the swarm update',
  );
}

console.log(
  'dishPigment.selfcheck: OK (#1412 — closed-form dwell-weighted trade, 60 s convergence, history kept, exact symmetry, physics byte-identity, reduced-motion rest, tier-2 shed, bake=live, palette re-seed)',
);
