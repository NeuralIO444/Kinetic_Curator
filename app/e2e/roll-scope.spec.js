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

    // RULES path (store action): same scope, composition held, mode pinned.
    await page.evaluate(() => window.__kcStore.getState().kineticRulesPass());
    s = await snap(page);
    expect(s.lp.composition).toBe(compositionBefore);
    expect(s.lp.mode).toBe('fibonacci');
    expect(s.lp.behave).toBe('flock');

    // Clearing the scope drops the armed visuals too — back to full-freedom.
    await page.evaluate(() => window.__kcStore.getState().clearRollScope());
    s = await snap(page);
    expect(s.armedMode).toBeNull();
    expect(s.armedMotion).toBeNull();
    await expect(phiChip).not.toHaveClass(/armed/);
    await expect(flockChip).not.toHaveClass(/armed/);

    // The ✕ button does the same through the UI. force: true — after heavy
    // chaos renders the CI main thread can be too starved for Playwright's
    // actionability (stability) checks; the clicks themselves are fine.
    await phiChip.click({ force: true });
    await expect(page.locator('.scope-clear')).toBeVisible();
    await page.locator('.scope-clear').click({ force: true });
    await expect(phiChip).not.toHaveClass(/armed/);
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

    // Arm the phrase loop on METRO. The DIRECTOR panel's subtitle is the
    // proof the metro reads the master clock: it renders
    // `metro {beat}/{length} @ BEAT {bpm}` straight from beatBpm.
    // (Wall-clock tick assertions live here in spirit only: CI's SwiftShader
    // loop clock trips the render watchdog under load, which gates the metro
    // by design. The interval math itself — 60000 / sanitizeBeatBpm — is
    // covered by the beatClock selfcheck.)
    await page.locator('button[title*="Arm the bar"]').click();
    await page.getByRole('tab', { name: /director/i }).click();
    await expect(page.locator('.panel-davis .panel-subtitle', { hasText: /@ BEAT 90/ })).toBeVisible();
  });
});
