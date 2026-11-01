// tasteHead — #762: the app side of Taste v1. Pure (no store, no DOM).
//
// studio/curator.py trains a probe over SigLIP embeddings (the real taste) and
// distils it into a small linear HEAD over the named recipe features (#759).
// The browser can't embed, and CURATE scores recipes it never renders, so the
// head is what runs here: score = bias + Σ weights[term] + Σ num[k]·x[k].
//
// XGBoost T1: the probe has a second student — a tree-ensemble head
// (head.kind 'xgboost-trees', distilled by curator.py --xgb). Same file, same
// trust boundary, same scorer contracts; validateTaste dispatches on the
// kind and scoreLayout walks the trees into a keep-probability. The linear
// head is unchanged: a file with no kind (or kind 'linear') validates and
// scores exactly as it always has.
//
// The term rule MUST match studio/curator.py `feature_terms` — both sides assert
// app/src/curator/tasteTerms.fixture.json.
import { recipeFeatures, FEATURES_VERSION } from './recipeFeatures.js';
import { validateChapterMemory } from './chapterMemory.mjs';

export const TASTE_KIND = 'kc-taste';
export const TASTE_VERSION = 1;
/** Below this the head can't reproduce the taste; live curation stays on the persona scorer. */
export const HEAD_MIN_FIDELITY = 0.3;
const MAX_TERMS = 4000;
const TERM_SKIP = new Set(['v', 'cast', 'castSize', 'num']);

/** XGBoost T1 — the tree-ensemble head kind and its artifact bounds (spec §3:
 * a taste file is an artifact, not a program bundle). */
export const XGB_HEAD_KIND = 'xgboost-trees';
const XGB_OBJECTIVE = 'binary:logistic';
const MAX_TREES = 512;
const MAX_TREE_DEPTH = 6;
const MAX_TREE_NODES = 20000;
/** Keys a tree never splits on: the term-rule skips, plus the array-valued
 * castCategories (an equality node tests one scalar, not a set). */
const TREE_FEATURE_SKIP = new Set([...TERM_SKIP, 'castCategories']);

/**
 * The feature names a tree head may declare, in binding order: the scalar
 * recipe keys the scoring path produces (recipeFeatures({ layoutParams }) —
 * palette/cast are constant across a CURATE press), then `num.<key>` for
 * each numeric. The trainer binds its columns to exactly this universe;
 * anything outside it is a file the app cannot score honestly.
 */
export function treeFeatureNames() {
  const sample = recipeFeatures();
  const cats = Object.keys(sample).filter((k) => !TREE_FEATURE_SKIP.has(k) && k !== 'num');
  return [...cats, ...Object.keys(sample.num).map((k) => `num.${k}`)];
}

