// #1126 — the two Directors as a readout: LOIS's fixed face, Davis's seed-drawn kaleidoscope, each from the honest feed.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /directors/i }).click();
  await expect(page.locator('.directors-duel')).toBeVisible();
}
const lois = (page) => page.locator('.duel-lois');
const davis = (page) => page.locator('.duel-davis');
const curator = (page) => page.locator('.kc-topbar-curator .randomize-btn');
const face = (page) => page.locator('.davis-sigil').evaluate((cv) => cv.toDataURL());

test('the room opens quiet: LOIS is VIBE, Davis has no state and is not turning', async ({ page }) => {
  await boot(page);
  await expect(lois(page)).toHaveAttribute('data-code', 'VIBE');
  await expect(davis(page)).toHaveAttribute('data-code', 'none');
  await expect(davis(page).locator('.duel-state')).toHaveText('—');
  await expect(page.locator('.davis-sigil')).not.toHaveClass(/turning/);
});

test('a keep makes LOIS nod and he holds it until the next roll', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('f');
  await expect(lois(page)).toHaveAttribute('data-code', 'NOD');
  await page.waitForTimeout(1500);
  await expect(lois(page)).toHaveAttribute('data-code', 'NOD'); // not a flash
  await curator(page).click();
  await expect(lois(page)).toHaveAttribute('data-code', 'VIBE');
});

test('rolling at a clip puts Davis in FLOW, and the face turns at that tempo', async ({ page }) => {
  await boot(page);
  for (let i = 0; i < 3; i++) { await curator(page).click(); await page.waitForTimeout(150); }
  await expect(davis(page)).toHaveAttribute('data-code', 'FLOW');
  const sig = page.locator('.davis-sigil');
  await expect(sig).toHaveClass(/turning/);
  expect(await sig.evaluate((cv) => cv.style.animationDuration)).toBe('14s');
  expect(await sig.evaluate((cv) => getComputedStyle(cv).animationName)).toBe('davis-sigil-turn');
});

test('a new seed is a new face (the mandala is drawn from the scene seed)', async ({ page }) => {
  await boot(page);
  const a = await face(page);
  expect((await face(page))).toBe(a); // stable between redraws
  await page.getByRole('button', { name: /new seed/i }).click();
  await expect.poll(() => face(page)).not.toBe(a);
});

test('the duel is a readout only: nothing in it is a button', async ({ page }) => {
  await boot(page);
  expect(await page.locator('.directors-duel button, .directors-duel [role="button"], .directors-duel a').count()).toBe(0);
});

test('with less motion he does not turn, and the label still says what he is doing', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await boot(page);
  const cur = curator(page);
  for (let i = 0; i < 3; i++) { await cur.click(); await page.waitForTimeout(150); }
  await expect(davis(page).locator('.duel-state')).toHaveText('FLOW');
  expect(await page.locator('.davis-sigil').evaluate((cv) => getComputedStyle(cv).animationName)).toBe('none');
  await ctx.close();
});

// Reachability (Matt's ruling, 2026-10-20, PR #1714): the Davis panel MAY scroll.
// #1576's surge + parallax sliders took the body past its box at short window heights
// (540 in 484 at 1280x720); rather than crush the panel or move the ruled controls,
// the body scrolls — it has been overflow-y:auto all along — and the contract becomes:
// the body really is a scroller, and its last section can be scrolled fully into view.
// (Supersedes the no-scroll fit premise of #1604/#1713 for this panel; those margin
// repairs stay in the CSS — they bought real headroom at taller windows.)
async function lastSectionReachable(page) {
  return page.locator('.davis-body').evaluate((el) => {
    if (getComputedStyle(el).overflowY !== 'auto') return { ok: false, why: 'the body is not a scroller' };
    el.scrollTop = el.scrollHeight;
    const last = el.lastElementChild;
    if (!last) return { ok: false, why: 'the body is empty' };
    const bodyBox = el.getBoundingClientRect();
    const box = last.getBoundingClientRect();
    return { ok: box.bottom <= bodyBox.bottom + 1 && box.top >= bodyBox.top - 1, why: `the last section stops ${Math.round(box.bottom - bodyBox.bottom)}px past the fold` };
  });
}

test('the panel scrolls: the room closes it and stays reachable at common window heights', async ({ page }) => {
  for (const [w, h] of [[1280, 720], [1366, 768], [1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    await expect(page.locator('.panel-davis .davis-section-label').last()).toHaveText('the room');
    const reach = await lastSectionReachable(page);
    expect(reach.ok, `${w}x${h}: ${reach.why}`).toBe(true);
  }
});

test('the room: both in a state, each says the matrix line and the strip names the room; with no Davis state, silence', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.duel-verdict')).toHaveCount(0); // no Davis state, no room
  for (let i = 0; i < 3; i++) { await curator(page).click(); await page.waitForTimeout(150); }
  await expect(davis(page)).toHaveAttribute('data-code', 'FLOW');
  const strip = page.locator('.duel-verdict');
  await expect(strip).toHaveAttribute('data-verdict', 'THE ROOM');
  await expect(strip.locator('.duel-verdict-name')).toHaveText('THE ROOM');
  await expect(strip.locator('.duel-verdict-line')).toHaveText('working. They know each other\'s moves.');
  await expect(lois(page).locator('.duel-desc')).toHaveText('Quiet. He\'s rolling, I\'m watching. This is how it works.'); // room 6, verbatim
  await expect(davis(page).locator('.duel-desc')).toHaveText('Quiet room, good rolls. This is the job.');
  await page.keyboard.press('f'); // LOIS nods: the critic points, the generator rolls
  await expect(strip).toHaveAttribute('data-verdict', 'THE CLASH');
  await expect(lois(page).locator('.duel-desc')).toHaveText('That\'s the one. Tell the gardener to put the hose down.'); // room 1
  expect(await page.locator('.directors-duel button, .directors-duel [role="button"]').count()).toBe(0); // still only a readout
});

test('with the room talking the panel still scrolls and the duel stays reachable', async ({ page }) => {
  for (const [w, h] of [[1280, 720], [1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    for (let i = 0; i < 3; i++) { await curator(page).click(); await page.waitForTimeout(120); }
    await page.keyboard.press('f');
    await expect(page.locator('.duel-verdict')).toBeVisible();
    const reach = await lastSectionReachable(page);
    expect(reach.ok, `${w}x${h}: ${reach.why}`).toBe(true);
  }
});
