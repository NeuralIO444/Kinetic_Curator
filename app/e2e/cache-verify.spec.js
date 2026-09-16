// Guards #108 step 4 (staged-eval cache) through the React wiring, which the
// pure stagedEval.selfcheck cannot reach: the per-Layer cache lives in a
// useState slot in useCanvasItems, and a stale one would silently swallow
// geometry edits while the canvas kept animating convincingly.
//
// NOTE: screenshot diffing is useless here — the canvas animates every frame,
// so two shots always differ whether or not an edit took effect. Assert on
// node identity instead, which only changes when the kernel re-derives.
import { test, expect } from '@playwright/test';

const keys = async (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('svg use')).map((u) =>
    u.getAttribute('href') + '@' + (u.getAttribute('transform') || '')));

test('staged-eval cache does not swallow geometry edits', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript(() => {
    try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
  });
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  const before = await keys(page);
  expect(before.length).toBeGreaterThan(0);
  console.log('[cache] initial <use> nodes:', before.length);

  // COUNT is a stage-A input. If the geometry cache were stale, the node
  // count would not move — and node count cannot be faked by animation.
  await page.getByRole('tab', { name: /layout/i }).first().click();
  await page.waitForTimeout(300);
  const countSlider = page.locator('input[type="range"]').first();
  await countSlider.focus();
  for (let k = 0; k < 25; k++) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(800);

  const after = await keys(page);
  console.log('[cache] after COUNT edit:', after.length);
  expect(after.length, 'COUNT edit did not change node count — geometry cache is stale')
    .not.toBe(before.length);

  // Direction, not an exact value: ambient drift and key-repeat timing move
  // the node count by a few units run to run, so asserting an exact restore
  // is flaky even on main (verified: main returns 196/201/205, never 198).
  expect(after.length, 'lowering COUNT should lower the node count')
    .toBeLessThan(before.length);

  // And back up again — the cache must not be one-way sticky.
  for (let k = 0; k < 25; k++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  const restored = await keys(page);
  console.log('[cache] after restoring COUNT:', restored.length);
  expect(restored.length, 'raising COUNT again should raise the node count')
    .toBeGreaterThan(after.length);

  expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
});
