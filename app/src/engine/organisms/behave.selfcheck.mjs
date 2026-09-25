import assert from 'node:assert';
import { BEHAVE, BEHAVE_IDS, resolveBehave, orbitForce, resolveSeekGain } from './behave.js';

assert.deepStrictEqual(BEHAVE_IDS, ['cruise', 'flock', 'orbit', 'scatter', 'mold', 'seek', 'flee']);
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

// ── #584 at the engine: the two claims that are the whole verb ──────────────
{
  const { ParticleSystem } = await import('../particles.js');
  const { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } = await import('../../data/layout-modes.js');
  const assets = [{ id: 'a' }, { id: 'b' }];
  const palette = { swatches: ['#111', '#222'] };
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
}

console.log('behave.selfcheck: OK');
