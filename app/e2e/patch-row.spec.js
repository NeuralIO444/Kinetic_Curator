// PATCH row target (KC_HANDOFF T4): the target survives a mode change, and can
// be picked while the mode is still OFF. Three KC tracks so "the other track"
// (KC-2) differs from the deliberate pick (KC-3).
import { test, expect } from '@playwright/test';

test('PATCH target is pickable while OFF and survives a mode change', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
  });
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  // Header ADD buttons are retired; tap the dimmed ghost slots to arm KC-2, KC-3.
  for (const n of [2, 3]) await page.locator('.layer-row[style*="0.35"]').filter({ hasText: `KC-${n}` }).click();

  // DOM order is top-of-stack first, so KC-1 is the last content row.
  const row = page.locator('.layer-row').filter({ has: page.locator('.layer-row-composite[title^="PATCH"]') }).last();
  const [mode, target] = await row.locator('.layer-row-composite[title^="PATCH"] select').all();

  await expect(target).toBeEnabled();
  await target.selectOption({ label: 'KC-3' });
  await expect(target.locator('option:checked')).toHaveText('KC-3');
  await mode.selectOption('field');
  await expect(target.locator('option:checked')).toHaveText('KC-3');
});
