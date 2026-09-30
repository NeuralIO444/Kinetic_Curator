// e2e/davis-regroup.spec.js — #616: DAVIS reads in labelled sections, every
// existing control is still there, and EVOLVE shows live progress.
import { test, expect } from '@playwright/test';

test('DAVIS: VOICES / GENERATE / PERFORM sections, controls intact, EVOLVE progress', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /davis/i }).click();
  const panel = page.locator('.panel-davis');

  // three labelled sections, in order
  await expect(panel.locator('.davis-section-label')).toHaveText(['VOICES', 'GENERATE', 'PERFORM']);

  // nothing deleted: every existing control is findable
  await expect(panel.locator('.voice-chip.flagship')).toHaveCount(4);
  for (const name of ['EVOLVE', 'FAVORITE', 'NEW SEED', 'SPATIAL', 'COLOR', 'ASSET', 'NOISE']) {
    await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  }

  // stopped: honest idle
  await expect(panel.locator('.davis-progress')).toContainText('EVOLVE idle');

  // running: live progress
  await panel.getByRole('button', { name: 'EVOLVE', exact: true }).click();
  const progress = panel.locator('.davis-progress.running');
  await expect(progress).toBeVisible();
  await expect(progress).toContainText('GEN');
  await expect(progress).toContainText('SEED');
  await expect(progress).toContainText('S/GEN');
  await expect(progress).toContainText('SEEN');
  // generations actually advance (evolve interval default 2 s)
  await expect.poll(async () => Number((await progress.locator('.davis-progress-cell b').first().textContent()) || 0), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

  // stopped again: last-run summary
  await panel.getByRole('button', { name: 'STOP', exact: true }).click();
  await expect(panel.locator('.davis-progress')).toContainText(/last run: \d+ gen/);
});
