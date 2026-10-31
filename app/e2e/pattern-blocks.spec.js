// #1798 — PATTERN BLOCKS (merged-cell blocks), driven through the real UI.
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

test('BLOCKS: the mode tile writes through, opens at density 10, DRIFT is disabled with the reason, SHUFFLE re-deals', async ({
  page,
}, info) => {
  await boot(page);
  await addStratum(page, 'PATTERN');
  const ed = page.locator('.pattern-editor');
  await ed.getByRole('tab', { name: /blocks/i }).click();
  await expect.poll(async () => (await patternOf(page)).mode).toBe('BLOCKS');
  expect((await patternOf(page)).density, 'an untouched density follows the mode').toBe(10);
  // a deal is a still: DRIFT is a mode row here, disabled WITH its reason on the row itself
  const drift = ed.getByRole('button', { name: 'Pattern drift' });
  await expect(drift).toBeDisabled();
  await expect(drift).toHaveAttribute('title', /Still deal — a BLOCKS deal is a still/);
  // no separate elements: the motion select and the movers row are disabled with the reason
  await expect(ed.getByRole('combobox', { name: 'Element motion' })).toBeDisabled();
  const movers = ed.getByRole('button', { name: 'Pattern movers' });
  await expect(movers).toBeDisabled();
  await expect(movers).toHaveAttribute('title', /BLOCKS has no separate elements/);
  // SHUFFLE re-deals the same generator: a new seed, the same mode
  const seed0 = (await patternOf(page)).seed;
  await ed.getByRole('button', { name: /shuffle/i }).click();
  await expect.poll(async () => (await patternOf(page)).seed).not.toBe(seed0);
  expect((await patternOf(page)).mode).toBe('BLOCKS');
  // for the review picture: hide the KC marks so the ground reads on its own, and show the mode tiles
  await page.evaluate(() => {
    const st = window.__kcStore;
    st.setState({ layers: st.getState().layers.map((l) => (l.type === 'pattern' ? l : { ...l, visible: false })) });
  });
  await ed.getByRole('tab', { name: /blocks/i }).scrollIntoViewIfNeeded();
  // a slow headless runner trips the watchdog at boot (PERF PAUSED holds the last frame); RUN resumes it
  const run = page.getByRole('button', { name: /^▶\s*run$/i });
  if (await run.count()) await run.first().click();
  await page.waitForTimeout(1500); // let the deal settle on the canvas
  const w = page.viewportSize().width;
  await page.screenshot({ path: info.outputPath(`blocks-${w}.png`), fullPage: false });
  await page
    .locator('.panel-canvas')
    .first()
    .screenshot({ path: info.outputPath(`blocks-${w}-canvas.png`) });
  await ed.screenshot({ path: info.outputPath(`blocks-${w}-editor.png`) });
});
