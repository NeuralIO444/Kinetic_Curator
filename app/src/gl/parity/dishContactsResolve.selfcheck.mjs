// node src/gl/parity/dishContactsResolve.selfcheck.mjs — K3 slice 2b (#2188): GPU dish-contact RESOLUTION (depenetration + the dry
// bounce). The CPU pass is sequential, the GPU pass is Jacobi (averaged over each body's contacts), so: for a body in ONE contact
// the result IS the CPU pass (pinned here against the real runDishContacts on isolated pairs); dense piles are judged by properties
// and by GPU == the Jacobi oracle. The GL half skips cleanly with no Playwright browser.
import assert from 'node:assert/strict';
import { ParticleSystem } from '../../engine/particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from '../../engine/dishContacts.mjs';
import { packContactBodies, referenceContacts } from '../dishContactsGpu.mjs';
import { referenceResolve } from '../dishContactsResolveGpu.mjs';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

const fake = (xs, ys, vxs, vys, ms, { cgroup = 0 } = {}) => ({
  n: xs.length,
  x: Float64Array.from(xs),
  y: Float64Array.from(ys),
  vx: Float64Array.from(vxs),
  vy: Float64Array.from(vys),
  mass: Float64Array.from(ms),
  scale: Float64Array.from(xs, () => 1),
  cgroup: Int32Array.from(xs, () => cgroup),
  alive: Uint8Array.from(xs, () => 1),
});
const entry = (sys, { impulse = true, restitution = 0.5, umask = 0xffffffff } = {}) => ({
  sys,
  radius: 10,
  umask,
  impulse,
  restitution,
});

// ---- pure: hand cases
{
  // head-on bounce, equal masses, restitution 0.5: the relative normal velocity flips to -e * vn and the pair separates by the overlap
  let t = packContactBodies([entry(fake([0], [0], [2], [0], [1])), entry(fake([15], [0], [-2], [0], [1]))]);
  let r = referenceResolve(t);
  assert.deepEqual([...r.count], [1, 1]);
  assert.ok(Math.abs(r.dx[0] + 2.5) < 1e-12 && Math.abs(r.dx[1] - 2.5) < 1e-12, 'overlap 5 split by equal masses');
  const vRel = t.vx[1] + r.dvx[1] - (t.vx[0] + r.dvx[0]);
  assert.ok(Math.abs(vRel - 0.5 * 4) < 1e-12, 'post relative speed = e * approach speed');
  // already separating: depenetrates, no impulse
  t = packContactBodies([entry(fake([0], [0], [-2], [0], [1])), entry(fake([15], [0], [2], [0], [1]))]);
  r = referenceResolve(t);
  assert.ok(r.dvx[0] === 0 && r.dvx[1] === 0 && r.dx[1] > 0);
  // a stick/none stratum takes no impulse (impulse false) but still depenetrates
  t = packContactBodies([
    entry(fake([0], [0], [2], [0], [1]), { impulse: false }),
    entry(fake([15], [0], [-2], [0], [1])),
  ]);
  r = referenceResolve(t);
  assert.ok(r.dvx[0] === 0 && r.dvx[1] === 0 && r.dx[0] < 0);
  // mass weighting: the light body moves further
  t = packContactBodies([entry(fake([0], [0], [0], [0], [1])), entry(fake([15], [0], [0], [0], [3]))]);
  r = referenceResolve(t);
  assert.ok(Math.abs(r.dx[0]) > Math.abs(r.dx[1]) && Math.abs(Math.abs(r.dx[0]) / Math.abs(r.dx[1]) - 3) < 1e-12);
  // a body squeezed by two neighbours: averaged, not summed
  t = packContactBodies([entry(fake([0], [0], [0], [0], [1])), entry(fake([-14, 14], [0, 0], [0, 0], [0, 0], [1, 1]))]);
  r = referenceResolve(t);
  assert.equal(r.count[0], 2);
  assert.ok(Math.abs(r.dx[0]) < 1e-12, 'symmetric squeeze cancels');
  console.log('  [ok] resolution hand cases');
}

// ---- pure: for isolated pairs the oracle IS the real CPU pass
{
  const assets = [{ id: 'a' }];
  const palette = { swatches: ['#ff0000', '#00ff00'] };
  const mk = (n, seed) => {
    const sys = new ParticleSystem();
    sys.init(n, 4000, 4000, assets, palette, seed);
    return sys;
  };
  for (const seed of [3, 11]) {
    const N = 12;
    const A = mk(N, seed);
    const B = mk(N, seed + 100);
    // a grid 300 apart; pair k = (A[k], B[k]) overlapped by ~30%, approaching head-on, everything else isolated
    for (let k = 0; k < N; k++) {
      const gx = 150 + (k % 4) * 300;
      const gy = 150 + Math.floor(k / 4) * 300;
      const rr = 14 * A.scale[k] + 14 * B.scale[k];
      A.x[k] = gx;
      A.y[k] = gy;
      B.x[k] = gx + rr * 0.7;
      B.y[k] = gy;
      A.vx[k] = 1.5 + k * 0.1;
      A.vy[k] = 0.2;
      B.vx[k] = -1.0;
      B.vy[k] = -0.1;
    }
    const sess = createDishSession();
    for (const [key, sys] of [
      ['a', A],
      ['b', B],
    ])
      enrolDishBody(sess, { key, sys, radius: 14, contactMode: 'bounce', restitution: 0.6 });
    const t = packContactBodies([
      { sys: A, radius: 14, umask: 0xffffffff, impulse: true, restitution: 0.6 },
      { sys: B, radius: 14, umask: 0xffffffff, impulse: true, restitution: 0.6 },
    ]);
    const pairs = referenceContacts(t);
    assert.equal(pairs.length, N, `seed ${seed}: one contact per pair, none stray`);
    const r = referenceResolve(t);
    assert.ok(
      r.count.every((c) => c === 1),
      'every body in exactly one contact',
    );
    armDish(sess, ['a', 'b']);
    assert.equal(runDishContacts(sess, A), true);
    let worst = 0;
    for (let i = 0; i < t.nb; i++) {
      const sys = i < N ? A : B;
      const k = i < N ? i : i - N;
      worst = Math.max(
        worst,
        Math.abs(sys.x[k] - (t.x[i] + r.dx[i])),
        Math.abs(sys.y[k] - (t.y[i] + r.dy[i])),
        Math.abs(sys.vx[k] - (t.vx[i] + r.dvx[i])),
        Math.abs(sys.vy[k] - (t.vy[i] + r.dvy[i])),
      );
    }
    assert.ok(worst < 1e-9, `seed ${seed}: oracle == real CPU pass on isolated pairs (worst ${worst})`);
  }
  console.log('  [ok] oracle equals the real CPU pass on isolated pairs');
}

