import assert from 'node:assert';
import {
  BEHAVE, BEHAVE_IDS, resolveBehave, orbitForce, resolveSeekGain,
  levyStep, LEVY_MAX_STEP, LEVY_ALPHA_MAX,
  lorenzAdvance, lorenzSeed, lorenzDeriv, LORENZ_DT, LORENZ_RHO_MAX,
} from './behave.js';
import { hashU01, CH } from '../kernel/rng.js';

assert.deepStrictEqual(BEHAVE_IDS, ['cruise', 'flock', 'orbit', 'scatter', 'mold', 'levy', 'lorenz', 'seek', 'flee']);
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
// ── #582 levy ───────────────────────────────────────────────────────────────
// The row opts into the gated force branch, and no other verb may reach it.
const levy = resolveBehave('levy');
assert.ok(levy.levyGain > 0, 'levy needs a gain to open the branch');
assert.ok(levy.levyAlpha > 0 && levy.levyAlpha <= LEVY_ALPHA_MAX, 'levy alpha inside the authored range');
assert.ok(levy.sep > 0, 'levy still steers on sep');
for (const id of BEHAVE_IDS) {
  if (id === 'levy') continue;
  assert.ok(!(resolveBehave(id).levyGain > 0), `${id} must not declare levyGain`);
}
assert.ok(!(levy.chemotaxis > 0), 'levy must not reach the mold-only chemotaxis branch');

// The claim is a HEAVY TAIL, not just "random": a broken sampler can be
// perfectly deterministic and still wander Brownian. Draw the same seeded
// uniforms through both and compare max/median — the shape, not the scale.
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return { median: s[s.length >> 1], max: s[s.length - 1] };
}
const N = 20000;
const uni = Array.from({ length: N }, (_, i) => hashU01(4242, CH.dyn, i));
const levySteps = uni.map((u) => levyStep(u, 1.35));
// Box-Muller over the same stream: the textbook Brownian contrast.
const brownian = uni.map((u, i) => {
  const u2 = hashU01(4242, CH.dyn, N + i);
  return Math.abs(Math.sqrt(-2 * Math.log(Math.max(u, 1e-12))) * Math.cos(2 * Math.PI * u2));
});
const L = stats(levySteps);
const B = stats(brownian);
const ratio = (s) => s.max / s.median;
assert.ok(ratio(L) > 20, `levy max/median ${ratio(L).toFixed(1)} should be a heavy tail`);
assert.ok(ratio(B) < 10, `brownian max/median ${ratio(B).toFixed(1)} should not be`);
assert.ok(ratio(L) > 3 * ratio(B), `levy tail (${ratio(L).toFixed(1)}) must dwarf brownian (${ratio(B).toFixed(1)})`);
// Most steps are a hold, a few are a stride — that is the foraging shape.
const big = levySteps.filter((x) => x > 10 * L.median).length / N;
assert.ok(big > 0.001 && big < 0.08, `strides should be rare but real (got ${(big * 100).toFixed(2)}%)`);

// alpha is the family, so it must MOVE the tail, monotonically. Measured as
// the fraction over a fixed threshold (P(L>l) = l^-alpha), NOT max/median:
// past the cap the max pins at LEVY_MAX_STEP while the median keeps rising,
// so max/median actually falls as the tail gets heavier.
const overThreshold = (a, l = 8) => uni.filter((u) => levyStep(u, a) > l).length / N;
assert.ok(overThreshold(0.8) > overThreshold(1.35), 'alpha 0.8 must out-tail 1.35');
assert.ok(overThreshold(1.35) > overThreshold(2), 'alpha 1.35 must out-tail 2');
// …and match the analytic tail l^-alpha within sampling error, so the sampler
// is the distribution it claims to be and not merely monotone.
for (const a of [0.8, 1.35, 2]) {
  const want = Math.pow(9, -a); // shifted: P(L-1 > 8) = (1+8)^-alpha
  assert.ok(Math.abs(overThreshold(a) - want) < want * 0.15,
    `P(L>8) at alpha ${a}: got ${overThreshold(a).toFixed(4)}, analytic ${want.toFixed(4)}`);
}
// The cap is a real ceiling, stated: at the authored default it is rare, but a
// much lower alpha saturates often and stops being a distribution.
assert.ok(levySteps.filter((x) => x >= LEVY_MAX_STEP).length / N < 0.01,
  'at the authored alpha the cap must be a guard rail, not the common case');

