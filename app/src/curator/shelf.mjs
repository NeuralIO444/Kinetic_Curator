// shelf.mjs — #1589 (Keeps K1): the shelf's pure logic + the core API's
// foundation (spec docs/research/keeps-machinery-spec-2026-10-14.md).
//
// The shelf has structure now: a STAGE of 16 slots (what the Looks menu
// shows; the performing canon) and a COLLECTION holding every keep. The
// keep record lives once, in the collection list; the stage is an ordered
// list of keep ids — membership, not a copy — so a tier is DERIVED from
// membership and disk location, never stored on the record (spec §2.4).
//
// Foundation law (outranks everything in K1–K4): NOTHING IS EVER SILENTLY
// LOST. No eviction, export, refusal, or demotion without a visible,
// deadpan line in the surface where it happened. The old flat list's
// slice(-KEEPS_MAX) tail eviction is gone: a crown that doesn't fit the
// stage lands in the collection with the line, and the tray's refusal
// copy ("shelf full — 16 looks kept; free one first") is dead for every
// crown kind, hand and mined alike (Matt, 2026-10-14).
//
// Pure: no store, no DOM, no clock. Callers pass `at` (epoch ms) in; the
// store reads its clock the davisSlice way (new Date().getTime()).
//
// K1 scope: tiers + migration + crown routing + hand-swap. K2 (#1590)
// adds fill() (curator/shelfFill.mjs) + the fill history record below;
// export()/disk is K3 (#1591), census readouts are K4 (#1592) — still
// deliberately absent, not stubbed.
import { LOOK_SLOT_BUDGET, slotCostOf, lookSlotsUsed } from './candidateTray.mjs';
import { provenanceLabel } from './provenance.mjs';
import { dealFill } from './shelfFill.mjs';

/** The stage budget, in slot costs (hand 1 · mined 2 — the E3 accounting,
 * folded into the stage per the ruling note: scarcity lives on the stage). */
export const STAGE_BUDGET = LOOK_SLOT_BUDGET;

/** The line a crown speaks when the stage is full and it lands in the
 * collection instead. Verbatim wherever a crown lands there (spec §4). */
export const ON_SHELF_COPY = 'on the shelf — swap it in';

/** The line a swap speaks when its slot holds the performing Look (S1). */
export const ON_DECK_COPY = 'that look is on the deck — swap another slot';

/** The line the shelf view speaks when a promotion finds no free slot. */
export const STAGE_FULL_COPY = 'stage full — pick a slot to swap';

/** The line a swap speaks when the exchange would overfill the budget. */
export const SWAP_BUDGET_COPY = 'that swap overfills the stage';

/** The favorites rider (audit S2): the favorites cap still trims, but it
 * speaks. n = how many records the trim dropped. */
export const favoritesTrimCopy = (n) => (n === 1
  ? 'favorites full — the oldest favorite was let go'
  : `favorites full — the oldest ${n} favorites were let go`);

/**
 * Spec §2.2: the collection's soft bound. In K1 it is soft in fact — past
 * it, keeps still land; the bound only becomes an export trigger in K3,
 * and its value becomes a loot preferences setting in K2. Named here so
 * the shelf view can report the crossing honestly.
 */
export const COLLECTION_SOFT_BOUND = 400;

const byId = (keeps) => new Map((keeps || []).map((k) => [k.id, k]));

/** Stage records in stage (menu) order. Ids with no record are skipped —
 * membership can never resurrect a keep that isn't in the collection. */
export function stageRecords(keeps, stageIds) {
  const map = byId(keeps);
  return (stageIds || []).map((id) => map.get(id)).filter(Boolean);
}

/** Slot costs the stage already holds. */
export function stageSlotsUsed(keeps, stageIds) {
  return lookSlotsUsed(stageRecords(keeps, stageIds));
}

/** A keep's tier, derived: 'stage' when its id is staged, else
 * 'collection'. (Disk joins in K3 as a location on top of collection.) */
export function tierOf(keepId, stageIds) {
  return (stageIds || []).includes(keepId) ? 'stage' : 'collection';
}

/**
 * Would this candidate take a stage slot? The stage-side reading of the
 * E3 gate's arithmetic: used + cost ≤ budget. Pure prediction — the
 * store's crown routing and the tray's line both read it, so they can
 * never disagree.
 */
