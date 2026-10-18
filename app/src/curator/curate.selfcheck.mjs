// curate.selfcheck.mjs — the Curator engine seam: honest fallback first.
import assert from 'node:assert';
import { useStore } from '../state/store.js';
import { RANDOMIZABLE_KEYS } from '../state/paramUtils.js';
import {
  CURATE_CANDIDATES,
  nullCurator,
  getActiveCurator,
  pickCurated,
  curatorHint,
} from './curate.js';

const cands = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// candidate count is sane
assert.ok(Number.isInteger(CURATE_CANDIDATES) && CURATE_CANDIDATES >= 2);

// null curator: untrained, declines every pick
{
  const c = nullCurator();
  assert.strictEqual(c.status(), 'untrained');
  assert.strictEqual(c.pick(cands), -1);
}

// active curator today is the persona scorer (davis by default) — the MLX
// ranker slots in above it once the Mac Studio runbook produces a taste
// artifact; the null curator remains the honest fallback underneath.
assert.strictEqual(getActiveCurator().status(), 'active');

// fallback: engine declines -> uniform roll in range, flagged uncurated.
// Audit 3f: this section used to be dealt by pickCurated's Math.random
// default; it now injects a seeded stream explicitly — same property
// (the fallback varies with the stream), and the suite is deterministic.
{
  const { mkRng } = await import('../engine/prng.js');
  const stream = mkRng(518);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const r = pickCurated(cands, nullCurator(), stream);
    assert.strictEqual(r.curated, false);
    assert.ok(r.index >= 0 && r.index < cands.length);
    seen.add(r.index);
  }
  assert.ok(seen.size > 1, 'fallback roll should vary');
}

// active stub engine: in-range pick is honored and flagged curated
{
  const stub = { status: () => 'active', pick: () => 3 };
  const r = pickCurated(cands, stub);
  assert.deepStrictEqual(r, { index: 3, curated: true });
}

// misbehaving engines degrade to the honest roll, never throw
{
  for (const bad of [
    { status: () => 'active', pick: () => 99 },
    { status: () => 'active', pick: () => -2 },
    { status: () => 'active', pick: () => 1.5 },
    { status: () => 'active', pick: () => { throw new Error('boom'); } },
  ]) {
    const r = pickCurated(cands, bad);
    assert.strictEqual(r.curated, false);
    assert.ok(r.index >= 0 && r.index < cands.length);
  }
}

// empty candidates: no pick
assert.deepStrictEqual(pickCurated([], nullCurator()), { index: -1, curated: false });

// hint copy is honest in both states
assert.strictEqual(curatorHint(nullCurator()), 'curator untrained · dice roll');
assert.strictEqual(curatorHint({ status: () => 'active', pick: () => 0 }), 'curated pick');

// #518: CURATE is seeded — same (seed, offsets, press #) replays the same
// scene; the next press differs; a different seed differs.
{
  const press = (seed, curatePress, seedOffsets = { spatial: 0, color: 0, asset: 0, noise: 0 }) => {
    useStore.setState({ seed, seedOffsets, curatePress, lockedParams: {}, layoutParams: { ...useStore.getInitialState().layoutParams } });
    useStore.getState().curateUnlocked();
    return JSON.stringify(useStore.getState().layoutParams);
  };
  const a = press(4242, 0);
  assert.strictEqual(press(4242, 0), a, 'same (seed, press #) -> identical pick');
  assert.notStrictEqual(press(4242, 1), a, 'next press differs');
  assert.notStrictEqual(press(4243, 0), a, 'different seed differs');
  assert.notStrictEqual(press(4242, 0, { spatial: 7, color: 0, asset: 0, noise: 0 }), a, 'seedOffsets are honored');
  useStore.setState({ seed: 4242, curatePress: 5 });
  useStore.getState().curateUnlocked();
  assert.strictEqual(useStore.getState().curatePress, 6, 'a landed press advances the counter');
  useStore.setState({ lockedParams: Object.fromEntries(RANDOMIZABLE_KEYS.map((k) => [k, true])) });
  useStore.getState().curateUnlocked();
  assert.strictEqual(useStore.getState().curatePress, 6, 'an all-locked no-op does not advance the counter');
}

// ── Audit fix 3f — pickCurated's no-rng path is deterministic ───────────────
// pickCurated defaulted rng = Math.random: with the curator's pick
// unavailable, the fallback index scattered (measured pre-fix: all 8
// indices over 200 identical calls). A missing/non-function rng now rolls
// 0 — the fallback deals candidate 0 and the persona machinery receives
// the zero stream (the 3a contract). Production passes the seeded
// CURATE stream (layoutSlice) and is unchanged.
{
  const { pickCurated } = await import('./curate.js');
  const cands = Array.from({ length: 8 }, (_, i) => ({ id: i }));
  const noPick = { pick: () => -1 };
  const a = pickCurated(cands, noPick);
  const b = pickCurated(cands, noPick);
  assert.deepStrictEqual(a, b, 'no-rng pickCurated must be deterministic');
  assert.strictEqual(a.index, 0, 'no-rng fallback deals candidate 0 (the roll-0 stream)');
  assert.deepStrictEqual(pickCurated(cands, noPick, undefined), a, 'undefined rng = the roll-0 stream');
  assert.deepStrictEqual(pickCurated(cands, noPick, 42), a, 'non-function rng = the roll-0 stream');
  assert.deepStrictEqual(pickCurated(cands, noPick, () => 0), a, 'explicit zero stream matches');
}

console.log('curate.selfcheck: ok');
