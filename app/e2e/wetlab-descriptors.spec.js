// #1946 — the wet lab reads descriptors: the shape card, breed parents filtered by body tag, a kit as a breeding source,
// and the part preview changing with the kit. No page errors; no horizontal scroll at phone width.
import { test, expect } from '@playwright/test';

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

const POINTS = [
  { x: 50, y: 6, role: 'H' },
  { x: 12, y: 70, role: 'L' },
  { x: 88, y: 70, role: 'L' },
];

async function seedCreatures(page) {
  await page.evaluate((pts) => {
    const s = window.__kcStore.getState();
    for (const id of ['org_petal_01', 'org_blob_01', 'geo_hex_01']) s.assembleCreature(id, pts);
    // a stage for the part preview: a handful of library shapes on
    window.__kcStore.setState({
      enabledAssets: Object.fromEntries(
        [
          'org_petal_02',
          'org_petal_03',
          'org_leaf_01',
          'stamp_glyph_01',
          'stamp_glyph_02',
          'stamp_glyph_03',
          'geo_hex_01',
          'creature',
        ].map((i) => [i, true]),
      ),
    });
  }, POINTS);
}

async function openLab(page, id) {
  await page.getByPlaceholder(/filter/i).fill(id);
  await page.getByRole('button', { name: `Inspect ${id}` }).click();
  await page.getByRole('button', { name: 'wet lab' }).click();
  await expect(page.getByTestId('wet-lab')).toBeVisible();
}

test('shape card, filtered breed parents, a kit source, and a part preview that follows the kit', async ({ page }) => {
  const errors = await boot(page, { width: 1280, height: 900 });
  await seedCreatures(page);
  await openLab(page, 'org_petal_01');
  const lab = page.getByTestId('wet-lab');
  // the shape card: a bar for every role
  await expect(lab.getByTestId('shape-card')).toBeVisible();
  await expect(lab.getByTestId('shape-role')).toHaveCount(5);
  // the part preview strip: a part per bone
  await expect(lab.getByTestId('part-preview')).toBeVisible();
  const before = await lab.getByTestId('part-cell').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  expect(before.length).toBeGreaterThanOrEqual(3);
  // ask "what if this stage were Kanji": the dealt parts change
  await lab.getByRole('button', { name: 'Kanji', exact: true }).click();
  const after = await lab.getByTestId('part-cell').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  expect(after).not.toEqual(before);
  // breed parents filtered by the body's tag: only the flower-bodied creature remains in slot 1
  // (#2034 re-pin: BREED is a rail mode now — the panel swaps, the slots and labels are unchanged)
  await lab.getByTestId('lab-mode-breed').click();
  const slot1 = lab.getByLabel('Parent 1');
  const creatureOptions = async () =>
    slot1.locator('option').evaluateAll((os) => os.map((o) => o.value).filter((v) => v.startsWith('cr-')));
  const all = await creatureOptions();
  expect(all.length).toBe(3);
  await lab.getByLabel('Filter parents by body tag').selectOption('subject:flower');
  const filtered = await creatureOptions();
  expect(filtered.length).toBe(1);
  // breed from a kit source: kit + two creatures
  await lab.getByLabel('Filter parents by body tag').selectOption('');
  await slot1.selectOption('@kit:big-shapes');
  const rest = await creatureOptions();
  await lab.getByLabel('Parent 2').selectOption(rest[0]);
  await lab.getByLabel('Parent 3').selectOption(rest[1]);
  await lab.getByTestId('breed').click();
  await expect(lab.getByTestId('breed-note')).toContainText(/bred cr-/);
  expect(errors).toEqual([]);
});

test('the lab holds at phone width: no horizontal scroll', async ({ page }) => {
  const errors = await boot(page, { width: 390, height: 800 });
  await seedCreatures(page);
  await openLab(page, 'org_petal_01');
  await expect(page.getByTestId('part-preview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await page.getByTestId('wet-lab').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(box).toBe(true);
  expect(errors).toEqual([]);
});
