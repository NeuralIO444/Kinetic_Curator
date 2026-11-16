// node src/engine/dishContactStamps.selfcheck.mjs — K3 slice 2c (#2188): the GPU dish pass's contact list as a RECORDED INPUT.
// The stamp format is pure; the consumer is the real dish pass (runDishContacts). Pinned: the format fails closed; a stamped list
// resolves exactly like the grid pass where the two agree (isolated pairs); a recorded list is honoured (an empty one resolves
// nothing); a list that does not fit this frame's table is ignored (the grid pass runs); a stamped run is deterministic; the
// list is consumed once; the grid pass is unchanged with no stamps.
import assert from 'node:assert/strict';
import { ParticleSystem } from './particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from './dishContacts.mjs';
import { packContactStamps, isContactStamps, contactStampsFit } from './dishContactStamps.mjs';
import { packContactBodies, referenceContacts } from '../gl/dishContactsGpu.mjs';

// ---- the format
{
  const s = packContactStamps(
    [
      { a: 3, b: 7 },
      { a: 1, b: 2 },
      { a: 1, b: 9 },
      { a: 5, b: 5 }, // a == b: dropped
      { a: 2, b: 99 }, // out of range: dropped
      { a: -1, b: 4 }, // negative: dropped
      null,
    ],
    10,
  );
  assert.deepEqual([...s.a], [1, 1, 3]);
  assert.deepEqual([...s.b], [2, 9, 7], 'canonical order: a ascending, then b');
  assert.equal(s.nb, 10);
  assert.equal(isContactStamps(s), true);
  assert.equal(contactStampsFit(s, 10), true);
  assert.equal(contactStampsFit(s, 11), false, 'nb must match the frame table');
  assert.equal(
    contactStampsFit({ nb: 10, a: Uint16Array.of(5), b: Uint16Array.of(3) }, 10),
    false,
    'a < b is required',
  );
  assert.equal(
    contactStampsFit({ nb: 10, a: Uint16Array.of(1), b: Uint16Array.of(10) }, 10),
    false,
    'in range is required',
  );
  for (const junk of [
    null,
    undefined,
    3,
    'x',
    {},
    { nb: 0, a: [], b: [] },
    { nb: 5, a: Uint16Array.of(1), b: Uint16Array.of() },
    { nb: 5, a: [1], b: [2] },
  ]) {
    assert.equal(isContactStamps(junk), false, 'malformed is rejected');
  }
  assert.deepEqual(packContactStamps(null, 5).a.length, 0);
  assert.equal(packContactStamps([], 0).nb, 0, 'no table, no stamps');
  console.log('  [ok] stamp format fails closed');
}

// ---- the consumer
const assets = [{ id: 'a' }];
const palette = { swatches: ['#ff0000', '#00ff00'] };
const entryOf = (sys) => ({ sys, radius: 14, umask: 0xffffffff, impulse: true, restitution: 0.6 });
// A world: two strata; pairs (A[k], B[k]) overlapped, everything else far apart, so contacts are ISOLATED
const isolatedWorld = (seed) => {
  const N = 12;
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
    B.y[k] = gy;
    A.vx[k] = 1.5 + k * 0.1;
    A.vy[k] = 0.2;
    B.vx[k] = -1.0;
    B.vy[k] = -0.1;
  }
  return { A, B };
};
// A dense world: lots of overlap, chains of contacts
const denseWorld = (seed) => {
  const mk = (s) => {
    const sys = new ParticleSystem();
    sys.init(50, 220, 220, assets, palette, s);
    return sys;
  };
  return { A: mk(seed), B: mk(seed + 100) };
};
const stateOf = ({ A, B }) =>
  [A, B].map((s) => [
    ...s.x.subarray(0, s.n),
    ...s.y.subarray(0, s.n),
    ...s.vx.subarray(0, s.n),
    ...s.vy.subarray(0, s.n),
  ]);
const run = ({ A, B }, stamps) => {
  const sess = createDishSession();
  for (const [key, sys] of [
    ['a', A],
    ['b', B],
  ])
    enrolDishBody(sess, { key, sys, radius: 14, contactMode: 'bounce', restitution: 0.6 });
  armDish(sess, ['a', 'b']);
  if (stamps !== undefined) sess.contactStamps = stamps;
  assert.equal(runDishContacts(sess, A), true);
  return sess;
};
const stampsOf = ({ A, B }) => {
  const t = packContactBodies([entryOf(A), entryOf(B)]);
  return packContactStamps(referenceContacts(t), t.nb);
};
{
  // isolated pairs: the stamped run == the grid run, exactly (same maths, same pairs, order immaterial)
  for (const seed of [3, 11]) {
    const grid = isolatedWorld(seed);
    const stamped = isolatedWorld(seed);
    const st = stampsOf(stamped);
    assert.equal(st.a.length, 12, 'one contact per pair');
    run(grid);
    run(stamped, st);
    assert.deepEqual(stateOf(stamped), stateOf(grid), `seed ${seed}: stamped == grid on isolated pairs`);
  }
  console.log('  [ok] a stamped list resolves like the grid pass on isolated pairs');
}
{
  // the recorded list is honoured: an EMPTY list resolves nothing, though the world is full of overlap
  const w = denseWorld(5);
  const before = stateOf(w);
  const t = packContactBodies([entryOf(w.A), entryOf(w.B)]);
  assert.ok(referenceContacts(t).length > 20, 'the dense world really overlaps');
  run(w, packContactStamps([], t.nb));
  assert.deepEqual(stateOf(w), before, 'no stamped contacts: nothing moves');
  // and a non-empty list resolves something
  const w2 = denseWorld(5);
  run(w2, stampsOf(w2));
  assert.notDeepEqual(stateOf(w2), before);
  console.log('  [ok] the recorded list is honoured (empty resolves nothing)');
}
{
  // a list that does not fit is ignored: the grid pass runs
  const grid = denseWorld(6);
  const bad = denseWorld(6);
  const t = packContactBodies([entryOf(bad.A), entryOf(bad.B)]);
  run(grid);
  run(bad, packContactStamps([{ a: 0, b: 1 }], t.nb + 1)); // wrong nb
  assert.deepEqual(stateOf(bad), stateOf(grid), 'wrong table size: ignored');
  const junk = denseWorld(6);
  run(junk, { nb: t.nb, a: [1], b: [2] }); // not typed arrays
  assert.deepEqual(stateOf(junk), stateOf(grid), 'malformed: ignored');
  console.log('  [ok] a list that does not fit is ignored (fail closed to the grid pass)');
}
{
  // determinism + consumed once
  const x = denseWorld(9);
  const y = denseWorld(9);
  const sx = stampsOf(x);
  const sessX = run(x, sx);
  run(y, stampsOf(y));
  assert.deepEqual(stateOf(x), stateOf(y), 'same list, same world: same result');
  assert.equal(sessX.contactStamps, null, 'consumed once');
  console.log('  [ok] deterministic, consumed once');
}
{
  // no stamps: the grid pass, unchanged (two runs identical, and it does resolve the pile)
  const p = denseWorld(7);
  const q = denseWorld(7);
  const before = stateOf(p);
  run(p);
  run(q);
  assert.deepEqual(stateOf(p), stateOf(q));
  assert.notDeepEqual(stateOf(p), before);
  console.log('  [ok] no stamps: the grid pass is unchanged');
}
console.log('dishContactStamps.selfcheck: ok — K3 slice 2c #2188');
