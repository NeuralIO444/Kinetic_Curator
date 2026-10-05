// stageMapping.selfcheck.mjs — #607 STAGE Phase B mapping math.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeStageRect, sanitizeStageMapping, stageMappingLabel } from './stageMapping.mjs';

test('#607 sanitize: hostile mapping falls back to fit', () => {
  assert.equal(sanitizeStageMapping('fill'), 'fill');
  assert.equal(sanitizeStageMapping('1:1'), '1:1');
  assert.equal(sanitizeStageMapping('cover'), 'fit');
  assert.equal(sanitizeStageMapping(null), 'fit');
  assert.equal(sanitizeStageMapping(undefined), 'fit');
  assert.equal(stageMappingLabel('bogus'), 'FIT');
  assert.equal(stageMappingLabel('1:1'), '1:1');
});

test('#607 fit: 16:9 canvas on 16:9 display is full-bleed', () => {
  const r = computeStageRect(1920, 1080, 1920, 1080, 'fit');
  assert.deepEqual(r, { dx: 0, dy: 0, dw: 1920, dh: 1080 });
});

test('#607 fit: 9:16 canvas on 16:9 display pillarboxes', () => {
  const r = computeStageRect(1080, 1920, 1920, 1080, 'fit');
  assert.ok(r.dw < 1920 && r.dh === 1080, 'height fills, width letterboxes');
  assert.ok(Math.abs(r.dx - (1920 - r.dw) / 2) < 1e-6, 'centered horizontally');
  assert.ok(Math.abs(r.dy) < 1e-6, 'no vertical offset');
});

test('#607 fit: 16:9 canvas on 9:16 display letterboxes', () => {
  const r = computeStageRect(1920, 1080, 1080, 1920, 'fit');
  assert.ok(r.dw === 1080 && r.dh < 1920, 'width fills, height letterboxes');
  assert.ok(Math.abs(r.dy - (1920 - r.dh) / 2) < 1e-6, 'centered vertically');
});

test('#607 fill: 9:16 canvas on 16:9 display crops (overflows)', () => {
  const r = computeStageRect(1080, 1920, 1920, 1080, 'fill');
  assert.ok(r.dw >= 1920 && r.dh >= 1080, 'covers the destination');
  assert.ok(r.dx < 0 || r.dy < 0, 'overflows at least one axis for the crop');
});

test('#607 1:1: centers the native raster, no scaling', () => {
  const r = computeStageRect(1000, 700, 1920, 1080, '1:1');
  assert.deepEqual(r, { dx: 460, dy: 190, dw: 1000, dh: 700 });
});

test('#607 1:1: source bigger than display goes negative (crop by drawing)', () => {
  const r = computeStageRect(3840, 2160, 1920, 1080, '1:1');
  assert.deepEqual(r, { dx: -960, dy: -540, dw: 3840, dh: 2160 });
});

test('#607 degenerate inputs never throw and never go zero-size', () => {
  for (const args of [[0, 0, 0, 0, 'fit'], [-5, 100, 200, 100, 'fill'], [NaN, 700, 1920, 1080, '1:1']]) {
    const r = computeStageRect(...args);
    assert.ok(r.dw >= 1 && r.dh >= 1, `sane rect for ${JSON.stringify(args)}`);
  }
});
