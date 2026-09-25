import assert from 'node:assert';
import {
  BEHAVE, BEHAVE_IDS, resolveBehave, orbitForce,
  lorenzAdvance, lorenzSeed, lorenzDeriv, LORENZ_DT, LORENZ_RHO_MAX,
} from './behave.js';

assert.deepStrictEqual(BEHAVE_IDS, ['cruise', 'flock', 'orbit', 'scatter', 'mold', 'lorenz']);
assert.ok(resolveBehave('cruise').sep > resolveBehave('flock').sep);
assert.ok(resolveBehave('cruise').coh < resolveBehave('flock').coh);
assert.strictEqual(resolveBehave('nope').sep, BEHAVE.cruise.sep);
const o = orbitForce(0, 0, 500, 350, 0.5);
assert.ok(Number.isFinite(o.fx) && Number.isFinite(o.fy));
// #287 — mold is the chemotactic colony profile: it must declare the
// scent-gradient gain and the per-step deposit the force pass reads.
const mold = resolveBehave('mold');
assert.ok(mold.chemotaxis > 0, 'mold needs a chemotaxis gain');
assert.ok(mold.deposit > 0, 'mold needs a scent deposit amount');
assert.ok(mold.sep > 0 && mold.coh > 0, 'mold still steers on sep/coh');
// No other profile may opt into chemotaxis — the force pass gates on it.
for (const id of BEHAVE_IDS) {
  if (id === 'mold') continue;
  assert.ok(!(resolveBehave(id).chemotaxis > 0), `${id} must not declare chemotaxis`);
}
// ── #583 lorenz ─────────────────────────────────────────────────────────────
const lz = resolveBehave('lorenz');
assert.ok(lz.lorenzGain > 0, 'lorenz needs a gain to open the branch');
assert.ok(lz.lorenzRho > 0 && lz.lorenzRho <= LORENZ_RHO_MAX, 'rho inside the authored range');
assert.strictEqual(lz.lorenzRho, 28, 'the default is classic chaos');
for (const id of BEHAVE_IDS) {
  if (id === 'lorenz') continue;
  assert.ok(!(resolveBehave(id).lorenzGain > 0), `${id} must not declare lorenzGain`);
}
assert.ok(!(lz.chemotaxis > 0), 'lorenz must not reach the mold-only chemotaxis branch');

/** Walk one seeded ride; report the envelope and how often it changed lobe. */
function ride(rho, steps = 120000, dt = LORENZ_DT, seed = [0.3, 0.7, 0.5]) {
  let s = lorenzSeed(...seed);
  let mx = 0; let my = 0; let mz = -Infinity; let mnz = Infinity;
  let flips = 0; let settledFlips = 0; let last = Math.sign(s.x);
  const settle = steps / 6; // discard the approach; a spiral-in crosses x=0 a
  // couple of times on its way to the fixed point, and that is not chaos.
  for (let i = 0; i < steps; i++) {
    const n = lorenzAdvance(s.x, s.y, s.z, rho, dt);
    s = n;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) {
      return { blewUp: true, at: i };
    }
    mx = Math.max(mx, Math.abs(s.x)); my = Math.max(my, Math.abs(s.y));
    mz = Math.max(mz, s.z); mnz = Math.min(mnz, s.z);
    const g = Math.sign(s.x);
    if (g !== 0 && g !== last) { flips++; if (i > settle) settledFlips++; last = g; }
  }
  return { mx, my, mz, mnz, flips, settledFlips, end: s };
}

// BOUNDED — and bounded to the KNOWN attractor, not merely finite. A drifting
// integrator stays finite while wandering off the butterfly entirely: forward
// Euler at dt 0.02 reaches z = 60 against the true ~47.5 ceiling, and this
// test is what rejects it.
{
  const r = ride(28);
  assert.ok(!r.blewUp, 'the ride must not blow up');
  assert.ok(r.mx < 25, `|x| ${r.mx.toFixed(1)} outside the classic attractor`);
  assert.ok(r.my < 35, `|y| ${r.my.toFixed(1)} outside the classic attractor`);
  assert.ok(r.mz < 55, `z ${r.mz.toFixed(1)} outside the classic attractor`);
  assert.ok(r.mnz > 0, 'z must stay positive on the attractor');
  // …and it must actually fill the attractor, not sit in a corner of it.
  assert.ok(r.mx > 12 && r.mz > 35, 'the ride must actually traverse the attractor');
}

