// #2010 — RAY GUN treatment bus records: the poem row's ray gun fires through the core API's treatments surface.
// The surface is bound by App at boot (startTreatments); an unbound surface refuses every write, so the tap
// landing at all is the live proof of the chain: App → treatments surface → layoutSlice → the form's record.
// No page errors; the chip readout follows the record through a full cycle and back to plain.
import { test, expect } from '@playwright/test';

test('the ray gun tap lands through the treatments surface: plain → carson → greiman → grit → shot → plain', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    window.__KC_EXPOSE_STORE = true;
    try {
      if (!sessionStorage.getItem('kc:e2e-booted')) localStorage.clear();
      sessionStorage.setItem('kc:e2e-booted', '1');
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  // stand a poem: a type-native look (#1932), then the poem-only re-deal
  await page.evaluate(() => {
    const s = window.__kcStore;
    s.setState({ layoutParams: { ...s.getState().layoutParams, composition: 'raster' } });
    s.getState().redealPoem();
  });
  await expect.poll(() => page.evaluate(() => !!window.__kcStore.getState().layoutParams.fieldForm)).toBe(true);
  const gun = page.locator('.poem-row').getByRole('button', { name: /^ray gun/ });
  await expect(gun).toHaveText('ray gun');
  const mode = () => page.evaluate(() => window.__kcStore.getState().layoutParams.fieldForm?.raygun?.mode ?? null);
  for (const m of ['carson', 'greiman', 'grit', 'shot']) {
    await gun.click();
    await expect.poll(mode).toBe(m);
    await expect(gun).toHaveText(`ray gun · ${m}`);
  }
  await gun.click();
  await expect.poll(mode).toBe(null);
  await expect(gun).toHaveText('ray gun');
  await page.screenshot({ path: 'test-results/treatment-bus-plain.png' });
  expect(errors).toEqual([]);
});
