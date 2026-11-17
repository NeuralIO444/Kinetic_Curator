// #2304 — the CREATURE rung builds from the ladder (docs/design/wetlab-ladder-spec.md §14). With three banked
// constructs, KIN's bodies are all constructs; with two, the library fills in. A construct-bodied creature banks and
// draws. Constructs are built the way an artist builds them: kept shapes → CONSTRUCT strip. No page errors.
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

/** SHAPE: keep 3 of one style; CONSTRUCT: KIN and keep `k` constructs. Returns the construct tile ids banked. */
async function buildConstructs(page, k) {
  await keepShapesOfOneStyle(page, 3);
  await page.getByTestId('rung-construct').click();
  await page.getByTestId('construct-kin').click();
  const tiles = page.getByTestId('construct-tile');
  for (let i = 0; i < k; i += 1) await tiles.nth(i).click();
  return page.evaluate(() => window.__kcStore.getState().constructRecords.map((r) => `user:${r.id}`));
}

const kinBodies = async (page) => {
  await page.getByTestId('rung-creature').click();
  await page.getByTestId('kin-press').click();
  await expect(page.getByTestId('kin-tile').first()).toBeVisible();
  return page
    .getByTestId('kin-tile')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('title') || '').split(' · ')[0]));
};

test('three banked constructs: every body KIN deals is one of them, and it banks and draws', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await page.evaluate(() =>
    localStorage.setItem(
      'kc.wetLabLadder.v1',
      JSON.stringify({ v: 1, kept: {}, open: { shape: true, construct: true, creature: true } }),
    ),
  );
  await openLab(page);
  const constructIds = await buildConstructs(page, 3);
  expect(constructIds.length).toBe(3);
  await kinBodies(page);
  const bodies = await page.evaluate(() => {
    const st = window.__kcStore.getState();
    return st.creatureRecords.map((r) => r.body);
  });
  // the lead KIN landed is banked: its body is a construct, and its tile stands in the pool with a drawing
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.every((b) => constructIds.includes(b))).toBe(true);
  const drawn = await page.evaluate(() => {
    const st = window.__kcStore.getState();
    const rec = st.creatureRecords[0];
    const tile = st.customAssets.find((a) => a.id === `user:${rec.id}`);
    return !!(tile && tile.svg && tile.svg.length > 100);
  });
  expect(drawn).toBe(true);
  const figures = await page
    .getByTestId('kin-tile')
    .evaluateAll((els) => els.map((e) => e.querySelector('svg')?.getAttribute('data-figure')));
  expect(figures.every((f) => f === 'full')).toBe(true);
  await shot(page, 'l1-construct-creatures');
  expect(errors).toEqual([]);
});

test('two banked constructs: the library still fills in', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await page.evaluate(() =>
    localStorage.setItem(
      'kc.wetLabLadder.v1',
      JSON.stringify({ v: 1, kept: {}, open: { shape: true, construct: true, creature: true } }),
    ),
  );
  await openLab(page);
  const constructIds = await buildConstructs(page, 2);
  expect(constructIds.length).toBe(2);
  await kinBodies(page);
  const bodies = await page.evaluate(() => window.__kcStore.getState().creatureRecords.map((r) => r.body));
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.some((b) => !constructIds.includes(b))).toBe(true);
  expect(errors).toEqual([]);
});
