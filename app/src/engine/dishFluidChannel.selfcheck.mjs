// dishFluidChannel.selfcheck.mjs — FERROFLUID #2178: the GPU field-body channel's law.
//
// The channel seats the ferrofluid's pooled body in a vertex shader (gl/shaders.mjs
// FIELD_VS) from gl_InstanceID; this suite pins the JS side of that law — the module the
// shader is transcribed from (engine/dishFluidChannel.mjs):
//
//   - the seating hash is the kernel's hashU32 over the 'dish-fluid' channel, quantized to
//     the top 24 bits, and FLUID_CHANNEL_U32 is that channel's FNV value — the constant the
//     GLSL transcription mixes (a suite-side imul transcription proves the two agree);
//   - the density packing the renderer uploads (byte quantization is part of the law: the
//     shader gates on the byte, the model reads the same byte);
//   - the governor's budget ladder on the kernel's cut, the iPad start, and the sub-round
//     draw counts shedding spends;
//   - the seat model on a kernel-grown magnet field: deterministic, pinned count in the
//     Option B mockup's range at full budget, thinning monotonically down the ladder,
//     bedrock never seats, every seat inside its cell with a vocabulary index in range;
//   - the descriptor door (sanitizeFieldBody): fail-closed, the primitive fallback for an
//     absent pool, an explicitly empty pool seats nothing, budget snapping.
import assert from 'node:assert/strict';
import { hashU32, hashU01 } from './kernel/rng.js';
import {
  createFluid,
  stepFluid,
  fluidDensity,
  sanitizeMagnets,
  FLUID_GRID_COLS,
  FLUID_GRID_ROWS,
} from './dishFluid.mjs';
import {
  FIELD_BODY_SUB,
  FIELD_BODY_SEATS,
  FIELD_BODY_VOCAB_MAX,
  FIELD_BODY_BUDGETS,
  FIELD_BODY_STREAMS,
  FLUID_CHANNEL_U32,
  fieldBodyBudgetFor,
  fieldBodyRounds,
  fieldBodyDrawCount,
  fieldBodyHash01,
  fieldBodyFill,
  fieldBodyScaleBase,
  packFieldDensity,
  fieldBodySeatModel,
  sanitizeFieldBody,
} from './dishFluidChannel.mjs';
import { MATTER_DENSITY_FLOOR, FLUID_PRIMITIVE_ASSETS } from './dishFluidRender.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const N = FLUID_GRID_COLS * FLUID_GRID_ROWS;

console.log('dishFluidChannel — the GPU field-body channel law (#2178)');

ok('the seating hash is hashU32 over the dish-fluid channel, top-24 quantized', () => {
  // the GLSL transcription, written out in imul arithmetic over the pinned constant
  const glsl = (seed, index) => {
    let h = (seed | 0) ^ Math.imul(FLUID_CHANNEL_U32 | 0, 0x9e3779b9) ^ Math.imul(index | 0, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h = h ^ (h >>> 16);
    return h >>> 0 || 1;
  };
  for (const seed of [0, 1, 1234567, 3530316206, 4294967295]) {
    for (const stream of Object.values(FIELD_BODY_STREAMS)) {
      for (const seat of [0, 1, 419, 5183, 46655]) {
        const idx = stream + seat;
        assert.equal(glsl(seed, idx), hashU32(seed, 'dish-fluid', idx), `hashU32 transcription at ${seed}/${idx}`);
        assert.equal(fieldBodyHash01(seed, stream, seat), (glsl(seed, idx) >>> 8) / 0x1000000, 'quantized draw');
        const v = fieldBodyHash01(seed, stream, seat);
        assert.ok(v >= 0 && v < 1, 'draw in [0, 1)');
      }
    }
  }
  // the unquantized kernel draw is the same stream (hashU01 divides the same word)
  assert.equal(hashU01(42, 'dish-fluid', 7), hashU32(42, 'dish-fluid', 7) / 4294967296);
});

ok('packFieldDensity quantizes to bytes and flags bedrock in G', () => {
  const density = new Float32Array(N).fill(0);
  density[0] = 1;
  density[1] = 0.5;
  density[2] = 0.25;
  density[3] = -1;
  density[4] = 2;
  const blocked = new Uint8Array(N);
  blocked[1] = 1;
  const packed = packFieldDensity(density, blocked);
  assert.equal(packed.length, N * 2);
  assert.equal(packed[0], 255);
  assert.equal(packed[2], 128); // 0.5 rounds to 128 — the byte the shader gates on
  assert.equal(packed[4], 64); // 0.25
  assert.equal(packed[6], 0); // clamped below
  assert.equal(packed[8], 255); // clamped above
  assert.equal(packed[3], 255); // bedrock flag on cell 1
  assert.equal(packed[1], 0);
  assert.deepEqual(packFieldDensity(null), new Uint8Array(N * 2), 'no density packs as zeros (fail-closed)');
  assert.deepEqual(packFieldDensity(new Float32Array(4)), new Uint8Array(N * 2), 'wrong length packs as zeros');
});

ok('the budget ladder rides the kernel cut; iPad starts one rung down', () => {
  assert.deepEqual(FIELD_BODY_BUDGETS, [8192, 4096, 2048, 1024, 0]);
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => fieldBodyBudgetFor(r, false)),
    [8192, 8192, 8192, 8192, 4096, 2048, 1024, 1024, 1024, 1024],
  );
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => fieldBodyBudgetFor(r, true)),
    [4096, 4096, 4096, 4096, 2048, 1024, 1024, 1024, 1024, 1024],
    'iPad starts at 4096 and floors at 1024 — the ladder 0 is not a governor value',
  );
  assert.equal(fieldBodyBudgetFor(undefined), 8192, 'an unreadable rung is the top of the ladder');
  assert.equal(fieldBodyBudgetFor(99), 1024, 'rungs clamp to the last kernel rung');
});

