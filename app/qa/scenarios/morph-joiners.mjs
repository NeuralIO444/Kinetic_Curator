// #626 — joiner/leaver pairing (obvious face / invisible face). Dragging the
// COUNT slider changes the node count, which fires the item morph: count UP
// means unmatched targets = joiners (seeded pop-with-overshoot or center-out
// wavefront fade-up); count DOWN means unmatched sources = leavers (quiet
// alpha fade or shrink-out, timed inside a joiner's window when both exist).
// This scenario screenshots both directions across the transition so a
// reviewer can feel the pairing: the eye should land on arrivals, and only
// notice departures afterward. Optionally toggles MIRROR at the end —
// symmetry doubling must ride the joiner entrance, not pop in at full size.
//
// Environment notes (same sandbox limits as morph-moves.mjs):
// - `?downscale=1` renders the canvas at half resolution and COUNT stays low:
//   this sandbox's software GL trips the watchdog below ~10fps at full load,
//   which freezes the loop. The lighter scene keeps the real loop (and the
//   real morph code path) running here.
// - Screenshots use the full page — element screenshots of the WebGL canvas
//   go stale in headless Chromium, the page capture stays live.
export default {
  describe: 'Drag COUNT up then down and screenshot across both transitions — arrivals should punch in (pop/wave), departures should slip out quietly.',
  async run(ctx) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
    // #655 e2e hook: force the performance governor off before boot. This
    // sandbox's software GL can't hold 10fps, so the watchdog hard-stops the
    // loop on boot and re-trips on resume — with the governor off the loop
    // runs and the item-morph code path under test is unaffected.
    await page.addInitScript(() => { window.__KC_GOVERNOR_OFF = true; });
    await ctx.openApp(page);
    // Half-res render so software GL keeps up and the loop actually runs.
    const u = new URL(page.url());
    u.searchParams.set('downscale', '1');
    await page.goto(u.toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('.app').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2500);

    // Dismiss the onboarding overlay (new since morph-moves.mjs was written —
    // it eats keypresses and covers the canvas).
    const skipBtn = page.locator('button', { hasText: 'SKIP' });
    if (await skipBtn.count()) {
      await skipBtn.first().click();
      await page.waitForTimeout(800);
    }

    const countSlider = page.locator('.range-row:has(.range-label:text-is("COUNT")) input.single-slider');
    ctx.check('COUNT slider exists', await countSlider.count() > 0, 'no COUNT slider found');
    if (!(await countSlider.count())) return;
    await countSlider.fill('40');
    await page.waitForTimeout(800);

    // Start the loop via the RUN button if it isn't already running (the old
    // Space shortcut is gone; with the governor off the app boots running).
    const runBtn = page.locator('.run-btn');
    if ((await runBtn.innerText()).includes('RUN')) {
      await runBtn.click({ force: true });
      await page.waitForTimeout(1500);
    }
    const running = (await runBtn.innerText()).includes('STOP');
    ctx.check('render loop stays running for the capture', running, 'loop did not start — canvas would be frozen');
    if (!running) return;
    await ctx.snap(page, 'before — 40 nodes at rest');

    const shootAcross = async (label) => {
      // Full-page captures only: element screenshots of the WebGL canvas go
      // stale in headless Chromium (the page capture stays live).
      const marks = [200, 600, 1000, 1400, 1800];
      let last = 0;
      for (const ms of marks) {
        await page.waitForTimeout(ms - last);
        last = ms;
        await ctx.snap(page, `${label} t+${ms}ms`);
      }
      await page.waitForTimeout(800);
    };

    // JOINERS: 40 -> 120. The new nodes should punch in with overshoot or
    // fade up along a center-out wavefront — never blink on at full size.
    await countSlider.fill('120');
    await shootAcross('joiners 40→120');
    await ctx.snap(page, 'settled — 120 nodes at rest');

    // LEAVERS: 120 -> 40. The departing nodes should fade/shrink quietly —
    // no big paired move, no traveling across the canvas.
    await countSlider.fill('40');
    await shootAcross('leavers 120→40');
    await ctx.snap(page, 'settled — 40 nodes at rest again');

    // MIRROR doubling (opportunistic): the toggle lives in the layout panel's
    // toggle row; if it isn't on screen, skip — the mirror path is covered
    // by the itemMorph unit selfcheck.
    const mirrorBtn = page.locator('.toggle-row .tg', { hasText: 'MIRROR' });
    if (await mirrorBtn.count()) {
      const wasOn = ((await mirrorBtn.first().getAttribute('class')) || '').includes('tg-on');
      if (!wasOn) {
        await mirrorBtn.first().click();
        await shootAcross('mirror doubling on');
        await ctx.snap(page, 'settled — mirror on');
      }
    }

    const stillRunning = (await page.locator('.run-btn').innerText()).includes('STOP');
    ctx.check('loop still running at the end', stillRunning, 'loop stopped mid-capture');
    ctx.check('no page errors during the transitions', errors.length === 0, errors.slice(0, 3).join(' | '));
  },
};
