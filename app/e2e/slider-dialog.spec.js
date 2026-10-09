// #1202 — SCALE / ROTATE / ALPHA are TE value buttons now: tap opens the
// docked editor (role="dialog", aria-label "Edit <LABEL>"), and edits apply
// live through the house RangeRow. There is no separate tap-name dialog, no
// APPLY/CANCEL, and no double-click reset — the specs below assert the new
// model's properties instead of the old dialog's.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!window.__kcStore)).toBe(true);
  await page.getByRole('tab', { name: /build/i }).first().click();
}

// The amber value button for a param, scoped to the BUILD panel.
const valueButton = (page, name) =>
  page.locator('.panel-layout .te-value-btn', {
    has: page.locator('.te-value-label', { hasText: new RegExp(`^${name}$`) }),
  });

// The dock, matched only while it is open for the given param (it is always
// mounted, aria-hidden until opened, so an unfiltered role lookup is stale).
const dock = (page, name) => page.getByRole('dialog', { name: `Edit ${name}` });

const spinOf = (page) => page.evaluate(() => window.__kcStore.getState().layoutParams.rotateSpin);
const rangeOf = (page, key) => page.evaluate((k) => window.__kcStore.getState().layoutParams[k], key);

/** Set a native range input to an exact value and let React commit it. */
async function setRange(page, slider, value) {
  await slider.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(700);
}

test('tapping a value button opens the dock; Escape closes it', async ({ page }) => {
  await boot(page);
  await expect(dock(page, 'ALPHA')).toHaveCount(0);
  await valueButton(page, 'ALPHA').click();
  const d = dock(page, 'ALPHA');
  await expect(d).toBeVisible();
  // ALPHA edits through a min/max dual editor
  await expect(d.locator('.te-dual-row')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(dock(page, 'ALPHA')).toHaveCount(0);
});

test('dock edits apply live to the store and persist across reload', async ({ page }) => {
  await boot(page);
  await valueButton(page, 'ROTATE').click();
  const d = dock(page, 'ROTATE');
  const minInput = d.getByLabel('Rotate minimum');
  // The dock exposes the full hard range — no separate dialog needed
  await expect(minInput).toHaveAttribute('min', '-720');
  await expect(minInput).toHaveValue('-180');
  // No APPLY step in the dock model: the edit lands in the store at once.
  await setRange(page, minInput, -400);
  await expect.poll(() => rangeOf(page, 'rotate').then((r) => r[0])).toBe(-400);

  // The live-applied edit is autosaved: a reload keeps it (the old dialog's
  // min-attribute reset was dialog state, not the store — the store persists).
  await page.reload();
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => rangeOf(page, 'rotate').then((r) => r[0])).toBe(-400);
});

test('the hard range is enforced by the editor: inputs carry the hard min/max and a backwards span clamps', async ({ page }) => {
  await boot(page);
  await valueButton(page, 'SCALE').click();
  const d = dock(page, 'SCALE');
  const minInput = d.getByLabel('Scale minimum');
  const maxInput = d.getByLabel('Scale maximum');
  // RANGE_HARD.scale — the full hard range, wider than the old dialog's 0.1–3
  await expect(minInput).toHaveAttribute('min', '0.05');
  await expect(maxInput).toHaveAttribute('max', '6');
  // Pushing MIN past MAX cannot invert the span: the dual editor clamps low to high.
  await setRange(page, minInput, 6);
  const [lo, hi] = await rangeOf(page, 'scale').then((s) => [s.x[0], s.x[1]]);
  expect(lo).toBeLessThanOrEqual(hi);
});

test('ROTATE dock: the Spin matrix starts OFF; ON offers 0.05 rev/s and reveals the speed slider; OFF returns to 0', async ({ page }) => {
  await boot(page);
  await expect.poll(() => spinOf(page)).toBe(0);
  await valueButton(page, 'ROTATE').click();
  await expect(dock(page, 'ROTATE').locator('.te-matrix[aria-label="Spin"]')
    .getByRole('button', { name: 'OFF' })).toHaveAttribute('aria-pressed', 'true');

  await dock(page, 'ROTATE').locator('.te-matrix[aria-label="Spin"]')
    .getByRole('button', { name: 'ON' }).click();
  // #1128: spin is chosen — ON starts at the offered 0.05 rev/s, not 0
  await expect.poll(() => spinOf(page)).toBeCloseTo(0.05, 5);

  // The dock renders the editor captured at open time, so it is reopened to
  // see the speed slider the ON state unlocks.
  await page.keyboard.press('Escape');
  await expect(dock(page, 'ROTATE')).toHaveCount(0);
  await valueButton(page, 'ROTATE').click();
  const d = dock(page, 'ROTATE');
  const speed = d.getByLabel('Spin speed');
  await expect(speed).toBeVisible();
  await expect(speed).toHaveValue('0.05');
  // The hard cap lives on the input itself now (no more refusal dialog)
  await expect(speed).toHaveAttribute('max', '1');

  await setRange(page, speed, 0.2);
  await expect.poll(() => spinOf(page)).toBeCloseTo(0.2, 5);
  await expect(d.getByText('SPIN 0.20 rev/s')).toBeVisible();

  await d.locator('.te-matrix[aria-label="Spin"]').getByRole('button', { name: 'OFF' }).click();
  await expect.poll(() => spinOf(page)).toBe(0);
  // OFF drops the slider on the next open
  await page.keyboard.press('Escape');
  await valueButton(page, 'ROTATE').click();
  await expect(dock(page, 'ROTATE').getByLabel('Spin speed')).toHaveCount(0);
});
