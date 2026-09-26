// #623 — the move vocabulary: a mode change plays seeded per-node moves
// (smear/breath/fade), never one scale-to-zero wave. This scenario clicks a
// MODE chip and screenshots the page across the item-morph transition so a
// reviewer can see the ripple: adjacent nodes mid-different-moves, nothing
// blinking out in lockstep.
//
// Environment notes (kept honest for the reviewer):
// - `?downscale=1` renders the canvas at half resolution and COUNT is set to
//   80: this sandbox's software GL trips the watchdog below ~10fps at full
//   load, which freezes the loop. The lighter scene keeps the real loop (and
//   the real morph code path) running here.
// - A MODE chip opens a 2s voice mix whose enum lerp returns the new mode for
//   any t>0 (Spine E), so the item morph (this issue's code) starts on the
//   first frame after the click. The chip going active ~2s later is the
//   commit — the END of the morph, not its start.
// - Screenshots use the full page — element screenshots of the WebGL canvas
//   go stale in headless Chromium, the page capture stays live.
export default {
  describe: 'Click a MODE chip and screenshot the page across the item-morph transition — the picture should ripple (per-node moves), not blink.',
  async run(ctx) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
    await ctx.openApp(page);
    // Half-res render so software GL keeps up and the loop actually runs.
    const u = new URL(page.url());
    u.searchParams.set('downscale', '1');
    await page.goto(u.toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('.app').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2500);

    // Lighten the scene: the watchdog freezes the loop under ~10fps.
    const countSlider = page.locator('.range-row:has(.range-label:text-is("COUNT")) input.single-slider');
    if (await countSlider.count()) {
      await countSlider.fill('80');
      await page.waitForTimeout(800);
    }

    // Resume the loop (Space); the watchdog hard-stops it on boot here.
    await page.keyboard.press('Space');
    await page.waitForTimeout(1500);
    const running = (await page.locator('.run-btn').innerText()).includes('STOP');
    ctx.check('render loop stays running for the capture', running, 'watchdog re-tripped — canvas would be frozen');
    if (!running) return;
    await ctx.snap(page, 'before — resting canvas');

    const chips = page.locator('.mode-strip .mode-strip-chips').first().locator('.chip-btn');
    const n = await chips.count();
    ctx.check('mode strip has chips', n >= 2, `found ${n}`);
    let target = -1;
    for (let i = 0; i < n; i++) {
      const cls = (await chips.nth(i).getAttribute('class')) || '';
      if (!cls.includes('active')) { target = i; break; }
    }
    ctx.check('an inactive mode chip exists to click', target >= 0, `target=${target}`);
    if (target < 0) return;
    await chips.nth(target).click();

    // The item morph starts on the FIRST frame after the click: the voice
    // mix's enum lerp returns `to` for any t>0 (Spine E), so the render-
    // effective mode flips immediately and liveResolve's morphSig fires.
    // The chip going active ~2s later is the commit (end of the morph),
    // not its start. Screenshot across the 2s MIX window from the click.
    const marks = [200, 600, 1000, 1400, 1800];
    let last = 0;
    for (const ms of marks) {
      await page.waitForTimeout(ms - last);
      last = ms;
      await ctx.snap(page, `morph t+${ms}ms`);
      // Canvas close-ups at peak morph so the per-node moves read clearly.
      if (ms === 600 || ms === 1000) {
        await ctx.snap(page, `canvas closeup t+${ms}ms`, page.locator('.canvas-gl'));
      }
    }
    // The voice mix commits around here (chip goes active) — informational.
    let committed = false;
    for (let i = 0; i < 16 && !committed; i++) {
      await page.waitForTimeout(250);
      const cls = (await chips.nth(target).getAttribute('class')) || '';
      committed = cls.includes('active');
    }
    ctx.check('mode change committed (chip went active)', committed, 'chip never went active');
    await page.waitForTimeout(800);
    await ctx.snap(page, 'settled — new mode at rest');
    const stillRunning = (await page.locator('.run-btn').innerText()).includes('STOP');
    ctx.check('loop still running at the end', stillRunning, 'watchdog tripped mid-capture');
    ctx.check('no page errors during the transition', errors.length === 0, errors.slice(0, 3).join(' | '));
  },
};
