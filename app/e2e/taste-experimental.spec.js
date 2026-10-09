// #762 — the experimental taste switch: the 0.3 fidelity rule is the default; the artist's own switch lets a thin
// taste steer, and the Pipeline says EXPERIMENTAL for as long as it does.
import { test, expect } from '@playwright/test';

const THIN = {
  kind: 'kc-taste', version: 1, featuresVersion: 3, model: 'm', dims: 1152, trainedAt: '2026-10-08T00:00:00Z',
  labels: { likes: 20, passes: 200 },
  head: { terms: { 'scale=large': 1 }, num: {}, bias: 0, fidelity: 0.17, fitOn: 202 },
};

test('a below-bar taste is ignored by default; the switch lets it steer and says so; off puts the rule back', async ({ page }) => {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); localStorage.removeItem('kc:taste:v1'); localStorage.removeItem('kc:taste:experimental:v1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /pipeline/i }).click();
  const sw = page.getByRole('button', { name: 'experimental taste' });
  const status = page.locator('.taste-status');
  await expect(sw).toHaveAttribute('aria-pressed', 'false'); // off by default
  expect((await page.evaluate((t) => window.__kcStore.getState().importTaste(t), THIN)).ok).toBe(true);
  await expect(status).toContainText('fidelity 0.17');
  await expect(status).toContainText('fidelity too low');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-pressed', 'true');
  await expect(status).toContainText('EXPERIMENTAL: steering below the 0.3 bar');
  expect(await page.evaluate(() => localStorage.getItem('kc:taste:experimental:v1'))).toBe('1');
  await sw.click();
  await expect(status).toContainText('fidelity too low');
  expect(await page.evaluate(() => localStorage.getItem('kc:taste:experimental:v1'))).toBe(null);
});
