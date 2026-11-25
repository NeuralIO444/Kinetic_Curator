// The in-app DEV switch for the opt-in persona features (Matt, 2026-11-19/20; PR #2526): DEV → PERSONA TUNE carries
// one row per console flag. Every row starts off; a click turns on exactly its own flag (the same `true` the console
// types) and a second click removes it. This is the click path — the module half is devSwitches.selfcheck.mjs.
//
// The preview build is a release build, so the DEV panel is reached through the Dev mode preference (#2077).
import { test, expect } from '@playwright/test';

const ROWS = [
  { id: 'band', label: 'band', flag: '__KC_BAND' },
  { id: 'doctrineLayout', label: 'doctrine layout', flag: '__KC_DOCTRINE_LAYOUT' },
  { id: 'audible', label: 'audible beats', flag: '__KC_QUEEN_AUDIBLE' },
];

const flags = (page) =>
  page.evaluate(
    (names) => names.map((n) => (Object.prototype.hasOwnProperty.call(globalThis, n) ? globalThis[n] : 'unset')),
    ROWS.map((r) => r.flag),
  );

test('each DEV switch row flips exactly its own console flag, and back off', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.setItem('kc:dev-mode:v1', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /^\W*dev$/i }).click();
  await page
    .locator('.panel-dev')
    .getByRole('tab', { name: /persona tune/i })
    .click();
  const row = (r) => page.locator(`[data-dev-switch="${r.id}"]`);
  await expect(row(ROWS[0])).toBeVisible({ timeout: 30_000 });

  // off by default: no flag set, every row reads off
  expect(await flags(page)).toEqual(['unset', 'unset', 'unset']);
  for (const r of ROWS) {
    await expect(row(r)).toHaveAttribute('aria-pressed', 'false');
    await expect(row(r)).toHaveText(new RegExp(`^${r.label}: off$`, 'i'));
  }

  for (const [i, r] of ROWS.entries()) {
    // dispatched click: no actionability wait on a starved runner
    await row(r).dispatchEvent('click');
    await expect(row(r)).toHaveAttribute('aria-pressed', 'true');
    await expect(row(r)).toHaveText(new RegExp(`^${r.label}: on$`, 'i'));
    const on = ROWS.map((_, j) => (j === i ? true : 'unset'));
    expect(await flags(page), `${r.id} on sets only its own flag`).toEqual(on);
    await row(r).dispatchEvent('click');
    await expect(row(r)).toHaveAttribute('aria-pressed', 'false');
    expect(await flags(page), `${r.id} off removes its flag`).toEqual(['unset', 'unset', 'unset']);
  }

  // no row names a hidden seat
  for (const t of await page.locator('[data-dev-switch]').allInnerTexts()) expect(t).not.toMatch(/queen|governor/i);
});
