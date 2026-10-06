// PATCH needs a second content track (KC_HANDOFF T7): with one KC the row is
// inert and says so; arming a second KC enables it.
import { test, expect } from '@playwright/test';

test('PATCH row is disabled until there are two KC tracks', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();

  const patch = page.locator('.layer-row-composite[title^="PATCH"]');
  await expect(patch.locator('select').first()).toBeDisabled();

  await page.locator('.build-layer-stack .layer-section').last().locator('.layer-add-btn').click();
  await expect(patch.locator('select').first()).toBeEnabled();
});
