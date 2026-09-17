// #106 — a poisoned project must not take down the live canvas.
//
// Self-contained on purpose: the document below is the regression, so it
// lives next to the assertion rather than in a fixture someone has to go
// find. Verified against main before the fix: mode "__proto__" resolved
// SAMPLERS["__proto__"] to Object.prototype — truthy, not callable — and the
// placement loop threw, rendering 0 nodes with "__proto__" still showing in
// the footer. normalize.selfcheck.mjs covers the sanitizer itself; this
// covers the store/React wiring it sits behind.
import { test, expect } from '@playwright/test';
import { glNodeCount, waitForLiveFrame } from './gl-helpers.js';

// Raw JSON text, not an object literal: a hand-edited file really can contain
// 1e999, which JSON.parse turns into Infinity. Building it with
// JSON.stringify would serialise that back to null and test a weaker input.
const POISONED = `{
  "version": 1,
  "seed": 6735,
  "paletteId": "praystation",
  "quality": "balanced",
  "layoutParams": {
    "mode": "__proto__",
    "jitter": 1e999,
    "particleCount": 10000000,
    "zTiers": 1000000,
    "count": 1000000000,
    "density": -50,
    "blendMode": "url(javascript:alert(1))",
    "scale": ["a", "b"],
    "damping": null
  }
}`;

test('poisoned project loads without killing the canvas', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript((doc) => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.setItem('kc:project:v1', doc);
    } catch { /* ignore */ }
  }, POISONED);

  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  await waitForLiveFrame(page);
  const nodes = await glNodeCount(page);
  const footer = await page.locator('.footer-bar').textContent();
  console.log('[poison] nodes:', nodes, '| footer:', footer?.slice(0, 80));

  expect(nodes, 'canvas rendered nothing — the poisoned project broke the kernel')
    .toBeGreaterThan(0);
  expect(footer, 'mode should have fallen back to an allow-listed value')
    .not.toMatch(/__proto__/);
  expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
});
