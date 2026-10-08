// #1128 — pin an asset still: a discrete TE toggle on each enabled asset tile, 44px tall, saved with the project.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /assets/i }).click();
  await expect(page.locator('.panel-pool')).toBeVisible();
}

test('only assets in use have a STILL toggle; it is 44px tall and flips the project', async ({ page }) => {
  await boot(page);
  const strips = page.locator('.tile-still');
  const on = await page.locator('.tile.tile-on').count();
  expect(on).toBeGreaterThan(0);
  await expect(strips).toHaveCount(on); // not one for a tile that is off
  const first = strips.first();
  expect((await first.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => Object.keys(window.__kcStore.getState().assetStill).length)).toBe(1);
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => Object.keys(window.__kcStore.getState().assetStill).length)).toBe(0);
});
