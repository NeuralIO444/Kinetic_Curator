// Roll scope + BEAT master clock (#964): the MODE/MOTION chips arm a scope
// for KINETIC rolls instead of selecting outright, and the top-bar BEAT
// button is the one clock the phrase metro follows.
import { test, expect } from '@playwright/test';

const PINNED = ['composition', 'mode', 'behave', 'lifeDrift', 'noiseSpeed', 'wind', 'flap', 'breath'];

async function snap(page) {
  return page.evaluate(() => {
    const s = window.__kcStore.getState();
    return {
      armedMode: s.armedMode,
      armedMotion: s.armedMotion,
      lp: { ...s.layoutParams },
      beatBpm: s.beatBpm,
      phraseBeat: s.phraseBeat,
    };
  });
}

test.describe('UX-4 roll scope + BEAT master clock', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
      window.__KC_EXPOSE_STORE = true;
    });
    await page.goto('/?boot=factory');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  });

  test('arming phi + FLOCK pins mode/motion across KINETIC rolls', async ({ page }) => {
    const phiChip = page.locator('.mode-strip .chip-btn[title*="fibonacci"]');
    const flockChip = page.locator('.mode-strip .chip-btn', { hasText: /^FLOCK$/ });
    await phiChip.click();
    await flockChip.click();
    await expect(phiChip).toHaveClass(/armed/);
    await expect(flockChip).toHaveClass(/armed/);
    await expect(phiChip).toHaveAttribute('aria-pressed', 'true');
    let s = await snap(page);
    expect(s.armedMode).toBe('fibonacci');
    expect(s.armedMotion).toBe('flock');

    // CHAOS path (store action, deterministic): composition + mode + motion
    // hold while everything else moves.
    const before = s.lp;
    await page.evaluate(() => window.__kcStore.getState().kineticRoll());
    s = await snap(page);
    for (const k of PINNED) expect(s.lp[k], k).toBe(before[k]);
    expect(JSON.stringify(s.lp)).not.toBe(JSON.stringify(before));

    // UI path: spaced KINETIC taps (RULES passes) respect the scope too.
    await page.locator('.kinetic-btn').click();
    await page.waitForTimeout(2600);
    await page.locator('.kinetic-btn').click();
    await page.waitForTimeout(2600);
    s = await snap(page);
    for (const k of PINNED) expect(s.lp[k], k).toBe(before[k]);

    // ✕ clears the scope — back to full-freedom rolls.
    await page.locator('.scope-clear').click();
    s = await snap(page);
    expect(s.armedMode).toBeNull();
    expect(s.armedMotion).toBeNull();
    await expect(phiChip).not.toHaveClass(/armed/);
    await expect(flockChip).not.toHaveClass(/armed/);
  });

  test('BEAT 90 drives the phrase metro', async ({ page }) => {
    // Set 90 through the real popover — one clock, set up top.
    await page.locator('.beat-btn').click();
    await page.locator('.beat-preset', { hasText: /^90$/ }).click();
    let s = await snap(page);
    expect(s.beatBpm).toBe(90);

    // Play panel drops its own BPM slider for a BEAT readout.
    await page.getByRole('tab', { name: /play/i }).click();
    await expect(page.locator('.davis-readout', { hasText: /BEAT · 90/ })).toBeVisible();

    // Arm the phrase loop on METRO and prove the tick rate follows BEAT:
    // at 90 BPM a beat is 667ms, so ~1.6s advances the bar by 2 — the old
    // 120 clock would have advanced it by 3.
    await page.locator('.davis-source-row .chip-btn', { hasText: /^METRO$/ }).click();
    await page.locator('button[title*="Arm the bar"]').click();
    await page.waitForTimeout(1600);
    s = await snap(page);
    expect(s.phraseBeat).toBeGreaterThanOrEqual(1);
    expect(s.phraseBeat).toBeLessThanOrEqual(2);
  });
});
