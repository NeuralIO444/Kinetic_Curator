// #744 / #745 — isolate Finish grain vs Distort RGB Split.
// QA is not CI. Asserts DOM presence + screenshots for eyes.
export default {
  describe: 'FX-4 Grain and FX-1 RGB Split armed one at a time; screenshots for lift vs wipe.',
  async run(ctx) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
    await ctx.openApp(page);
    await page.locator('.app').waitFor({ timeout: 60_000 });
    await ctx.tab(page, /build/i);
    await page.waitForTimeout(800);

    const fx4 = page.locator('.layer-row-fx', { hasText: 'FX 4' });
    const fx1 = page.locator('.layer-row-fx', { hasText: 'FX 1' });
    ctx.check('FX 4 row exists (ghost or live)', await fx4.count() > 0, 'no FX 4 row');
    ctx.check('FX 1 row exists (ghost or live)', await fx1.count() > 0, 'no FX 1 row');

    if (await page.locator('.layer-row-fx:has-text("FX 4")').count()) {
      await page.locator('.layer-row-fx:has-text("FX 4") .layer-name').first().click();
      await page.waitForTimeout(200);
    }
    await ctx.snap(page, 'fx4-selected');

    if (await page.locator('.layer-row-fx:has-text("FX 1")').count()) {
      await page.locator('.layer-row-fx:has-text("FX 1") .layer-name').first().click();
      await page.waitForTimeout(200);
    }
    await ctx.snap(page, 'fx1-selected');

    ctx.check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  },
};
