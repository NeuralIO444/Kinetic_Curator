// #1962 — ASSEMBLE A BEAST: the wet lab deals a Strandbeest into the asset pool; turned on, it stands on the stage.
// No page errors; the lab holds at phone width.
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

async function openLab(page) {
  await page.getByPlaceholder(/filter/i).fill('org_petal_01');
  await page.getByRole('button', { name: 'Inspect org_petal_01' }).click();
  await page.getByRole('button', { name: 'wet lab' }).click();
  await expect(page.getByTestId('wet-lab')).toBeVisible();
}

test('ASSEMBLE A BEAST banks a linkage tile, a second press banks a different one, and it stands on the stage', async ({
  page,
}) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openLab(page);
  const lab = page.getByTestId('wet-lab');
  await lab.getByTestId('assemble-beast').click();
  await expect(lab.getByTestId('beast-note')).toContainText(/banked user:beast-[0-9a-f]{8}/);
  await lab.getByTestId('assemble-beast').click();
  const beasts = await page.evaluate(() =>
    window.__kcStore
      .getState()
      .customAssets.filter((a) => /^user:beast-/.test(a.id))
      .map((a) => ({ id: a.id, legs: a.rig.linkage.measures.legCount, bones: a.rig.bones.length })),
  );
  expect(beasts.length).toBe(2);
  expect(new Set(beasts.map((b) => b.id)).size).toBe(2);
  expect(beasts.every((b) => b.bones === 0 && b.legs >= 6 && b.legs <= 12)).toBe(true);
  // #1868 — the signature readout: a closed foot-path curve per beast, each naming its nearest relative
  await expect(lab.getByTestId('beast-row')).toHaveCount(2);
  const paths = await lab
    .getByTestId('beast-signature')
    .evaluateAll((els) => els.map((e) => [...e.querySelectorAll('path')].map((p) => p.getAttribute('d'))));
  for (const ds of paths) {
    expect(ds.length).toBe(2); // its own, and its relative's behind it
    expect(ds.every((d) => d.startsWith('M') && d.endsWith('Z'))).toBe(true);
  }
  await expect(lab.getByTestId('beast-kin').first()).toHaveText(/^(kin|cousin|stranger) \d/);
  // turn the first on: the stage places it like any shape, and nothing throws
  await page.evaluate((id) => {
    const s = window.__kcStore;
    s.setState({ enabledAssets: { ...s.getState().enabledAssets, [id]: true } });
  }, beasts[0].id);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('the beast button holds at phone width: no horizontal scroll', async ({ page }) => {
  const errors = await boot(page, { width: 390, height: 800 });
  await openLab(page);
  await expect(page.getByTestId('assemble-beast')).toBeVisible();
  await page.getByTestId('assemble-beast').click();
  await page.getByTestId('assemble-beast').click();
  await expect(page.getByTestId('beast-row')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
