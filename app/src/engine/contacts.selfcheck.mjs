// node src/engine/contacts.selfcheck.mjs
//
// Organism contacts (#167) — radius, repel, bounce, swap, breed: one integrator.
//
// Pins the contact pass's behaviours: bounce conserves momentum (and energy
// at restitution 1), swap exchanges assetIx, breed respects the quality cap
// and recycles dead slots, die recycles the index, repel only pushes
// same-layer neighbours apart, collideMask gates which layers interact, and
// the whole thing is deterministic per seed. Also pins the issue's rules:
// the golden placement path ignores contact offsets (live-only), and with
// contacts off the swarm is untouched (see particles.selfcheck.mjs for the
// behaviour lock against the pre-SoA reference).

import assert from 'node:assert';
import { ParticleSystem } from './particles.js';
import { buildPlacements } from './buildPlacements.js';
import { bakeParticles, BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts, dishEnrolRadius } from './dishContacts.mjs';
import { bakeDishParticles } from './kernel/bake/dishBake.mjs';
import {
  DEFAULT_LAYOUT_PARAMS,
  normalizeLayoutParams,
  validateLayoutParams,
} from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;

const CTX_BASE = {
  radius: 20,
  restitution: 1,
  repel: 0,
  mode: 'bounce',
  umask: 0xffffffff,
  breedCap: 10,
  seed: SEED,
  organism: false,
  minScale: 0.4,
  maxScale: 1.6,
  minAlpha: 40,
  maxAlpha: 100,
};

/** Two particles head-on: i at (400,350) moving +x, j at (430,350) moving -x.
 *  #1408 — scale pinned to 1: these scenarios pin the uniform-disc physics,
 *  so the fixture declares its bodies' sizes just as it declares mass. */
function headOnPair() {
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400; sys.y[0] = 350;
  sys.x[1] = 430; sys.y[1] = 350;
  sys.vx[0] = 2; sys.vy[0] = 0;
  sys.vx[1] = -2; sys.vy[1] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1;
  sys.scale[0] = 1; sys.scale[1] = 1;
  return sys;
}

// 1 — elastic bounce (restitution 1): velocities exchange exactly, momentum
// and kinetic energy are conserved bit-for-bit on these clean numbers.
{
  const sys = headOnPair();
  const px0 = sys.vx[0] * sys.mass[0] + sys.vx[1] * sys.mass[1];
  const ke0 = 0.5 * sys.mass[0] * sys.vx[0] ** 2 + 0.5 * sys.mass[1] * sys.vx[1] ** 2;
  sys._contactPass({ ...CTX_BASE, mode: 'bounce', restitution: 1 });
  assert.ok(Object.is(sys.vx[0], -2), `elastic: vx[0] ${sys.vx[0]}`);
  assert.ok(Object.is(sys.vx[1], 2), `elastic: vx[1] ${sys.vx[1]}`);
  const px1 = sys.vx[0] * sys.mass[0] + sys.vx[1] * sys.mass[1];
  const ke1 = 0.5 * sys.mass[0] * sys.vx[0] ** 2 + 0.5 * sys.mass[1] * sys.vx[1] ** 2;
  assert.ok(Object.is(px0, px1), 'elastic bounce conserves momentum');
  assert.ok(Object.is(ke0, ke1), 'elastic bounce conserves kinetic energy');
  // Depenetration: discs now exactly 2r apart.
  const dist = Math.hypot(sys.x[1] - sys.x[0], sys.y[1] - sys.y[0]);
  assert.ok(Object.is(dist, 40), `depenetrated to 2r, got ${dist}`);
}

// 2 — bounce with restitution 0 kills the approaching normal velocity.
{
  const sys = headOnPair();
  sys._contactPass({ ...CTX_BASE, mode: 'bounce', restitution: 0 });
  assert.ok(Object.is(sys.vx[0], 0), `inelastic: vx[0] ${sys.vx[0]}`);
  assert.ok(Object.is(sys.vx[1], 0), `inelastic: vx[1] ${sys.vx[1]}`);
}

// 3 — stick is perfectly inelastic: same velocity outcome as restitution 0.
{
  const sys = headOnPair();
  sys._contactPass({ ...CTX_BASE, mode: 'stick' });
  assert.ok(Object.is(sys.vx[0], 0), `stick: vx[0] ${sys.vx[0]}`);
  assert.ok(Object.is(sys.vx[1], 0), `stick: vx[1] ${sys.vx[1]}`);
}

// 4 — unequal masses: momentum conserved, lighter particle leaves faster.
{
  const sys = headOnPair();
  sys.mass[0] = 0.5; sys.mass[1] = 1.5;
  const px0 = sys.vx[0] * sys.mass[0] + sys.vx[1] * sys.mass[1];
  sys._contactPass({ ...CTX_BASE, mode: 'bounce', restitution: 1 });
  const px1 = sys.vx[0] * sys.mass[0] + sys.vx[1] * sys.mass[1];
  assert.ok(Math.abs(px0 - px1) < 1e-12, `mass-weighted bounce conserves momentum (${px0} vs ${px1})`);
  // Elastic collision, m1=0.5 vs m2=1.5 at ±2: v1' = -4, v2' = 0 exactly.
  assert.ok(Object.is(sys.vx[0], -4), `light particle rebounds harder: vx[0] ${sys.vx[0]}`);
  assert.ok(Object.is(sys.vx[1], 0), `heavy particle stops dead: vx[1] ${sys.vx[1]}`);
}

