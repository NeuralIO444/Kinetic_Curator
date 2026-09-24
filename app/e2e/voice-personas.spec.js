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
    await page.goto('/');
    await page.evaluate(() => {
      try { localStorage.removeItem('kc:user-voices:v1'); } catch { /* ignore */ }
    });
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
    const buildTab = page.getByRole('tab', { name: /build/i });
    await buildTab.click();
    await expect(page.locator('.voice-row')).toBeVisible({ timeout: 10_000 });
  });

  test('flagship chips, stub tiles and + chip render', async ({ page }) => {
    await expect(page.locator('.voice-chip.flagship')).toHaveCount(3);
    await expect(page.locator('.voice-flagships')).toContainText(/SWARM/);
    await expect(page.locator('.voice-flagships')).toContainText(/HYPE/);
    await expect(page.locator('.voice-flagships')).toContainText(/MURM/);
    // 12 stub tiles keep the mode grid
    await expect(page.locator('.mode-grid .mode-tile')).toHaveCount(12);
    await expect(page.locator('.plus-chip')).toBeVisible();
  });

  test('tapping SWARM crossfades through MIX and lands the voice', async ({ page }) => {
    await page.locator('.voice-chip.flagship', { hasText: 'SWARM' }).click();
    // MIX bar appears while the crossfade runs
    const mixBar = page.locator('.mix-bar');
    await expect(mixBar).toBeVisible({ timeout: 5_000 });
    await expect(mixBar).toContainText(/SWARM/);
    // 4s signature blend — wait for the commit to land
    await expect(mixBar).toBeHidden({ timeout: 15_000 });
    // Chip stays lit and the canvas reports the voice's mode
    await expect(page.locator('.voice-chip.flagship.active', { hasText: 'SWARM' })).toBeVisible();
    await expect(page.locator('.canvas-corner.tr').first()).toContainText(/swarm/i, { timeout: 10_000 });
  });

  test('stub tiles switch mode with no MIX (current behavior)', async ({ page }) => {
    await page.locator('.mode-grid .mode-tile', { hasText: 'grid' }).click();
    await expect(page.locator('.mode-grid .mode-tile.active', { hasText: 'grid' })).toBeVisible();
    // No crossfade for stubs — the MIX bar never appears
    await page.waitForTimeout(800);
    await expect(page.locator('.mix-bar')).toHaveCount(0);
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
