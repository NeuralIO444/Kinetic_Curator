import assert from 'node:assert';
import { routeBeat, sanitizeBeatRoute, BEAT_ROUTES } from './beatArbiter.js';

const armed = {
  phraseEnabled: true,
  phraseClock: 'audio',
  audioEnabled: true,
  evolveMode: true,
  evolveSource: 'beat',
  slowRender: false,
  batchPaused: false,
};

// Default route is BOTH: one beat ticks the clock and fires the gate.
let d = routeBeat({ ...armed });
assert.strictEqual(d.tickPhrase, true);
assert.strictEqual(d.fireEvolve, true);
assert.strictEqual(d.route, 'both');

// PHRASE: evolve ignores the beat.
d = routeBeat({ ...armed, beatRoute: 'phrase' });
assert.strictEqual(d.tickPhrase, true);
assert.strictEqual(d.fireEvolve, false);

// EVOLVE: the bar holds.
d = routeBeat({ ...armed, beatRoute: 'evolve' });
assert.strictEqual(d.tickPhrase, false);
assert.strictEqual(d.fireEvolve, true);

// Only one side armed: no route can wake the other.
d = routeBeat({ ...armed, evolveMode: false, beatRoute: 'both' });
assert.strictEqual(d.tickPhrase, true);
assert.strictEqual(d.fireEvolve, false);
d = routeBeat({ ...armed, phraseEnabled: false, beatRoute: 'both' });
assert.strictEqual(d.tickPhrase, false);
assert.strictEqual(d.fireEvolve, true);

// METRO clock never answers a mic beat; TIME evolve never answers one either.
d = routeBeat({ ...armed, phraseClock: 'metro', beatRoute: 'both' });
assert.strictEqual(d.tickPhrase, false);
assert.strictEqual(d.fireEvolve, true);
d = routeBeat({ ...armed, evolveSource: 'time', beatRoute: 'both' });
assert.strictEqual(d.tickPhrase, true);
assert.strictEqual(d.fireEvolve, false);

// Audio off: phrase cannot be armed on an AUDIO clock.
d = routeBeat({ ...armed, audioEnabled: false, beatRoute: 'both' });
assert.strictEqual(d.tickPhrase, false);

// Automatic-trigger pause: slowRender and batchPaused each gate both sides.
for (const flag of ['slowRender', 'batchPaused']) {
  d = routeBeat({ ...armed, [flag]: true });
  assert.strictEqual(d.tickPhrase, false, flag);
  assert.strictEqual(d.fireEvolve, false, flag);
}

// Junk route falls back to the recommended default.
assert.strictEqual(sanitizeBeatRoute('sidechain'), 'both');
assert.strictEqual(sanitizeBeatRoute(undefined), 'both');
d = routeBeat({ ...armed, beatRoute: 'sidechain' });
assert.strictEqual(d.route, 'both');
assert.strictEqual(d.tickPhrase, true);
assert.strictEqual(d.fireEvolve, true);

assert.deepStrictEqual([...BEAT_ROUTES].sort(), ['both', 'evolve', 'phrase']);

console.log('beatArbiter.selfcheck: OK');
