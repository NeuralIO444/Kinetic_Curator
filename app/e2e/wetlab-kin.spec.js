// #2232 step 3 — the WetLab's KIN strip: the empty lab opens from the pool's USER section, KIN deals a hand of
// creatures, a tap banks one onto the lab's stage, "clear unkept" takes back what was never turned on.
// No page errors; no horizontal scroll at phone width. Set KIN_SHOTS=<dir> to save screenshots of each state.
/* global process: readonly */
import { test, expect } from '@playwright/test';

const shot = async (page, name) => {
  if (process.env.KIN_SHOTS) await page.screenshot({ path: `${process.env.KIN_SHOTS}/${name}.png` });
};

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

async function openEmptyLab(page) {
  await page.locator('.cat-chip', { hasText: /^USER/ }).click();
  const open = page.getByTestId('open-wetlab-empty');
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByTestId('wet-lab')).toBeVisible();
}

test('the empty lab opens from the USER section; KIN lands a creature on the stage and deals six; a tap banks another; clear unkept takes them back', async ({
  page,
}) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  await expect(page.getByTestId('kin-strip')).toBeVisible();
  await expect(page.getByTestId('wet-lab-stage')).toHaveCount(0); // no shape, no attach editor
  await expect(page.getByTestId('lab-mode-assemble')).toHaveCount(0);
  await expect(page.getByTestId('kin-tile')).toHaveCount(0);
  await shot(page, '1-empty-lab');

  // one press: the lead creature lands on the stage at once, and the hand of six waits beside it
  await page.getByTestId('kin-press').click();
  await expect(page.getByTestId('kin-tile')).toHaveCount(6);
  await expect(page.getByTestId('bank-tile')).toHaveCount(1);
  await expect(page.getByTestId('kin-tile').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('creature-stage')).toBeVisible();
  await shot(page, '2-kin-lands');

  const firstHand = await page.getByTestId('kin-tile').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  await page.getByTestId('kin-press').click();
  const secondHand = await page.getByTestId('kin-tile').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  expect(secondHand).not.toEqual(firstHand); // a new press, a new hand, a new creature on the stage
  await expect(page.getByTestId('bank-tile')).toHaveCount(2);
  await shot(page, '3-second-press');

  // another creature of the hand is one tap away: it banks beside and takes the stage
  await page.getByTestId('kin-tile').nth(1).click();
  await expect(page.getByTestId('bank-tile')).toHaveCount(3);
  await expect(page.getByTestId('kin-clear')).toContainText('3');
  await page.getByTestId('kin-clear').click();
  await expect(page.getByTestId('bank-tile')).toHaveCount(0);
  await expect(page.getByTestId('kin-clear')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('CUR narrows from the creature on the stage: needs one, deals close neighbours, marks a pick, a tap banks and walks on', async ({
  page,
}) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  await expect(page.getByTestId('cur-press')).toBeDisabled(); // nothing on the stage yet
  await page.getByTestId('kin-press').click(); // the lead creature lands on the stage by itself
  await expect(page.getByTestId('bank-tile')).toHaveCount(1);
  await expect(page.getByTestId('cur-press')).toBeEnabled();

  const cap = page.getByTestId('cur-cap');
  await expect(cap).toHaveText('NEAR');
  await cap.click();
  await expect(cap).toHaveText('LOOSE');
  await cap.click();
  await expect(cap).toHaveText('TIGHT');
  await cap.click();
  await expect(cap).toHaveText('NEAR');

  await page.getByTestId('cur-press').click();
  const n = await page.getByTestId('kin-tile').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(3);
  await expect(page.getByTestId('cur-pick')).toHaveCount(1);
  await shot(page, '6-cur-hand');

  const before = await page.getByTestId('bank-tile').count();
  await page.getByTestId('kin-tile').first().click();
  await expect(page.getByTestId('bank-tile')).toHaveCount(before + 1); // banked beside its source
  await expect(page.getByTestId('cur-press')).toBeEnabled(); // and it is the new subject: CUR walks on
  await page.getByTestId('cur-press').click();
  await expect(page.getByTestId('kin-tile').first()).toBeVisible();
  await shot(page, '7-cur-walked-on');
  expect(errors).toEqual([]);
});

test('the width pill steps OFF → WEAK → MED → KOZ and the hand follows it', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  const pill = page.getByTestId('kin-scope');
  await expect(pill).toHaveText('WEAK');
  await pill.click();
  await expect(pill).toHaveText('MED');
  await pill.click();
  await expect(pill).toHaveText('KOZ');
  await pill.click();
  await expect(pill).toHaveText('OFF');
  await page.getByTestId('kin-press').click();
  await expect(page.getByTestId('kin-tile')).toHaveCount(6);
  await shot(page, '4-off-width');
  expect(errors).toEqual([]);
});

test('a lab opened on a shape keeps hand-picking and gains the strip', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await expect(page.getByRole('button', { name: /in the wet lab/i }).first()).toBeAttached();
  await page
    .getByRole('button', { name: /in the wet lab/i })
    .first()
    .click({ force: true });
  await expect(page.getByTestId('wet-lab')).toBeVisible({ timeout: 20_000 }); // the lab is a lazy import
  await expect(page.getByTestId('lab-mode-assemble')).toBeVisible();
  await expect(page.getByTestId('wet-lab-stage')).toBeVisible();
  await expect(page.getByTestId('kin-strip')).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone width: the empty lab and its strip never scroll sideways', async ({ page }) => {
  const errors = await boot(page, { width: 390, height: 844 });
  await openEmptyLab(page);
  await page.getByTestId('kin-press').click();
  await expect(page.getByTestId('kin-tile')).toHaveCount(6);
  const sideways = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="wet-lab"]');
    return {
      doc: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sheet: sheet.scrollWidth > sheet.clientWidth + 1,
    };
  });
  expect(sideways.doc).toBe(false);
  expect(sideways.sheet).toBe(false);
  await shot(page, '5-phone');
  expect(errors).toEqual([]);
});

test('a KIN hand tile draws the whole creature, body and parts, not just the body shape', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await openEmptyLab(page);
  await page.getByTestId('kin-press').click();
  await expect(page.getByTestId('kin-tile')).toHaveCount(6);
  const figures = await page.getByTestId('kin-tile').evaluateAll((els) =>
    els.map((e) => {
      const svg = e.querySelector('svg');
      return {
        kind: svg && svg.getAttribute('data-figure'),
        pieces: svg ? svg.querySelectorAll(':scope > g[transform]').length : 0,
      };
    }),
  );
  expect(figures.every((f) => f.kind === 'full' && f.pieces >= 1)).toBe(true);
  expect(figures.some((f) => f.pieces > 1)).toBe(true); // at least one tile carries parts beyond its body
  await shot(page, 'c1-full-creature-tiles');
  expect(errors).toEqual([]);
});
