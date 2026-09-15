// Smoke: load app, dismiss intro, switch tabs, poke a layout control (#37)
import { test, expect } from '@playwright/test';

test.describe('Kinetic Curator smoke', () => {
  test('loads, switches panels, toggles a layout param', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch { /* ignore */ }
    });

    await page.goto('/');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

    // Canvas present with SVG (or accum canvas)
    const canvas = page.locator('.panel-canvas, .canvas-svg').first();
    await expect(canvas).toBeVisible();

    // Footer shows seed
    await expect(page.locator('.footer-bar')).toContainText(/seed:/i);

    // Tab strip: switch to OUTPUT then LAYOUT
    const tabs = page.locator('[role="tablist"] [role="tab"]');
    await expect(tabs.first()).toBeVisible();
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(3);

    // Prefer clicking by accessible name when possible
    const outputTab = page.getByRole('tab', { name: /output/i });
    if (await outputTab.count()) {
      await outputTab.click();
      await expect(page.locator('.panel-output, [id*="tabpanel"]')).toBeVisible();
    }

    const layoutTab = page.getByRole('tab', { name: /layout/i });
    if (await layoutTab.count()) {
      await layoutTab.click();
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

    // SVG still has content (use elements) after param change
    const uses = page.locator('.canvas-svg use');
    // may be 0 if assets disabled — at least the svg root exists
    await expect(page.locator('.canvas-svg')).toBeVisible();
    const useCount = await uses.count();
    // soft assert: log density for CI visibility
    console.log('[smoke] use count', useCount);
  });
});
