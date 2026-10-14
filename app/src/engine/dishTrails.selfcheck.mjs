// node src/engine/dishTrails.selfcheck.mjs
//
// Petri dish C3 (#1415) — trails: ACCUM deposits, bodies read
// (stigmergy). The law in dishTrails.mjs, pinned.
//
//   (a) the law's units: a fresh field is exactly zero; deposits land
//       on the nearest cell, saturate at TRAIL_MAX, and refuse junk;
//       the bilinear sample peaks at a deposit; the gradient climbs
//       toward one; the fade reaches EXACT zero on the schedule
//       derived from the constants (non-zero one tick before);
//   (b) the read algebra: the group reading is 2·∇own − ∇total,
//       checked against the direct gradients; a stratum that deposits
//       nothing reads pure avoidance through the shared empty field;
//       the resolutions are honest — no session, no substrate, or an
//       unenrolled system all resolve NO_TRAILS;
//   (c) the tick's honesty: deposits are proportional to motion (a
//       still body lays nothing, a half-speed body lays half), a
//       system that did not step lays nothing (its field only fades),
//       a radius-0 enrolment lays nothing (the C1 gate), and a dead
//       slot lays nothing;
//   (d) the ground remembers: release does not subtract (the total is
//       bit-identical after the depositor leaves), a successor
//       enrolment reads the ghost, and clearDishTrails wipes every
//       field to exact zero;
//   (e) the off-path: with ACCUM off everywhere, a full dish cast
//       (contacts, medium, currents all live) creates NO substrate
//       across 240 ticked steps and is bit-identical to the same cast
//       never ticked; with ACCUM on, the same fixture's trajectory
//       differs (the identity is not vacuous);
//   (f) the acceptance probe: successor generations, same seed — a
//       follower colony re-seeded into the dish its predecessor wore
//       ends measurably closer to the predecessor's recorded path
//       than the trail-off control (predecessor accumulated nothing),
//       at the pinned seed and across a seed sweep; the run is
//       deterministic bit for bit;
//   (g) fresh-seed purity at cast level: after clearDishTrails, a
//       follower rerun is bit-identical to the same follower in a
//       virgin session (a fresh seed starts with an empty field);
//   (h) bake parity: the dish bake rides the trails — repeats bit for
//       bit with ACCUM on, and is not the ACCUM-off bake;
//   (i) wiring pins: the call sites exist, the gradient algebra stays
//       in the module, and the module carries no clock or dice.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { bakeDishParticles } from './kernel/bake/dishBake.mjs';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import {
  createDishSession, enrolDishBody, releaseDishBody, armDish, dishEnrolRadius,
} from './dishContacts.mjs';
import {
  createDishTrailField, depositTrailAt, sampleTrail, sampleTrailGradient,
  sampleTrailReadGradient, ensureEntryTrails, dishTrailsFor, tickDishTrails,
  clearDishTrails, NO_TRAILS,
  TRAIL_COLS, TRAIL_ROWS, TRAIL_CELLS, TRAIL_FADE, TRAIL_EPS, TRAIL_MAX,
  TRAIL_DEPOSIT, TRAIL_SPEED_FULL, TRAIL_GAIN,
} from './dishTrails.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-12;

