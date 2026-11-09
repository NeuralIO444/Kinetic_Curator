// dishFluid.selfcheck.mjs — FERROFLUID (#1997): the Gray-Scott kernel and the dish's fluid law.
//
//   A determinism  same stamped inputs → bit-identical field after N steps (the same-device
//                  guarantee, asserted on the kernel's own harness); the seed is a pure
//                  function of (seedKey, magnets)
//   B magnet bias  density response monotone in magnet distance and in the PULL dial
//   C culture bias feed direction: a living culture field grows more dark phase than a dead one
//   D dials        FLOW moves the field's tempo; clamps/sanitizers read junk as the safe side
//   E stamp        the cycle clock is pure: wake/step derive from loop time only; the shed
//                  ladder pins steps-before-resolution
//   F density      the published density is the dish-grid downsample of the dark phase
import assert from 'node:assert/strict';
import {
  createFluid,
  stepFluid,
  fluidHash,
  fluidMeanDensity,
  fluidDensity,
  fluidStamp,
  fluidSeedKey,
  magnetFieldAt,
  sanitizeMagnets,
  sanitizeFluidDial,
  clampFluidRung,
  fluidDisplayColours,
  FLUID_GRID_COLS,
  FLUID_GRID_ROWS,
  FLUID_SHED_RUNGS,
  FLUID_RESOLUTIONS,
  MAX_MAGNETS,
} from './dishFluid.mjs';

const run = (f, steps, opts) => {
  for (let i = 0; i < steps; i++) stepFluid(f, opts);
  return f;
};
const fresh = (seedKey = 777, magnets = []) => createFluid({ cols: 48, rows: 27, seedKey, magnets });

// ---- A: determinism
{
  const a = run(fresh(4242, [{ x: 0.5, y: 0.5 }]), 120, { magnets: [{ x: 0.5, y: 0.5 }], pull: 0.7 });
  const b = run(fresh(4242, [{ x: 0.5, y: 0.5 }]), 120, { magnets: [{ x: 0.5, y: 0.5 }], pull: 0.7 });
  assert.equal(fluidHash(a), fluidHash(b), 'same stamps → same field');
  assert.deepEqual([...a.v], [...b.v], 'bit-identical dark phase');
  assert.deepEqual([...a.u], [...b.u], 'bit-identical ground phase');
  const c = run(fresh(4243, [{ x: 0.5, y: 0.5 }]), 120, { magnets: [{ x: 0.5, y: 0.5 }], pull: 0.7 });
  assert.notEqual(fluidHash(c), fluidHash(a), 'a different seed deals a different field');
  const bare = createFluid({ cols: 48, rows: 27, seedKey: 4242, magnets: [] });
  assert.notEqual(fluidHash(bare), fluidHash(fresh(4242, [{ x: 0.5, y: 0.5 }])), 'magnets shape the seed deal');
  assert.equal(fluidSeedKey(7, 6000), fluidSeedKey(7, 6000), 'seed key is pure');
  assert.notEqual(fluidSeedKey(7, 6000), fluidSeedKey(7, 12000), 'a new wake re-keys');
}

// ---- B: magnet bias (monotone in distance and in pull)
{
  const magnet = { x: 0.5, y: 0.5 };
  const near = run(fresh(99, [magnet]), 300, { magnets: [magnet], pull: 1 });
  const ci = 13 * 48 + 24; // the magnet's own cell (dish centre)
  assert.ok(near.v[ci] > 0.25, `the spike stands at the magnet (V=${near.v[ci].toFixed(3)})`);
  // density falls with distance: the disc around the magnet vs the dish-wide mean
  {
    let disc = 0;
    let dn = 0;
    for (let y = 0; y < 27; y++)
      for (let x = 0; x < 48; x++) {
        const dx = (x + 0.5) / 48 - 0.5;
        const dy = ((y + 0.5) / 27 - 0.5) * 0.7;
        if (Math.hypot(dx, dy) < 0.12) {
          disc += near.v[y * 48 + x];
          dn++;
        }
      }
    assert.ok(dn > 0 && disc / dn > fluidMeanDensity(near) + 0.08, 'the field crowds toward the magnet');
  }
  const weak = run(fresh(99, [magnet]), 300, { magnets: [magnet], pull: 0.25 });
  const none = run(fresh(99, [magnet]), 300, { magnets: [magnet], pull: 0 });
  assert.ok(near.v[ci] > weak.v[ci], 'density at the magnet is monotone in the PULL dial');
  assert.ok(weak.v[ci] >= none.v[ci], 'some pull never does worse than none');
  assert.ok(
    magnetFieldAt([magnet], 0.5, 0.5, 0.7) > magnetFieldAt([magnet], 0.2, 0.2, 0.7),
    'field falls with distance',
  );
  assert.equal(magnetFieldAt([], 0.5, 0.5, 0.7), 0, 'no magnets, no field');
  // without magnets the seeded field still lives (the dish mode is not magnet-dependent)
  const free = run(fresh(99), 300, {});
  assert.ok(fluidMeanDensity(free) > 0.01, 'the unmagnetized fluid still grows');
  assert.ok(near.v.every((v) => v >= 0 && v <= 1) && near.u.every((v) => v >= 0 && v <= 1), 'phases stay in [0,1]');
}

