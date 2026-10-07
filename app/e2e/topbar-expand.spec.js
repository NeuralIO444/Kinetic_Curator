// #1103 — the top bar's expanding buttons: KIN, LOOKS, VOICE open to the full word on hover,
// keyboard focus and touch; LOOKS and VOICE cool down to LOK / VOI after use; nothing around
// them moves by a pixel.
import { test, expect } from '@playwright/test';

// `settle` waits out the cold open (the verbs show their full names for ~2 s), so rest-state tests measure rest.
async function boot(page, { settle = true } = {}) {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  if (settle) await expect(page.locator('.kc-topbar-curator .kinetic-btn')).not.toHaveAttribute('data-open', 'true', { timeout: 6000 });
}
const group = (page) => page.locator('.kc-topbar-curator');
const btn = (page, name) => group(page).getByRole('button', { name });
const width = async (loc) => Math.round((await loc.boundingBox()).width);
// What the eye reads: the short layer at rest, the full layer once it has faded in.
const text = (loc) => loc.evaluate((e) => {
  const full = e.querySelector('.xl-swap-full'); const short = e.querySelector('.xl-swap-short');
  const shown = parseFloat(getComputedStyle(full).opacity) > 0.5 ? full : short;
  return shown.textContent.replace(/\s+/g, ' ').trim();
});

test('LOOKS and VOICE rest as L and V, open to the full word on hover, then cool down to LOK and VOI', async ({ page }) => {
  await boot(page);
  const looks = btn(page, /^Looks/); const voice = btn(page, /^Voice/);
  expect(await text(looks)).toBe('l'); expect(await text(voice)).toBe('v');
  const rest = { l: await width(looks), v: await width(voice) };

  await looks.hover();
  await expect.poll(async () => width(looks), { timeout: 2000 }).toBeGreaterThan(rest.l + 20);
  await expect.poll(() => text(looks)).toBe('looks ▾');
  await voice.hover();
  await expect.poll(async () => width(voice)).toBeGreaterThan(rest.v + 40);
  await expect.poll(() => text(voice)).toMatch(/^voice: /);

  await page.mouse.move(600, 600); // away
  await expect.poll(() => text(looks), { timeout: 2000 }).toBe('lok');
  await expect.poll(() => text(voice), { timeout: 2000 }).toBe('voi');
  expect(await width(looks), 'LOK is between L and LOOKS').toBeGreaterThan(rest.l);
  expect(await looks.locator('.xl-swap-short').evaluate((e) => getComputedStyle(e).textTransform), 'casing is CSS (.act)').toBe('uppercase');
});

test('keyboard focus opens them; the accessible name is the full word at every size', async ({ page }) => {
  await boot(page);
  const looks = btn(page, /^Looks/);
  await expect(looks).toHaveAttribute('aria-label', 'Looks — pick a complete layout');
  const before = await width(looks);
  await looks.focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); // keyboard modality => :focus-visible
  await expect.poll(async () => width(looks)).toBeGreaterThan(before + 20);
});

test('a touch opens KIN, LOOKS and VOICE, and they close by themselves', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await boot(page);
  const kin = group(page).locator('.kinetic-btn');
  // the cold open is still cooling on a slow runner: wait for the resting width (the 48 px floor), or w0 is sampled mid-glide
  await expect.poll(async () => width(kin), { timeout: 8000 }).toBeLessThanOrEqual(49);
  const w0 = await width(kin);
  await kin.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true });
  await expect(kin).toHaveAttribute('data-open', 'true');
  await expect.poll(async () => width(kin)).toBeGreaterThan(w0 + 15);
  await expect(kin).not.toHaveAttribute('data-open', 'true', { timeout: 4000 });
  await ctx.close();
});

test('opening and closing them never moves the rest of the bar', async ({ page }) => {
  await boot(page);
  const anchors = page.locator('.palette-chip-track, .palette-controls');
  const before = await anchors.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  for (const name of [/^Looks/, /^Voice/]) { await btn(page, name).hover(); await page.waitForTimeout(350); }
  const during = await anchors.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  await page.mouse.move(600, 600); await page.waitForTimeout(450);
  const after = await anchors.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(during, 'the palette chips and controls stay put while the left group breathes').toEqual(before);
  expect(after).toEqual(before);
});

test('KIN still builds and sheds heat: rapid taps widen it, and it cools back', async ({ page }) => {
  await boot(page);
  const kin = group(page).locator('.kinetic-btn');
  const w0 = await width(kin);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('k'); await page.waitForTimeout(120); } // the K key: click() waits for the opening label to settle, and the taps would drift apart
  await expect.poll(async () => width(kin)).toBeGreaterThan(w0 + 40);
  await page.mouse.move(600, 600);
  await expect.poll(async () => width(kin), { timeout: 15_000 }).toBeLessThanOrEqual(w0 + 2);
});

