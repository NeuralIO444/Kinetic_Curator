// #601/#629 — the palette-import toast reports what the store keeps. The message renders
// far below the ↑ PALETTES button, so this scenario screenshots the message itself.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pal = (id, name, sw) => ({ ...(id ? { id } : {}), name, bg: '#101010', ink: '#eeeeee', swatches: sw });
const CASES = [
  ['all junk', [null, 3, 'x', { swatches: [] }, { swatches: ['nope'] }], 'No valid palettes in file'],
  ['two valid, with ids', [pal('qa-a', 'A', ['#ff0000', '#00ff00']), pal('qa-b', 'B', ['#ffaa00', '#00aaff'])], 'Imported 2 palettes'],
  ['one valid + junk', [pal('qa-c', 'C', ['#123456', '#654321']), null, { swatches: [] }], 'Imported 1 palette'],
  // Known #628: id-less palettes collide on user-<Date.now()>, the store keeps one — the toast says so.
  ['three valid, no ids (#628)', [pal(null, '1', ['#ff0000']), pal(null, '2', ['#00ff00']), pal(null, '3', ['#0000ff'])], 'Imported 1 palette'],
];

export default {
  describe: 'Import palette JSON files through ↑ PALETTES and read the toast (the message sits near the bottom of the PIPELINE panel).',
  async run(ctx) {
    const dir = mkdtempSync(join(tmpdir(), 'kc-qa-'));
    for (const [i, [label, data, expected]] of CASES.entries()) {
      const page = await ctx.newPage();                                    // fresh profile per case
      const file = join(dir, `case-${i}.json`);
      writeFileSync(file, JSON.stringify(data));
      await ctx.openApp(page);
      await ctx.tab(page, /pipeline/i);
      await page.locator('.panel-pipeline').waitFor({ timeout: 10_000 });
      // ↑ PALETTES (import) is the input that follows its button; ↑ IMPORT is the PROJECT loader.
      await page.locator('button:has-text("↑ PALETTES") ~ input[type=file]').setInputFiles(file);
      const hint = page.locator('.pipeline-hint', { hasText: /palette/i });
      await hint.first().waitFor({ timeout: 5_000 }).catch(() => {});
      const got = (await hint.allInnerTexts())[0] ?? '(no message rendered)';
      ctx.check(`${label} → "${expected}"`, got === expected, `got: ${got}`);
      if (await hint.count()) await ctx.snap(page, `${label} — the toast`, hint.first());
    }
  },
};
