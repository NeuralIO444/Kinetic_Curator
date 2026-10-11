// node src/engine/kernel/replay/inputLog.selfcheck.mjs
// #1353 step 2 — the input log is EXACT: values, undefined vs null vs absent, typed arrays, and identity.
import assert from 'node:assert/strict';
import { encode, decode, createInputLog, replayInputs, INPUT_LOG_VERSION } from './inputLog.js';

// 1. every value round-trips bit for bit through JSON text
{
  const tricky = {
    a: 0.1 + 0.2, b: -0, c: NaN, d: Infinity, e: -Infinity, f: 5e-324, g: 1.7976931348623157e308, h: 2 ** 53 + 2,
    n: null, u: undefined, s: 'x"\\\n', t: true, arr: [1, [2, { z: -0 }], undefined, null],
    f32: new Float32Array([1.5, -0, NaN]), u8: new Uint8Array([0, 255]), f64: new Float64Array([Math.PI]),
    $dollar: 1, $$two: { $u: 1 }, nested: { $n: 'NaN', $t: 'x', $p: 1, $s: 1 },
  };
  const back = decode(JSON.parse(JSON.stringify(encode(tricky))));
  for (const k of ['a', 'f', 'g', 'h']) assert.ok(Object.is(back[k], tricky[k]), `${k} is bit-exact`);
  assert.ok(Object.is(back.b, -0), '-0 survives');
  assert.ok(Number.isNaN(back.c) && back.d === Infinity && back.e === -Infinity);
  assert.equal(back.n, null);
  assert.ok('u' in back && back.u === undefined, 'undefined is kept, and is not null');
  assert.equal(back.s, tricky.s);
  assert.ok(back.arr[2] === undefined && back.arr[3] === null && Object.is(back.arr[1][1].z, -0));
  assert.ok(back.f32 instanceof Float32Array && back.f32[0] === 1.5 && Object.is(back.f32[1], -0) && Number.isNaN(back.f32[2]));
  assert.ok(back.u8 instanceof Uint8Array && back.u8[1] === 255);
  assert.ok(back.f64 instanceof Float64Array && back.f64[0] === Math.PI);
  assert.equal(back.$dollar, 1, 'keys that start with $ do not collide with the escapes');
  assert.deepEqual(back.$$two, { $u: 1 });
  assert.deepEqual(back.nested, { $n: 'NaN', $t: 'x', $p: 1, $s: 1 }, 'a real object shaped like an escape stays itself');
  assert.throws(() => encode({ f: () => 1 }), /cannot be part of a recorded input/);
  assert.throws(() => encode(new Map()), /cannot record/);
}

// 2. record → JSON text → replay gives the same input sequence, with the same identity pattern
{
  const layers = [{ id: 'a' }];
  const lp = { mode: 'grid', count: 10, scale: [0.4, 0.8] };
  const frames = [
    { seed: 1, layers, layoutParams: lp, dtSec: 0.0167, attractor: null, maybe: undefined },
    { seed: 1, layers, layoutParams: lp, dtSec: 0.0333, attractor: null, maybe: undefined }, // only dt changed
    { seed: 1, layers, layoutParams: { ...lp }, dtSec: 0.0333, attractor: null, maybe: undefined }, // new object, same value
    { seed: 2, layers, layoutParams: { ...lp, count: 11, extra: 1 }, dtSec: 0.0333, attractor: { x: 1, y: 2 } }, // 'maybe' removed
    { seed: 2, layers: [{ id: 'a' }, { id: 'b' }], layoutParams: { mode: 'grid', count: 11, scale: [0.4, 0.8] }, dtSec: 0.008, attractor: null },
  ];
  const log = createInputLog();
  for (const f of frames) log.record(f);
  const text = JSON.stringify(log.finish());
  const out = [...replayInputs(JSON.parse(text))];
  assert.equal(out.length, frames.length);
  for (let i = 0; i < frames.length; i++) {
    assert.deepEqual(out[i], frames[i], `frame ${i} is the same input`);
    assert.deepEqual(Object.keys(out[i]).sort(), Object.keys(frames[i]).sort(), `frame ${i} has the same keys (undefined kept, removed gone)`);
  }
  // identity: what stayed the same object live stays the same object on replay; what changed is a new object
  for (let i = 1; i < frames.length; i++) {
    for (const key of Object.keys(frames[i])) {
      if (!(key in frames[i - 1])) continue;
      assert.equal(Object.is(out[i][key], out[i - 1][key]), Object.is(frames[i][key], frames[i - 1][key]),
        `frame ${i} "${key}": identity ${Object.is(frames[i][key], frames[i - 1][key]) ? 'kept' : 'changed'} as in the live run`);
    }
  }
  // the log is a delta: an unchanged frame costs almost nothing, and a one-key change does not re-store the object
  const parsed = JSON.parse(text);
  assert.equal(parsed.version, INPUT_LOG_VERSION);
  assert.deepEqual(Object.keys(parsed.steps[1].k), ['dtSec'], 'frame 1 stored only dt');
  assert.deepEqual(parsed.steps[2].k, { layoutParams: { $s: 1 } }, 'same value, new object = a one-token marker');
  assert.deepEqual(parsed.steps[3].k.layoutParams, { $p: { count: 11, extra: 1 }, $d: [] }, 'a patch, not the whole object');
  assert.deepEqual(parsed.steps[3].x, ['maybe']);
  assert.deepEqual(parsed.steps[4].k.layoutParams, { $p: {}, $d: ['extra'] });
}

// 3. replay hands out fresh objects (mutating a replayed frame cannot corrupt a later one) and rejects junk
{
  const log = createInputLog();
  const shared = { v: [1, 2] };
  log.record({ a: shared });
  log.record({ a: shared });
  const it = replayInputs(log.finish());
  const f0 = it.next().value;
  f0.a.v.push(99);
  const f1 = it.next().value;
  assert.ok(Object.is(f1.a, f0.a), 'same identity as live (the object was shared)');
  assert.throws(() => [...replayInputs({ version: 99, steps: [] })], /unsupported log/);
  assert.throws(() => createInputLog().record([]), /plain object/);
}

console.log('inputLog.selfcheck: ok (#1353 step 2)');