// 5 — swap exchanges assetIx (and leaves the collide layer alone).
{
  const sys = headOnPair();
  assert.strictEqual(sys.assetIndex[0], 0);
  assert.strictEqual(sys.assetIndex[1], 1);
  const g0 = sys.cgroup[0]; const g1 = sys.cgroup[1];
  sys._contactPass({ ...CTX_BASE, mode: 'swap' });
  assert.strictEqual(sys.assetIndex[0], 1, 'swap exchanges assetIx');
  assert.strictEqual(sys.assetIndex[1], 0, 'swap exchanges assetIx');
  assert.strictEqual(sys.cgroup[0], g0, 'swap does not move the collide layer');
  assert.strictEqual(sys.cgroup[1], g1, 'swap does not move the collide layer');
  // Swap carries no velocity response.
  assert.ok(Object.is(sys.vx[0], 2) && Object.is(sys.vx[1], -2), 'swap leaves velocities alone');
}

// 6 — die marks the higher-index particle dead and recycles its index.
{
  const sys = headOnPair();
  sys._contactPass({ ...CTX_BASE, mode: 'die' });
  assert.strictEqual(sys.alive[0], 1, 'the lower index survives');
  assert.strictEqual(sys.alive[1], 0, 'the higher index dies');
  assert.deepStrictEqual([...sys._dead], [1], 'dead index lands on the freelist');
  assert.strictEqual(sys.getItems(assets).length, 1, 'dead particles render nothing');
}

// 7 — breed recycles a dead slot before growing the population.
{
  const sys = new ParticleSystem();
  sys.init(3, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400; sys.y[0] = 350; sys.vx[0] = 2; sys.vy[0] = 0;
  sys.x[1] = 430; sys.y[1] = 350; sys.vx[1] = -2; sys.vy[1] = 0;
  sys.x[2] = 700; sys.y[2] = 350; sys.vx[2] = 0; sys.vy[2] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1; sys.mass[2] = 1;
  sys.scale[0] = 1; sys.scale[1] = 1; sys.scale[2] = 1; // #1408 — uniform discs
  sys._contactPass({ ...CTX_BASE, mode: 'die' });
  assert.deepStrictEqual([...sys._dead], [1]);
  // Bring particle 2 into contact with 0, approaching.
  sys.x[2] = 425; sys.vx[2] = -2;
  const nBefore = sys.n;
  sys._contactPass({ ...CTX_BASE, mode: 'breed', breedCap: 10 });
  assert.strictEqual(sys.n, nBefore, 'breed recycled the dead slot: no growth');
  assert.strictEqual(sys.alive[1], 1, 'the recycled slot is alive again');
  assert.deepStrictEqual([...sys._dead], [], 'freelist drained');
  // Child spawns at the parents' midpoint.
  const mx = (sys.x[0] + sys.x[2]) / 2;
  const my = (sys.y[0] + sys.y[2]) / 2;
  assert.ok(Object.is(sys.x[1], mx) && Object.is(sys.y[1], my), 'child at midpoint');
  assert.ok(sys.assetIndex[1] === sys.assetIndex[0] || sys.assetIndex[1] === sys.assetIndex[2],
    'child inherits a parent costume');
}

// 8 — breed respects the quality cap: no dead slots and n at cap → no child.
{
  const sys = headOnPair();
  const nBefore = sys.n;
  sys._contactPass({ ...CTX_BASE, mode: 'breed', breedCap: nBefore });
  assert.strictEqual(sys.n, nBefore, 'breed at cap does not grow the population');
  // Re-overlap (the first pass depenetrated them) and breed under the cap.
  sys.x[0] = 400; sys.x[1] = 430;
  sys.vx[0] = 2; sys.vx[1] = -2;
  sys._contactPass({ ...CTX_BASE, mode: 'breed', breedCap: nBefore + 1 });
  assert.strictEqual(sys.n, nBefore + 1, 'breed under cap grows by one');
  assert.strictEqual(sys.alive[nBefore], 1, 'the new row is alive');
  assert.ok(Number.isFinite(sys.x[nBefore]) && Number.isFinite(sys.vx[nBefore]),
    'the new row is fully initialised');
}

// 9 — collideMask: a pair whose groups are masked out does not interact.
{
  const sys = headOnPair();
  sys.cgroup[0] = 0;
  sys.cgroup[1] = 1;
  const x0 = sys.x[0]; const x1 = sys.x[1];
  // Only group 0 participates: group 1's bit is clear → no pair.
  sys._contactPass({ ...CTX_BASE, mode: 'bounce', umask: 0b01 });
  assert.ok(Object.is(sys.x[0], x0) && Object.is(sys.x[1], x1),
    'masked-out pair is untouched');
  assert.ok(Object.is(sys.vx[0], 2) && Object.is(sys.vx[1], -2),
    'masked-out pair keeps its velocities');
}

// 10 — repel pushes same-layer neighbours apart even when not approaching.
{
  const sys = headOnPair();
  sys.cgroup[0] = 5; sys.cgroup[1] = 5;
  // Same velocity → vn = 0: no bounce impulse, but repel still separates.
  sys.vx[0] = 1; sys.vx[1] = 1;
  sys._contactPass({ ...CTX_BASE, mode: 'none', repel: 2 });
  assert.ok(sys.vx[0] < 1 && sys.vx[1] > 1,
    `repel separates same-layer pair: vx ${sys.vx[0]}, ${sys.vx[1]}`);
}
{
  // Different layers: repel does not apply.
  const sys = headOnPair();
  sys.cgroup[0] = 5; sys.cgroup[1] = 6;
  sys.vx[0] = 1; sys.vx[1] = 1;
  sys._contactPass({ ...CTX_BASE, mode: 'none', repel: 2 });
  assert.ok(Object.is(sys.vx[0], 1) && Object.is(sys.vx[1], 1),
    'repel ignores cross-layer pairs');
}

// 11 — exactly coincident discs: deterministic, never NaN.
{
  const sys = headOnPair();
  sys.x[1] = sys.x[0]; sys.y[1] = sys.y[0];
  sys._contactPass({ ...CTX_BASE, mode: 'bounce', restitution: 1 });
  for (let i = 0; i < 2; i++) {
    for (const f of ['x', 'y', 'vx', 'vy']) {
      assert.ok(Number.isFinite(sys[f][i]), `coincident pair: ${f}[${i}] finite`);
    }
  }
  const dist = Math.hypot(sys.x[1] - sys.x[0], sys.y[1] - sys.y[0]);
  assert.ok(dist > 0, 'coincident pair is separated along the deterministic normal');
}

// 12 — full-update determinism: two identical systems, contacts on, 60 steps.
{
  const lp = (mode) => normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode, particleCount: 60,
    contactRadius: 12, contactRestitution: 0.7, contactRepel: 1,
    contactMode: mode,
  });
  for (const mode of ['bounce', 'swap', 'breed']) {
    const mk = () => {
      const s = new ParticleSystem();
      s.init(60, 1000, 700, assets, palette, SEED);
      return s;
    };
    const a = mk(); const b = mk();
    const la = { ...lp(mode), maxParticles: 120 };
    const lb = { ...lp(mode), maxParticles: 120 };
    for (let s = 0; s < 60; s++) {
      const t = 1_000_000 + s * (1000 / 60);
      a.update(la, assets, palette, SEED, t, null);
      b.update(lb, assets, palette, SEED, t, null);
    }
    assert.strictEqual(a.n, b.n, `${mode}: population identical after 60 steps`);
    for (const f of ['x', 'y', 'vx', 'vy', 'mass', 'rotation', 'alive']) {
      for (let i = 0; i < a.n; i++) {
        assert.ok(Object.is(a[f][i], b[f][i]),
          `${mode}: ${f}[${i}] deterministic (${a[f][i]} vs ${b[f][i]})`);
      }
    }
    for (let i = 0; i < a.n; i++) {
      assert.strictEqual(a.assetIndex[i], b.assetIndex[i], `${mode}: assetIndex[${i}]`);
      assert.strictEqual(a.cgroup[i], b.cgroup[i], `${mode}: cgroup[${i}]`);
    }
    // Breed actually bred under the cap during those 60 steps.
    if (mode === 'breed') assert.ok(a.n >= 60, 'breed grew the population under the cap');
  }
}

