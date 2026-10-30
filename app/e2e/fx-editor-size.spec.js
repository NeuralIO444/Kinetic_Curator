// #1046 — FX editors size to their content. For every effect the FX layer
// can hold, open its editor and measure the panel box against the box
// around its controls: the panel may not be taller than its content plus
// padding, and no panel may be more than half empty. An empty layer gets
// an action, never a void.
//
// #1609 re-pin (D6): the rack of four family-bound tracks is gone — one
// FX layer holds any kinds as tiles over a single add row. The sizing
// property is re-staged on that editor: the empty layer (add row only),
// then every kind in the catalogue, one tile at a time.
import { test, expect } from '@playwright/test';
import { seedAddType } from './strata-add.mjs';

// The chrome around the controls, which is not dead space: the .fx-editor's
// own 6px top padding + 1px dashed top border, plus a tile's 1px top and
// bottom borders and 4px bottom padding (the tile's top padding is 0) = 13px
// when a tile leads. PAD is 16 = that chrome plus 3px of tolerance for
// subpixel and rounding on another font or DPI. Do not "correct" it to 13:
// that leaves no tolerance against a measurement that sits exactly on it.
// Anything beyond 16 is dead space.
const PAD = 16;

// Panel box vs the union box of everything inside the editor.
async function measure(editor) {
  return editor.evaluate((el) => {
    const panel = el.getBoundingClientRect();
    const kids = [...el.children].map((k) => k.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const top = Math.min(...kids.map((r) => r.top));
    const bottom = Math.max(...kids.map((r) => r.bottom));
    const left = Math.min(...kids.map((r) => r.left));
    const right = Math.max(...kids.map((r) => r.right));
    const content = { w: right - left, h: bottom - top };
    return {
      panelW: panel.width,
      panelH: panel.height,
      contentW: content.w,
      contentH: content.h,
      filled: (content.w * content.h) / (panel.width * panel.height),
    };
  });
}

test('the FX editor is as tall as its controls, and an empty layer offers an action', async ({ page }) => {
  await seedAddType(page, 'fx'); // one-tap ADD STRATUM arms the FX layer, empty
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  const stack = page.locator('.build-layer-stack');
  const addSlot = stack.locator('.strata-add');

  await addSlot.click(); // adds the FX layer and selects it, so its editor is open
  const editor = stack.locator('.strata-block.strata-fx .fx-editor');
  await expect(editor).toHaveCount(1);

  // The empty state: a call to action (kind select + ADD chip), and no
  // bare "empty" void.
  await expect(editor.locator('.ef-tile')).toHaveCount(0);
  await expect(editor).not.toContainText(/^\s*empty\s*$/i);
  const addChip = editor.locator('.fx-add-row .chip-btn');
  await expect(addChip).toHaveCount(1);
  await expect(addChip).toContainText(/\+ ADD/);
  const m0 = await measure(editor);
  expect(m0.panelH, 'empty layer height').toBeLessThanOrEqual(m0.contentH + PAD);
  expect(m0.filled, 'empty layer is mostly empty').toBeGreaterThanOrEqual(0.5);

  // Every kind the layer can hold: add it, measure, remove it.
  const kinds = await editor.locator('.fx-add-row select option').evaluateAll((os) => os.map((o) => o.value));
  expect(kinds.length).toBeGreaterThanOrEqual(10);
  const seen = [];
  for (const kind of kinds) {
    const ed = stack.locator('.strata-block.strata-fx .fx-editor').first();
    await ed.locator('.fx-add-row select').selectOption(kind);
    await ed.locator('.fx-add-row .chip-btn').click();
    const filled = stack.locator('.strata-block.strata-fx .fx-editor').first();
    await expect(filled.locator('.ef-tile .ef-bypass')).toBeVisible();
    const m = await measure(filled);
    seen.push(kind);
    expect(m.panelH, `${kind}: panel ${m.panelH}px vs content ${m.contentH}px`).toBeLessThanOrEqual(m.contentH + PAD);
    expect(m.filled, `${kind}: panel is ${(100 - m.filled * 100).toFixed(0)}% empty`).toBeGreaterThanOrEqual(0.5);
    await filled.locator('.ef-tile .ef-bypass').click(); // back to the empty layer for the next kind
    await expect(stack.locator('.strata-block.strata-fx .fx-editor').first().locator('.ef-tile')).toHaveCount(0);
    await expect(
      stack.locator('.strata-block.strata-fx .fx-editor').first().locator('.fx-add-row .chip-btn'),
    ).toHaveCount(1);
  }
  // One layer, and every effect in the catalogue was measured.
  expect(seen.length).toBeGreaterThanOrEqual(10);
});
