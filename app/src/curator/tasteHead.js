// tasteHead — #762: the app side of Taste v1. Pure (no store, no DOM).
//
// studio/curator.py trains a probe over SigLIP embeddings (the real taste) and
// distils it into a small linear HEAD over the named recipe features (#759).
// The browser can't embed, and CURATE scores recipes it never renders, so the
// head is what runs here: score = bias + Σ weights[term] + Σ num[k]·x[k].
//
// The term rule MUST match studio/curator.py `feature_terms` — both sides assert
// app/src/curator/tasteTerms.fixture.json.
import { recipeFeatures, FEATURES_VERSION } from './recipeFeatures.js';

export const TASTE_KIND = 'kc-taste';
export const TASTE_VERSION = 1;
/** Below this the head can't reproduce the taste; live curation stays on the persona scorer. */
export const HEAD_MIN_FIDELITY = 0.3;
const MAX_TERMS = 4000;
const TERM_SKIP = new Set(['v', 'cast', 'castSize', 'num']);

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
  if (raw.version !== TASTE_VERSION) return { ok: false, error: `taste v${raw.version} — this app reads v${TASTE_VERSION}` };
  if (raw.featuresVersion !== FEATURES_VERSION) {
    return { ok: false, error: `taste was trained on features v${raw.featuresVersion}, app has v${FEATURES_VERSION} — retrain on a fresh pool` };
  }
  const h = raw.head;
  if (!h || typeof h !== 'object') return { ok: false, error: 'taste has no head — train with --features' };
  const terms = h.terms && typeof h.terms === 'object' ? h.terms : null;
  if (!terms || Object.keys(terms).length > MAX_TERMS) return { ok: false, error: 'taste head terms missing or too large' };
  const numKeys = Object.keys(recipeFeatures().num);
  const num = h.num && typeof h.num === 'object' ? h.num : {};
  for (const [k, w] of Object.entries(terms)) if (typeof k !== 'string' || !finite(w)) return { ok: false, error: `bad head weight: ${k}` };
  for (const [k, w] of Object.entries(num)) if (!numKeys.includes(k) || !finite(w)) return { ok: false, error: `bad head numeric: ${k}` };
  if (!finite(h.bias) || !finite(h.fidelity) || h.fidelity < -1 || h.fidelity > 1) return { ok: false, error: 'bad head bias/fidelity' };
  const labels = raw.labels && typeof raw.labels === 'object' ? raw.labels : {};
  const taste = {
    kind: TASTE_KIND, version: TASTE_VERSION, featuresVersion: FEATURES_VERSION,
    model: String(raw.model || ''), dims: Number(raw.dims) || 0,
    trainedAt: String(raw.trainedAt || ''),
    labels: { likes: Number(labels.likes) || 0, passes: Number(labels.passes) || 0 },
    head: { terms: { ...terms }, num: { ...num }, bias: h.bias, fidelity: h.fidelity, fitOn: Number(h.fitOn) || 0 },
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
  return { ok: true, taste };
}

function validateHead(h, numKeys) {
  if (!h || typeof h !== 'object') return { ok: false, error: 'has no head — train with --features' };
  const terms = h.terms && typeof h.terms === 'object' ? h.terms : null;
  if (!terms || Object.keys(terms).length > MAX_TERMS) return { ok: false, error: 'head terms missing or too large' };
  const num = h.num && typeof h.num === 'object' ? h.num : {};
  for (const [k, w] of Object.entries(terms)) if (typeof k !== 'string' || !finite(w)) return { ok: false, error: `bad head weight: ${k}` };
  for (const [k, w] of Object.entries(num)) if (!numKeys.includes(k) || !finite(w)) return { ok: false, error: `bad head numeric: ${k}` };
  if (!finite(h.bias) || !finite(h.fidelity) || h.fidelity < -1 || h.fidelity > 1) return { ok: false, error: 'bad head bias/fidelity' };
  return { ok: true, head: { terms: { ...terms }, num: { ...num }, bias: h.bias, fidelity: h.fidelity, fitOn: Number(h.fitOn) || 0 } };
}

/** Head score for one CURATE candidate (layout params only — palette/cast are constant across a press). */
export function scoreLayout(head, layoutParams) {
  const f = recipeFeatures({ layoutParams });
  let s = head.bias;
  for (const t of featureTerms(f)) s += head.terms[t] || 0;
  for (const [k, w] of Object.entries(head.num || {})) s += w * (f.num[k] ?? 0);
  return s;
}

/** The `mlx` curator engine, or null when there's no usable taste (→ persona / null fallback). */
export function makeMlxCurator(taste) {
  if (!taste || !taste.head || !(taste.head.fidelity >= HEAD_MIN_FIDELITY)) return null;
  const { head } = taste;
  return {
    name: 'mlx',
    status: () => 'active',
    pick(candidates) {
      let best = -1, bestScore = -Infinity;
      candidates.forEach((c, i) => {
        const s = scoreLayout(head, c);
        if (s > bestScore) { bestScore = s; best = i; }
      });
      return best;
    },
  };
}

/** One status line for the Pipeline: counts + fidelity (curator.py inspect has the words). */
export function tasteSummary(taste) {
  if (!taste) return 'no taste loaded — the persona curator is choosing';
  const { likes, passes } = taste.labels;
  const f = taste.head.fidelity;
  const live = f >= HEAD_MIN_FIDELITY ? 'curating live' : 'fidelity too low — persona curator stays on';
  return `taste · ${likes} keeps / ${passes} passes · fidelity ${f.toFixed(2)} · ${live}`;
}

/**
 * Boldness score for one candidate, or null when the Lois head isn't usable.
 * Does not pick — taste still chooses keepers. CRIT (#948) reads this once
 * fidelity clears the same 0.3 bar.
 */
export function scoreBoldness(taste, layoutParams) {
  const head = taste && taste.lois && taste.lois.head;
  if (!head || !(head.fidelity >= HEAD_MIN_FIDELITY)) return null;
  return scoreLayout(head, layoutParams);
}

/** Pipeline line for the boldness probe. Absent lois is an honest "not trained". */
export function loisSummary(taste) {
  if (!taste || !taste.lois) return 'lois · not trained — favorites vs keeps still waiting on labels';
  const { favorites, keeps } = taste.lois.labels;
  const f = taste.lois.head.fidelity;
  const live = f >= HEAD_MIN_FIDELITY ? 'boldness live' : 'fidelity too low — CRIT stays parked';
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
