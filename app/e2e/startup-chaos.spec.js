// e2e/startup-chaos.spec.js — #946: a cold launch fires one full wild roll.
//
// Replaces living-boot.spec.js (#707): the curated First Light starter is
// gone — the opening is now a full kineticRoll (seed, palette, composition,
// mode, FX chain, blends, assets, density/count, behave) as one undo entry.
import { test, expect } from '@playwright/test';
import { COMPOSITION_PRESETS } from '../src/data/presets.js';

const PRESET_IDS = new Set(COMPOSITION_PRESETS.map((p) => p.id));
const FACTORY_SEED = 'a17e9b21';

async function dismissOverlay(page) {
  // Welcome modal must not trap the canvas: dismiss it.
  const skip = page.locator('button', { hasText: 'Skip' });
  if (await skip.count()) await skip.first().click();
  await page.keyboard.press('Escape');
}

async function readSeed(page) {
  return page
    .locator('body')
    .textContent()
    .then((t) => t.match(/seed:([0-9a-f]{1,8})/)?.[1]);
}

test('fresh boot fires one full chaos roll and is alive', async ({ page }) => {
  // No ?boot=factory here: this is the real cold-launch path.
  await page.goto('/');
  await page.locator('.app').waitFor({ timeout: 30_000 });
  await dismissOverlay(page);

  // A rolled composition preset is named on the P03 BUILD header shortly
  // after load — the roll is structural, not just a seed bump.
  let subtitle = '';
  await expect
    .poll(
      async () =>
        (subtitle = (
          (await page.locator('.panel-layout .panel-subtitle').first().textContent().catch(() => '')) || ''
        ).trim()),
      { timeout: 15_000 },
    )
    .toBeTruthy();
  expect(PRESET_IDS.has(subtitle), `BUILD subtitle is a rolled preset id, got "${subtitle}"`).toBe(true);

  // The seed was re-rolled (not the factory default) — every boot differs.
  // The footer prints the seed as unpadded hex (seed:5654c is a real seed), so
  // match 1-8 digits: the old {8} failed on ~1 boot in 16 (any seed < 0x10000000).
  const seed = await readSeed(page);
  expect(seed).toBeTruthy();
  expect(seed).not.toBe(FACTORY_SEED);

  // The canvas is alive: nodes are placed and counted. Not "more than 50": a rolled composition can legitimately
  // place fewer (the smallest preset places 24, and some modes grow from a seed), so a threshold made this flaky
  // on about one boot in six. Alive means placed, and the count is polled because the roll lands a moment after load.
  await expect
    .poll(async () => parseInt(await page.locator('body').textContent().then((t) => t.match(/(\d+) NODES/)?.[1] ?? '0'), 10), { timeout: 10_000 })
    .toBeGreaterThan(0);
});

test('two cold launches open differently', async ({ browser }) => {
  const seeds = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/');
    await page.locator('.app').waitFor({ timeout: 30_000 });
    await dismissOverlay(page);
    seeds.push(await readSeed(page));
    await ctx.close();
  }
  expect(seeds[0]).toBeTruthy();
  expect(seeds[1]).toBeTruthy();
  expect(seeds[0]).not.toBe(seeds[1]);
});

test('?boot=factory keeps the deterministic factory start', async ({ page }) => {
  await page.goto('/?boot=factory');
  await page.locator('.app').waitFor({ timeout: 30_000 });
  expect(await readSeed(page)).toBe(FACTORY_SEED);
});

test('START: FIXED boots the deterministic factory opener', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.setItem('kc:startup-mode:v1', 'fixed');
    } catch {
      // ignore
    }
  });
  await page.goto('/');
  await page.locator('.app').waitFor({ timeout: 30_000 });
  // No roll: the opener is the known factory default.
  expect(await readSeed(page)).toBe(FACTORY_SEED);
});
