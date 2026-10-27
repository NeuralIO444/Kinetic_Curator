// PATCH needs a second content track (KC_HANDOFF T7): with one KC the block is
// inert and says so; arming a second KC enables it.
import { test, expect } from '@playwright/test';

test('PATCH row is disabled until there are two KC tracks', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();

  // Factory boots with one KC track, active so its block is expanded.
  const patch = page.locator('.strata-composite[title^="PATCH"]');
  await expect(patch.locator('select').first()).toBeDisabled();

  // #1203 — one tap on ADD STRATUM arms a second KC track (last-used defaults).
  await page.locator('.build-layer-stack .strata-add').click();
  await expect(patch.locator('select').first()).toBeEnabled();
});
