import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachThumbnail, readThumbnail } from './thumbnail.mjs';

test('#654 thumbnail stores under the cap and drops over it', () => {
  const small = 'data:image/png;base64,aaaa';
  assert.equal(readThumbnail(attachThumbnail({ seed: 1 }, small)), small);
  assert.equal(attachThumbnail({ seed: 1 }, 'data:image/png;base64,' + 'a'.repeat(90000)).thumbnail, undefined);
  assert.equal(readThumbnail({ thumbnail: 'nope' }), null);
});
