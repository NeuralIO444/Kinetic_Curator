// #624 — WASH color mode: tapping palette 1–4 soaks the new tints through
// the marks on a center-out wavefront with per-node seeded jitter — no scale
// change (color never touches the item morph), no two-deck dissolve. This
// scenario switches the color mode to WASH, taps palette chips, and
// screenshots across the MIX window so a reviewer can see the dye front chase
// through the marks, then settle on the new palette.
//
// Environment notes (same as morph-moves, kept honest for the reviewer):
// - `?downscale=1` renders the canvas at half resolution and COUNT is set to
//   80: this sandbox's software GL trips the watchdog below ~10fps at full
//   load, which freezes the loop. The lighter scene keeps the real loop (and
//   the real wash code path) running here.
// - A palette tap is NOT a voice mix: setPaletteId clears voiceMix, so the
//   wash starts on the first frame after the click and runs for MIX seconds.
// - Screenshots use the full page — element screenshots of the WebGL canvas
//   go stale in headless Chromium, the page capture stays live.
export default {
  describe: 'Switch to WASH, tap palette chips 1–4, screenshot across the MIX window — the dye front should chase through the marks, nothing should scale or blink.',
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

    // Switch the color mode to WASH (cycles FADE → WASH → INJECT).
    const modeBtn = page.locator('button.palette-mix-label').first();
    let mode = (await modeBtn.innerText()).trim();
    for (let i = 0; i < 3 && mode !== 'WASH'; i++) {
      await modeBtn.click();
      await page.waitForTimeout(300);
      mode = (await modeBtn.innerText()).trim();
    }
    ctx.check('color mode is WASH', mode === 'WASH', `mode reads "${mode}"`);
    if (mode !== 'WASH') return;
    await ctx.snap(page, 'wash mode armed — before the tap');

    // Tap the first inactive palette chip: the wash starts on the next frame.
    const chips = page.locator('.palette-strip button.palette-chip');
    const n = await chips.count();
    ctx.check('palette chips present', n >= 2, `found ${n}`);
    if (n < 2) return;
    await chips.nth(0).click();

    // Screenshot across the 2s MIX window: the dye front should visibly chase
    // center-out while the field soaks underneath it. Few captures — each
    // full-page screenshot costs fps in software GL.
    const marks = [400, 1100, 1800];
    let last = 0;
    for (const ms of marks) {
      await page.waitForTimeout(ms - last);
      last = ms;
      await ctx.snap(page, `wash t+${ms}ms`);
    }

    // Rapid re-tap: a second chip mid-soak re-bases from the displayed colors
    // (the DJ re-base) instead of stacking — screenshot the second wave.
    await chips.nth(1).click();
    await page.waitForTimeout(900);
    await ctx.snap(page, 're-tap — second wave mid-soak');
    await page.waitForTimeout(1600);
    await ctx.snap(page, 'settled — new palette at rest');

    const stillRunning = (await page.locator('.run-btn').innerText()).includes('STOP');
    ctx.check('loop still running at the end', stillRunning, 'watchdog tripped mid-capture');
    ctx.check('no page errors during the soak', errors.length === 0, errors.slice(0, 3).join(' | '));
  },
};
