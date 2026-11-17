// #2281 — the WetLab ladder's rung rail (docs/design/wetlab-ladder-spec.md §4, §12.3, §12.7). A brand-new artist sees
// SHAPE open and the rest locked, each saying what opens it; a project that already holds a creature opens every rung;
// the rail shows one rung's strip at a time. No page errors; no sideways scroll at phone width.
// Set KIN_SHOTS=<dir> to save screenshots.
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
}

const closeLab = async (page) => {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wet-lab')).toHaveCount(0);
};

test('a brand-new artist: only SHAPE is open, the rest are locked and say what opens them', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  const rail = page.getByTestId('rung-rail');
  await expect(rail).toBeVisible();
  await expect(page.getByTestId('rung-shape')).toBeEnabled();
  await expect(page.getByTestId('rung-shape')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rung-pips-shape')).toHaveAttribute('data-filled', '0');
  for (const [id, line] of [
    ['construct', 'KEEP 3 SHAPES'],
    ['creature', 'KEEP 3 CONSTRUCTS'],
    ['rig', 'KEEP 3 CREATURES'],
  ]) {
    await expect(page.getByTestId(`rung-${id}`)).toBeDisabled();
    await expect(page.getByTestId(`rung-lock-${id}`)).toHaveText(line);
  }
  // SHAPE has no strip yet: an honest empty state, and neither old strip on screen
  await expect(page.getByTestId('rung-empty-shape')).toBeVisible();
  await expect(page.getByTestId('kin-strip')).toHaveCount(0);
  await expect(page.getByTestId('beast-strip')).toHaveCount(0);
  await shot(page, 'r1-new-artist');
  expect(errors).toEqual([]);
});

test('an artist with a creature banked starts with every rung open; one strip shows at a time', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  // bank a creature the honest way (the strip's KIN), with the ladder forced open just for that, then forget the ladder
  await page.evaluate(() =>
    localStorage.setItem(
      'kc.wetLabLadder.v1',
      JSON.stringify({ v: 1, kept: {}, open: { shape: true, construct: true, creature: true, rig: true } }),
    ),
  );
  await openEmptyLab(page);
  await page.getByTestId('rung-creature').click();
  await page.getByTestId('kin-press').click();
  await expect(page.getByTestId('bank-tile')).toHaveCount(1);
  await closeLab(page);
  await page.evaluate(() => localStorage.removeItem('kc.wetLabLadder.v1'));

  await openEmptyLab(page);
  for (const id of ['shape', 'construct', 'creature', 'rig'])
    await expect(page.getByTestId(`rung-${id}`)).toBeEnabled();
  await expect(page.getByTestId('rung-rig')).toHaveAttribute('aria-pressed', 'true'); // the highest open rung first
  await expect(page.getByTestId('beast-strip')).toBeVisible();
  await expect(page.getByTestId('kin-strip')).toHaveCount(0);
  await shot(page, 'r2-existing-open-rig');

  await page.getByTestId('rung-creature').click();
  await expect(page.getByTestId('rung-creature')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('kin-strip')).toBeVisible();
  await expect(page.getByTestId('beast-strip')).toHaveCount(0);
  await shot(page, 'r3-creature');

  await page.getByTestId('rung-construct').click();
  await expect(page.getByTestId('rung-empty-construct')).toBeVisible();
  await expect(page.getByTestId('kin-strip')).toHaveCount(0);
  await expect(page.getByTestId('beast-strip')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kc.wetLabLadder.v1')));
  expect(stored.open).toEqual({ shape: true, construct: true, creature: true, rig: true });
  expect(errors).toEqual([]);
});

test('phone width: the rail wraps and the lab never scrolls sideways', async ({ page }) => {
  const errors = await boot(page, { width: 390, height: 844 });
  await openEmptyLab(page);
  await expect(page.getByTestId('rung-rail')).toBeVisible();
  const sideways = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="wet-lab"]');
    return {
      doc: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sheet: sheet.scrollWidth > sheet.clientWidth + 1,
    };
  });
  expect(sideways.doc).toBe(false);
  expect(sideways.sheet).toBe(false);
  const tall = await page.getByTestId('rung-shape').evaluate((el) => el.getBoundingClientRect().height);
  expect(tall).toBeGreaterThanOrEqual(44);
  await shot(page, 'r4-phone');
  expect(errors).toEqual([]);
});

test('keeps fill the pips: three creatures the artist taps open RIG; the lead a KIN press lands does not count', async ({
  page,
}) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await page.evaluate(() =>
    localStorage.setItem(
      'kc.wetLabLadder.v1',
      JSON.stringify({ v: 1, kept: {}, open: { shape: true, construct: true, creature: true, rig: false } }),
    ),
  );
  await openEmptyLab(page);
  await page.getByTestId('rung-creature').click();
  await expect(page.getByTestId('rung-rig')).toBeDisabled();

  await page.getByTestId('kin-press').click();
  await expect(page.getByTestId('kin-tile')).toHaveCount(6);
  await expect(page.getByTestId('bank-tile')).toHaveCount(1); // the lead landed by itself
  await expect(page.getByTestId('rung-pips-creature')).toHaveAttribute('data-filled', '0'); // …and is not a keep

  for (const [i, filled] of [
    [1, '1'],
    [2, '2'],
  ]) {
    await page.getByTestId('kin-tile').nth(i).click();
    await expect(page.getByTestId('rung-pips-creature')).toHaveAttribute('data-filled', filled);
    await expect(page.getByTestId('rung-rig')).toBeDisabled();
  }
  await page.getByTestId('kin-tile').nth(1).click(); // the same creature again is 'already': not a second keep
  await expect(page.getByTestId('rung-pips-creature')).toHaveAttribute('data-filled', '2');

  await page.getByTestId('kin-tile').nth(3).click();
  await expect(page.getByTestId('rung-pips-creature')).toHaveAttribute('data-filled', '3');
  await expect(page.getByTestId('rung-rig')).toBeEnabled();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kc.wetLabLadder.v1')));
  expect(stored.kept.creature).toBe(3);
  expect(stored.open.rig).toBe(true);
  await shot(page, 'r5-keeps-open-rig');
  expect(errors).toEqual([]);
});