test('cold open: KINETIC and CURATOR show their full names, then cool down to KIN and CUR; L and V stay L and V', async ({ page }) => {
  await boot(page, { settle: false });
  const kin = group(page).locator('.kinetic-btn');
  const cur = group(page).locator('.randomize-btn');
  await expect(kin).toHaveAttribute('data-open', 'true');
  await expect(cur).toHaveAttribute('data-open', 'true');
  const opened = { kin: await width(kin), cur: await width(cur) };
  expect(await text(btn(page, /^Looks/)), 'L is not part of the cold open').toBe('l');
  expect(await text(btn(page, /^Voice/))).toBe('v');
  await expect(kin).not.toHaveAttribute('data-open', 'true', { timeout: 6000 });
  await expect(cur).not.toHaveAttribute('data-open', 'true');
  await expect.poll(async () => width(kin), { timeout: 3000 }).toBeLessThan(opened.kin - 8);
  await expect.poll(async () => width(cur), { timeout: 3000 }).toBeLessThan(opened.cur - 8);
});

test('reduced motion: no cold open at all', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await boot(page, { settle: false });
  await page.waitForTimeout(400);
  await expect(group(page).locator('.kinetic-btn')).not.toHaveAttribute('data-open', 'true');
  await expect(group(page).locator('.randomize-btn')).not.toHaveAttribute('data-open', 'true');
  await ctx.close();
});

test('the row reads START, KIN, L, V, CUR, B left to right; CURATOR is in capitals; BEAT is [•B] and opens to BEAT · 120', async ({ page }) => {
  await boot(page);
  const parts = await group(page).locator('.start-mode-btn, .kinetic-btn, .curator-voice-btn, .randomize-btn, .beat-btn').evaluateAll((els) => els.map((e) => ({ cls: e.className.split(' ')[0], x: Math.round(e.getBoundingClientRect().left) })));
  expect(parts.map((p) => p.cls)).toEqual(['start-mode-btn', 'kinetic-btn', 'curator-voice-btn', 'curator-voice-btn', 'randomize-btn', 'beat-btn']);
  expect(parts.map((p) => p.x)).toEqual([...parts.map((p) => p.x)].sort((a, b) => a - b));
  const cur = group(page).locator('.randomize-btn');
  expect(await cur.evaluate((e) => getComputedStyle(e.querySelector('.xl-head')).textTransform), 'CURATOR is in capitals').toBe('uppercase');
  await expect(cur).toHaveAttribute('aria-label', /^Curator/);
  await expect(page.locator('.palette-strip .palette-mix .beat-btn'), 'BEAT left the palette strip').toHaveCount(0);
  const beat = group(page).locator('.beat-btn');
  await expect(beat.locator('.beat-dot')).toBeVisible();
  const rest = await width(beat);
  await beat.hover();
  await expect.poll(async () => width(beat)).toBeGreaterThan(rest + 30);
  await expect(beat).toContainText(/beat · 120/i);
  await page.mouse.move(600, 600);
  await expect.poll(async () => width(beat)).toBeLessThanOrEqual(rest + 1);
  // the click still opens the tempo menu
  await beat.click();
  await expect(page.locator('.beat-menu')).toBeVisible();
});

test('a K press flashes KINETIC in full and cools it down, with the pointer nowhere near', async ({ page }) => {
  await boot(page);
  await page.mouse.move(600, 600);
  const kin = group(page).locator('.kinetic-btn');
  const rest = await width(kin);
  await page.keyboard.press('k');
  await expect(kin).toHaveAttribute('data-open', 'true');
  await expect.poll(async () => width(kin)).toBeGreaterThan(rest + 12);
  await expect(kin).not.toHaveAttribute('data-open', 'true', { timeout: 3000 });   // ~1.2 s, then it cools
  await expect.poll(async () => width(kin), { timeout: 6000 }).toBeLessThanOrEqual(rest + 2);
});

test('a CURATOR roll flashes CURATOR in full and cools it down, even when the pointer has left', async ({ page }) => {
  await boot(page);
  const cur = group(page).locator('.randomize-btn');
  const rest = await width(cur);
  await cur.click();
  await page.mouse.move(600, 600);
  await expect(cur).toHaveAttribute('data-open', 'true');
  await expect.poll(async () => width(cur)).toBeGreaterThan(rest + 20);
  await expect(cur).not.toHaveAttribute('data-open', 'true', { timeout: 3000 });
  await expect.poll(async () => width(cur), { timeout: 3000 }).toBeLessThanOrEqual(rest + 2);
});