export function stageFits(keeps, stageIds, candidate) {
  const used = stageSlotsUsed(keeps, stageIds);
  const cost = slotCostOf(candidate);
  return { fits: used + cost <= STAGE_BUDGET, used, cost, budget: STAGE_BUDGET };
}

/**
 * The crown routing (spec §4, for ALL crowns): the stage has room → the
 * keep takes a slot (appended, menu order = arrival order). The stage is
 * full → the keep lands in the collection and the caller speaks
 * ON_SHELF_COPY. Nothing is refused; nothing is evicted to make room.
 * Returns the next stage id list (unchanged on a collection landing).
 */
export function routeCrown(keeps, stageIds, candidate) {
  const gate = stageFits(keeps, stageIds, candidate);
  if (!gate.fits) return { lands: 'collection', stageIds: [...(stageIds || [])], ...gate };
  return { lands: 'stage', stageIds: [...(stageIds || []), candidate.id], ...gate };
}

/**
 * Admit an existing collection keep to a free stage slot (the shelf
 * view's "stage it"). Not a swap: no slot is exchanged. Refused — with
 * STAGE_FULL_COPY — only when the budget has no room for its cost.
 */
export function admitToStage(keeps, stageIds, keep) {
  if (!keep || (stageIds || []).includes(keep.id)) {
    return { ok: false, stageIds: [...(stageIds || [])], copy: 'already on stage' };
  }
  const gate = stageFits(keeps, stageIds, keep);
  if (!gate.fits) return { ok: false, stageIds: [...(stageIds || [])], copy: STAGE_FULL_COPY, ...gate };
  return { ok: true, stageIds: [...(stageIds || []), keep.id], ...gate };
}

/**
 * Migration (spec §7): all existing keeps → collection; the stage := the
 * most recently kept that the budget admits, walked newest-first so a
 * mined-heavy recent tail can leave an older hand keep its slot rather
 * than overflowing the budget. Returned ids are in collection order
 * (oldest → newest), so the first post-migration menu reads like the
 * tail of today's list. For an all-hand shelf this is exactly the 16
 * most recent keeps. Pure derivation — the caller persists the result
 * once, and its presence is what makes migration a one-time step.
 */
export function deriveStageIds(keeps) {
  const list = keeps || [];
  const picked = new Set();
  let used = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const cost = slotCostOf(list[i]);
    if (used + cost > STAGE_BUDGET) continue;
    used += cost;
    picked.add(list[i].id);
  }
  return list.filter((k) => picked.has(k.id)).map((k) => k.id);
}

/**
 * Sanitize a stored stage list against the collection (the read path is
 * a trust boundary, like every kc: key): strings only, bounded, deduped,
 * ids that name a real keep only, and the budget enforced by dropping
 * the OLDEST staged ids first — a repair that can only shrink membership
 * toward validity, never invent it. Deterministic.
 */
export function sanitizeStageIds(raw, keeps) {
  if (!Array.isArray(raw)) return [];
  const map = byId(keeps);
  const seen = new Set();
  const ids = [];
  for (const x of raw) {
    if (typeof x !== 'string' || !x || x.length > 80 || seen.has(x) || !map.has(x)) continue;
    seen.add(x);
    ids.push(x);
  }
  let used = lookSlotsUsed(ids.map((id) => map.get(id)));
  while (ids.length && used > STAGE_BUDGET) {
    const dropped = ids.shift();
    used -= slotCostOf(map.get(dropped));
  }
  return ids;
}

/**
 * Hand-swap (spec §3.6): exchange one stage slot for a collection keep.
 * The incoming keep takes the outgoing keep's exact slot (menu order is
 * the artist's arrangement, not the machinery's to reshuffle).
 * Refusals, each with its line (Law 1: a refusal is legal when it
 * speaks):
 *  - the outgoing keep is the performing Look (audit S1: the deck is
 *    pinned — a swap cannot pull the Look out from under the performer);
 *  - either side names a keep that isn't where the swap claims it is;
 *  - the exchange would overfill the budget (a mined keep counts
 *    double: swapping one in for a hand keep is +1 the stage may not
 *    have). The budget is a hard invariant — the read path's sanitizer
 *    enforces it too, so a swap that broke it would not survive a
 *    reload; refusing here, out loud, is the honest version.
 */