// (a) — the law's units.
{
  const f = createDishTrailField();
  assert.strictEqual(f.cells.length, TRAIL_CELLS);
  assert.ok(f.cells.every((v) => v === 0), 'a fresh field is exactly zero');

  // Deposit at (0.5, 0.5): nearest cell is (32, 18).
  const k = 18 * TRAIL_COLS + 32;
  depositTrailAt(f, 0.5, 0.5, 1.25);
  assert.strictEqual(f.cells[k], 1.25, 'the deposit lands on the nearest cell');
  depositTrailAt(f, 0.5, 0.5, 99);
  assert.strictEqual(f.cells[k], TRAIL_MAX, 'a cell saturates at TRAIL_MAX');
  depositTrailAt(f, NaN, 0.5, 1);
  depositTrailAt(f, 0.5, 0.5, -2);
  depositTrailAt(f, 0.5, 0.5, NaN);
  let mass = 0;
  for (const v of f.cells) mass += v;
  assert.strictEqual(mass, TRAIL_MAX, 'junk deposits nothing');

  // The sample peaks at the deposit; the gradient climbs toward it.
  // (One-cell deposits have ~2-cell reach under bilinear sampling —
  // the gradient probes sit just outside the deposit's cell.)
  const at = sampleTrail(f, 0.5078, 0.5139);
  assert.ok(at > TRAIL_MAX * 0.9, `the sample peaks at the deposit: ${at}`);
  assert.ok(sampleTrail(f, 0.1, 0.1) < 0.01, 'and reads ~zero far away');
  const west = sampleTrailGradient(f, 0.49, 0.5139, { gx: 0, gy: 0 });
  assert.ok(west.gx > 0, 'west of the deposit, the gradient climbs east toward it');
  const east = sampleTrailGradient(f, 0.53, 0.5139, { gx: 0, gy: 0 });
  assert.ok(east.gx < 0, 'east of it, the gradient climbs back west');

  // The fade schedule: exact zero at the derived tick, not before.
  const session = createDishSession();
  session.trailTotal = createDishTrailField();
  depositTrailAt(session.trailTotal, 0.5, 0.5, TRAIL_MAX);
  let nStar = 0;
  while (TRAIL_MAX * Math.pow(TRAIL_FADE, nStar) >= TRAIL_EPS) nStar++;
  for (let t = 0; t < nStar - 1; t++) tickDishTrails(session);
  assert.ok(session.trailTotal.cells[k] > 0, `one tick before the schedule, the trail lives: ${session.trailTotal.cells[k]}`);
  tickDishTrails(session);
  assert.strictEqual(session.trailTotal.cells[k], 0, 'on the schedule tick, the cell is exactly zero');
  assert.ok(session.trailTotal.cells.every((v) => v === 0), 'and the whole field is empty with it');
}

// (b) — the read algebra and the honest resolutions.
{
  const session = createDishSession();
  const sysA = { n: 0, _step: 0 };
  const sysB = { n: 0, _step: 0 };
  const eA = enrolDishBody(session, {
    key: 'a', sys: sysA, radius: 16, restitution: 0.5, contactMode: 'none',
    umask: 0xffffffff, organism: false, wetness: 0, accum: true,
  });
  enrolDishBody(session, {
    key: 'b', sys: sysB, radius: 16, restitution: 0.5, contactMode: 'none',
    umask: 0xffffffff, organism: false, wetness: 0, accum: false,
  });
  // A wore a path east of centre; the total carries it (and only it).
  depositTrailAt(eA.trailOwn, 0.7, 0.5, 3);
  depositTrailAt(session.trailTotal, 0.7, 0.5, 3);

  const resA = dishTrailsFor(session, sysA);
  assert.ok(resA.on && resA.own === eA.trailOwn && resA.total === session.trailTotal,
    'a depositor resolves its own field and the total');
  const u = 0.675; const v = 0.5; // just west of the deposit's cell (see (a))
  const read = sampleTrailReadGradient(resA, u, v, { gx: 0, gy: 0 });
  const gOwn = sampleTrailGradient(resA.own, u, v, { gx: 0, gy: 0 });
  const gTot = sampleTrailGradient(resA.total, u, v, { gx: 0, gy: 0 });
  assert.ok(Math.abs(read.gx - (2 * gOwn.gx - gTot.gx)) < EPS && Math.abs(read.gy - (2 * gOwn.gy - gTot.gy)) < EPS,
    'the group reading is 2·∇own − ∇total, exactly');
  assert.ok(read.gx > 0, 'a lone stratum climbs its own worn path');

  // B deposits nothing: its read is pure avoidance of A's ground.
  const resB = dishTrailsFor(session, sysB);
  assert.ok(resB.on, 'a non-depositing stratum still reads (the issue gates the deposit, not the reading)');
  const readB = sampleTrailReadGradient(resB, u, v, { gx: 0, gy: 0 });
  assert.ok(Math.abs(readB.gx - -gTot.gx) < EPS && readB.gx < 0,
    'with an empty own field, the read is −∇total: descend what others wore');

  // The honest resolutions.
  assert.deepStrictEqual(dishTrailsFor(null, sysA), NO_TRAILS, 'no session, no read');
  assert.deepStrictEqual(dishTrailsFor(createDishSession(), sysA), NO_TRAILS,
    'a session with no substrate (ACCUM never up) resolves off');
  assert.deepStrictEqual(dishTrailsFor(session, { n: 0, _step: 0 }), NO_TRAILS,
    'a system outside the dish does not read its ground');
  const sysGhost = { n: 0, _step: 0 };
  enrolDishBody(session, {
    key: 'ghost', sys: sysGhost, radius: 0, restitution: 0.5, contactMode: 'none',
    umask: 0xffffffff, organism: false, wetness: 0, accum: true,
  });
  assert.deepStrictEqual(dishTrailsFor(session, sysGhost), NO_TRAILS,
    'an enrolment at radius 0 (DISH off) neither lays nor reads — the dish does not touch it');
  assert.deepStrictEqual(sampleTrailReadGradient(NO_TRAILS, u, v, { gx: 9, gy: 9 }), { gx: 0, gy: 0 },
    'the off resolution reads exactly zero');
}

