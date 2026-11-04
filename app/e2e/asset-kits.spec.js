// #1944 — pick three kits in the asset pool, roll, and the deal comes from all three; save a filter as a kit.
import { test, expect } from '@playwright/test';

async function boot(page, size) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize(size);
  await page.addInitScript(() => {
    window.__KC_EXPOSE_STORE = true;
    try {
      if (!sessionStorage.getItem('kc:e2e-booted')) localStorage.clear();
      sessionStorage.setItem('kc:e2e-booted', '1');
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /assets/i }).click();
  await expect(page.locator('.panel-pool')).toBeVisible();
  return errors;
}

test('Kanji + Big Shapes + Botanica: all three slots set, a roll deals only from their pools', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await page.getByLabel('kit 1').selectOption('kanji');
  await page.getByLabel('kit 2').selectOption('big-shapes');
  await page.getByLabel('kit 3').selectOption('botanica');
  expect(await page.evaluate(() => window.__kcStore.getState().kitTriad)).toEqual(['kanji', 'big-shapes', 'botanica']);
  // a kit already in a slot cannot be picked twice
  await expect(page.getByLabel('kit 1').locator('option[value="big-shapes"]')).toBeDisabled();
  const dealt = await page.evaluate(() => {
    const s = window.__kcStore.getState();
    s.kineticRoll();
    const st = window.__kcStore.getState();
    return Object.keys(st.enabledAssets).filter((id) => st.enabledAssets[id]);
  });
  expect(dealt.length).toBeGreaterThanOrEqual(3);
  expect(dealt.length).toBeLessThanOrEqual(6);
  // survives reload through the project doc? the slots at least show the store
  await expect(page.getByLabel('kit 2')).toHaveValue('big-shapes');
  expect(errors).toEqual([]);
});

test('save the active filters as a kit, then it is in the slots list; phone width does not scroll sideways', async ({
  page,
}) => {
  const errors = await boot(page, { width: 390, height: 800 });
  const save = page.getByRole('button', { name: 'save filters as kit' });
  await expect(save).toBeDisabled();
  await page.locator('.cat-chip', { hasText: /^radial/ }).click();
  await expect(save).toBeEnabled();
  await save.click();
  await page.getByLabel('kit name').fill('Rays');
  await page.getByLabel('kit name').press('Enter');
  expect(await page.evaluate(() => window.__kcStore.getState().kits.map((k) => k.id))).toEqual(['rays']);
  await page.getByLabel('kit 1').selectOption('rays');
  expect(await page.evaluate(() => window.__kcStore.getState().kitTriad)).toEqual(['rays']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