// ── the polish: shimmer, letters that let go one at a time, a glide instead of steps ──
test('the sheen: KINETIC and CURATOR shimmer at rest, go quiet in use, and come back never-pressed-style only after idle', async ({ page }) => {
  await boot(page);
  await page.mouse.move(600, 600);
  const kin = group(page).locator('.kinetic-btn'); const cur = group(page).locator('.randomize-btn');
  const anim = (loc) => loc.evaluate((e) => getComputedStyle(e, '::after').animationName);
  await expect(kin).toHaveClass(/xl-shimmer/); await expect(cur).toHaveClass(/xl-shimmer/);
  expect(await anim(kin)).toBe('stim-shimmer'); expect(await anim(cur)).toBe('stim-shimmer');
  for (const name of [/^Looks/, /^Voice/]) await expect(btn(page, name)).not.toHaveClass(/xl-shimmer/);
  await expect(group(page).locator('.beat-btn')).not.toHaveClass(/xl-shimmer/);
  await kin.hover();
  expect(await anim(kin), 'quiet while the pointer is on it').toBe('none');
  await page.mouse.move(600, 600);
  await page.keyboard.press('k');                       // a press: the invitation is accepted
  await expect(kin).not.toHaveClass(/xl-shimmer/);
  await expect(cur).toHaveClass(/xl-shimmer/);          // CURATOR has not been pressed yet
  await cur.click();
  await expect(cur).not.toHaveClass(/xl-shimmer/);
});

test('no sheen with reduced motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await boot(page, { settle: false });
  const disp = await group(page).locator('.kinetic-btn').evaluate((e) => getComputedStyle(e, '::after').display);
  expect(disp).toBe('none');
  await ctx.close();
});

test('cooling is letter by letter, last letter first, and the width glides rather than stepping', async ({ page }) => {
  await boot(page);
  const kin = group(page).locator('.kinetic-btn');
  await kin.hover();
  await expect.poll(() => kin.locator('.xl-ch').evaluateAll((els) => els.filter((e) => parseFloat(getComputedStyle(e).opacity) > 0.95).length)).toBe(4);
  // leave and sample the letters every 25 ms
  await page.mouse.move(600, 600);
  const samples = await page.evaluate(async () => {
    const letters = [...document.querySelectorAll('.kc-topbar-curator .kinetic-btn .xl-ch')];
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 900) {
      out.push(letters.map((l) => parseFloat(getComputedStyle(l).opacity)));
      await new Promise((r) => setTimeout(r, 25));
    }
    return out;
  });
  const visible = samples.map((row) => row.filter((o) => o > 0.5).length);
  expect(visible[visible.length - 1], 'all four are gone at the end').toBe(0);
  expect(new Set(visible).size, 'it passes through 3, 2, 1: not all at once').toBeGreaterThanOrEqual(3);
  // the last letter goes before the first: the first column is the last to fade
  const firstGone = samples.findIndex((row) => row[0] < 0.5); const lastGone = samples.findIndex((row) => row[3] < 0.5);
  expect(lastGone, 'the last letter lets go first').toBeLessThan(firstGone);
  for (let i = 1; i < visible.length; i++) expect(visible[i], 'letters never come back while cooling').toBeLessThanOrEqual(visible[i - 1]);
});

test('KIN cools by gliding: its width passes through many in-between values, never jumping', async ({ page }) => {
  await boot(page);
  const kin = group(page).locator('.kinetic-btn');
  const rest = await width(kin);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('k'); await page.waitForTimeout(110); } // the K key: click() waits for the opening label to settle, and the taps would drift apart
  await expect.poll(async () => width(kin)).toBeGreaterThan(rest + 40);
  await page.mouse.move(600, 600);
  const widths = await page.evaluate(async () => {
    const el = document.querySelector('.kc-topbar-curator .kinetic-btn'); const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 8000) { out.push(el.getBoundingClientRect().width); await new Promise((r) => setTimeout(r, 40)); }
    return out;
  });
  const distinct = new Set(widths.map((w) => Math.round(w))).size;
  expect(distinct, 'a glide passes through many widths').toBeGreaterThan(12);
  let maxStep = 0; for (let i = 1; i < widths.length; i++) maxStep = Math.max(maxStep, Math.abs(widths[i] - widths[i - 1]));
  expect(maxStep, `the biggest jump between 40 ms samples was ${maxStep.toFixed(1)}px`).toBeLessThan(14);
});