// (c) — the tick's honesty. A hand-built system: the tick reads
// columns only, so the deposit entering the tick is fully known.
{
  const session = createDishSession();
  const fake = {
    n: 3, _step: 0, canvasW: 1000, canvasH: 700,
    x: new Float64Array([500, 250, 750]), y: new Float64Array([350, 175, 525]),
    vx: new Float64Array([TRAIL_SPEED_FULL, TRAIL_SPEED_FULL / 2, 0]),
    vy: new Float64Array([0, 0, 0]),
    alive: new Uint8Array([1, 1, 1]),
  };
  const e = enrolDishBody(session, {
    key: 'a', sys: fake, radius: 16, restitution: 0.5, contactMode: 'none',
    umask: 0xffffffff, organism: false, wetness: 0, accum: true,
  });
  tickDishTrails(session); // the system has not stepped since enrolment
  assert.ok(e.trailOwn.cells.every((v) => v === 0), 'no step, no deposit — enrolment alone lays nothing');
  fake._step = 1;
  tickDishTrails(session);
  const kFull = 18 * TRAIL_COLS + 32; // (500, 350)
  const kHalf = 9 * TRAIL_COLS + 16; // (250, 175)
  assert.strictEqual(e.trailOwn.cells[kFull], TRAIL_DEPOSIT, 'full speed earns the full deposit');
  assert.strictEqual(e.trailOwn.cells[kHalf], TRAIL_DEPOSIT / 2, 'half speed earns half');
  assert.strictEqual(session.trailTotal.cells[kFull], TRAIL_DEPOSIT, 'the total receives the same deposit');
  let mass = 0;
  for (const v of e.trailOwn.cells) mass += v;
  assert.ok(Math.abs(mass - TRAIL_DEPOSIT * 1.5) < EPS, 'the still body laid nothing (mass is the two movers only)');
  // No step since: the next tick only fades.
  tickDishTrails(session);
  assert.strictEqual(e.trailOwn.cells[kFull], TRAIL_DEPOSIT * TRAIL_FADE,
    'a system that did not step lays no phantom trail — its field only fades');
  // A dead slot lays nothing even at speed.
  fake.alive[0] = 0; fake._step = 2;
  tickDishTrails(session);
  assert.ok(Math.abs(e.trailOwn.cells[kFull] - TRAIL_DEPOSIT * TRAIL_FADE * TRAIL_FADE) < EPS,
    'the dead slot deposited nothing on the stepped tick');
  // The C1 gate: a radius-0 enrolment lays nothing.
  const session2 = createDishSession();
  const fake2 = {
    n: 1, _step: 0, canvasW: 1000, canvasH: 700,
    x: new Float64Array([500]), y: new Float64Array([350]),
    vx: new Float64Array([3]), vy: new Float64Array([0]), alive: new Uint8Array([1]),
  };
  const e2 = enrolDishBody(session2, {
    key: 'ghost', sys: fake2, radius: 0, restitution: 0.5, contactMode: 'none',
    umask: 0xffffffff, organism: false, wetness: 0, accum: true,
  });
  fake2._step = 1; // it stepped — so the radius gate, not the step guard, is what blocks the deposit
  tickDishTrails(session2);
  assert.ok(e2.trailOwn.cells.every((v) => v === 0), 'outside the dish gate, ACCUM lays no trail');
}

