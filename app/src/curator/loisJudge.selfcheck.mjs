// loisJudge.selfcheck.mjs — #1508 (Look Explorer E4): LOIS judges
// renders. Synthetic bakes (measured-stat fixtures) prove the gates:
// each rejection names its failed check, the verdict is a pure
// function of its evidence, font-contingent casts are judged on the
// ink a viewer sees, and a verdict-ledger row is mechanically
// distinguishable from a human taste-ledger line.
import assert from 'node:assert/strict';
import { judgeRender, loisVerdictRow, LOIS_JUDGE_ID } from './loisJudge.mjs';
import { isLedgerRow } from './tasteLedger.js';

const stats = ({ ink = 0.2, inkF = null, mean = 0.45, spread = 0.5 } = {}) => ({
  inkCoverage: ink,
  inkCoverageWithFonts: inkF ?? ink,
  paletteHistogram: [],
  hueHistogram: new Array(12).fill(0),
  luminance: { mean, p10: 0.1, p90: 0.1 + spread, spread },
});
const feats = (density = 'mid') => ({ density });
const failedKeys = (v) => v.checks.filter((c) => !c.ok).map((c) => c.key);

// a healthy render: ink present, contrast real, exposure sane → keep
const healthy = judgeRender({ features: feats(), stats: stats(), fingerprint: 'fp1' });
assert.strictEqual(healthy.verdict, 'keep', 'a healthy render is kept');
assert.deepStrictEqual(failedKeys(healthy), [], 'no failed checks on a keep');
assert.strictEqual(healthy.judge, 'lois-render', 'the verdict names its judge');
assert.strictEqual(healthy.statsProvenance.fingerprint, 'fp1', 'the verdict binds to the bake fingerprint');
assert.strictEqual(healthy.statsProvenance.judgedInk, 'font-less', 'a plain cast is judged on the primary ink');

// an empty frame → pass, on presence
const empty = judgeRender({ features: feats(), stats: stats({ ink: 0 }) });
assert.strictEqual(empty.verdict, 'pass', 'an empty frame is passed');
assert.ok(failedKeys(empty).includes('presence'), 'presence is the named failure');

// a solid wall → pass, on presence
const wall = judgeRender({ features: feats(), stats: stats({ ink: 0.95 }) });
assert.strictEqual(wall.verdict, 'pass', 'a solid wall is passed');
assert.ok(failedKeys(wall).includes('presence'), 'presence caps the wall too');

// a flat field → pass, on contrast
const flat = judgeRender({ features: feats(), stats: stats({ spread: 0.02 }) });
assert.strictEqual(flat.verdict, 'pass', 'a flat field is passed');
assert.deepStrictEqual(failedKeys(flat), ['contrast'], 'contrast is the only failure');

// a blown exposure → pass, on exposure
const blown = judgeRender({ features: feats(), stats: stats({ mean: 0.99 }) });
assert.strictEqual(blown.verdict, 'pass', 'a blown frame is passed');
assert.ok(failedKeys(blown).includes('exposure'), 'exposure is the named failure');

// the promise: a high-density recipe that drew almost nothing → pass
const brokeHigh = judgeRender({ features: feats('high'), stats: stats({ ink: 0.02 }) });
assert.strictEqual(brokeHigh.verdict, 'pass', 'a broken promise is passed');
assert.deepStrictEqual(failedKeys(brokeHigh), ['promise'], 'promise is the only failure');
// and a low-density recipe that walled the frame → pass
const brokeLow = judgeRender({ features: feats('low'), stats: stats({ ink: 0.7 }) });
assert.strictEqual(brokeLow.verdict, 'pass', 'an over-filled whisper is passed');
assert.ok(failedKeys(brokeLow).includes('promise'), 'promise names the over-fill');
// mid density makes no promise
assert.strictEqual(
  judgeRender({ features: feats('mid'), stats: stats({ ink: 0.02 }) }).verdict,
  'keep',
  'mid density is held to presence/contrast/exposure only',
);

// font-contingent cast: font-less ink reads blank (E1b F2), but LOIS
// judges the ink a viewer sees — with-fonts — and records the basis
const stampy = judgeRender({
  features: feats(),
  stats: stats({ ink: 0, inkF: 0.2 }),
  fingerprint: 'fp2',
  fontContingent: true,
});
assert.strictEqual(stampy.verdict, 'keep', 'a stamp cast that draws with fonts is judged on that ink');
assert.strictEqual(stampy.statsProvenance.judgedInk, 'with-fonts', 'the basis is recorded');
assert.strictEqual(stampy.statsProvenance.inkCoverage, 0, 'the font-less figure is still on the record');
assert.strictEqual(stampy.statsProvenance.fontContingent, true, 'the contingency is on the record');

// determinism: same evidence, same verdict, byte for byte
assert.deepStrictEqual(
  judgeRender({ features: feats('high'), stats: stats({ ink: 0.02 }), fingerprint: 'fpX' }),
  judgeRender({ features: feats('high'), stats: stats({ ink: 0.02 }), fingerprint: 'fpX' }),
  'the verdict is a pure function of the measured bake',
);

// ── the verdict ledger row: his, provenanced, and NOT a human line ──
const finalist = {
  record: {
    seed: 4242,
    config: {
      layout: { mode: 'grid', count: 40 },
      palette: { id: 'hydra' },
      assets: ['a1', 'a2'],
    },
    provenance: {
      source: 'explorer',
      run: 'xpl-test',
      corner: 'haeckel',
      axes: { layout: 'grid', palette: 'hydra', castSize: 2 },
    },
  },
  loisVerdict: healthy,
};
const row = loisVerdictRow('xpl-test', finalist);
assert.strictEqual(row.judge, LOIS_JUDGE_ID, 'the row names the judge (lois-render-v1)');
assert.notStrictEqual(row.judge, 'persona-v1', 'distinguishable from dice-scorer judgments');
assert.strictEqual(row.verdict, 'keep', 'the row carries the verdict');
assert.strictEqual(row.provenance.corner, 'haeckel', 'the row carries provenance (run + corner)');
assert.strictEqual(row.statsProvenance.fingerprint, 'fp1', 'the row carries the judged stats');
assert.ok(!('timestamp' in row), 'no timestamp is invented — no artist pressed a key');
assert.strictEqual(
  isLedgerRow(row),
  false,
  'a LOIS row is NOT a human taste-ledger line (the schema itself refuses it)',
);
assert.strictEqual(
  loisVerdictRow('xpl-test', { record: {}, loisVerdict: null }),
  null,
  'an unjudged finalist writes no row',
);

console.log(
  'loisJudge.selfcheck: OK (#1508 — gates name their failures, verdict is a pure function of the bake, font-contingent casts judged on seen ink, verdict rows judge-marked and ledger-distinct)',
);