// ---- pure: dense piles — finite, and the total overlap shrinks
const lcg = (seedN) => {
  let s = seedN >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};
const denseTable = (seedN, count = 60, spread = 160) => {
  const rnd = lcg(seedN);
  const active = [];
  for (let k = 0; k < 3; k++) {
    const xs = [];
    const ys = [];
    const vxs = [];
    const vys = [];
    const ms = [];
    for (let i = 0; i < count; i++) {
      xs.push(rnd() * spread);
      ys.push(rnd() * spread);
      vxs.push((rnd() - 0.5) * 4);
      vys.push((rnd() - 0.5) * 4);
      ms.push(0.5 + rnd() * 2);
    }
    active.push(
      entry(fake(xs, ys, vxs, vys, ms, { cgroup: k % 3 }), { impulse: k !== 2, restitution: k === 0 ? 0.3 : 0.8 }),
    );
  }
  return packContactBodies(active);
};
const totalOverlap = (t) => referenceContacts(t).reduce((s, q) => s + q.overlap, 0);
{
  for (const seed of [1, 2, 3]) {
    const t = denseTable(seed);
    const before = totalOverlap(t);
    const r = referenceResolve(t);
    assert.ok([...r.dx, ...r.dy, ...r.dvx, ...r.dvy].every(Number.isFinite), 'finite');
    const moved = { ...t, x: t.x.map((v, i) => v + r.dx[i]), y: t.y.map((v, i) => v + r.dy[i]) };
    const after = totalOverlap(moved);
    assert.ok(before > 50 && after < before, `seed ${seed}: overlap ${before.toFixed(1)} -> ${after.toFixed(1)}`);
    assert.ok(r.count.reduce((a, b) => a + b, 0) % 2 === 0, 'every contact is counted by both bodies');
  }
  console.log('  [ok] dense piles: finite, overlap shrinks');
}

// ---- GL half
let harness;
try {
  harness = await openHarnessPage('/parity/dishContacts.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU dish-contact resolution vs oracle: Playwright browser not installed in this environment');
    process.exit(0);
  }
  throw e;
}
const { page, close } = harness;
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  [${cond ? 'ok' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
};
const plain = (t) =>
  Object.fromEntries(
    ['nb', 'x', 'y', 'r', 'stratum', 'cgroup', 'umask', 'index', 'vx', 'vy', 'mass', 'impulse', 'restitution'].map(
      (k) => [k, k === 'nb' ? t.nb : [...t[k]]],
    ),
  );
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
try {
  for (const seed of [1, 2, 3]) {
    const t = denseTable(seed);
    const want = referenceResolve(t);
    const g = await page.evaluate((a) => window.__kcResolveRun(a), { table: plain(t) });
    check(
      `dense seed ${seed} — contact counts are exact`,
      g.count.every((c, i) => c === want.count[i]),
    );
    const dpos = Math.max(maxDiff(g.dx, want.dx), maxDiff(g.dy, want.dy));
    const dvel = Math.max(maxDiff(g.dvx, want.dvx), maxDiff(g.dvy, want.dvy));
    check(
      `dense seed ${seed} — GPU deltas match the Jacobi oracle`,
      dpos < 2e-3 && dvel < 2e-3,
      `pos ${dpos.toExponential(2)}, vel ${dvel.toExponential(2)}`,
    );
  }
  // coincident discs + masks
  const t = packContactBodies([
    entry(fake([50, 90], [50, 90], [1, 0], [0, 1], [1, 2])),
    entry(fake([50, 90], [50, 90], [-1, 0], [0, -1], [1, 2])),
  ]);
  const want = referenceResolve(t);
  const g = await page.evaluate((a) => window.__kcResolveRun(a), { table: plain(t) });
  check(
    'coincident discs resolve to the oracle (float32 angle)',
    Math.max(maxDiff(g.dx, want.dx), maxDiff(g.dvx, want.dvx)) < 1e-2,
    `${Math.max(maxDiff(g.dx, want.dx), maxDiff(g.dvx, want.dvx)).toExponential(2)}`,
  );
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.error(`dishContactsResolve.selfcheck: ${failed} FAILED`);
  process.exit(1);
}
console.log('dishContactsResolve.selfcheck: ok — K3 slice 2b #2188');
