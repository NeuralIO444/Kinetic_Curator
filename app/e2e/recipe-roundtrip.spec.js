// e2e/recipe-roundtrip.spec.js — #307: readable recipes round-trip.
//
// What this proves (and how): a kept render (snapshot) in OUTPUT exposes its
// recipe as copyable kc-recipe/3 text — read back here through the real
// clipboard API with permissions granted, so the copy path is the one Matt
// will use. Then the seed is bumped away and the pasted recipe is applied
// through PASTE RECIPE, and the footer seed proves the exact scene came back.
import { test, expect } from '@playwright/test';

test.describe('readable recipes (#307)', () => {
  test('snapshot recipe copies as kc-recipe/3 and pastes back the exact scene', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch {
        /* ignore */
      }
    });

    await page.goto('/?boot=factory');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

    const outputTab = page.getByRole('tab', { name: /pipeline|output/i });
    await outputTab.click();
    await expect(page.locator('.panel-output')).toBeVisible();

    // Keep the current render.
    await page.getByRole('button', { name: /snap/i }).first().click();
    const snap = page.locator('.snapshot-strip .snap').first();
    await expect(snap).toBeVisible({ timeout: 30_000 });

    // Copy the kept render's recipe as plain text.
    await snap.getByRole('button', { name: /recipe/i }).click();
    const recipeText = await page.evaluate(() => navigator.clipboard.readText());
    expect(recipeText.startsWith('kc-recipe/3')).toBe(true);
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
    await page.getByLabel(/recipe text or link to apply/i).fill(recipeText);
    await page.getByRole('button', { name: /^apply$/i }).click();

    await expect(page.locator('.panel-output')).toContainText(/recipe applied/i);
    await expect(footer).toContainText(new RegExp(`seed:${seedHex}`, 'i'));
  });

  test('garbage in the paste box is rejected with a message, scene untouched', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch {
        /* ignore */
      }
    });

    await page.goto('/?boot=factory');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

    const outputTab = page.getByRole('tab', { name: /pipeline|output/i });
    await outputTab.click();
    await expect(page.locator('.panel-output')).toBeVisible();

    const footer = page.locator('.footer-bar');
    const before = await footer.textContent();

    await page.getByRole('button', { name: /paste recipe/i }).click();
    await page.getByLabel(/recipe text or link to apply/i).fill('not a recipe at all');
    await page.getByRole('button', { name: /^apply$/i }).click();

    await expect(page.locator('.panel-output')).toContainText(/recipe:/i);
    expect(await footer.textContent()).toBe(before);
  });

  // #2324 — a kc-r/3 link: copied from the app (the async deflate path), then opened in a FRESH page through #r=
  // (the async boot path: bootFromHash awaits the decode before the autosave read). The footer seed proves the scene.
  test('COPY LINK writes a kc-r/3 link that boots a fresh page into the same scene', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch {
        /* ignore */
      }
    });

    await page.goto('/?boot=factory');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('tab', { name: /pipeline|output/i }).click();
    await expect(page.locator('.panel-output')).toBeVisible();

    const footer = page.locator('.footer-bar');
    const seedOf = async (loc) =>
      ((((await loc.textContent()) || '').match(/seed:([0-9a-f]+)/i) || [])[1] || '').toLowerCase();
    const factorySeed = await seedOf(footer);
    expect(factorySeed).toBeTruthy();

    // Move off the factory seed ('n' is debounced while a render is in flight, so retry until the footer moves):
    // a fresh page boots on the factory seed, so only a link that really applied can match the bumped one.
    let seedHex = factorySeed;
    for (let i = 0; i < 5 && seedHex === factorySeed; i++) {
      await page.keyboard.press('n');
      await page.waitForTimeout(400);
      seedHex = await seedOf(footer);
    }
    expect(seedHex).not.toBe(factorySeed);

    await page.getByRole('button', { name: /copy link/i }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#r=kc-r\/3\.[A-Za-z0-9_-]+$/);

    const fresh = await context.newPage();
    await fresh.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch {
        /* ignore */
      }
    });
    await fresh.goto(link);
    await expect(fresh.locator('.app')).toBeVisible({ timeout: 30_000 });
    await expect(fresh.locator('.footer-bar')).toContainText(new RegExp(`seed:${seedHex}`, 'i'));
    expect(fresh.url()).not.toContain('#r='); // the fragment is consumed once applied (#534)
  });
});
