// dice.js — the tasteful dice: random proposes, taste disposes.
//
// One roll = N candidate (layout, cast) pairs dealt wild, scored by a scorer,
// LOIS shortlists 3 finalists, the performer crowns one. The scorer is an
// interface ({ id, score(candidate) }) — the persona scorer is interim; the
// MLX head (Phase B) implements the same interface and the dice never changes.
//
// Decisions (research/tasteful-dice-2026-10-07.md §7-8):
//   - uniform layout pick across all STUB_VOICES (affinity table ignored)
//   - cast 2–5, sized to the mode (per-mode hash) ± Davis wildness
//   - roles read from asset metadata; new packs auto-absorb (no pack lists)
//   - wildness from Davis's state: UGLY wilder, FLOW calmer
//   - same-category weak prior + learned co-occurrence from the crown log
import { STUB_VOICES } from '../data/voices.js';

/** Candidates dealt per roll before shortlisting (the Lois pass: show this count). */
export const DICE_CANDIDATES_BASE = 8;
export const DICE_CANDIDATES_WILD = 8;
/** Finalists LOIS shortlists per roll. */
export const DICE_FINALISTS = 3;

/**
 * #1546 (Q1 re-scope) — dealer-side stratification. The audit (E1a #1504)
 * showed the funnel is not the scorer: the dealer deals role-first, and
 * only categories carrying heavy/solid assets can ever take the lead pick,
 * so whole families reach candidacy only as wild-card guests in foreign
 * casts and starve at the finalist cut. The repair is in the DEAL, not the
 * grade: a share of each roll's candidates are dealt as family-anchored
 * casts — the first pick is drawn from a starved family's own pool, and
 * the remaining members are dealt by the ordinary take sequence (lead,
 * texture/accent, accent, texture, wild cards) around that anchor. The
 * scorer is untouched: an anchored cast wins only on the score the
 * persona gives it.
 *
 * The table is a static design input, derived from the step-0 engagement
 * census over the audit stream (600 rolls, seed 0x1504, 2026-10-14):
 * the families whose tray reach was under 25% of their library, weighted
 * by never-tray asset count (the rescue weight). Order is alphabetical —
 * the family walk below is order-sensitive, and this order is the one
 * the census measured. A family that stops starving leaves the table
 * only by a deliberate edit with a fresh census behind it (the coverage
 * suite alarms on the shape either way).
 */
export const STRATIFIED_FAMILIES = [
  { category: 'biosynthetic', weight: 11 },
  { category: 'crystalline', weight: 10 },
  { category: 'floral', weight: 13 },
  { category: 'radial', weight: 25 },
];
/** Share of each roll's candidates dealt as family-anchored casts. */
export const DICE_STRATIFIED_SHARE = 0.25;
const STRATIFIED_WEIGHT_TOTAL = STRATIFIED_FAMILIES.reduce((s, f) => s + f.weight, 0);

/**
 * Which starved family anchors candidate `index` of a roll, as a pure
 * function of values the roll has already drawn (layout id, cast size,
 * candidate index) — no stream draws of its own, so an anchored candidate
 * consumes exactly the stream a plain one does and every other candidate
 * in the roll deals bit-identically to the unstratified dealer.
 */
export function stratifiedFamilyFor(layoutId, size, index) {
  let x = ((fnv1a(`${layoutId}|${size}|${index}`) % 100000) / 100000) * STRATIFIED_WEIGHT_TOTAL;
  for (const f of STRATIFIED_FAMILIES) {
    x -= f.weight;
    if (x <= 0) return f.category;
  }
  return STRATIFIED_FAMILIES[STRATIFIED_FAMILIES.length - 1].category;
}

/** Davis state code → wildness 0..1. UGLY sifts wide, FLOW stays close to home. */
export function wildnessForDavis(code) {
  switch (code) {
    case 'UGLY':
      return 1.0;
    case 'STUCK':
      return 0.8;
    case 'SEEDLING':
      return 0.5;
    case 'BLOOM':
      return 0.3;
    case 'FLOW':
      return 0.2;
    default:
      return 0.5; // Davis silent: honest middle
  }
}

const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Characteristic cast size per mode: 2–4 from the mode id hash, never a pack list. */
export function baseCastSize(layoutId) {
  return 2 + (fnv1a(String(layoutId)) % 3);
}

/** Cast size for one proposal: mode character ± wildness jitter, clamped 2–5. */
export function castSizeFor(layoutId, rng, wildness) {
  const base = baseCastSize(layoutId);
  const spread = 1 + wildness; // FLOW ≈ ±1, UGLY ≈ ±2
  const jitter = Math.round((rng() * 2 - 1) * spread);
  return Math.min(5, Math.max(2, base + jitter));
}

// --- role pools (metadata only; every predicate falls back to the full pool) ---

