// #2305 — the WetLab ladder end to end, the way an artist uses it (docs/design/wetlab-ladder-spec.md §12–§14). A fresh
// artist with an empty project: SHAPE → keep until CONSTRUCT opens; CONSTRUCT → keep 3 until CREATURE opens; CREATURE
// → KIN deals a construct-bodied creature; keep one; reload and everything is still there. No store seeding.
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

const pips = (page, rung) => page.getByTestId(`rung-pips-${rung}`);

test('a fresh artist climbs SHAPE → CONSTRUCT → CREATURE, and it all survives a reload', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openLab(page);
  // a brand-new artist: only SHAPE is open
  for (const rung of ['construct', 'creature', 'rig']) await expect(page.getByTestId(`rung-${rung}`)).toBeDisabled();
  await shot(page, 'e1-fresh');

  // 1. SHAPE: one style, keep three — CONSTRUCT opens
  await keepShapesOfOneStyle(page, 3);
  await expect(pips(page, 'shape')).toHaveAttribute('data-filled', '3');
  await expect(page.getByTestId('rung-construct')).toBeEnabled();
  await shot(page, 'e2-shapes-kept');

  // 2. CONSTRUCT: build from them, keep three — CREATURE opens
  await page.getByTestId('rung-construct').click();
  await page.getByTestId('construct-kin').click();
  const ctiles = page.getByTestId('construct-tile');
  for (let i = 0; i < 3; i += 1) await ctiles.nth(i).click();
  await expect(pips(page, 'construct')).toHaveAttribute('data-filled', '3');
  await expect(page.getByTestId('rung-creature')).toBeEnabled();
  const constructIds = await page.evaluate(() =>
    window.__kcStore.getState().constructRecords.map((r) => `user:${r.id}`),
  );
  expect(constructIds.length).toBe(3);
  await shot(page, 'e3-constructs-kept');

  // 3. CREATURE: KIN deals construct bodies; keep one — its pip fills
  await page.getByTestId('rung-creature').click();
  await page.getByTestId('kin-press').click();
  await expect(page.getByTestId('kin-tile').first()).toBeVisible();
  const leadBody = await page.evaluate(() => window.__kcStore.getState().creatureRecords[0].body);
  expect(constructIds).toContain(leadBody);
  await page.getByTestId('kin-tile').nth(1).click();
  await expect(pips(page, 'creature')).toHaveAttribute('data-filled', '1');
  const creatures = await page.evaluate(() => window.__kcStore.getState().creatureRecords.map((r) => r.id));
  expect(creatures.length).toBe(2); // the lead KIN landed, and the one tapped
  await shot(page, 'e4-creature-kept');

  // 4. Reload: the rail, the shelf, the construct bank and the creatures are all still there
  await page.reload();
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /assets/i }).click();
  await openLab(page);
  await expect(page.getByTestId('rung-creature')).toBeEnabled();
  // #2318 — one creature kept on the ladder does not open RIG, even after a reload
  await expect(page.getByTestId('rung-rig')).toBeDisabled();
  await expect(pips(page, 'shape')).toHaveAttribute('data-filled', '3');
  await expect(pips(page, 'construct')).toHaveAttribute('data-filled', '3');
  await expect(pips(page, 'creature')).toHaveAttribute('data-filled', '1');
  const after = await page.evaluate(() => {
    const st = window.__kcStore.getState();
    return {
      shelf: st.shapeShelf.length,
      constructs: st.constructRecords.map((r) => `user:${r.id}`),
      creatures: st.creatureRecords.map((r) => r.id),
    };
  });
  expect(after.shelf).toBe(3);
  expect(after.constructs).toEqual(constructIds);
  expect(after.creatures).toEqual(creatures);
  await page.getByTestId('rung-shape').click();
  await expect(page.getByTestId('shape-shelf-tile')).toHaveCount(3);
  await shot(page, 'e5-after-reload');
  expect(errors).toEqual([]);
});
