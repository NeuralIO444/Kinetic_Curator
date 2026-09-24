// Worker mode e2e test — Decoupled Render Worker (Issue #28, Task 3A & Option 1)
import { test, expect } from '@playwright/test';

test.describe('Kinetic Curator decoupled offscreen worker', () => {
  test('initializes OffscreenCanvas worker, renders live WebGL, and updates node count', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch { /* ignore */ }
    });

    await page.goto('/?worker=1&downscale=1');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

    const gl = page.locator('.canvas-gl').first();
    await expect(gl).toBeVisible();

    // Verify canvas control was transferred offscreen
    const isOffscreen = await gl.evaluate((c) => {
      try {
        c.getContext('webgl2');
        return false;
      } catch {
        return true;
      }
    });
    expect(isOffscreen).toBe(true);

    // The offscreen worker renders instances and reports node count to the pill
    const nodesPill = page.locator('.panel-canvas .meter-pill', { hasText: /NODES/i }).first();
    await expect(nodesPill).toContainText(/[1-9]\d*\s*NODES/i, { timeout: 30_000 });

    // Footer shows seed
    await expect(page.locator('.footer-bar')).toContainText(/seed:/i);
  });
});