/** The ONE term rule (mirrors curator.py feature_terms). */
export function featureTerms(features) {
  const out = [];
  for (const [k, v] of Object.entries(features || {})) {
    if (TERM_SKIP.has(k) || v === null || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) {
      if (x === null || x === undefined) continue;
      out.push(`${k}=${x === true ? 'true' : x === false ? 'false' : String(x)}`);
    }
  }
  return out;
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Validate a taste.json (a trust boundary: it comes from a file). Returns
 * { ok: true, taste } with ONLY what the app needs (the probe's 1152 weights
 * are dropped — the browser never uses them), or { ok: false, error }.
 */
export function validateTaste(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not a taste file' };
  if (raw.kind !== TASTE_KIND) return { ok: false, error: 'not a taste file (kind)' };
  if (raw.version !== TASTE_VERSION)
    return { ok: false, error: `taste v${raw.version} — this app reads v${TASTE_VERSION}` };
  if (raw.featuresVersion !== FEATURES_VERSION) {
    return {
      ok: false,
      error: `taste was trained on features v${raw.featuresVersion}, app has v${FEATURES_VERSION} — retrain on a fresh pool`,
    };
  }
  const h = raw.head;
  if (!h || typeof h !== 'object') return { ok: false, error: 'taste has no head — train with --features' };
  const numKeys = Object.keys(recipeFeatures().num);
  let head;
  if (h.kind === XGB_HEAD_KIND) {
    const treeHead = validateTreeHead(h);
    if (!treeHead.ok) return treeHead;
    head = treeHead.head;
  } else if (h.kind != null && h.kind !== 'linear') {
    return { ok: false, error: `unknown taste head kind: ${String(h.kind)}` };
  } else {
    const terms = h.terms && typeof h.terms === 'object' ? h.terms : null;
    if (!terms || Object.keys(terms).length > MAX_TERMS)
      return { ok: false, error: 'taste head terms missing or too large' };
    const num = h.num && typeof h.num === 'object' ? h.num : {};
    for (const [k, w] of Object.entries(terms))
      if (typeof k !== 'string' || !finite(w)) return { ok: false, error: `bad head weight: ${k}` };
    for (const [k, w] of Object.entries(num))
      if (!numKeys.includes(k) || !finite(w)) return { ok: false, error: `bad head numeric: ${k}` };
    if (!finite(h.bias) || !finite(h.fidelity) || h.fidelity < -1 || h.fidelity > 1)
      return { ok: false, error: 'bad head bias/fidelity' };
    head = { terms: { ...terms }, num: { ...num }, bias: h.bias, fidelity: h.fidelity, fitOn: Number(h.fitOn) || 0 };
  }
  const labels = raw.labels && typeof raw.labels === 'object' ? raw.labels : {};
  const taste = {
    kind: TASTE_KIND,
    version: TASTE_VERSION,
    featuresVersion: FEATURES_VERSION,
    model: String(raw.model || ''),
    dims: Number(raw.dims) || 0,
    trainedAt: String(raw.trainedAt || ''),
    labels: { likes: Number(labels.likes) || 0, passes: Number(labels.passes) || 0 },
    head,
  };
  // #954 — optional second head. Absent until the boldness probe has trained.
  // Probe weights stay on disk in taste.json; the browser only keeps the head.
  if (raw.lois != null) {
    const loisHead = validateHead(raw.lois.head, numKeys);
    if (!loisHead.ok) return { ok: false, error: `lois: ${loisHead.error}` };
    const ll = raw.lois.labels && typeof raw.lois.labels === 'object' ? raw.lois.labels : {};
    taste.lois = {
      labels: { favorites: Number(ll.favorites) || 0, keeps: Number(ll.keeps) || 0 },
      head: loisHead.head,
    };
  }
  // #1140 — optional third head (inclination). Absent until trained, and an
  // unreadable section neutralizes her without touching the other heads: a
  // bad lois section still refuses (everything stands on it); a bad queen
  // section only means she stays neutral. Never a refusal — her absence must
  // never break the heads that exist.
  if (raw.queen != null) {
    const queenHead = validateHead(raw.queen.head, numKeys);
    if (queenHead.ok) {
      const ql = raw.queen.labels && typeof raw.queen.labels === 'object' ? raw.queen.labels : {};
      const labels = {};
      for (const [k, v] of Object.entries(ql)) {
        if (Object.keys(labels).length >= 32) break;
        if (typeof k === 'string' && finite(v)) labels[k] = v;
      }
      taste.queen = { labels, head: queenHead.head };
    }
  }
  // #1858 — optional chapters extension (BOOK S5): the per-chapter keep/pass
  // histograms the trainer distils from the ledgers. Same law as the queen
  // section above: an unreadable one neutralizes the chapter lean without
  // touching the heads — a garbled memory must never break the taste that
  // exists. Absent (every pre-S5 file) stays absent, and the walk runs on
  // novelty alone exactly as it did.
  if (raw.chapters != null) {
    const cm = validateChapterMemory(raw.chapters);
    if (cm) taste.chapters = cm;
  }
  return { ok: true, taste };
}

function validateHead(h, numKeys) {
  if (!h || typeof h !== 'object') return { ok: false, error: 'has no head — train with --features' };
  const terms = h.terms && typeof h.terms === 'object' ? h.terms : null;
  if (!terms || Object.keys(terms).length > MAX_TERMS) return { ok: false, error: 'head terms missing or too large' };
  const num = h.num && typeof h.num === 'object' ? h.num : {};
  for (const [k, w] of Object.entries(terms))
    if (typeof k !== 'string' || !finite(w)) return { ok: false, error: `bad head weight: ${k}` };
  for (const [k, w] of Object.entries(num))
    if (!numKeys.includes(k) || !finite(w)) return { ok: false, error: `bad head numeric: ${k}` };
  if (!finite(h.bias) || !finite(h.fidelity) || h.fidelity < -1 || h.fidelity > 1)
    return { ok: false, error: 'bad head bias/fidelity' };
  return {
    ok: true,
    head: { terms: { ...terms }, num: { ...num }, bias: h.bias, fidelity: h.fidelity, fitOn: Number(h.fitOn) || 0 },
  };
}

/**
 * XGBoost T1 — validate a tree-ensemble head (spec §3). The teeth: the
 * featuresVersion gate already ran; here the declared features must bind to
 * the app's own feature universe (treeFeatureNames), the ensemble stays
 * inside the artifact bounds, and every number the walk will read is finite.
 * Validation rebuilds each node — the app keeps a clean copy, never the
 * file's own objects.
 */
function validateTreeHead(h) {
  if (h.objective !== XGB_OBJECTIVE) return { ok: false, error: `tree head objective must be ${XGB_OBJECTIVE}` };
  if (!finite(h.baseScore)) return { ok: false, error: 'bad tree head baseScore' };
  if (!finite(h.fidelity) || h.fidelity < -1 || h.fidelity > 1) return { ok: false, error: 'bad tree head fidelity' };
  const allowed = new Set(treeFeatureNames());
  const features = h.features;
  if (!Array.isArray(features) || !features.length) return { ok: false, error: 'tree head features missing' };
  const seen = new Set();
  for (const name of features) {
    if (typeof name !== 'string' || !allowed.has(name))
      return { ok: false, error: `tree head feature unknown: ${String(name)}` };
    if (seen.has(name)) return { ok: false, error: `tree head feature duplicated: ${name}` };
    seen.add(name);
  }
  const trees = h.trees;
  if (!Array.isArray(trees) || !trees.length) return { ok: false, error: 'tree head trees missing' };
  if (trees.length > MAX_TREES) return { ok: false, error: 'tree head too large' };
  const counter = { nodes: 0 };
  const clean = [];
  for (const t of trees) {
    const v = validateTreeNode(t, features, 0, counter);
    if (v.error) return { ok: false, error: v.error };
    clean.push(v.node);
  }
  return {
    ok: true,
    head: {
      kind: XGB_HEAD_KIND,
      objective: XGB_OBJECTIVE,
      baseScore: h.baseScore,
      fidelity: h.fidelity,
      fitOn: Number(h.fitOn) || 0,
      features: [...features],
      trees: clean,
    },
  };
}

/** One node: a leaf { leaf } or a split { f, op, v, y, n, gain }. Depth is
 * counted in split levels from the root (root = 0); the depth cap is also
 * what bounds this recursion. Returns { node } (a clean copy) or { error }. */
function validateTreeNode(node, features, depth, counter) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return { error: 'bad tree node' };
  counter.nodes += 1;
  if (counter.nodes > MAX_TREE_NODES) return { error: 'tree head too large' };
  if (depth > MAX_TREE_DEPTH) return { error: 'tree head too deep' };
  if ('leaf' in node) {
    if (!finite(node.leaf)) return { error: 'bad tree leaf' };
    return { node: { leaf: node.leaf } };
  }
  const { f, op, v, gain } = node;
  if (!Number.isInteger(f) || f < 0 || f >= features.length) return { error: 'bad tree split feature index' };
  if (features[f].startsWith('num.')) {
    if (op !== '<' || !finite(v)) return { error: 'bad tree split: numeric features split with < on a finite number' };
  } else if (op !== '=' || (typeof v !== 'string' && typeof v !== 'boolean')) {
    return { error: 'bad tree split: categorical features split with = on a string/boolean' };
  }
  if (!finite(gain)) return { error: 'bad tree split gain' };
  const y = validateTreeNode(node.y, features, depth + 1, counter);
  if (y.error) return y;
  const n = validateTreeNode(node.n, features, depth + 1, counter);
  if (n.error) return n;
  return { node: { f, op, v, y: y.node, n: n.node, gain } };
}

