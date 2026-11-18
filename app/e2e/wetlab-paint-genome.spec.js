// #2341 — creature PAINT P4: the genome panel's MATERIAL card. MUTATE changes the material (within its style);
// PAINT LIKE copies a banked creature's material in one tap; both survive a reload. Set PAINT_SHOTS=<dir> for shots.
/* global process: readonly */
import { test, expect } from '@playwright/test';

const shot = async (page, name) => {
  if (process.env.PAINT_SHOTS) await page.screenshot({ path: `${process.env.PAINT_SHOTS}/${name}.png` });
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
      );
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  return errors;
}

async function openLab(page) {
  await page.getByRole('tab', { name: /assets/i }).click();
  await page.locator('.cat-chip', { hasText: /^USER/ }).click();
  await page.getByTestId('open-wetlab-empty').click();
  await expect(page.getByTestId('wet-lab')).toBeVisible();
  await page.getByTestId('rung-creature').click();
}

const materials = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      window.__kcStore
        .getState()
        .creatureRecords.map((r) => [r.id, r.genome.find((g) => g.family === 'MATERIAL').value]),
    ),
  );

for (const size of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`at ${size.width}: the MATERIAL card mutates, Paint Like copies a banked material, and both survive a reload`, async ({
    page,
  }) => {
    const errors = await boot(page, size);
    await openLab(page);
    // bank every tile of a hand until two creatures wear different materials (bounded)
    let mats = {};
    for (let i = 0; i < 6 && new Set(Object.values(mats).filter(Boolean)).size < 2; i++) {
      await page.getByTestId('kin-press').click();
      await expect(page.getByTestId('kin-tile')).toHaveCount(6);
      for (let k = 1; k < 6; k++) await page.getByTestId('kin-tile').nth(k).click();
      mats = await materials(page);
    }
    expect(new Set(Object.values(mats).filter(Boolean)).size).toBeGreaterThanOrEqual(2);

    // select a painted creature, open its genome, pick the MATERIAL node
    const target = Object.keys(mats).find((id) => mats[id]);
    await page.getByTestId('bank-tile').filter({ hasText: target }).click();
    await page.getByTestId('lab-mode-genome').click();
    await page
      .getByTestId('genome-node')
      .filter({ hasText: /^material/i })
      .click();
    await expect(page.getByTestId('paint-like')).toBeVisible();

    // MUTATE: a different material, of the same style
    const before = mats[target];
    await page.getByTestId('gene-mutate').click();
    await expect(page.getByTestId('gene-note')).toContainText('mutated in place');
    const mutated = (await materials(page))[target];
    expect(mutated).not.toBe(before);
    expect(mutated.split('-')[0]).toBe(before.split('-')[0]);

    // PAINT LIKE: one tap takes the donor's material
    const option = page.getByTestId('paint-like-option').first();
    const want = await option.getAttribute('data-material');
    await option.click();
    await expect(page.getByTestId('gene-note')).toContainText('replaced in place');
    expect((await materials(page))[target]).toBe(want);
    await shot(page, `paint-genome-${size.width}`);

    // both survive a reload
    await page.reload();
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
    expect((await materials(page))[target]).toBe(want);
    expect(errors).toEqual([]);
  });
}
