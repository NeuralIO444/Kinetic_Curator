// useMediaExport.selfcheck — still-blob honesty guard (#570).
// Node-only, pure: assertStillBlob takes stub blobs, no DOM/canvas needed.
import { strict as assert } from 'node:assert';
import { assertStillBlob } from './useMediaExport.js';

// Valid blob passes through by identity.
{
  const blob = { size: 12345, type: 'image/png' };
  assert.strictEqual(assertStillBlob(blob), blob, 'valid blob passes through');
  console.log('[selfcheck] still blob: valid passes');
}

// The partial lie: zero-byte file must throw, never download silently.
{
  assert.throws(
    () => assertStillBlob({ size: 0, type: 'image/png' }),
    /empty \(0 bytes\)/,
    'zero-byte blob throws the honest error',
  );
  console.log('[selfcheck] still blob: zero-byte throws');
}

// Missing/malformed blobs throw too — no silent undefined propagation.
{
  for (const bad of [null, undefined, {}, { size: NaN }, { size: -3 }, { size: 'x' }]) {
    assert.throws(() => assertStillBlob(bad), /empty|still file/,
      `malformed blob throws (${JSON.stringify(bad)})`);
  }
  console.log('[selfcheck] still blob: malformed throws');
}
