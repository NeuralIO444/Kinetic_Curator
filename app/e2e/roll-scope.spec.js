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
      seed: s.seed,
      paletteId: s.paletteId,
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
      // #655 hook: disarm the performance governor — under CI load its
      // slowRender shed would gate the phrase metro and contaminate the
      // tick-rate assertion with nondeterminism.
      window.__KC_GOVERNOR_OFF = true;
    });
    await page.goto('/?boot=factory');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  });

  test('arming phi + FLOCK pins mode/motion across KINETIC rolls', async ({ page }) => {
    const phiChip = page.locator('.mode-strip .chip-btn[title*="fibonacci"]');
    // NOTE: no ^$ anchors — arming appends the 📌 pin glyph to the chip text.
    const flockChip = page.locator('.mode-strip .chip-btn', { hasText: /FLOCK/ });
    await phiChip.click();
    await flockChip.click();
    await expect(phiChip).toHaveClass(/armed/);
    await expect(flockChip).toHaveClass(/armed/);
    await expect(phiChip).toHaveAttribute('aria-pressed', 'true');
    let s = await snap(page);
    expect(s.armedMode).toBe('fibonacci');
    expect(s.armedMotion).toBe('flock');
    const compositionBefore = s.lp.composition;

    // CHAOS path (store action, deterministic): the armed MODE keeps the
    // composition and pins the mode; the armed MOTION pins the motion
    // numbers — everything else moves.
    await page.evaluate(() => window.__kcStore.getState().kineticRoll());
    const a = await snap(page);
    expect(a.lp.composition).toBe(compositionBefore);
    expect(a.lp.mode).toBe('fibonacci');
    expect(a.lp.behave).toBe('flock');

    // A second roll holds the same scope while reworking the rest: the pinned
    // layoutParams are value-identical (that's the pin working), while the
    // top-level seed is always dealt fresh.
    await page.evaluate(() => window.__kcStore.getState().kineticRoll());
    const b = await snap(page);
    for (const k of PINNED) expect(b.lp[k], k).toBe(a.lp[k]);
    expect(b.seed).not.toBe(a.seed);

    // UI path: spaced KINETIC taps (RULES passes) respect the scope too.
    await page.locator('.kinetic-btn').click();
    await page.waitForTimeout(2600);
    await page.locator('.kinetic-btn').click();
    await page.waitForTimeout(2600);
    s = await snap(page);
    expect(s.lp.composition).toBe(compositionBefore);
    expect(s.lp.mode).toBe('fibonacci');
    expect(s.lp.behave).toBe('flock');

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

    // Play panel drops its own BPM slider for a BEAT readout (metro only).
    await page.getByRole('tab', { name: /play/i }).click();
    await page.locator('.davis-source-row .chip-btn', { hasText: /^METRO$/ }).click();
    await expect(page.locator('.davis-readout', { hasText: /BEAT · 90/ })).toBeVisible();

    // Arm the phrase loop on METRO and prove the tick rate follows BEAT:
    // at 90 BPM a beat is 667ms, so ~1.6s advances the bar by 2 — the old
    // 120 clock would have advanced it by 3.
    await page.locator('button[title*="Arm the bar"]').click();
    await page.waitForTimeout(1600);
    s = await snap(page);
    expect(s.phraseBeat).toBeGreaterThanOrEqual(1);
    expect(s.phraseBeat).toBeLessThanOrEqual(2);
  });
});