// 13 — studio video bakes contact state: the bake is a pure function of its
// inputs even with breed/die changing the population mid-bake.
{
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 40,
    contactRadius: 14, contactMode: 'breed', maxParticles: 80,
  });
  const opts = {
    seed: SEED, count: 40, layoutParams: lp, activeAssets: assets,
    palette, canvasW: 1000, canvasH: 700, steps: 90, maxParticles: 80,
  };
  const once = bakeParticles(opts);
  const twice = bakeParticles(opts);
  assert.strictEqual(once.length, twice.length, 'bake population is reproducible');
  assert.strictEqual(
    JSON.stringify(once.map((it) => [it.x, it.y, it.assetId, it.color])),
    JSON.stringify(twice.map((it) => [it.x, it.y, it.assetId, it.color])),
    'bake with contacts is a pure function of its inputs',
  );
}

// 14 — golden placement ignores contact offsets: buildPlacements (the static
// layout path the golden hash covers) is identical with contact params set.
{
  const baseLp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'grid', composition: 'default', count: 40,
    scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
  });
  const base = {
    layoutParams: baseLp,
    seed: SEED,
    activeAssets: assets,
    palette,
    caps: { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true },
    canvasW: 1000,
    canvasH: 700,
  };
  const plain = buildPlacements(base);
  const withContacts = buildPlacements({
    ...base,
    layoutParams: {
      ...base.layoutParams,
      contactRadius: 60, contactRestitution: 0.9, contactRepel: 3,
      contactMode: 'breed', collideMask: 0b101,
    },
  });
  assert.strictEqual(withContacts.safeCount, plain.safeCount);
  assert.strictEqual(withContacts.items.length, plain.items.length);
  assert.deepStrictEqual(withContacts.items, plain.items,
    'contact params must not leak into the static placement path');
}

// 15 — the layout params allow-list (#107) carries the contact properties.
{
  const lp = normalizeLayoutParams({
    contactRadius: 45, contactRestitution: 0.8, contactRepel: 2.5,
    contactMode: 'swap', collideMask: 0b101,
  });
  assert.strictEqual(lp.contactRadius, 45);
  assert.strictEqual(lp.contactRestitution, 0.8);
  assert.strictEqual(lp.contactRepel, 2.5);
  assert.strictEqual(lp.contactMode, 'swap');
  assert.strictEqual(lp.collideMask, 0b101);
  // Clamping, not silent acceptance.
  const clamped = normalizeLayoutParams({ contactRadius: 999, contactRestitution: -3 });
  assert.strictEqual(clamped.contactRadius, 120);
  assert.strictEqual(clamped.contactRestitution, 0);
  // Structural nonsense is rejected, not defaulted.
  const { rejected } = validateLayoutParams({
    contactRadius: 'wide', contactMode: 'explode', collideMask: NaN,
  });
  assert.ok(rejected.includes('contactRadius'), 'non-numeric radius rejected');
  assert.ok(rejected.includes('contactMode'), 'unknown mode rejected');
  assert.ok(rejected.includes('collideMask'), 'NaN mask rejected');
  // Unknown-to-the-enum falls back to none rather than leaking through.
  assert.strictEqual(normalizeLayoutParams({ contactMode: 'explode' }).contactMode, 'none');
}

