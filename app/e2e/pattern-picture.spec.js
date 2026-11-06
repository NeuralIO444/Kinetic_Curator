// #1795 — PATTERN PICTURE (an image sampled into a grid of shapes), driven through the real UI.
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

test('PICTURE: the mode tile writes through, opens at density 10, DRIFT and element motion stay live, SHUFFLE re-deals', async ({
  page,
}, info) => {
  await boot(page);
  await addStratum(page, 'PATTERN');
  const ed = page.locator('.pattern-editor');
  await ed.getByRole('tab', { name: /picture/i }).click();
  await expect.poll(async () => (await patternOf(page)).mode).toBe('PICTURE');
  expect((await patternOf(page)).density, 'an untouched density follows the mode').toBe(10);
  // the picture's marks move: DRIFT is a live mode row here (it pulses the marks), not a disabled still deal
  const drift = ed.getByRole('button', { name: 'Pattern drift' });
  await expect(drift).toBeEnabled();
  // the cells are separate elements: the motion select and the movers row are live too
  await expect(ed.getByRole('combobox', { name: 'Element motion' })).toBeEnabled();
  await expect(ed.getByRole('button', { name: 'Pattern movers' })).toBeEnabled();
  // grout and hero stay QUILT-only, disabled with their reasons, in every other mode
  await expect(ed.getByRole('button', { name: 'Pattern grout' })).toBeDisabled();
  await expect(ed.getByRole('button', { name: 'Pattern hero' })).toBeDisabled();
  // SHUFFLE re-deals the same sampler: a new seed, the same mode
  const seed0 = (await patternOf(page)).seed;
  await ed.getByRole('button', { name: /shuffle/i }).click();
  await expect.poll(async () => (await patternOf(page)).seed).not.toBe(seed0);
  expect((await patternOf(page)).mode).toBe('PICTURE');
  // for the review picture: hide the KC marks so the ground reads on its own, and show the mode tiles
  await page.evaluate(() => {
    const st = window.__kcStore;
    st.setState({ layers: st.getState().layers.map((l) => (l.type === 'pattern' ? l : { ...l, visible: false })) });
  });
  await ed.getByRole('tab', { name: /picture/i }).scrollIntoViewIfNeeded();
  // a slow headless runner trips the watchdog at boot (PERF PAUSED holds the last frame); RUN resumes it
  const run = page.getByRole('button', { name: /^▶\s*run$/i });
  if (await run.count()) await run.first().click();
  await page.waitForTimeout(1500); // let the picture settle on the canvas
  const w = page.viewportSize().width;
  await page.screenshot({ path: info.outputPath(`picture-${w}.png`), fullPage: false });
  await page
    .locator('.panel-canvas')
    .first()
    .screenshot({ path: info.outputPath(`picture-${w}-canvas.png`) });
  await ed.screenshot({ path: info.outputPath(`picture-${w}-editor.png`) });
});
