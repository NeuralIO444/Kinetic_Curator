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
  // First frame only. Re-arming the 30s wait on every read blew the 60s
  // test cap on CI (main and this branch, same line): the polls had already
  // crossed the bar, then the last read waited for a pill that was slow, not
  // absent.
  if (!page.__kcLive) {
    await waitForLiveFrame(page);
    page.__kcLive = true;
  }
  return glNodeCount(page);
};

// A COUNT edit reaches the pill over several frames. A single read after a
// fixed sleep caught it mid-way on slow CI runners (COUNT 60 read as 311 on the
// way down from 343), and waiting for N identical reads never finished there
// either (the pill kept moving), timing the test out. So poll the PROPERTY:
// wait up to CONVERGE_MS for the count to cross the ratio bar. A slow runner
// gets time; a swallowed edit never crosses it and still fails.
const CONVERGE_MS = 20_000;
const MARGIN = 1.5;

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
  // 60s cannot hold a 30s first-frame wait plus two 20s converge polls.
  // That sum is what timed out on main (37134040106) and on #896.
  test.setTimeout(120_000);
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
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  await page.getByRole('tab', { name: /build/i }).first().click();
  await page.waitForTimeout(300);

  // COUNT is a stage-A input: if the geometry cache went stale, changing it
  // would not move the node count. Node count cannot be faked by animation.
  // #1202: COUNT is a TE value button now — click it to open the docked
  // editor, then drive the dock's slider (the house RangeRow, a native
  // input[type=range] in bare layout) with the setRange helper.
  await page.locator('.panel-layout .te-value-btn', { hasText: 'COUNT' }).click();
  const count = page.locator('.te-dock.open input[type="range"]');
  await expect(count).toBeVisible({ timeout: 15_000 });

  // CI load: COUNT=700 under SwiftShader saturates the runner's main thread —
  // Playwright protocol calls (evaluate, textContent) then time out even though
  // the app is healthy. 300 still clears the 1.5x bar by a wide margin (5x)
  // while cutting the software-GL load by more than half. The property under
  // test is unchanged: a swallowed COUNT edit reads ~1x and fails the bar.
  await setRange(page, count, 300);
  const high = await nodeCount(page);
  await setRange(page, count, 60);
  await expect.poll(() => glNodeCount(page), {
    message: 'COUNT=60 should place many fewer shapes than COUNT=300 (a stale cache stays high)',
    timeout: CONVERGE_MS,
  }).toBeLessThan(high / MARGIN);
  const low = await nodeCount(page);
  await setRange(page, count, 300);
  await expect.poll(() => glNodeCount(page), {
    message: 'returning COUNT to 300 should restore the high node count',
    timeout: CONVERGE_MS,
  }).toBeGreaterThan(low * MARGIN);
  const restored = await nodeCount(page);
  console.log(`[cache] COUNT 300 -> ${high} nodes, 60 -> ${low}, back to 300 -> ${restored}`);

  // #655: the governor is disarmed via window.__KC_GOVERNOR_OFF, so the node
  // count is the deterministic resolved placement count, not the live post-shed
  // count. The margin stays at 1.5x — deliberately not loosened again — and a
  // real stale-cache bug still fails decisively: a swallowed edit leaves the
  // count at the last-cached value, a ratio of ~1x, and the polls above time
  // out instead of crossing the bar.
  //
  // #478 (historical): this used to measure the live governor-shed node count,
  // which under CI load narrowed the ratio toward ~1.8x; 1.5x keeps a wide
  // margin below every CI-load ratio seen while staying decisive against the
  // real failure mode.
  expect(high, 'COUNT=300 should place many more shapes than COUNT=60')
    .toBeGreaterThan(low * MARGIN);
  expect(restored, 'returning COUNT to 300 should restore the high node count')
    .toBeGreaterThan(low * MARGIN);

  expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
});
