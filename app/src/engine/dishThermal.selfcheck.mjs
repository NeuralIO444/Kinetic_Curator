// node src/engine/dishThermal.selfcheck.mjs
//
// Petri dish §4 rows (#1538) — TEMPO as thermal energy, DENSITY as
// crowding pressure. The law in dishThermal.mjs, pinned.
//
//   (a) the curves, unit-pinned: the tempo clamp (junk reads cold),
//       the linear jitter amplitude (exactly 0 at 0 — the identity),
//       the stillness override, and the crowding gain (exactly 1 at
//       the pivot, which is pinned to the shipped density default);
//   (b) defaults parity through full updates: a dish with the rows
//       absent is bit-identical to dishTempo 0 + density 78, in
//       bounce and in breed — and the comparison is not vacuous
//       (tempo 1 moves it; density 10 vs 100 move it);
//   (c) the acceptance probe: the packed colony's residual kinetic
//       energy after 240 steps — a hot dish keeps measurably more
//       than a cold one (the spec's sentence: hot never settles);
//   (d) stillness: under reduced-motion, TEMPO 1 integrates exactly
//       as TEMPO 0 — thermal reads the stillness law, not the knob
//       (spec §7);
//   (e) wiring pins: the call sites exist in the integrator, the
//       param is registered with default 0, and the law module
//       carries no clock or dice.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import {
  clampDishTempo, thermalJitterAmp, dishThermalFor, COLD_THERMAL,
  crowdingRepelGain, DENSITY_PIVOT, THERMAL_JITTER_MAX,
} from './dishThermal.mjs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;

// (a) — the curves, unit-pinned.
{
  assert.deepStrictEqual(COLD_THERMAL, { tempo: 0, amp: 0 }, 'the cold thermal is the identity');
  assert.strictEqual(clampDishTempo(0), 0);
  assert.strictEqual(clampDishTempo(0.5), 0.5);
  assert.strictEqual(clampDishTempo(1), 1);
  assert.strictEqual(clampDishTempo(7), 1, 'over-travel clamps to full hot');
  assert.strictEqual(clampDishTempo(-2), 0, 'under-travel clamps to cold');
  assert.strictEqual(clampDishTempo(undefined), 0, 'absent reads cold (the pre-#1538 world)');
  assert.strictEqual(clampDishTempo(NaN), 0, 'NaN reads cold');
  assert.strictEqual(clampDishTempo('gale'), 0, 'junk reads cold');
  assert.strictEqual(thermalJitterAmp(0), 0, 'amp is exactly 0 at tempo 0 — the parity identity');
  assert.strictEqual(thermalJitterAmp(1), THERMAL_JITTER_MAX, 'amp is the max at tempo 1');
  assert.strictEqual(thermalJitterAmp(0.5), THERMAL_JITTER_MAX / 2, 'amp is linear — no hidden knee');
  assert.deepStrictEqual(dishThermalFor(1, true), { tempo: 1, amp: 0 },
    'stillness zeroes the amp at any knob value (spec §7)');
  assert.strictEqual(dishThermalFor(1, false).amp, THERMAL_JITTER_MAX, 'motion allowed: full amp');

  assert.strictEqual(DENSITY_PIVOT, DEFAULT_LAYOUT_PARAMS.density,
    'the crowding pivot IS the shipped density default — the two can never drift apart');
  assert.strictEqual(crowdingRepelGain(DENSITY_PIVOT), 1, 'gain is exactly 1 at the pivot');
  assert.strictEqual(crowdingRepelGain(10), 10 / DENSITY_PIVOT, 'the knob floor presses at 10/78');
  assert.strictEqual(crowdingRepelGain(100), 100 / DENSITY_PIVOT, 'the knob ceiling presses at 100/78');
  assert.strictEqual(crowdingRepelGain(undefined), 1, 'absent density presses as before (gain 1)');
  assert.strictEqual(crowdingRepelGain(NaN), 1, 'junk density presses as before (gain 1)');
  assert.strictEqual(PARAM_SPEC.dishTempo.min, 0, 'TEMPO is registered, floor 0');
  assert.strictEqual(PARAM_SPEC.dishTempo.max, 1, 'TEMPO is registered, ceiling 1');
  assert.strictEqual(DEFAULT_LAYOUT_PARAMS.dishTempo, 0, 'TEMPO defaults cold — existing Looks cannot shift');
}

