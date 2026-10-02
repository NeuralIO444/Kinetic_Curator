// #652 — X downloads the project. E still toggles Evolve and does not download.
import { test, expect } from '@playwright/test';

test('X exports the project, E still evolves', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /director/i }).click();
  const evolve = page.locator('.panel-davis').getByRole('button', { name: /^(EVOLVE|STOP)$/ });
  await expect(evolve).toHaveText('EVOLVE');

  await page.keyboard.press('e');
  await expect(evolve).toHaveText('STOP', { timeout: 3_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 5_000 });
  await page.keyboard.press('x');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/project\.json$/);
  await expect(evolve).toHaveText('STOP');
});
