// #1124 — the HITS setlist: a keep is a pill with a name, four vibe bands and two actions; the rest is on hover.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); localStorage.removeItem('kc:favorites'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
}
const pills = (page) => page.locator('.hit-pill');
const state = (page) => page.evaluate(() => { const s = window.__kcStore.getState(); return { fav: s.favorites.length, keeps: s.keeps.length, seeds: s.favorites.map((f) => f.seed) }; });

test('F adds a pill: a name, not hex, and four bands (3 palette colours + heat)', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('f');
  await expect(pills(page)).toHaveCount(1);
  const p = pills(page).first();
  await expect(p.locator('.hit-pill-name')).toHaveText(/^[A-Z]{2,6}$/);
  await expect(p.locator('.hit-band')).toHaveCount(4);
  await expect(p.locator('.hit-band.heat')).toHaveCount(1);
  for (const b of await p.locator('.hit-pill-act').all()) expect((await b.boundingBox()).width).toBeGreaterThanOrEqual(28);
});

test('duplicate makes a setlist copy and no new keep; delete removes the pill and leaves the keep', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('f');
  await expect(pills(page)).toHaveCount(1);
  const before = await state(page);
  await pills(page).first().getByRole('button', { name: /^Duplicate hit/ }).click();
  await expect(pills(page)).toHaveCount(2);
  const dup = await state(page);
  expect(dup.keeps).toBe(before.keeps); // two-ledger rule: copying is not finding
  expect(dup.seeds[0]).toBe(dup.seeds[1]);
  await pills(page).nth(1).getByRole('button', { name: /^Delete hit/ }).click();
  await expect(pills(page)).toHaveCount(1);
  expect((await state(page)).keeps).toBe(before.keeps);
});

test('hover shows the card: full name, seed, age, band legend and the three secondary actions', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('f');
  await pills(page).first().hover();
  const card = page.locator('.hit-detail');
  await expect(card).toBeVisible();
  await expect(card.locator('.hit-detail-seed')).toContainText(/^seed [0-9a-f]{4}/);
  await expect(card.locator('.hit-detail-legend li')).toHaveCount(4);
  for (const name of [/share/, /morph/, /evolve/]) await expect(card.getByRole('button', { name })).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(card).toHaveCount(0);
});

test('the keyboard moves a hit: Alt+Right puts the cursor hit later in the setlist', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const s = window.__kcStore.getState();
    for (const seed of [11, 22, 33]) s.addFavorite({ seed, seedOffsets: {}, timestamp: new Date().toISOString(), config: { layout: {}, palette: { id: 'praystation' } } });
  });
  await expect(pills(page)).toHaveCount(3);
  await page.locator('.favorites-tray').focus();
  await page.keyboard.press('Alt+ArrowRight');
  const seeds = (await state(page)).seeds;
  expect(seeds.slice(0, 3)).toEqual([22, 11, 33]);
});