// 16 — moth tick smoke: contacts run on the organism path, spine heads stay
// pinned, everything finite.
{
  const sys = new ParticleSystem();
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', particleCount: 24, body: 3,
    contactRadius: 10, contactMode: 'bounce', contactRestitution: 0.6,
    maxParticles: 60,
  });
  sys.init(24, 1000, 700, assets, palette, SEED);
  for (let s = 0; s < 20; s++) {
    sys.update(lp, assets, palette, SEED, 1_000_000 + s * (1000 / 60), null);
  }
  for (let i = 0; i < sys.n; i++) {
    assert.ok(Number.isFinite(sys.x[i]) && Number.isFinite(sys.y[i]),
      `moth ${i} finite after contact steps`);
    const sp = sys.spine[i];
    assert.ok(sp && sp.length > 0, `moth ${i} keeps its spine`);
    assert.ok(Object.is(sp[0].x, sys.x[i]) && Object.is(sp[0].y, sys.y[i]),
      `moth ${i} spine head pinned to contact-corrected head`);
  }
}

// 17 — petri dish A1 (#1407): one shared grid across strata. A PEARL body
// displaces an EAVES body; the pass is deterministic, equals the bake, and
// with fewer than two contact strata armed it does not exist at all.
{
  const dishPair = (modeA = 'bounce', modeB = 'bounce') => {
    const mk = (x, vx, mass) => {
      const s = new ParticleSystem();
      s.init(1, 1000, 700, assets, palette, SEED);
      s.x[0] = x; s.y[0] = 350; s.vx[0] = vx; s.vy[0] = 0; s.mass[0] = mass;
      s.scale[0] = 1; // #1408 — A1's pinned numbers are scale-1 physics
      return s;
    };
    const pearl = mk(400, 2, 1);
    const eaves = mk(430, -2, 3);
    const ses = createDishSession();
    enrolDishBody(ses, { key: 'pearl', sys: pearl, radius: 20, restitution: 1, contactMode: modeA, umask: 0xffffffff, organism: false });
    enrolDishBody(ses, { key: 'eaves', sys: eaves, radius: 20, restitution: 1, contactMode: modeB, umask: 0xffffffff, organism: false });
    return { pearl, eaves, ses };
  };

  // (a) closed form, cross-strata: overlap 10 splits by inverse mass
  // (1 : 1/3) — PEARL moves 7.5, EAVES 2.5; elastic velocities exchange by
  // the same mass weighting as the per-system pass (scenario 4's numbers).
  {
    const { pearl, eaves, ses } = dishPair();
    assert.strictEqual(armDish(ses, ['pearl', 'eaves']), true, 'two contact strata arm the dish');
    assert.strictEqual(runDishContacts(ses, pearl), true, 'the first enrolled caller runs the pass');
    assert.ok(Object.is(pearl.x[0], 392.5), `pearl displaced: ${pearl.x[0]}`);
    assert.ok(Object.is(eaves.x[0], 432.5), `eaves displaced: ${eaves.x[0]}`);
    assert.ok(Object.is(pearl.vx[0], -4), `light body rebounds harder across strata: ${pearl.vx[0]}`);
    assert.ok(Object.is(eaves.vx[0], 0), `heavy body stops dead across strata: ${eaves.vx[0]}`);
    assert.strictEqual(runDishContacts(ses, eaves), false, 'the arm is consumed: no second run in the step');
  }

  // (b) a heavy stratum is the static body: mass 40 barely moves.
  {
    const { pearl, eaves, ses } = dishPair();
    eaves.mass[0] = 40;
    armDish(ses, ['pearl', 'eaves']);
    runDishContacts(ses, pearl);
    assert.ok(Math.abs(eaves.x[0] - 430) < 0.25, `heavy stratum barely moves: ${eaves.x[0]}`);
    assert.ok(Math.abs(pearl.x[0] - 400) > 9.7, `light stratum takes the displacement: ${pearl.x[0]}`);
  }

  // (c) one stratum in mode 'none': depenetration still applies (bodies
  // occupy space), but there is no velocity response across the seam.
  {
    const { pearl, eaves, ses } = dishPair('none', 'bounce');
    armDish(ses, ['pearl', 'eaves']);
    runDishContacts(ses, pearl);
    assert.ok(Object.is(pearl.x[0], 392.5) && Object.is(eaves.x[0], 432.5), 'depenetration is mode-independent');
    assert.ok(Object.is(pearl.vx[0], 2) && Object.is(eaves.vx[0], -2), 'no impulse when either stratum opted out');
  }

  // (d) dish-off: fewer than two contact strata never arms — a lone
  // contact stratum beside a ghost stratum behaves exactly as #167 alone.
  {
    const { pearl, eaves, ses } = dishPair();
    const ses2 = createDishSession();
    enrolDishBody(ses2, { key: 'pearl', sys: pearl, radius: 20, restitution: 1, contactMode: 'bounce', umask: 0xffffffff, organism: false });
    enrolDishBody(ses2, { key: 'eaves', sys: eaves, radius: 0, restitution: 1, contactMode: 'bounce', umask: 0xffffffff, organism: false });
    assert.strictEqual(armDish(ses2, ['pearl', 'eaves']), false, 'one ghost stratum: the dish does not arm');
    assert.strictEqual(runDishContacts(ses2, pearl), false, 'unarmed session runs nothing');
    assert.ok(Object.is(pearl.x[0], 400) && Object.is(eaves.x[0], 430), 'overlapping strangers stay ghosts');
    void ses;
  }

  // (e) determinism + bake parity over 45 steps, and proof the dish acted.
  {
    const lpFor = (count, radius, e) => normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: count,
      contactRadius: radius, contactRestitution: e, contactMode: 'bounce',
    });
    const lpA = lpFor(40, 14, 0.7);
    const lpB = lpFor(35, 18, 0.4);
    const liveRun = (withDish) => {
      const ses = createDishSession();
      const mk = (lp, seed, key) => {
        const s = new ParticleSystem();
        s.init(lp.particleCount, 1000, 700, assets, palette, seed, null, { graze: lp.graze || 0 });
        enrolDishBody(ses, {
          key, sys: s, radius: lp.contactRadius, restitution: lp.contactRestitution,
          contactMode: lp.contactMode, umask: lp.collideMask, organism: false,
        });
        return { s, params: { ...lp, particleCount: lp.particleCount, maxParticles: 200, ...(withDish ? { dishSession: ses } : {}) }, seed };
      };
      const A = mk(lpA, SEED, 'pearl');
      const B = mk(lpB, SEED + 7, 'eaves');
      for (let s = 0; s < 45; s++) {
        if (withDish) armDish(ses, ['pearl', 'eaves']);
        const t = BAKE_TIME_ORIGIN + s * BAKE_DT_MS;
        A.s.update(A.params, assets, palette, A.seed, t, null);
        B.s.update(B.params, assets, palette, B.seed, t, null);
      }
      return { A: A.s, B: B.s };
    };
    const run1 = liveRun(true);
    const run2 = liveRun(true);
    for (const k of ['A', 'B']) {
      for (const f of ['x', 'y', 'vx', 'vy', 'mass']) {
        for (let i = 0; i < run1[k].n; i++) {
          assert.ok(Object.is(run1[k][f][i], run2[k][f][i]), `dish run deterministic: ${k}.${f}[${i}]`);
        }
      }
    }
    const baked = bakeDishParticles({
      layers: [
        { key: 'pearl', seed: SEED, count: 40, layoutParams: lpA, activeAssets: assets, palette, maxParticles: 200 },
        { key: 'eaves', seed: SEED + 7, count: 35, layoutParams: lpB, activeAssets: assets, palette, maxParticles: 200 },
      ],
      canvasW: 1000, canvasH: 700, steps: 45,
    });
    for (const [key, sys] of [['pearl', run1.A], ['eaves', run1.B]]) {
      const items = baked.get(key);
      const live = sys.getItems(assets);
      assert.strictEqual(items.length, live.length, `${key}: bake population equals live`);
      for (let i = 0; i < live.length; i++) {
        assert.ok(Object.is(items[i].x, live[i].x) && Object.is(items[i].y, live[i].y),
          `${key}[${i}]: bake equals live (${items[i].x} vs ${live[i].x})`);
      }
    }
    // The dish acted: the no-session run (today's ghost strata) diverges.
    const ghost = liveRun(false);
    let diverged = 0;
    for (const k of ['A', 'B']) {
      for (let i = 0; i < run1[k].n; i++) {
        if (!Object.is(run1[k].x[i], ghost[k].x[i]) || !Object.is(run1[k].y[i], ghost[k].y[i])) diverged++;
      }
    }
    assert.ok(diverged > 10, `cross-strata contacts moved bodies over 45 steps (${diverged} diverged)`);
  }

  // (f) the dish never reaches placements: buildPlacements output is
  // identical with a session riding in the params (scenario 14's law,
  // extended to the shared grid).
  {
    const baseLp = normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'grid', composition: 'default', count: 40,
      scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    });
    const base = {
      layoutParams: baseLp, seed: SEED, activeAssets: assets, palette,
      caps: { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true },
      canvasW: 1000, canvasH: 700,
    };
    const plain = buildPlacements(base);
    const withDish = buildPlacements({
      ...base,
      layoutParams: { ...base.layoutParams, contactRadius: 30, contactMode: 'bounce', dishSession: createDishSession() },
    });
    assert.deepStrictEqual(withDish.items, plain.items, 'dish state must not leak into the static placement path');
  }
}

