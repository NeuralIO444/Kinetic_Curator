// shelfFill — Keeps K2 (#1590): the Kinetic fill.
//
// Pressing KINETIC with the shelf in focus deals a new Stage from the
// whole Collection. The trio + the sway table, in pipeline order:
//
//   DAVIS drafts wide — a pool of 48, stratified across cast families
//     and origins, weighted toward novelty (distance from the current
//     stage) — chaos with a memory.
//   LOIS cuts — every candidate passes his E4 gates or it is out; no
//     slot rule may resurrect a gate failure. The gate runs on STORED
//     verdicts (the E4 discipline: verdicts recorded at bake time, the
//     `gateVerdict` a mined keep carries from its run). A keep with no
//     verdict on file is UNJUDGED, not failed — it can be dealt, and
//     the receipt says the gate found no verdicts to read. (The issue's
//     kill criterion, honoured literally: no fill-time baking — the
//     rasterizer is Node-side machinery; a freezing fill does not
//     ship. Live per-keep verdicts arrive when a bake writes them.)
//   QUEEN tilts — consensus ranks by her anchor: the taste head when a
//     usable one is loaded (through the existing scorer interface —
//     scores ORDER, they never gate or deal, §7), else proximity to
//     the kept centroid, read through the Director's hosted anchor
//     (keptAnchor — the pull's own keeps; pattern-layer keeps do not
//     teach it). Below the pull's minimum the anchor is identity and
//     consensus falls back to Davis's novelty order. Swap history
//     NEVER feeds her — it feeds suppression only.
//   THE TABLE deals — slot rules in order (preferences.json, shipped
//     default FULL WEIRD): consensus, then the rule-breakers —
//     neglected, wild, Lois's choice (highest gate margins, taste
//     ignored), and the contrarian (most unlike the other dealt).
//     The rule-breaking slots are UNSCORED: the scorer is consulted
//     only while ranking consensus candidates.
//
// The stage's laws hold throughout (K1): the 16-unit slot-cost budget
// is never exceeded (a mined keep costs 2 — a rule whose next
// candidate does not fit deals fewer, and the receipt says so);
// nothing is silently dropped — rules that dealt nothing are NAMED in
// the receipt; the performing Look is pinned and dealt around.
//
// Seeded (session seed + fill counter, chosen by the store) and
// replayable bit-exactly: same collection, stage, history, table and
// seed → the same deal, slot for slot. PURE: no store, no IO, no
// wall clock, no Math.random — mulberry32 only (the E1a law).

import { mulberry32 } from './coverageReport.mjs';
import { slotCostOf, LOOK_SLOT_BUDGET } from './candidateTray.mjs';
import { keptAnchor } from './director.js';
import { extractFeatures, featureProximity } from './taste.js';
import { sanitizeGateVerdict, gateMargin } from './loisJudge.mjs';
import { RULE_ORDER } from './shelfPrefs.mjs';

export const FILL_POOL_SIZE = 48;
export const CHRONIC_SWAP_OUTS = 3;

const originOf = (keep) => (keep?.provenance?.source === 'explorer' ? 'explorer' : 'hand');

// The shelf row's family reading, restated for the draft's strata
// (shelf.mjs owns the display form; the rule is the same: the cast's
// asset categories, or 'custom' when the cast names no library asset).
function familiesOf(keep, assetsById) {
  const cats = new Set();
  for (const id of (Array.isArray(keep?.config?.assets) ? keep.config.assets : [])) {
    const cat = assetsById?.get?.(id)?.category;
    if (cat) cats.add(cat);
  }
  return cats.size ? [...cats].sort() : ['custom'];
}

