// stageDisplays.selfcheck.mjs — #607 STAGE Phase B display descriptors.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeMonitor, normalizeMonitors, resolveStageDisplay,
  isDisplayGone, matchRaster, displayLabel, REFRESH_RATE_UNAVAILABLE,
} from './stageDisplays.mjs';

const TAURI_MON = {
  name: 'Studio Display',
  size: { width: 5120, height: 2880 },
  position: { x: 0, y: 0 },
  scaleFactor: 2,
};

test('#607 normalize: Tauri 1.x shape in, honest descriptor out', () => {
  const d = normalizeMonitor(TAURI_MON, 0);
  assert.equal(d.id, 'mon-0-5120x2880');
  assert.equal(d.name, 'Studio Display');
  assert.equal(d.w, 5120);
  assert.equal(d.h, 2880);
  assert.equal(d.scaleFactor, 2);
  assert.equal(d.refreshRateHz, null, 'Tauri 1.x exposes no refresh rate — null, not invented');
  assert.match(REFRESH_RATE_UNAVAILABLE, /Tauri 1\.x/);
});

test('#607 normalize: hostile shapes degrade, never throw', () => {
  const d = normalizeMonitor(null, 2);
  assert.equal(d.name, 'Display 3');
  assert.ok(d.w >= 1 && d.h >= 1);
  const d2 = normalizeMonitor({ name: '', size: { width: -40 } }, 0);
  assert.equal(d2.name, 'Display 1');
  assert.ok(d2.w >= 1);
  assert.deepEqual(normalizeMonitors('nope'), []);
  assert.deepEqual(normalizeMonitors(null), []);
});

test('#607 resolve: saved pick wins; empty list invents nothing', () => {
  const list = normalizeMonitors([TAURI_MON, { ...TAURI_MON, name: 'Sidecar', size: { width: 1920, height: 1080 }, position: { x: 5120, y: 0 } }]);
  const { display, note } = resolveStageDisplay(list, list[1].id);
  assert.equal(display.name, 'Sidecar');
  assert.equal(note, null);
  const empty = resolveStageDisplay([], 'mon-0-1x1');
  assert.equal(empty.display, null, 'no invented display');
});

test('#607 resolve: vanished saved display falls back with a note', () => {
  const list = normalizeMonitors([TAURI_MON]);
  const { display, note } = resolveStageDisplay(list, 'mon-9-9999x9999');
  assert.equal(display.name, 'Studio Display');
  assert.match(note, /fell back/i);
});

test('#607 unplug: isDisplayGone spots the vanished display', () => {
  const list = normalizeMonitors([TAURI_MON]);
  assert.equal(isDisplayGone(list, list[0].id), false);
  assert.equal(isDisplayGone([], list[0].id), true, 'unplugged: enumeration no longer lists it');
  assert.equal(isDisplayGone(list, null), false, 'no selection, no alarm');
});

test('#607 match display: native raster for the canvas write', () => {
  const d = normalizeMonitor(TAURI_MON, 0);
  assert.deepEqual(matchRaster(d), { w: 5120, h: 2880 });
  assert.equal(matchRaster(null), null);
  assert.match(displayLabel(d), /Studio Display/);
  assert.match(displayLabel(d), /5120×2880/);
  assert.match(displayLabel(d), /n\/a Hz/);
});
