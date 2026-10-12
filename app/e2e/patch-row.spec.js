// PATCH block target (KC_HANDOFF T4): the target survives a mode change, and can
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
  // #1203 — one tap on ADD STRATUM arms a KC track (last-used defaults).
  const addSlot = page.locator('.build-layer-stack .strata-add');
  await addSlot.click();
  await addSlot.click(); // KC-2, KC-3

  // Blocks are listed frontmost first, so KC-1 (the bottom track) is the
  // LAST content block. Tap = edit: its header opens the block inline.
  const blocks = page.locator('.strata-block.strata-content:not(.strata-pattern)');
  await expect(blocks).toHaveCount(3);
  const kc1 = blocks.nth(2);
  await kc1.locator('.track-numeral').click();
  const patchRow = kc1.locator('.strata-composite[title^="PATCH"]');
  await expect(patchRow).toBeVisible();
  const [mode, target] = await patchRow.locator('select').all();

  await expect(target).toBeEnabled();
  await target.selectOption({ label: 'KC-3' });
  await expect(target.locator('option:checked')).toHaveText('KC-3');
  await mode.selectOption('field');
  await expect(target.locator('option:checked')).toHaveText('KC-3');
});