// 18 — petri dish A2 (#1408), per-system: the disc is the mark's live
// size. Trim comes from the asset record; a body that grows into its
// neighbour starts displacing it at the new size, no knob change.
{
  const trimAssets = [{ id: 'a' }, { id: 'b', radiusTrim: 0.5 }];
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, trimAssets, palette, SEED);
  assert.strictEqual(sys.contactTrim[0], 1, 'trim defaults to 1 when the record omits it');
  assert.strictEqual(sys.contactTrim[1], 0.5, 'trim is read from the asset record at spawn');
  sys.x[0] = 400; sys.y[0] = 350;
  sys.x[1] = 430; sys.y[1] = 350;
  sys.vx[0] = 2; sys.vy[0] = 0;
  sys.vx[1] = -2; sys.vy[1] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1;
  sys.scale[0] = 1; sys.scale[1] = 1;
  // Discs 20 and 20*1*0.5 = 10: sum 30 == dist 30 → no contact at all.
  sys._contactPass({ ...CTX_BASE, mode: 'bounce', restitution: 1 });
  assert.ok(Object.is(sys.x[0], 400) && Object.is(sys.x[1], 430),
    'trimmed discs just clear: positions untouched');
  assert.ok(Object.is(sys.vx[0], 2) && Object.is(sys.vx[1], -2),
    'trimmed discs just clear: no impulse');
  // Grow body 1 threefold: disc 30, sum 50, overlap 20; equal masses
  // split it 10/10 and the elastic velocities exchange.
  sys.scale[1] = 3;
  sys._contactPass({ ...CTX_BASE, mode: 'bounce', restitution: 1 });
  assert.ok(Object.is(sys.x[0], 390), `growth displaces the neighbour: ${sys.x[0]}`);
  assert.ok(Object.is(sys.x[1], 440), `grown body is displaced in turn: ${sys.x[1]}`);
  assert.ok(Object.is(sys.vx[0], -2) && Object.is(sys.vx[1], 2),
    'the grown disc bounces like a body');
}