const isLead = (a) => a.weight === 'heavy' || a.density === 'solid';
const isTexture = (a) => a.density === 'sparse' || a.category === 'dots';
const isAccent = (a) =>
  a.category === 'linework' ||
  (Array.isArray(a.tags) && a.tags.some((t) => t === 'glyph' || t === 'letter' || t === 'emblem'));

function poolFor(assets, pred) {
  const hit = assets.filter(pred);
  return hit.length ? hit : assets; // auto-absorb: a pack without the tag still deals
}

// --- compatibility: weak same-category prior + learned co-occurrence ---

/** Same-category affinity is a starting guess, not a rule. */
export function priorAffinity(a, b) {
  return a.category && a.category === b.category ? 0.6 : 0.4;
}

/** Learned: how often this pair was crowned together. Neutral until crowns exist. */
export function learnedAffinity(a, b, crowns) {
  if (!crowns || !crowns.length) return 0.5;
  let pair = 0;
  for (const c of crowns) {
    const ids = c.assetIds || [];
    if (ids.includes(a.id) && ids.includes(b.id)) pair++;
  }
  return pair / crowns.length;
}

/**
 * Compatibility of two assets. The learned weight grows with evidence:
 * after ~50 crowns the keeps outvote the prior 3:1. No hand-authored matrix.
 */
export function affinity(a, b, crowns) {
  const n = crowns ? crowns.length : 0;
  const wLearned = Math.min(0.75, n / 50);
  return (1 - wLearned) * priorAffinity(a, b) + wLearned * learnedAffinity(a, b, crowns);
}

/** Weighted pick of one asset from pool, favoring affinity with the cast so far. */
function pickWeighted(pool, picked, crowns, rng, wildness) {
  const remaining = pool.filter((a) => !picked.some((p) => p.id === a.id));
  const src = remaining.length ? remaining : pool.filter((a) => !picked.some((p) => p.id === a.id));
  const candidates = src.length ? src : pool;
  if (candidates.length === 1) return candidates[0];
  // Wildness flattens the weights: UGLY barely listens to affinity, FLOW obeys it.
  const temp = 0.3 + wildness * 1.7;
  const weights = candidates.map((a) => {
    if (!picked.length) return 1;
    const aff = picked.reduce((s, p) => s + affinity(a, p, crowns), 0) / picked.length;
    return Math.pow(Math.max(0.05, aff), 1 / temp);
  });
  let r = rng() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Deal one cast: roles first (lead/texture/accent), then wild cards to size.
 *
 * #1546: when `anchorPool` is given (a starved family's assets, chosen by
 * rollDice), the cast is family-anchored: the first pick is drawn from the
 * anchor pool, and the ordinary take sequence fills the remaining slots
 * around it — the lead take still deals, so the cast fields the same role
 * grammar as any other and competes on score alone. The anchored path
 * consumes exactly the stream the plain path does for the same size (the
 * one displaced draw — the size-2 coin flip — is consumed explicitly), so
 * anchoring one candidate never perturbs the dealing of any other.
 */
export function dealCast(assets, size, rng, wildness, crowns, anchorPool = null) {
  const picked = [];
  const take = (pred) => {
    const a = pickWeighted(poolFor(assets, pred), picked, crowns, rng, wildness);
    if (a && !picked.some((p) => p.id === a.id)) picked.push(a);
  };
  if (anchorPool && anchorPool.length) {
    // pickWeighted draws once for any pool > 1; a 1-asset pool draws never,
    // so consume the displaced draw to keep the stream aligned.
    if (anchorPool.length === 1) rng();
    const anchor = pickWeighted(anchorPool, picked, crowns, rng, wildness);
    if (anchor && !picked.some((p) => p.id === anchor.id)) picked.push(anchor);
    if (size >= 2 && picked.length < size) take(isLead);
    if (size === 2) rng(); // the coin-flip draw the anchor + lead displaced
    if (size >= 2 && picked.length < size) take(rng() < 0.5 ? isTexture : isAccent);
    if (size >= 3 && picked.length < size) take(isAccent);
    if (size >= 4 && picked.length < size) take(isTexture);
  } else {
    if (size >= 2) {
      take(isLead);
      take(rng() < 0.5 ? isTexture : isAccent);
    }
    if (size >= 3) take(isAccent);
    if (size >= 4) take(isTexture);
  }
  while (picked.length < size) take(() => true); // wild cards: affinity does the curating
  return picked.map((a) => a.id);
}

