// #107 §6 — a document the app cannot read must never be silently applied.
import { test, expect } from '@playwright/test';
import { waitForLiveFrame } from './gl-helpers.js';

async function boot(page, autosaveRaw) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((raw) => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.removeItem('kc:project:quarantine');
      sessionStorage.removeItem('kc:project:restored-session');
      if (raw === null) localStorage.removeItem('kc:project:v1');
      else localStorage.setItem('kc:project:v1', raw);
    } catch { /* ignore */ }
  }, autosaveRaw);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  return errors;
}

test('unreadable autosave is quarantined, defaults boot, MasterBar says so', async ({ page }) => {
  const errors = await boot(page, '{ this is not json');

  // The canvas must be up on factory defaults, not blank.
  await waitForLiveFrame(page);

  // The operator must be told, or they will believe the set is being saved.
  await expect(page.locator('.master-bar')).toContainText(/RESTORE FAILED/);

  // The bad blob is kept for recovery and removed from the boot path, so the
  // next reload does not fail the same way.
  const state = await page.evaluate(() => ({
    quarantined: localStorage.getItem('kc:project:quarantine'),
    autosave: localStorage.getItem('kc:project:v1'),
  }));
  expect(state.quarantined, 'raw blob kept for recovery').toContain('not json');
  expect(state.autosave, 'poison must not be retried next boot').toBeNull();

  expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('a good autosave still restores and shows no warning', async ({ page }) => {
  const doc = JSON.stringify({
    version: 1, savedAt: new Date().toISOString(),
    doc: {
      version: 1, seed: 0x1a4f, paletteId: 'praystation', quality: 'balanced',
      layoutParams: { mode: 'grid', count: 137 },
    },
  });
  const errors = await boot(page, doc);
  await waitForLiveFrame(page);
  await expect(page.locator('.footer-bar')).toContainText(/grid/);
  await expect(page.locator('.master-bar')).not.toContainText(/RESTORE FAILED|UNSAVED/);
  expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
});
