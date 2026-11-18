// #2340 — creature PAINT P3: a creature's material is drawn over its art, in the room's tokens. KIN deals creatures
// of different materials; a patterned one draws its hatch / stipple, an unpainted one does not; a banked painted
// creature's pool tile survives a reload (the overlay door keeps it). Set PAINT_SHOTS=<dir> to save screenshots.
/* global process: readonly */
import { test, expect } from '@playwright/test';

const shot = async (page, name) => {
  if (process.env.PAINT_SHOTS) await page.screenshot({ path: `${process.env.PAINT_SHOTS}/${name}.png` });
};
const PAINT = 'clip-path="url(#kcm-';

async function boot(page, size) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize(size);
  await page.addInitScript(() => {
    window.__KC_EXPOSE_STORE = true;
    try {
      if (!sessionStorage.getItem('kc:e2e-booted')) localStorage.clear();
      sessionStorage.setItem('kc:e2e-booted', '1');
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.setItem(
        'kc.wetLabLadder.v1',
        JSON.stringify({ v: 1, kept: {}, open: { shape: true, construct: true, creature: true, rig: true } }),
      );
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /assets/i }).click();
  await expect(page.locator('.panel-pool')).toBeVisible();
  return errors;
}

async function openLab(page) {
  await page.locator('.cat-chip', { hasText: /^USER/ }).click();
  await page.getByTestId('open-wetlab-empty').click();
  await expect(page.getByTestId('wet-lab')).toBeVisible();
  await page.getByTestId('rung-creature').click();
}

/** Press KIN until the hand holds both a painted and an unpainted creature (bounded). */
async function dealMixed(page) {
  for (let i = 0; i < 8; i++) {
    await page.getByTestId('kin-press').click();
    await expect(page.getByTestId('kin-tile')).toHaveCount(6);
    const html = await page.getByTestId('kin-tile').evaluateAll((els) => els.map((e) => e.innerHTML));
    const painted = html.findIndex((h) => h.includes('clip-path="url(#kcm-'));
    const plain = html.findIndex((h) => !h.includes('clip-path="url(#kcm-'));
    if (painted >= 0 && plain >= 0) return { painted, plain, html };
  }
  return null;
}

for (const size of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`at ${size.width}: KIN deals painted and unpainted creatures; the paint is drawn in the room tokens and survives a reload`, async ({
    page,
  }) => {
    const errors = await boot(page, size);
    await openLab(page);
    const hand = await dealMixed(page);
    expect(hand, 'a hand with one painted and one unpainted creature').not.toBeNull();
    const paintedHtml = hand.html[hand.painted];
    expect(paintedHtml).toContain(PAINT);
    expect(paintedHtml).toMatch(/stroke="var\(--accent\)"/); // a patterned material tones accent
    expect(paintedHtml).not.toMatch(/<pattern|<mask/);
    expect(hand.html[hand.plain]).not.toContain(PAINT); // different materials draw differently
    await shot(page, `paint-hand-${size.width}`);

    // bank the painted one: its record carries the material and its pool tile is painted
    await page.getByTestId('kin-tile').nth(hand.painted).click();
    const tileOf = () =>
      page.evaluate(() => {
        const s = window.__kcStore.getState();
        return s.creatureRecords.map((r) => {
          const tile = (s.customAssets || []).find((a) => a && a.id === `user:${r.id}`);
          return { id: r.id, svg: tile ? tile.svg : null };
        });
      });
    const before = (await tileOf()).filter((t) => t.svg && t.svg.includes(PAINT));
    expect(before.length).toBeGreaterThan(0);
    await expect(page.getByTestId('bank-tile').locator(`svg path[clip-path^="url(#kcm-"]`).first()).toBeAttached();
    await shot(page, `paint-banked-${size.width}`);
    if (process.env.PAINT_SHOTS)
      await page
        .locator('[data-testid="wet-lab"] svg')
        .filter({ has: page.locator('path[clip-path^="url(#kcm-"]') })
        .first()
        .screenshot({ path: `${process.env.PAINT_SHOTS}/paint-close-${size.width}.png` });

    await page.reload();
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
    const after = await tileOf();
    for (const t of before) expect(after.find((a) => a.id === t.id)?.svg).toBe(t.svg); // the door kept it whole
    expect(errors).toEqual([]);
  });
}
