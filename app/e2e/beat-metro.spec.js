// #1144 — beat honesty: with no audio the BEAT dial is silent by default and its dot is still; the artist's pulse switch
// makes the dialed tempo a REAL beatPulse the stage can feel, and the dot flashes only then.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
}
// the largest beatPulse seen over `ms`, sampled every 25 ms
const peak = (page, ms) => page.evaluate((ms) => new Promise((resolve) => {
  let max = 0; const t0 = performance.now();
  const id = setInterval(() => { max = Math.max(max, window.__kcStore.getState().beatPulse || 0); if (performance.now() - t0 >= ms) { clearInterval(id); resolve(max); } }, 25);
}), ms);

test('off by default: no audio means no beat and a still dot; pulse on makes a real beatPulse and a live dot; off stops it', async ({ page }) => {
  await boot(page);
  const dot = page.locator('.beat-dot');
  await expect(dot).not.toHaveClass(/live/);
  expect(await peak(page, 1300)).toBe(0); // 120 BPM would have beaten twice: nothing does
  await page.locator('.beat-btn').click();
  const sw = page.getByRole('button', { name: 'pulse', exact: true });
  await expect(sw).toHaveAttribute('aria-pressed', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-pressed', 'true');
  await expect(dot).toHaveClass(/live/);
  expect(await peak(page, 1300)).toBeGreaterThan(0.4); // the same attack an audio onset makes: +0.55, capped at 1
  await sw.click();
  await expect(dot).not.toHaveClass(/live/);
  await page.waitForTimeout(700); // let the last pulse decay
  expect(await peak(page, 1300)).toBeLessThan(0.05);
});

test('the pulse follows the dialed tempo: 60 BPM beats about half as often as 120', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const s = window.__kcStore.getState(); s.setBeatMetro(true); s.setBeatBpm(240); });
  const count = (ms) => page.evaluate((ms) => new Promise((resolve) => {
    let beats = 0; let prev = 0; const t0 = performance.now();
    const id = setInterval(() => { const p = window.__kcStore.getState().beatPulse || 0; if (p > prev + 0.3) beats += 1; prev = p; if (performance.now() - t0 >= ms) { clearInterval(id); resolve(beats); } }, 10);
  }), ms);
  const fast = await count(2000);
  await page.evaluate(() => window.__kcStore.getState().setBeatBpm(60));
  await page.waitForTimeout(300);
  const slow = await count(2000);
  expect(fast).toBeGreaterThanOrEqual(slow * 2);
  expect(slow).toBeGreaterThanOrEqual(1);
});
