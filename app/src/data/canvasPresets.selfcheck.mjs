import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANVAS_PRESETS, sanitizeCanvasSpec, isInstrumentCanvas, INSTRUMENT_CANVAS,
} from './canvasPresets.js';
import { serializeProject } from '../state/projectDocument.js';

test('#606 presets cover VJ and Social', () => {
  const groups = new Set(CANVAS_PRESETS.map((p) => p.group));
  assert.ok(groups.has('VJ') && groups.has('Social'));
  assert.ok(CANVAS_PRESETS.some((p) => p.w === 1920 && p.h === 1080));
  assert.ok(CANVAS_PRESETS.some((p) => p.w === 1080 && p.h === 1920));
});

test('#606 sanitize clamps and defaults stage to preview', () => {
  const s = sanitizeCanvasSpec({ canvasW: 9, canvasH: 99999, canvasFps: 12, stageMode: 'ndi' });
  assert.equal(s.canvasW, 256);
  assert.equal(s.canvasH, 7680);
  assert.equal(s.canvasFps, 60);
  assert.equal(s.stageMode, 'preview');
});

test('#606 instrument canvas omitted from serialize', () => {
  const doc = serializeProject({
    seed: 1,
    seedOffsets: null,
    paletteId: 'praystation',
    layoutParams: {},
    enabledAssets: {},
    quality: 'balanced',
    autoQuality: true,
    canvasW: 1000,
    canvasH: 700,
    canvasFps: 60,
    canvasPresetId: 'instrument',
    stageMode: 'preview',
    layers: [],
    activeLayerId: null,
  });
  assert.equal(doc.canvasW, undefined);
  assert.ok(isInstrumentCanvas({ canvasW: 1000, canvasH: 700 }));
  assert.equal(INSTRUMENT_CANVAS.w, 1000);
});

test('#606 custom size is written', () => {
  const doc = serializeProject({
    seed: 1,
    seedOffsets: null,
    paletteId: 'praystation',
    layoutParams: {},
    enabledAssets: {},
    quality: 'balanced',
    autoQuality: true,
    canvasW: 1920,
    canvasH: 1080,
    canvasFps: 30,
    canvasPresetId: 'hd',
    stageMode: 'preview',
    layers: [],
    activeLayerId: null,
  });
  assert.equal(doc.canvasW, 1920);
  assert.equal(doc.canvasH, 1080);
  assert.equal(doc.canvasFps, 30);
});
