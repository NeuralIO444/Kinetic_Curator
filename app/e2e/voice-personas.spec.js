// Voices (#280): flagship chips crossfade through MIX, stubs keep bare
// mode-switch behavior, + captures a user voice persisted in localStorage.
import { test, expect } from '@playwright/test';

test.describe('Mode personas', () => {
  test.beforeEach(async ({ page }) => {
    // Suppress the first-run overlay before first paint (#37 pattern).
    // NOTE: the shelf clear must NOT live in the init script — it re-runs on
    // every navigation, which would wipe a captured voice on page.reload().
    await page.addInitScript(() => {
      try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
    });
    await page.goto('/?boot=factory');
    await page.evaluate(() => {
      try { localStorage.removeItem('kc:user-voices:v1'); } catch { /* ignore */ }
    });
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
    const buildTab = page.getByRole('tab', { name: /build/i });
    await buildTab.click();
    await expect(page.locator('.voice-row')).toBeVisible({ timeout: 10_000 });
  });

  // #717 — the flagship Voices' one home is the DIRECTORS panel.
  const openDavis = async (page) => {
    await page.getByRole('tab', { name: /director/i }).click();
    await expect(page.locator('.davis-voices')).toBeVisible({ timeout: 10_000 });
  };

  // #1153: the factory four are retired; DIRECTORS holds the earned voices and, until the first find, ONE starter.
  test('the starter voice lives on DIRECTORS, not BUILD; the other three are gone from the picker', async ({ page }) => {
    await expect(page.locator('.panel-layout .voice-chip.starter')).toHaveCount(0);
    await openDavis(page);
    await expect(page.locator('.voice-chip.starter')).toHaveCount(1);
    await expect(page.locator('.voice-chip.earned')).toHaveCount(0);
    await expect(page.locator('.voice-flagships')).toContainText(/Night Migration/);
    for (const gone of [/Chrome Parade/, /Deep Water/, /Dark Glass/]) await expect(page.locator('.voice-flagships')).not.toContainText(gone);
  });

  test('BUILD keeps the stub tiles, the dice tile, and the + chip', async ({ page }) => {
    // 14 stub tiles keep the mode grid (12 + DLA growth + Eden growth); the dice tile rolls 3 finalists
    await expect(page.locator('.mode-grid .mode-tile:not(.dice-tile)')).toHaveCount(14);
    await expect(page.locator('.mode-grid .dice-tile')).toBeVisible();
    await expect(page.locator('.plus-chip')).toBeVisible();
  });

  test('tapping Night Migration crossfades through MIX and lands the voice', async ({ page }) => {
    await openDavis(page);
    await page.locator('.voice-chip.starter', { hasText: 'Night Migration' }).click();
    // MIX bar appears while the crossfade runs
    const mixBar = page.locator('.mix-bar');
    await expect(mixBar).toBeVisible({ timeout: 5_000 });
    await expect(mixBar).toContainText(/Night Migration/);
    // 4s signature blend — wait for the commit to land
    await expect(mixBar).toBeHidden({ timeout: 15_000 });
    // Chip stays lit and the canvas reports the voice's mode
    await expect(page.locator('.voice-chip.starter.active', { hasText: 'Night Migration' })).toBeVisible();
    await expect(page.locator('.canvas-corner.tr').first()).toContainText(/swarm/i, { timeout: 10_000 });
  });

  test('stub tiles ride the MIX road and land the mode (#517)', async ({ page }) => {
    await page.locator('.mode-grid .mode-tile', { hasText: 'grid' }).click();
    // Same morph-don't-cut road as a preset: the MIX bar appears, names the chip, then commits.
    const mixBar = page.locator('.mix-bar');
    await expect(mixBar).toBeVisible({ timeout: 5_000 });
    await expect(mixBar).toContainText(/grid/i);
    await expect(mixBar).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('.mode-grid .mode-tile.active', { hasText: 'grid' })).toBeVisible();
    await expect(page.locator('.canvas-corner.tr').first()).toContainText(/grid/i, { timeout: 10_000 });
  });

  test('+ captures a user voice, persists across reload', async ({ page }) => {
    await page.locator('.plus-chip').click();
    const chip = page.locator('.voice-chip.user', { hasText: 'VOICE 01' });
    await expect(chip).toBeVisible();
    // Loading it crossfades like a built-in
    await chip.locator('.user-chip-main').click();
    await expect(page.locator('.mix-bar')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.mix-bar')).toBeHidden({ timeout: 15_000 });
    // Shelf survives a reload
    await page.reload();
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('tab', { name: /build/i }).click();
    await expect(page.locator('.voice-chip.user', { hasText: 'VOICE 01' })).toBeVisible({ timeout: 10_000 });
  });

  test('delete removes a user voice after confirm', async ({ page }) => {
    await page.locator('.plus-chip').click();
    const chip = page.locator('.voice-chip.user', { hasText: 'VOICE 01' });
    await expect(chip).toBeVisible();
    page.on('dialog', (d) => d.accept());
    await chip.locator('.user-chip-x').click();
    await expect(page.locator('.voice-chip.user')).toHaveCount(0);
  });
});
