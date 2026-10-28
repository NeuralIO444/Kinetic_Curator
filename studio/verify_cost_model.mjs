// verify_cost_model — the node-side gate for a trained cost head (#1578).
//
// Loads a cost-head artifact and proves it through the REAL evaluator
// (app/src/hooks/costHead.mjs), not a mirror:
//   (a) validateCostModel(raw).ok === true;
//   (b) predictMs returns a finite positive number for every measured
//       row's features;
//   (c) those predictions match the trainer's reported in-sample
//       predictions (studio/cost-head-report.json, computed in Python by
//       walking the same exported JSON) within the stated tolerance —
//       the Python export and the JS walk must agree, or the artifact
//       the app ships is not the model the trainer measured.
// With --dataset, the report's rows are additionally cross-checked
// against the kc-cost-dataset itself (ids, labelMs, and the
// evaluator-visible feature projection) so a stale report cannot pass.
//
//   node studio/verify_cost_model.mjs [--model studio/cost-head-model.json]
//       [--report studio/cost-head-report.json] [--dataset <kc-cost-dataset.json>]
//       [--tol 1e-6]
//
// Defaults resolve next to this script, so it runs from any cwd. Exit 0
// = pass; exit 1 = a named failure.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { predictMs, validateCostModel } from '../app/src/hooks/costHead.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const modelPath = opt('--model', join(HERE, 'cost-head-model.json'));
const reportPath = opt('--report', join(HERE, 'cost-head-report.json'));
const datasetPath = opt('--dataset', null);
const TOL = Number(opt('--tol', '1e-6')); // relative; report stores 6 dp

const fail = (msg) => {
  console.error(`verify_cost_model: FAIL — ${msg}`);
  process.exit(1);
};
const readJson = (p, what) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`cannot read ${what} at ${p}: ${e.message}`);
  }
};

// The evaluator-visible projection of a feature bag — mirrors
// train_cost_head.project_bag: top-level string/boolean scalars plus the
// num/mech/probe blocks. Everything costHead can ever read.
const NUMERIC_BLOCKS = ['num', 'mech', 'probe'];
function projectBag(bag) {
  const out = {};
  for (const [k, v] of Object.entries(bag || {})) {
    if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  for (const b of NUMERIC_BLOCKS) {
    if (bag && typeof bag[b] === 'object' && bag[b] !== null) out[b] = bag[b];
  }
  return out;
}
const canonical = (x) =>
  JSON.stringify(x, (k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

const raw = readJson(modelPath, 'model artifact');
const report = readJson(reportPath, 'trainer report');

// (a) the artifact validates through the real evaluator
const v = validateCostModel(raw);
if (!v.ok) fail(`validateCostModel: ${v.error}`);
const model = v.model;
if (Math.abs(model.calibration - (report.model?.calibration ?? NaN)) > 1e-9) {
  fail(`calibration mismatch: artifact ${model.calibration} vs report ${report.model?.calibration}`);
}

const rows = report.rows;
if (!Array.isArray(rows) || !rows.length) fail('report carries no rows');

// optional cross-check against the dataset the report claims to describe
let datasetRows = null;
if (datasetPath) {
  const ds = readJson(datasetPath, 'dataset');
  datasetRows = new Map();
  for (const r of ds.rows || []) {
    if (r.status === 'measured' && typeof r.labelMs === 'number') datasetRows.set(r.id, r);
  }
}

let maxRel = 0;
for (const row of rows) {
  if (typeof row.inSamplePredMs !== 'number') fail(`row ${row.id}: no inSamplePredMs in report`);
  let features = row.features;
  if (datasetRows) {
    const d = datasetRows.get(row.id);
    if (!d) fail(`row ${row.id}: not a measured row in ${datasetPath}`);
    if (d.labelMs !== row.labelMs) fail(`row ${row.id}: labelMs ${row.labelMs} != dataset ${d.labelMs}`);
    if (canonical(projectBag(d.features)) !== canonical(projectBag(features))) {
      fail(`row ${row.id}: report features do not match the dataset's`);
    }
    features = d.features;
  }
  // (b) + (c): the real evaluator predicts, finitely, and agrees
  const p = predictMs(model, features);
  if (p === null || !Number.isFinite(p) || p <= 0) {
    fail(`row ${row.id}: predictMs returned ${p}`);
  }
  const rel = Math.abs(p - row.inSamplePredMs) / row.inSamplePredMs;
  if (rel > maxRel) maxRel = rel;
  if (rel > TOL) {
    fail(`row ${row.id}: predictMs ${p} vs trainer in-sample ${row.inSamplePredMs} (rel ${rel} > ${TOL})`);
  }
}

console.log(
  `verify_cost_model: OK — ${model.trees.length} trees, ${rows.length} rows predicted, ` +
    `max rel diff vs trainer ${maxRel.toExponential(2)} (tol ${TOL})` +
    (datasetRows ? `, cross-checked against ${datasetPath}` : ''),
);
