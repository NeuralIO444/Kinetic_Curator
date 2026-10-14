// node src/engine/dishEcology.selfcheck.mjs
//
// Petri dish C4 (#1416) — ecology: one global cap, breed/die tuned
// as population. The law in dishEcology.mjs, pinned.
//
//   (a) the ledger's units: the global cap is the sum of the dealt
//       caps; a cap is a share, not a ceiling (a stratum at its
//       share may breed on another's unused share; a full pool
//       refuses everyone); membership follows the dealt mode — an
//       ecology-off enrolment and a release both leave the pool;
//       enrolment refreshes the living count from the alive column;
//   (b) the resolutions: no session / unenrolled / radius-0 resolve
//       null (the #167 pass untouched); enrolled with the mode off
//       resolves { on: false }; a member resolves on, carrying the
//       session's density field; the layout param defaults off and
//       normalizes as a bool;
//   (c) the pressure law's units: accrual is proportional to the
//       excess over the crowd line (a saturated cell accrues a full
//       unit per step), relief sheds under the line and floors at
//       zero, the ripest body dies at the exposure threshold — one
//       per step, through the death path, ledger noted — and the
//       whole step holds under reduced-motion; a newborn inherits
//       no exposure;
//   (d) the mode off, exactly (acceptance): in a dish dealing breed
//       and die, ecology off holds every population at the dealt
//       roster for the whole run, the physics is bit-identical to
//       the same dish dealt mode none, no ledger is ever created,
//       and an absent param is the explicit false;
//   (e) the cap (acceptance): breed-heavy settings never exceed the
//       global cap on any frame of a long seeded run; the pool
//       fills exactly to the cap; a stratum breeds far past its own
//       cap on borrowed share; the ledger's books match the alive
//       columns exactly at the end;
//   (f) thinning (acceptance): a colony crowded under a hero-sized
//       grid cell thins under pressure alone (mode none — no contact
//       deaths dealt), does not crater, and the run is deterministic
//       bit for bit;
//   (g) growth and the gate (acceptance): an isolated colony in
//       free space multiplies up to the pool; the same colony packed
//       under the hero's cells does not grow at all, while without
//       the hero (small cells, sparse shares) it grows — the gate,
//       not the mode, is the mover;
//   (h) bake parity: the dish bake rides the ecology — repeats bit
//       for bit with the mode on, respects the pool, and is not the
//       mode-off bake (whose populations are the dealt roster);
//   (i) wiring pins: the call sites exist, the gate arithmetic stays
//       in the module, and the module carries no clock or dice.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { bakeDishParticles } from './kernel/bake/dishBake.mjs';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import {
  createDishSession, enrolDishBody, releaseDishBody, armDish, dishEnrolRadius,
} from './dishContacts.mjs';
import { buildDishDensity } from './dishDensity.mjs';
import {
  dishEcologyFor, ecologyBreedAllowed, stepDishEcology, countEcologyAlive,
  ECOLOGY_BREED_DENSITY_SHARE, ECOLOGY_CROWD_SHARE, ECOLOGY_DIE_EXPOSURE,
  ECOLOGY_RELIEF, ECOLOGY_DIE_PER_STEP,
} from './dishEcology.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const alive = (sys) => { let n = 0; for (let i = 0; i < sys.n; i++) if (sys.alive[i]) n++; return n; };

