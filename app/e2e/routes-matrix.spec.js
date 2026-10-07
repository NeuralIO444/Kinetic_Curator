// e2e/routes-matrix.spec.js — #790 PR4: the assignable modulation matrix.
// Drives the real controls: edit a route, add, remove, reset, and click a meter
// band to route it. (What the routes DO to the picture is proven live in the PR
// with a fake microphone; here it is the editing surface.)
import { test, expect } from '@playwright/test';

test('STIMULI matrix: edit, add, remove, reset, click-a-band', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /stimuli/i }).click();
  const rows = page.locator('.stim-route');
  const reset = page.getByRole('button', { name: 'reset', exact: true });
  const add = page.getByRole('button', { name: '+ ROUTE' });

  // untouched: today's seven routes, RESET greyed, MID / TREBLE honestly not routed
  await expect(rows).toHaveCount(7);
  await expect(reset).toBeDisabled();
  await expect(page.locator('.stim-matrix-unrouted')).toContainText('MID · TREBLE');
  await expect(page.getByLabel('Route 1 input')).toHaveValue('beat');
  await expect(page.getByLabel('Route 1 target')).toHaveValue('render.scale');

  // a duplicate pair can't be picked: beat already drives every target, so none is offered to route 1
  await expect(page.getByLabel('Route 1 target').locator('option[value="render.alpha"]')).toBeDisabled();

  // edit: route 2 is BASS → scale; a target change customises the table and arms RESET
  await expect(page.getByLabel('Route 2 input')).toHaveValue('bass');
  await page.getByLabel('Route 2 target').selectOption('render.alpha');
  await expect(page.getByLabel('Route 2 target')).toHaveValue('render.alpha');
  await expect(reset).toBeEnabled();
  // and now beat → alpha is taken for route 2's input picker too
  await expect(page.getByLabel('Route 2 input').locator('option[value="beat"]')).toBeDisabled();

  // typed depth lands
  const depth = page.getByLabel('Route 2 depth value');
  await depth.fill('7');
  await expect(depth).toHaveValue('7');

  // add and remove
  await add.click();
  await expect(rows).toHaveCount(8);
  await expect(page.getByLabel('Route 8 input')).toHaveValue('band.air');
  await page.getByRole('button', { name: 'Remove route 8' }).click();
  await expect(rows).toHaveCount(7);

  // RESET → the default table, byte for byte what we started with
  await reset.click();
  await expect(rows).toHaveCount(7);
  await expect(page.getByLabel('Route 1 target')).toHaveValue('render.scale');
  await expect(reset).toBeDisabled();

  // CLEAR: start from scratch in one click: audio drives nothing, and it says so
  const clear = page.getByRole('button', { name: 'clear', exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator('.stim-matrix-empty')).toContainText('sound drives nothing');
  await expect(clear).toBeDisabled();
  await expect(add).toBeEnabled();
  // …and build up from nothing with + ROUTE
  await add.click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByLabel('Route 1 input')).toHaveValue('band.air');
  await expect(reset).toBeEnabled();
  // removing the last route is the same empty state
  await page.getByRole('button', { name: 'Remove route 1' }).click();
  await expect(rows).toHaveCount(0);
  await reset.click();
  await expect(rows).toHaveCount(7);

  // click a band in the meter: a route for that band appears (MUD is the 3rd of 7)
  const cv = page.locator('.stim-meter-canvas');
  const box = await cv.boundingBox();
  await cv.click({ position: { x: box.width * (2.5 / 7), y: box.height - 40 } });
  await expect(rows).toHaveCount(8);
  await expect(page.getByLabel('Route 8 input')).toHaveValue('band.mud');
  // the waveform area is not a band
  await cv.click({ position: { x: box.width * 0.5, y: 10 } });
  await expect(rows).toHaveCount(8);
});