export function swapSlots(keeps, stageIds, outId, inId, { performingKeepId = null } = {}) {
  const ids = [...(stageIds || [])];
  const map = byId(keeps);
  const at = ids.indexOf(outId);
  if (at < 0 || !map.has(outId)) return { ok: false, stageIds: ids, copy: 'that slot is empty' };
  if (!map.has(inId) || ids.includes(inId)) return { ok: false, stageIds: ids, copy: 'that keep is not on the shelf' };
  if (performingKeepId && outId === performingKeepId) {
    return { ok: false, stageIds: ids, copy: ON_DECK_COPY };
  }
  const next = lookSlotsUsed(stageRecords(keeps, ids)) - slotCostOf(map.get(outId)) + slotCostOf(map.get(inId));
  if (next > STAGE_BUDGET) return { ok: false, stageIds: ids, copy: SWAP_BUDGET_COPY, used: next };
  ids[at] = inId;
  return { ok: true, stageIds: ids };
}

/**
 * The §5 history record shapes, K1's staging area for K2's ledger: flat
 * kc-voice-style records. K1 writes crown + swap; fill/export/import
 * arrive with their stages. `at` is the caller's clock reading — no
 * timestamps are invented here, and legacy state gets none.
 */
export const crownHistoryRecord = (keepId, tier, at) => ({ kind: 'crown', keepId, tier, at });
export const swapHistoryRecord = (outId, inId, at) => ({ kind: 'swap', outId, inId, at });

/** The slot rules a fill record may name (K2; 'pinned' is the S1 pin). */
export const FILL_RULES = ['consensus', 'neglected', 'wild', 'lois', 'contrarian', 'pinned'];

/**
 * The K2 fill record (§5): the seed + the table in force + which rule
 * dealt each slot — enough to replay the fill bit-exactly from the
 * same ledger state, and enough for the dev panel to show the deal.
 * `table` is the receipt's label (e.g. 'preferences.json · FULL
 * WEIRD'); `notes` carries the receipt's named degradations.
 */
export const fillHistoryRecord = ({ seed, table, slots, undealt = [], notes = [], at }) => ({
  kind: 'fill', seed, table, slots, undealt, notes, at,
});

/** Sanitize one stored history record; junk drops whole, never repairs. */
export function sanitizeHistoryRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const at = Number.isFinite(raw.at) && raw.at > 0 ? Math.floor(raw.at) : null;
  const id = (v) => (typeof v === 'string' && v ? v.slice(0, 80) : null);
  if (raw.kind === 'crown' && id(raw.keepId) && (raw.tier === 'stage' || raw.tier === 'collection')) {
    return { kind: 'crown', keepId: id(raw.keepId), tier: raw.tier, at };
  }
  if (raw.kind === 'swap' && id(raw.inId) && (raw.outId === null || id(raw.outId))) {
    return { kind: 'swap', outId: raw.outId === null ? null : id(raw.outId), inId: id(raw.inId), at };
  }
  if (raw.kind === 'fill' && Number.isFinite(raw.seed) && Array.isArray(raw.slots)) {
    const slots = raw.slots.slice(0, LOOK_SLOT_BUDGET).map((s) => (
      s && typeof s === 'object' && id(s.keepId) && FILL_RULES.includes(s.rule)
        ? { keepId: id(s.keepId), rule: s.rule }
        : null
    ));
    if (slots.some((s) => s === null)) return null; // a torn receipt drops whole
    return {
      kind: 'fill',
      seed: Math.floor(raw.seed),
      table: typeof raw.table === 'string' ? raw.table.slice(0, 60) : '',
      slots,
      undealt: Array.isArray(raw.undealt)
        ? [...new Set(raw.undealt.filter((r) => FILL_RULES.includes(r) && r !== 'pinned'))].slice(0, 5)
        : [],
      notes: Array.isArray(raw.notes)
        ? raw.notes.filter((n) => typeof n === 'string').slice(0, 8).map((n) => n.slice(0, 160))
        : [],
      at,
    };
  }
  return null;
}

/** The shelf view's search/sort vocabulary (spec §2.2). */
export const SHELF_SORTS = ['kept', 'staged', 'never'];

