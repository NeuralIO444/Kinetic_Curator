// #1027 — one slider everywhere. In the running app, every slider has the house thumb:
// 14x18, square, a 44px hit area, and the thumb COLOR speaks the room — BUILD yellow,
// STIMULI cyan, everything else ink. No browser-blue thumb anywhere.
import { test, expect } from '@playwright/test';

const INK = '#e8e8e0';
const BUILD = '#ffd400';
const STIM = '#00d9ff';

// A native thumb is a shadow pseudo-element that getComputedStyle cannot read, so the
// contract is read where it lives: the thumb rule is `background: var(--range-thumb)`
// (and rangeRow.selfcheck pins the 14x18 size and that rule), and --range-thumb is set
// per tone on the input. Here we check what the RUNNING APP resolves it to, that it is
// a real house slider (.single-slider), and that its hit area is 44px.
async function thumbs(page, scope) {
  return page.locator(`${scope} input[type=range]`).evaluateAll((els) => els
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        label: el.getAttribute('aria-label') || el.closest('[title]')?.getAttribute('title')?.slice(0, 30) || el.className,
        color: cs.getPropertyValue('--range-thumb').trim().toLowerCase(),
        cls: el.className, house: el.classList.contains('single-slider') || !!el.closest('.dual-slider'), // DualRangeRow's two inputs are the house control too
        appearance: cs.appearance, hit: Math.round(r.height),
      };
    }));
}

const expectHouse = (list, color, where) => {
  expect(list.length, `${where}: has sliders`).toBeGreaterThan(0);
  for (const s of list) {
    expect(s.house, `${where}: "${s.label}" is the house slider, not a native one`).toBe(true);
    expect(s.color, `${where}: thumb color of "${s.label}"`).toBe(color);
    expect(s.appearance, `${where}: "${s.label}" is not drawn by the browser`).toBe('none');
    expect(s.hit, `${where}: 44px hit area of "${s.label}"`).toBeGreaterThanOrEqual(44);
  }
};

test('BUILD sliders are yellow, STIMULI cyan, PLAY ink; all with a 44px hit area', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

  // BUILD: the layer wet slider (plus an FX parameter slider once one exists)
  await page.getByRole('tab', { name: /build/i }).click();
  const stack = page.locator('.build-layer-stack');
  const fxPlus = stack.locator('.layer-section').filter({ has: page.getByRole('button', { name: 'Add FX track' }) }).locator('.layer-add-btn');
  await fxPlus.click(); await fxPlus.click(); await fxPlus.click();      // FX 3: the Blur / Focus family
  await stack.locator('.fx-editor .chip-btn').click();                   // + ADD SHARPEN (has two sliders)
  await expect(stack.locator('.fx-editor input[type=range]')).toHaveCount(2);
  const build = await thumbs(page, '.panel-layout');
  // Motion tiles (glyph + pose sliders, e.g. wing beat) are ink wherever they sit; the spec's table says so.
  expectHouse(build.filter((x) => !/motion-slider/.test(x.cls)), BUILD, 'BUILD (the whole panel: layout, appearance, layers)');
  expectHouse(build.filter((x) => /motion-slider/.test(x.cls)), INK, 'BUILD motion tiles');

  // STIMULI: the route-depth sliders, and GAIN once SETUP is open
  await page.getByRole('tab', { name: /stimuli/i }).click();
  await page.getByRole('button', { name: /setup/i }).click();
  const stimuli = await thumbs(page, '.panel-stimulus');
  // The LIFE motion tile lives here too; motion tiles are ink everywhere (the spec's table).
  expectHouse(stimuli.filter((x) => !/motion-slider/.test(x.cls)), STIM, 'STIMULI');
  expectHouse(stimuli.filter((x) => /motion-slider/.test(x.cls)), INK, 'STIMULI motion tile');

  // PLAY: the evolve interval, morph duration, phrase length, queue hold (the DAVIS controls)
  await page.getByRole('tab', { name: /play/i }).click();
  expectHouse(await thumbs(page, '.panel-davis'), INK, 'PLAY');
});
