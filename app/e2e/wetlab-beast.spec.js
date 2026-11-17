// #2232 step 7 — the WetLab's beast KIN / CUR strip, under the bank rail: KIN lands a beast in the asset pool and deals a
// walking hand; CUR narrows from the beast last banked; "clear unkept" takes back what was never turned on.
// No page errors; no horizontal scroll at phone width. Set KIN_SHOTS=<dir> to save screenshots of each state.
/* global process: readonly */
import { test, expect } from '@playwright/test';

const shot = async (page, name) => {
  if (process.env.KIN_SHOTS) await page.screenshot({ path: `${process.env.KIN_SHOTS}/${name}.png` });
};

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
      localStorage.setItem(
        'kc.wetLabLadder.v1',
        JSON.stringify({ v: 1, kept: {}, open: { shape: true, construct: true, creature: true, rig: true } }),
      ); // #2281 — this suite works the creature and rig rungs: open them
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
  await page.getByTestId('rung-rig').click(); // #2281 — the rail shows one rung's strip at a time
}

const beastsInPool = (page) =>
  page.evaluate(
    () => window.__kcStore.getState().customAssets.filter((a) => /^user:beast-[0-9a-f]{8}$/.test(a.id)).length,
  );

test('KIN lands a beast in the pool and deals a walking hand; a tap banks another; clear unkept takes them back', async ({
  page,
}) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  await expect(page.getByTestId('beast-strip')).toBeVisible();
  await expect(page.getByTestId('beast-tile')).toHaveCount(0);
  await expect(page.getByTestId('beast-cur')).toBeDisabled(); // no beast in the pool to narrow from
  await shot(page, 'b1-empty');

  await page.getByTestId('beast-kin').click();
  await expect(page.getByTestId('beast-tile')).toHaveCount(6);
  expect(await beastsInPool(page)).toBe(1); // the lead beast landed in the pool at once
  await expect(page.getByTestId('beast-tile').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('beast-cur')).toBeEnabled();
  await shot(page, 'b2-kin-lands');

  // the tiles walk: a tile's drawing changes while we watch
  const tileD = () => page.getByTestId('beast-tile').nth(2).locator('path').getAttribute('d');
  const first = await tileD();
  await expect.poll(tileD, { timeout: 8000 }).not.toBe(first);

  const firstHand = await page.getByTestId('beast-tile').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  await page.getByTestId('beast-kin').click();
  const secondHand = await page.getByTestId('beast-tile').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  expect(secondHand).not.toEqual(firstHand); // a new press, a new hand
  expect(await beastsInPool(page)).toBe(2);

  await page.getByTestId('beast-tile').nth(1).click();
  expect(await beastsInPool(page)).toBe(3);
  await expect(page.getByTestId('beast-clear')).toContainText('3');
  await page.getByTestId('beast-clear').click();
  expect(await beastsInPool(page)).toBe(0);
  await expect(page.getByTestId('beast-clear')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('CUR narrows from the beast last banked: close neighbours, one pick, a tap banks and walks on', async ({
  page,
}) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  await page.getByTestId('beast-kin').click(); // the lead beast lands; CUR narrows from it
  const cap = page.getByTestId('beast-cur-cap');
  await expect(cap).toHaveText('NEAR');
  await cap.click();
  await expect(cap).toHaveText('LOOSE');
  await cap.click();
  await expect(cap).toHaveText('TIGHT');
  await cap.click();
  await expect(cap).toHaveText('NEAR');

  await page.getByTestId('beast-cur').click();
  const n = await page.getByTestId('beast-tile').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(3);
  await expect(page.getByTestId('beast-pick')).toHaveCount(1);
  await shot(page, 'b3-cur-hand');

  const before = await beastsInPool(page);
  await page.getByTestId('beast-tile').first().click();
  expect(await beastsInPool(page)).toBe(before + 1);
  await expect(page.getByTestId('beast-cur')).toBeEnabled(); // walk on from the one just banked
  await page.getByTestId('beast-cur').click();
  await expect(page.getByTestId('beast-tile').first()).toBeVisible();
  await shot(page, 'b4-cur-walked-on');
  expect(errors).toEqual([]);
});

test('the width pill steps TAME → LOOSE → WILD → FERAL and the hand follows it', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  const pill = page.getByTestId('beast-scope');
  await expect(pill).toHaveText('TAME');
  for (const next of ['LOOSE', 'WILD', 'FERAL', 'TAME']) {
    await pill.click();
    await expect(pill).toHaveText(next);
  }
  await pill.click();
  await pill.click();
  await pill.click();
  await expect(pill).toHaveText('FERAL');
  await page.getByTestId('beast-kin').click();
  const n = await page.getByTestId('beast-tile').count();
  expect(n).toBeGreaterThan(0); // FERAL loses draws to the gate, but a hand still comes up
  expect(n).toBeLessThanOrEqual(6);
  await shot(page, 'b5-feral');
  expect(errors).toEqual([]);
});

test('phone width: the strip under the bank rail never scrolls the lab sideways', async ({ page }) => {
  const errors = await boot(page, { width: 390, height: 844 });
  await openEmptyLab(page);
  await page.getByTestId('beast-kin').click();
  await expect(page.getByTestId('beast-tile').first()).toBeVisible();
  const sideways = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="wet-lab"]');
    return {
      doc: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sheet: sheet.scrollWidth > sheet.clientWidth + 1,
    };
  });
  expect(sideways.doc).toBe(false);
  expect(sideways.sheet).toBe(false);
  await shot(page, 'b6-phone');
  expect(errors).toEqual([]);
});
