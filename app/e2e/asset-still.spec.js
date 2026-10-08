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

test('DUP sits next to STILL on a tile in use; nothing depends on hover; a tile that is off is only a picture', async ({ page }) => {
  await boot(page);
  const used = page.locator('.tile.tile-on').first();
  await expect(used.locator('.tile-foot .tile-dup')).toBeVisible();
  expect((await used.locator('.tile-dup').boundingBox()).height).toBeGreaterThanOrEqual(44);
  const off = page.locator('.tile').nth(12); // fixed by position: a locator on 'not tile-on' would slide to the next tile once this one is on
  await expect(off).not.toHaveClass(/tile-on/);
  await expect(off.locator('.tile-foot')).toHaveCount(0);
  await off.hover();
  await expect(off.getByRole('button', { name: /dup/i })).toHaveCount(0); // no hover strip any more
  await expect(off.locator('.tile-solo')).toHaveCount(0);
  await off.locator('.tile-toggle').click({ position: { x: 40, y: 28 } });
  await expect(off).toHaveClass(/tile-on/);
});

test('pinning marks the picture too (a red corner), so a scan of the grid sees what is held still', async ({ page }) => {
  await boot(page);
  const used = page.locator('.tile.tile-on').first();
  await used.locator('.tile-still').click();
  await expect(used).toHaveClass(/\bpinned\b/);
  const mark = await used.evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
  expect(mark).not.toBe('rgba(0, 0, 0, 0)');
});
