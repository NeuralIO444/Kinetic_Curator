// #2282 — the SHAPE rung (docs/design/wetlab-ladder-spec.md §4, §6, §12.4–12.6). KIN deals one style's primitives and
// lands the lead on the stage; tapping keeps a shape on the project's shelf and fills a pip; the third keep opens
// CONSTRUCT. The shelf survives a reload; tiles breathe, and stand still under reduced motion. No page errors.
// Set KIN_SHOTS=<dir> to save screenshots.
/* global process: readonly */
import { test, expect } from '@playwright/test';

const shot = async (page, name) => {
  if (process.env.KIN_SHOTS) await page.screenshot({ path: `${process.env.KIN_SHOTS}/${name}.png` });
};

async function boot(page, size, { reducedMotion = 'no-preference' } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.emulateMedia({ reducedMotion });
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

async function openEmptyLab(page) {
  await page.locator('.cat-chip', { hasText: /^USER/ }).click();
  const open = page.getByTestId('open-wetlab-empty');
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByTestId('wet-lab')).toBeVisible();
  // the lab opens on the highest open rung; the SHAPE strip is one tap away once CONSTRUCT is open
  await page.getByTestId('rung-shape').click();
  await expect(page.getByTestId('shape-strip')).toBeVisible();
}

const styles = async (page) =>
  page.getByTestId('shape-tile').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-style')))]);

test('KIN deals one style, lands the lead on the stage, and a second press deals again', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  await page.getByTestId('shape-kin').click();
  const n = await page.getByTestId('shape-tile').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(6);
  expect((await styles(page)).length).toBe(1);
  const first = await page.getByTestId('shape-tile').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  const lead = first[0].split(' · ')[0];
  const on = await page.evaluate((id) => !!window.__kcStore.getState().enabledAssets[id], lead);
  expect(on).toBe(true); // the lead landed on the stage
  await expect(page.getByTestId('rung-pips-shape')).toHaveAttribute('data-filled', '0'); // …and is not a keep
  let differs = false;
  for (let i = 0; i < 4 && !differs; i += 1) {
    await page.getByTestId('shape-kin').click();
    const next = await page.getByTestId('shape-tile').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
    differs = JSON.stringify(next) !== JSON.stringify(first);
  }
  expect(differs).toBe(true);
  await shot(page, 's1-kin-hand');
  expect(errors).toEqual([]);
});

test('three keeps fill the pips and open CONSTRUCT; the shelf and the rung survive a reload', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  await page.getByTestId('shape-kin').click();
  await expect(page.getByTestId('rung-construct')).toBeDisabled();
  const tiles = page.getByTestId('shape-tile');
  expect(await tiles.count()).toBeGreaterThanOrEqual(3);
  for (const [i, filled] of [
    [0, '1'],
    [1, '2'],
  ]) {
    await tiles.nth(i).click();
    await expect(page.getByTestId('rung-pips-shape')).toHaveAttribute('data-filled', filled);
    await expect(page.getByTestId('rung-construct')).toBeDisabled();
  }
  await tiles.nth(1).click(); // the same shape again is 'already': not a second keep
  await expect(page.getByTestId('rung-pips-shape')).toHaveAttribute('data-filled', '2');
  await tiles.nth(2).click();
  await expect(page.getByTestId('rung-pips-shape')).toHaveAttribute('data-filled', '3');
  await expect(page.getByTestId('rung-construct')).toBeEnabled();
  await expect(page.getByTestId('shape-shelf-tile')).toHaveCount(3);
  await shot(page, 's2-construct-open');

  // CUR narrows from the last kept shape: same style, never that shape
  await page.getByTestId('shape-cur').click();
  const curStyles = await styles(page);
  expect(curStyles.length).toBeLessThanOrEqual(1);

  // the shelf is part of the project; the opened rung is the artist's
  const shelf = await page.evaluate(() => window.__kcStore.getState().shapeShelf.length);
  expect(shelf).toBe(3);
  await page.reload();
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /assets/i }).click();
  await openEmptyLab(page);
  await expect(page.getByTestId('rung-construct')).toBeEnabled();
  await expect(page.getByTestId('shape-shelf-tile')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('tiles breathe; under reduced motion they stand still', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  await page.getByTestId('shape-kin').click();
  const anim = (p) =>
    p
      .getByTestId('shape-tile')
      .first()
      .locator('svg')
      .evaluate((el) => getComputedStyle(el).animationName);
  expect(await anim(page)).toBe('kc-shape-breathe');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await anim(page)).toBe('none');
  expect(errors).toEqual([]);
});

test('phone width: the strip wraps and the lab never scrolls sideways', async ({ page }) => {
  const errors = await boot(page, { width: 390, height: 844 });
  await openEmptyLab(page);
  await page.getByTestId('shape-kin').click();
  await expect(page.getByTestId('shape-tile').first()).toBeVisible();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(sideways).toBe(false);
  await shot(page, 's3-phone');
  expect(errors).toEqual([]);
});
