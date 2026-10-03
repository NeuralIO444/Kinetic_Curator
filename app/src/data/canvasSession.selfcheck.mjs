// #606 session persistence: canvas W/H (+fps) survives a fresh session via
// localStorage. Project-document persistence is separate — this is the boot
// fallback when no project is loaded.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Minimal localStorage shim for node.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => { mem.clear(); },
};

const { readCanvasSession, writeCanvasSession } = await import('./canvasPresets.js');

test('#606 empty session reads null (fresh boot falls back to instrument)', () => {
  mem.clear();
  assert.equal(readCanvasSession(), null);
});

test('#606 session round-trips W/H/fps/preset', () => {
  mem.clear();
  writeCanvasSession({ canvasW: 1080, canvasH: 1920, canvasFps: 30, canvasPresetId: 'reel' });
  const s = readCanvasSession();
  assert.equal(s.canvasW, 1080);
  assert.equal(s.canvasH, 1920);
  assert.equal(s.canvasFps, 30);
  assert.equal(s.canvasPresetId, 'reel');
});

test('#606 corrupt or wild session values sanitize, never throw', () => {
  mem.clear();
  mem.set('kc:canvas-session', 'not-json{{{');
  assert.equal(readCanvasSession(), null);
  writeCanvasSession({ canvasW: 9, canvasH: 99999, canvasFps: 12 });
  const s = readCanvasSession();
  assert.equal(s.canvasW, 256);
  assert.equal(s.canvasH, 7680);
  assert.equal(s.canvasFps, 60);
});