// Full-update harness (the census / dishMedium idiom: update() is
// what the studio bake steps). Raw params — update() reads the two
// rows directly, and parity is a claim about absent keys.
const runSys = (lp, steps, place = null) => {
  const sys = new ParticleSystem();
  sys.init(lp.particleCount, 1000, 700, assets, palette, SEED, null, { graze: 0 });
  if (place) place(sys);
  for (let s = 0; s < steps; s++) {
    sys.update({ ...lp, maxParticles: 200 }, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
  return sys;
};
const assertSamePhysics = (a, b, label) => {
  assert.strictEqual(a.n, b.n, `${label}: population`);
  for (const fld of ['x', 'y', 'vx', 'vy']) {
    for (let i = 0; i < a.n; i++) {
      assert.ok(Object.is(a[fld][i], b[fld][i]), `${label}: ${fld}[${i}] ${a[fld][i]} !== ${b[fld][i]}`);
    }
  }
};
const settleKE = (sys) => {
  let ke = 0;
  for (let i = 0; i < sys.n; i++) {
    if (sys.alive && !sys.alive[i]) continue;
    ke += 0.5 * sys.mass[i] * (sys.vx[i] * sys.vx[i] + sys.vy[i] * sys.vy[i]);
  }
  return ke;
};
const baseLp = (over = {}) => ({
  mode: 'swarm', particleCount: 24, contactRadius: 28, contactMode: 'bounce',
  contactRestitution: 0.4, contactRepel: 1.2, gravityWells: 0, swarmCohesion: 0,
  flap: 0, metabolism: 0, wind: 0, kinemeBreath: 0, kinemeDrift: 0,
  kinemePaletteBreath: 0, lifeDrift: 0, ...over,
});
// The crowded formation (the census's packed colony): a packed grid
// placed by hand, falling together.
const placePack = (sys) => {
  for (let i = 0; i < sys.n; i++) {
    sys.x[i] = 412 + (i % 8) * 22;
    sys.y[i] = 150 + Math.floor(i / 8) * 22;
    sys.vx[i] = 0; sys.vy[i] = 6; sys.scale[i] = 1.4; sys.mass[i] = 1.4;
  }
};

// (b) — defaults parity through full updates, bounce and breed.
for (const mode of ['bounce', 'breed']) {
  const lp = (over = {}) => baseLp({ contactMode: mode, particleCount: 60, contactRadius: 16, ...over });
  const absent = runSys(lp(), 60);
  const atDefaults = runSys(lp({ dishTempo: 0, density: DEFAULT_LAYOUT_PARAMS.density }), 60);
  assertSamePhysics(absent, atDefaults, `rows at defaults == rows absent (${mode})`);
  const hot = runSys(lp({ dishTempo: 1 }), 60);
  let differs = false;
  for (let i = 0; i < absent.n; i++) {
    if (!Object.is(absent.x[i], hot.x[i]) || !Object.is(absent.vx[i], hot.vx[i])) differs = true;
  }
  assert.ok(differs, `TEMPO 1 actually moves the ${mode} run (the parity comparison is not vacuous)`);
}
{
  const lo = runSys(baseLp({ density: 10 }), 240, placePack);
  const hi = runSys(baseLp({ density: 100 }), 240, placePack);
  let differs = false;
  for (let i = 0; i < lo.n; i++) {
    if (!Object.is(lo.x[i], hi.x[i]) || !Object.is(lo.vx[i], hi.vx[i])) differs = true;
  }
  assert.ok(differs, 'DENSITY 10 vs 100 must differ in the dish path (crowding pressure on the repel gain)');
}

// (c) — the acceptance probe: settle energy, cold vs hot.
{
  const cold = runSys(baseLp({ dishTempo: 0 }), 240, placePack);
  const hot = runSys(baseLp({ dishTempo: 1 }), 240, placePack);
  const keCold = settleKE(cold); const keHot = settleKE(hot);
  assert.ok(keHot > keCold, `a hot dish keeps more settle energy than a cold one: ${keCold.toFixed(3)} -> ${keHot.toFixed(3)}`);
  assert.ok(keHot > 1, `a hot dish is measurably awake, not numerically warm: KE ${keHot.toFixed(3)}`);
}

// (d) — stillness: reduced-motion reads the law, not the knob.
{
  const held0 = runSys(baseLp({ dishTempo: 0, reducedMotion: true }), 60);
  const held1 = runSys(baseLp({ dishTempo: 1, reducedMotion: true }), 60);
  assertSamePhysics(held0, held1, 'reduced-motion: TEMPO 1 integrates exactly as TEMPO 0');
}

// (e) — wiring pins.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const law = readFileSync(new URL('./dishThermal.mjs', import.meta.url), 'utf8');
  assert.ok(particles.includes('dishThermalFor(layoutParams.dishTempo, deformStill)'),
    'update() resolves TEMPO at the dish gate, stillness-aware');
  assert.ok(particles.includes('crowdingRepelGain(layoutParams.density)'),
    'update() maps DENSITY onto the repel gain at the contact-pass call site');
  assert.ok(particles.includes('thermal.amp > 0'), 'the kick is gated on a nonzero amp (cold path untouched)');
  assert.ok(!/Math\.random|Date\.now/.test(law), 'the §4 law is deterministic by construction');
}

console.log('dishThermal.selfcheck: OK (#1538 — TEMPO thermal jitter + DENSITY crowding pressure, defaults parity, stillness)');
