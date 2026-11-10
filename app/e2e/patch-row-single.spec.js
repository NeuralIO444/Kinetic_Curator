// PATCH under the one-content law (#2038), the add-path side: PATCH links
// two KC tracks, and a second content track can never exist — the content
// cap is one (MAX_CONTENT_TRACKS). So the row stays disabled no matter how
// the performer pushes on ADD STRATUM: the long-press chooser refuses
// CONTENT outright ("Track cap reached"), and plain taps fall forward to
// the other stratum types until the skeleton stands at its caps — CONTENT
// 1/1 the entire time, PATCH still naming its blocker.
//
// (The boot-state half of this law — the row's title and disabled selects
// before any add attempt — is pinned by patch-row.spec.js. Pre-#2038 this
// spec armed a second KC track and watched PATCH enable; that world is
// exactly what the rebuild retired.)
import { test, expect } from '@playwright/test';

test('PATCH row stays disabled — one content track only', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();

  const stack = page.locator('.build-layer-stack');
  const content = stack.locator('.strata-block.strata-content:not(.strata-pattern)');
  const subtitle = stack.locator('.panel-subtitle');
  const patchRow = content.nth(0).locator('.strata-composite[title^="PATCH"]');

  // Factory boots with one KC track, active so its block is expanded, and
  // the header already reads the content cap in the open: CONTENT 1/1.
  await expect(content).toHaveCount(1);
  await expect(subtitle).toContainText('CONTENT 1/1');
  await expect(patchRow).toHaveAttribute('title', 'PATCH needs a second KC track');
  const [mode, target] = await patchRow.locator('select').all();
  await expect(mode).toBeDisabled();
  await expect(target).toBeDisabled();

  // The explicit ask is refused too: hold ADD STRATUM (650ms opens the
  // type chooser) and CONTENT stands disabled at its cap, while a type
  // with room (FX) is offered — the chooser is live, it is the content
  // track specifically that cannot be had.
  const addSlot = stack.locator('.strata-add');
  await addSlot.scrollIntoViewIfNeeded();
  const box = await addSlot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const chooser = page.locator('.layer-chooser');
  await expect(chooser).toBeVisible({ timeout: 5_000 });
  const contentItem = chooser.locator('.layer-chooser-item', { hasText: /^CONTENT$/ });
  await expect(contentItem).toBeDisabled();
  await expect(contentItem).toHaveAttribute('title', 'Track cap reached');
  await expect(chooser.locator('.layer-chooser-item', { hasText: /^FX$/ })).toBeEnabled();
  await page.mouse.up();
  await page.locator('.layer-chooser-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(chooser).toBeHidden();

  // Plain taps still add — just never content: two taps fill FX and MATH
  // to their caps while CONTENT holds at 1/1, the full skeleton in the
  // header (CONTENT 1/1 · MATH 1/1 · FX 1/1).
  await addSlot.click();
  await expect(content).toHaveCount(1);
  await addSlot.click();
  await expect(content).toHaveCount(1);
  await expect(subtitle).toContainText('CONTENT 1/1 · MATH 1/1 · FX 1/1');

  // And PATCH is exactly where it started: named blocker, both selects off.
  await expect(patchRow).toHaveAttribute('title', 'PATCH needs a second KC track');
  await expect(mode).toBeDisabled();
  await expect(target).toBeDisabled();
});
