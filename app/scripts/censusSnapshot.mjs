// censusSnapshot.mjs — #1507: write the census artifacts the dev-panel
// readout (panels/CensusPanel.jsx) renders.
//
//   node scripts/censusSnapshot.mjs <outDir> [--keeps <ledger-export.json>]
//
// The readout computes nothing (it is a readout): the numbers are made
// HERE, by the E1 stages' own pure census functions — diceTrayCoverage
// + keepsCoverage (E1a, #1504) and paramCensus + renderReachability
// (E1b, #1505) — and serialized as two small JSON artifacts. Run this
// when the census should be re-measured; the panel just loads the files.
//
// Without --keeps, the keeps cut runs over zero records and the artifact
// says so (the production ledger kc:keeps:v1 is browser-local; hand it
// a hits export — an array of #1140-shaped records — to measure the real
// shelf). Tooling, not a suite: the manifest stays a gate, not a batch job.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diceTrayCoverage, keepsCoverage } from '../src/curator/coverageReport.mjs';
import { paramCensus, renderReachability, jelloCensus } from '../src/curator/censusReport.mjs';
import { COVERAGE_KIND, CENSUS_KIND } from '../src/curator/censusReadout.mjs';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node scripts/censusSnapshot.mjs <outDir> [--keeps <ledger-export.json>]');
  process.exit(2);
}
const keepsAt = process.argv.indexOf('--keeps');
let keepsRecords = [];
let keepsNote = 'keeps corpus EMPTY in this snapshot — no ledger export was handed in (kc:keeps:v1 is browser-local); the keeps cut below spans zero records.';
if (keepsAt >= 0 && process.argv[keepsAt + 1]) {
  const parsed = JSON.parse(readFileSync(process.argv[keepsAt + 1], 'utf8'));
  keepsRecords = Array.isArray(parsed) ? parsed : (parsed.keeps ?? parsed.records ?? []);
  keepsNote = `keeps cut over ${keepsRecords.length} records from the export handed in.`;
}

mkdirSync(outDir, { recursive: true });
const t0 = Date.now();

const coverage = { kind: COVERAGE_KIND, dice: diceTrayCoverage(), keeps: keepsCoverage(keepsRecords), keepsNote };
writeFileSync(join(outDir, 'coverage.json'), JSON.stringify(coverage, null, 2));

const rows = paramCensus();
const reach = renderReachability();
const census = {
  kind: CENSUS_KIND,
  params: {
    total: rows.length,
    moves: rows.filter((r) => r.class === 'moves').length,
    dead: rows.filter((r) => r.class === 'zero-in-context').map((r) => r.key).sort(),
    notHeadless: rows.filter((r) => r.class === 'not-headless').map((r) => r.key).sort(),
    dish: rows.filter((r) => r.class === 'dish-matrix').length,
  },
  reach: {
    assetsMeasured: reach.assets.length,
    assetsUnreached: reach.assetsUnreached.map((r) => r.id ?? r),
    palettesDistinct: reach.palettes.distinct,
    palettesTotal: reach.palettes.rows.length,
    layoutsDistinct: reach.layouts.distinct,
    layoutsTotal: reach.layouts.rows.length,
  },
  jello: jelloCensus(), // #1575 — the Jell-O metric: travelling marks + mean distance from home, per transport
};
writeFileSync(join(outDir, 'census.json'), JSON.stringify(census, null, 2));

console.log(`census snapshot → ${outDir}/coverage.json + census.json (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`  tray: ${coverage.dice.tray.distinct}/${coverage.dice.library.assets} assets reach the tray · ${coverage.dice.tray.neverCount} never`);
console.log(`  params: ${census.params.total} keys · ${census.params.moves} move · ${census.params.dead.length} dead (${census.params.dead.join(', ')})`);
console.log(`  reach: ${census.reach.assetsMeasured - census.reach.assetsUnreached.length}/${census.reach.assetsMeasured} assets draw`);
