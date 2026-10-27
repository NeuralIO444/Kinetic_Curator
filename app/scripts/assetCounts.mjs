// node scripts/assetCounts.mjs [--json]
// #1769 (KINETIC variety S3): the library's counts by family, category and style — the audit S1/S4/S5 cite.
import { ASSETS } from '../src/data/assets/index.js';
import { assetRecords, countBy, STYLES } from '../src/data/assetStyle.js';

const records = assetRecords(ASSETS);
const out = {
  assets: records.length,
  family: countBy(records, 'family'),
  category: countBy(records, 'category'),
  style: countBy(records, 'style'),
};
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`${out.assets} assets`);
  for (const k of ['family', 'category', 'style']) {
    console.log(`\n${k}:`);
    for (const [v, n] of Object.entries(out[k])) console.log(`  ${v.padEnd(14)} ${n}`);
  }
  console.log(`\n${STYLES.length} styles: ${STYLES.join(', ')}`);
}
