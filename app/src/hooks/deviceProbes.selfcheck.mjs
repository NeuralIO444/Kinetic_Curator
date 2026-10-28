// node src/hooks/deviceProbes.selfcheck.mjs — #1578 runtime device probes:
// descriptor shape, absent-on-failure, cache versioning, no fake numbers.
// Runs in Node (no DOM, no WebGL2) on purpose: that IS the failure
// environment, and the module's honesty law is what gets pinned here —
// the GPU probes must come back absent, the JS probe must really measure.
import assert from 'node:assert';
import {
  PROBE_KEYS,
  DEVICE_PROBES_KEY,
  DEVICE_PROBES_VERSION,
  PROBE_TIME_BUDGET_MS,
  DEVICE_PROBE_SPEC,
  sanitizeProbeBag,
  readCachedProbes,
  writeCachedProbes,
  timeBatches,
  jsProbeBatch,
  measureDeviceProbes,
  getDeviceProbes,
} from './deviceProbes.mjs';
import { PROBE_SPEC } from '../gl/parity/costDataset.mjs';
import { COST_HEAD_KIND, COST_OBJECTIVE, validateCostModel, predictMs, costFeatures } from './costHead.mjs';

// — the work spec is the dataset's PROBE_SPEC, verbatim (harness rows and
//   runtime probes stay comparable only while these copies agree) —
assert.deepStrictEqual(DEVICE_PROBE_SPEC, PROBE_SPEC, 'probe work spec must match costDataset PROBE_SPEC');
assert.deepStrictEqual([...PROBE_KEYS], ['fillRate', 'instanced', 'blend', 'js'], 'bag keys are the dataset names');
assert.ok(PROBE_TIME_BUDGET_MS > 0 && PROBE_TIME_BUDGET_MS <= 5000, 'probe pass has a small bounded budget');

// — sanitizeProbeBag: the honesty gate —
assert.deepStrictEqual(sanitizeProbeBag({ fillRate: 12.5, instanced: 3, blend: 8.75, js: 21 }), {
  fillRate: 12.5,
  instanced: 3,
  blend: 8.75,
  js: 21,
});
assert.deepStrictEqual(
  sanitizeProbeBag({ fillRate: 12.5, js: 'fast', renderer: 'Some GPU' }),
  { fillRate: 12.5 },
  'non-numbers and unknown keys are dropped, never carried',
);
for (const junk of [0, -1, NaN, Infinity, null, undefined, '12', true]) {
  assert.strictEqual(sanitizeProbeBag({ fillRate: junk }), null, `no descriptor is invented from ${String(junk)}`);
}
assert.strictEqual(sanitizeProbeBag(null), null);
assert.strictEqual(sanitizeProbeBag({}), null, 'an empty bag is no bag');
assert.strictEqual(sanitizeProbeBag('fillRate'), null);

// — timeBatches: warm-up discarded, median of reps, failure = absence —
{
  let clock = 0;
  const steps = [100, 10, 30, 20, 40, 50]; // warm-up (100) then 5 reps
  let call = 0;
  const now = () => clock;
  const fn = () => {
    clock += steps[call++];
  };
  assert.strictEqual(timeBatches(fn, { now }), 30, 'median of the 5 timed batches, warm-up excluded');
  assert.strictEqual(call, 6, 'exactly 1 warm-up + 5 reps ran');
}
assert.strictEqual(
  timeBatches(() => {}, { now: () => 42 }),
  null,
  'a zero-time median is not a measurement',
);
assert.strictEqual(
  timeBatches(() => {
    throw new Error('boom');
  }),
  null,
  'a throwing probe is absent, not an exception',
);
assert.strictEqual(
  timeBatches(() => 0, { now: () => NaN }),
  null,
  'a broken clock yields absence, not NaN descriptors',
);

// — the JS probe really runs in this environment —
assert.doesNotThrow(() => jsProbeBatch());
const jsOnly = timeBatches(jsProbeBatch);
assert.ok(typeof jsOnly === 'number' && jsOnly > 0, 'js probe measures a real positive ms in Node');

// — measureDeviceProbes in Node: GPU probes absent (no DOM/WebGL2),
//   JS probe present, nothing fabricated, never throws —
const measured = await measureDeviceProbes();
assert.deepStrictEqual(Object.keys(measured), ['js'], 'only honestly-measurable probes appear');
assert.ok(Number.isFinite(measured.js) && measured.js > 0);

// — budget: once the wall-clock budget is blown, later probes are
//   skipped (absent), not rushed —
{
  let calls = 0;
  const explodingNow = () => (calls++ === 0 ? 0 : 1e9);
  const bag = await measureDeviceProbes({ now: explodingNow });
  assert.deepStrictEqual(bag, {}, 'past the budget, every remaining probe is absent');
}

