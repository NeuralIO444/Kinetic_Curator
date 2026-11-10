// #2010 P1 · TORN & XEROXED — the worn letters reach the stage. Arms the ray gun from the poem row (the performer's
// tap, through the treatments surface) and proves the live draw: the record names the wear axis, the stage draws with
// no page errors, and the treated list the seam builds carries worn variants of the form's own letters.
import { test, expect } from '@playwright/test';
import { rayGunForm } from '../src/poets/rayGunForm.js';
import { WEAR_SOURCE_BY_ID } from '../src/poets/placement.js';

for (const vp of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`CARSON and SHOT draw torn / xerox letters on the stage (${vp.name})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && /asset|atlas|wear|typ_/i.test(m.text())) errors.push(m.text());
    });
    await page.setViewportSize({ width: vp.width, height: vp.height });
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
    await page.evaluate(() => {
      const s = window.__kcStore;
      s.setState({ layoutParams: { ...s.getState().layoutParams, composition: 'raster' } });
      s.getState().redealPoem();
    });
    await expect.poll(() => page.evaluate(() => !!window.__kcStore.getState().layoutParams.fieldForm)).toBe(true);
    const gun = page.locator('.poem-row').getByRole('button', { name: /^ray gun/ });
    await gun.click(); // carson
    await expect(gun).toHaveText('ray gun · carson');
    const rec = await page.evaluate(() => window.__kcStore.getState().layoutParams.fieldForm.raygun);
    expect(rec.wear).toBe(1);
    // the seam's own treated list (the same pure module the stage draws through, on the live form + record)
    const form = await page.evaluate(() => window.__kcStore.getState().layoutParams.fieldForm);
    const treated = rayGunForm(form, form.raygun);
    const worn = treated.stamps.filter((s) => WEAR_SOURCE_BY_ID.has(s.assetId));
    for (const s of worn) expect(WEAR_SOURCE_BY_ID.get(s.assetId)).toMatch(/^typ_/);
    expect(worn.length).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/raygun-wear-carson-${vp.name}.png` });
    await gun.click(); // greiman
    await gun.click(); // grit (#2010 P2)
    await expect(gun).toHaveText('ray gun · grit');
    await gun.click(); // shot
    await expect(gun).toHaveText('ray gun · shot');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/raygun-wear-shot-${vp.name}.png` });
    expect(errors).toEqual([]);
  });
}