// 19 — petri dish A2 (#1408), cross-strata: scale 1 + trim 1 reproduces
// A1's pinned numbers exactly (the seeded A/B), and growth across the
// seam displaces at the new size.
{
  const dishPair = (modeA = 'bounce', modeB = 'bounce') => {
    const mk = (x, vx, mass) => {
      const s = new ParticleSystem();
      s.init(1, 1000, 700, assets, palette, SEED);
      s.x[0] = x; s.y[0] = 350; s.vx[0] = vx; s.vy[0] = 0; s.mass[0] = mass;
      s.scale[0] = 1;
      return s;
    };
    const pearl = mk(400, 2, 1);
    const eaves = mk(430, -2, 3);
    const ses = createDishSession();
    enrolDishBody(ses, { key: 'pearl', sys: pearl, radius: 20, restitution: 1, contactMode: modeA, umask: 0xffffffff, organism: false });
    enrolDishBody(ses, { key: 'eaves', sys: eaves, radius: 20, restitution: 1, contactMode: modeB, umask: 0xffffffff, organism: false });
    return { pearl, eaves, ses };
  };

  // (a) the A/B: identical fixtures to scenario 17(a) — identical results.
  {
    const { pearl, eaves, ses } = dishPair();
    armDish(ses, ['pearl', 'eaves']);
    runDishContacts(ses, pearl);
    assert.ok(Object.is(pearl.x[0], 392.5) && Object.is(eaves.x[0], 432.5),
      'scale 1 + trim 1 == A1 depenetration, exactly');
    assert.ok(Object.is(pearl.vx[0], -4) && Object.is(eaves.vx[0], 0),
      'scale 1 + trim 1 == A1 impulse, exactly');
  }

  // (b) growth across the seam: shrunken EAVES (disc 10, sum 30 == dist)
  // does not touch PEARL; grown EAVES (disc 40, sum 60, overlap 30)
  // displaces it — corr 22.5 split by inverse mass (1 : 1/3).
  {
    const { pearl, eaves, ses } = dishPair();
    eaves.scale[0] = 0.5;
    armDish(ses, ['pearl', 'eaves']);
    runDishContacts(ses, pearl);
    assert.ok(Object.is(pearl.x[0], 400) && Object.is(eaves.x[0], 430),
      'shrunken neighbour does not touch');
    assert.ok(Object.is(pearl.vx[0], 2) && Object.is(eaves.vx[0], -2),
      'shrunken neighbour exchanges nothing');
    eaves.scale[0] = 2;
    armDish(ses, ['pearl', 'eaves']);
    runDishContacts(ses, pearl);
    assert.ok(Object.is(pearl.x[0], 377.5), `growth displaces across strata: ${pearl.x[0]}`);
    assert.ok(Object.is(eaves.x[0], 437.5), `grown body yields by its mass share: ${eaves.x[0]}`);
    assert.ok(Object.is(pearl.vx[0], -4) && Object.is(eaves.vx[0], 0),
      'the grown pair bounces with the same mass weighting');
  }
}

