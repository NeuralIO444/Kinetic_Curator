// node src/curator/tasteHead.selfcheck.mjs — #762 the app side of Taste v1.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
};
const {
  featureTerms,
  validateTaste,
  scoreLayout,
  scoreTreeHead,
  makeMlxCurator,
  makeXgbScorer,
  tasteSummary,
  scoreBoldness,
  loisSummary,
  HEAD_MIN_FIDELITY,
  XGB_HEAD_KIND,
  treeFeatureNames,
  retrainNudge,
  dismissRetrainNudge,
  clearRetrainNudge,
  RETRAIN_NUDGE_THRESHOLD,
  RETRAIN_NUDGE_KEY,
} = await import('./tasteHead.js');
const { importTaste, clearTaste, getTaste, TASTE_KEY } = await import('./tasteStore.js');
const { getActiveCurator, curatorHint, pickCurated } = await import('./curate.js');
const { FEATURES_VERSION } = await import('./recipeFeatures.js');

// ── the term rule matches the fixture studio/curator.py also asserts ──────
const here = dirname(fileURLToPath(import.meta.url));
for (const c of JSON.parse(readFileSync(join(here, 'tasteTerms.fixture.json'), 'utf8')).cases) {
  assert.deepStrictEqual(featureTerms(c.features), c.terms);
}

// ── a synthetic taste: loves large marks, hates many of them ──────────────
const taste = () => ({
  kind: 'kc-taste',
  version: 1,
  featuresVersion: FEATURES_VERSION,
  model: 'm',
  dims: 1152,
  probe: { weights: new Array(1152).fill(0.001), bias: 0 },
  labels: { likes: 42, passes: 180 },
  trainedAt: '2026-09-30T00:00:00Z',
  head: {
    terms: { 'scale=large': 1.5, 'scale=small': -1.5 },
    num: { count: -2 },
    bias: 0.1,
    fidelity: 0.71,
    fitOn: 222,
  },
});

