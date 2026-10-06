// #1018 — the whole FX row opens the effect editor (F8). Row-body taps
// anywhere on an FX row arm the editor (same FX_SELECT the name button
// emits); the row's icon buttons, the opacity slider, and the editor's own
// controls keep their own handlers and must not open the editor.
import { test, expect } from '@playwright/test';

test('FX row body tap opens the effect editor; controls stay independent', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  const stack = page.locator('.build-layer-stack');

  // Arm two FX tracks via the FX section "+". Adding selects the new
  // track, so FX 2's editor is open; FX 1's row is the tap target.
  const fxPlus = stack.locator('.layer-section').nth(1).locator('.layer-add-btn');
  await fxPlus.click();
  await fxPlus.click();
  const fxRows = stack.locator('.layer-row-fx');
  await expect(fxRows).toHaveCount(2);
  const fx1 = fxRows.nth(0);
  const fx2 = fxRows.nth(1);
  await expect(fx2.locator('.fx-editor')).toBeVisible();
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);

  // (1) Tap the FX 1 row body — not the name button (use the numeral
  // tile, which is pure row body) — the editor opens on FX 1.
  await fx1.locator('.track-numeral').click();
  await expect(fx1.locator('.fx-editor')).toBeVisible();
  await expect(fx1).toHaveClass(/layer-row-fx-selected/);
  await expect(fx2).not.toHaveClass(/layer-row-fx-selected/);

  // Tap another bare row-body spot (the FX badge) — still the editor,
  // and the correct effect ordinal (FX 1) is selected.
  await fx2.locator('.fx-badge').click();
  await expect(fx2.locator('.fx-editor')).toBeVisible();
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);

  // (2) Icon buttons act on themselves and don't move the editor.
  // Visibility toggle on FX 1: the row dims, editor stays on FX 2.
  await fx1.getByTitle('Toggle visibility').click();
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);
  await expect(fx2.locator('.fx-editor')).toBeVisible();
  await fx1.getByTitle('Toggle visibility').click();

  // Opacity slider on FX 1: readout moves, editor does not open there.
  const slider = fx1.locator('.layer-row-composite input[type=range]');
  const readout = fx1.locator('.layer-opacity-readout');
  // Native value setter: React's controlled input ignores a direct
  // el.value assignment, so go through the prototype setter.
  await slider.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '0.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(readout).toHaveText('50%');
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);
  await expect(fx2.locator('.fx-editor')).toBeVisible();

  // DUP on FX 1: a third FX row appears (DUP selects the new duplicate by
  // design — pre-existing behavior). FX 1's own editor was not opened by
  // the button tap.
  await fx1.getByTitle('Duplicate').click();
  await expect(stack.locator('.layer-row-fx')).toHaveCount(3);
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);
  const fxCopy = stack.locator('.layer-row-fx').nth(1);
  await expect(fxCopy.locator('.fx-editor')).toBeVisible();

  // × on the last FX row: the row is removed, the open editor is untouched.
  await stack.locator('.layer-row-fx').nth(2).getByTitle('Remove track (undoable)').click();
  await expect(stack.locator('.layer-row-fx')).toHaveCount(2);
  await expect(stack.locator('.layer-row-fx .fx-editor')).toHaveCount(1);

  // (3) KC row behavior unchanged: name click switches the active track.
  // Add a second KC track first (factory boots with one).
  const contentPlus = stack.locator('.layer-section').nth(0).locator('.layer-add-btn');
  await contentPlus.click();
  const kcRows = stack.locator('.layer-row-kc');
  await expect(kcRows).toHaveCount(2);
  await kcRows.nth(0).locator('.layer-name').click();
  await expect(kcRows.nth(0)).toHaveClass(/layer-row-active/);
  // KC rows are not row-tappable for anything (no FX-style selection):
  // tapping the KC numeral does not open any FX editor.
  await kcRows.nth(1).locator('.track-numeral').click();
  await expect(stack.locator('.layer-row-fx .fx-editor')).toHaveCount(1);
});
