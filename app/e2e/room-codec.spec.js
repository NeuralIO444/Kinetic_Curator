// #1560 S1 — THE ROOM as a codec: LOIS's face window, Davis's face window, the transcript between them.
// The faces and states are the honest feed's, as the duel's were (#1126); the transcript is the retained
// kc-voice/1 bus window (roomFeed) — records in arrival order, newest at the bottom, never an invented line.
// #1560 S2 — the faces are generative dither (curator/roomDither.js): Davis's rosette in colour Bayer dots,
// LOIS's construction in glyphs, at the resolution of each persona's engagement tier. The face tests below
// assert the same contract the sigil's did — still at rest, turning in a state, a new seed is a new face,
// still under reduced motion — against the dither canvas's data-motion and its pixels.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /directors/i }).click();
  await expect(page.locator('.room-codec')).toBeVisible();
}
const lois = (page) => page.locator('.codec-lois');
const davis = (page) => page.locator('.codec-davis');
const curator = (page) => page.locator('.kc-topbar-curator .randomize-btn');
const face = (page) => page.locator('.codec-davis .davis-dither').evaluate((cv) => cv.toDataURL());

test('the room opens quiet: LOIS is VIBE, Davis has no state and is not turning, the bus window is empty', async ({ page }) => {
  await boot(page);
  await expect(lois(page)).toHaveAttribute('data-code', 'VIBE');
  await expect(lois(page).locator('.codec-state')).toHaveText('VIBE');
  await expect(lois(page).locator('.codec-name')).toHaveText('lois');
  await expect(davis(page)).toHaveAttribute('data-code', 'none');
  await expect(davis(page).locator('.codec-state')).toHaveText('—');
  await expect(davis(page).locator('.codec-name')).toHaveText('davis');
  await expect(page.locator('.codec-davis .davis-dither')).toHaveAttribute('data-motion', 'still');
  await expect(page.locator('.codec-lois .lois-dither')).toBeVisible(); // her glyph face is already up, watching
  await expect(page.locator('.codec-ch')).toHaveText('CH kc-voice/1');
  await expect(page.locator('.codec-bus')).toHaveText('BUS 0'); // nothing has happened on the bus yet: silence (DS rule 4)
  await expect(page.locator('.codec-line')).toHaveCount(0);
  await expect(page.locator('.codec-footer')).not.toHaveAttribute('data-verdict', /.+/); // no Davis state, no room
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
  await expect(davis(page).locator('.codec-state')).toHaveText('FLOW');
  const sig = page.locator('.codec-davis .davis-dither');
  await expect(sig).toHaveAttribute('data-motion', 'turning');
  // FLOW's tempo is 14 s a turn (the sigil's table): the picture moves, but slowly — two samples a beat
  // apart differ, and the face never jumps to a different picture wholesale.
  const a = await face(page);
  await page.waitForTimeout(600);
  expect(await face(page)).not.toBe(a);
});

test('a new seed is a new face (the rosette is drawn from the scene seed)', async ({ page }) => {
  await boot(page);
  const a = await face(page);
  expect((await face(page))).toBe(a); // stable between redraws
  await page.getByRole('button', { name: /new seed/i }).click();
  await expect.poll(() => face(page)).not.toBe(a);
});

test('the codec is a readout only: nothing in it is a button', async ({ page }) => {
  await boot(page);
  expect(await page.locator('.room-codec button, .room-codec [role="button"], .room-codec a').count()).toBe(0);
});

test('with less motion he does not turn, and the label still says what he is doing', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await boot(page);
  const cur = curator(page);
  for (let i = 0; i < 3; i++) { await cur.click(); await page.waitForTimeout(150); }
  await expect(davis(page).locator('.codec-state')).toHaveText('FLOW');
  await expect(page.locator('.codec-davis .davis-dither')).toHaveAttribute('data-motion', 'still');
  const a = await face(page);
  await page.waitForTimeout(600);
  expect(await face(page)).toBe(a); // settled to a still dither: the same picture, held
  await ctx.close();
});

// Reachability (Matt's ruling, 2026-10-20, PR #1714): the Davis panel MAY scroll. The contract is: the body
// really is a scroller, and its last section — the room — can be scrolled fully into view, quiet or talking.
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

test('the room forms: the footer names it with the matrix’s words; the transcript stays the bus’s business', async ({ page }) => {
  await boot(page);
  for (let i = 0; i < 3; i++) { await curator(page).click(); await page.waitForTimeout(150); }
  await expect(davis(page)).toHaveAttribute('data-code', 'FLOW');
  const footer = page.locator('.codec-footer');
  await expect(footer).toHaveAttribute('data-verdict', 'THE ROOM');
  await expect(footer.locator('.codec-verdict')).toHaveText('THE ROOM');
  await expect(footer.locator('.codec-verdict-line')).toHaveText('working. They know each other\'s moves.');
  // No transcript line is asserted here: in this flow nothing ticks the Director and no backend speaks, so the
  // bus honestly carries nothing — the transcript's content law (records in order, the Queen never a line) is
  // proven at the bus level by curator/roomFeed.selfcheck.mjs, unit and live-wiring sections.
  await expect(page.locator('.codec-bus')).toHaveText('BUS 0');
  await page.keyboard.press('f'); // LOIS nods: the critic points, the generator rolls
  await expect(footer).toHaveAttribute('data-verdict', 'THE CLASH');
  expect(await page.locator('.room-codec button, .room-codec [role="button"]').count()).toBe(0); // still only a readout
});

test('with the room talking the panel still scrolls and the codec stays reachable', async ({ page }) => {
  for (const [w, h] of [[1280, 720], [1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    for (let i = 0; i < 3; i++) { await curator(page).click(); await page.waitForTimeout(120); }
    await page.keyboard.press('f');
    await expect(page.locator('.codec-footer')).toHaveAttribute('data-verdict', /.+/);
    const reach = await lastSectionReachable(page);
    expect(reach.ok, `${w}x${h}: ${reach.why}`).toBe(true);
  }
});
