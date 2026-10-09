// node src/curator/tasteHead.selfcheck.mjs — #762 the app side of Taste v1.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
};
const { featureTerms, validateTaste, scoreLayout, makeMlxCurator, tasteSummary, scoreBoldness, loisSummary, HEAD_MIN_FIDELITY, retrainNudge, dismissRetrainNudge, clearRetrainNudge, RETRAIN_NUDGE_THRESHOLD, RETRAIN_NUDGE_KEY } = await import('./tasteHead.js');
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
  kind: 'kc-taste', version: 1, featuresVersion: FEATURES_VERSION, model: 'm', dims: 1152,
  probe: { weights: new Array(1152).fill(0.001), bias: 0 },
  labels: { likes: 42, passes: 180 }, trainedAt: '2026-09-30T00:00:00Z',
  head: { terms: { 'scale=large': 1.5, 'scale=small': -1.5 }, num: { count: -2 }, bias: 0.1, fidelity: 0.71, fitOn: 222 },
});

// ── validator: fail-closed, keeps only what the app needs ─────────────────
const ok = validateTaste(taste());
assert.ok(ok.ok);
assert.ok(!('probe' in ok.taste), 'the 1152 probe weights are dropped — the browser never uses them');
for (const [mut, why] of [
  [(t) => { t.kind = 'x'; }, 'kind'],
  [(t) => { t.version = 2; }, 'version'],
  [(t) => { t.featuresVersion = FEATURES_VERSION - 1; }, 'features version'],
  [(t) => { delete t.head; }, 'no head'],
  [(t) => { t.head.terms['x=y'] = NaN; }, 'NaN weight'],
  [(t) => { t.head.num.bogus = 1; }, 'unknown numeric'],
  [(t) => { t.head.fidelity = 7; }, 'fidelity range'],
  [(t) => { t.head.terms = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k=${i}`, 0])); }, 'oversize'],
]) {
  const t = taste(); mut(t);
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
assert.strictEqual(scoreBoldness({ ...imported.taste, lois: { ...imported.taste.lois, head: { ...imported.taste.lois.head, fidelity: 0.1 } } }, large), null);
// #997 — the Pipeline lois line covers all three states: boldness live (above),
// fidelity too low (here), not trained (below). It never scores, never picks.
assert.match(loisSummary({ ...imported.taste, lois: { ...imported.taste.lois, head: { ...imported.taste.lois.head, fidelity: 0.1 } } }), /fidelity too low — CRIT stays parked/);
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
assert.strictEqual(retrainNudge(trained, keepsOf(42 + RETRAIN_NUDGE_THRESHOLD - 1)), null, 'one short of the threshold: quiet');
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
assert.strictEqual(retrainNudge(getTaste(), keepsOf(200 + RETRAIN_NUDGE_THRESHOLD - 1)), null, 'new head: quiet below its own baseline');
assert.ok(retrainNudge(getTaste(), keepsOf(200 + RETRAIN_NUDGE_THRESHOLD)), 'new head: nudges past its own baseline');
clearTaste();

// ── #762 experimental switch: the 0.3 bar stays the rule; the artist's own switch lets a thin head steer, and says so ──
{
  const { headUsable } = await import('./tasteHead.js');
  const { experimentalOn, setExperimental, EXPERIMENTAL_KEY } = await import('./tasteGate.js');
  const thin = taste(); thin.head.fidelity = 0.17; // Matt's first real model (2026-10-08)
  const t = validateTaste(thin).taste;
  // the rule, unchanged
  assert.strictEqual(experimentalOn(), false, 'off by default');
  assert.strictEqual(headUsable(t.head), false); assert.strictEqual(makeMlxCurator(t), null, 'below the bar: no curator');
  assert.match(tasteSummary(t), /fidelity too low/);
  // the switch
  assert.strictEqual(headUsable(t.head, true), true);
  const cur = makeMlxCurator(t, { experimental: true });
  assert.ok(cur && cur.name === 'mlx' && cur.experimental === true, 'steers, and is marked experimental');
  assert.strictEqual(cur.pick([{ scale: [0.1, 0.3], count: 400 }, { scale: [2, 3], count: 40 }]), 1, 'it really uses the head: large and few wins');
  assert.match(tasteSummary(t, { experimental: true }), /EXPERIMENTAL: steering below the 0\.3 bar/);
  // never noise: a head that is not positively correlated does not steer, switch or no switch
  for (const f of [0, -0.2]) { const bad = { ...t.head, fidelity: f }; assert.strictEqual(headUsable(bad, true), false, `fidelity ${f}`); }
  assert.strictEqual(headUsable({ fidelity: NaN }, true), false); assert.strictEqual(headUsable(null, true), false);
  // a head at or above the bar is not "experimental", with the switch on or off
  const good = validateTaste(taste()).taste;
  assert.strictEqual(makeMlxCurator(good, { experimental: true }).experimental, false);
  assert.match(tasteSummary(good, { experimental: true }), /curating live/);
  // the store holder: persists per machine, read by the live curator
  assert.ok(importTaste(thin).ok);
  assert.notStrictEqual(getActiveCurator().name, 'mlx', 'switch off: the persona curator keeps the button');
  assert.strictEqual(setExperimental(true), true); assert.strictEqual(mem.get(EXPERIMENTAL_KEY), '1');
  const live = getActiveCurator();
  assert.strictEqual(live.name, 'mlx'); assert.match(curatorHint(live), /mlx · experimental/, 'the hint says so');
  setExperimental(false); assert.strictEqual(mem.has(EXPERIMENTAL_KEY), false);
  assert.notStrictEqual(getActiveCurator().name, 'mlx', 'off again: back to the rule');
  clearTaste();
}

console.log('tasteHead.selfcheck: OK');
