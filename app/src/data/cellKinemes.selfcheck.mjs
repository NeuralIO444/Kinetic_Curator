import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASSET_CELL_KINEME, CELL_KINEMES, cellIndexAt, cellUvWindow, getCellKineme } from './cellKinemes.js';

test('#781 C asset id is not in the cell kineme', () => {
  for (const k of CELL_KINEMES) {
    assert.equal('asset' in k, false);
    assert.ok(k.cells >= 4 && k.cells <= 8);
    assert.equal(k.costCells, k.cells);
  }
});

test('#781 C shed pins cell 0', () => {
  assert.equal(cellIndexAt(9.7, { period: 2, cells: 8, shed: true }), 0);
});

test('#781 C index walks the strip and wraps', () => {
  assert.equal(cellIndexAt(0, { period: 4, cells: 8 }), 0);
  assert.equal(cellIndexAt(2, { period: 4, cells: 8 }), 4);
  assert.equal(cellIndexAt(4, { period: 4, cells: 8 }), 0);
});

test('#781 C UV window keeps v and splits u', () => {
  const base = { u0: 0, v0: 0.1, u1: 0.8, v1: 0.5 };
  const mid = cellUvWindow(base, 1, 4);
  assert.ok(Object.is(mid.v0, 0.1) && Object.is(mid.v1, 0.5));
  assert.ok(mid.u0 > base.u0 && mid.u1 < base.u1);
  assert.equal(getCellKineme('dial-sweep').cells, 8);
});

test('#705 spec-chase: 8 cells, 2.0s period', () => {
  const k = getCellKineme('spec-chase');
  assert.ok(k, 'spec-chase is registered');
  assert.equal(k.cells, 8);
  assert.equal(k.period, 2);
  assert.equal(k.costCells, 8);
});

test('#705 ASSET_CELL_KINEME: values name real cell kinemes, keys name animated assets', () => {
  const ids = new Set(CELL_KINEMES.map((k) => k.id));
  const animated = new Set(['mic_dial', 'mic_chevrons', 'mic_specbar_h', 'mic_specbar_v', 'mic_wave']);
  assert.deepEqual(new Set(Object.keys(ASSET_CELL_KINEME)), animated);
  for (const [asset, kineme] of Object.entries(ASSET_CELL_KINEME)) {
    assert.ok(ids.has(kineme), `${asset} -> unknown cell kineme ${kineme}`);
  }
  assert.equal(ASSET_CELL_KINEME.mic_dial, 'dial-sweep');
  assert.equal(ASSET_CELL_KINEME.mic_chevrons, 'chevron-chase');
  assert.equal(ASSET_CELL_KINEME.mic_specbar_h, 'spec-chase');
  assert.equal(ASSET_CELL_KINEME.mic_specbar_v, 'spec-chase');
  assert.equal(ASSET_CELL_KINEME.mic_wave, 'wave-scroll');
});
