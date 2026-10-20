// node src/engine/kernel/replay/inputLog.selfcheck.mjs
// #1353 step 2 — the input log is EXACT: values, undefined vs null vs absent, typed arrays, and identity.
import assert from 'node:assert/strict';
import { encode, decode, createInputLog, replayInputs, rebaseInputLog, INPUT_LOG_VERSION } from './inputLog.js';

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

// #1367 — rebase: a log cut at a frame boundary replays exactly the original's suffix
{
  // a stream exercising every step kind: full values, shallow patches, identity-only changes,
  // key removals, undefined values, typed arrays
  const shared = { deep: [1, 2, 3] };
  const frames = [];
  for (let f = 0; f < 40; f++) {
    const input = {
      n: f * 1.5, s: `f${f >> 2}`, keep: shared, u: undefined,
      patch: { a: f, b: 'x', c: f % 3 },
      f32: new Float32Array([f, -0]),
    };
    if (f % 5 === 4) input.patch = { a: f, b: 'x' }; // sub-key deleted via patch
    if (f >= 20) delete input.s; // top-level key removed mid-stream
    if (f === 25) input.extra = { late: true }; // and one added
    frames.push(input);
  }
  const log = createInputLog();
  for (const fr of frames) log.record(fr);
  const fin = log.finish();
  const canon = (v) => JSON.stringify(encode(v));
  const whole = [...replayInputs(fin)].map(canon);
  for (const at of [1, 7, 19, 20, 25, 39]) {
    const rebased = rebaseInputLog(fin, at);
    assert.equal(rebased.frames, 40 - at, `rebased at ${at}: frame count`);
    const suffix = [...replayInputs(rebased)].map(canon);
    assert.deepEqual(suffix, whole.slice(at), `rebased at ${at}: the suffix replays exactly`);
  }
  assert.deepEqual([...replayInputs(rebaseInputLog(fin, 0))].map(canon), whole, 'rebase at 0 is the whole log');
  assert.throws(() => rebaseInputLog(fin, 40), /cannot rebase/, 'past the end refuses');
  assert.throws(() => rebaseInputLog(fin, -1), /cannot rebase/);
  assert.throws(() => rebaseInputLog({ version: 99, steps: [] }, 0), /unsupported log/);

  // dropBefore: the same cut, in place, and recording continues seamlessly afterwards
  const live = createInputLog();
  for (const fr of frames) live.record(fr);
  live.dropBefore(20);
  assert.equal(live.frames, 20, 'the ring bound: history before the cut is gone');
  const more = { ...frames[39], n: 999, patch: { a: 100, b: 'y', c: 1 } };
  live.record(more);
  const reference = createInputLog();
  for (const fr of [...frames.slice(20), more]) reference.record(fr);
  const gotLive = [...replayInputs(live.finish())].map(canon);
  const gotRef = [...replayInputs(reference.finish())].map(canon);
  assert.deepEqual(gotLive, gotRef, 'after dropBefore, recording continues as if the log began at the cut');
  live.dropBefore(0);
  assert.equal(live.frames, 21, 'dropBefore(0) is a no-op');
}

console.log('inputLog.selfcheck: ok (#1353 step 2)');