// Bounded and finite for every input, including the ones that break the math:
// u -> 1 is an infinite raw draw, alpha <= 0 flips the exponent.
for (const u of [0, 0.5, 1 - 1e-15, 1, NaN, undefined, -1, 2]) {
  for (const a of [0.05, 1.35, 2, 0, -1, NaN, 1e9, undefined]) {
    const v = levyStep(u, a);
    assert.ok(Number.isFinite(v) && v >= 0 && v <= LEVY_MAX_STEP, `levyStep(${u}, ${a}) = ${v} out of bounds`);
  }
}
// Same input, same step — the walk replays.
assert.strictEqual(levyStep(0.837, 1.35), levyStep(0.837, 1.35));

// ── #582 levy, at the engine ────────────────────────────────────────────────
// The distribution tests above prove the SAMPLER. This proves the WALK: that
// the branch actually produces heavy-tailed DISPLACEMENT once the integrator,
// the damping and the 1.65 speed clamp have had their say. It is the test that
// catches the failure the sampler tests cannot see — a per-frame re-draw is a
// perfect heavy tail that averages to Brownian over any window you can watch.
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
// ── #584 seek / flee ────────────────────────────────────────────────────────
// Every pre-existing row must resolve to a gain of exactly 1, or the attractor
// force moves under verbs this issue never touched.
for (const id of ['cruise', 'flock', 'orbit', 'scatter', 'mold']) {
  assert.strictEqual(resolveSeekGain(resolveBehave(id)), 1, `${id} must keep the legacy attractor force`);
}
assert.strictEqual(resolveSeekGain(null), 1);
assert.strictEqual(resolveSeekGain({ seekGain: NaN }), 1, 'a broken gain falls back to legacy, never NaN');
assert.strictEqual(resolveSeekGain({ seekGain: -2 }), -2);

// flee must be seek with the sign flipped and NOTHING else different — that is
// what keeps the symmetry property below true as the rows get tuned.
{
  const seek = resolveBehave('seek');
  const flee = resolveBehave('flee');
  assert.strictEqual(flee.seekGain, -seek.seekGain, 'flee is the negation of seek');
  for (const k of Object.keys(seek)) {
    if (k === 'seekGain') continue;
    assert.strictEqual(flee[k], seek[k], `seek/flee differ on ${k} — the symmetry claim would be a coincidence`);
  }
  assert.ok(seek.seekGain > 0 && seek.attract > 0, 'seek must actually pull');
}

