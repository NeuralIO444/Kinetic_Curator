// PATCH under the one-content law (#2038): PATCH links two KC tracks,
// and there is only ever ONE content stratum now — so the row is
// honestly unavailable: its title says why ("PATCH needs a second KC
// track") and both selects stay disabled. ADD STRATUM at the content
// cap cannot mint a second KC track either; the tap falls forward to
// the next type with room.
//
// (Pre-#2038 this spec picked KC-2 as the target and watched it survive
// a mode change; that world is exactly what the rebuild retired.)
import { test, expect } from '@playwright/test';

test('PATCH is honestly unavailable with one content stratum', async ({ page }) => {
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

  const blocks = page.locator('.strata-block.strata-content:not(.strata-pattern)');
  await expect(blocks).toHaveCount(1);

  // One tap on ADD STRATUM: no second KC track appears — the content
  // cap is one, and the add falls forward to another stratum type.
  const addSlot = page.locator('.build-layer-stack .strata-add');
  await addSlot.click();
  await expect(blocks).toHaveCount(1);

  // The one KC block is the active editing block; its PATCH row names
  // the blocker and both of its selects are disabled.
  const kc1 = blocks.nth(0);
  const patchRow = kc1.locator('.strata-composite[title^="PATCH"]');
  await expect(patchRow).toBeVisible();
  await expect(patchRow).toHaveAttribute('title', 'PATCH needs a second KC track');
  const [mode, target] = await patchRow.locator('select').all();
  await expect(mode).toBeDisabled();
  await expect(target).toBeDisabled();
});