// ---- C: culture bias direction (feed + kill together — the magnet's shape; feed alone is
// regime-dependent in standing coverage, the pair is not. Fixture: a living disc in the
// culture field; the fluid's standing density inside the disc's footprint is the read.)
{
  const level = new Float32Array(48 * 27);
  const inDisc = (x, y) => Math.hypot((x + 0.5) / 48 - 0.3, ((y + 0.5) / 27 - 0.5) * 0.7) < 0.12;
  for (let y = 0; y < 27; y++) for (let x = 0; x < 48; x++) if (inDisc(x, y)) level[y * 48 + x] = 1;
  const discMean = (f) => {
    let t = 0;
    let n = 0;
    for (let y = 0; y < 27; y++)
      for (let x = 0; x < 48; x++)
        if (inDisc(x, y)) {
          t += f.v[y * 48 + x];
          n++;
        }
    return t / n;
  };
  const full = run(fresh(55), 200, { couple: 1, culture: { cols: 48, rows: 27, level } });
  const half = run(fresh(55), 200, { couple: 0.5, culture: { cols: 48, rows: 27, level } });
  const off = run(fresh(55), 200, { couple: 0, culture: { cols: 48, rows: 27, level } });
  const dead = run(fresh(55), 200, { couple: 1, culture: { cols: 48, rows: 27, level: new Float32Array(48 * 27) } });
  assert.ok(discMean(full) > discMean(half), 'density under the culture is monotone in the COUPLE dial');
  assert.ok(discMean(half) > discMean(off), 'some coupling beats none where the culture lives');
  assert.equal(fluidHash(off), fluidHash(dead), 'couple 0 and a dead culture field are the same run');
  // a finer culture grid samples by nearest cell, never out of range
  const coarse = run(fresh(55), 50, {
    couple: 1,
    culture: { cols: 96, rows: 54, level: new Float32Array(96 * 54).fill(0.5) },
  });
  assert.ok(
    coarse.v.every((v) => v >= 0 && v <= 1),
    'cross-grid sampling stays in range',
  );
}

// ---- D: dials, clamps, sanitizers
{
  const slow = run(fresh(31), 150, { flow: 0 });
  const fast = run(fresh(31), 150, { flow: 1 });
  assert.notEqual(fluidHash(slow), fluidHash(fast), 'FLOW moves the field');
  assert.deepEqual(sanitizeFluidDial(null), { flow: 0.5, pull: 0.7, couple: 0.5 });
  assert.deepEqual(sanitizeFluidDial({ flow: 2, pull: -1, couple: 'x' }), { flow: 1, pull: 0, couple: 0 });
  assert.deepEqual(sanitizeMagnets('junk'), []);
  assert.deepEqual(sanitizeMagnets([{ x: 2, y: -1 }, { x: 'a', y: 0.5 }, null, { x: 0.25, y: 0.75 }]), [
    { x: 1, y: 0 },
    { x: 0.25, y: 0.75 },
  ]);
  const many = Array.from({ length: 20 }, (_, i) => ({ x: i / 20, y: 0.5 }));
  assert.equal(sanitizeMagnets(many).length, MAX_MAGNETS, 'the magnet cap is the kernel constant');
  assert.equal(clampFluidRung(-3), 0);
  assert.equal(clampFluidRung(99), FLUID_SHED_RUNGS.length - 1);
  assert.equal(clampFluidRung('x'), 0);
}

// ---- E: the stamp + the shed ladder pin
{
  const a = fluidStamp(6500, { shed: 0 });
  assert.equal(a.mode, 'fluid');
  assert.equal(a.wakeMs, 6000, 'the wake is the cycle floor on the loop clock');
  assert.equal(a.step, 240, 'step counts simulation time inside the cycle');
  assert.deepEqual(fluidStamp(6500, { shed: 0 }), a, 'the stamp is pure');
  assert.equal(fluidStamp(0).step, 0);
  assert.equal(fluidStamp(-5).wakeMs, 0, 'junk time reads as the first cycle');
  // the ladder: steps fall 8→4→2→1 at full resolution, then resolution falls at 1 step, then hold
  assert.deepEqual(
    FLUID_SHED_RUNGS.map((r) => [r.steps, r.res]),
    [
      [8, 0],
      [4, 0],
      [2, 0],
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [0, 3],
    ],
    'steps shed before resolution',
  );
  assert.deepEqual(
    FLUID_RESOLUTIONS.map((r) => [r.cols, r.rows]),
    [
      [384, 216],
      [256, 144],
      [192, 108],
      [96, 54],
    ],
    'the design point is 384×216; the floor is the dish grid',
  );
}

// ---- F: published density
{
  const f = run(createFluid({ cols: FLUID_GRID_COLS, rows: FLUID_GRID_ROWS, seedKey: 8 }), 40, {});
  const d = fluidDensity(f);
  assert.equal(d.length, FLUID_GRID_COLS * FLUID_GRID_ROWS);
  assert.deepEqual([...d], [...f.v], 'at the dish grid the density IS the dark phase');
  const big = run(createFluid({ cols: 384, rows: 216, seedKey: 8 }), 10, {});
  const bd = fluidDensity(big);
  assert.equal(bd.length, FLUID_GRID_COLS * FLUID_GRID_ROWS, 'a display field downsamples to the dish grid');
  const mean = fluidMeanDensity(big);
  const dMean = bd.reduce((t, v) => t + v, 0) / bd.length;
  assert.ok(Math.abs(mean - dMean) < 0.02, 'the downsample preserves the field’s level');
}

// ---- display colours (the palette read)
{
  const c = fluidDisplayColours({ bg: '#101014', ink: '#05050a', swatches: ['#202020', '#f0ead8', '#804040'] });
  assert.deepEqual(c.ground, [0x10 / 255, 0x10 / 255, 0x14 / 255]);
  assert.deepEqual(c.bright, [0xf0 / 255, 0xea / 255, 0xd8 / 255], 'the sheen is the lightest swatch');
  assert.deepEqual(fluidDisplayColours(null), { ground: [0, 0, 0], bright: [1, 1, 1], ink: [0.02, 0.02, 0.03] });
}

console.log('dishFluid.selfcheck: ok');
