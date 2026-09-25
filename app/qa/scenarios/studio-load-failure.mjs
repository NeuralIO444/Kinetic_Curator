// #601/#629 — a failed lazy import of the Asset Studio says so, and (Chrome caches a failed
// dynamic import per URL) a same-page retry cannot succeed; only a reload recovers.
export default {
  describe: 'Block the AssetStudioModal chunk, click NEW, then retry and reload.',
  async run(ctx) {
    const page = await ctx.newPage();
    let blocking = true;
    let requests = 0;
    await page.route('**/AssetStudioModal*', (r) => { requests++; blocking ? r.abort() : r.continue(); });
    await ctx.openApp(page);
    await ctx.tab(page, /assets/i);
    const NEW = page.getByRole('button', { name: 'NEW', exact: true });
    const modal = page.locator('text=ASSET STUDIO');
    const banner = page.getByText(/STUDIO failed to load/);

    await NEW.click();
    await page.waitForTimeout(800);
    ctx.check('blocked chunk → red banner appears', (await banner.count()) > 0);
    ctx.check('…and tells the user to reload', /reload the page/i.test((await banner.first().innerText().catch(() => '')) || ''));
    ctx.check('…and no modal opened', (await modal.count()) === 0);
    await ctx.snap(page, 'banner after the failed load', page.locator('.panel-assets, .panel').first());

    blocking = false;
    const before = requests;
    await NEW.click();
    await page.waitForTimeout(1200);
    ctx.check('same-page retry makes no network request (browser replays the cached failure)', requests === before, `new requests: ${requests - before}`);
    ctx.check('same-page retry still shows the banner', (await banner.count()) > 0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.app').waitFor({ timeout: 30_000 });
    await ctx.tab(page, /assets/i);
    await page.getByRole('button', { name: 'NEW', exact: true }).click();
    await modal.first().waitFor({ timeout: 10_000 }).catch(() => {});
    ctx.check('after a reload the Studio opens', (await modal.count()) > 0);
    ctx.check('…and no banner is left', (await page.getByText(/STUDIO failed to load/).count()) === 0);
    await ctx.snap(page, 'Studio open after the reload');
  },
};
