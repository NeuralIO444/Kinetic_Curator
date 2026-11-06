// #1943 — the asset pool's inspector: tag an asset, filter to it, bulk-tag a selection, reload and it is all still there;
// no page errors; no horizontal scroll at phone width.
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

const inspect = (page, id) => page.getByRole('button', { name: `Inspect ${id}` }).click();

test('tag one asset, filter to it, bulk-tag three, reload: all still there', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  // one asset: confirm a suggestion, add a free tag
  await page.getByPlaceholder(/filter/i).fill('org_blob_01');
  await inspect(page, 'org_blob_01');
  const insp = page.getByTestId('asset-inspector');
  await expect(insp).toBeVisible();
  await expect(insp.getByLabel('role fits')).toBeVisible();
  await expect(insp.getByLabel('measured traits')).toContainText('mass');
  const free = insp.getByLabel('Add a free tag');
  await free.fill('plant');
  await free.press('Enter');
  await expect(insp.locator('.insp-chip.confirmed', { hasText: 'plant' })).toBeVisible();
  // the text filter finds it by the artist's tag
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByPlaceholder(/filter/i).fill('plant');
  await expect(page.locator('.tile')).toHaveCount(1);
  await expect(page.locator('.tile-id')).toHaveText('org_blob_01');
  // bulk: three assets get one free tag. The word must stay OUTSIDE the
  // asset vocabulary: a raw tag with a canonical home canonicalizes on
  // store, so the raw-string filter stops matching it ('kanji' gained a
  // home in the letter term in #1998 and broke exactly this line).
  await page.getByPlaceholder(/filter/i).fill('typ_');
  const picks = page.locator('.tile-pick');
  await picks.nth(0).click();
  await picks.nth(1).click();
  await picks.nth(2).click();
  const bulk = page.getByTestId('asset-bulk');
  await expect(bulk).toContainText('3 selected');
  const bfree = bulk.getByLabel('Add a free tag');
  await bfree.fill('zebra');
  await bfree.press('Enter');
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.getByPlaceholder(/filter/i).fill('zebra');
  await expect(page.locator('.tile')).toHaveCount(3);
  // the facet drawer: counts, and a facet filter narrows
  await page.getByPlaceholder(/filter/i).fill('');
  await page.getByRole('button', { name: /tags & roles/i }).click();
  const drawer = page.getByLabel('tag and role filters');
  const chip = drawer.locator('[data-facet="form"] .cat-chip').first();
  const count = Number((await chip.locator('.cat-chip-count').textContent()).trim());
  await chip.click();
  await expect(page.locator('.tile')).toHaveCount(count);
  await expect(page.locator('.filter-chip')).toHaveCount(1);
  await page.getByLabel(/Remove filter/).click();
  // reload: the edits are in the autosaved project
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(() => Object.keys(window.__kcStore.getState().assetTags).length);
  expect(saved).toBe(4);
  await page.reload();
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /assets/i }).click();
  expect(await page.evaluate(() => Object.keys(window.__kcStore.getState().assetTags).length)).toBe(4);
  await page.getByPlaceholder(/filter/i).fill('zebra');
  await expect(page.locator('.tile')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('solo, rename and delete are in-page (no browser dialogs); phone width does not scroll sideways', async ({
  page,
}) => {
  const errors = await boot(page, { width: 390, height: 844 });
  page.on('dialog', () => {
    throw new Error('a native dialog opened');
  });
  await page.getByRole('button', { name: 'Solo geo_circle_01' }).click();
  expect(
    await page.evaluate(() => Object.values(window.__kcStore.getState().enabledAssets).filter(Boolean).length),
  ).toBe(1);
  await inspect(page, 'geo_circle_01');
  await expect(page.getByTestId('asset-inspector')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close inspector' }).click();
  // an import: rename and delete ask in the page, not in a browser dialog
  const uid = await page.evaluate(() => {
    const st = window.__kcStore.getState();
    st.ingestAsset('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#000"/></svg>', 'e2e');
    return window.__kcStore.getState().customAssets.at(-1).id;
  });
  await page.getByPlaceholder(/filter/i).fill('e2e');
  await inspect(page, uid);
  const insp = page.getByTestId('asset-inspector');
  await insp.getByRole('button', { name: 'rename', exact: true }).click();
  await insp.getByLabel(/New overlay id/).fill('e2e_renamed');
  await insp.getByRole('button', { name: 'rename', exact: true }).last().click();
  await expect
    .poll(() => page.evaluate(() => window.__kcStore.getState().customAssets.map((a) => a.id)))
    .toContain('user:e2e_renamed');
  await page.getByPlaceholder(/filter/i).fill('e2e_renamed');
  await inspect(page, 'user:e2e_renamed');
  await page.getByTestId('asset-inspector').getByRole('button', { name: 'delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'remove' }).click();
  await expect.poll(() => page.evaluate(() => window.__kcStore.getState().customAssets.length)).toBe(0);
  expect(errors).toEqual([]);
});
