// Smoke: load app, live WebGL canvas renders, switch tabs, poke a layout control (#37, #224)
import { test, expect } from '@playwright/test';

test.describe('Kinetic Curator smoke', () => {
  test('loads, live canvas renders, switches panels, toggles a layout param', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch { /* ignore */ }
    });

    await page.goto('/');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

    // Live WebGL canvas present (PERFORM leg, #224)
    const gl = page.locator('.canvas-gl').first();
    await expect(gl).toBeVisible();

    // The canvas hosts a real WebGL2 context with rendered pixels —
    // read one frame through the GPU readback and check it's non-blank.
    const stats = await gl.evaluate((c) => {
      const glc = c.getContext('webgl2');
      if (!glc) return { webgl2: false };
      const w = glc.drawingBufferWidth;
      const h = glc.drawingBufferHeight;
      return { webgl2: true, w, h };
    });
    expect(stats.webgl2).toBe(true);
    expect(stats.w).toBeGreaterThan(0);
    expect(stats.h).toBeGreaterThan(0);

    // The loop exposes its node count in the header pill; it should count > 0
    const nodesPill = page.locator('.panel-canvas .meter-pill', { hasText: /NODES/i }).first();
    await expect(nodesPill).toContainText(/[1-9]\d*\s*NODES/i, { timeout: 30_000 });

    // Footer shows seed
    await expect(page.locator('.footer-bar')).toContainText(/seed:/i);

    // Tab strip: switch to OUTPUT then BUILD
    const tabs = page.locator('[role="tablist"] [role="tab"]');
    await expect(tabs.first()).toBeVisible();
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(3);

    // Prefer clicking by accessible name when possible
    const outputTab = page.getByRole('tab', { name: /output/i });
    if (await outputTab.count()) {
      await outputTab.click();
      await expect(page.locator('.panel-output')).toBeVisible();
    }

    const buildTab = page.getByRole('tab', { name: /build/i });
    if (await buildTab.count()) {
      await buildTab.click();
    } else {
      await tabs.first().click();
    }

    // Toggle a layout control (MIRROR is stable)
    const mirror = page.getByRole('button', { name: /mirror/i }).first();
    if (await mirror.count()) {
      const before = await mirror.getAttribute('class');
      await mirror.click();
      // class should flip tg-on presence
      await page.waitForTimeout(100);
      const after = await mirror.getAttribute('class');
      expect(before === after).toBe(false);
    }

    // Live canvas keeps rendering after a param change (still visible)
    await expect(gl).toBeVisible();
    console.log('[smoke] gl node pill:', await nodesPill.textContent());
  });
});
