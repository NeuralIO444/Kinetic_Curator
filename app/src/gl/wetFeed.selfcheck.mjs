// #970 slices 2–3 — wet feed adds, dry path is the old program.
// No GL. The CPU mirror covers the offset and the drying tell.
import assert from 'node:assert';
import {
  accumRecipeParams,
  FADE_FS,
  FADE_WET_FS,
  FEED_FS,
  FEED_WET_FS,
  GLOW_FS,
  GLOW_WET_FS,
  OVER_FS,
  OVER_WET_FS,
  mirrorAccumStep,
} from './accum.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('dry feed shader is unchanged and does not sample the velocity texture', () => {
  assert.doesNotMatch(FEED_FS, /u_wetVel/);
  assert.doesNotMatch(FADE_FS, /u_wetMask/);
  assert.doesNotMatch(GLOW_FS, /u_wetMask/);
});

ok('wet feed adds an offset and does not replace the curl lookup', () => {
  assert.match(FEED_WET_FS, /advect \* u_flow/);
  assert.match(FEED_WET_FS, /tuv \+= wet \* u_wetGain/);
  assert.match(FEED_WET_FS, /u_wetVel/);
});

ok('wet fade and glow darken the drying edge and grain the paper', () => {
  assert.match(FADE_WET_FS, /edge \* u_wetAmount/);
  assert.match(FADE_WET_FS, /ihashWet/);
  assert.match(GLOW_WET_FS, /u_wetMask/);
  assert.match(GLOW_WET_FS, /paper - 0\.5/);
});

ok('recipe gate is integer: dry gain is exactly 0', () => {
  const dry = accumRecipeParams({ wetStep: 0, wetGain: 0.2, wetAmount: 0.5 });
  assert.strictEqual(dry.wetStep, 0);
  assert.strictEqual(dry.wetGain, 0);
  assert.strictEqual(dry.wetAmount, 0);
  assert.strictEqual(dry.wetVel, null);
  const wet = accumRecipeParams({ wetStep: 1, wetGain: 0.01, wetAmount: 0.4 });
  assert.strictEqual(wet.wetStep, 1);
  assert.strictEqual(wet.wetGain, 0.01);
  assert.strictEqual(wet.wetAmount, 0.4);
});

ok('dry mirror matches a step that never heard of wetness', () => {
  const w = 4, h = 4;
  const accum = new Float64Array(w * h * 4).fill(0.2);
  const frame = new Float64Array(w * h * 4).fill(0);
  const base = accumRecipeParams({ fade: 0.5 });
  const named = accumRecipeParams({ fade: 0.5, wetStep: 0, wetGain: 0.2 });
  const a = mirrorAccumStep({ accum, frame, w, h, params: base });
  const b = mirrorAccumStep({ accum, frame, w, h, params: named });
  for (let i = 0; i < a.length; i++) assert.strictEqual(a[i], b[i]);
});

ok('wet mirror moves a mark and darkens a half-dry edge', () => {
  const w = 8, h = 8;
  const accum = new Float64Array(w * h * 4);
  accum[(3 * w + 3) * 4] = 1;
  const frame = new Float64Array(w * h * 4);
  const vel = { n: 2, rgba: new Uint8Array(16) };
  for (let i = 0; i < 4; i++) {
    vel.rgba[i * 4] = 255;
    vel.rgba[i * 4 + 3] = 255;
  }
  const mask = { n: 2, rgba: new Uint8Array(16) };
  mask.rgba[0] = 128;
  mask.rgba[3] = 255;
  const dry = mirrorAccumStep({
    accum, frame, w, h,
    params: accumRecipeParams({ fade: 1 }),
  });
  const moved = mirrorAccumStep({
    accum, frame, w, h,
    params: accumRecipeParams({
      fade: 1, wetStep: 1, wetGain: 0.5, wetAmount: 0, wetVel: vel, wetMask: mask,
    }),
  });
  assert.notStrictEqual(moved[(3 * w + 3) * 4], dry[(3 * w + 3) * 4], 'wet offset moved the sample');
  const edged = mirrorAccumStep({
    accum: new Float64Array(w * h * 4).fill(0.8),
    frame, w, h,
    params: accumRecipeParams({ fade: 1, wetStep: 1, wetGain: 0, wetAmount: 1, wetVel: vel, wetMask: mask }),
  });
  assert.ok(edged[0] < 0.8, `drying edge darkened (${edged[0]})`);
});

ok('dry over does not mix; wet over makes a third color', () => {
  assert.doesNotMatch(OVER_FS, /u_wetMask/);
  assert.match(OVER_WET_FS, /pigment/);
  const w = 2, h = 2;
  const frame = new Float64Array(w * h * 4);
  const accum = new Float64Array(w * h * 4);
  // Incoming blue over resident red, both opaque.
  frame[2] = 1; frame[3] = 1;
  accum[0] = 1; accum[3] = 1;
  const mask = { n: 2, rgba: new Uint8Array(16) };
  mask.rgba[0] = 255; mask.rgba[3] = 255;
  const dry = mirrorAccumStep({
    accum, frame, w, h,
    params: accumRecipeParams({ fade: 1 }),
  });
  const mixed = mirrorAccumStep({
    accum, frame, w, h,
    params: accumRecipeParams({
      fade: 1, wetStep: 1, wetGain: 0, wetAmount: 1, wetVel: mask, wetMask: mask,
    }),
  });
  // Dry source-over keeps the incoming blue.
  assert.ok(dry[2] > 0.9 && dry[0] < 0.05, `dry stayed blue (${dry[0]}, ${dry[2]})`);
  // Wet mix is neither pure blue nor white.
  assert.ok(mixed[0] > dry[0] + 0.05 && mixed[2] > 0.4, `mix kept both pigments (${mixed[0]}, ${mixed[2]})`);
  assert.ok(mixed[0] + mixed[1] + mixed[2] < 2.2, 'mix did not stack toward white');
});

console.log(`wetFeed.selfcheck: ${n} checks passed`);