// (a) — the ledger's units, on hand-built systems (enrolment reads
// columns only, so the books entering the ledger are fully known).
{
  const session = createDishSession();
  const fakeA = { n: 3, _step: 0, alive: new Uint8Array([1, 1, 0]) };
  const fakeB = { n: 5, _step: 0, alive: new Uint8Array([1, 1, 1, 1, 1]) };
  enrolDishBody(session, {
    key: 'a', sys: fakeA, radius: 16, restitution: 0.5, contactMode: 'breed',
    umask: 0xffffffff, organism: false, ecology: true, cap: 100,
  });
  enrolDishBody(session, {
    key: 'b', sys: fakeB, radius: 16, restitution: 0.5, contactMode: 'breed',
    umask: 0xffffffff, organism: false, ecology: true, cap: 300,
  });
  const L = session.ecology;
  assert.ok(L, 'the first ecology enrolment creates the ledger');
  assert.strictEqual(L.globalCap, 400, 'the global cap is the sum of the dealt caps (100 + 300)');
  assert.strictEqual(L.total, 7, 'the total is the sum of the living counts (2 + 5)');
  const recA = L.entries.get(session._bySys.get(fakeA));
  const recB = L.entries.get(session._bySys.get(fakeB));
  assert.strictEqual(recA.share, 100, 'a stratum’s share is its dealt cap, re-read as a portion of the pool');
  assert.strictEqual(recA.alive, 2, 'enrolment refreshed the living count from the alive column');

  // The gate, pool side (empty field: the density side reads sparse).
  const ecoA = dishEcologyFor(session, fakeA);
  assert.ok(ecoA.on, 'a member resolves on');
  assert.strictEqual(ecologyBreedAllowed(ecoA, 10, 10), true, 'room in the pool and in share: breed allowed');
  recB.alive = 300; L.total = 302; // B swells to its share on paper
  assert.strictEqual(ecologyBreedAllowed(ecoA, 10, 10), true,
    'A under its share with pool room: still allowed');
  recA.alive = 100; L.total = 400; // both at share: the pool is exactly full
  assert.strictEqual(ecologyBreedAllowed(ecoA, 10, 10), false, 'a full pool refuses everyone, shares or not');
  L.total = 350; recB.alive = 250; // B under its share by 50; A at its share
  assert.strictEqual(ecologyBreedAllowed(ecoA, 10, 10), true,
    'a stratum at its share breeds on another’s unused share — a share is not a ceiling');
  recA.alive = 150; recB.alive = 300; L.total = 450; // over-full on paper (dealt rosters can exceed caps)
  assert.strictEqual(ecologyBreedAllowed(ecoA, 10, 10), false, 'an over-full pool refuses until deaths make room');

  // The gate, density side: a saturated cell at the parents' midpoint
  // suppresses even with pool room.
  L.total = 7; recA.alive = 2; recB.alive = 5;
  session.density = buildDishDensity({ cellStart: new Int32Array([0, 8, 8]), cols: 2, rows: 1, cellSize: 100, minCx: 0, minCy: 0 });
  const ecoA2 = dishEcologyFor(session, fakeA);
  assert.strictEqual(ecologyBreedAllowed(ecoA2, 50, 50), false, 'a saturated cell (share 1) suppresses breed');
  assert.strictEqual(ecologyBreedAllowed(ecoA2, 150, 50), true, 'the empty neighbouring cell allows it');
  session.density = null;

  // Membership follows the dealt mode; release leaves the pool.
  enrolDishBody(session, {
    key: 'a', sys: fakeA, radius: 16, restitution: 0.5, contactMode: 'breed',
    umask: 0xffffffff, organism: false, ecology: false, cap: 100,
  });
  assert.ok(!L.entries.has(session._bySys.get(fakeA)), 'an ecology-off enrolment leaves the ledger');
  assert.strictEqual(L.globalCap, 300, 'and its cap leaves the pool with it');
  releaseDishBody(session, fakeB);
  assert.strictEqual(L.entries.size, 0, 'a released stratum leaves the ledger');
  assert.strictEqual(L.globalCap, 0, 'the pool empties with its last member');
}

// (b) — the resolutions, and the param itself.
{
  assert.strictEqual(DEFAULT_LAYOUT_PARAMS.ecology, false, 'the mode defaults OFF (spec open question 3: a performance decision, not a default behaviour)');
  assert.strictEqual(normalizeLayoutParams({ ecology: 'yes' }).ecology, true, 'the param normalizes as a bool');
  assert.strictEqual(normalizeLayoutParams({}).ecology, false, 'an absent param is the explicit false');
  assert.strictEqual(normalizeLayoutParams({}).dish, true, 'the neighbour switch is untouched (dish still defaults ON)');

  const sys = { n: 0, _step: 0, alive: new Uint8Array(0) };
  assert.strictEqual(dishEcologyFor(null, sys), null, 'no session: ecology does not apply');
  const session = createDishSession();
  assert.strictEqual(dishEcologyFor(session, sys), null, 'a system outside the dish does not resolve');
  enrolDishBody(session, {
    key: 'ghost', sys, radius: 0, restitution: 0.5, contactMode: 'breed',
    umask: 0xffffffff, organism: false, ecology: true, cap: 50,
  });
  assert.strictEqual(dishEcologyFor(session, sys), null,
    'an enrolment at radius 0 (DISH off / no contacts) is not in the dish — ecology does not touch it');
  const inDish = { n: 0, _step: 0, alive: new Uint8Array(0) };
  enrolDishBody(session, {
    key: 'plain', sys: inDish, radius: 16, restitution: 0.5, contactMode: 'breed',
    umask: 0xffffffff, organism: false, ecology: false, cap: 50,
  });
  assert.deepStrictEqual(dishEcologyFor(session, inDish), { on: false },
    'enrolled with the mode off: governed — populations exactly as dealt');
  const member = { n: 0, _step: 0, alive: new Uint8Array(0) };
  enrolDishBody(session, {
    key: 'eco', sys: member, radius: 16, restitution: 0.5, contactMode: 'breed',
    umask: 0xffffffff, organism: false, ecology: true, cap: 50,
  });
  const res = dishEcologyFor(session, member);
  assert.ok(res.on && res.ledger === session.ecology && res.record && res.field === null,
    'a member resolves on, carrying the ledger and the (not yet stamped) field');
}

