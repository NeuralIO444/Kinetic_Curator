// node src/data/recipeDefaults/recipeDefaults.selfcheck.mjs
// #2323 — layout-default epochs. A link must keep meaning what it meant when it was cut, so the live
// DEFAULT_LAYOUT_PARAMS may only change together with a new frozen epoch.
import assert from 'node:assert';
import { DEFAULT_LAYOUT_PARAMS } from '../layout-modes.js';
import { LAYOUT_DEFAULTS_EPOCH, EPOCH_HASHES, defaultsForEpoch, compareToEpoch, stableHash } from './index.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

// 1. THE GUARD: live defaults == the latest frozen epoch. On failure the message names the keys and the fix.
{
  const latest = defaultsForEpoch(LAYOUT_DEFAULTS_EPOCH);
  assert.ok(latest, `epoch ${LAYOUT_DEFAULTS_EPOCH} must exist`);
  const r = compareToEpoch(DEFAULT_LAYOUT_PARAMS, latest);
  assert.ok(r.ok, r.hint);
  assert.strictEqual(stableHash(DEFAULT_LAYOUT_PARAMS), stableHash(latest), 'the hashes agree');
}

// 2. The epochs are well-formed and frozen: every epoch up to the latest exists, matches its pinned hash (an
//    edit to an old epoch file cannot pass), and the table has no gaps or extras.
{
  assert.deepStrictEqual(
    Object.keys(EPOCH_HASHES).map(Number),
    Array.from({ length: LAYOUT_DEFAULTS_EPOCH }, (_, i) => i + 1),
  );
  for (let n = 1; n <= LAYOUT_DEFAULTS_EPOCH; n++) {
    const d = defaultsForEpoch(n);
    assert.ok(d && typeof d === 'object', `epoch ${n} loads`);
    assert.strictEqual(
      stableHash(d),
      EPOCH_HASHES[n],
      `epoch ${n} was edited after it was cut — cut a new epoch instead`,
    );
  }
  assert.strictEqual(
    defaultsForEpoch(LAYOUT_DEFAULTS_EPOCH + 1),
    null,
    'an epoch this build does not know is null, not a guess',
  );
  assert.strictEqual(defaultsForEpoch(0), null);
  assert.strictEqual(defaultsForEpoch('constructor'), null, 'no prototype keys leak through');
}

// 3. defaultsForEpoch hands out a private copy: scribbling on it cannot corrupt the frozen epoch.
{
  const a = defaultsForEpoch(1);
  a.count = 999999;
  a.scale.x[0] = -1;
  const b = defaultsForEpoch(1);
  assert.notStrictEqual(b.count, 999999);
  assert.notStrictEqual(b.scale.x[0], -1);
  assert.strictEqual(stableHash(b), EPOCH_HASHES[1]);
}

// 4. The hash is stable: key order never matters, and any value change does.
{
  const d = clone(DEFAULT_LAYOUT_PARAMS);
  const reordered = Object.fromEntries(Object.entries(d).reverse());
  assert.strictEqual(stableHash(reordered), stableHash(d), 'key order does not matter');
  assert.notStrictEqual(stableHash({ ...d, count: d.count + 1 }), stableHash(d));
  assert.notStrictEqual(
    stableHash({ ...d, scale: { x: [0.4, 1.6], y: [0.4, 1.7] } }),
    stableHash(d),
    'nested edits count',
  );
}

// 5. THE TEETH: the guard fails when a default is edited, added or removed — and says which key and what to do.
{
  const latest = defaultsForEpoch(LAYOUT_DEFAULTS_EPOCH);
  const edited = { ...clone(DEFAULT_LAYOUT_PARAMS), count: DEFAULT_LAYOUT_PARAMS.count + 1 };
  let r = compareToEpoch(edited, latest);
  assert.strictEqual(r.ok, false, 'an edited default must fail the guard');
  assert.deepStrictEqual(r.changed, ['count']);
  assert.ok(r.hint.includes(`epoch-${LAYOUT_DEFAULTS_EPOCH + 1}`), 'the hint says to cut the next epoch');
  assert.ok(r.hint.includes('count'), 'the hint names the changed key');

  const nested = clone(DEFAULT_LAYOUT_PARAMS);
  nested.scale.y[1] = 2.5;
  r = compareToEpoch(nested, latest);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.changed, ['scale'], 'a nested edit is caught and reported at its top-level key');

  const added = { ...clone(DEFAULT_LAYOUT_PARAMS), brandNewParam: 1 };
  r = compareToEpoch(added, latest);
  assert.strictEqual(r.ok, false, 'a new default key must fail the guard');
  assert.deepStrictEqual(r.changed, ['brandNewParam']);

  const removed = clone(DEFAULT_LAYOUT_PARAMS);
  delete removed.jitter;
  r = compareToEpoch(removed, latest);
  assert.strictEqual(r.ok, false, 'a removed default key must fail the guard');
  assert.deepStrictEqual(r.changed, ['jitter']);
}

console.log(
  `recipeDefaults.selfcheck: OK (epoch ${LAYOUT_DEFAULTS_EPOCH}, ${Object.keys(defaultsForEpoch(1)).length} keys)`,
);
