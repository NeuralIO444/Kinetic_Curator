// #1099 — the PATTERN track's controls in BUILD, driven through the real UI.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => { window.__KC_EXPOSE_STORE = true; try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  await expect(page.locator('.build-layer-stack')).toBeVisible();
}
const state = (page) => page.evaluate(() => {
  const s = window.__kcStore.getState();
  return { active: s.activeLayerId, layers: s.layers.map((l) => ({ id: l.id, type: l.type, pattern: l.pattern })) };
});
const patternOf = async (page) => (await state(page)).layers.find((l) => l.type === 'pattern')?.pattern;

test('+ pattern adds a PT-1 track, opens its editor, and leaves the KC track active', async ({ page }) => {
  await boot(page);
  const before = await state(page);
  await page.getByRole('button', { name: '+ pattern' }).click();
  const row = page.locator('.layer-row-pattern');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.layer-name')).toHaveText(/PT-1/i);
  await expect(page.locator('.pattern-editor')).toBeVisible();
  const after = await state(page);
  expect(after.active, 'a pattern track never takes the active slot').toBe(before.active);
  expect(after.layers.length).toBe(before.layers.length + 1);
  // no PATCH row on a pattern track
  await expect(row.locator('.patch-diag, select').filter({ hasText: /FEED|MOD|FIELD/ })).toHaveCount(0);
});

test('mode tiles, density, mix, drift and SHUFFLE write through to the track', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '+ pattern' }).click();
  const ed = page.locator('.pattern-editor');
  expect((await patternOf(page)).mode).toBe('QUILT');
  await ed.getByRole('tab', { name: /glyph/i }).click();
  await expect.poll(async () => (await patternOf(page)).mode).toBe('GLYPH');
  expect((await patternOf(page)).density, 'an untouched density follows the mode').toBe(4);
  await ed.getByRole('tab', { name: /quilt/i }).click();
  await ed.getByRole('slider', { name: 'Pattern density' }).fill('10');
  await expect.poll(async () => (await patternOf(page)).density).toBe(10);
  await ed.getByRole('slider', { name: 'Pattern drift' }).fill('40');
  await expect.poll(async () => (await patternOf(page)).drift).toBeCloseTo(0.4, 2);
  await ed.getByRole('slider', { name: 'Pattern mix' }).fill('20');
  await expect.poll(async () => (await patternOf(page)).mix).toBeCloseTo(0.2, 2);
  const seed0 = (await patternOf(page)).seed;
  await expect(ed.locator('.pattern-seed')).toContainText(`seed ${seed0.toString(16)}`);
  await ed.getByRole('button', { name: /shuffle/i }).click();
  await expect.poll(async () => (await patternOf(page)).seed).not.toBe(seed0);
  const seed1 = (await patternOf(page)).seed;
  await expect(ed.locator('.pattern-seed')).toContainText(`seed ${seed1.toString(16)}`);
});

test('honest UI: grout and hero are disabled outside QUILT, with the reason, and a disabled slider cannot move the value', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '+ pattern' }).click();
  const ed = page.locator('.pattern-editor');
  await expect(ed.getByRole('slider', { name: 'Pattern grout' })).toBeEnabled();
  await ed.getByRole('tab', { name: /field/i }).click();
  for (const name of ['Pattern grout', 'Pattern hero']) {
    const s = ed.getByRole('slider', { name });
    await expect(s).toBeDisabled();
    await expect(s).toHaveAttribute('title', /Quilt only — only QUILT has/); // the reason rides the slider itself
  }
  await expect(ed.locator('.fx-param').filter({ hasText: 'grout' }).locator('.fx-param-readout')).toHaveText('—');
  const g = (await patternOf(page)).grout;
  await ed.getByRole('slider', { name: 'Pattern grout' }).evaluate((el) => el.dispatchEvent(new Event('input', { bubbles: true })));
  expect((await patternOf(page)).grout).toBe(g);
  await ed.getByRole('tab', { name: /quilt/i }).click();
  await expect(ed.getByRole('slider', { name: 'Pattern hero' })).toBeEnabled();
});

