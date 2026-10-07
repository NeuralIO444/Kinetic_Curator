// #1098 — a PATTERN track in the running instrument. Pixel readback is flaky in CI (see #1079), so
// this is a smoke test: a pattern track in each mode, still and drifting, must not fault the
// renderer, throw, or stall the frame loop. The pixels themselves are proven in
// src/pattern/patternRender.selfcheck.mjs (headless GL, exact colours).
import { test, expect } from '@playwright/test';

const faulted = (page) => page.locator('.status-pill', { hasText: /RENDER FAULT|GL CONTEXT LOST|PERF PAUSED/i }).count();

test('a PATTERN track draws in every mode, still and drifting, without faulting the renderer', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!window.__kcStore)).toBe(true);
  const st = (fn, ...a) => page.evaluate(([f, args]) => window.__kcStore.getState()[f](...args), [fn, a]);
  const frames = () => page.evaluate(() => window.__kcStore.getState().fps);

  await expect(page.locator('.panel-canvas canvas').first()).toBeVisible();
  const kcLayers = await page.evaluate(() => window.__kcStore.getState().layers.length);

  await st('addPatternLayer', 'QUILT');
  const id = await page.evaluate(() => window.__kcStore.getState().layers.find((l) => l.type === 'pattern').id);
  expect(await page.evaluate(() => window.__kcStore.getState().layers.length)).toBe(kcLayers + 1);

  for (const mode of ['QUILT', 'GLYPH', 'FIELD']) {
    await st('setPatternMode', id, mode);
    for (const drift of [0, 0.6]) {
      await st('setPatternParam', id, 'drift', drift);
      await page.waitForTimeout(900);
      expect(await faulted(page), `${mode} drift ${drift}: a fault pill is showing`).toBe(0);
    }
    await st('shufflePattern', id);
    await page.waitForTimeout(500);
    expect(await faulted(page), `${mode} after shuffle`).toBe(0);
  }

  // the loop is still running: the fps readout is alive
  await expect.poll(frames, { timeout: 5000 }).toBeGreaterThan(0);
  // removing it frees it and the KC picture carries on
  await st('removeLayer', id);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__kcStore.getState().layers.length)).toBe(kcLayers);
  expect(await faulted(page)).toBe(0);
  expect(errors.filter((e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e)), 'no page errors').toEqual([]);
});
