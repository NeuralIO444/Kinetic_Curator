// node src/engine/dishContactStamps.effects.selfcheck.mjs — K3 slice 2d (#2188): the stamped path keeps EVERY side effect of the grid
// pass. Ruling (Matt, 2026-11-16): the wet-pair medium (cling, friction, spin) and the side effects (deform feed, wet stamps,
// density) run on the CPU from the recorded list, so replay is exact. They already do — the stamped list feeds the same
// resolvePair — and this pins it: on isolated WET pairs a stamped run leaves bit-identical state to the grid run in EVERY typed
// column of both systems (positions, velocities, omega, theta, deform springs, ...), the session's wet stamps, and the density field.
import assert from 'node:assert/strict';
import { ParticleSystem } from './particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from './dishContacts.mjs';
import { packContactStamps } from './dishContactStamps.mjs';
import { packContactBodies, referenceContacts } from '../gl/dishContactsGpu.mjs';

const assets = [{ id: 'a' }];
const palette = { swatches: ['#ff0000', '#00ff00'] };
const N = 12;
// isolated overlapping pairs, with a SLIDE (tangential speed) so friction and spin have something to do
const world = (seed) => {
  const mk = (s) => {
    const sys = new ParticleSystem();
    sys.init(N, 4000, 4000, assets, palette, s);
    return sys;
  };
  const A = mk(seed);
  const B = mk(seed + 100);
  for (let k = 0; k < N; k++) {
    const gx = 150 + (k % 4) * 300;
    const gy = 150 + Math.floor(k / 4) * 300;
    const rr = 14 * A.scale[k] + 14 * B.scale[k];
    A.x[k] = gx;
    A.y[k] = gy;
    B.x[k] = gx + rr * 0.7;
    B.y[k] = gy + rr * 0.1;
    A.vx[k] = 1.5 + k * 0.1;
    A.vy[k] = 1.2;
    B.vx[k] = -1.0;
    B.vy[k] = -0.9;
  }
  return { A, B };
};
const run = ({ A, B }, { wet, stamps, field }) => {
  const sess = createDishSession();
  for (const [key, sys] of [
    ['a', A],
    ['b', B],
  ]) {
    enrolDishBody(sess, { key, sys, radius: 14, contactMode: 'bounce', restitution: 0.6, wetness: wet });
  }
  if (field) sess.wetSampler = field;
  armDish(sess, ['a', 'b']);
  if (stamps) sess.contactStamps = stamps;
  assert.equal(runDishContacts(sess, A), true);
  return sess;
};
const stampsFor = ({ A, B }) => {
  const t = packContactBodies([
    { sys: A, radius: 14, umask: 0xffffffff, impulse: true, restitution: 0.6 },
    { sys: B, radius: 14, umask: 0xffffffff, impulse: true, restitution: 0.6 },
  ]);
  return packContactStamps(referenceContacts(t), t.nb);
};
// every typed column on a system, by name
const columns = (sys) => {
  const out = {};
  for (const k of Object.keys(sys)) if (ArrayBuffer.isView(sys[k])) out[k] = Array.from(sys[k]);
  return out;
};
const sameColumns = (p, q, label) => {
  const cp = columns(p);
  const cq = columns(q);
  assert.deepEqual(Object.keys(cp), Object.keys(cq));
  for (const k of Object.keys(cp)) assert.deepEqual(cp[k], cq[k], `${label}: column ${k}`);
  return Object.keys(cp).length;
};

for (const [name, opts] of [
  ['dry', { wet: 0 }],
  ['wet (enrolment scalar)', { wet: 0.7 }],
  ['wet (shared field)', { wet: 0.7, field: () => 0.8 }],
]) {
  const grid = world(4);
  const stamped = world(4);
  const g = run(grid, opts);
  const s = run(stamped, { ...opts, stamps: stampsFor(stamped) });
  assert.equal(stampsFor(world(4)).a.length, N, 'one contact per pair');
  const cols = sameColumns(grid.A, stamped.A, `${name} A`) + sameColumns(grid.B, stamped.B, `${name} B`);
  assert.deepEqual(s.density, g.density, `${name}: the density field is the same`);
  assert.deepEqual(s.wetStamps, g.wetStamps, `${name}: the wet stamps are the same`);
  if (opts.field) assert.equal(s.wetStamps.length > 0, true, 'the press was recorded');
  console.log(`  [ok] ${name}: ${cols} columns, density and wet stamps identical, stamped == grid`);
}

// and the effects really happened (the test is not vacuous): wet slides spin the bodies and dent them
{
  const dry = world(4);
  const wet = world(4);
  run(dry, { wet: 0, stamps: stampsFor(dry) });
  run(wet, { wet: 0.9, stamps: stampsFor(wet) });
  const omegaMoved = Array.from(wet.A.omega.subarray(0, N)).some((v) => v !== 0);
  assert.ok(omegaMoved, 'a wet slide spins the bodies through the stamped path');
  assert.ok(
    Array.from(dry.A.omega.subarray(0, N)).every((v) => v === 0),
    'dry: no spin',
  );
  assert.notDeepEqual(columns(wet.A).vx, columns(dry.A).vx, 'wet changes the resolution');
  console.log('  [ok] the effects are real: wet spins and changes the resolution; dry does not');
}
console.log('dishContactStamps.effects.selfcheck: ok — K3 slice 2d #2188');
