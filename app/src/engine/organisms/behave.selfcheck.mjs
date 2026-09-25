import assert from 'node:assert';
import { BEHAVE, BEHAVE_IDS, resolveBehave, orbitForce, levyStep, LEVY_MAX_STEP, LEVY_ALPHA_MAX } from './behave.js';
import { hashU01, CH } from '../kernel/rng.js';

assert.deepStrictEqual(BEHAVE_IDS, ['cruise', 'flock', 'orbit', 'scatter', 'mold', 'levy']);
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
}

console.log('behave.selfcheck: OK');
