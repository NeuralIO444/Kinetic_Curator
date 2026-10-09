// #1144 — beat honesty: with no audio the BEAT dial is silent by default and its dot is still; the artist's pulse switch
// makes the dialed tempo a REAL attack the stage can feel, and the dot flashes only then.
//
// Written for a starved runner (software GL, ~1 fps, the watchdog pausing the instrument): clicks are dispatched (no
// actionability waits on a busy page), the instrument is re-asserted RUNNING while we wait, and attacks are COUNTED by the
// hook (a decaying value is read back wrongly when frames are rare).
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
}
const beats = (page) => page.evaluate(() => window.__kcMetroBeats || 0);
const keepRunning = (page) => page.evaluate(() => window.__kcStore.getState().setRunning(true));
// wait until `n` MORE attacks have been counted, keeping the instrument running; returns the elapsed milliseconds
async function waitForBeats(page, n, timeout = 40_000) {
  const from = await beats(page); const t0 = Date.now();
  await expect.poll(async () => { await keepRunning(page); return (await beats(page)) - from; }, { timeout, intervals: [100] }).toBeGreaterThanOrEqual(n);
  return Date.now() - t0;
}

test('off by default: no attacks and a still dot; the pulse switch starts real attacks and a live dot; off stops them', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page);
  const dot = page.locator('.beat-dot');
  await expect(dot).not.toHaveClass(/live/);
  await keepRunning(page); await page.waitForTimeout(1500);
  expect(await beats(page)).toBe(0); // 120 BPM would have beaten about three times: nothing does
  await page.locator('.beat-btn').dispatchEvent('click');
  const sw = page.getByRole('button', { name: 'pulse', exact: true });
  await expect(sw).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
  await sw.dispatchEvent('click');
  await expect(sw).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect(dot).toHaveClass(/live/);
  await waitForBeats(page, 2);
  await sw.dispatchEvent('click');
  await expect(dot).not.toHaveClass(/live/, { timeout: 30_000 });
  const stopped = await beats(page); await keepRunning(page); await page.waitForTimeout(1600);
  expect(await beats(page) - stopped).toBeLessThanOrEqual(1); // at most one attack already in flight
});

test('the pulse follows the dialed tempo: the timer it asks for is 60000 / BPM (read from the request, not from wall time, which a starved runner cannot keep)', async ({ page }) => {
  test.setTimeout(180_000);
  // record every interval the page asks for, before the app boots
  await page.addInitScript(() => {
    window.__kcIntervals = []; const real = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...rest) => { window.__kcIntervals.push(ms); return real(fn, ms, ...rest); };
  });
  await boot(page);
  const asked = () => page.evaluate(() => window.__kcIntervals.slice());
  await page.evaluate(() => { const s = window.__kcStore.getState(); s.setBeatMetro(true); s.setBeatBpm(240); });
  await expect.poll(asked, { timeout: 30_000 }).toContain(250);
  await page.evaluate(() => window.__kcStore.getState().setBeatBpm(60));
  await expect.poll(asked, { timeout: 30_000 }).toContain(1000);
  await page.evaluate(() => window.__kcStore.getState().setBeatBpm(120));
  await expect.poll(asked, { timeout: 30_000 }).toContain(500);
});