// (c) — the pressure law's units, on a hand-built system and field.
{
  // Two cells: cell 0 saturated (8 bodies, share 1), cell 1 holding 6
  // (share 0.75). Bodies 0,1 sit in cell 0; body 2 in cell 1; body 3
  // outside the grid entirely (share 0).
  const field = buildDishDensity({ cellStart: new Int32Array([0, 8, 14]), cols: 2, rows: 1, cellSize: 100, minCx: 0, minCy: 0 });
  const mkFake = (exposure) => ({
    n: 4, alive: new Uint8Array([1, 1, 1, 1]),
    x: new Float64Array([50, 50, 150, 500]), y: new Float64Array([50, 50, 50, 500]),
    ecoCrowd: Float64Array.from(exposure), _dead: [],
  });
  const mkEco = (sys) => ({
    on: true, field,
    ledger: { entries: new Map(), globalCap: 99, total: alive(sys) },
    entry: null, record: { cap: 99, share: 99, alive: alive(sys) },
  });

  const sys = mkFake([10, 0, 4, 1]);
  const eco = mkEco(sys);
  const deaths = stepDishEcology(sys, eco);
  assert.strictEqual(deaths, 0, 'nobody is ripe yet');
  assert.strictEqual(sys.ecoCrowd[0], 11, 'a saturated cell accrues a full unit per step ((1 − 0.5) / (1 − 0.5))');
  assert.strictEqual(sys.ecoCrowd[1], 1, 'the second body in the cell accrues the same');
  assert.strictEqual(sys.ecoCrowd[2], 4.5, 'share 0.75 accrues half a unit ((0.75 − 0.5) / (1 − 0.5))');
  assert.strictEqual(sys.ecoCrowd[3], 0.5, 'outside the crowd, relief sheds ECOLOGY_RELIEF per step');
  assert.strictEqual(stepDishEcology(sys, eco), 0);
  assert.strictEqual(sys.ecoCrowd[3], 0, 'relief floors at exactly zero');

  // Ripeness: the ripest dies — one per step, ledger noted, exposure reset.
  const ripe = mkFake([ECOLOGY_DIE_EXPOSURE - 0.25, ECOLOGY_DIE_EXPOSURE + 40, 0, 0]);
  const ripeEco = mkEco(ripe);
  const d1 = stepDishEcology(ripe, ripeEco);
  assert.strictEqual(d1, ECOLOGY_DIE_PER_STEP, 'one death per system-step, by construction of the budget');
  assert.strictEqual(ripe.alive[1], 0, 'the ripest body died (highest exposure, not lowest index)');
  assert.strictEqual(ripe.alive[0], 1, 'the merely-ripe body survives the step (it crossed during accrual, the budget was spent)');
  assert.deepStrictEqual(ripe._dead, [1], 'the death took the ordinary path: index on the freelist');
  assert.strictEqual(ripe.ecoCrowd[1], 0, 'the dead slot’s exposure is reset');
  assert.strictEqual(ripeEco.record.alive, 3, 'the ledger noted the death');
  assert.strictEqual(ripeEco.ledger.total, 3, 'and the pool total with it');

  // Stillness: under reduced-motion the step holds entirely.
  const still = mkFake([ECOLOGY_DIE_EXPOSURE + 100, 5, 5, 5]);
  const stillEco = mkEco(still);
  assert.strictEqual(stepDishEcology(still, stillEco, { reducedMotion: true }), 0, 'no deaths under reduced-motion');
  assert.strictEqual(still.ecoCrowd[0], ECOLOGY_DIE_EXPOSURE + 100, 'and no accrual either — pressure does not build in the dark');
  assert.strictEqual(alive(still), 4, 'the cast is untouched');

  // A newborn inherits no exposure: force a recycle through _breed
  // with the dead slot pre-loaded with a ripe exposure.
  const host = new ParticleSystem();
  host.init(4, 1000, 700, assets, palette, SEED);
  host.alive[2] = 0;
  host._dead.push(2);
  host.ecoCrowd[2] = ECOLOGY_DIE_EXPOSURE + 500;
  const cs = host._breed(0, 1, SEED, 10, 0.4, 1.6, 40, 100);
  assert.strictEqual(cs, 2, 'the child recycled the dead slot');
  assert.strictEqual(host.ecoCrowd[2], 0, 'the child starts unexposed — a dead body’s pressure is not inherited');
}