// 20 — petri dish A3 (#1409): the per-Look DISH switch gates enrolment.
// OFF is the pre-dish engine byte-for-byte (the session rides in the
// params but can never arm), a mid-performance flip leaves no residue
// (the off-phase is the no-session engine from the same state), and
// flipping back re-arms the grid.
{
  const lpFor = (count, radius, e, dish) => normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: count,
    contactRadius: radius, contactRestitution: e, contactMode: 'bounce', dish,
  });
  const lpOnA = lpFor(40, 14, 0.7, true);
  const lpOnB = lpFor(35, 18, 0.4, true);

  // (a) the gate itself.
  assert.strictEqual(dishEnrolRadius({ contactRadius: 30, dish: false }), 0, 'OFF enrols 0 whatever the radius');
  assert.strictEqual(dishEnrolRadius({ contactRadius: 30, dish: true }), 30, 'ON enrols the radius');
  assert.strictEqual(dishEnrolRadius({ contactRadius: 30 }), 30, 'a pre-A3 document (no key) enrols: ON is the default');
  assert.strictEqual(dishEnrolRadius(null), 0, 'no params, no enrolment');
  assert.strictEqual(dishEnrolRadius(lpFor(10, 20, 0.5, false)), 0, 'a normalized OFF enrols 0');

  // Phase harness: 'on' enrols + arms, 'off' enrols through the gate
  // (radius 0, session riding but unarmed — the live A3 shape), 'drop'
  // never touches the session at all (the pre-A1 engine, the control).
  const runPhases = (phases) => {
    const ses = createDishSession();
    const mk = (lp, seed) => {
      const s = new ParticleSystem();
      s.init(lp.particleCount, 1000, 700, assets, palette, seed, null, { graze: lp.graze || 0 });
      return s;
    };
    const A = mk(lpOnA, SEED);
    const B = mk(lpOnB, SEED + 7);
    const armedPhases = [];
    let step = 0;
    for (const ph of phases) {
      let armed = false;
      for (let s = 0; s < ph.steps; s++) {
        const t = BAKE_TIME_ORIGIN + step * BAKE_DT_MS;
        step++;
        if (ph.mode === 'drop') {
          A.update({ ...lpOnA, particleCount: lpOnA.particleCount, maxParticles: 200 }, assets, palette, SEED, t, null);
          B.update({ ...lpOnB, particleCount: lpOnB.particleCount, maxParticles: 200 }, assets, palette, SEED + 7, t, null);
          continue;
        }
        const dish = ph.mode === 'on';
        const a = { ...lpOnA, dish };
        const b = { ...lpOnB, dish };
        enrolDishBody(ses, { key: 'pearl', sys: A, radius: dishEnrolRadius(a), restitution: a.contactRestitution, contactMode: a.contactMode, umask: a.collideMask, organism: false });
        enrolDishBody(ses, { key: 'eaves', sys: B, radius: dishEnrolRadius(b), restitution: b.contactRestitution, contactMode: b.contactMode, umask: b.collideMask, organism: false });
        if (armDish(ses, ['pearl', 'eaves'])) armed = true;
        A.update({ ...a, particleCount: a.particleCount, maxParticles: 200, dishSession: ses }, assets, palette, SEED, t, null);
        B.update({ ...b, particleCount: b.particleCount, maxParticles: 200, dishSession: ses }, assets, palette, SEED + 7, t, null);
      }
      armedPhases.push(armed);
    }
    return { A, B, armedPhases };
  };
  const assertSameSystems = (x, y, label) => {
    for (const [sx, sy] of [[x.A, y.A], [x.B, y.B]]) {
      for (const f of ['x', 'y', 'vx', 'vy']) {
        for (let i = 0; i < sx.n; i++) {
          assert.ok(Object.is(sx[f][i], sy[f][i]), `${label}: ${f}[${i}] ${sx[f][i]} vs ${sy[f][i]}`);
        }
      }
    }
  };
  const divergedCount = (x, y) => {
    let n = 0;
    for (const [sx, sy] of [[x.A, y.A], [x.B, y.B]]) {
      for (let i = 0; i < sx.n; i++) {
        if (!Object.is(sx.x[i], sy.x[i]) || !Object.is(sx.y[i], sy.y[i])) n++;
      }
    }
    return n;
  };

  // (b) OFF from step 0 is the pre-dish engine, byte-identical — and so
  // is a bake driven through the gated bake path.
  const off = runPhases([{ mode: 'off', steps: 45 }]);
  const drop = runPhases([{ mode: 'drop', steps: 45 }]);
  assert.deepEqual(off.armedPhases, [false], 'OFF never arms the session');
  assertSameSystems(off, drop, 'dish OFF == no dish session at all');
  {
    const bakedOff = bakeDishParticles({
      layers: [
        { key: 'pearl', seed: SEED, count: 40, layoutParams: lpFor(40, 14, 0.7, false), activeAssets: assets, palette, maxParticles: 200 },
        { key: 'eaves', seed: SEED + 7, count: 35, layoutParams: lpFor(35, 18, 0.4, false), activeAssets: assets, palette, maxParticles: 200 },
      ],
      canvasW: 1000, canvasH: 700, steps: 45,
    });
    for (const [key, sys] of [['pearl', drop.A], ['eaves', drop.B]]) {
      const items = bakedOff.get(key);
      const live = sys.getItems(assets);
      assert.strictEqual(items.length, live.length, `bake OFF ${key}: population equals the ghost run`);
      for (let i = 0; i < live.length; i++) {
        assert.ok(Object.is(items[i].x, live[i].x) && Object.is(items[i].y, live[i].y),
          `bake OFF ${key}[${i}]: the gated bake is the ghost stack (${items[i].x} vs ${live[i].x})`);
      }
    }
  }

  // (c) ON acts (the control for every OFF claim above).
  const on = runPhases([{ mode: 'on', steps: 45 }]);
  assert.deepEqual(on.armedPhases, [true], 'ON arms the session');
  assert.ok(divergedCount(on, drop) > 10, `ON displaces bodies across strata (${divergedCount(on, drop)} diverged)`);

  // (d) mid-performance flip: 20 steps ON, then OFF — the off-phase is
  // byte-identical to dropping the session at the flip from the same
  // state. No residue: the take after the flip is the per-system engine.
  const flipped = runPhases([{ mode: 'on', steps: 20 }, { mode: 'off', steps: 25 }]);
  const forked = runPhases([{ mode: 'on', steps: 20 }, { mode: 'drop', steps: 25 }]);
  assert.deepEqual(flipped.armedPhases, [true, false], 'the flip disarms from the flip step on');
  assertSameSystems(flipped, forked, 'post-flip == session dropped at the flip');

  // (e) flipping back re-arms and the dish acts again within the phase.
  const backOn = runPhases([{ mode: 'on', steps: 20 }, { mode: 'off', steps: 10 }, { mode: 'on', steps: 15 }]);
  const stayedOff = runPhases([{ mode: 'on', steps: 20 }, { mode: 'off', steps: 25 }]);
  assert.deepEqual(backOn.armedPhases, [true, false, true], 'the switch re-arms when flipped back');
  assert.ok(divergedCount(backOn, stayedOff) > 0, 'the re-armed dish displaces bodies again');
}

