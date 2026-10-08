// e2e/director-regroup.spec.js — #616: DIRECTOR reads in labelled sections, every
// existing control is still there, and EVOLVE shows its progress box (the
// generation counting itself is selfchecked: it depends on real time + the governor).
import { test, expect } from '@playwright/test';

test('DIRECTORS: VOICES / GENERATE / PERFORM sections, controls intact, EVOLVE progress', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /director/i }).click();
  const panel = page.locator('.panel-davis');

  // five labelled sections, in order (UX-7: TRAILS surfaces the ACCUM toggle
  // + gestures in-panel, so FREEZE/CLEAR/SWELL are reachable from DIRECTOR)
  await expect(panel.locator('.davis-section-label')).toHaveText(['voices', 'generate', 'perform', 'trails', 'the room']); // #1126: the two Directors close the panel

  // nothing deleted: every existing control is findable
  await expect(panel.locator('.voice-chip.flagship')).toHaveCount(4);
  for (const name of ['EVOLVE', 'favorite', 'new seed', 'SPATIAL', 'COLOR', 'ASSET', 'NOISE']) {
    await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  }

  // UX-7: the gesture row is always reachable — ACCUM toggle in-panel, and
  // FREEZE/CLEAR/SWELL wait on ACCUM (disabled, not gone) instead of vanishing
  const accumBtn = panel.getByRole('button', { name: 'ACCUM', exact: true });
  await expect(accumBtn).toBeVisible();
  for (const name of ['FREEZE', 'CLEAR', 'SWELL']) {
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  await accumBtn.click();
  for (const name of ['FREEZE', 'CLEAR', 'SWELL']) {
    await expect(panel.getByRole('button', { name, exact: true })).toBeEnabled();
  }
  await accumBtn.click(); // back off — the rest of the spec expects ACCUM off

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
  // Whether generations ADVANCE is proven deterministically in
  // data/evolveProgress.selfcheck.mjs: automatic evolve pauses under the
  // governor's slowRender, which CI's software GL hits, so a wall-clock wait
  // here would test the runner, not the feature.

  // stopped again: last-run summary (0 generations is a valid run)
  await panel.getByRole('button', { name: 'STOP', exact: true }).click();
  await expect(panel.locator('.davis-progress')).toContainText(/last run: \d+ gen/);
});