ok('budgets spend in whole sub-rounds; the draw count follows', () => {
  assert.equal(FIELD_BODY_SUB, 3);
  assert.equal(FIELD_BODY_SEATS, 46656);
  assert.deepEqual(
    FIELD_BODY_BUDGETS.map((b) => fieldBodyRounds(b)),
    [9, 5, 3, 2, 0],
  );
  assert.deepEqual(
    FIELD_BODY_BUDGETS.map((b) => fieldBodyDrawCount(b)),
    [46656, 25920, 15552, 10368, 0],
  );
  assert.equal(fieldBodyRounds(0), 0);
  assert.equal(fieldBodyRounds(-4), 0);
  assert.equal(fieldBodyRounds(1), 1, 'any positive budget buys at least one round');
});

ok('the fill law and the stamp scale law keep the retired body’s measures', () => {
  assert.equal(fieldBodyFill(MATTER_DENSITY_FLOOR), 0);
  assert.equal(fieldBodyFill(MATTER_DENSITY_FLOOR + 0.18), 1);
  assert.ok(Math.abs(fieldBodyFill(MATTER_DENSITY_FLOOR + 0.09) - 0.5) < 1e-12);
  assert.equal(fieldBodyFill(0), 0);
  // (0.6 × min(20, 20)) / (0.05 × 1080) at 1920×1080
  assert.ok(Math.abs(fieldBodyScaleBase(1920, 1080) - 12 / 54) < 1e-12);
  assert.equal(fieldBodyScaleBase(0, 1080), 0);
  assert.equal(fieldBodyScaleBase(1920, 0), 0);
});

// A kernel-grown magnet field — the calibration field: two magnets, 600 steps.
const magnets = sanitizeMagnets([
  { x: 0.5, y: 0.5 },
  { x: 0.25, y: 0.3 },
]);
const fluid = createFluid({ cols: FLUID_GRID_COLS, rows: FLUID_GRID_ROWS, seedKey: 1234567, magnets });
for (let i = 0; i < 600; i++) stepFluid(fluid, { magnets });
const density = fluidDensity(fluid);
const packed = packFieldDensity(density, null);