/**
 * May this head steer? At or above the bar: yes. Below it: only with the artist's experimental switch on
 * (curator/tasteGate.js), and never when it is not positively correlated with the taste at all.
 * Pure: the switch is passed in.
 */
export function headUsable(head, experimental = false) {
  const f = head && head.fidelity;
  if (!finite(f)) return false;
  return f >= HEAD_MIN_FIDELITY || (!!experimental && f > 0);
}

/** Head score for one CURATE candidate (layout params only — palette/cast are constant across a press).
 * A tree head scores a keep-probability in (0, 1); a linear head scores its raw margin, as always. */
export function scoreLayout(head, layoutParams) {
  if (head && head.kind === XGB_HEAD_KIND) return scoreTreeHead(head, layoutParams);
  const f = recipeFeatures({ layoutParams });
  let s = head.bias;
  for (const t of featureTerms(f)) s += head.terms[t] || 0;
  for (const [k, w] of Object.entries(head.num || {})) s += w * (f.num[k] ?? 0);
  return s;
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** A declared feature's value in a recipeFeatures object. Numerics read the
 * `num` block (absent = 0, the linear head's own convention); categoricals
 * read the top level, where an absent/null value simply fails every test. */
function treeFeatureValue(features, name) {
  if (name.startsWith('num.')) return (features.num || {})[name.slice(4)] ?? 0;
  return features[name];
}

/** THE equality rule for categorical splits (mirrored by curator.py's
 * _spec_eq): strict equality, with a boolean on either side compared by its
 * term-rule spelling ('true'/'false') so a trainer emitting either form
 * binds the same. */
const treeEq = (a, b) =>
  a === b || (typeof a === 'boolean' && String(a) === b) || (typeof b === 'boolean' && String(b) === a);

/** Walk one tree to its leaf margin, recording the path taken. Pure,
 * deterministic, no state. The path is the citation material (T3): every
 * split the walk actually turned on, with the direction it took. */
function walkTreePath(node, features, names) {
  const path = [];
  let cur = node;
  while (!('leaf' in cur)) {
    const val = treeFeatureValue(features, names[cur.f]);
    const go = cur.op === '<' ? typeof val === 'number' && Number.isFinite(val) && val < cur.v : treeEq(val, cur.v);
    path.push({ node: cur, went: go ? 'y' : 'n', value: val });
    cur = go ? cur.y : cur.n;
  }
  return { leaf: cur.leaf, path };
}

/** Walk one tree to its leaf margin. Pure, deterministic, no state. */
function walkTree(node, features, names) {
  return walkTreePath(node, features, names).leaf;
}

/** Tree-head score: sigmoid(baseScore + Σ leaf margins) — a keep-probability. */
export function scoreTreeHead(head, layoutParams) {
  const f = recipeFeatures({ layoutParams });
  let margin = head.baseScore;
  for (const t of head.trees) margin += walkTree(t, f, head.features);
  return sigmoid(margin);
}

// ─── XGBoost T3 — Davis's citable reasons (spec §6/§7.5) ───────────────────
//
// The score is a number; the citation is the model's own words for it: the
// splits the candidate's walks actually turned on, strongest first, stated
// as facts OF THE LOOK (never of the person — §7.1). The wording mirrors
// studio/curator.py's describe_term vocabulary (_WORDS / _BOOL_WORDS) so
// the app and the Studio describe the same split the same way; numeric
// splits cite the candidate's side of the split's own line.

const FEATURE_WORDS = {
  bodies: '{v} crowds',
  density: '{v} density',
  scale: '{v} marks',
  system: '{v} layouts',
  symmetry: '{v} symmetry',
  behave: '{v} motion',
  blend: '{v} blend',
  palette: 'the {v} palette',
  paletteShift: '{v} colour shift',
};
const BOOL_WORDS = {
  accum: ['trails on', 'trails off'],
  mirror: ['mirrored', 'unmirrored'],
  bleed: ['bleed on', 'bleed off'],
  overlap: ['overlap', 'no overlap'],
};
/** Numeric feature → the noun its citation names (mirrors curator.py _NUM_WORDS' keys). */
const NUM_NOUNS = {
  count: 'marks',
  particleCount: 'particles',
  scaleMid: 'scale',
  rotateSpread: 'rotation',
  alphaMid: 'opacity',
  density: 'density',
  jitter: 'jitter',
  zTiers: 'depth tiers',
  noiseFreq: 'noise',
  noiseSpeed: 'noise speed',
  displacement: 'displacement',
  swarmCohesion: 'swarm cohesion',
  gravityWells: 'gravity',
  damping: 'damping',
  wind: 'wind',
  flap: 'flap',
  breath: 'breath',
  lifeDrift: 'drift',
};

/** A categorical/boolean feature fact in the trainer's own words:
 * describeFeatureValue('density', 'high') → 'high density';
 * describeFeatureValue('accum', true) → 'trails on'. */
export function describeFeatureValue(name, value) {
  if (typeof value === 'boolean') {
    const words = BOOL_WORDS[name];
    if (words) return value ? words[0] : words[1];
    return `${name} ${value ? 'on' : 'off'}`;
  }
  const tpl = FEATURE_WORDS[name];
  if (tpl) return tpl.replace('{v}', String(value));
  return `${name} ${String(value)}`;
}

/** Python's %g, close enough for a citation: 0.5 → '0.5', 2 → '2'. */
const fmtG = (x) => String(Number(x.toPrecision(6)));

/** One split the candidate turned on, stated as a fact of the Look. For a
 * categorical split the fact is the candidate's OWN value (it went down the
 * no-branch because it is something else, and that something is the fact);
 * for a numeric split it is the candidate's side of the split's line. */
function splitFact(step, names) {
  const { node, went, value } = step;
  const name = names[node.f];
  if (node.op === '<') {
    const key = name.startsWith('num.') ? name.slice(4) : name;
    return `${NUM_NOUNS[key] || key} ${went === 'y' ? 'under' : 'over'} ${fmtG(node.v)}`;
  }
  if (value === null || value === undefined) return `${name} unset`;
  return describeFeatureValue(name, value);
}

/** How many facts a citation carries. Three is a clause; four is a report. */
export const CITATION_MAX_FACTS = 3;

/**
 * Explain a tree head's score for one candidate: the same walk scoreTreeHead
 * runs, kept. Returns null when the head is not a tree head, or when the
 * ensemble has no split to cite (pure-leaf trees — nothing to quote, and a
 * citation is never invented). Otherwise { score, clause, facts } where
 * facts are the taken paths' splits — one per feature, the highest-gain
 * occurrence — ranked by gain, capped at CITATION_MAX_FACTS, and clause is
 * them joined ' · ' in Davis's deadpan register. An ensemble has no single
 * "winning tree", so the citation aggregates across every tree's taken
 * path: the strongest reasons the whole ensemble had.
 */
export function explainTreeScore(head, layoutParams) {
  if (!head || head.kind !== XGB_HEAD_KIND) return null;
  const f = recipeFeatures({ layoutParams });
  let margin = head.baseScore;
  const best = new Map(); // feature name -> { feature, gain, fragment }
  for (const t of head.trees) {
    const { leaf, path } = walkTreePath(t, f, head.features);
    margin += leaf;
    for (const step of path) {
      const name = head.features[step.node.f];
      const prev = best.get(name);
      if (!prev || step.node.gain > prev.gain) {
        best.set(name, { feature: name, gain: step.node.gain, fragment: splitFact(step, head.features) });
      }
    }
  }
  if (!best.size) return null;
  const facts = [...best.values()].sort((a, b) => b.gain - a.gain).slice(0, CITATION_MAX_FACTS);
  return { score: sigmoid(margin), clause: facts.map((x) => x.fragment).join(' · '), facts };
}

// The last citation Davis's taste made — module state in the loisRank
// idiom (the verdict behind the last pick, read by the hint). Set by the
// MLX curator's pick; a linear head, and no pick yet, both read null:
// a citation exists only when trees actually judged.
let lastDavisCitation = null;

/** The deadpan clause behind the MLX curator's last tree-head pick, or null. */
export function getDavisCitation() {
  return lastDavisCitation;
}

/**
 * The diceScorer-shaped factory for the tree head (diceScorer.js contract:
 * { id, score(candidate) }). Null when there is no usable tree head (the
 * makeMlxCurator convention), so callers fall back exactly as they do today.
 * T2 wired it into the dice as the within-strata order scorer; T3 adds the
 * optional explain(candidate) — Davis's citable reason for a score.
 */
/** Candidate → layoutParams, the reduction both score() and explain() read:
 * a candidate either carries layoutParams, IS layout params (the CURATE
 * path), or — a dice candidate — names its layout, and the head scores
 * recipes, so the name is read as the recipe's mode with palette/cast
 * constant across the press, the same reduction scoreLayout already makes. */
function candidateLayoutParams(candidate) {
  const c = candidate && typeof candidate === 'object' ? candidate : {};
  return c.layoutParams && typeof c.layoutParams === 'object'
    ? c.layoutParams
    : typeof c.layoutId === 'string'
      ? { mode: c.layoutId }
      : c;
}

export function makeXgbScorer(taste, { experimental = false } = {}) {
  const head = taste && taste.head;
  if (!head || head.kind !== XGB_HEAD_KIND || !headUsable(head, experimental)) return null;
  return {
    id: 'xgb-head-v1',
    score(candidate) {
      return scoreLayout(head, candidateLayoutParams(candidate));
    },
    /** T3: the citable reason for this candidate's score — the deadpan
     * clause from its own tree paths (explainTreeScore), or null when the
     * ensemble has no split to cite. Optional in the scorer contract:
     * dice.js stamps it when present, and only then. */
    explain(candidate) {
      const ex = explainTreeScore(head, candidateLayoutParams(candidate));
      return ex ? ex.clause : null;
    },
  };
}

/** The `mlx` curator engine, or null when there's no usable taste (→ persona / null fallback). */
export function makeMlxCurator(taste, { experimental = false } = {}) {
  if (!taste || !taste.head || !headUsable(taste.head, experimental)) return null;
  const { head } = taste;
  return {
    name: 'mlx',
    experimental: !(head.fidelity >= HEAD_MIN_FIDELITY), // steering below the bar: every readout must say so
    status: () => 'active',
    pick(candidates) {
      let best = -1,
        bestScore = -Infinity;
      candidates.forEach((c, i) => {
        const s = scoreLayout(head, c);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      // T3: a tree head's pick carries its citation (the winner's own tree
      // paths, as a clause) for the hint to quote. A linear head cites
      // nothing — the recorded citation clears, exactly today's silence.
      const ex = best >= 0 ? explainTreeScore(head, candidates[best]) : null;
      lastDavisCitation = ex ? ex.clause : null;
      return best;
    },
  };
}

/** One status line for the Pipeline: counts + fidelity (curator.py inspect has the words). */
export function tasteSummary(taste, { experimental = false } = {}) {
  if (!taste) return 'no taste loaded — the persona curator is choosing';
  const { likes, passes } = taste.labels;
  const f = taste.head.fidelity;
  const live =
    f >= HEAD_MIN_FIDELITY
      ? 'curating live'
      : headUsable(taste.head, experimental)
        ? `EXPERIMENTAL: steering below the ${HEAD_MIN_FIDELITY.toFixed(1)} bar`
        : 'fidelity too low — persona curator stays on';
  return `taste · ${likes} keeps / ${passes} passes · fidelity ${f.toFixed(2)} · ${live}`;
}

/**
 * Boldness score for one candidate, or null when the Lois head isn't usable.
 * Does not pick — taste still chooses keepers. CRIT (#948) reads this once
 * fidelity clears the same 0.3 bar.
 */
export function scoreBoldness(taste, layoutParams, { experimental = false } = {}) {
  const head = taste && taste.lois && taste.lois.head;
  if (!head || !headUsable(head, experimental)) return null;
  return scoreLayout(head, layoutParams);
}

/** Pipeline line for the boldness probe. Absent lois is an honest "not trained". */
export function loisSummary(taste, { experimental = false } = {}) {
  if (!taste || !taste.lois) return 'lois · not trained — favorites vs keeps still waiting on labels';
  const { favorites, keeps } = taste.lois.labels;
  const f = taste.lois.head.fidelity;
  const live =
    f >= HEAD_MIN_FIDELITY
      ? 'boldness live'
      : headUsable(taste.lois.head, experimental)
        ? 'EXPERIMENTAL: boldness below the bar'
        : 'fidelity too low — CRIT stays parked';
  return `lois · ${favorites} favorites / ${keeps} kept-not-favorited · fidelity ${f.toFixed(2)} · ${live}`;
}

/** #925 — the retrain nudge: a hint, never a warning. Taste goes softly
 * stale as Matt keeps more work; after ~50 new keeps since the last train,
 * Pipeline shows one dismissible line. Zero behavior change to curation. */
export const RETRAIN_NUDGE_THRESHOLD = 50;
export const RETRAIN_NUDGE_KEY = 'kc:retrain-nudge:v1';

/** Keep count recorded when the nudge was last dismissed (0 = never). */
function readNudgeDismissed() {
  try {
    const n = Number(JSON.parse(localStorage.getItem(RETRAIN_NUDGE_KEY) ?? '0'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * The retrain nudge line, or null when it should stay quiet.
 * The baseline is the higher of the head's trained like-count and the
 * dismissed keep-count: a dismissal holds until ~50 MORE keeps, and
 * importing a fresher taste re-baselines automatically (clearRetrainNudge).
 */
export function retrainNudge(taste, keeps) {
  if (!taste) return null;
  const cur = Array.isArray(keeps) ? keeps.length : 0;
  const baseline = Math.max(Number(taste.labels?.likes) || 0, readNudgeDismissed());
  const fresh = cur - baseline;
  if (fresh < RETRAIN_NUDGE_THRESHOLD) return null;
  return `retrain hint · ${fresh} keeps since this head was trained — a fresh train would sharpen it`;
}

/** Dismiss the nudge until ~50 more keeps. */
export function dismissRetrainNudge(keepCount) {
  try {
    localStorage.setItem(RETRAIN_NUDGE_KEY, JSON.stringify(Math.max(0, Number(keepCount) || 0)));
  } catch {
    // private window: the nudge just comes back next visit. Honest, not fatal.
  }
}

/** A fresh import re-baselines the nudge — a dismissal must not outlive it. */
export function clearRetrainNudge() {
  try {
    localStorage.removeItem(RETRAIN_NUDGE_KEY);
  } catch {
    // deliberately silent
  }
}
