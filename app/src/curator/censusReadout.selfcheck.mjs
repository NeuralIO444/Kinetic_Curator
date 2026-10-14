// node src/curator/censusReadout.selfcheck.mjs
//
// Look Explorer E3 (#1507) — the dev-panel census readout suite.
// Matt's scope addition to #1507: the readout renders the E1a/E1b
// census artifacts and NOTHING else — it computes nothing itself.
// Pinned here:
//   - the E1a artifact's zero families (radial, crystalline) light
//     their alarms; the ≤10% tier reads near-zero (the audit's
//     seed-luck lesson, E1a's law);
//   - keeps coverage and the E1b headline pass through reshaped only;
//   - wrong-kind artifacts are refused, never half-rendered;
//   - explorer yield by corner tallies the run's own records;
//   - PURITY: the same artifact yields the identical view twice, and
//     the artifact itself is never mutated (deep-frozen input) — the
//     readout renders identically from the same artifacts on reload
//     because it cannot compute a different answer.
import assert from 'node:assert';

const { coverageView, censusView, yieldByCornerView, alarmFor, COVERAGE_KIND, CENSUS_KIND } = await import('./censusReadout.mjs');
const { diceTrayCoverage, keepsCoverage } = await import('./coverageReport.mjs');

const lines = [];
const deepFreeze = (o) => {
  if (o && typeof o === 'object') { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); }
  return o;
};

// ── fixture artifacts (deterministic; the view logic is what's pinned)
const coverageArtifact = deepFreeze({
  kind: COVERAGE_KIND,
  dice: {
    rolls: 600, seed: 0xA0D17,
    library: { assets: 294, palettes: 37, layouts: 15 },
    tray: { distinct: 208, neverCount: 86, top15Share: 0.42 },
    categories: [
      { name: 'radial', inLibrary: 26, inCandidates: 26, inTray: 0 },
      { name: 'crystalline', inLibrary: 24, inCandidates: 24, inTray: 0 },
      { name: 'grid', inLibrary: 40, inCandidates: 40, inTray: 31 },
      { name: 'speck', inLibrary: 30, inCandidates: 29, inTray: 1 },
    ],
    packs: [{ name: 'haeckel', inLibrary: 26, inCandidates: 26, inTray: 1 }],
    layouts: [{ layout: 'radial', trios: 3 }, { layout: 'grid', trios: 210 }],
    layoutsReached: 14,
  },
  keeps: {
    keeps: 9, withCast: 8, castless: 1, unknownIds: 0,
    categories: [{ name: 'grid', keeps: 5 }], distinctCategories: 3,
    palettes: [{ name: 'hydra', keeps: 2 }], distinctPalettes: 4,
    layouts: [{ name: 'grid', keeps: 6 }], distinctLayouts: 2,
  },
  keepsNote: 'fixture note',
});

{
  const v = coverageView(coverageArtifact);
  assert.ok(v, 'a coverage artifact renders');
  const byName = new Map(v.categories.map((r) => [r.name, r]));
  assert.strictEqual(byName.get('radial').alarm, 'zero', 'radial at 0 lights the zero alarm');
  assert.strictEqual(byName.get('crystalline').alarm, 'zero', 'crystalline at 0 lights the zero alarm');
  assert.strictEqual(byName.get('speck').alarm, 'low', '≤10% reads near-zero, not zero');
  assert.strictEqual(byName.get('grid').alarm, null, 'a healthy family lights nothing');
  assert.deepStrictEqual(v.alarms.map((a) => a.name).sort(), ['crystalline', 'haeckel', 'radial', 'speck'], 'the alarm roll-up spans categories and packs');
  assert.strictEqual(v.trayDistinct, 208);
  assert.strictEqual(v.trayNever, 86);
  assert.strictEqual(v.keeps.total, 9);
  assert.strictEqual(v.keepsNote, 'fixture note');
  assert.strictEqual(alarmFor(0, 10), 'zero');
  assert.strictEqual(alarmFor(1, 10), 'low', 'exactly 10% is the near-zero tier boundary');
  assert.strictEqual(alarmFor(2, 10), null);
  assert.strictEqual(alarmFor(0, 0), null, 'an empty family is no alarm (nothing to miss)');
  lines.push('alarms: radial + crystalline ZERO lit; speck near-zero at ≤10%; healthy families dark');
}

{
  const a = coverageView(coverageArtifact);
  const b = coverageView(coverageArtifact);
  assert.deepStrictEqual(a, b, 'the same artifact renders the identical view on reload');
  lines.push('purity: deep-frozen artifact, two renders deep-equal — the readout computes nothing');
}

{
  assert.strictEqual(coverageView({ kind: 'something-else' }), null, 'a wrong-kind artifact is refused');
  assert.strictEqual(coverageView(null), null);
  assert.strictEqual(censusView(coverageArtifact), null, 'a coverage artifact is not a census artifact');
  const censusArtifact = deepFreeze({
    kind: CENSUS_KIND,
    params: { total: 105, moves: 60, dead: ['brushWidth', 'material'], notHeadless: ['dishO2'], dish: 10 },
    reach: { assetsMeasured: 294, assetsUnreached: [], palettesDistinct: 37, palettesTotal: 37, layoutsDistinct: 12, layoutsTotal: 15 },
  });
  const v = censusView(censusArtifact);
  assert.deepStrictEqual(v.params.dead, ['brushWidth', 'material'], 'the dead list passes through');
  assert.strictEqual(v.reach.assetsMeasured, 294);
  lines.push('kinds: artifacts are sniffed by kind; the E1b headline (dead list, reach) passes through reshaped only');
}

{
  const prov = (corner) => ({ provenance: { source: 'explorer', run: 'r', corner } });
  const y = yieldByCornerView({
    candidates: [
      { corner: 'haeckel' }, { corner: 'haeckel' }, { corner: 'haeckel' },
      { corner: 'reas' }, { corner: 'reas' },
    ],
    finalists: [{ ...prov('haeckel') }, { seed: 1 }],
  });
  const byCorner = new Map(y.rows.map((r) => [r.corner, r]));
  assert.strictEqual(byCorner.get('haeckel').candidates, 3);
  assert.strictEqual(byCorner.get('haeckel').finalists, 1);
  assert.strictEqual(byCorner.get('reas').finalists, 0);
  assert.strictEqual(byCorner.get('wilderness').finalists, 1, 'a cornerless finalist tallies as wilderness');
  assert.strictEqual(y.totalCandidates, 5);
  assert.strictEqual(y.totalFinalists, 2);
  assert.strictEqual(byCorner.get('haeckel').label, 'SPECIMEN', 'corner labels are the TE aliases');
  lines.push('yield: candidates/finalists tallied per corner from the run\'s own records; aliases only');
}

// ── the real E1a artifact, end to end ────────────────────────────────
{
  const dice = diceTrayCoverage();
  const v = coverageView({ kind: COVERAGE_KIND, dice, keeps: keepsCoverage([]), keepsNote: null });
  assert.ok(v, 'the real E1a coverage renders');
  for (const row of [...v.categories, ...v.packs]) {
    assert.strictEqual(row.alarm, alarmFor(row.inTray, row.inLibrary), `alarm consistency for ${row.name}`);
  }
  const radial = v.categories.find((r) => r.name === 'radial');
  assert.ok(radial && radial.inLibrary === 26, 'radial is in the readout with its library size');
  lines.push(`real artifact: E1a coverage renders (tray ${v.trayDistinct}/${v.library.assets}, radial tray ${radial.inTray}/${radial.inLibrary}); every alarm consistent`);
}

console.log('censusReadout.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('censusReadout.selfcheck: PASS');
