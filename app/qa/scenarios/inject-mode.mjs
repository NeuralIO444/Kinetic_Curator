// #625 — INJECT color mode: tapping palette 1–4 dyes the FIELD first on a
// fast envelope, then each organism agent's tint lerps to the new palette on
// its own seeded delay — the new color visibly propagates through the moving
// swarm instead of arriving everywhere at once. No scale change (color never
// touches the item morph), no two-deck dissolve. This scenario switches the
// color mode to INJECT, taps palette chips, and screenshots across the MIX
// window so a reviewer can see the field go first and the swarm catch up.
//
// Environment notes (same as morph-moves, kept honest for the reviewer):
// - `?downscale=1` renders the canvas at half resolution and COUNT is set to
//   40: this sandbox's software GL trips the watchdog below ~10fps at full
//   load, which freezes the loop. The lighter scene keeps the real loop (and
//   the real inject code path) running here.
// - A palette tap is NOT a voice mix: setPaletteId clears voiceMix, and
//   paletteId is deliberately OUTSIDE morphSig (liveResolve.mjs), so the tap
//   starts the inject on the first frame after the click and it runs for MIX
//   seconds — the time slider owns the duration.
// - Screenshots use the full page — element screenshots of the WebGL canvas
//   go stale in headless Chromium, the page capture stays live.
export default {
  describe: 'Switch to INJECT, tap palette chips 1–4, screenshot across the MIX window — the field should dye first and the swarm should catch up on visibly different schedules.',
  async run(ctx) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
    await ctx.openApp(page);
    // Half-res render so software GL keeps up and the loop actually runs.
    const u = new URL(page.url());
    u.searchParams.set('downscale', '1');
    await page.goto(u.toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('.app').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2500);

    // Lighten the scene hard: software GL trips the watchdog below ~10fps.
    const countSlider = page.locator('.range-row:has(.range-label:text-is("COUNT")) input.single-slider');
    if (await countSlider.count()) {
      await countSlider.fill('40');
      await page.waitForTimeout(800);
    }

    // Start the loop via the RUN button (Space is flaky in headless here);
    // retry a few times — the watchdog hard-stops it on boot under load.
    let running = false;
    for (let i = 0; i < 4 && !running; i++) {
      await page.locator('.run-btn').click();
      await page.waitForTimeout(2000);
      running = (await page.locator('.run-btn').innerText()).includes('STOP');
    }
    ctx.check('render loop stays running for the capture', running, 'watchdog re-tripped — canvas would be frozen');
    if (!running) return;
    await ctx.snap(page, 'before — resting canvas');

    // Switch the color mode to INJECT (cycles FADE → WASH → INJECT).
    const modeBtn = page.locator('button.palette-mix-label').first();
    let mode = (await modeBtn.innerText()).trim();
    for (let i = 0; i < 3 && mode !== 'INJECT'; i++) {
      await modeBtn.click();
      await page.waitForTimeout(300);
      mode = (await modeBtn.innerText()).trim();
    }
    ctx.check('color mode is INJECT', mode === 'INJECT', `mode reads "${mode}"`);
    if (mode !== 'INJECT') return;
    await ctx.snap(page, 'inject mode armed — before the tap');

    // Tap the first inactive palette chip: the inject starts on the next frame.
    const chips = page.locator('.palette-strip button.palette-chip');
    const n = await chips.count();
    ctx.check('palette chips present', n >= 2, `found ${n}`);
    if (n < 2) return;
    await chips.nth(0).click();

    // Screenshot across the 2s MIX window. With the default 2s slider the
    // field completes its dye by ~360ms while agents start adopting between
    // ~200ms and ~1400ms — the t+300 shot should show a dyed field with a
    // mostly-old swarm, t+900 a visibly mixed swarm, t+1700 nearly settled.
    // If the color "arrives" everywhere at once, the variety is broken.
    const marks = [300, 900, 1700];
    let last = 0;
    for (const ms of marks) {
      await page.waitForTimeout(ms - last);
      last = ms;
      await ctx.snap(page, `inject t+${ms}ms`);
    }

    // Rapid re-tap: a second chip mid-propagation re-bases from the displayed
    // colors (the DJ re-base) instead of stacking — screenshot the second wave.
    await chips.nth(1).click();
    await page.waitForTimeout(800);
    await ctx.snap(page, 're-tap — second wave mid-propagation');
    await page.waitForTimeout(1600);
    await ctx.snap(page, 'settled — new palette at rest');

    const stillRunning = (await page.locator('.run-btn').innerText()).includes('STOP');
    ctx.check('loop still running at the end', stillRunning, 'watchdog tripped mid-capture');
    ctx.check('no page errors during the propagation', errors.length === 0, errors.slice(0, 3).join(' | '));
  },
};
