// #1018 — the whole FX block header opens the effect editor (F8), #1203
// block stack. Header taps anywhere on an FX block arm the editor (same
// FX_SELECT the name button emits); the block's icon buttons, the wet
// row, and the editor's own controls keep their own handlers and must
// not move the editor.
import { test, expect } from '@playwright/test';
import { seedAddType } from './strata-add.mjs';

test('FX block header tap opens the effect editor; controls stay independent', async ({ page }) => {
  await seedAddType(page, 'fx'); // one-tap ADD STRATUM arms FX tracks
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  const stack = page.locator('.build-layer-stack');

  // Arm two FX tracks via the ADD STRATUM slot. Adding selects the new
  // track, so FX 2's editor is open; FX 1's block is the tap target.
  const addSlot = stack.locator('.strata-add');
  await addSlot.click();
  await addSlot.click();
  const fxBlocks = stack.locator('.strata-block.strata-fx');
  await expect(fxBlocks).toHaveCount(2);
  // Blocks are listed frontmost first, so the newest track (FX 2) is the top block.
  const fx1 = fxBlocks.nth(1);
  const fx2 = fxBlocks.nth(0);
  await expect(fx2.locator('.fx-editor')).toBeVisible();
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);

  // (1) Tap the FX 1 block header — not the name button (use the number
  // chip, which is pure header) — the editor opens on FX 1.
  await fx1.locator('.track-numeral').click();
  await expect(fx1.locator('.fx-editor')).toBeVisible();
  await expect(fx1).toHaveClass(/strata-expanded/);
  await expect(fx2).not.toHaveClass(/strata-expanded/);

  // Tap another bare header spot (the type tag) — still the editor,
  // and the correct effect ordinal (FX 1) is selected.
  await fx2.locator('.strata-type').click();
  await expect(fx2.locator('.fx-editor')).toBeVisible();
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);

  // (2) Icon buttons act on themselves and don't move the editor.
  // Visibility toggle on FX 1: the block dims, editor stays on FX 2.
  await fx1.getByTitle('Toggle visibility').click();
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);
  await expect(fx2.locator('.fx-editor')).toBeVisible();
  await fx1.getByTitle('Toggle visibility').click();

  // Wet control inside the expanded block (FX 2): a mode row since #1608 —
  // tap its readout to open the exact editor in the value dock and drive
  // the dock's slider. The readout moves and the editor stays open on
  // FX 2 and nothing collapses or re-arms. (#1203: collapsed blocks
  // render no controls.)
  const readout = fx2.locator('.layer-opacity-readout');
  await readout.click();
  const slider = page.locator('.te-dock.open input[type=range]');
  await expect(slider).toBeVisible();
  // Native value setter: React's controlled input ignores a direct
  // el.value assignment, so go through the prototype setter.
  await slider.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '0.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(readout).toHaveText('50%');
  await expect(fx2.locator('.fx-editor')).toBeVisible();
  await expect(fx1.locator('.fx-editor')).toHaveCount(0);
  // Dismiss the value dock (Esc) so the steps below tap the blocks
  // themselves — the dock overlays the panel's right edge while open.
  await page.keyboard.press('Escape');
  await expect(page.locator('.te-dock.open')).toHaveCount(0);

  // DUP on FX 1: a third FX block appears (DUP selects the new duplicate by
  // design — pre-existing behavior). FX 1's own editor was not opened by
  // the button tap.
  await fx1.getByTitle('Duplicate').click();
  await expect(stack.locator('.strata-block.strata-fx')).toHaveCount(3);
  // Top-first order is now [FX 2, copy, FX 1]: the copy sits above the track it duplicated.
  await expect(stack.locator('.strata-block.strata-fx').nth(2).locator('.fx-editor')).toHaveCount(0);
  const fxCopy = stack.locator('.strata-block.strata-fx').nth(1);
  await expect(fxCopy.locator('.fx-editor')).toBeVisible();

  // × on the last FX block: the block is removed, the open editor is untouched.
  await stack.locator('.strata-block.strata-fx').nth(2).getByTitle('Remove track (undoable)').click();
  await expect(stack.locator('.strata-block.strata-fx')).toHaveCount(2);
  await expect(stack.locator('.strata-block.strata-fx .fx-editor')).toHaveCount(1);

  // (3) KC block behavior: tap = edit — tapping the header selects the
  // track (same as the name button). Add a second KC track first (factory
  // boots with one).
  await seedAddType(page, 'content');
  await page.reload();
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  const stack2 = page.locator('.build-layer-stack');
  await stack2.locator('.strata-add').click();
  const kcBlocks = stack2.locator('.strata-block.strata-content:not(.strata-pattern)');
  await expect(kcBlocks).toHaveCount(2);
  // The newest track (KC-2) is active and expanded; tap KC-1's chip to edit it.
  await expect(kcBlocks.nth(0)).toHaveClass(/strata-expanded/);
  await kcBlocks.nth(1).locator('.track-numeral').click();
  await expect(kcBlocks.nth(1)).toHaveClass(/strata-expanded/);
  await expect(kcBlocks.nth(0)).not.toHaveClass(/strata-expanded/);
});