/**
 * One row of the collection view. Everything a row shows is derived from
 * the record + membership: the families are its cast's asset categories
 * ('custom' for ids the catalog doesn't know — user assets included),
 * origin is its provenance source ('' for hand keeps), and the label is
 * the provenance label for mined keeps, plain mode·palette·seed words
 * for hand keeps.
 */
export function shelfRow(keep, stageIds, { assetsById = new Map(), palettesById = new Map() } = {}) {
  const cast = Array.isArray(keep?.config?.assets) ? keep.config.assets : [];
  const families = new Set();
  for (const id of cast) {
    const a = assetsById.get(id);
    families.add(a ? a.category : 'custom');
  }
  const mined = provenanceLabel(keep, { assetsById, palettesById });
  const mode = keep?.config?.layout?.mode || '';
  const paletteId = keep?.config?.palette?.id || '';
  return {
    keep,
    id: keep.id,
    tier: tierOf(keep.id, stageIds),
    label: mined || [mode, paletteId, `seed ${keep.seed}`].filter(Boolean).join(' · '),
    mode,
    paletteId,
    families: [...families].sort(),
    origin: keep?.provenance?.source || '',
    corner: keep?.provenance?.corner || '',
    keptAt: Number.isFinite(keep?.keptAt) ? keep.keptAt : null,
    stagedCount: Number.isFinite(keep?.stagedCount) ? keep.stagedCount : null,
    lastStagedAt: Number.isFinite(keep?.lastStagedAt) ? keep.lastStagedAt : null,
  };
}

/**
 * The collection view's rows: search across name(label)/family/palette/
 * origin/mode/seed, then sort. Sorts (spec §2.2):
 *  - 'kept':   most recently kept first (keptAt; absent stamps keep
 *              their collection order at the tail — never invented).
 *  - 'staged': most recently staged first; never-staged (no stamp) last.
 *  - 'never':  never-staged first (the Lois pass made visible: what has
 *              never been on the stage leads), then least-staged, then
 *              oldest-kept — the neglect order the K2 fill will deal by.
 * The stage is a separate strip in the view; rows here are the whole
 * collection, stage members included and marked by their tier.
 */
export function shelfRows(keeps, stageIds, { query = '', sort = 'kept', assetsById, palettesById } = {}) {
  const rows = (keeps || []).map((k, i) => ({ ...shelfRow(k, stageIds, { assetsById, palettesById }), _i: i }));
  const q = String(query || '').trim().toLowerCase();
  const searched = q
    ? rows.filter((r) => [r.label, r.mode, r.paletteId, r.origin, r.corner, String(r.keep.seed), ...r.families]
      .join(' ').toLowerCase().includes(q))
    : rows;
  const keptKey = (r) => (r.keptAt != null ? r.keptAt : -Infinity);
  const stagedKey = (r) => (r.lastStagedAt != null ? r.lastStagedAt : -Infinity);
  const by = {
    kept: (a, b) => (keptKey(b) - keptKey(a)) || (a._i - b._i),
    staged: (a, b) => (stagedKey(b) - stagedKey(a)) || (a._i - b._i),
    never: (a, b) => ((a.stagedCount ?? 0) - (b.stagedCount ?? 0))
      || (keptKey(a) - keptKey(b)) || (a._i - b._i),
  };
  return searched.sort(by[SHELF_SORTS.includes(sort) ? sort : 'kept'])
    .map(({ _i, ...r }) => r);
}

/**
 * The core API foundation (spec §10), store-free half: given the raw
 * shelf state, the named reads every consumer uses. davisSlice owns the
 * writes (crown/swap actions); K2 adds fill(), K3 export(), and §5's
 * history() becomes the ledger read. Consumers read tiers through here
 * or through the store's keepStage — never by slicing the raw list into
 * a private idea of the stage.
 */
export const shelf = {
  stage: (keeps, stageIds) => stageRecords(keeps, stageIds),
  collection: (keeps) => [...(keeps || [])],
  tierOf,
  stageFits,
  routeCrown,
  swap: swapSlots,
  // K2 (#1590): the Kinetic fill — the pure deal (curator/shelfFill.mjs);
  // the store's fillStage action owns the write (stamps, history, undo).
  fill: (args) => dealFill(args),
  // §5's ledger read: the sanitized history, oldest first, as stored.
  history: (history) => [...(history || [])],
};
