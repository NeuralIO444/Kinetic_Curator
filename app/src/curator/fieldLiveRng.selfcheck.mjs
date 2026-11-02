// fieldLiveRng.selfcheck.mjs — #1917: the live Director deals poems off a
// seeded, VARYING field stream, never the constant 0.5 fallback.
//
// Pins:
//   1. The live singleton (getDirector) is always constructed with a field
//      stream — the constant-fallback state cannot regress silently.
//   2. Across deals in differing bands, all four poets and a spread of
//      pieces appear (Whittier/greenleaf included).
//   3. A recorded take replays with the same poems: the same per-press
//      streams in the same order deal the same (poetId, pieceId) sequence.
import assert from 'node:assert';
import { createDirector, getDirector, resetDirector, createLiveFieldRng } from './director.js';
import { loisActivity } from './loisActivity.js';
import { rngForIndex, CH } from '../engine/kernel/rng.js';

const POETS = ['greenleaf', 'teijo', 'rosselli', 'gibson'];

// ── 1. The live construction carries a field stream ─────────────────────
{
  resetDirector();
  const d = getDirector();
  assert.strictEqual(d.fieldRngWired, true, 'getDirector() must construct with a fieldRng (#1917)');
  // The fallback-only construction still reports itself honestly.
  assert.strictEqual(createDirector({ now: () => 0 }).fieldRngWired, false);
  resetDirector();
}

// ── 1b. The live stream varies (it is not a constant) ───────────────────
{
  const r = createLiveFieldRng();
  const draws = new Set(Array.from({ length: 32 }, () => r().toFixed(6)));
  assert.ok(draws.size > 24, `live field stream varies (distinct draws ${draws.size}/32)`);
}

// ── The press path, as layoutSlice drives it ────────────────────────────
// One Director, ticked once per press with that press's own stream, while
// the audio sweeps the room through cool / neutral / hot.
const AUDIO_SWEEP = [0.0, 0.05, 0.5, 0.55, 1.0, 0.95, 0.3, 0.8];
function runTake(seed, presses) {
  const d = createDirector({ now: () => 1000, fieldRng: createLiveFieldRng() });
  const out = [];
  for (let press = 0; press < presses; press++) {
    const r = d.tick({
      feed: loisActivity.snapshot(),
      audio: AUDIO_SWEEP[press % AUDIO_SWEEP.length],
      nowTs: 1000 + press * 4000,
      fieldRng: rngForIndex(seed, CH.curate, press + 0x40000, null),
    });
    out.push(r.poet ? `${r.poet.poetId}/${r.poet.pieceId}` : 'silence');
  }
  return out;
}

// ── 2. The whole deck is reachable live ─────────────────────────────────
{
  const poets = new Set();
  const pieces = new Set();
  for (const seed of [1, 7, 42, 1917, 31337]) {
    for (const deal of runTake(seed, 40)) {
      if (deal === 'silence') continue;
      poets.add(deal.split('/')[0]);
      pieces.add(deal);
    }
  }
  for (const p of POETS) assert.ok(poets.has(p), `poet ${p} appears live`);
  assert.ok(pieces.size >= 10, `a spread of pieces appears live (${pieces.size} distinct)`);
  console.log(`fieldLiveRng: live deals reached ${poets.size}/4 poets, ${pieces.size} distinct pieces`);
}

// ── 3. A take replays with the same poems ───────────────────────────────
{
  const a = runTake(42, 24);
  const b = runTake(42, 24);
  assert.deepStrictEqual(b, a, 'same seed + press sequence replays the same poems');
  const c = runTake(43, 24);
  assert.notDeepStrictEqual(c, a, 'a different seed deals a different take');
  console.log('fieldLiveRng: replay deterministic, seeds differ');
}

console.log('fieldLiveRng.selfcheck: ok');
