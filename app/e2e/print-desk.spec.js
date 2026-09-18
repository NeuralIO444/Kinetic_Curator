// Print desk (#172): opens from OUTPUT, renders a frozen still, stacks a
// chip, APPLY posts it, all without console errors.
import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
    } catch { /* ignore */ }
  });
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  return errors;
}

test('print desk: still renders, BLUR chip applies, preview posts', async ({ page }) => {
  const errors = await boot(page);

  const outputTab = page.getByRole('tab', { name: /output/i });
  await outputTab.click();
  await expect(page.locator('.panel-output')).toBeVisible();

  // OUTPUT → PRINT opens the desk (lazy import, like Asset Studio).
  await page.getByRole('button', { name: /🖨 print/i }).click();

  // Source still renders (first open may take seconds — WORKING veil).
  const preview = page.locator('img[alt^="Print preview"]');
  await expect(preview).toBeVisible({ timeout: 30_000 });

  // Chips: off by default; BLUR on reveals its amount slider.
  const blur = page.getByRole('button', { name: 'BLUR', exact: true });
  await expect(blur).toBeVisible();
  await blur.click();

  // APPLY runs the stack on the source still → preview posts.
  const applyBtn = page.getByRole('button', { name: /apply/i });
  await applyBtn.click();
  // Header subtitle flips to "posted" once the preview PNG lands.
  await expect(page.locator('header', { hasText: 'PRINT DESK' })).toContainText(/posted/, { timeout: 30_000 });

  // The human-readable stack summary is visible by default (#277) …
  await expect(page.locator('.print-human')).toContainText(/BLUR 2/);

  // … while the raw ffmpeg filtergraph hides behind the PIPELINE toggle —
  // open it before asserting the string (it travels in the sidecar).
  await page.locator('.print-desk details summary', { hasText: 'PIPELINE' }).click();
  await expect(page.locator('.print-desk details', { hasText: 'gblur=sigma=2' })).toBeVisible();

  // Preview img is a fresh PNG (not the source blob).
  const src = await preview.getAttribute('src');
  expect(src, 'preview src is a blob URL').toMatch(/^blob:/);

  expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
});