ok('the seat model on a grown field: pinned count in the mockup range, deterministic', () => {
  const seats = fieldBodySeatModel(packed, 1234567, 8192, 36);
  assert.equal(seats.length, 7690, 'the pinned piece count on the calibration field (Option B range)');
  assert.deepEqual(fieldBodySeatModel(packed, 1234567, 8192, 36), seats, 'same inputs, same seats');
  assert.notDeepEqual(fieldBodySeatModel(packed, 7654321, 8192, 36), seats, 'the cycle seed keys the seating');
  const first = seats[0];
  assert.deepEqual(
    { cell: first.cell, sub: first.sub, vocab: first.vocab },
    { cell: 419, sub: 0, vocab: 10 },
    'the first seat, pinned',
  );
  for (const s of seats) {
    assert.ok(s.d >= MATTER_DENSITY_FLOOR, 'every seat stands over the floor');
    assert.ok(s.vocab >= 0 && s.vocab < 36, 'vocabulary index in range');
    const cx = s.cell % FLUID_GRID_COLS;
    const cy = (s.cell - cx) / FLUID_GRID_COLS;
    assert.ok(s.nx >= cx / FLUID_GRID_COLS && s.nx < (cx + 1) / FLUID_GRID_COLS, 'seat inside its cell (x)');
    assert.ok(s.ny >= cy / FLUID_GRID_ROWS && s.ny < (cy + 1) / FLUID_GRID_ROWS, 'seat inside its cell (y)');
    assert.ok(s.rotation >= 0 && s.rotation < 360);
    assert.ok(s.scaleF >= 0.45 && s.scaleF <= 1);
  }
});

ok('the ladder thins the body monotonically; bedrock never seats; budget 0 seats nothing', () => {
  assert.equal(fieldBodySeatModel(packed, 1234567, 4096, 36).length, 4331);
  assert.equal(fieldBodySeatModel(packed, 1234567, 2048, 36).length, 2601);
  assert.equal(fieldBodySeatModel(packed, 1234567, 1024, 36).length, 1741);
  assert.equal(fieldBodySeatModel(packed, 1234567, 0, 36).length, 0);
  const blocked = new Uint8Array(N).fill(1);
  assert.equal(
    fieldBodySeatModel(packFieldDensity(density, blocked), 1234567, 8192, 36).length,
    0,
    'all bedrock: no seats',
  );
  const oneBlocked = new Uint8Array(N);
  oneBlocked[419] = 1;
  const seats = fieldBodySeatModel(packFieldDensity(density, oneBlocked), 1234567, 8192, 36);
  assert.ok(
    seats.every((s) => s.cell !== 419),
    'a blocked cell contributes no seats',
  );
  assert.ok(seats.length < 7690);
  assert.equal(fieldBodySeatModel(packed, 1234567, 8192, 0).length, 0, 'no vocabulary, no body');
  assert.equal(fieldBodySeatModel(null, 1234567, 8192, 36).length, 0);
});

ok('sanitizeFieldBody: the descriptor door, fail-closed', () => {
  assert.equal(sanitizeFieldBody(null), null);
  assert.equal(sanitizeFieldBody({}), null);
  assert.equal(sanitizeFieldBody({ layerId: '', poolIds: ['a'], scaleBase: 0.2 }), null);
  assert.equal(
    sanitizeFieldBody({ layerId: 'L', poolIds: [], scaleBase: 0.2 }),
    null,
    'an explicitly empty pool seats nothing',
  );
  assert.equal(sanitizeFieldBody({ layerId: 'L', poolIds: ['a'], scaleBase: 0 }), null);
  assert.equal(sanitizeFieldBody({ layerId: 'L', poolIds: ['a'], scaleBase: NaN }), null);
  const fb = sanitizeFieldBody({ layerId: 'L', poolIds: null, ink: '#ABCDEF', seedKey: 42, scaleBase: 0.2 });
  assert.deepEqual(fb.vocab, [...FLUID_PRIMITIVE_ASSETS], 'no pool at all → the primitive seed shapes');
  assert.equal(fb.ink, '#abcdef');
  assert.equal(fb.floor, MATTER_DENSITY_FLOOR);
  assert.equal(fb.budget, 8192);
  assert.equal(fb.seedKey, 42);
  const many = Array.from({ length: 200 }, (_, i) => `a${i % 150}`);
  const capped = sanitizeFieldBody({ layerId: 'L', poolIds: many, scaleBase: 0.2, budget: 5000 });
  assert.equal(capped.vocab.length, FIELD_BODY_VOCAB_MAX, 'deduped and capped at 96');
  assert.equal(capped.budget, 4096, 'budget snaps down the ladder');
  assert.equal(sanitizeFieldBody({ layerId: 'L', poolIds: ['a'], scaleBase: 0.2, budget: 500 }).budget, 1024);
  assert.equal(sanitizeFieldBody({ layerId: 'L', poolIds: ['a'], scaleBase: 0.2, budget: 0 }).budget, 0);
  assert.equal(sanitizeFieldBody({ layerId: 'L', poolIds: ['a'], scaleBase: 0.2, ink: 'red' }).ink, '#000000');
});

console.log(`dishFluidChannel.selfcheck: ok (${n} groups)`);
