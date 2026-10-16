// node src/gl/parity/costDataset.selfcheck.mjs — #1578 harness slice:
// the dataset contract, the label math, and the corpus's determinism.
// Pure (no browser): the bench's measured runs are gated by validateDataset
// at write time; this suite pins the rules that gate applies.
import assert from 'node:assert';
import {
  COST_DATASET_KIND, COST_DATASET_VERSION, LABEL_DEFINITION,
  summarizeFrames, labelFromReps, validateDataset, percentile, median,
} from './costDataset.mjs';
import { COST_CORPUS, getCostScene, castIdsOf } from './costCorpus.mjs';
import { costFeatures } from '../../hooks/costHead.mjs';

// — statistics: nearest-rank percentiles + the label definition —
const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
assert.strictEqual(percentile(ten, 50), 5);
assert.strictEqual(percentile(ten, 90), 9);
assert.strictEqual(percentile(ten, 99), 10);
assert.strictEqual(median([3, 1, 2]), 2);
assert.strictEqual(median([1, 2, 3, 4]), 2.5);
const sum = summarizeFrames([10, 20, 30, 40]);
assert.deepStrictEqual(
  { n: sum.n, mean: sum.mean, p50: sum.p50, p90: sum.p90, max: sum.max },
  { n: 4, mean: 25, p50: 20, p90: 40, max: 40 },
);
assert.strictEqual(summarizeFrames([]), null);
assert.strictEqual(summarizeFrames([NaN, -1]), null, 'junk samples are not data');
assert.strictEqual(
  labelFromReps([{ p90: 10 }, { p90: 30 }, { p90: 20 }]), 20,
  'label = median of rep p90s',
);
assert.strictEqual(labelFromReps([]), null);

// — corpus: unique ids, JSON-safe docs (they ride into the artifact),
//   lifeDrift pinned + accumulation off (the documented v1 gap) —
const ids = COST_CORPUS.map((s) => s.id);
assert.strictEqual(new Set(ids).size, ids.length, 'corpus ids are unique');
assert.ok(COST_CORPUS.length >= 20, `corpus has ${COST_CORPUS.length} recipes`);
for (const scene of COST_CORPUS) {
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(scene.doc)), scene.doc,
    `${scene.id}: doc must survive a JSON round-trip unchanged`,
  );
  if (scene.id.startsWith('grid-')) {
    assert.strictEqual(scene.doc.layoutParams.lifeDrift, 0, `${scene.id}: lifeDrift pinned`);
    assert.strictEqual(scene.doc.layoutParams.accumulation, false, `${scene.id}: accum is the documented v1 gap`);
  }
}
assert.strictEqual(getCostScene('grid-base').id, 'grid-base');
assert.throws(() => getCostScene('nope'), /unknown recipe/);
assert.deepStrictEqual(castIdsOf(getCostScene('grid-cast-4').doc).length, 4);
assert.deepStrictEqual(castIdsOf(getCostScene('grid-cast-24').doc).length, 24);

// — feature pairing: every corpus doc yields a complete, finite vector —
const probes = { fillRate: 12.5, instanced: 3.25, blend: 8.75, js: 21 };
for (const scene of COST_CORPUS) {
  const f = costFeatures({
    layoutParams: scene.doc.layoutParams,
    paletteId: scene.doc.paletteId,
    assets: castIdsOf(scene.doc),
    canvas: { w: 1280, h: 720 },
    probes,
  });
  assert.ok(f.num && Object.keys(f.num).length > 0, `${scene.id}: num bag`);
  for (const [k, v] of Object.entries(f.num)) assert.ok(Number.isFinite(v), `${scene.id}: num.${k} finite`);
  for (const [k, v] of Object.entries(f.mech)) assert.ok(Number.isFinite(v), `${scene.id}: mech.${k} finite`);
  assert.deepStrictEqual(f.probe, probes, `${scene.id}: probe bag rides through verbatim`);
  assert.strictEqual(f.v, 4, `${scene.id}: recipeFeatures v4`);
}

// — dataset validation: a well-formed artifact passes; broken ones don't —
function minimalDataset() {
  const scene = getCostScene('grid-base');
  const reps = [summarizeFrames([10, 12, 11, 13, 90]), summarizeFrames([11, 12, 10, 14, 88])];
  return {
    kind: COST_DATASET_KIND,
    version: COST_DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    generator: { script: 'test', gitSha: null, node: process.version },
    environment: { renderer: 'Test GPU', swiftShader: false },
    method: { label: LABEL_DEFINITION },
    rows: [{
      id: scene.id, status: 'measured', doc: scene.doc,
      features: costFeatures({
        layoutParams: scene.doc.layoutParams, paletteId: scene.doc.paletteId,
        assets: castIdsOf(scene.doc), canvas: { w: 1280, h: 720 }, probes,
      }),
      canvas: { w: 1280, h: 720 },
      reps, labelMs: labelFromReps(reps),
    }],
  };
}
const good = minimalDataset();
assert.deepStrictEqual(validateDataset(good), { ok: true, errors: [] });

const wrongKind = { ...good, kind: 'something-else' };
assert.strictEqual(validateDataset(wrongKind).ok, false, 'kind is gated');

const wrongLabel = JSON.parse(JSON.stringify(good));
wrongLabel.rows[0].labelMs += 5;
assert.strictEqual(validateDataset(wrongLabel).ok, false, 'label must equal median-of-p90 of its reps');

const bareFailed = minimalDataset();
bareFailed.rows[0] = { id: 'x', status: 'failed', doc: {}, features: bareFailed.rows[0].features, canvas: { w: 1, h: 1 } };
assert.strictEqual(validateDataset(bareFailed).ok, false, 'a failed row must carry its error');

const noProbe = JSON.parse(JSON.stringify(good));
delete noProbe.rows[0].features.probe.js;
assert.strictEqual(validateDataset(noProbe).ok, false, 'probe descriptors are part of the vector');

console.log(`costDataset.selfcheck: OK (${COST_CORPUS.length} corpus recipes, dataset v${COST_DATASET_VERSION} contract pinned)`);
