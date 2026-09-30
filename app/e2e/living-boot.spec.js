// e2e/living-boot.spec.js — #707: a fresh boot wakes up playing.
import { test, expect } from '@playwright/test';

const STARTERS = ['first-light', 'grid-talk', 'pond', 'paper-storm'];
const FACTORY_SEED = 'a17e9b21';

test('fresh boot rolls a First Light starter and is alive', async ({ page }) => {
  // No ?boot=factory here: this is the real first-run path.
  await page.goto('/');
  await page.locator('.app').waitFor({ timeout: 30_000 });
  // Welcome modal must not trap the canvas: dismiss it.
  const skip = page.locator('button', { hasText: 'Skip' });
  if (await skip.count()) await skip.first().click();

  // A starter composition is named on the P03 BUILD header shortly after load.
  // Read the subtitle element itself: a page-text regex ran on into whatever
  // lowercase chip text follows the header (#717 moved the Voice chips away).
  await expect
    .poll(async () => ((await page.locator('.panel-layout .panel-subtitle').first().textContent().catch(() => '')) || '').trim(),
      { timeout: 15_000 })
    .toMatch(new RegExp(`^(${STARTERS.join('|')})$`));

  // The seed was re-rolled (not the factory default) — every boot differs.
  const seed = await page.locator('body').textContent().then((t) => t.match(/seed:([0-9a-f]{8})/)?.[1]);
  expect(seed).toBeTruthy();
  expect(seed).not.toBe(FACTORY_SEED);

  // The canvas is alive: nodes are placed and counted.
  const nodes = await page.locator('body').textContent().then((t) => t.match(/(\d+) NODES/)?.[1]);
  expect(parseInt(nodes, 10)).toBeGreaterThan(50);
});

test('?boot=factory keeps the deterministic factory start', async ({ page }) => {
  await page.goto('/?boot=factory');
  await page.locator('.app').waitFor({ timeout: 30_000 });
  const seed = await page.locator('body').textContent().then((t) => t.match(/seed:([0-9a-f]{8})/)?.[1]);
  expect(seed).toBe(FACTORY_SEED);
});