// rho is the DRAMA KNOB, and the lobe-flip count is the evidence: below the
// critical value the trajectory spirals into a fixed point and stops flipping.
{
  const calm = ride(14);
  const chaos = ride(28);
  // Pre-chaotic rho spirals into a fixed point: once settled it never changes
  // lobe again. Chaotic rho never stops. That gap is the knob doing its job.
  assert.strictEqual(calm.settledFlips, 0, `rho 14 must settle and stop flipping (got ${calm.settledFlips})`);
  assert.ok(chaos.settledFlips > 100, `rho 28 must keep flipping lobes (got ${chaos.settledFlips})`);
  assert.ok(ride(20).settledFlips === 0, 'rho 20 is still below the critical value');
  const wide = ride(40);
  assert.ok(wide.mz > chaos.mz, 'higher rho must swing wider');
}

// Determinism, with more teeth than a hash: the same seed must produce the
// same lobe-flip COUNT, and a hair's difference in seed must not (chaos).
{
  assert.strictEqual(ride(28).settledFlips, ride(28).settledFlips, 'same seed, same ride');
  assert.deepStrictEqual(ride(28).end, ride(28).end);
  const nudged = ride(28, 120000, LORENZ_DT, [0.3000001, 0.7, 0.5]);
  assert.notStrictEqual(nudged.settledFlips, ride(28).settledFlips, 'sensitive dependence — this is chaos, not a loop');
}

// rho is clamped, so a bad table edit cannot change the system.
assert.deepStrictEqual(lorenzAdvance(1, 1, 20, 1e9, LORENZ_DT), lorenzAdvance(1, 1, 20, LORENZ_RHO_MAX, LORENZ_DT));
assert.deepStrictEqual(lorenzAdvance(1, 1, 20, NaN, LORENZ_DT), lorenzAdvance(1, 1, 20, 1, LORENZ_DT));

// The origin is a fixed point: seeding must never land on it, or the agent is
// dead for the whole set.
for (let i = 0; i <= 20; i++) {
  for (let j = 0; j <= 4; j++) {
    const s = lorenzSeed(i / 20, j / 4, 0.5);
    assert.ok(Math.hypot(s.x, s.y, s.z) > 5, `seed ${i},${j} too close to the origin fixed point`);
    const d = lorenzDeriv(s.x, s.y, s.z, 28);
    assert.ok(Math.hypot(d.dx, d.dy) > 1e-6, 'a seeded agent must have somewhere to go');
  }
}

// ── #583 lorenz, at the engine ──────────────────────────────────────────────
// The ride is bounded in its own 3-space above; this is the claim that matters
// on the plate — that riding it keeps agents ON the plate and moving, and that
// the per-agent state is really per agent (a flock riding in lockstep would be
// one trajectory drawn N times, not weather).
{
  const { ParticleSystem } = await import('../particles.js');
  const { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } = await import('../../data/layout-modes.js');
  const assets = [{ id: 'a' }, { id: 'b' }];
  const palette = { swatches: ['#111', '#222'] };
  const n = 16;
  function fly(steps = 900) {
    const sys = new ParticleSystem();
    const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', behave: 'lorenz', particleCount: n, metabolism: 0 });
    sys.init(n, 1000, 700, assets, palette, 0x51);
    for (let s = 1; s <= steps; s++) sys.update(lp, assets, palette, 0x51, 5000 + s * (1000 / 60), null);
    return sys;
  }
  const sys = fly();
  const lx = [...sys.lorenzX.subarray(0, n)];
  assert.ok([...sys.x.subarray(0, n)].every((x) => Number.isFinite(x) && x >= 0 && x <= 1000), 'lorenz stays on the plate in x');
  assert.ok([...sys.y.subarray(0, n)].every((y) => Number.isFinite(y) && y >= 0 && y <= 700), 'lorenz stays on the plate in y');
  // Per-agent state: every agent rides its own trajectory.
  assert.ok(new Set(lx.map((v) => v.toFixed(6))).size > n / 2, 'agents must not ride in lockstep');
  assert.ok(lx.every((v) => Math.abs(v) < 25), 'every agent stays on the attractor');
  // No agent parked on the origin fixed point.
  assert.ok(lx.every((v, i) => Math.hypot(v, sys.lorenzY[i], sys.lorenzZ[i]) > 1), 'no agent fell into the fixed point');
  // Replays.
  assert.deepStrictEqual([...fly().x.subarray(0, n)], [...sys.x.subarray(0, n)], 'the ride replays exactly');
}

console.log('behave.selfcheck: OK');
