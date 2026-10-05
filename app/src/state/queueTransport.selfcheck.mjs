// node src/state/queueTransport.selfcheck.mjs — #966: HITS queue transport helpers.
import assert from 'node:assert';
import {
  QUEUE_MAX_VISIBLE,
  visibleQueue,
  nextQueueIndex,
  clampQueueIndex,
  sanitizeQueueSeconds,
  sanitizeQueueBeats,
  sanitizeQueueSource,
  queueHoldMs,
  queuePositionLabel,
} from './queueTransport.js';

const favs = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}` }));

// visibleQueue: same window the tray shows (last 12, oldest→newest order kept)
assert.deepStrictEqual(visibleQueue(favs(5)).map((f) => f.id), ['f0', 'f1', 'f2', 'f3', 'f4']);
{
  const win = visibleQueue(favs(15));
  assert.strictEqual(win.length, QUEUE_MAX_VISIBLE, 'window caps at 12');
  assert.strictEqual(win[0].id, 'f3', 'window slides: oldest visible first');
  assert.strictEqual(win[11].id, 'f14', 'newest last');
}
assert.deepStrictEqual(visibleQueue([]), []);
assert.deepStrictEqual(visibleQueue(undefined), []);
assert.deepStrictEqual(visibleQueue(null), []);

// nextQueueIndex: loops at the end of the queue
assert.strictEqual(nextQueueIndex(0, 5), 1);
assert.strictEqual(nextQueueIndex(4, 5), 0, 'end of queue loops');
assert.strictEqual(nextQueueIndex(0, 1), 0, 'single-hit queue stays');
assert.strictEqual(nextQueueIndex(0, 0), 0, 'empty queue is safe');

// clampQueueIndex: favorites removed mid-play
assert.strictEqual(clampQueueIndex(7, 5), 4);
assert.strictEqual(clampQueueIndex(-3, 5), 0);
assert.strictEqual(clampQueueIndex(2, 5), 2);
assert.strictEqual(clampQueueIndex(0, 0), 0);

// sanitizers
assert.strictEqual(sanitizeQueueSeconds(8), 8);
assert.strictEqual(sanitizeQueueSeconds(0.5), 2, 'floor 2s');
assert.strictEqual(sanitizeQueueSeconds(999), 60, 'ceiling 60s');
assert.strictEqual(sanitizeQueueSeconds('junk'), 8, 'junk → default');
assert.strictEqual(sanitizeQueueBeats(4), 4);
assert.strictEqual(sanitizeQueueBeats(0), 1, 'floor 1 beat');
assert.strictEqual(sanitizeQueueBeats(99), 32, 'ceiling 32 beats');
assert.strictEqual(sanitizeQueueBeats('junk'), 4, 'junk → default');
assert.strictEqual(sanitizeQueueSource('beat'), 'beat');
assert.strictEqual(sanitizeQueueSource('time'), 'time');
assert.strictEqual(sanitizeQueueSource('junk'), 'time', 'unknown → time');

// queueHoldMs: TIME = seconds per hit; BEAT = beats per hit at tempo
assert.strictEqual(queueHoldMs('time', 8, 4, 120), 8000);
assert.strictEqual(queueHoldMs('time', 2.5, 4, 120), 2500);
assert.strictEqual(queueHoldMs('beat', 8, 4, 120), 2000, '4 beats @ 120 BPM = 2s');
assert.strictEqual(queueHoldMs('beat', 8, 4, 90), 2667, '4 beats @ 90 BPM ≈ 2.67s (acceptance case)');
assert.strictEqual(queueHoldMs('beat', 8, 8, 90), 5333, '8 beats @ 90 BPM');
assert.strictEqual(queueHoldMs('beat', 8, 4, undefined), 2000, 'no BEAT button yet → 120 fallback');
assert.strictEqual(queueHoldMs('beat', 8, 4, 0), 2000, 'zero BPM → 120 fallback');
assert.strictEqual(queueHoldMs('junk', 8, 4, 120), 8000, 'unknown source → time');

// queuePositionLabel
assert.strictEqual(queuePositionLabel(0, 5), '1/5');
assert.strictEqual(queuePositionLabel(4, 5), '5/5');
assert.strictEqual(queuePositionLabel(9, 5), '5/5', 'clamped');
assert.strictEqual(queuePositionLabel(0, 0), '—', 'empty queue');

console.log('queueTransport.selfcheck: OK');
