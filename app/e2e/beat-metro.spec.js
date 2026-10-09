// #1144 — beat honesty: with no audio the BEAT dial is silent by default and its dot is still; the artist's pulse switch
// makes the dialed tempo a REAL beatPulse the stage can feel, and the dot flashes only then.
import { test, expect } from '@playwright/test';

async function boot(page) {
  // the governor is disarmed: on a starved runner it pauses the instrument at boot, and a paused instrument has no metro
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; window.__KC_GOVERNOR_OFF = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => window.__kcStore.getState().setRunning(true));
  await expect.poll(() => page.evaluate(() => window.__kcStore.getState().running)).toBe(true);
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

test('the pulse follows the dialed tempo: 240 BPM beats more often than 60', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const s = window.__kcStore.getState(); s.setBeatMetro(true); s.setBeatBpm(240); });
  // count the ATTACKS (not the decaying value, which a slow runner barely lets fall): the hook counts each one
  const beats = async (ms) => { const a = await page.evaluate(() => window.__kcMetroBeats || 0); await page.waitForTimeout(ms); return (await page.evaluate(() => window.__kcMetroBeats || 0)) - a; };
  const fast = await beats(2000);
  await page.evaluate(() => window.__kcStore.getState().setBeatBpm(60));
  await page.waitForTimeout(300);
  const slow = await beats(2000);
  expect(fast).toBeGreaterThanOrEqual(3);
  expect(fast).toBeGreaterThan(slow);
});
