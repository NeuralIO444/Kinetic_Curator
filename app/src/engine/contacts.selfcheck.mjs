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
import { bakeParticles } from './kernel/bake/index.js';
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

/** Two particles head-on: i at (400,350) moving +x, j at (430,350) moving -x. */
function headOnPair() {
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400; sys.y[0] = 350;
  sys.x[1] = 430; sys.y[1] = 350;
  sys.vx[0] = 2; sys.vy[0] = 0;
  sys.vx[1] = -2; sys.vy[1] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1;
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

console.log('contacts.selfcheck: OK (#167 — one contact integrator: bounce/swap/stick/die/breed)', {
  scenarios: 16,
});
