// #704 — the chiaroscuro render mode must actually be DARK.
//
// This scenario exists because the parameter selfchecks cannot see light. Every
// one of them passed while the mode rendered as a near-white bloom: sparse,
// large, slow and blendMode 'normal' were all true, and the plate was blown
// out by the glow. The only way to catch that is to render it and measure.
import { decodePng, lumStats } from '../png.mjs';
import { getPreset } from '../../src/data/presets.js';

const ASSETS = ['xsh01', 'xsh04', 'xsh07', 'geo_diamond_01'];

/** Seed the autosave so the app boots straight into a known state. */
function docFor(paletteId, layoutParams) {
  return JSON.stringify({
    version: 1, seed: 424242, autoQuality: false, paletteId,
    layoutParams,
    enabledAssets: Object.fromEntries(ASSETS.map((id) => [id, true])),
  });
}

export default {
  describe: 'Boot into CHIAROSCURO (palette + preset) and measure the rendered plate: it has to stay dark.',
  async run(ctx) {
    const cs = getPreset('chiaroscuro');
    ctx.check('the chiaroscuro preset exists', !!cs);
    if (!cs) return;

    const shoot = async (label, paletteId, params, settleMs = 4500) => {
      const page = await ctx.newPage();
      await page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.evaluate((d) => {
        localStorage.setItem('kc:project:v1', JSON.stringify({
          version: 1, savedAt: new Date().toISOString(), doc: JSON.parse(d),
        }));
      }, docFor(paletteId, params));
      await page.reload({ waitUntil: 'load' });
      await page.locator('.app').waitFor({ timeout: 40_000 });
      await page.waitForTimeout(settleMs);
      const canvas = page.locator('canvas').first();
      const buf = await canvas.screenshot();
      await ctx.snap(page, label, canvas);
      return { stats: lumStats(decodePng(buf)), page };
    };

    // THE MODE. Chiaroscuro is mostly dark with a few things catching light,
    // so most of the plate must be dark and almost none of it near-white.
    const { stats, page } = await shoot('chiaroscuro — the mode', 'chiaroscuro', cs.params);
    ctx.check(`the plate stays dark (mean luminance ${stats.mean})`, stats.mean < 0.20, JSON.stringify(stats));
    ctx.check(`most of the plate is dark (${(stats.darkShare * 100).toFixed(0)}%)`, stats.darkShare > 0.6);
    ctx.check(`almost nothing blows out (${(stats.brightShare * 100).toFixed(1)}% near-white)`, stats.brightShare < 0.05);
    // …but it is not an empty black rectangle: something has to catch the light.
    ctx.check('something is lit', stats.mean > 0.02 && stats.darkShare < 0.99, JSON.stringify(stats));

    // STABLE. Accumulation builds frame over frame; a mode that creeps brighter
    // is unusable over a set even if it looks right at four seconds.
    await page.waitForTimeout(9000);
    const later = lumStats(decodePng(await page.locator('canvas').first().screenshot()));
    ctx.check(`it does not creep brighter over a set (${stats.mean} -> ${later.mean})`,
      later.mean < stats.mean + 0.03, JSON.stringify(later));
    await ctx.snap(page, 'chiaroscuro — after 13s', page.locator('canvas').first());

    // FLAT STAYS THE DEFAULT: the same plate on the stock palette is a
    // different, brighter picture — chiaroscuro is somewhere you go.
    const flat = await shoot('flat default — for contrast', 'praystation',
      { mode: 'fibonacci', count: 240, scale: [0.4, 1.5], noiseSpeed: 0.2 });
    ctx.check(`the default plate is a different picture (mean ${flat.stats.mean})`,
      Math.abs(flat.stats.mean - stats.mean) > 0.02 || flat.stats.brightShare !== stats.brightShare,
      JSON.stringify(flat.stats));
  },
};
