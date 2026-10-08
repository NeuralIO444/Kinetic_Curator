// #1153 — the triad mints a voice from a find: a keep after a run of the artist's own rolls (Davis's BLOOM).
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!window.__kcStore)).toBe(true);
}
const curator = (page) => page.locator('.kc-topbar-curator .randomize-btn');
const voices = (page) => page.evaluate(() => window.__kcStore.getState().userVoices.map((v) => ({ id: v.id, name: v.name, rolls: v.earned?.rolls ?? null, caption: v.earned?.caption ?? null, stack: !!v.state.stack })));

test('a keep after a run of rolls mints an earned voice with the roll count; a keep with no run mints nothing', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('f'); // a plain keep, no run of rolls behind it
  await page.waitForTimeout(400);
  expect(await voices(page)).toEqual([]);
  // six rolls, but the first moved off the frame just kept: that is moving on, not a pass. Five rolls on frames nobody kept.
  for (let i = 0; i < 6; i++) { await curator(page).click(); await page.waitForTimeout(120); }
  await page.keyboard.press('f');
  await expect.poll(async () => (await voices(page)).length).toBe(1);
  const [v] = await voices(page);
  expect(v.rolls).toBe(5);
  expect(v.id).toMatch(/^ev-[0-9a-f]+-5$/);
  expect(v.caption).toMatch(/^after 5 rolls · \d+ marks · seed [0-9a-f]+$/);
  expect(v.name.length).toBeLessThanOrEqual(24);
});

test('the find carries the tracks: a PATTERN track on the page comes back when the voice is loaded', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__kcStore.getState().addPatternLayer('QUILT'));
  for (let i = 0; i < 6; i++) { await curator(page).click(); await page.waitForTimeout(120); }
  await page.keyboard.press('f');
  await expect.poll(async () => (await voices(page)).length).toBe(1);
  expect((await voices(page))[0].stack).toBe(true);
  await page.evaluate(() => { const s = window.__kcStore.getState(); s.removeLayer(s.layers.find((l) => l.type === 'pattern').id); });
  expect(await page.evaluate(() => window.__kcStore.getState().layers.some((l) => l.type === 'pattern'))).toBe(false);
  await page.evaluate(() => { const s = window.__kcStore.getState(); s.loadVoice(s.userVoices[0].id); s.commitVoiceMix(); });
  expect(await page.evaluate(() => window.__kcStore.getState().layers.some((l) => l.type === 'pattern'))).toBe(true);
});
