// node scripts/assetCounts.mjs [--json]
// #1769 (KINETIC variety S3): the library's counts by family, category and style — the audit S1/S4/S5 cite.
// #1770 (S4): plus the dealable Looks by group.
import { ASSETS } from '../src/data/assets/index.js';
import { getPresetsByGroup } from '../src/data/presets.js';
import { assetRecords, countBy, STYLES } from '../src/data/assetStyle.js';

const records = assetRecords(ASSETS);
const out = {
  assets: records.length,
  family: countBy(records, 'family'),
  category: countBy(records, 'category'),
  style: countBy(records, 'style'),
  looks: Object.fromEntries(getPresetsByGroup().map((g) => [g.label, g.presets.length])),
};
out.lookCount = Object.values(out.looks).reduce((a, b) => a + b, 0);
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`${out.assets} assets`);
  for (const k of ['family', 'category', 'style']) {
    console.log(`\n${k}:`);
    for (const [v, n] of Object.entries(out[k])) console.log(`  ${v.padEnd(14)} ${n}`);
  }
  console.log(`\n${STYLES.length} styles: ${STYLES.join(', ')}`);
  console.log(`\n${out.lookCount} dealable looks:`);
  for (const [g, n] of Object.entries(out.looks)) console.log(`  ${g.padEnd(20)} ${n}`);
}