// Cast helpers for (d)–(g): strata in one session, stepped in stratum
// order at locked dt — the live protocol, driven by hand (the bake
// driver covers the other protocol in (h)).
const baseLp = {
  mode: 'swarm', behave: 'cruise', contactRadius: 16, contactRestitution: 0.5,
  windMode: 'curl', wind: 1, swarmCohesion: 0, gravityWells: 0,
  kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
};
const dishCast = (strata, steps, onStep) => {
  const session = createDishSession();
  const units = strata.map((st) => {
    const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...st.lp });
    const sys = new ParticleSystem();
    sys.init(st.count, 1000, 700, assets, palette, st.seed);
    if (st.place) st.place(sys);
    enrolDishBody(session, {
      key: st.key, sys, radius: dishEnrolRadius(lp), restitution: lp.contactRestitution ?? 0.5,
      contactMode: lp.contactMode, umask: 0xffffffff, organism: false,
      wetness: lp.accumulationWetness, accum: !!lp.accumulation,
      ecology: !!lp.ecology, cap: st.cap,
    });
    return { ...st, sys, lp, params: { ...lp, dishSession: session, particleCount: st.count, maxParticles: st.cap } };
  });
  const keys = units.map((u) => u.key);
  for (let s = 0; s < steps; s++) {
    armDish(session, keys);
    for (const u of units) {
      u.sys.update(u.params, assets, palette, u.seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    }
    if (onStep) onStep(s, units, session);
  }
  return { units, session };
};
const gridPlace = (cx, cy, cols, spacing) => (sys) => {
  const pts = [];
  for (let i = 0; i < sys.n; i++) pts.push({ i, x: cx + (i % cols) * spacing, y: cy + Math.floor(i / cols) * spacing });
  sys.adoptPositions(pts);
};

// (d) — the mode off, exactly (the issue's third acceptance line).
{
  const deal = (modeA, modeB, ecoKey) => dishCast([
    { key: 'a', seed: SEED, count: 8, cap: 60, place: gridPlace(700, 60, 4, 34),
      lp: { ...baseLp, contactMode: modeA, swarmCohesion: 0.8, contactRepel: 1, ...(ecoKey ? { ecology: false } : {}) } },
    { key: 'b', seed: SEED + 7, count: 12, cap: 60, place: gridPlace(180, 160, 4, 8),
      lp: { ...baseLp, contactMode: modeB, scale: [0.3, 0.3], wind: 0, ...(ecoKey ? { ecology: false } : {}) } },
  ], 600, (s, us) => {
    assert.strictEqual(alive(us[0].sys), 8, `step ${s}: ecology off — the breed stratum’s count is the dealt roster`);
    assert.strictEqual(alive(us[1].sys), 12, `step ${s}: ecology off — the die stratum’s count is the dealt roster`);
  });
  const off = deal('breed', 'die', true);
  assert.strictEqual(off.session.ecology, undefined, 'ecology-off enrolments never create a ledger');
  const absent = deal('breed', 'die', false);
  const flat = (units) => units.map((u) => [
    ...Array.from(u.sys.x), ...Array.from(u.sys.y),
    ...Array.from(u.sys.vx), ...Array.from(u.sys.vy),
  ]);
  assert.deepStrictEqual(flat(absent.units), flat(off.units), 'an absent ecology param is the explicit false, bit for bit');
  const none = deal('none', 'none', true);
  assert.deepStrictEqual(flat(none.units), flat(off.units),
    'breed/die dealt with the mode off is bit-identical to mode none dealt: suppressed events move nothing');
}