// ── validator: fail-closed, keeps only what the app needs ─────────────────
const ok = validateTaste(taste());
assert.ok(ok.ok);
assert.ok(!('probe' in ok.taste), 'the 1152 probe weights are dropped — the browser never uses them');
for (const [mut, why] of [
  [
    (t) => {
      t.kind = 'x';
    },
    'kind',
  ],
  [
    (t) => {
      t.version = 2;
    },
    'version',
  ],
  [
    (t) => {
      t.featuresVersion = FEATURES_VERSION - 1;
    },
    'features version',
  ],
  [
    (t) => {
      delete t.head;
    },
    'no head',
  ],
  [
    (t) => {
      t.head.terms['x=y'] = NaN;
    },
    'NaN weight',
  ],
  [
    (t) => {
      t.head.num.bogus = 1;
    },
    'unknown numeric',
  ],
  [
    (t) => {
      t.head.fidelity = 7;
    },
    'fidelity range',
  ],
  [
    (t) => {
      t.head.terms = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k=${i}`, 0]));
    },
    'oversize',
  ],
]) {
  const t = taste();
  mut(t);
  assert.strictEqual(validateTaste(t).ok, false, `rejects: ${why}`);
}
assert.strictEqual(validateTaste(null).ok, false);

// ── scoring: argmax lands the planted best ─────────────────────────────────
const head = ok.taste.head;
const small = { count: 600, scale: [0.2, 0.4] };
const large = { count: 30, scale: [1.8, 3.0] };
assert.ok(scoreLayout(head, large) > scoreLayout(head, small));
const eng = makeMlxCurator(ok.taste);
assert.strictEqual(eng.name, 'mlx');
assert.strictEqual(eng.status(), 'active');
assert.strictEqual(eng.pick([small, small, large, small]), 2, 'picks the large, sparse candidate');
// low fidelity → no engine (the persona scorer stays on)
assert.strictEqual(makeMlxCurator({ ...ok.taste, head: { ...head, fidelity: HEAD_MIN_FIDELITY - 0.01 } }), null);
assert.strictEqual(makeMlxCurator(null), null);

// ── store + curate: import → mlx is the active curator; clear → back ──────
const before = getActiveCurator().name;
assert.notStrictEqual(before, 'mlx', 'no taste loaded: not mlx');
assert.strictEqual(importTaste({ kind: 'nope' }).ok, false);
assert.strictEqual(getTaste(), null, 'a bad file changes nothing');
assert.ok(importTaste(taste()).ok);
assert.ok(mem.get(TASTE_KEY), 'kept per machine');
assert.ok(!JSON.parse(mem.get(TASTE_KEY)).probe, 'stored trimmed');
const cur = getActiveCurator();
assert.strictEqual(cur.name, 'mlx');
assert.strictEqual(curatorHint(cur), 'curated pick · mlx');
const r = pickCurated([small, large, small], cur, () => 0.5);
assert.deepStrictEqual(r, { index: 1, curated: true });
assert.match(tasteSummary(getTaste()), /42 keeps \/ 180 passes · fidelity 0\.71 · curating live/);
clearTaste();
assert.strictEqual(getTaste(), null);
assert.strictEqual(mem.has(TASTE_KEY), false);
assert.strictEqual(getActiveCurator().name, before, 'cleared: the previous fallback is back');

// #954 — Lois is a second head. Taste pick is unchanged. Low fidelity parks boldness.
const withLois = taste();
withLois.lois = {
  labels: { favorites: 12, keeps: 28 },
  head: { ...withLois.head, terms: { ...withLois.head.terms, 'scale=large': 4 }, fidelity: 0.62 },
  probe: { weights: [1, 2, 3], bias: 0 },
};
const imported = validateTaste(withLois);
assert.strictEqual(imported.ok, true);
assert.ok(!imported.taste.lois.probe, 'lois probe weights are dropped');
assert.strictEqual(imported.taste.lois.labels.favorites, 12);
assert.ok(scoreBoldness(imported.taste, large) > scoreBoldness(imported.taste, small));
assert.match(loisSummary(imported.taste), /12 favorites \/ 28 kept-not-favorited · fidelity 0\.62 · boldness live/);
assert.strictEqual(
  scoreBoldness(
    { ...imported.taste, lois: { ...imported.taste.lois, head: { ...imported.taste.lois.head, fidelity: 0.1 } } },
    large,
  ),
  null,
);
// #997 — the Pipeline lois line covers all three states: boldness live (above),
// fidelity too low (here), not trained (below). It never scores, never picks.
assert.match(
  loisSummary({
    ...imported.taste,
    lois: { ...imported.taste.lois, head: { ...imported.taste.lois.head, fidelity: 0.1 } },
  }),
  /fidelity too low — CRIT stays parked/,
);
assert.match(loisSummary(ok.taste), /not trained/);
const badLois = taste();
badLois.lois = { head: { ...badLois.head, fidelity: 9 } };
assert.strictEqual(validateTaste(badLois).ok, false);
// pick still follows the taste head, not the lois head
assert.strictEqual(makeMlxCurator(imported.taste).pick([small, large]), 1);

// ── #925 — retrain nudge: past ~50 new keeps, a hint not a warning ─────────
const trained = ok.taste; // labels.likes = 42
const keepsOf = (n) => Array.from({ length: n }, (_, i) => ({ seed: i }));
assert.strictEqual(retrainNudge(null, keepsOf(200)), null, 'no taste: no nudge');
assert.strictEqual(
  retrainNudge(trained, keepsOf(42 + RETRAIN_NUDGE_THRESHOLD - 1)),
  null,
  'one short of the threshold: quiet',
);
const nudge = retrainNudge(trained, keepsOf(42 + RETRAIN_NUDGE_THRESHOLD));
assert.ok(nudge, 'at the threshold: the nudge appears');
assert.match(nudge, /retrain hint/, 'reads as a hint, not a warning');
assert.match(nudge, /50 keeps since this head was trained/, 'names the count');
// one tap dismisses; it stays quiet until ~50 MORE keeps
dismissRetrainNudge(42 + RETRAIN_NUDGE_THRESHOLD);
assert.strictEqual(retrainNudge(trained, keepsOf(42 + RETRAIN_NUDGE_THRESHOLD)), null, 'dismissed: quiet');
assert.strictEqual(retrainNudge(trained, keepsOf(42 + 2 * RETRAIN_NUDGE_THRESHOLD - 1)), null, '49 more: still quiet');
assert.ok(retrainNudge(trained, keepsOf(42 + 2 * RETRAIN_NUDGE_THRESHOLD)), '50 more after dismissal: back');
// a fresh import re-baselines: the dismissal must not outlive it
const fresh = taste();
fresh.labels.likes = 200;
assert.ok(importTaste(fresh).ok);
assert.strictEqual(mem.has(RETRAIN_NUDGE_KEY), false, 'import clears the dismissal');
assert.strictEqual(
  retrainNudge(getTaste(), keepsOf(200 + RETRAIN_NUDGE_THRESHOLD - 1)),
  null,
  'new head: quiet below its own baseline',
);
assert.ok(retrainNudge(getTaste(), keepsOf(200 + RETRAIN_NUDGE_THRESHOLD)), 'new head: nudges past its own baseline');
clearTaste();

// ── #762 experimental switch: the 0.3 bar stays the rule; the artist's own switch lets a thin head steer, and says so ──
{
  const { headUsable } = await import('./tasteHead.js');
  const { experimentalOn, setExperimental, EXPERIMENTAL_KEY } = await import('./tasteGate.js');
  const thin = taste();
  thin.head.fidelity = 0.17; // Matt's first real model (2026-10-08)
  const t = validateTaste(thin).taste;
  // the rule, unchanged
  assert.strictEqual(experimentalOn(), false, 'off by default');
  assert.strictEqual(headUsable(t.head), false);
  assert.strictEqual(makeMlxCurator(t), null, 'below the bar: no curator');
  assert.match(tasteSummary(t), /fidelity too low/);
  // the switch
  assert.strictEqual(headUsable(t.head, true), true);
  const cur = makeMlxCurator(t, { experimental: true });
  assert.ok(cur && cur.name === 'mlx' && cur.experimental === true, 'steers, and is marked experimental');
  assert.strictEqual(
    cur.pick([
      { scale: [0.1, 0.3], count: 400 },
      { scale: [2, 3], count: 40 },
    ]),
    1,
    'it really uses the head: large and few wins',
  );
  assert.match(tasteSummary(t, { experimental: true }), /EXPERIMENTAL: steering below the 0\.3 bar/);
  // never noise: a head that is not positively correlated does not steer, switch or no switch
  for (const f of [0, -0.2]) {
    const bad = { ...t.head, fidelity: f };
    assert.strictEqual(headUsable(bad, true), false, `fidelity ${f}`);
  }
  assert.strictEqual(headUsable({ fidelity: NaN }, true), false);
  assert.strictEqual(headUsable(null, true), false);
  // a head at or above the bar is not "experimental", with the switch on or off
  const good = validateTaste(taste()).taste;
  assert.strictEqual(makeMlxCurator(good, { experimental: true }).experimental, false);
  assert.match(tasteSummary(good, { experimental: true }), /curating live/);
  // the store holder: persists per machine, read by the live curator
  assert.ok(importTaste(thin).ok);
  assert.notStrictEqual(getActiveCurator().name, 'mlx', 'switch off: the persona curator keeps the button');
  assert.strictEqual(setExperimental(true), true);
  assert.strictEqual(mem.get(EXPERIMENTAL_KEY), '1');
  const live = getActiveCurator();
  assert.strictEqual(live.name, 'mlx');
  assert.match(curatorHint(live), /mlx · experimental/, 'the hint says so');
  setExperimental(false);
  assert.strictEqual(mem.has(EXPERIMENTAL_KEY), false);
  assert.notStrictEqual(getActiveCurator().name, 'mlx', 'off again: back to the rule');
  clearTaste();
}

// ── XGBoost T1 — the tree head: same file, same gates, a second student ────
{
  const { headUsable } = await import('./tasteHead.js');
  const sig = (x) => 1 / (1 + Math.exp(-x));
  // One tree, hand-computed. Features bind by index: 0 density, 1 num.count.
  // density>=75 buckets 'high'; num.count = (count-10)/790, so count 400 ->
  // 0.4937 (< 0.5) and count 600 -> 0.7468 (>= 0.5).
  const treeTaste = () => ({
    kind: 'kc-taste',
    version: 1,
    featuresVersion: FEATURES_VERSION,
    model: 'm',
    dims: 1152,
    labels: { likes: 42, passes: 180 },
    trainedAt: '2026-10-14T00:00:00Z',
    head: {
      kind: XGB_HEAD_KIND,
      objective: 'binary:logistic',
      baseScore: 0.25,
      fidelity: 0.9,
      fitOn: 400,
      features: ['density', 'num.count'],
      trees: [
        {
          f: 0,
          op: '=',
          v: 'high',
          gain: 5,
          y: { leaf: 1.0 },
          n: { f: 1, op: '<', v: 0.5, gain: 2, y: { leaf: 0.5 }, n: { leaf: -0.5 } },
        },
      ],
    },
  });
  const A = { density: 90, count: 400 }; // density 'high'           -> margin 0.25 + 1.0
  const B = { density: 50, count: 400 }; // 'mid', num.count < 0.5   -> margin 0.25 + 0.5
  const C = { density: 50, count: 600 }; // 'mid', num.count >= 0.5  -> margin 0.25 - 0.5

  const names = treeFeatureNames();
  assert.ok(
    names.includes('density') && names.includes('accum') && names.includes('num.count'),
    'tree features bind to the app universe',
  );
  assert.ok(
    !names.includes('cast') && !names.includes('castCategories') && !names.includes('v') && !names.includes('num'),
    'arrays/skips never bind',
  );

  const vt = validateTaste(treeTaste());
  assert.ok(vt.ok, 'a tree taste validates');
  const thead = vt.taste.head;
  assert.strictEqual(thead.kind, XGB_HEAD_KIND);
  // the hand computation, exactly: sigmoid(baseScore + the leaf the walk lands on)
  assert.strictEqual(scoreTreeHead(thead, A), sig(1.25));
  assert.strictEqual(scoreTreeHead(thead, B), sig(0.75));
  assert.strictEqual(scoreTreeHead(thead, C), sig(-0.25));
  assert.strictEqual(scoreLayout(thead, A), sig(1.25), 'scoreLayout dispatches on the kind');
  for (const lp of [A, B, C]) {
    const s = scoreTreeHead(thead, lp);
    assert.ok(s > 0 && s < 1, 'a probability, not a margin');
  }
  // the app keeps a clean copy: corrupting the file's objects changes nothing
  const raw = treeTaste();
  const clean = validateTaste(raw).taste;
  raw.head.trees[0].y.leaf = 99;
  assert.strictEqual(scoreTreeHead(clean.head, A), sig(1.25), 'validated trees are copies, not the file objects');

  // boolean splits bind booleans — and their term-rule spelling — alike
  const boolTaste = (v) => ({
    kind: 'kc-taste',
    version: 1,
    featuresVersion: FEATURES_VERSION,
    model: 'm',
    dims: 1152,
    labels: { likes: 1, passes: 1 },
    head: {
      kind: XGB_HEAD_KIND,
      objective: 'binary:logistic',
      baseScore: 0,
      fidelity: 0.9,
      features: ['accum'],
      trees: [{ f: 0, op: '=', v, gain: 1, y: { leaf: 0.25 }, n: { leaf: -0.25 } }],
    },
  });
  for (const v of [true, 'true']) {
    const bh = validateTaste(boolTaste(v)).taste.head;
    assert.strictEqual(scoreTreeHead(bh, { accumulation: true }), sig(0.25), `bool split v=${JSON.stringify(v)}`);
    assert.strictEqual(scoreTreeHead(bh, { accumulation: false }), sig(-0.25));
  }

  // malformed tree files fail closed, each for its named reason
  const chain = (splits) =>
    splits <= 0 ? { leaf: 0 } : { f: 1, op: '<', v: 0.5, gain: 1, y: chain(splits - 1), n: { leaf: 0 } };
  const full = (d) => (d <= 0 ? { leaf: 0 } : { f: 1, op: '<', v: 0.5, gain: 1, y: full(d - 1), n: full(d - 1) });
  const badTrees = (mut, why) => {
    const t = treeTaste();
    mut(t.head);
    assert.strictEqual(validateTaste(t).ok, false, `rejects tree head: ${why}`);
  };
  badTrees((h) => {
    h.objective = 'reg:squarederror';
  }, 'wrong objective');
  badTrees((h) => {
    h.baseScore = NaN;
  }, 'NaN baseScore');
  badTrees((h) => {
    h.fidelity = 7;
  }, 'fidelity range');
  badTrees((h) => {
    h.features = [];
  }, 'no features');
  badTrees((h) => {
    h.features = ['density', 'density'];
  }, 'duplicated feature');
  badTrees((h) => {
    h.features = ['density', 'num.bogus'];
  }, 'unknown numeric feature');
  badTrees((h) => {
    h.features = ['density', 'castCategories'];
  }, 'array feature cannot bind');
  badTrees((h) => {
    h.trees = [];
  }, 'no trees');
  badTrees((h) => {
    h.trees = Array.from({ length: 513 }, () => ({ leaf: 0 }));
  }, 'too many trees');
  badTrees((h) => {
    h.trees = [chain(7)];
  }, 'too deep');
  badTrees((h) => {
    h.trees = Array.from({ length: 158 }, () => full(6));
  }, 'too many nodes');
  badTrees((h) => {
    h.trees[0].f = 2;
  }, 'feature index out of range');
  badTrees((h) => {
    h.trees[0].f = 0.5;
  }, 'feature index not an integer');
  badTrees((h) => {
    h.trees[0].op = '<';
  }, 'categorical split with <');
  badTrees((h) => {
    h.trees[0].v = 3;
  }, 'categorical split on a number');
  badTrees((h) => {
    h.trees[0].n.op = '=';
  }, 'numeric split with =');
  badTrees((h) => {
    h.trees[0].y = { leaf: Infinity };
  }, 'non-finite leaf');
  badTrees((h) => {
    h.trees[0].gain = NaN;
  }, 'non-finite gain');
  badTrees((h) => {
    h.trees[0] = null;
  }, 'null node');
  // the bounds' other side: exactly at the cap validates
  const atCap = treeTaste();
  atCap.head.trees = Array.from({ length: 512 }, () => ({ leaf: 0 }));
  assert.ok(validateTaste(atCap).ok, '512 trees is inside the bound');
  const deepOk = treeTaste();
  deepOk.head.trees = [chain(6)];
  assert.ok(validateTaste(deepOk).ok, 'depth 6 is inside the bound');
  const nodesOk = treeTaste();
  nodesOk.head.trees = Array.from({ length: 157 }, () => full(6));
  assert.ok(validateTaste(nodesOk).ok, '19,939 nodes is inside the bound');
  // a kind the app does not know is refused, never ignored
  const alien = taste();
  alien.head.kind = 'banana';
  assert.strictEqual(validateTaste(alien).ok, false);
  assert.match(validateTaste(alien).error, /unknown taste head kind/);
  // an explicit 'linear' kind is the linear head, unchanged
  const lin = taste();
  lin.head.kind = 'linear';
  assert.ok(validateTaste(lin).ok);
  assert.strictEqual(validateTaste(lin).taste.head.kind, undefined, 'linear keeps its historical shape (no kind)');
  // the featuresVersion gate guards tree files with the existing words
  const stale = treeTaste();
  stale.featuresVersion = FEATURES_VERSION - 1;
  assert.strictEqual(validateTaste(stale).ok, false);
  assert.match(validateTaste(stale).error, /retrain on a fresh pool/);

  // the fidelity gate is the same gate (headUsable reads fidelity only)
  assert.strictEqual(headUsable(thead), true);
  assert.strictEqual(headUsable({ ...thead, fidelity: HEAD_MIN_FIDELITY - 0.01 }), false);
  assert.strictEqual(
    headUsable({ ...thead, fidelity: 0.17 }, true),
    true,
    'the experimental switch applies to trees too',
  );
  assert.strictEqual(headUsable({ ...thead, fidelity: -0.1 }, true), false, 'never noise, switch or no switch');
  assert.strictEqual(
    makeMlxCurator({ ...vt.taste, head: { ...thead, fidelity: 0.1 } }),
    null,
    'low fidelity: no curator',
  );
  const eng = makeMlxCurator(vt.taste);
  assert.strictEqual(eng.pick([C, A, B]), 1, 'the existing curator path argmaxes tree probabilities correctly');

  // the scorer factory: diceScorer shape, null when unusable (fallback intact)
  assert.strictEqual(makeXgbScorer(null), null);
  assert.strictEqual(makeXgbScorer(ok.taste), null, 'a linear taste has no tree scorer');
  assert.strictEqual(
    makeXgbScorer({ ...vt.taste, head: { ...thead, fidelity: 0.1 } }),
    null,
    'below the bar: no scorer',
  );
  const scorer = makeXgbScorer(vt.taste);
  assert.strictEqual(scorer.id, 'xgb-head-v1');
  assert.strictEqual(scorer.score({ layoutParams: A }), sig(1.25), 'carried layoutParams score via the head');
  assert.strictEqual(scorer.score(A), sig(1.25), 'a bare candidate IS layout params (the CURATE path)');
  assert.strictEqual(
    scorer.score({ layoutId: 'fibonacci', assetIds: [] }),
    scoreLayout(thead, { mode: 'fibonacci' }),
    'a dice candidate names its layout',
  );
  const s0 = scorer.score(null);
  assert.ok(Number.isFinite(s0) && s0 > 0 && s0 < 1, 'a junk candidate scores the default recipe, never crashes');

  // end to end through the store: import a tree taste, the mlx curator
  // steers with probabilities; clear it and the fallback is back.
  const prevName = getActiveCurator().name;
  assert.ok(importTaste(treeTaste()).ok);
  const live = getActiveCurator();
  assert.strictEqual(live.name, 'mlx');
  assert.deepStrictEqual(
    pickCurated([C, A, B], live, () => 0.5),
    { index: 1, curated: true },
  );
  assert.match(tasteSummary(getTaste()), /42 keeps \/ 180 passes · fidelity 0\.90 · curating live/);
  clearTaste();
  assert.strictEqual(getTaste(), null);
  assert.strictEqual(getActiveCurator().name, prevName, 'cleared: the previous fallback is back');
}

// ── XGBoost T3 — Davis's citable reasons: the score, in the model's words ──
{
  const { explainTreeScore, getDavisCitation, describeFeatureValue } = await import('./tasteHead.js');
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const treeTaste = () => ({
    kind: 'kc-taste',
    version: 1,
    featuresVersion: FEATURES_VERSION,
    model: 'm',
    dims: 1152,
    labels: { likes: 42, passes: 180 },
    trainedAt: '2026-10-14T00:00:00Z',
    head: {
      kind: XGB_HEAD_KIND,
      objective: 'binary:logistic',
      baseScore: 0.25,
      fidelity: 0.9,
      fitOn: 400,
      features: ['density', 'num.count'],
      trees: [
        {
          f: 0,
          op: '=',
          v: 'high',
          gain: 5,
          y: { leaf: 1.0 },
          n: { f: 1, op: '<', v: 0.5, gain: 2, y: { leaf: 0.5 }, n: { leaf: -0.5 } },
        },
      ],
    },
  });
  const thead = validateTaste(treeTaste()).taste.head;
  const A = { density: 90, count: 400 };
  const B = { density: 50, count: 400 };
  const C = { density: 50, count: 600 };

  // the explanation IS the walk: same score, and the clause cites the
  // splits the candidate actually turned on, in the trainer's own words.
  assert.strictEqual(explainTreeScore(thead, A).clause, 'high density');
  assert.strictEqual(explainTreeScore(thead, B).clause, 'mid density · marks under 0.5');
  assert.strictEqual(explainTreeScore(thead, C).clause, 'mid density · marks over 0.5');
  for (const lp of [A, B, C]) {
    assert.strictEqual(explainTreeScore(thead, lp).score, scoreTreeHead(thead, lp), 'explained score = walked score');
  }
  // a categorical no-branch cites the candidate's own value, not the split's
  assert.strictEqual(explainTreeScore(thead, B).facts[0].fragment, 'mid density', 'went no on high; the Look is mid');
  // the feature words mirror studio/curator.py describe_term
  assert.strictEqual(describeFeatureValue('density', 'high'), 'high density');
  assert.strictEqual(describeFeatureValue('bodies', 'sparse'), 'sparse crowds');
  assert.strictEqual(describeFeatureValue('accum', true), 'trails on');
  assert.strictEqual(describeFeatureValue('mirror', false), 'unmirrored');

  // a richer ensemble: one fact per feature (the highest-gain occurrence),
  // ranked by gain, capped at three — the rest of the path stays uncited.
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
        // a second, weaker density split: density is still cited once, from the gain-12 tree
        { f: 0, op: '=', v: 'low', gain: 1, y: { leaf: -0.4 }, n: { leaf: 0.05 } },
      ],
    },
  }).taste.head;
  const X = { mode: 'grid', density: 90, count: 300, scale: [1.8, 2.2], mirror: true };
  const exX = explainTreeScore(rich, X);
  assert.strictEqual(exX.clause, 'high density · dense crowds · mirrored');
  assert.strictEqual(exX.facts.length, 3, 'the clause caps at three facts');
  assert.strictEqual(exX.facts.filter((f) => f.feature === 'density').length, 1, 'one fact per feature');
  assert.strictEqual(exX.score, scoreTreeHead(rich, X));
  assert.ok(Math.abs(exX.score - sig(0.85)) < 1e-12, 'hand-check: -0.2 + 0.2 + 0.8 + 0 + 0.05');
  const Y = { mode: 'orbit', density: 20, count: 30, scale: [0.3, 0.5], mirror: false };
  assert.strictEqual(explainTreeScore(rich, Y).clause, 'low density · sparse crowds · unmirrored');

  // no trees, no citation — never invented
  assert.strictEqual(explainTreeScore(ok.taste.head, A), null, 'a linear head explains nothing');
  assert.strictEqual(explainTreeScore(null, A), null);
  const leafHead = validateTaste({
    kind: 'kc-taste',
    version: 1,
    featuresVersion: FEATURES_VERSION,
    model: 'm',
    dims: 1,
    labels: { likes: 1, passes: 1 },
    head: {
      kind: XGB_HEAD_KIND,
      objective: 'binary:logistic',
      baseScore: 0,
      fidelity: 0.9,
      features: ['density'],
      trees: [{ leaf: 0.3 }],
    },
  }).taste.head;
  assert.strictEqual(explainTreeScore(leafHead, A), null, 'pure-leaf ensemble: no split to cite');

  // the scorer explains through the same candidate reduction it scores by
  const scorer = makeXgbScorer(validateTaste(treeTaste()).taste);
  assert.strictEqual(scorer.explain({ layoutParams: A }), 'high density');
  assert.strictEqual(scorer.explain(A), 'high density', 'a bare candidate IS layout params');
  assert.strictEqual(
    scorer.explain({ layoutId: 'fibonacci', assetIds: [] }),
    explainTreeScore(thead, { mode: 'fibonacci' }).clause,
    'a dice candidate explains its mode reduction',
  );

  // the citation plumbing: a tree pick is quoted by the hint; a linear
  // pick clears it — the line returns to exactly what it said before T3.
  // (Earlier blocks' picks may have left a citation behind; a linear pick
  // is the known reset.)
  assert.ok(importTaste(taste()).ok);
  const linCur0 = getActiveCurator();
  assert.deepStrictEqual(
    pickCurated([small, large, small], linCur0, () => 0.5),
    { index: 1, curated: true },
  );
  assert.strictEqual(getDavisCitation(), null, 'a linear pick cites nothing');
  assert.ok(importTaste(treeTaste()).ok);
  const treeCur = getActiveCurator();
  assert.strictEqual(treeCur.name, 'mlx');
  assert.strictEqual(curatorHint(treeCur), 'curated pick · mlx', 'no tree pick yet: the hint is unchanged');
  assert.deepStrictEqual(
    pickCurated([C, A, B], treeCur, () => 0.5),
    { index: 1, curated: true },
  );
  assert.strictEqual(getDavisCitation(), 'high density', 'the winner’s own path, cited');
  assert.strictEqual(curatorHint(treeCur), 'curated pick · mlx — high density');
  assert.ok(importTaste(taste()).ok);
  const linCur = getActiveCurator();
  assert.deepStrictEqual(
    pickCurated([small, large, small], linCur, () => 0.5),
    { index: 1, curated: true },
  );
  assert.strictEqual(getDavisCitation(), null, 'back to linear: the citation clears');
  assert.strictEqual(curatorHint(linCur), 'curated pick · mlx', 'the hint is exactly the pre-T3 line');
  clearTaste();
}

console.log('tasteHead.selfcheck: OK');
