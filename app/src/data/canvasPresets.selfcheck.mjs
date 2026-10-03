import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANVAS_PRESETS, sanitizeCanvasSpec, isInstrumentCanvas, INSTRUMENT_CANVAS, authoredCanvas, renderDims,
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

test('#606 wide VJ + IG social presets present', () => {
  const dims = new Set(CANVAS_PRESETS.map((p) => `${p.group}:${p.w}x${p.h}`));
  for (const d of ['VJ:2560x1080', 'VJ:3440x1440', 'VJ:5760x1080']) {
    assert.ok(dims.has(d), `missing VJ preset ${d}`);
  }
  for (const d of ['Social:1080x1440', 'Social:1080x1080', 'Social:1080x566']) {
    assert.ok(dims.has(d), `missing Social preset ${d}`);
  }
});

test('#606 renderDims mirrors the live loop governor trim', () => {
  assert.deepEqual(renderDims(1920, 1080, 1), { w: 1920, h: 1080, scale: 1 });
  assert.deepEqual(renderDims(1920, 1080, 0.75), { w: 1440, h: 810, scale: 0.75 });
  // clamps like liveLoop: scale in [0.1, 1], dims at least 2px
  assert.deepEqual(renderDims(1000, 700, 0.05), { w: 100, h: 70, scale: 0.1 });
  assert.deepEqual(renderDims(10, 10, 0.1).w, 2);
  assert.deepEqual(renderDims(1920, 1080, 2).scale, 1);
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

test('#606 authoredCanvas reads store-shaped state', () => {
  const a = authoredCanvas({ canvasW: 1080, canvasH: 1920, canvasFps: 30 });
  assert.equal(a.w, 1080);
  assert.equal(a.h, 1920);
  assert.equal(a.fps, 30);
});

test('#606 OOH group: four source-labeled presets', () => {
  const ooh = CANVAS_PRESETS.filter((p) => p.group === 'OOH');
  assert.equal(ooh.length, 4);
  const dims = new Set(ooh.map((p) => `${p.w}x${p.h}`));
  for (const d of ['1400x400', '1920x1080', '1260x720', '10048x2368']) {
    assert.ok(dims.has(d), `OOH missing ${d}`);
  }
  // Every OOH preset carries its source; Times Square is example-only.
  for (const p of ooh) {
    assert.ok(typeof p.source === 'string' && p.source.length > 0, `${p.id} missing source`);
  }
  const ts = ooh.find((p) => p.w === 10048);
  assert.ok(/example/i.test(ts.source), 'Times Square preset must be labeled example-only');
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
