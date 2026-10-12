// #1203 — the block stack's add flow, shared by the BUILD specs.
// The dashed ADD STRATUM slot: tap = add with last-used defaults,
// long-press (650ms) = type chooser (MATH / FX / CONTENT / PATTERN),
// then a family pick for FX (effect kind) and CONTENT (blend mode).
import { expect } from '@playwright/test';

/** Seed the slot's one-tap replay so a plain click() adds `type`. */
export async function seedAddType(page, type) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.setItem('kc:strata-last-add', t);
    } catch { /* ignore */ }
  }, type);
}

export async function longPress(page, locator) {
  await locator.dispatchEvent('pointerdown');
  // Hold until the chooser opens (the 650ms long-press fires), with headroom
  // for slow runners — releasing early would cancel the press timer.
  await expect(page.locator('.layer-chooser')).toBeVisible({ timeout: 10000 });
  await locator.dispatchEvent('pointerup');
}

/**
 * Long-press ADD STRATUM → pick the stratum type → (FX/CONTENT) pick the family.
 * @param {'MATH'|'FX'|'CONTENT'|'PATTERN'} type
 * @param {string} [family] e.g. 'TEAR' for FX, 'SCREEN' for CONTENT
 */
export async function addStratum(page, type, family) {
  const slot = page.locator('.build-layer-stack .strata-add');
  await slot.scrollIntoViewIfNeeded();
  await longPress(page, slot);
  const chooser = page.locator('.layer-chooser');
  await chooser.getByRole('button', { name: type, exact: true }).click();
  if (family) {
    // FX / CONTENT open their family chooser second; the pick closes it.
    await expect(chooser).toBeVisible();
    await chooser.getByRole('button', { name: family, exact: true }).click();
    await expect(chooser).toHaveCount(0);
  }
  // Without a family the family chooser stays open for the caller.
}
