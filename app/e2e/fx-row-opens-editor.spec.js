// #1018 — the whole FX block header opens the effect editor (F8), #1203
// block stack. Header taps anywhere on an FX block arm the editor (same
// FX_SELECT the name button emits); the block's icon buttons, the wet
// row, and the editor's own controls keep their own handlers and must
// not move the editor.
//
// #1609 re-pin (D6): there is ONE FX layer now, not a rack of tracks —
// the two-track choreography (editor moving FX 1 ↔ FX 2, DUP minting a
// third block) is re-staged: the block boots unselected from a restored
// project so the header tap is what opens it, and DUP reads the cap
// (disabled) rather than minting a copy.
import { test, expect } from '@playwright/test';
import { seedAddType } from './strata-add.mjs';

// A stored project with one content stratum and one FX layer. Restoring
// it boots with nothing selected, so the FX editor starts closed.
const PROJECT = JSON.stringify({
  version: 1,
  seed: 7,
  paletteId: 'praystation',
  layers: [
    { id: 'kc-a', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    {
      id: 'fx-a',
      name: 'FX 1',
      type: 'fx',
      visible: true,
      layerBlendMode: 'normal',
      layerOpacity: 1,
      effects: [{ kind: 'invert', params: {} }],
    },
  ],
  activeLayerId: 'kc-a',
});

test('FX block header tap opens the effect editor; controls stay independent', async ({ page }) => {
  await page.addInitScript((doc) => {
    try {
      localStorage.setItem('kc:project:v1', doc);
    } catch {
      /* ignore */
    }
  }, PROJECT);
  await seedAddType(page, 'fx');
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  const stack = page.locator('.build-layer-stack');

  const fxBlocks = stack.locator('.strata-block.strata-fx');
  await expect(fxBlocks).toHaveCount(1);
  const fx = fxBlocks.nth(0);
  await expect(fx.locator('.fx-editor')).toHaveCount(0);

  // (1) Tap the FX block header — not the name button (use the number
  // chip, which is pure header) — the editor opens on the FX layer.
  await fx.locator('.track-numeral').click();
  await expect(fx.locator('.fx-editor')).toBeVisible();
  await expect(fx).toHaveClass(/strata-expanded/);

  // Tap another bare header spot (the type tag) — still the editor.
  await fx.locator('.strata-type').click();
  await expect(fx.locator('.fx-editor')).toBeVisible();

  // (2) Icon buttons act on themselves and don't move the editor.
  // Visibility toggle: the editor stays open across both taps.
  await fx.getByTitle('Toggle visibility').click();
  await expect(fx.locator('.fx-editor')).toBeVisible();
  await fx.getByTitle('Toggle visibility').click();
  await expect(fx.locator('.fx-editor')).toBeVisible();

  // Wet control inside the expanded FX block: a mode row since #1608 —
  // tap its readout to open the exact editor in the value dock and drive
  // the dock's slider. The readout moves and the editor stays open on
  // the FX layer and nothing collapses or re-arms. (#1203: collapsed
  // blocks render no controls.)
  const readout = fx.locator('.layer-opacity-readout');
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
  await expect(fx.locator('.fx-editor')).toBeVisible();
  // Dismiss the value dock (Esc) so the steps below tap the blocks
  // themselves — the dock overlays the panel's right edge while open.
  await page.keyboard.press('Escape');
  await expect(page.locator('.te-dock.open')).toHaveCount(0);

  // DUP on the FX block reads the skeleton cap: disabled, no second
  // FX block can be minted (#1609, D6 — the slice refuses it too).
  await expect(fx.getByTitle('Track cap reached')).toBeDisabled();
  await expect(stack.locator('.strata-block.strata-fx')).toHaveCount(1);

  // × on the FX block: the block is removed; the KC block is untouched.
  await fx.getByTitle('Remove track (undoable)').click();
  await expect(stack.locator('.strata-block.strata-fx')).toHaveCount(0);
  await expect(stack.locator('.strata-block.strata-content:not(.strata-pattern)')).toHaveCount(1);

  // (3) KC block behavior: tap = edit — tapping the header selects the
  // track (same as the name button). Add a second KC track first (the
  // restored project boots with one).
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