// (e) — the cap (the issue's first acceptance line).
{
  let maxTotal = 0;
  let maxB = 0;
  const { units, session } = dishCast([
    { key: 'a', seed: SEED, count: 20, cap: 50,
      lp: { ...baseLp, contactMode: 'breed', ecology: true, swarmCohesion: 0.8, contactRepel: 1 } },
    { key: 'b', seed: SEED + 7, count: 10, cap: 10, place: gridPlace(720, 60, 5, 34),
      lp: { ...baseLp, contactMode: 'breed', ecology: true, swarmCohesion: 0.8, contactRepel: 1 } },
  ], 1200, (s, us, ses) => {
    const t = alive(us[0].sys) + alive(us[1].sys);
    assert.ok(t <= 60, `step ${s}: the living total ${t} never exceeds the global cap 60`);
    assert.strictEqual(ses.ecology.total, t, `step ${s}: the ledger’s total is the alive columns’ total`);
    if (t > maxTotal) maxTotal = t;
    const b = alive(us[1].sys);
    if (b > maxB) maxB = b;
  });
  assert.strictEqual(maxTotal, 60, 'breed-heavy settings fill the pool exactly to the cap and stop');
  assert.ok(maxB > 20, `the small-cap stratum bred far past its own cap of 10 on borrowed share (reached ${maxB})`);
  assert.strictEqual(countEcologyAlive(units[0].sys), session.ecology.entries.get(session._bySys.get(units[0].sys)).alive,
    'the books still match the bodies at the end of the run');
}

// (f) — thinning (the issue's second acceptance line, first half).
// One hero body (contactRadius 60, scale 1.6) sizes the shared grid's
// cells at 192px; a colony of small bodies packed under those cells
// reads saturated and thins under pressure alone.
const heroStratum = {
  key: 'hero', seed: SEED + 7, count: 1, cap: 60, place: gridPlace(880, 600, 1, 1),
  lp: { ...baseLp, contactRadius: 60, contactMode: 'none', scale: [1.6, 1.6] },
};
const thinFixture = () => dishCast([
  { key: 'crowd', seed: SEED, count: 36, cap: 200, place: gridPlace(170, 150, 6, 11),
    lp: { ...baseLp, contactMode: 'none', ecology: true, scale: [0.3, 0.3], wind: 0 } },
  heroStratum,
], 1500);
{
  const counts = [];
  const { units } = (() => {
    const r = dishCast([
      { key: 'crowd', seed: SEED, count: 36, cap: 200, place: gridPlace(170, 150, 6, 11),
        lp: { ...baseLp, contactMode: 'none', ecology: true, scale: [0.3, 0.3], wind: 0 } },
      heroStratum,
    ], 1500, (s, us) => { if (s % 100 === 0) counts.push(alive(us[0].sys)); });
    return r;
  })();
  const finalAlive = alive(units[0].sys);
  assert.ok(counts.some((c) => c < 36), 'the crowded colony thins under pressure alone (mode none: no contact deaths were dealt)');
  assert.ok(finalAlive < 36 && finalAlive >= 20, `it thins without cratering: 36 → ${finalAlive}`);
  const again = thinFixture();
  assert.strictEqual(alive(again.units[0].sys), finalAlive, 'the thinning run is reproducible, same seed');
  assert.deepStrictEqual(Array.from(again.units[0].sys.x), Array.from(units[0].sys.x),
    'and bit-identical in position (bake = live arithmetic)');
}

