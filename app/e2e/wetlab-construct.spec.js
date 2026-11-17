// #2301 — the CONSTRUCT rung (docs/design/wetlab-ladder-spec.md §13). KIN is off until two kept shapes share a style
// and says so; then it builds constructs only from kept shapes; tapping banks one and fills a pip; three open
// CREATURE; the bank survives a reload; tiles settle (and are drawn settled under reduced motion). No page errors.
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

async function openLab(page) {
  await page.locator('.cat-chip', { hasText: /^USER/ }).click();
  const open = page.getByTestId('open-wetlab-empty');
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByTestId('wet-lab')).toBeVisible();
}

/** On SHAPE: step the scope to one style, KIN, and keep `n` shapes of it. Returns that style. */
async function keepShapesOfOneStyle(page, n) {
  await page.getByTestId('rung-shape').click();
  await page.getByTestId('shape-scope').click(); // ANY → the first style
  await page.getByTestId('shape-kin').click();
  const tiles = page.getByTestId('shape-tile');
  expect(await tiles.count()).toBeGreaterThanOrEqual(n);
  for (let i = 0; i < n; i += 1) await tiles.nth(i).click();
  return tiles.first().getAttribute('data-style');
}

test('KIN is off with a line until two kept shapes share a style', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await page.evaluate(() =>
    localStorage.setItem(
      'kc.wetLabLadder.v1',
      JSON.stringify({ v: 1, kept: {}, open: { shape: true, construct: true } }),
    ),
  );
  await openLab(page);
  await page.getByTestId('rung-construct').click();
  await expect(page.getByTestId('construct-strip')).toBeVisible();
  await expect(page.getByTestId('construct-kin')).toBeDisabled();
  await expect(page.getByTestId('construct-note')).toHaveText('KEEP 2 SHAPES OF ONE STYLE');
  await keepShapesOfOneStyle(page, 1);
  await page.getByTestId('rung-construct').click();
  await expect(page.getByTestId('construct-kin')).toBeDisabled(); // one is not enough
  await shot(page, 'k1-too-few');
  expect(errors).toEqual([]);
});

test('kept shapes build constructs; three keeps open CREATURE; the bank survives a reload', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openLab(page);
  const style = await keepShapesOfOneStyle(page, 3); // also opens CONSTRUCT
  await expect(page.getByTestId('rung-construct')).toBeEnabled();
  await page.getByTestId('rung-construct').click();
  await expect(page.getByTestId('construct-kin')).toBeEnabled();
  await expect(page.getByTestId('construct-note')).toHaveText('');
  await page.getByTestId('construct-kin').click();
  const tiles = page.getByTestId('construct-tile');
  expect(await tiles.count()).toBeGreaterThanOrEqual(3);
  const styles = await tiles.evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-style')))]);
  expect(styles).toEqual([style]);

  // only kept shapes: every part of every banked record is on the shelf
  await expect(page.getByTestId('rung-creature')).toBeDisabled();
  for (const [i, filled] of [
    [0, '1'],
    [1, '2'],
  ]) {
    await tiles.nth(i).click();
    await expect(page.getByTestId('rung-pips-construct')).toHaveAttribute('data-filled', filled);
  }
  await tiles.nth(1).click(); // already banked: not a second keep
  await expect(page.getByTestId('rung-pips-construct')).toHaveAttribute('data-filled', '2');
  await tiles.nth(2).click();
  await expect(page.getByTestId('rung-pips-construct')).toHaveAttribute('data-filled', '3');
  await expect(page.getByTestId('rung-creature')).toBeEnabled();
  await expect(page.getByTestId('rung-construct')).toHaveAttribute('aria-pressed', 'true'); // the screen stays put
  const ok = await page.evaluate(() => {
    const st = window.__kcStore.getState();
    const kept = new Set(st.shapeShelf.map((s) => s.asset));
    return (
      st.constructRecords.length === 3 && st.constructRecords.every((r) => r.parts.every((p) => kept.has(p.asset)))
    );
  });
  expect(ok).toBe(true);
  await shot(page, 'k2-three-kept');

  // CUR narrows from the last kept construct
  await page.getByTestId('construct-cur').click();
  expect(await page.getByTestId('construct-tile').count()).toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /assets/i }).click();
  await openLab(page);
  await page.getByTestId('rung-construct').click();
  await expect(page.getByTestId('construct-bank-count')).toHaveText(/bank · 3/i);
  await expect(page.getByTestId('rung-creature')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('tiles settle into place; under reduced motion they are drawn settled', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openLab(page);
  await keepShapesOfOneStyle(page, 3); // three keeps open CONSTRUCT
  await page.getByTestId('rung-construct').click();
  await page.getByTestId('construct-kin').click();
  await expect(page.getByTestId('construct-tile').first()).toHaveAttribute('data-settled', 'true', { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('reduced motion: tiles are settled from the start', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 }, { reducedMotion: 'reduce' });
  await openLab(page);
  await keepShapesOfOneStyle(page, 3); // three keeps open CONSTRUCT
  await page.getByTestId('rung-construct').click();
  await page.getByTestId('construct-kin').click();
  const settled = await page
    .getByTestId('construct-tile')
    .evaluateAll((els) => els.every((e) => e.getAttribute('data-settled') === 'true'));
  expect(settled).toBe(true);
  expect(errors).toEqual([]);
});

test('phone width: the strip wraps and the lab never scrolls sideways', async ({ page }) => {
  const errors = await boot(page, { width: 390, height: 844 });
  await openLab(page);
  await keepShapesOfOneStyle(page, 3); // three keeps open CONSTRUCT
  await page.getByTestId('rung-construct').click();
  await page.getByTestId('construct-kin').click();
  await expect(page.getByTestId('construct-tile').first()).toBeVisible();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(sideways).toBe(false);
  await shot(page, 'k3-phone');
  expect(errors).toEqual([]);
});
