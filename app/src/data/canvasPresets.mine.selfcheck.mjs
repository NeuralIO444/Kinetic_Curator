import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeUserPresets } from './canvasPresets.js';

test('#606 a saved preset keeps a label and a size', () => {
  const list = sanitizeUserPresets([{ id: 'mine-1', label: 'Booth', w: 512, h: 384, fps: 60 }, null]);
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'Booth');
  assert.equal(list[0].w, 512);
  assert.equal(list[0].group, 'Mine');
  const renamed = sanitizeUserPresets([{ ...list[0], label: 'Lobby' }]);
  assert.equal(renamed[0].label, 'Lobby');
  assert.equal(renamed[0].w, 512);
});