{
  const { ParticleSystem } = await import('../particles.js');
  const { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } = await import('../../data/layout-modes.js');
  const assets = [{ id: 'a' }, { id: 'b' }];
  const palette = { swatches: ['#111', '#222'] };
  const W = 45; // one flight duration: the window a stride has to show up in

  /** Per-agent displacement over W-frame windows. */
  function hops(gain) {
    const restore = BEHAVE.levy.levyGain;
    BEHAVE.levy.levyGain = gain;                       // A/B the branch itself
    try {
      const n = 16;
      const sys = new ParticleSystem();
      const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', behave: 'levy', particleCount: n, metabolism: 0 });
      sys.init(n, 1000, 700, assets, palette, 0x51);
      const out = [];
      let px = [...sys.x.subarray(0, n)]; let py = [...sys.y.subarray(0, n)];
      for (let s = 1; s <= 1800; s++) {
        sys.update(lp, assets, palette, 0x51, 5000 + s * (1000 / 60), null);
        if (s % W === 0) {
          for (let i = 0; i < n; i++) out.push(Math.hypot(sys.x[i] - px[i], sys.y[i] - py[i]));
          px = [...sys.x.subarray(0, n)]; py = [...sys.y.subarray(0, n)];
        }
      }
      return { list: out.slice().sort((a, b) => a - b), last: [...sys.x.subarray(0, n)] };
    } finally { BEHAVE.levy.levyGain = restore; }
  }
  const q = (l, p) => l[Math.min(l.length - 1, Math.floor(l.length * p))];

  const on = hops(BEHAVE.levy.levyGain);
  const off = hops(0);                                  // control: branch closed
  const spreadOn = q(on.list, 0.99) / q(on.list, 0.5);
  const spreadOff = q(off.list, 0.99) / q(off.list, 0.5);
  assert.ok(spreadOn > 4, `levy p99/median displacement ${spreadOn.toFixed(1)} is not a stride`);
  assert.ok(spreadOn > 1.5 * spreadOff,
    `the BRANCH must make the tail, not the row: on ${spreadOn.toFixed(1)} vs off ${spreadOff.toFixed(1)}`);
  assert.ok(q(on.list, 0.99) > 3 * q(off.list, 0.99),
    'the longest flights must travel much further than the same row with the branch closed');
  // Hold and stride are different things, not one blurred average.
  assert.ok(q(on.list, 0.5) < 0.35 * q(on.list, 0.99), 'the common case must still be a hold');
  // Bounded: no NaN escape, nothing off the plate.
  assert.ok(on.last.every((x) => Number.isFinite(x) && x >= 0 && x <= 1000), 'levy stays finite and on the plate');
  // Same seed, same walk.
  assert.deepStrictEqual(hops(BEHAVE.levy.levyGain).last, on.last, 'the walk replays exactly');
  const nLz = 16;
  function fly(steps = 900) {
    const sys = new ParticleSystem();
    const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', behave: 'lorenz', particleCount: nLz, metabolism: 0 });
    sys.init(nLz, 1000, 700, assets, palette, 0x51);
    for (let s = 1; s <= steps; s++) sys.update(lp, assets, palette, 0x51, 5000 + s * (1000 / 60), null);
    return sys;
  }
  const sys = fly();
  const lx = [...sys.lorenzX.subarray(0, nLz)];
  assert.ok([...sys.x.subarray(0, nLz)].every((x) => Number.isFinite(x) && x >= 0 && x <= 1000), 'lorenz stays on the plate in x');
  assert.ok([...sys.y.subarray(0, nLz)].every((y) => Number.isFinite(y) && y >= 0 && y <= 700), 'lorenz stays on the plate in y');
  // Per-agent state: every agent rides its own trajectory.
  assert.ok(new Set(lx.map((v) => v.toFixed(6))).size > nLz / 2, 'agents must not ride in lockstep');
  assert.ok(lx.every((v) => Math.abs(v) < 25), 'every agent stays on the attractor');
  // No agent parked on the origin fixed point.
  assert.ok(lx.every((v, i) => Math.hypot(v, sys.lorenzY[i], sys.lorenzZ[i]) > 1), 'no agent fell into the fixed point');
  // Replays.
  assert.deepStrictEqual([...fly().x.subarray(0, nLz)], [...sys.x.subarray(0, nLz)], 'the ride replays exactly');
// ── #584 at the engine: the two claims that are the whole verb ──────────────
  {
  const n = 24;
  const POINTER = { x: 500, y: 350 };
  const mk = (behave) => {
    const sys = new ParticleSystem();
    const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', behave, particleCount: n, metabolism: 0 });
    sys.init(n, 1000, 700, assets, palette, 0x77);
    return { sys, lp };
  };
  const step = ({ sys, lp }, attractor, t) => sys.update(lp, assets, palette, 0x77, t, attractor);
  // ax/ay are consumed and cleared by the integrator, so the attractor's
  // contribution is read from the VELOCITY it produced. That is exact: with
  // the state grafted and velocity zeroed, v = (0 + a*dt) * damp is linear in
  // a, so equal-and-opposite forces give equal-and-opposite velocities —
  // provided no particle hits the speed clamp, which zeroing velocity and
  // taking a single step guarantees.
  const vel = (s) => [...s.vx.subarray(0, n)].concat([...s.vy.subarray(0, n)]);
  /** Copy the full motion state of one system onto another. */
  const graft = (dst, src, { still = false } = {}) => {
    for (const k of ['x', 'y', 'vx', 'vy']) dst[k].set(src[k].subarray(0, n), 0);
    if (still) { dst.vx.fill(0, 0, n); dst.vy.fill(0, 0, n); }
  };

  // SYMMETRY — flee at gain g is exactly -1 x seek at gain g on the same field.
  // Measured as the attractor's CONTRIBUTION (with-pointer minus without), so
  // the shared steering cancels and only the hand is left.
  {
    const base = mk('seek');
    for (let i = 1; i <= 40; i++) step(base, POINTER, 5000 + i * 16.67);
    const S = base.sys;
    const seekRun = mk('seek'); const fleeRun = mk('flee'); const noneRun = mk('seek');
    for (const r of [seekRun, fleeRun, noneRun]) graft(r.sys, S, { still: true });
    step(seekRun, POINTER, 6000); step(fleeRun, POINTER, 6000); step(noneRun, null, 6000);
    const a0 = vel(noneRun.sys); const as = vel(seekRun.sys); const af = vel(fleeRun.sys);
    // The speed clamp is the one non-linearity in the path, so a particle that
    // saturates it cannot be expected to negate exactly. Skip those and
    // require the rest to be exact — a real sign bug would break every
    // particle, not only the fast ones.
    const SPEED_CLAMP = 1.65;
    const fast = (v, i) => Math.hypot(v[i], v[i + n]) > SPEED_CLAMP * 0.999;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      if (fast(as, i) || fast(af, i) || fast(a0, i)) continue;
      for (const off of [0, n]) {
        const pull = as[i + off] - a0[i + off];
        const push = af[i + off] - a0[i + off];
        if (Math.abs(pull) > 1e-9) moved++;
        assert.ok(Math.abs(pull + push) < 1e-9 * Math.max(1, Math.abs(pull)),
          `flee must be exactly -seek: pull ${pull}, push ${push}`);
      }
    }
    assert.ok(moved > n, `the pointer must actually move the field, or the symmetry is vacuous (moved ${moved})`);
  }

  // RELEASE — pointerup zeroes the hand the SAME frame, with no residual kick.
  // Two systems reach an identical motion state by DIFFERENT histories (one
  // fled the pointer for 120 frames, one never saw it). Grafted to the same
  // state and stepped with no attractor, they must agree bit-for-bit: anything
  // remembered about the pointer — a smoothed position, a decaying gain, a
  // "last attractor" fallback — would keep pushing one of them and not the other.
  {
    const held = mk('flee'); const never = mk('flee');
    for (let i = 1; i <= 120; i++) { step(held, POINTER, 5000 + i * 16.67); step(never, null, 5000 + i * 16.67); }
    graft(never.sys, held.sys);
    const beforeX = [...held.sys.x.subarray(0, n)];
    step(held, null, 7000); step(never, null, 7000);
    assert.deepStrictEqual([...held.sys.x.subarray(0, n)], [...never.sys.x.subarray(0, n)],
      'a released pointer must leave no residue in x');
    assert.deepStrictEqual([...held.sys.vx.subarray(0, n)], [...never.sys.vx.subarray(0, n)],
      'a released pointer must leave no residue in velocity');
    // Sanity: the pointer really was doing something up to the release.
    assert.notDeepStrictEqual([...held.sys.x.subarray(0, n)], beforeX, 'the field must still be alive after release');
  }

  // A null / malformed attractor is a no-op, not a crash and not a NaN.
  for (const bad of [null, undefined, {}, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    const r = mk('seek');
    for (let i = 1; i <= 20; i++) step(r, bad, 5000 + i * 16.67);
    assert.ok([...r.sys.x.subarray(0, n)].every(Number.isFinite), `attractor ${JSON.stringify(bad)} must be a no-op`);
  }

  // seek pulls IN, flee pushes OUT — the directions are not swapped.
  {
    const dist = (sys) => {
      let d = 0;
      for (let i = 0; i < n; i++) d += Math.hypot(sys.x[i] - POINTER.x, sys.y[i] - POINTER.y);
      return d / n;
    };
    const s = mk('seek'); const f = mk('flee');
    graft(f.sys, s.sys);
    const d0 = dist(s.sys);
    for (let i = 1; i <= 90; i++) { step(s, POINTER, 5000 + i * 16.67); step(f, POINTER, 5000 + i * 16.67); }
    assert.ok(dist(s.sys) < d0, `seek must close on the pointer (${d0.toFixed(0)} -> ${dist(s.sys).toFixed(0)})`);
    assert.ok(dist(f.sys) > dist(s.sys), 'flee must end further out than seek');
  }
  } // seek/flee engine block
}

console.log('behave.selfcheck: OK');
