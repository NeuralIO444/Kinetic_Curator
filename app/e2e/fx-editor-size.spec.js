// #1046 — FX editors size to their content. For every effect an FX track can
// hold, open its editor and measure the panel box against the box around its
// controls: the panel may not be taller than its content plus padding, and no
// panel may be more than half empty. Empty slots get an action, never a void.
import { test, expect } from '@playwright/test';

// The chrome around the controls, which is not dead space: the .fx-editor's own
// 6px top padding + 1px dashed top border, plus the tile's 1px top and bottom
// borders and 4px bottom padding (the tile's top padding is 0) = 13px. Anything
// beyond that is dead space.
const PAD = 16;

// Panel box vs the union box of everything inside the tile.
async function measure(editor) {
  return editor.evaluate((el) => {
    const panel = el.getBoundingClientRect();
    const kids = [...el.querySelectorAll('.ef-tile > *')].map((k) => k.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const top = Math.min(...kids.map((r) => r.top)); const bottom = Math.max(...kids.map((r) => r.bottom));
    const left = Math.min(...kids.map((r) => r.left)); const right = Math.max(...kids.map((r) => r.right));
    const content = { w: right - left, h: bottom - top };
    return { panelW: panel.width, panelH: panel.height, contentW: content.w, contentH: content.h,
      filled: (content.w * content.h) / (panel.width * panel.height) };
  });
}

test('every FX editor is as tall as its controls, and empty slots offer an action', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  const stack = page.locator('.build-layer-stack');
  // FX section = the one that owns the "Add FX track" button (robust to section order).
  const fxPlus = stack.locator('.layer-section').filter({ has: page.getByRole('button', { name: 'Add FX track' }) }).locator('.layer-add-btn');

  const seen = [];
  for (let track = 1; track <= 4; track++) {
    await fxPlus.click(); // adds FX n and selects it, so its editor is open
    const row = stack.locator('.layer-row-fx').nth(track - 1);
    // newest-first or oldest-first: find the row that has the editor open
    const editor = stack.locator('.layer-row-fx .fx-editor');
    await expect(editor).toHaveCount(1);

    // The empty state: a call to action, a header, and no bare "empty".
    const empty = editor.first();
    await expect(empty.locator('.ef-head')).toBeVisible();
    await expect(empty.locator('.ef-tile')).not.toContainText(/^\s*empty\s*$/i);
    const add = empty.locator('.chip-btn');
    await expect(add).toHaveCount(1);
    await expect(add).toContainText(/\+ ADD/);
    const m0 = await measure(empty);
    expect(m0.panelH, `empty slot (FX ${track}) height`).toBeLessThanOrEqual(m0.contentH + PAD);
    expect(m0.filled, `empty slot (FX ${track}) is mostly empty`).toBeGreaterThanOrEqual(0.5);

    // Every kind this slot can hold: add it, measure, remove it.
    const select = empty.locator('select');
    const kinds = (await select.count()) ? await select.locator('option').evaluateAll((os) => os.map((o) => o.value)) : [null];
    for (const kind of kinds) {
      const ed = stack.locator('.layer-row-fx .fx-editor').first();
      if (kind) await ed.locator('select').selectOption(kind);
      await ed.locator('.chip-btn').click();
      const filled = stack.locator('.layer-row-fx .fx-editor').first();
      await expect(filled.locator('.ef-bypass')).toBeVisible();
      const m = await measure(filled);
      const name = kind || `FX ${track} default`;
      seen.push(name);
      expect(m.panelH, `${name}: panel ${m.panelH}px vs content ${m.contentH}px`).toBeLessThanOrEqual(m.contentH + PAD);
      expect(m.filled, `${name}: panel is ${(100 - m.filled * 100).toFixed(0)}% empty`).toBeGreaterThanOrEqual(0.5);
      await filled.locator('.ef-bypass').click(); // back to the empty slot for the next kind
      await expect(stack.locator('.layer-row-fx .fx-editor').first().locator('.chip-btn')).toHaveCount(1);
    }
    expect(row).toBeTruthy();
  }
  // Four tracks, and every effect in the rack was measured.
  expect(seen.length).toBeGreaterThanOrEqual(10);
});