// 21 — petri dish B1 (#1410), cross-strata feed: the dish pass's impulse
// dents both bodies across the seam by the deform law (dishDeform.mjs).
// Same fixture as 19(a): masses 1 and 3, velocities ±2, e = 1, discs 20
// at dist 30 (overlap 10). jimp = (2·4)/(1+1/3) = 6: PEARL's Δv is 6
// (dent 6·0.06 = 0.36), EAVES' Δv is 2 (dent 0.12); pressure is
// (10/40)·0.5 = 0.125 for both. The dent is max(impact, pressure).
{
  const mk = (x, vx, mass) => {
    const s = new ParticleSystem();
    s.init(1, 1000, 700, assets, palette, SEED);
    s.x[0] = x; s.y[0] = 350; s.vx[0] = vx; s.vy[0] = 0; s.mass[0] = mass;
    s.scale[0] = 1;
    return s;
  };
  const pearl = mk(400, 2, 1);
  const eaves = mk(430, -2, 3);
  const ses = createDishSession();
  enrolDishBody(ses, { key: 'pearl', sys: pearl, radius: 20, restitution: 1, contactMode: 'bounce', umask: 0xffffffff, organism: false });
  enrolDishBody(ses, { key: 'eaves', sys: eaves, radius: 20, restitution: 1, contactMode: 'bounce', umask: 0xffffffff, organism: false });
  armDish(ses, ['pearl', 'eaves']);
  runDishContacts(ses, pearl);
  assert.ok(Math.abs(pearl.deformMem[0] - 0.36) < 1e-12, `dish feed: light body dented by its Δv (${pearl.deformMem[0]})`);
  assert.ok(Math.abs(eaves.deformMem[0] - 0.125) < 1e-12, `dish feed: pressure floors the heavy body's dent (${eaves.deformMem[0]})`);
  assert.ok(Object.is(pearl.deformMemX[0], 1) && Object.is(pearl.deformMemY[0], 0), 'dish feed: axis is the pair normal');
  assert.ok(Object.is(eaves.deformMemX[0], 1) && Object.is(eaves.deformMemY[0], 0), 'dish feed: both bodies share the line of centres');
}

// 22 + 23 — petri dish B1 (#1410): deform is a render attribute only.
// Through the full two-strata dish harness (scenario 20's shape):
//   22 — deform OFF is bit-identical to deform ON in every physics
//        column, over 45 steps of cross-strata collisions;
//   23 — reduced-motion renders rest at every step (no dent, no
//        wobble) while the physics stays bit-identical to the moving
//        run — the stillness law restrains the render, never the world.
{
  const lpFor = (count, radius, e) => normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: count,
    contactRadius: radius, contactRestitution: e, contactMode: 'bounce', dish: true,
  });
  const lpA = lpFor(40, 14, 0.7);
  const lpB = lpFor(35, 18, 0.4);
  const runDish = (extra = {}) => {
    const ses = createDishSession();
    const mk = (lp, seed) => {
      const s = new ParticleSystem();
      s.init(lp.particleCount, 1000, 700, assets, palette, seed, null, { graze: lp.graze || 0 });
      // Frame 0: the dish pass runs inside A's update, before B's first
      // update has set its switch — pre-set both so the off run is off
      // from the very first pair (production systems persist across
      // frames, so only this cold start needs it).
      s._deformOn = extra.deform !== false;
      return s;
    };
    const A = mk(lpA, SEED);
    const B = mk(lpB, SEED + 7);
    let maxAmt = 0;
    let restEveryStep = true;
    for (let step = 0; step < 45; step++) {
      const t = BAKE_TIME_ORIGIN + step * BAKE_DT_MS;
      enrolDishBody(ses, { key: 'pearl', sys: A, radius: dishEnrolRadius(lpA), restitution: lpA.contactRestitution, contactMode: lpA.contactMode, umask: lpA.collideMask, organism: false });
      enrolDishBody(ses, { key: 'eaves', sys: B, radius: dishEnrolRadius(lpB), restitution: lpB.contactRestitution, contactMode: lpB.contactMode, umask: lpB.collideMask, organism: false });
      armDish(ses, ['pearl', 'eaves']);
      A.update({ ...lpA, maxParticles: 200, dishSession: ses, ...extra }, assets, palette, SEED, t, null);
      B.update({ ...lpB, maxParticles: 200, dishSession: ses, ...extra }, assets, palette, SEED + 7, t, null);
      for (const s of [A, B]) {
        for (let i = 0; i < s.n; i++) {
          if (s.deformAmt[i] > maxAmt) maxAmt = s.deformAmt[i];
          if (!Object.is(s.deformAmt[i], 0)) restEveryStep = false;
        }
      }
    }
    return { A, B, maxAmt, restEveryStep };
  };
  const sameDishPhysics = (x, y, label) => {
    for (const [sx, sy] of [[x.A, y.A], [x.B, y.B]]) {
      for (const f of ['x', 'y', 'vx', 'vy']) {
        for (let i = 0; i < sx.n; i++) {
          assert.ok(Object.is(sx[f][i], sy[f][i]), `${label}: ${f}[${i}] ${sx[f][i]} vs ${sy[f][i]}`);
        }
      }
    }
  };

  const on = runDish();
  assert.ok(on.maxAmt > 0, 'the dish run actually dented bodies across strata');

  const off = runDish({ deform: false });
  assert.ok(off.restEveryStep, 'deform off: no body ever renders a dent');
  sameDishPhysics(on, off, 'deform on == deform off across the dish');

  const rm = runDish({ reducedMotion: true });
  assert.ok(rm.restEveryStep, 'reduced-motion: rest at every step, dents and wobble held');
  sameDishPhysics(on, rm, 'reduced-motion == full motion across the dish');
  for (const s of [rm.A, rm.B]) {
    assert.ok(s.getItems(assets).every((it) => !('deformAmt' in it)),
      'reduced-motion items carry no deform fields');
  }
}

console.log('contacts.selfcheck: OK (#167 — one contact integrator: bounce/swap/stick/die/breed; #1407 — one shared dish grid; #1408 — radius from the mark; #1409 — the per-Look dish switch; #1410 — deform feeds, physics byte-identity, reduced-motion rest)', {
  scenarios: 23,
});
