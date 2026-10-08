// #1079 — adding GRAIN to an FX layer must not hang or fault the live canvas.
// The dead grain-LUT bake (full-size feTurbulence SVG rasterized on the main
// thread) made the page unresponsive for minutes on CI's software GL, so an
// earlier live-canvas grain test had to be dropped from #1069. With the bake
// gone (grain is procedural), this test boots, adds grain, and asserts the
// loop keeps presenting frames with no fault pill. Pixel readback is
// deliberately not asserted here (flaky in CI — see #1079); grain pixels are
// proven byte-identical by the parity suite's fx-chain-2 scene.
import { test, expect } from '@playwright/test';

const faulted = (page) => page.locator('.status-pill', { hasText: /RENDER FAULT|GL CONTEXT LOST/i }).count();

test('adding GRAIN to an FX layer does not hang or fault the live canvas', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!window.__kcStore)).toBe(true);
  const st = (fn, ...a) => page.evaluate(([f, args]) => window.__kcStore.getState()[f](...args), [fn, a]);
  await expect(page.locator('.panel-canvas canvas').first()).toBeVisible();

  // Add an FX track and put grain on it — this is the path that used to
  // trigger the full-size LUT bake per layer.
  await st('addFxLayer');
  const fxId = await page.evaluate(() => window.__kcStore.getState().selectedFxLayerId);
  expect(fxId).toBeTruthy();
  await st('fxEffectAdd', fxId, 'grain');
  const effects = await page.evaluate((id) => window.__kcStore.getState().layers.find((l) => l.id === id)?.effects, fxId);
  expect(effects.some((f) => f.kind === 'grain')).toBe(true);

  // The old bake hung the main thread here for minutes on software GL; the
  // loop must keep presenting frames promptly instead.
  await page.waitForTimeout(2000);
  const fps = await page.evaluate(() => window.__kcStore.getState().fps);
  expect(fps).toBeGreaterThan(0);
  expect(await faulted(page), `fault pill showing; errors: ${JSON.stringify(errors.slice(0, 4))}`).toBe(0);
  expect(errors).toEqual([]);
});