// (d) — the ground remembers; the wipe is exact.
{
  const session = createDishSession();
  const fake = {
    n: 1, _step: 0, canvasW: 1000, canvasH: 700,
    x: new Float64Array([500]), y: new Float64Array([350]),
    vx: new Float64Array([2]), vy: new Float64Array([0]), alive: new Uint8Array([1]),
  };
  enrolDishBody(session, {
    key: 'pred', sys: fake, radius: 16, restitution: 0.5, contactMode: 'none',
    umask: 0xffffffff, organism: false, wetness: 0, accum: true,
  });
  fake._step = 1;
  tickDishTrails(session);
  const before = Float64Array.from(session.trailTotal.cells);
  assert.ok(before.some((v) => v > 0), 'the predecessor laid trail');
  releaseDishBody(session, fake);
  assert.deepStrictEqual(session.trailTotal.cells, before,
    'release does not subtract: the ground remembers the predecessor bit for bit');
  // A successor enrols and reads the ghost.
  const heir = { n: 0, _step: 0 };
  enrolDishBody(session, {
    key: 'heir', sys: heir, radius: 16, restitution: 0.5, contactMode: 'none',
    umask: 0xffffffff, organism: false, wetness: 0, accum: false,
  });
  const res = dishTrailsFor(session, heir);
  assert.ok(res.on, 'the successor resolves a reading on the remembered ground');
  const g = sampleTrailReadGradient(res, 0.49, 0.5, { gx: 0, gy: 0 });
  assert.ok(g.gx < 0, 'the ghost reads as others’ ground: west of the worn cell, avoidance pushes further west');
  clearDishTrails(session);
  assert.ok(session.trailTotal.cells.every((v) => v === 0), 'the wipe empties the total exactly');
}

