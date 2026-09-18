// e2e/recipe-roundtrip.spec.js — #307: readable recipes round-trip.
//
// What this proves (and how): a kept render (snapshot) in OUTPUT exposes its
// recipe as copyable kc-recipe/1 text — read back here through the real
// clipboard API with permissions granted, so the copy path is the one Matt
// will use. Then the seed is bumped away and the pasted recipe is applied
// through PASTE RECIPE, and the footer seed proves the exact scene came back.
import { test, expect } from '@playwright/test';

test.describe('readable recipes (#307)', () => {
  test('snapshot recipe copies as kc-recipe/1 and pastes back the exact scene', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch { /* ignore */ }
    });

    await page.goto('/');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

    const outputTab = page.getByRole('tab', { name: /output/i });
    await outputTab.click();
    await expect(page.locator('.panel-output')).toBeVisible();

    // Keep the current render.
    await page.getByRole('button', { name: /snap/i }).first().click();
    const snap = page.locator('.snapshot-strip .snap').first();
    await expect(snap).toBeVisible({ timeout: 30_000 });

    // Copy the kept render's recipe as plain text.
    await snap.getByRole('button', { name: /recipe/i }).click();
    const recipeText = await page.evaluate(() => navigator.clipboard.readText());
    expect(recipeText.startsWith('kc-recipe/1')).toBe(true);
    expect(recipeText).toMatch(/^seed: 0x[0-9a-f]+$/m);
    expect(recipeText).toMatch(/^palette: /m);
    expect(recipeText).toMatch(/^seedOffset\.spatial: /m);
    const seedHex = recipeText.match(/^seed: 0x([0-9a-f]+)$/m)[1];

    const footer = page.locator('.footer-bar');
    await expect(footer).toContainText(new RegExp(`seed:${seedHex}`, 'i'));

    // Bump the seed away from the kept scene ('n' is debounced while a
    // render is in flight, so retry until the footer moves).
    let bumped = false;
    for (let i = 0; i < 5 && !bumped; i++) {
      await page.keyboard.press('n');
      await page.waitForTimeout(400);
      const footerText = (await footer.textContent()) || '';
      bumped = !footerText.toLowerCase().includes(`seed:${seedHex}`);
    }
    expect(bumped).toBe(true);

    // Paste the recipe back and apply: the exact scene returns.
    await page.getByRole('button', { name: /paste recipe/i }).click();
    await page.getByLabel(/recipe text to apply/i).fill(recipeText);
    await page.getByRole('button', { name: /^apply recipe$/i }).click();

    await expect(page.locator('.panel-output')).toContainText(/recipe applied/i);
    await expect(footer).toContainText(new RegExp(`seed:${seedHex}`, 'i'));
  });

  test('garbage in the paste box is rejected with a message, scene untouched', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch { /* ignore */ }
    });

    await page.goto('/');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

    const outputTab = page.getByRole('tab', { name: /output/i });
    await outputTab.click();
    await expect(page.locator('.panel-output')).toBeVisible();

    const footer = page.locator('.footer-bar');
    const before = await footer.textContent();

    await page.getByRole('button', { name: /paste recipe/i }).click();
    await page.getByLabel(/recipe text to apply/i).fill('not a recipe at all');
    await page.getByRole('button', { name: /^apply recipe$/i }).click();

    await expect(page.locator('.panel-output')).toContainText(/recipe:/i);
    expect(await footer.textContent()).toBe(before);
  });
});