// (g) — growth into free space, and the density gate.
{
  const sparse = dishCast([
    { key: 'colony', seed: SEED, count: 8, cap: 60, place: gridPlace(700, 60, 4, 34),
      lp: { ...baseLp, contactMode: 'breed', ecology: true, swarmCohesion: 0.8, contactRepel: 1 } },
    { key: 'plain', seed: SEED + 7, count: 4, cap: 60, lp: { ...baseLp, contactMode: 'none' } },
  ], 600);
  assert.ok(alive(sparse.units[0].sys) >= 40,
    `an isolated colony in free space multiplies: 8 → ${alive(sparse.units[0].sys)} (pool 60)`);

  let packedMax = 0;
  const packed = dishCast([
    { key: 'colony', seed: SEED, count: 12, cap: 120, place: gridPlace(180, 160, 4, 11),
      lp: { ...baseLp, contactMode: 'breed', ecology: true, scale: [0.3, 0.3], wind: 0 } },
    heroStratum,
  ], 600, (s, us) => { packedMax = Math.max(packedMax, alive(us[0].sys)); });
  assert.strictEqual(packedMax, 12, 'packed under the hero’s cells, the same colony does not grow at all — the gate suppresses every birth');

  const noHero = dishCast([
    { key: 'colony', seed: SEED, count: 12, cap: 120, place: gridPlace(180, 160, 4, 11),
      lp: { ...baseLp, contactMode: 'breed', ecology: true, scale: [0.3, 0.3], wind: 0 } },
    { key: 'plain', seed: SEED + 7, count: 4, cap: 60, lp: { ...baseLp, contactMode: 'none' } },
  ], 600);
  assert.ok(alive(noHero.units[0].sys) > 12,
    `without the hero (small cells, sparse shares) the identical colony grows: 12 → ${alive(noHero.units[0].sys)} — the gate is the mover, not the mode`);
}

// (h) — bake parity.
{
  const lpFor = (eco) => normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 24,
    contactRadius: 16, contactRestitution: 0.7, contactMode: 'breed',
    contactRepel: 1, swarmCohesion: 0.8, ecology: eco,
  });
  const bake = (eco) => bakeDishParticles({
    layers: [
      { key: 'a', seed: SEED, count: 24, layoutParams: lpFor(eco), activeAssets: assets, palette, maxParticles: 30 },
      { key: 'b', seed: SEED + 7, count: 24, layoutParams: lpFor(eco), activeAssets: assets, palette, maxParticles: 30 },
    ],
    canvasW: 1000, canvasH: 700, steps: 120,
  });
  const flat = (m) => JSON.stringify([...m.entries()].map(([k, items]) => [k, items.map((it) => [it.x, it.y])]));
  const count = (m) => [...m.values()].reduce((n, items) => n + items.length, 0);
  const on1 = bake(true);
  const on2 = bake(true);
  assert.strictEqual(flat(on1), flat(on2), 'the ecology bake is a pure function of its inputs');
  assert.ok(count(on1) <= 60, `the bake respects the pool: ${count(on1)} ≤ 60`);
  const off = bake(false);
  assert.strictEqual(count(off), 48, 'the mode-off bake’s populations are the dealt roster (24 + 24)');
  assert.notStrictEqual(flat(on1), flat(off), 'the mode-on bake is not the mode-off bake (the identity is not vacuous)');
}

// (i) — wiring pins.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const contacts = readFileSync(new URL('./dishContacts.mjs', import.meta.url), 'utf8');
  const resolver = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  const bakeSrc = readFileSync(new URL('./kernel/bake/dishBake.mjs', import.meta.url), 'utf8');
  const law = readFileSync(new URL('./dishEcology.mjs', import.meta.url), 'utf8');
  assert.ok(particles.includes('dishEcologyFor(dishSession, this)'), 'update() resolves the ecology from the session');
  assert.ok(particles.includes('ecologyBreedAllowed(eco,'), 'the contact pass consults the breed gate');
  assert.ok(particles.includes('stepDishEcology(this, ecology'), 'update() runs the pressure step');
  assert.ok(!particles.includes('ECOLOGY_DIE_EXPOSURE') && !particles.includes('ECOLOGY_RELIEF'),
    'no exposure arithmetic leaks into the integrator');
  assert.ok(contacts.includes('ensureEcologyEntry(session, e)'), 'enrolment keeps the ledger');
  assert.ok(resolver.includes('ecology: !!ctx.layoutParams.ecology'), 'the resolver enrols the ecology mode');
  assert.ok(resolver.includes('cap: ctx.caps?.maxParticles'), 'the resolver enrols the governor’s cap');
  assert.ok(bakeSrc.includes('ecology: !!layer.layoutParams.ecology'), 'the bake driver enrols the ecology mode');
  assert.ok(bakeSrc.includes('cap: layer.maxParticles ?? layer.count'), 'the bake driver enrols the same threaded cap');
  assert.ok(!/Math\.random|Date\.now/.test(law), 'the ecology law is deterministic by construction');
}

console.log('dishEcology.selfcheck: OK (#1416 — ledger units + shares, resolutions, pressure closed form + stillness hold, mode-off roster identity, global-cap acceptance probe, thinning acceptance probe, breed gate pair, bake parity, wiring)');