// Cast helpers for (e)–(g). Two strata in one session, stepped in
// stratum order with the bake's time origin — the live protocol at
// locked dt.
const castLp = (accum, extra = {}) => normalizeLayoutParams({
  ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', behave: 'cruise', particleCount: 16,
  contactRadius: 16, contactRestitution: 0.7, contactMode: 'bounce',
  windMode: 'curl', wind: 1, accumulationWetness: 0.5, accumulation: accum,
  swarmCohesion: 0, gravityWells: 0,
  kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
  ...extra,
});
const runDishCast = ({ accum, tick, steps = 240 }) => {
  const session = createDishSession();
  const mk = (key, seed) => {
    const lp = castLp(accum);
    const sys = new ParticleSystem();
    sys.init(lp.particleCount, 1000, 700, assets, palette, seed);
    enrolDishBody(session, {
      key, sys, radius: dishEnrolRadius(lp), restitution: lp.contactRestitution,
      contactMode: lp.contactMode, umask: 0xffffffff, organism: false,
      wetness: lp.accumulationWetness, accum,
    });
    return { sys, params: { ...lp, dishSession: session, particleCount: sys.n, maxParticles: 40 }, seed };
  };
  const units = [mk('a', SEED), mk('b', SEED + 7)];
  for (let s = 0; s < steps; s++) {
    armDish(session, ['a', 'b']);
    for (const u of units) {
      u.sys.update(u.params, assets, palette, u.seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    }
    if (tick) tickDishTrails(session);
  }
  return { units, session };
};
const flatCast = (units) => units.map((u) => [
  ...Array.from(u.sys.x), ...Array.from(u.sys.y),
  ...Array.from(u.sys.vx), ...Array.from(u.sys.vy),
]);

// (e) — the off-path, exactly.
{
  const offTicked = runDishCast({ accum: false, tick: true });
  assert.strictEqual(offTicked.session.trailTotal, null,
    'ACCUM off everywhere: 240 ticked steps create no substrate');
  const offUnticked = runDishCast({ accum: false, tick: false });
  assert.deepStrictEqual(flatCast(offTicked.units), flatCast(offUnticked.units),
    'ACCUM off: the ticked dish cast is bit-identical to the unticked one — C3 adds exactly zero');
  const on = runDishCast({ accum: true, tick: true });
  assert.ok(on.session.trailTotal !== null, 'ACCUM on: the substrate exists');
  assert.notDeepStrictEqual(flatCast(on.units), flatCast(offTicked.units),
    'ACCUM on: the same fixture’s trajectory bends to the trails (the identity above is not vacuous)');
}

// (f) — the acceptance probe: successor generations, same seed.
const colonyLp = (accum) => normalizeLayoutParams({
  ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', behave: 'cruise', particleCount: 20,
  contactRadius: 16, contactMode: 'none', windMode: 'curl', wind: 1,
  swarmCohesion: 0, gravityWells: 0, accumulation: accum,
  kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
});
const runColony = (session, key, lp, seed, steps, recordPath) => {
  const sys = new ParticleSystem();
  sys.init(lp.particleCount, 1000, 700, assets, palette, seed);
  enrolDishBody(session, {
    key, sys, radius: dishEnrolRadius(lp), restitution: 0.5, contactMode: 'none',
    umask: 0xffffffff, organism: false, wetness: 0, accum: !!lp.accumulation,
  });
  const params = { ...lp, dishSession: session, particleCount: sys.n, maxParticles: 40 };
  const path = [];
  for (let s = 0; s < steps; s++) {
    sys.update(params, assets, palette, seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    tickDishTrails(session);
    if (recordPath && s % 5 === 0) {
      for (let i = 0; i < sys.n; i++) path.push([sys.x[i], sys.y[i]]);
    }
  }
  return { sys, path };
};
const meanDistToPath = (sys, path) => {
  let sum = 0;
  for (let i = 0; i < sys.n; i++) {
    let best = Infinity;
    for (const [px, py] of path) {
      const d = (sys.x[i] - px) ** 2 + (sys.y[i] - py) ** 2;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / sys.n;
};
const successorProbe = (seed, predAccum) => {
  const session = createDishSession();
  const pred = runColony(session, 'pred', colonyLp(predAccum), seed, 300, true);
  releaseDishBody(session, pred.sys);
  const fol = runColony(session, 'follower', colonyLp(true), seed, 240, false);
  return { d: meanDistToPath(fol.sys, pred.path), fol };
};
{
  const treat = successorProbe(SEED, true);
  const ctrl = successorProbe(SEED, false);
  assert.ok(ctrl.d > 8, `the control is not vacuous: the unworn dish leaves the follower ${ctrl.d.toFixed(1)}px from the path`);
  assert.ok(treat.d < 0.75 * ctrl.d,
    `the successor organises along the predecessor’s path: ${treat.d.toFixed(1)}px vs control ${ctrl.d.toFixed(1)}px`);
  const again = successorProbe(SEED, true);
  for (let i = 0; i < again.fol.sys.n; i++) {
    assert.ok(Object.is(again.fol.sys.x[i], treat.fol.sys.x[i]) && Object.is(again.fol.sys.y[i], treat.fol.sys.y[i]),
      'the probe is deterministic (bake = live arithmetic)');
  }
  for (const seed of [0xbeef, 0x77, 0x3d21]) {
    const t = successorProbe(seed, true);
    const c = successorProbe(seed, false);
    assert.ok(t.d < 0.9 * c.d,
      `seed 0x${seed.toString(16)}: the successor organises along the predecessor’s path (${t.d.toFixed(1)}px vs ${c.d.toFixed(1)}px)`);
  }
}

// (g) — fresh-seed purity at cast level.
{
  const worn = createDishSession();
  const pred = runColony(worn, 'pred', colonyLp(true), SEED, 300, false);
  releaseDishBody(worn, pred.sys);
  clearDishTrails(worn);
  const heirWiped = runColony(worn, 'follower', colonyLp(true), SEED, 240, false);
  const virgin = createDishSession();
  const heirVirgin = runColony(virgin, 'follower', colonyLp(true), SEED, 240, false);
  for (let i = 0; i < heirWiped.sys.n; i++) {
    assert.ok(Object.is(heirWiped.sys.x[i], heirVirgin.sys.x[i]) && Object.is(heirWiped.sys.vx[i], heirVirgin.sys.vx[i]),
      'after the wipe, the follower runs bit-identical to a virgin session: a fresh seed starts with an empty field');
  }
}

// (h) — bake parity.
{
  const lpFor = (accum) => normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 24,
    contactRadius: 16, contactRestitution: 0.7, contactMode: 'bounce',
    windMode: 'curl', accumulation: accum,
  });
  const bake = (accum) => bakeDishParticles({
    layers: [
      { key: 'a', seed: SEED, count: 24, layoutParams: lpFor(accum), activeAssets: assets, palette, maxParticles: 60 },
      { key: 'b', seed: SEED + 7, count: 20, layoutParams: lpFor(accum), activeAssets: assets, palette, maxParticles: 60 },
    ],
    canvasW: 1000, canvasH: 700, steps: 60,
  });
  const flat = (m) => JSON.stringify([...m.entries()].map(([k, items]) => [k, items.map((it) => [it.x, it.y])]));
  const a1 = bake(true); const a2 = bake(true);
  assert.strictEqual(flat(a1), flat(a2), 'the trails bake is a pure function of its inputs');
  assert.notStrictEqual(flat(a1), flat(bake(false)), 'the bake rides the trails, not the unworn ground');
}

// (i) — wiring pins.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const contacts = readFileSync(new URL('./dishContacts.mjs', import.meta.url), 'utf8');
  const resolver = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  const bakeSrc = readFileSync(new URL('./kernel/bake/dishBake.mjs', import.meta.url), 'utf8');
  const law = readFileSync(new URL('./dishTrails.mjs', import.meta.url), 'utf8');
  assert.ok(particles.includes('dishTrailsFor(layoutParams.dishSession || null, this)'),
    'update() resolves the trail reading from the session');
  assert.ok(particles.includes('sampleTrailReadGradient(trails,'), 'update() reads the group gradient at the force pass');
  assert.ok(!particles.includes('TRAIL_FADE') && !particles.includes('TRAIL_DEPOSIT'),
    'no fade or deposit arithmetic leaks into the integrator');
  assert.ok(contacts.includes('ensureEntryTrails(session, e)'), 'enrolment creates the substrate for accumulating strata');
  assert.ok(resolver.includes('accum: !!ctx.layoutParams.accumulation'), 'the resolver enrols the ACCUMULATION switch');
  assert.ok(resolver.includes('tickDishTrails(dishSession)'), 'the resolver ticks the substrate once per frame');
  assert.ok(resolver.includes('clearDishTrails(dishSession)'), 'the resolver wipes the field on a genuine reseed');
  assert.ok(bakeSrc.includes('accum: !!layer.layoutParams.accumulation'), 'the bake driver enrols the ACCUMULATION switch');
  assert.ok(bakeSrc.includes('tickDishTrails(session)'), 'the bake driver ticks the substrate once per step');
  assert.ok(!/Math\.random|Date\.now/.test(law), 'the trails law is deterministic by construction');
}

console.log('dishTrails.selfcheck: OK (#1415 — law units + fade schedule, read algebra, tick honesty, ground memory, ACCUM-off bit-identity, successor-generation acceptance probe, fresh-seed purity, bake parity, wiring)');
