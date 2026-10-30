// PatchDiagLine must not restart its 1 Hz interval on every LayerStack render
// (KC_HANDOFF T9): a re-render faster than 1 Hz (driving a wet control)
// otherwise clears the timer before it can fire, freezing the line mid-drag.
import { test, expect } from '@playwright/test';

test('re-renders do not restart the PATCH diag interval', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* ignore */
    }
    window.__ivl1000 = 0;
    const orig = window.setInterval;
    window.setInterval = function (fn, ms, ...rest) {
      if (ms === 1000) window.__ivl1000 += 1;
      return orig.call(this, fn, ms, ...rest);
    };
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  // #1203 — one tap on ADD STRATUM arms KC-2; adding selects it, so its
  // block is the expanded one carrying the PATCH section.
  await page.locator('.build-layer-stack .strata-add').click();

  // Patch the expanded block so its diag line is live.
  const block = page
    .locator('.strata-block')
    .filter({ has: page.locator('.strata-composite[title^="PATCH"]') })
    .first();
  await block.locator('.strata-composite[title^="PATCH"] select').first().selectOption('field');

  // #1608 re-pin (cause: Phase 2 quantization) — the block's wet control
  // is a mode row now, so the render churn comes from tapping its mode
  // cells: each tap writes the layer opacity through the same bus the
  // slider used, at the same super-1Hz rate this test exists to survive.
  const cells = block.locator('.strata-composite .te-cell');
  const before = await page.evaluate(() => window.__ivl1000);
  for (let i = 0; i < 10; i++) await cells.nth(i % 2 === 0 ? 1 : 3).click(); // LOW / HIGH alternate — a change every tap
  const after = await page.evaluate(() => window.__ivl1000);
  expect(after - before, '1000ms intervals created during 10 re-renders').toBe(0);
});
