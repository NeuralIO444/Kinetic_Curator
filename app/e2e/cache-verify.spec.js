// Guards #108 step 4 (staged-eval cache) through the React wiring, which the
// pure stagedEval.selfcheck cannot reach: the per-Layer cache lives in a
// useState slot in useCanvasItems, and a stale one would silently swallow
// geometry edits while the canvas kept animating convincingly.
//
// Two things this test learned the hard way, both worth keeping:
//
// 1. Screenshot diffing is useless here. The canvas animates every frame, so
//    two shots always differ whether or not an edit took effect — the
//    assertion passes vacuously. Assert on node count, which only moves when
//    the kernel re-derives.
// 2. Do not drive the slider with keyboard repeat. It worked locally and
//    failed on CI, where focus was lost partway and the restore keypresses
//    went nowhere (198 -> 147 -> 147). Set the value explicitly instead, and
//    compare against values far enough apart that ambient layoutParams drift
//    cannot account for the difference.
import { test, expect } from '@playwright/test';
import { glNodeCount, waitForLiveFrame } from './gl-helpers.js';

// The GL loop reports node count through the CanvasPanel pill. Poll for a
// nonzero count so we never read a pre-first-frame zero.
const nodeCount = async (page) => {
  await waitForLiveFrame(page);
  return glNodeCount(page);
};

/** Set a range input to an exact value and let React commit it. */
async function setRange(page, slider, value) {
  await slider.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(700);
}

test('staged-eval cache does not swallow geometry edits', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript(() => {
    try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
    // #655 — disarm the performance governor for this spec. The node count
    // it asserts on used to be the LIVE post-shed count: under CI load the
    // governor shed COUNT=700 harder than COUNT=60 (wall-clock FPS driven),
    // narrowing the 700/60 ratio toward the 1.5x bar and flaking the run.
    // With the governor off, the pill reports the deterministic resolved
    // placement count — a pure function of COUNT through the staged-eval
    // cache — so the ratio is load-independent. The property under test is
    // unchanged: a swallowed COUNT edit still reads ~1x and fails the bar.
    window.__KC_GOVERNOR_OFF = true;
  });
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  await page.getByRole('tab', { name: /build/i }).first().click();
  await page.waitForTimeout(300);

  // COUNT is a stage-A input: if the geometry cache went stale, changing it
  // would not move the node count. Node count cannot be faked by animation.
  // Scope the lookup through the build panel's COUNT label, not bare
  // document order: the master bar now hosts its own input[type=range]
  // (the #278 palette MIX slider), which sorts first in the DOM and broke
  // the old .first() lookup.
  const count = page.locator('.param-block .range-row', {
    has: page.locator('.range-label', { hasText: /^COUNT$/ }),
  }).locator('input[type="range"]');
  await expect(count).toBeVisible();

  await setRange(page, count, 700);
  const high = await nodeCount(page);
  await setRange(page, count, 60);
  const low = await nodeCount(page);
  await setRange(page, count, 700);
  const restored = await nodeCount(page);
  console.log(`[cache] COUNT 700 -> ${high} nodes, 60 -> ${low}, back to 700 -> ${restored}`);

  // #655 (supersedes the #478 note below): the governor is disarmed via
  // window.__KC_GOVERNOR_OFF, so the node count below is the deterministic
  // resolved placement count, not the live post-shed count. The margin stays
  // at 1.5x — deliberately not loosened again — and a real stale-cache bug
  // still fails decisively: a swallowed edit leaves high/low/restored all at
  // the last-cached count, a ratio of ~1x, nowhere near the bar.
  //
  // #478 (historical): this used to measure the live governor-shed node
  // count, which responds to real wall-clock frame rate. Under concurrent CI load the governor sheds
  // COUNT=700 harder than COUNT=60, narrowing the ratio toward ~1.8x on a
  // loaded runner (observed 3-11% short of a 2x bar across 4 failures) even
  // though a fresh local build clears it by 6.6x. A real stale-cache bug —
  // the thing this test exists to catch — doesn't produce a narrowed ratio;
  // a swallowed edit means `high` never moves off whatever was last cached,
  // so the ratio reads close to 1x, nowhere near either bar. 1.5x keeps a
  // wide margin below every CI-load ratio seen so far while staying just as
  // decisive against the real failure mode.
  const MARGIN = 1.5;
  expect(high, 'COUNT=700 should place many more shapes than COUNT=60')
    .toBeGreaterThan(low * MARGIN);
  expect(restored, 'returning COUNT to 700 should restore the high node count')
    .toBeGreaterThan(low * MARGIN);

  expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
});
