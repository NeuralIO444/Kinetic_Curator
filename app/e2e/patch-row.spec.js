// PATCH row target (KC_HANDOFF T4): the target survives a mode change, and can
// be picked while the mode is still OFF. Three KC tracks so "the other track"
// (KC-2) differs from the deliberate pick (KC-3).
import { test, expect } from '@playwright/test';

test('PATCH target is pickable while OFF and survives a mode change', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  // Mockup C (#1014 rebuild): no ghost rows — the Content section "+" arms tracks.
  const contentPlus = page.locator('.build-layer-stack .layer-section').nth(0).locator('.layer-add-btn');
  for (const n of [2, 3]) await contentPlus.click();

  // Section order is ascending, so KC-1 is the first content row.
  const row = page.locator('.layer-row').filter({ has: page.locator('.layer-row-composite[title^="PATCH"]') }).first();
  const [mode, target] = await row.locator('.layer-row-composite[title^="PATCH"] select').all();

  await expect(target).toBeEnabled();
  await target.selectOption({ label: 'KC-3' });
  await expect(target.locator('option:checked')).toHaveText('KC-3');
  await mode.selectOption('field');
  await expect(target.locator('option:checked')).toHaveText('KC-3');
});
