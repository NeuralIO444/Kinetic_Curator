import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ledRaster } from './canvasPresets.js';

test('#606 cabinets write the native raster', () => {
  assert.deepEqual(ledRaster(4, 3, 128), { w: 512, h: 384 });
  assert.deepEqual(ledRaster(0, -2, 10), { w: 10, h: 10 });
});
