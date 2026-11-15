// node src/gl/fieldRecon.selfcheck.mjs
// #2182 WS3 — the display-resolution read of the density field (fieldBodyReconDensity, the JS twin FIELD_VS is
// transcribed from). The kernel and the coupling stay on the 96x54 grid; only the seating's READ gets finer.
//   A mode 0 is the pre-WS3 read, exactly: the seat model with recon 0 equals the model with no option
//   B the reconstruction: exact at texel centres (modes 1, 2), bounded (bilinear inside its four neighbours,
//     bicubic inside [0,1]), continuous across cell edges where mode 0 jumps, deterministic
//   C finer: on the calibration field the seats carry far more distinct densities than the 5,184 the grid has
//   D bedrock is never seated, in any mode, and the field/pack inputs are untouched
import assert from 'node:assert/strict';
import { createFluid, stepFluid, fluidDensity, sanitizeMagnets } from '../engine/dishFluid.mjs';
import {
  packFieldDensity,
  fieldBodySeatModel,
  fieldBodyReconDensity,
  FIELD_RECON_MODES,
} from '../engine/dishFluidChannel.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const magnets = sanitizeMagnets([
  { x: 0.5, y: 0.5 },
  { x: 0.25, y: 0.3 },
]);
const fluid = createFluid({ cols: 96, rows: 54, seedKey: 1234567, magnets });
for (let i = 0; i < 600; i++) stepFluid(fluid, { magnets });
const density = fluidDensity(fluid);
const packed = packFieldDensity(density, null);
const C = 96;
const texel = (i, j) => packed[(j * C + i) * 2] / 255;

ok('A: recon 0 is the pre-WS3 read, exactly', () => {
  const base = fieldBodySeatModel(packed, 1234567, 8192, 36);
  const zero = fieldBodySeatModel(packed, 1234567, 8192, 36, { recon: 0 });
  assert.equal(base.length, 7690, 'the committed calibration count');
  assert.deepEqual(zero, base);
  assert.deepEqual(FIELD_RECON_MODES, { cell: 0, bilinear: 1, bicubic: 2 });
  for (const [ux, uy] of [
    [10.2, 20.9],
    [47.999, 26.001],
    [0.0, 0.0],
  ]) {
    assert.equal(fieldBodyReconDensity(packed, ux, uy, 0), texel(Math.floor(ux), Math.floor(uy)));
  }
});

ok('B: exact at texel centres, bounded, continuous, deterministic', () => {
  for (const mode of [1, 2]) {
    for (const [i, j] of [
      [10, 20],
      [47, 26],
      [0, 0],
      [95, 53],
      [48, 27],
    ]) {
      const v = fieldBodyReconDensity(packed, i + 0.5, j + 0.5, mode);
      assert.ok(Math.abs(v - texel(i, j)) < 1e-12, `mode ${mode} at centre (${i},${j}): ${v} vs ${texel(i, j)}`);
    }
  }
  let maxJump0 = 0;
  let maxJump1 = 0;
  let maxJump2 = 0;
  const eps = 1e-6;
  for (let j = 1; j < 53; j++) {
    for (let i = 1; i < 95; i++) {
      // bounds
      const u = i + 0.37;
      const w = j + 0.81;
      const b = fieldBodyReconDensity(packed, u, w, 1);
      const nb = [texel(i - 1, j), texel(i, j), texel(i - 1, j + 1), texel(i, j + 1)];
      assert.ok(b >= Math.min(...nb) - 1e-12 && b <= Math.max(...nb) + 1e-12, 'bilinear stays inside its neighbours');
      const c = fieldBodyReconDensity(packed, u, w, 2);
      assert.ok(c >= 0 && c <= 1, 'bicubic is clamped to [0, 1]');
      // continuity across the cell edge at x = i
      maxJump0 = Math.max(
        maxJump0,
        Math.abs(fieldBodyReconDensity(packed, i + eps, w, 0) - fieldBodyReconDensity(packed, i - eps, w, 0)),
      );
      maxJump1 = Math.max(
        maxJump1,
        Math.abs(fieldBodyReconDensity(packed, i + eps, w, 1) - fieldBodyReconDensity(packed, i - eps, w, 1)),
      );
      maxJump2 = Math.max(
        maxJump2,
        Math.abs(fieldBodyReconDensity(packed, i + eps, w, 2) - fieldBodyReconDensity(packed, i - eps, w, 2)),
      );
    }
  }
  assert.ok(maxJump0 > 0.1, `the legacy read jumps across cell edges (${maxJump0})`);
  assert.ok(maxJump1 < 1e-3 && maxJump2 < 1e-3, `the reconstructed reads are continuous (${maxJump1}, ${maxJump2})`);
  assert.equal(fieldBodyReconDensity(packed, 33.3, 12.7, 2), fieldBodyReconDensity(packed, 33.3, 12.7, 2));
});

const counts = {};
ok('C: seats carry far finer density than the grid', () => {
  const distinct = (seats) => new Set(seats.map((s) => s.d)).size;
  const m0 = fieldBodySeatModel(packed, 1234567, 8192, 36, { recon: 0 });
  const m1 = fieldBodySeatModel(packed, 1234567, 8192, 36, { recon: 1 });
  const m2 = fieldBodySeatModel(packed, 1234567, 8192, 36, { recon: 2 });
  counts.cell = m0.length;
  counts.bilinear = m1.length;
  counts.bicubic = m2.length;
  console.log(
    `      seats: cell ${m0.length} (${distinct(m0)} distinct d) · bilinear ${m1.length} (${distinct(m1)}) · bicubic ${m2.length} (${distinct(m2)})`,
  );
  assert.ok(distinct(m1) > 3 * distinct(m0), 'bilinear: far more distinct densities than the cell read');
  assert.ok(distinct(m2) > 3 * distinct(m0), 'bicubic: far more distinct densities than the cell read');
  // the body must not vanish or explode: same order of magnitude as the legacy count
  for (const m of [m1, m2]) assert.ok(m.length > 0.5 * m0.length && m.length < 1.5 * m0.length);
});

ok('D: bedrock is never seated, in any mode; inputs untouched', () => {
  const blocked = new Uint8Array(96 * 54);
  for (let j = 20; j < 34; j++) for (let i = 30; i < 66; i++) blocked[j * 96 + i] = 1;
  const pk = packFieldDensity(density, blocked);
  const frozen = Uint8Array.from(pk);
  for (const recon of [0, 1, 2]) {
    const seats = fieldBodySeatModel(pk, 1234567, 8192, 36, { recon });
    assert.ok(
      seats.every((s) => !blocked[s.cell]),
      `mode ${recon}: no seat in bedrock`,
    );
    assert.ok(seats.length > 0);
  }
  assert.deepEqual(pk, frozen);
});

console.log(`fieldRecon.selfcheck: OK (${n} groups) — #2182 WS3`);
