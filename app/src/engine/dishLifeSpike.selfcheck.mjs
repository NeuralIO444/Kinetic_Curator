// dishLifeSpike.selfcheck.mjs — DISH LIFE slice 2 (#1923): the evidence spike, held as a regression.
//
// Runs the culture over every COMPOSITION_PRESET (real compositions) and holds the issue's feel acceptance:
//   - no instant boil, no instant death: the interesting window runs >= 30 generations on typical takes
//   - the pickup is recognisably the performer's scene (IoU of the seed with the culture at generation 3)
// and pins WHY the rule is not raw Conway: on the same compositions Conway fails the same bar.
// If someone retunes the rule, the band or the footprint and this drops, the spike script
// (node scripts/dishLifeSpike.mjs) says where.
import assert from 'node:assert/strict';
import { spike } from '../../scripts/dishLifeSpike.mjs';
import { CULTURE_RULE, DEFAULT_RULE } from './dishLife.mjs';

const GENS = 60;
const rows = spike({ seeds: 1, gens: GENS, rule: CULTURE_RULE });
assert.ok(rows.length >= 60, `the spike covers the preset spread (${rows.length} runs)`);
const ok30 = rows.filter((r) => r.window >= 30).length / rows.length;
assert.ok(
  ok30 >= 0.95,
  `>=95% of compositions stay interesting for >=30 generations (got ${(ok30 * 100).toFixed(0)}%)`,
);
assert.ok(
  rows.every((r) => r.window >= 12),
  'no composition dies or boils inside the first 12 generations',
);
const reco = rows.map((r) => r.reco).sort((a, b) => a - b);
assert.ok(
  reco[Math.floor(reco.length * 0.1)] >= 0.4,
  `p10 recognisability at generation 3 >= 0.4 (got ${reco[Math.floor(reco.length * 0.1)]})`,
);
assert.ok(reco[Math.floor(reco.length / 2)] >= 0.5, 'median recognisability at generation 3 >= 0.5');
const sparseRuns = rows.filter((r) => r.clamp === 'sparse').length;
assert.ok(sparseRuns / rows.length < 0.15, `few presets are too sparse to seed (${sparseRuns}/${rows.length})`);

// the reason the culture rule exists: raw Conway on the same compositions fails the same bar
const conway = spike({ seeds: 1, gens: GENS, rule: DEFAULT_RULE });
const conway30 = conway.filter((r) => r.window >= 30).length / conway.length;
assert.ok(conway30 < 0.5, `raw Conway must fail the bar this rule passes (got ${(conway30 * 100).toFixed(0)}%)`);
console.log('dishLifeSpike.selfcheck: ok');