test('44px rows, tabs, buttons and sliders; removing the track closes the editor and keeps the KC track', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '+ pattern' }).click();
  const ed = page.locator('.pattern-editor');
  const heights = await ed.locator('.chip-btn, .big-btn, input[type=range]').evaluateAll((els) => els.map((e) => ({ t: e.className || e.type, h: Math.round(e.getBoundingClientRect().height) })));
  expect(heights.length).toBeGreaterThanOrEqual(9);
  for (const h of heights) expect(h.h, `${h.t} is a 44px target`).toBeGreaterThanOrEqual(43);
  const kcCount = (await state(page)).layers.filter((l) => l.type !== 'pattern' && l.type !== 'fx' && l.type !== 'math').length;
  await page.locator('.layer-row-pattern').getByTitle('Remove track (undoable)').click();
  await expect(page.locator('.layer-row-pattern')).toHaveCount(0);
  await expect(page.locator('.pattern-editor')).toHaveCount(0);
  expect((await state(page)).layers.filter((l) => l.type !== 'pattern' && l.type !== 'fx' && l.type !== 'math').length).toBe(kcCount);
});

test('the last KC track cannot be removed even with a pattern track present, and the cap counts the pattern track', async ({ page }) => {
  await boot(page);
  const s0 = await state(page);
  const kc = s0.layers.filter((l) => l.type !== 'fx' && l.type !== 'math');
  if (kc.length === 1) {
    await page.getByRole('button', { name: '+ pattern' }).click();
    const kcRow = page.locator('.layer-row-kc:not(.layer-row-pattern)').first();
    await expect(kcRow.getByTitle('Remove track (undoable)')).toBeDisabled();
  }
  for (let i = 0; i < 4; i++) { const b = page.getByRole('button', { name: '+ pattern' }); if (await b.isEnabled()) await b.click(); }
  await expect(page.getByRole('button', { name: '+ pattern' })).toBeDisabled();
  expect((await state(page)).layers.filter((l) => l.type !== 'fx' && l.type !== 'math').length).toBe(4);
});

test('DROP: the toggle writes through, an armed SHUFFLE shows it and lands later; with DROP off it lands at once', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '+ pattern' }).click();
  const ed = page.locator('.pattern-editor');
  const drop = ed.getByRole('button', { name: /^drop$/i });
  const shuffle = ed.getByRole('button', { name: /^shuffle$/i });
  await expect(drop).toHaveAttribute('aria-pressed', 'false');
  const s0 = (await patternOf(page)).seed;
  await shuffle.click();
  await expect.poll(async () => (await patternOf(page)).seed, { message: 'DROP off: immediate' }).not.toBe(s0);
  await expect(shuffle).not.toHaveAttribute('data-armed', 'true');

  await drop.click();
  await expect(drop).toHaveAttribute('aria-pressed', 'true');
  expect((await patternOf(page)).drop).toBe(true);
  await expect(drop).toHaveAttribute('title', /next bar.*never affected/s);
  const s1 = (await patternOf(page)).seed;
  await shuffle.click();
  // armed: amber outline, the seed has not moved yet, then it lands on its own at the next bar (2 s at 120 BPM)
  await expect(shuffle).toHaveAttribute('data-armed', 'true');
  expect((await patternOf(page)).seed).toBe(s1);
  // It lands on LOOP time, so a frozen loop holds it by design (the gate is proven in motion.selfcheck). On a slow
  // CI runner the watchdog freezes the loop (PERF PAUSED): then there is no bar to land on, and that is not a bug.
  const outcome = async () => ((await patternOf(page)).seed !== s1 ? 'landed' : (await page.locator('.status-pill', { hasText: /PERF PAUSED/i }).count()) ? 'frozen' : 'waiting');
  await expect.poll(outcome, { timeout: 6000, message: 'lands on the bar' }).not.toBe('waiting');
  if (await outcome() === 'frozen') {
    test.info().annotations.push({ type: 'note', description: 'loop frozen by the watchdog (slow runner): the held shuffle was not expected to land' });
    return;
  }
  await expect(shuffle).not.toHaveAttribute('data-armed', 'true');
});