function featuresOf(keep) {
  const layout = keep?.config?.layout;
  if (!layout || typeof layout !== 'object') return null;
  try { return extractFeatures(layout); } catch { return null; }
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Deal one fill. Inputs are the ledger state at press time; the
 * return is the new stage + the receipt the ledger records.
 *   { keeps, stageIds, history, prefs, seed, scoreOf?, performingKeepId?, assetsById? }
 * `scoreOf(keep) → number|null` is the taste-head door (the store
 * builds it from the loaded head via tasteHead's scorer interface);
 * it is consulted ONLY for consensus ranking.
 * Returns { stageIds, dealt: [{keepId, rule}], receipt } — or
 * { stageIds: null, dealt: [], receipt } when nothing could be dealt
 * (an empty/fully-gated collection, an all-zero table): a fill that
 * deals nothing changes nothing, and the receipt says why.
 */
export function dealFill({
  keeps = [], stageIds = [], history = [], prefs, seed = 0,
  scoreOf = null, performingKeepId = null, assetsById = null,
  // K3 (#1591, audit S5): how many disk keeps the anchor could NOT
  // read (their records live in files the folder didn't give up this
  // session). The anchor over the rest is partial, and the receipt
  // NAMES it — never a silent partial. 0 (the default) is a full read.
  anchorPartial = 0,
} = {}) {
  const table = prefs.table;
  const notes = [];
  const rng = mulberry32((seed >>> 0) || 1);
  // One seeded draw per keep, assigned in id order — the deal's only
  // randomness, and the reason a seed replays bit-exactly.
  const draw = new Map();
  for (const k of [...keeps].sort((a, b) => cmpStr(String(a.id), String(b.id)))) draw.set(k.id, rng());
  const drawOf = (k) => draw.get(k.id) ?? 0;

  const byId = new Map(keeps.map((k) => [k.id, k]));
  const stageSet = new Set((stageIds || []).filter((id) => byId.has(id)));

  // ── the pinned performing Look (S1): dealt around, never out ─────
  const pinnedId = (performingKeepId && stageSet.has(performingKeepId)) ? performingKeepId : null;
  const pinnedIndex = pinnedId ? stageIds.indexOf(pinnedId) : -1;
  let budgetLeft = LOOK_SLOT_BUDGET - (pinnedId ? slotCostOf(byId.get(pinnedId)) : 0);

  // ── LOIS's gate, on stored verdicts ──────────────────────────────
  const verdictOf = new Map();
  let judged = 0;
  let passedOver = 0;
  for (const k of keeps) {
    const v = sanitizeGateVerdict(k?.gateVerdict);
    verdictOf.set(k.id, v);
    if (v) { judged++; if (v.verdict === 'pass') passedOver++; }
  }
  const gateFailed = (k) => verdictOf.get(k.id)?.verdict === 'pass';
  notes.push(judged === 0
    ? 'gate: no stored verdicts on file — every candidate unjudged (verdicts are recorded at bake time)'
    : `gate: ${judged} stored verdict${judged === 1 ? '' : 's'} read — ${passedOver} passed over, never dealt`);

  // ── the anchor (hosted by the Director; never fed by swap history) ──
  const anchorInfo = keptAnchor(keeps);
  const anchor = anchorInfo.state;
  const centroid = anchorInfo.centroid;
  if (anchor === 'identity') notes.push('anchor: identity — too few keeps to lean on; consensus deals in Davis\'s novelty order');
  if (anchor === 'none') notes.push('anchor: none — no counted keep carries a layout to lean toward');
  if (anchorPartial > 0) notes.push(`anchor: partial — ${anchorPartial} keep${anchorPartial === 1 ? '' : 's'} on disk unread; the anchor leans on the rest at full weight`);

  // ── features + novelty (distance from the current stage) ─────────
  const feats = new Map(keeps.map((k) => [k.id, featuresOf(k)]));
  const stageFeats = [...stageSet].map((id) => feats.get(id)).filter(Boolean);
  const noveltyOf = (k) => {
    const f = feats.get(k.id);
    if (!f || !stageFeats.length) return null;
    return 1 - Math.max(...stageFeats.map((sf) => featureProximity(f, sf)));
  };

  // ── DAVIS drafts: pool of 48, stratified, novelty-weighted ───────
  const candidates = keeps.filter((k) => k.id !== pinnedId && !gateFailed(k));
  const nov = new Map(candidates.map((k) => [k.id, noveltyOf(k)]));
  const draftOrder = [...candidates].sort((a, b) =>
    ((nov.get(b.id) ?? -1) - (nov.get(a.id) ?? -1)) || (drawOf(a) - drawOf(b)) || cmpStr(String(a.id), String(b.id)));
  const buckets = new Map();
  for (const k of draftOrder) {
    const key = `${familiesOf(k, assetsById)[0]}|${originOf(k)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(k);
  }
  const quota = Math.max(2, Math.ceil(FILL_POOL_SIZE / Math.max(1, buckets.size)));
  const pool = [];
  const inPool = new Set();
  for (const k of draftOrder) {
    if (pool.length >= FILL_POOL_SIZE) break;
    const key = `${familiesOf(k, assetsById)[0]}|${originOf(k)}`;
    if ((buckets.get(key).filter((x) => inPool.has(x.id)).length) < quota) { pool.push(k); inPool.add(k.id); }
  }
  for (const k of draftOrder) {
    if (pool.length >= FILL_POOL_SIZE) break;
    if (!inPool.has(k.id)) { pool.push(k); inPool.add(k.id); }
  }

  // ── suppression: recency + chronic swap-outs (consensus only) ────
  const window = Math.max(0, prefs.recencyWindow | 0);
  const recentIds = new Set(stageSet);
  const fillRecords = (history || []).filter((r) => r && r.kind === 'fill');
  for (const rec of (window > 0 ? fillRecords.slice(-window) : [])) {
    for (const s of (Array.isArray(rec.slots) ? rec.slots : [])) if (s && s.keepId) recentIds.add(s.keepId);
  }
  if (pinnedId) recentIds.delete(pinnedId);
  const swapOutCounts = new Map();
  for (const r of (history || [])) {
    if (r && r.kind === 'swap' && r.outId) swapOutCounts.set(r.outId, (swapOutCounts.get(r.outId) || 0) + 1);
  }
  const chronicIds = new Set([...swapOutCounts.entries()].filter(([, n]) => n >= CHRONIC_SWAP_OUTS).map(([id]) => id));
  const consensusBanned = new Set([...recentIds, ...chronicIds]);
  if (chronicIds.size) notes.push(`suppression: ${chronicIds.size} chronic swap-out${chronicIds.size === 1 ? '' : 's'} (≥${CHRONIC_SWAP_OUTS}×) barred from consensus`);

  // ── the table deals ──────────────────────────────────────────────
  const dealt = [];
  const dealtIds = new Set();
  const dealtByRule = Object.fromEntries(RULE_ORDER.map((r) => [r, 0]));
  let budgetStopped = false;
  const take = (rule, ordered, limit) => {
    let n = 0;
    for (const k of ordered) {
      if (n >= limit) break;
      if (dealtIds.has(k.id) || k.id === pinnedId || gateFailed(k)) continue;
      const cost = slotCostOf(k);
      if (cost > budgetLeft) { budgetStopped = true; continue; }
      budgetLeft -= cost;
      dealtIds.add(k.id);
      dealt.push({ keepId: k.id, rule });
      dealtByRule[rule]++;
      n++;
    }
    return n;
  };

  // Consensus ← the draft pool, anchor-ranked (the scorer's only door).
  const anchorRank = (k) => {
    if (scoreOf) {
      try { const s = scoreOf(k); if (Number.isFinite(s)) return s; } catch { /* head mismatch → centroid */ }
    }
    if (anchor === 'live') {
      const f = feats.get(k.id);
      if (f) return featureProximity(f, centroid);
    }
    return null;
  };
  take('consensus',
    pool.filter((k) => !consensusBanned.has(k.id))
      .sort((a, b) => ((anchorRank(b) ?? nov.get(b.id) ?? -1) - (anchorRank(a) ?? nov.get(a.id) ?? -1))
        || ((nov.get(b.id) ?? -1) - (nov.get(a.id) ?? -1)) || (drawOf(a) - drawOf(b))),
    table.consensus);

  // Neglected ← the whole collection: least-staged first, the
  // never-staged at the front. Recency holds until the pool runs dry.
  // K1's stamps are numeric ms; never-staged (no stamp) leads, then
  // the longest-ago staged, then the oldest kept — the shelf view's
  // 'never' sort, dealt.
  const stampOf = (k, key) => (Number.isFinite(k?.[key]) ? k[key] : null);
  const keptMs = (k) => stampOf(k, 'keptAt') ?? 0;
  const byNeglect = (a, b) =>
    ((a.stagedCount || 0) - (b.stagedCount || 0))
    || ((stampOf(a, 'lastStagedAt') ?? -Infinity) - (stampOf(b, 'lastStagedAt') ?? -Infinity))
    || (keptMs(a) - keptMs(b))
    || (drawOf(a) - drawOf(b));
  const everyone = candidates;
  let liftedRecency = false;
  const neglectedWanted = table.neglected;
  let got = take('neglected', everyone.filter((k) => !recentIds.has(k.id)).sort(byNeglect), neglectedWanted);
  if (got < neglectedWanted) {
    const more = take('neglected', everyone.filter((k) => recentIds.has(k.id)).sort(byNeglect), neglectedWanted - got);
    if (more > 0) liftedRecency = true;
  }

  // Wild ← farthest from her centroid (the anti-taste slot — still
  // gated, never scored). No anchor: Davis's novelty order stands in.
  const byWild = (a, b) => {
    const da = (anchor === 'live' && feats.get(a.id)) ? 1 - featureProximity(feats.get(a.id), centroid) : (nov.get(a.id) ?? -1);
    const db = (anchor === 'live' && feats.get(b.id)) ? 1 - featureProximity(feats.get(b.id), centroid) : (nov.get(b.id) ?? -1);
    return (db - da) || (drawOf(a) - drawOf(b));
  };
  got = take('wild', everyone.filter((k) => !recentIds.has(k.id)).sort(byWild), table.wild);
  if (got < table.wild) {
    const more = take('wild', everyone.filter((k) => recentIds.has(k.id)).sort(byWild), table.wild - got);
    if (more > 0) liftedRecency = true;
  }
  if (liftedRecency) notes.push('recency lifted for neglected/wild — the eligible pool ran dry (recorded, not silent)');

  // Lois's choice ← his highest gate margins; taste ignored entirely.
  // Unjudged keeps have no margin: they stand behind every judged one,
  // in draft order, and the receipt names it when they are dealt.
  const margins = new Map(keeps.map((k) => [k.id, gateMargin(verdictOf.get(k.id))]));
  const loisOrdered = [...everyone].sort((a, b) => {
    const ma = margins.get(a.id);
    const mb = margins.get(b.id);
    if (ma !== null && mb !== null) return (mb - ma) || (drawOf(a) - drawOf(b));
    if (ma !== null) return -1;
    if (mb !== null) return 1;
    return (drawOf(a) - drawOf(b));
  });
  take('lois', loisOrdered, table.lois);
  const loisIds = dealt.filter((d) => d.rule === 'lois').map((d) => d.keepId);
  if (loisIds.some((id) => margins.get(id) === null)) {
    notes.push('lois\'s choice: dealt unjudged keeps — no gate margins on file for them');
  }

  // Contrarian ← most unlike the other dealt (pinned included).
  const dealtFeats = [...dealtIds].map((id) => feats.get(id)).filter(Boolean);
  if (pinnedId && feats.get(pinnedId)) dealtFeats.push(feats.get(pinnedId));
  let contrarianBasis = 'features';
  let contraOrdered;
  if (dealtFeats.length) {
    const keys = Object.keys(dealtFeats[0]);
    const mean = {};
    for (const key of keys) mean[key] = dealtFeats.reduce((s, f) => s + (f[key] || 0), 0) / dealtFeats.length;
    contraOrdered = [...everyone].sort((a, b) => {
      const fa = feats.get(a.id);
      const fb = feats.get(b.id);
      const da = fa ? 1 - featureProximity(fa, mean) : -1;
      const db = fb ? 1 - featureProximity(fb, mean) : -1;
      return (db - da) || (drawOf(a) - drawOf(b));
    });
  } else {
    contrarianBasis = 'family';
    const famCount = new Map();
    for (const d of dealt) {
      const fam = familiesOf(byId.get(d.keepId), assetsById)[0];
      famCount.set(fam, (famCount.get(fam) || 0) + 1);
    }
    contraOrdered = [...everyone].sort((a, b) =>
      ((famCount.get(familiesOf(a, assetsById)[0]) || 0) - (famCount.get(familiesOf(b, assetsById)[0]) || 0))
      || (drawOf(a) - drawOf(b)));
  }
  take('contrarian', contraOrdered, table.contrarian);
  if (table.contrarian > 0 && dealtByRule.contrarian > 0 && contrarianBasis === 'family') {
    notes.push('contrarian dealt by family rarity — no feature anchor among the dealt');
  }

  // ── assemble + account ───────────────────────────────────────────
  const totalWanted = RULE_ORDER.reduce((n, r) => n + table[r], 0);
  if (totalWanted < LOOK_SLOT_BUDGET) notes.push(`table deals ${totalWanted} of ${LOOK_SLOT_BUDGET} — the rest of the stage stays empty by the table's own counts`);
  if (budgetStopped && dealt.length < totalWanted) notes.push('the 16-unit stage budget ran out before the table finished — mined keeps cost 2');
  const undealt = RULE_ORDER.filter((r) => table[r] > 0 && dealtByRule[r] === 0);
  const receipt = {
    seed: seed >>> 0,
    anchor,
    poolSize: pool.length,
    gate: { judged, passedOver },
    tableCounts: { ...table },
    dealtByRule,
    undealt,
    notes: notes.slice(0, 8),
  };
  if (!dealt.length) {
    receipt.notes = [...receipt.notes, keeps.length === 0
      ? 'the collection is empty — nothing to deal'
      : 'nothing could be dealt — the stage stands as it was'].slice(0, 8);
    return { stageIds: null, dealt: [], receipt };
  }
  const dealtIdsOrdered = dealt.map((d) => d.keepId);
  let newStage;
  if (pinnedId) {
    newStage = [...dealtIdsOrdered];
    newStage.splice(Math.min(pinnedIndex, newStage.length), 0, pinnedId);
  } else {
    newStage = dealtIdsOrdered;
  }
  const ruleById = new Map(dealt.map((d) => [d.keepId, d.rule]));
  if (pinnedId) ruleById.set(pinnedId, 'pinned');
  receipt.slots = newStage.map((keepId) => ({ keepId, rule: ruleById.get(keepId) }));
  return { stageIds: newStage, dealt, receipt };
}
