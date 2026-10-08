// #1127 — the tap-name dialog on SCALE / ROTATE / ALPHA, and ROTATE's SPIN | RANGE row.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!window.__kcStore)).toBe(true);
  await page.getByRole('tab', { name: /build/i }).first().click();
}
const row = (page, name) => page.locator('.param-block .range-row', { has: page.locator('.range-label', { hasText: new RegExp(`^${name}$`) }) });
const spinOf = (page) => page.evaluate(() => window.__kcStore.getState().layoutParams.rotateSpin);
const dialog = (page) => page.getByRole('dialog');

test('a single tap on the name opens the dialog; a double-click still resets and opens nothing', async ({ page }) => {
  await boot(page);
  const alpha = row(page, 'ALPHA');
  await alpha.locator('.range-label').dblclick();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);
  await alpha.locator('.range-label').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('heading', { name: 'ALPHA' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
});

test('nothing changes until APPLY: cancel and Escape leave the span alone; APPLY widens it, and a reload puts it back', async ({ page }) => {
  await boot(page);
  const rot = row(page, 'ROTATE');
  const inputs = rot.locator('input[type="range"]');
  // ROTATE starts as a SPIN row; take RANGE so the handles are there to measure
  await rot.locator('.range-label').click();
  await dialog(page).getByRole('button', { name: 'RANGE', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'APPLY' }).click();
  await expect(inputs).toHaveCount(2);
  await expect(inputs.first()).toHaveAttribute('min', '-180');

  await rot.locator('.range-label').click();
  await dialog(page).getByLabel('SLIDER MIN').fill('-400');
  await dialog(page).getByRole('button', { name: 'CANCEL' }).click();
  await expect(inputs.first()).toHaveAttribute('min', '-180');

  await rot.locator('.range-label').click();
  await dialog(page).getByLabel('SLIDER MIN').fill('-400');
  await dialog(page).getByLabel('SLIDER MAX').fill('400');
  await dialog(page).getByRole('button', { name: 'APPLY' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(inputs.first()).toHaveAttribute('min', '-400');
  await expect(inputs.first()).toHaveAttribute('max', '400');

  await page.reload();
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).first().click();
  const again = row(page, 'ROTATE').locator('input[type="range"]');
  await expect.poll(async () => again.first().getAttribute('min')).toBe('-180');
});

test('a span past the hard limit, or backwards, is refused in words and nothing is applied', async ({ page }) => {
  await boot(page);
  await row(page, 'SCALE').locator('.range-label').click();
  await dialog(page).getByLabel('SLIDER MAX').fill('99');
  await dialog(page).getByRole('button', { name: 'APPLY' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText(/Stay within/);
  await dialog(page).getByLabel('SLIDER MAX').fill('0.01');
  await dialog(page).getByRole('button', { name: 'APPLY' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText(/above MIN/);
  await page.keyboard.press('Escape');
  await expect(row(page, 'SCALE').locator('input[type="range"]').first()).toHaveAttribute('max', '3');
});

test('ROTATE is a range row by default (#1128: spin is chosen, drift is given); SPIN opens on a speed, takes another, and RESET returns to RANGE', async ({ page }) => {
  await boot(page);
  const rot = row(page, 'ROTATE');
  await expect.poll(() => spinOf(page)).toBe(0);
  await expect(rot.locator('.spin-readout')).toHaveCount(0);
  await expect(rot.locator('input[type="range"]')).toHaveCount(2);

  await rot.locator('.range-label').click();
  await expect(dialog(page).getByRole('button', { name: 'RANGE', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog(page).getByRole('button', { name: 'SPIN', exact: true }).click();
  await expect(dialog(page).getByLabel('SPEED (REV/S)')).toHaveValue('0.05'); // the offered start, not the default 0
  await dialog(page).getByRole('button', { name: 'APPLY' }).click();
  await expect.poll(() => spinOf(page)).toBeCloseTo(0.05, 5);
  await expect(rot.locator('.spin-readout')).toContainText('0.05 rev/s');
  await expect(rot.locator('input[type="range"]')).toHaveCount(1);

  await rot.locator('.range-label').click();
  await dialog(page).getByLabel('SPEED (REV/S)').fill('0.2');
  await dialog(page).getByRole('button', { name: 'APPLY' }).click();
  await expect.poll(() => spinOf(page)).toBeCloseTo(0.2, 5);
  await expect(rot.locator('.spin-readout')).toContainText('0.20 rev/s');

  await rot.locator('.range-label').click();
  await dialog(page).getByLabel('SPEED (REV/S)').fill('5');
  await dialog(page).getByRole('button', { name: 'APPLY' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText(/SPEED/);
  await dialog(page).getByRole('button', { name: 'RESET DEFAULT' }).click();
  await expect.poll(() => spinOf(page)).toBe(0);
  await expect(rot.locator('input[type="range"]')).toHaveCount(2);
});
