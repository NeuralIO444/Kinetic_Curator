// SnapshotGallery.selfcheck — CLEAR confirm copy contract (#571).
// Node-only: the message builder is pure (window.confirm itself is browser).
import { strict as assert } from 'node:assert';
import { confirmClearSnapshotsMessage } from './snapshotCopy.mjs';

assert.strictEqual(
  confirmClearSnapshotsMessage(24),
  'Wipe 24 kept renders?',
  'the confirm states the count',
);
assert.strictEqual(confirmClearSnapshotsMessage(1), 'Wipe 1 kept render?', 'singular');
assert.strictEqual(confirmClearSnapshotsMessage(0), 'Wipe 0 kept renders?', 'zero is honest, not hidden');
assert.strictEqual(confirmClearSnapshotsMessage(NaN), 'Wipe 0 kept renders?', 'NaN coerces, never prints');
console.log('[selfcheck] snapshot CLEAR confirm copy states the count');
