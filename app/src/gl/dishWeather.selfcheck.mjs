// node src/gl/dishWeather.selfcheck.mjs
// #1183 weather slice 1 — the connection: which FX layer's haze is a layer's air, and that the
// air arrives only when asked. Dial 0 (or no haze above) returns the same frozen empty object,
// so the frame is byte-identical. Mirrors gl/dishGround.selfcheck.mjs.
import assert from 'node:assert/strict';
import { nearestWeatherAbove, weatherArgs, HAZE_AIR_ID, AIR_DRIFT_PER_SEC } from './dishWeather.mjs';
import { createResolverDish } from './dishGround.mjs';
import { WEATHER } from '../engine/kernel/weather/registry.js';
import { registryCounts } from '../panels/kernelTiles.mjs';
import { hazeVeilHex } from '../engine/weatherAir.mjs';

const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const FX = (id, effects) => L(id, { type: 'fx', effects });
const HAZE = (amount = 0.35, lift = 0.5) => ({ kind: 'haze', params: { amount, lift } });
const GRAIN = { kind: 'grain', params: { amount: 0.4 } };

// 1. WHICH weather: the nearest visible FX layer ABOVE the layer (bottom -> top) carrying haze
//    with amount > 0 (Matt's Q2 ruling) — never one below, never a non-FX layer.
{
  const stack = [L('a'), FX('fx-low', [HAZE(0.2)]), L('b'), FX('fx-high', [HAZE(0.9)]), L('c')];
  assert.strictEqual(nearestWeatherAbove(stack, 'a').layer.id, 'fx-low');
  assert.strictEqual(nearestWeatherAbove(stack, 'a').haze.amount, 0.2);
  assert.strictEqual(nearestWeatherAbove(stack, 'b').layer.id, 'fx-high', 'the nearest above, not the topmost');
  assert.strictEqual(nearestWeatherAbove(stack, 'c'), null, 'no FX above the top layer');
  assert.strictEqual(nearestWeatherAbove([FX('fx-below', [HAZE()]), L('a')], 'a'), null, 'haze below is not weather');
  assert.strictEqual(nearestWeatherAbove([L('a'), FX('fx', [GRAIN])], 'a'), null, 'an FX layer without haze is not weather');
  assert.strictEqual(
    nearestWeatherAbove([L('a'), FX('fx-grain', [GRAIN]), FX('fx-haze', [HAZE()])], 'a').layer.id,
    'fx-haze',
    'a non-haze FX layer above does not block a higher hazy one',
  );
  assert.strictEqual(
    nearestWeatherAbove([L('a'), L('m', { type: 'math', effects: [HAZE()] })], 'a'),
    null,
    'a MATH layer is not an FX layer, whatever its list holds',
  );
  const hidden = [L('a'), { ...FX('fx-hidden', [HAZE(0.8)]), visible: false }, FX('fx-vis', [HAZE(0.3)])];
  assert.strictEqual(nearestWeatherAbove(hidden, 'a').layer.id, 'fx-vis', 'a hidden FX layer is not weather');
  assert.strictEqual(nearestWeatherAbove([L('a'), FX('fx', [HAZE(0)])], 'a'), null, 'haze at amount 0 is not weather');
  assert.strictEqual(nearestWeatherAbove(stack, 'nope'), null);
  assert.strictEqual(nearestWeatherAbove(null, 'a'), null);
}

// 2. The gates: every inactive shape returns the SAME frozen empty object — nothing is passed
//    to buildPlacements, nothing is built, the frame is byte-identical.
{
  const layers = [L('a'), FX('fx', [HAZE()])];
  const none = weatherArgs({ dish: createResolverDish(), layers, layerId: 'a', air: 0, W: 1000, H: 700, tSec: 0, seed: 7 });
  assert.ok(Object.isFrozen(none) && Object.keys(none).length === 0, 'dial 0 -> frozen NONE');
  for (const args of [
    { layers, layerId: 'a', air: undefined },
    { layers, layerId: 'a', air: Number.NaN },
    { layers: [L('a')], layerId: 'a', air: 1 },
    { layers: [L('a'), FX('fx', [GRAIN])], layerId: 'a', air: 1 },
    { layers: [L('a'), FX('fx', [HAZE(0)])], layerId: 'a', air: 1 },
    { layers, layerId: 'missing', air: 1 },
  ]) {
    const out = weatherArgs({ dish: createResolverDish(), W: 1000, H: 700, tSec: 0, seed: 7, ...args });
    assert.strictEqual(out, none, `inactive shape returns the same NONE: ${JSON.stringify(Object.keys(args))}`);
  }
  assert.strictEqual(
    weatherArgs({ dish: null, layers, layerId: 'a', air: 1, W: 1000, H: 700, tSec: 0, seed: 7 }),
    none,
    'no dish -> NONE',
  );
}