/**
 * Roll the dice.
 * @returns {{ candidates, finalists, rolled, kept, wildness, davisCode }}
 * candidates: every proposal with its score; finalists: top 3 by score.
 *
 * XGBoost T2 (spec §6): when `orderScorer` is given (a usable tree head's
 * scorer — curator/tasteHead.js makeXgbScorer, { id, score } shaped like
 * any scorer), the model ORDERS WITHIN STRATA. The deal itself — stream,
 * casts, shares, persona scores — is untouched, and the candidates are
 * partitioned by the deal's own stratification: the open stratum (dealt
 * plain) and the anchored stratum (dealt family-anchored under #1546).
 * Finalist slots follow the deal's proportions (the anchored stratum
 * keeps a finalist voice in proportion to its share of the roll, at
 * least one while it dealt any), and WITHIN each stratum the model's
 * score ranks — ties fall to the persona score, then to deal order.
 * Scores never gate: there is no threshold anywhere; every dealt
 * candidate keeps its stratum's road to the tray regardless of its
 * number, and the tray itself is presented in model order. With no
 * orderScorer the roll is bit-identical to the pre-T2 dice. `orderMeta`
 * ({ tasteVersion, headKind }) rides along so records made from this
 * roll (the crown log) can stamp which head ordered it (spec §5).
 */
export function rollDice({
  assets,
  rng = Math.random,
  davisCode = null,
  scorer,
  crowns = [],
  orderScorer = null,
  orderMeta = null,
}) {
  if (!assets || !assets.length) throw new Error('[dice] no assets to deal from');
  if (!scorer || typeof scorer.score !== 'function') throw new Error('[dice] scorer missing');
  const wildness = wildnessForDavis(davisCode);
  const n = DICE_CANDIDATES_BASE + Math.round(wildness * DICE_CANDIDATES_WILD);
  // #1546: the last share of the roll's candidates are family-anchored
  // (see STRATIFIED_FAMILIES). The choice costs no stream draws — it is a
  // pure function of the layout, size, and candidate index already dealt.
  const stratCount = Math.max(1, Math.round(n * DICE_STRATIFIED_SHARE));
  const candidates = [];
  const anchorOf = []; // per candidate: the family it anchored, or null
  for (let i = 0; i < n; i++) {
    const layout = STUB_VOICES[Math.floor(rng() * STUB_VOICES.length)];
    const size = castSizeFor(layout.id, rng, wildness);
    let anchorPool = null;
    let anchorFamily = null;
    if (i >= n - stratCount) {
      const fam = stratifiedFamilyFor(layout.id, size, i);
      const pool = assets.filter((a) => a.category === fam);
      if (pool.length) {
        anchorPool = pool;
        anchorFamily = fam;
      }
    }
    const assetIds = dealCast(assets, size, rng, wildness, crowns, anchorPool);
    const candidate = { layoutId: layout.id, assetIds };
    candidates.push({ ...candidate, score: scorer.score(candidate) });
    anchorOf.push(anchorFamily);
  }
  if (!orderScorer) {
    candidates.sort((a, b) => b.score - a.score);
    return {
      candidates,
      finalists: candidates.slice(0, DICE_FINALISTS),
      rolled: n,
      kept: DICE_FINALISTS,
      wildness,
      davisCode,
    };
  }
  // T2 ordering: stamp the model's score + the stratum the deal put each
  // candidate in, rank inside strata, and cut the finalists by the
  // strata's own proportions. Pure re-ranking — no stream draws, so the
  // dealt casts above are the same casts an unordered roll deals. Ties
  // fall to the persona score, then to deal order (the stratum arrays
  // start in deal order and Array#sort is stable).
  const byModel = (a, b) => b.xgbScore - a.xgbScore || b.score - a.score;
  const open = [];
  const anchored = [];
  candidates.forEach((c, i) => {
    c.xgbScore = orderScorer.score(c);
    // T3: Davis's citable reason rides beside the score when the scorer
    // can explain itself (the tree head can; a plain { id, score } scorer
    // stamps null — the tray just stays silent, as before).
    c.xgbReason = typeof orderScorer.explain === 'function' ? orderScorer.explain(c) : null;
    c.stratum = anchorOf[i] ? 'anchored' : 'open';
    c.anchorFamily = anchorOf[i];
    (anchorOf[i] ? anchored : open).push(c);
  });
  open.sort(byModel);
  anchored.sort(byModel);
  let anchoredSlots = anchored.length
    ? Math.min(anchored.length, Math.max(1, Math.round((DICE_FINALISTS * anchored.length) / n)))
    : 0;
  const openSlots = Math.min(open.length, DICE_FINALISTS - anchoredSlots);
  anchoredSlots = Math.min(anchored.length, DICE_FINALISTS - openSlots);
  const finalists = [...open.slice(0, openSlots), ...anchored.slice(0, anchoredSlots)];
  if (finalists.length < DICE_FINALISTS) {
    const rest = [...open.slice(openSlots), ...anchored.slice(anchoredSlots)].sort(byModel);
    for (const c of rest) {
      if (finalists.length >= DICE_FINALISTS) break;
      finalists.push(c);
    }
  }
  finalists.sort(byModel);
  return {
    candidates: [...open, ...anchored],
    finalists,
    rolled: n,
    kept: DICE_FINALISTS,
    wildness,
    davisCode,
    orderMeta: orderMeta ?? null,
  };
}
