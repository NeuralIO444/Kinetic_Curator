// #1797 — PATTERN TIDES (threshold grid), driven through the real UI.
import { test, expect } from '@playwright/test';
import { addStratum } from './strata-add.mjs';

async function boot(page) {
  await page.addInitScript(() => {
    window.__KC_EXPOSE_STORE = true;
    try {
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  await expect(page.locator('.build-layer-stack')).toBeVisible();
}
const patternOf = (page) =>
  page.evaluate(() => window.__kcStore.getState().layers.find((l) => l.type === 'pattern')?.pattern);

test('TIDES: the mode tile writes through, opens at density 10, and element motion is disabled with the reason', async ({
  page,
}, info) => {
  await boot(page);
  await addStratum(page, 'PATTERN');
  const ed = page.locator('.pattern-editor');
  await ed.getByRole('tab', { name: /tides/i }).click();
  await expect.poll(async () => (await patternOf(page)).mode).toBe('TIDES');
  expect((await patternOf(page)).density, 'an untouched density follows the mode').toBe(10);
  await expect(ed.getByRole('combobox', { name: 'Element motion' })).toBeDisabled();
  // #1608 — the params are mode rows: the readout button carries the name,
  // the disabled state and the reason (the slider lives in the value dock).
  const movers = ed.getByRole('button', { name: 'Pattern movers' });
  await expect(movers).toBeDisabled();
  await expect(movers).toHaveAttribute('title', /TIDES has no separate elements/);
  await page.getByRole('button', { name: 'Pattern drift' }).click();
  await page.locator('.te-dock.open input[type=range]').fill('60');
  await expect.poll(async () => (await patternOf(page)).drift).toBeCloseTo(0.6, 2);
  // for the review picture: hide the KC marks so the ground reads on its own, and show the mode tiles
  await page.evaluate(() => {
    const st = window.__kcStore;
    st.setState({ layers: st.getState().layers.map((l) => (l.type === 'pattern' ? l : { ...l, visible: false })) });
  });
  await ed.getByRole('tab', { name: /tides/i }).scrollIntoViewIfNeeded();
  // a slow headless runner trips the watchdog at boot (PERF PAUSED holds the last frame); RUN resumes it
  const run = page.getByRole('button', { name: /^▶\s*run$/i });
  if (await run.count()) await run.first().click();
  await page.waitForTimeout(2500); // let the field run a moment
  const w = page.viewportSize().width;
  await page.screenshot({ path: info.outputPath(`tides-${w}.png`), fullPage: false });
  await page
    .locator('.panel-canvas')
    .first()
    .screenshot({ path: info.outputPath(`tides-${w}-canvas.png`) });
  await ed.screenshot({ path: info.outputPath(`tides-${w}-editor.png`) });
});