// 3. Active: the effective strength is the haze's own amount × the layer's dial (Q2/Q4), the
//    veil is the haze builders' colour at the layer's lift, and dish.air samples the mist.
{
  const layers = [L('a'), FX('fx', [HAZE(0.35, 0.5)])];
  const dish = createResolverDish();
  const args = weatherArgs({ dish, layers, layerId: 'a', air: 0.5, W: 1000, H: 700, tSec: 3.2, seed: 1234, seedOffsets: null });
  assert.strictEqual(args.air, 0.175, 'strength = amount × dial');
  assert.strictEqual(args.airVeil, hazeVeilHex(0.5));
  assert.strictEqual(args.airVeil, '#a6a6a6');
  assert.strictEqual(args.dish, dish, 'the same dish, with air set on it');
  assert.strictEqual(typeof dish.air, 'function');
  for (let k = 0; k < 64; k++) {
    const v = dish.air((k % 8) * 125, Math.floor(k / 8) * 87.5);
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `mist sample in range: ${v}`);
  }
  const full = weatherArgs({ dish: createResolverDish(), layers, layerId: 'a', air: 1, W: 1000, H: 700, tSec: 3.2, seed: 1234, seedOffsets: null });
  assert.strictEqual(full.air, 0.35, 'dial 1 passes the haze amount through');
}

// 4. Determinism and drift: same seed + same loop time -> the same fade array twice (a take
//    replays exactly); a later loop time is a different mist (Q5: it drifts, slowly).
{
  const fadeOf = (tSec) => {
    const dish = createResolverDish();
    const args = weatherArgs({ dish, layers: [L('a'), FX('fx', [HAZE()])], layerId: 'a', air: 1, W: 1000, H: 700, tSec, seed: 42, seedOffsets: null });
    const fade = new Float32Array(64);
    for (let k = 0; k < 64; k++) fade[k] = args.air * dish.air((k % 8) * 125, Math.floor(k / 8) * 87.5);
    return fade;
  };
  assert.deepStrictEqual([...fadeOf(3.2)], [...fadeOf(3.2)], 'same seed + time, same fades');
  assert.notDeepStrictEqual([...fadeOf(3.2)], [...fadeOf(3.2 + 1 / AIR_DRIFT_PER_SEC)], 'the mist has moved on');
}

// 5. The registry: haze-air is the WEATHER registry's first module, declared tier 1, and the
//    kernel roster counts it (weather: 1) with zero panel changes.
{
  assert.deepStrictEqual(WEATHER.list(), [HAZE_AIR_ID]);
  const decl = WEATHER.get(HAZE_AIR_ID);
  assert.strictEqual(decl.family, 'weather');
  assert.strictEqual(decl.costTier, 1, 'the weather response declares tier 1');
  assert.deepStrictEqual(decl.reads, ['fx.haze']);
  assert.deepStrictEqual(decl.writes, ['fields.air']);
  assert.strictEqual(typeof decl.create, 'function');
  const field = decl.create(7, { z: 0 });
  assert.strictEqual(field.kind, 'noise');
  const v = field.sample(0.5, 0.5);
  assert.ok(v >= 0 && v <= 1, 'the created field samples in range');
  assert.deepStrictEqual(registryCounts(), [
    { family: 'field', n: 6 },
    { family: 'weather', n: 1 },
    { family: 'feature', n: 0 },
  ]);
}

console.log('gl/dishWeather.selfcheck: ok');
