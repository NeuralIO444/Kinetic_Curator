// #1099 — the PATTERN track's controls in BUILD, driven through the real UI.
import { test, expect } from '@playwright/test';
import { addStratum } from './strata-add.mjs';

// #1203 — PATTERN tracks arm through the ADD STRATUM slot: long-press →
// type chooser → PATTERN (always QUILT ground).
const addPattern = (page) => addStratum(page, 'PATTERN');

async function boot(page) {
  await page.addInitScript(() => {
    window.__KC_EXPOSE_STORE = true;
    try {
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  await expect(page.locator('.build-layer-stack')).toBeVisible();
}
const state = (page) =>
  page.evaluate(() => {
    const s = window.__kcStore.getState();
    return { active: s.activeLayerId, layers: s.layers.map((l) => ({ id: l.id, type: l.type, pattern: l.pattern })) };
  });
const patternOf = async (page) => (await state(page)).layers.find((l) => l.type === 'pattern')?.pattern;

// #1608 — the pattern params are mode rows: an exact value is set the
// panel's one way (D2) — tap the row's readout to open the value dock,
// then drive the dock's slider (percent space, as the bare sliders were).
// Escape first: the open dock overlays the panel's right edge, where the
// next row's readout sits.
const setExact = async (page, name, value) => {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name }).click();
  await page.locator('.te-dock.open input[type=range]').fill(value);
};

test('+ pattern adds a PT-1 track, opens its editor, and leaves the KC track active', async ({ page }) => {
  await boot(page);
  const before = await state(page);
  await addPattern(page);
  const row = page.locator('.strata-block.strata-pattern');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.strata-name')).toHaveText(/PT-1/i);
  await expect(page.locator('.pattern-editor')).toBeVisible();
  const after = await state(page);
  expect(after.active, 'a pattern track never takes the active slot').toBe(before.active);
  expect(after.layers.length).toBe(before.layers.length + 1);
  // no PATCH row on a pattern track
  await expect(row.locator('.patch-diag, select').filter({ hasText: /FEED|MOD|FIELD/ })).toHaveCount(0);
});

test('mode tiles, density, mix, drift and SHUFFLE write through to the track', async ({ page }) => {
  await boot(page);
  await addPattern(page);
  const ed = page.locator('.pattern-editor');
  expect((await patternOf(page)).mode).toBe('QUILT');
  await ed.getByRole('tab', { name: /glyph/i }).click();
  await expect.poll(async () => (await patternOf(page)).mode).toBe('GLYPH');
  expect((await patternOf(page)).density, 'an untouched density follows the mode').toBe(4);
  await ed.getByRole('tab', { name: /quilt/i }).click();
  await setExact(page, 'Pattern density', '10');
  await expect.poll(async () => (await patternOf(page)).density).toBe(10);
  await setExact(page, 'Pattern drift', '40');
  await expect.poll(async () => (await patternOf(page)).drift).toBeCloseTo(0.4, 2);
  await setExact(page, 'Pattern mix', '20');
  await expect.poll(async () => (await patternOf(page)).mix).toBeCloseTo(0.2, 2);
  const seed0 = (await patternOf(page)).seed;
  await expect(ed.locator('.pattern-seed')).toContainText(`seed ${seed0.toString(16)}`);
  await ed.getByRole('button', { name: /shuffle/i }).click();
  await expect.poll(async () => (await patternOf(page)).seed).not.toBe(seed0);
  const seed1 = (await patternOf(page)).seed;
  await expect(ed.locator('.pattern-seed')).toContainText(`seed ${seed1.toString(16)}`);
});

test('honest UI: grout and hero are disabled outside QUILT, with the reason, and a disabled row cannot move the value', async ({
  page,
}) => {
  await boot(page);
  await addPattern(page);
  const ed = page.locator('.pattern-editor');
  // #1608 — the row's readout button carries the name, the disabled state
  // and the reason now (the slider lives in the value dock).
  await expect(ed.getByRole('button', { name: 'Pattern grout' })).toBeEnabled();
  await ed.getByRole('tab', { name: /field/i }).click();
  for (const name of ['Pattern grout', 'Pattern hero']) {
    const s = ed.getByRole('button', { name });
    await expect(s).toBeDisabled();
    await expect(s).toHaveAttribute('title', /Quilt only — only QUILT has/); // the reason rides the row itself
  }
  await expect(ed.locator('.fx-param').filter({ hasText: 'grout' }).locator('.te-block-readout')).toHaveText('—');
  const g = (await patternOf(page)).grout;
  // Force a mode tap through the DOM: the disabled row's guard refuses it.
  await ed
    .locator('.fx-param')
    .filter({ hasText: 'grout' })
    .locator('.te-cell')
    .nth(3)
    .evaluate((el) => el.click());
  expect((await patternOf(page)).grout).toBe(g);
  await ed.getByRole('tab', { name: /quilt/i }).click();
  await expect(ed.getByRole('button', { name: 'Pattern hero' })).toBeEnabled();
});

test('target sizes hold (buttons 44px, detent cells at the mode-row size); removing the track closes the editor and keeps the KC track', async ({
  page,
}) => {
  await boot(page);
  await addPattern(page);
  const ed = page.locator('.pattern-editor');
  // #1608 — the editor's continuous controls are detent rows: the buttons
  // keep the 44px law, the mode cells + readouts keep the detent form's
  // shipped 30px (DS §2 detent amendment; the 44px law is RangeRow's).
  const heights = await ed
    .locator('.chip-btn, .big-btn, .te-cell, .te-block-readout')
    .evaluateAll((els) =>
      els.map((e) => ({ t: e.className || e.type, h: Math.round(e.getBoundingClientRect().height) })),
    );
  expect(heights.length).toBeGreaterThanOrEqual(9);
  for (const h of heights) {
    const min = /te-cell|te-block-readout/.test(h.t) ? 29 : 43;
    expect(h.h, `${h.t} is a ${min}px target`).toBeGreaterThanOrEqual(min);
  }
  const kcCount = (await state(page)).layers.filter(
    (l) => l.type !== 'pattern' && l.type !== 'fx' && l.type !== 'math',
  ).length;
  await page.locator('.strata-block.strata-pattern').getByTitle('Remove track (undoable)').click();
  await expect(page.locator('.strata-block.strata-pattern')).toHaveCount(0);
  await expect(page.locator('.pattern-editor')).toHaveCount(0);
  expect(
    (await state(page)).layers.filter((l) => l.type !== 'pattern' && l.type !== 'fx' && l.type !== 'math').length,
  ).toBe(kcCount);
});

test('the last KC track cannot be removed even with a pattern track present, and the cap counts the pattern track', async ({
  page,
}) => {
  await boot(page);
  const s0 = await state(page);
  const kc = s0.layers.filter((l) => l.type !== 'fx' && l.type !== 'math');
  if (kc.length === 1) {
    await addPattern(page);
    const kcRow = page.locator('.strata-block.strata-content:not(.strata-pattern)').first();
    await expect(kcRow.getByTitle('Remove track (undoable)')).toBeDisabled();
  }
  // Fill the content cap with patterns; the unified slot still offers FX/MATH
  // room, but the PATTERN type itself disables at the cap.
  for (let i = 0; i < 4; i++) {
    const n = (await state(page)).layers.filter((l) => l.type !== 'fx' && l.type !== 'math').length;
    if (n >= 4) break;
    await addPattern(page);
  }
  expect((await state(page)).layers.filter((l) => l.type !== 'fx' && l.type !== 'math').length).toBe(4);
  const slot = page.locator('.build-layer-stack .strata-add');
  await slot.dispatchEvent('pointerdown');
  await expect(page.locator('.layer-chooser')).toBeVisible({ timeout: 10000 });
  await slot.dispatchEvent('pointerup');
  await expect(page.locator('.layer-chooser').getByRole('button', { name: 'PATTERN', exact: true })).toBeDisabled();
});

test('DROP: the toggle writes through, an armed SHUFFLE shows it and lands later; with DROP off it lands at once', async ({
  page,
}) => {
  await boot(page);
  await addPattern(page);
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
  const outcome = async () =>
    (await patternOf(page)).seed !== s1
      ? 'landed'
      : (await page.locator('.status-pill', { hasText: /PERF PAUSED/i }).count())
        ? 'frozen'
        : 'waiting';
  await expect.poll(outcome, { timeout: 6000, message: 'lands on the bar' }).not.toBe('waiting');
  if ((await outcome()) === 'frozen') {
    test.info().annotations.push({
      type: 'note',
      description: 'loop frozen by the watchdog (slow runner): the held shuffle was not expected to land',
    });
    return;
  }
  await expect(shuffle).not.toHaveAttribute('data-armed', 'true');
});
