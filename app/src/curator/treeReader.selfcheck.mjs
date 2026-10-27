// node src/curator/treeReader.selfcheck.mjs — XGBoost T3: "read the model".
// The dev-panel tree reader reshapes the VALIDATED head (never the raw
// file) into the trainer inspect's own text. Every number below is
// hand-computed from the fixture's shape.
import assert from 'node:assert';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
};
const { validateTaste, XGB_HEAD_KIND } = await import('./tasteHead.js');
const { treeHeadView } = await import('./treeReader.mjs');
const { FEATURES_VERSION } = await import('./recipeFeatures.js');

// ── absent states say so plainly ─────────────────────────────────────────
assert.deepStrictEqual(treeHeadView(null), { present: false, reason: 'no taste loaded' });
const linear = validateTaste({
  kind: 'kc-taste',
  version: 1,
  featuresVersion: FEATURES_VERSION,
  model: 'm',
  dims: 1152,
  labels: { likes: 42, passes: 180 },
  head: { terms: { 'scale=large': 1.5 }, num: {}, bias: 0.1, fidelity: 0.71, fitOn: 222 },
}).taste;
assert.deepStrictEqual(treeHeadView(linear), { present: false, reason: 'taste has no tree head (linear head)' });

// ── the fixture ensemble (same shape as the tasteHead T3 fixture) ────────
// T1 gain 18 (12+6), T2 gain 13 (9+4), T3 gain 10 (7+3), T4 gain 1.
// Nodes 5+5+5+3 = 18; deepest leaves sit at depth 2.
const rich = validateTaste({
  kind: 'kc-taste',
  version: 1,
  featuresVersion: FEATURES_VERSION,
  model: 'm',
  dims: 1152,
  labels: { likes: 42, passes: 180 },
  head: {
    kind: XGB_HEAD_KIND,
    objective: 'binary:logistic',
    baseScore: -0.2,
    fidelity: 0.9,
    fitOn: 400,
    features: ['density', 'scale', 'bodies', 'num.count', 'num.scaleMid', 'mirror', 'system'],
    trees: [
      {
        f: 0,
        op: '=',
        v: 'high',
        gain: 12,
        y: { f: 4, op: '<', v: 0.45, gain: 6, y: { leaf: 0.9 }, n: { leaf: 0.2 } },
        n: { leaf: -0.6 },
      },
      {
        f: 2,
        op: '=',
        v: 'dense',
        gain: 9,
        y: { leaf: 0.8 },
        n: { f: 1, op: '=', v: 'small', gain: 4, y: { leaf: -0.7 }, n: { leaf: 0.1 } },
      },
      {
        f: 5,
        op: '=',
        v: true,
        gain: 7,
        y: { f: 3, op: '<', v: 0.3, gain: 3, y: { leaf: 0.5 }, n: { leaf: 0 } },
        n: { leaf: -0.2 },
      },
      { f: 0, op: '=', v: 'low', gain: 1, y: { leaf: -0.4 }, n: { leaf: 0.05 } },
    ],
  },
}).taste;

const view = treeHeadView(rich);
assert.strictEqual(view.present, true);
assert.strictEqual(view.treeCount, 4);
assert.strictEqual(view.maxDepth, 2, 'deepest leaf at depth 2 (spec_head_stats convention)');
assert.strictEqual(view.nodeCount, 18);
assert.strictEqual(view.fidelity, 0.9);
assert.strictEqual(view.steering, true, 'at the bar: steering');
// strongest by TOTAL split gain per feature: density appears in two trees
assert.deepStrictEqual(view.strongest, [
  { feature: 'density', gain: 13 },
  { feature: 'bodies', gain: 9 },
  { feature: 'mirror', gain: 7 },
  { feature: 'num.scaleMid', gain: 6 },
  { feature: 'scale', gain: 4 },
]);
// the text is the trainer inspect's text (describe_trees / _format_spec_tree)
assert.strictEqual(view.lines[0], 'xgboost trees · 4 trees, depth <= 2, 18 nodes');
assert.strictEqual(
  view.lines[1],
  'strongest features: density (gain 13), bodies (gain 9), mirror (gain 7), num.scaleMid (gain 6), scale (gain 4)',
);
assert.deepStrictEqual(
  view.lines.slice(2, 10),
  [
    'tree 0 (total gain 18):',
    'if density = high (high density)  [gain 12]',
    '  if num.scaleMid < 0.45  [gain 6]',
    '    -> +0.9000',
    '  else',
    '    -> +0.2000',
    'else',
    '  -> -0.6000',
  ],
  'the top tree by total gain, formatted line for line',
);
assert.ok(view.lines.includes('tree 1 (total gain 13):'), 'second-strongest tree follows');
assert.ok(view.lines.includes('tree 2 (total gain 10):'), 'third-strongest tree follows');
assert.ok(!view.lines.some((l) => l.startsWith('tree 3')), 'only the top three trees print');
// a boolean split describes with the boolean's words
assert.ok(view.lines.includes('if mirror = true (mirrored)  [gain 7]'), 'bool split reads in words');
// below the bar the head still reads — and says it is not steering
const thin = { ...rich, head: { ...rich.head, fidelity: 0.1 } };
const thinView = treeHeadView(thin);
assert.strictEqual(thinView.present, true);
assert.strictEqual(thinView.steering, false, 'below the bar: readable, not steering');

console.log('treeReader.selfcheck: OK');