// — cache: round-trip, versioning, corruption, refusal to cache failure —
const memStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, v),
    _map: m,
  };
};
{
  const s = memStorage();
  assert.strictEqual(readCachedProbes(s), null, 'empty storage is a miss');
  assert.strictEqual(writeCachedProbes({ fillRate: 12.5, js: 21 }, s), true);
  assert.deepStrictEqual(readCachedProbes(s), { fillRate: 12.5, js: 21 }, 'cached bag round-trips');
  const rec = JSON.parse(s._map.get(DEVICE_PROBES_KEY));
  assert.strictEqual(rec.v, DEVICE_PROBES_VERSION, 'the record carries its version');

  const stale = memStorage();
  stale.setItem(DEVICE_PROBES_KEY, JSON.stringify({ v: DEVICE_PROBES_VERSION + 1, probes: { js: 1 } }));
  assert.strictEqual(readCachedProbes(stale), null, 'a version mismatch invalidates the cache');

  const corrupt = memStorage();
  corrupt.setItem(DEVICE_PROBES_KEY, '{not json');
  assert.strictEqual(readCachedProbes(corrupt), null, 'corrupt JSON is a miss, not a crash');

  const junk = memStorage();
  junk.setItem(DEVICE_PROBES_KEY, JSON.stringify({ v: DEVICE_PROBES_VERSION, probes: { js: -3, gpu: 'x' } }));
  assert.strictEqual(readCachedProbes(junk), null, 'a record of junk probes is a miss');
}
assert.strictEqual(writeCachedProbes({}, memStorage()), false, 'an empty result is never cached');
assert.strictEqual(writeCachedProbes({ js: NaN }, memStorage()), false, 'a fake number is never cached');
{
  const hostile = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
  };
  assert.strictEqual(readCachedProbes(hostile), null, 'throwing storage reads as a miss');
  assert.strictEqual(writeCachedProbes({ js: 5 }, hostile), false, 'throwing storage writes as unpersisted');
}

// — getDeviceProbes: cache first, measure once, failures not frozen —
{
  const s = memStorage();
  let measureCalls = 0;
  const fakeMeasure = async () => {
    measureCalls += 1;
    return { fillRate: 9.5, instanced: 2.5, blend: 6.5, js: 18 };
  };
  const first = await getDeviceProbes({ storage: s, measure: fakeMeasure });
  assert.deepStrictEqual(first, { fillRate: 9.5, instanced: 2.5, blend: 6.5, js: 18 });
  const second = await getDeviceProbes({ storage: s, measure: fakeMeasure });
  assert.deepStrictEqual(second, first);
  assert.strictEqual(measureCalls, 1, 'the second call is served from cache — probes do not re-run per load');
  const forced = await getDeviceProbes({ storage: s, measure: fakeMeasure, force: true });
  assert.deepStrictEqual(forced, first);
  assert.strictEqual(measureCalls, 2, 'force re-measures');

  const s2 = memStorage();
  s2.setItem(DEVICE_PROBES_KEY, JSON.stringify({ v: DEVICE_PROBES_VERSION + 99, probes: { js: 1 } }));
  let remeasured = 0;
  await getDeviceProbes({
    storage: s2,
    measure: async () => {
      remeasured += 1;
      return { js: 7 };
    },
  });
  assert.strictEqual(remeasured, 1, 'a stale-version cache re-measures');
  assert.deepStrictEqual(readCachedProbes(s2), { js: 7 }, 'and the fresh bag replaces it');

  const s3 = memStorage();
  const failed = await getDeviceProbes({ storage: s3, measure: async () => ({}) });
  assert.deepStrictEqual(failed, {}, 'total probe failure resolves to an empty bag');
  assert.strictEqual(readCachedProbes(s3), null, 'and is not cached — the next launch retries');
}

// — the contract costHead actually consumes: the bag rides through
//   costFeatures verbatim, and a model that splits on a probe feature
//   falls back (null) when that probe is absent — never a guess —
{
  const full = await getDeviceProbes({
    storage: memStorage(),
    measure: async () => ({ fillRate: 9.5, instanced: 2.5, blend: 6.5, js: 18 }),
  });
  const feats = costFeatures({ layoutParams: { count: 10 }, probes: full });
  assert.deepStrictEqual(feats.probe, full, 'probe bag rides into the feature vector verbatim');

  const v = validateCostModel({
    kind: COST_HEAD_KIND,
    objective: COST_OBJECTIVE,
    baseScore: 3,
    features: ['probe.fillRate'],
    trees: [{ f: 0, op: '<', v: 10, y: { leaf: 0 }, n: { leaf: 0.5 }, gain: 1 }],
  });
  assert(v.ok, v.error);
  assert.ok(predictMs(v.model, { probe: full }) > 0, 'a full bag prices');
  assert.strictEqual(
    predictMs(v.model, { probe: { js: 18 } }),
    null,
    'an absent probe is a fallback, not a 0 or a 1.0',
  );
  assert.strictEqual(predictMs(v.model, { probe: {} }), null, 'an empty bag is a fallback');
}

console.log('deviceProbes selfcheck OK');
