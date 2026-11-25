// #2484 — the value dock's hit footprint is its interactive content, not
// its painted box. The dock is a full-height slab pinned to the panel's
// right edge; while it took pointer events across the whole box, every
// control under the panel's right strip — a mode row's HIGH segment above
// all — was silently unclickable with an editor open, and the dock's own
// tap-outside dismissal could not rescue the tap (it landed INSIDE the
// dock). This spec pins the contract: with an editor open, the swarm
// rows' HIGH segments stay hit-testable and clickable; a tap on one both
// dismisses the editor and applies; the editor itself stays usable.
//
// Taps are delivered as raw mouse input at measured element centres —
// the points a performer's tap lands on, and the points the stress
// session's automation was refused at. (Locator clicks wait on rAF
// stability, which starves on software GL; the assertions carry the pin.)
import { test, expect } from '@playwright/test';

const DOC = {
  version: 1,
  seed: 7,
  autoQuality: false,
  layoutParams: { mode: 'swarm', count: 40, particleCount: 120, gravityWells: 0.3 },
};

async function boot(page) {
  await page.addInitScript((doc) => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.setItem('kc:project:v1', JSON.stringify({ version: 1, savedAt: new Date().toISOString(), doc }));
    } catch {
      /* ignore */
    }
  }, DOC);
  await page.goto('/Kinetic_Curator/?boot=factory', { waitUntil: 'domcontentloaded' });
  await page.locator('.app').waitFor({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  // The swarm rows are live (not is-disabled) once the seeded mode lands.
  await expect(page.locator('[aria-label="PARTICLES mode"]')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = document.querySelector('[aria-label="PARTICLES mode"]');
          return g ? g.closest('.te-mode').classList.contains('is-disabled') : null;
        }),
      { timeout: 30_000, intervals: [1000, 2000, 5000] },
    )
    .toBe(false);
}

// Scroll an element (found by a self-contained page-side picker) into
// view and tap its measured centre with the raw mouse. Pickers are
// serialized into the page, so they must not close over spec variables.
async function tap(page, picker, ...args) {
  const point = await page.evaluate(
    ([src, args]) => {
      const el = eval(`(${src})`)(...args);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    [picker.toString(), args],
  );
  if (!point) throw new Error('tap target not found');
  await page.mouse.click(point.x, point.y);
}

function pickReadout(label) {
  const g = document.querySelector(`[aria-label="${label} mode"]`);
  return g ? g.closest('.te-mode').querySelector('.te-mode-readout') : null;
}
function pickCell(label, text) {
  const g = document.querySelector(`[aria-label="${label} mode"]`);
  if (!g) return null;
  g.scrollIntoView({ block: 'center' });
  return [...g.querySelectorAll('button')].find((b) => b.textContent.trim() === text) ?? null;
}
function pickDockClose() {
  return document.querySelector('.te-dock-close');
}

// elementFromPoint across a cell: every sample must land on the cell
// itself (or a descendant). Returns the list of offending hit owners.
async function coveredSamples(page, label) {
  return page.evaluate((label) => {
    const group = document.querySelector(`[aria-label="${label} mode"]`);
    group.scrollIntoView({ block: 'center' });
    const cell = [...group.querySelectorAll('button')].find((b) => b.textContent.trim() === 'HIGH');
    const r = cell.getBoundingClientRect();
    const bad = [];
    for (const f of [0.2, 0.5, 0.8]) {
      const el = document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2);
      if (!el || !(cell.contains(el) || el === cell)) {
        bad.push(el ? `${el.tagName}.${typeof el.className === 'string' ? el.className : ''}` : 'null');
      }
    }
    return bad;
  }, label);
}

const dockTitle = (page) =>
  page
    .locator('.te-dock.open .te-dock-title')
    .textContent()
    .catch(() => null);

test('value dock open: swarm HIGH segments stay clickable, editor stays usable', async ({ page }) => {
  // Software-GL boots are slow (see midi.spec.js); the assertions are fast.
  test.setTimeout(180_000);
  await boot(page);

  // Open the PARTICLES exact editor in the value dock.
  await tap(page, pickReadout, 'PARTICLES');
  await expect.poll(() => dockTitle(page), { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe('PARTICLES');

  // The pin: with the editor open, no part of either HIGH segment is
  // covered — pre-fix every sample named the dock body (.te-dock-body).
  expect(await coveredSamples(page, 'PARTICLES')).toEqual([]);
  expect(await coveredSamples(page, 'GRAVITY')).toEqual([]);

  // A tap on GRAVITY HIGH applies it — and, the tap landing outside the
  // dock, dismisses the editor on the same tap, exactly as taps on
  // never-covered segments already behaved.
  await tap(page, pickCell, 'GRAVITY', 'HIGH');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = document.querySelector('[aria-label="GRAVITY mode"]');
          const cell = [...g.querySelectorAll('button')].find((b) => b.textContent.trim() === 'HIGH');
          return cell ? cell.getAttribute('aria-pressed') : null;
        }),
      { timeout: 30_000, intervals: [1000, 2000, 5000] },
    )
    .toBe('true');
  await expect(page.locator('.te-dock.open')).toHaveCount(0);

  // The editor itself is untouched by the fix: reopen it, drive its
  // slider, and the value moves while the dock stays open. (Polls run on
  // a backoff — the app's render loop crawls on software GL, and eager
  // polling only adds load.)
  await tap(page, pickReadout, 'PARTICLES');
  await expect.poll(() => dockTitle(page), { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe('PARTICLES');
  const readout = page.locator('.te-dock.open .te-editor-readout');
  const before = await readout.textContent();
  await page.locator('.te-dock.open input[type=range]').evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(Number(el.max)));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => {
          const dock = document.querySelector('.te-dock.open');
          const ro = document.querySelector('.te-dock.open .te-editor-readout');
          return { open: !!dock, text: ro ? ro.textContent : null };
        });
        return state.open && state.text !== null && state.text !== before;
      },
      { timeout: 30_000, intervals: [1000, 2000, 5000] },
    )
    .toBe(true);
  await tap(page, pickDockClose);
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('.te-dock.open').length), {
      timeout: 30_000,
      intervals: [1000, 2000, 5000],
    })
    .toBe(0);
});
