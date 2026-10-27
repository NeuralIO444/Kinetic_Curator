// lootIndex.mjs — #1479: the per-device loot index and its log. Pure reducers plus a guarded storage read and write.
//
// The index is THIS machine's: an absolute folder path, a hash and a path per item. It lives under one `kc:` key that is
// listed in BUNDLE_LEFT_OUT, so it never rides in a project, a bundle or a share link (which would leak the machine's
// folder layout, and would not mean anything on another Mac). The assets themselves are ordinary `user:` assets: their
// SVG is embedded in the project, so a project never depends on the loot folder being there.
import { relSegments } from './lootClassify.mjs';

export const LOOT_KEY = 'kc:loot:v1';
export const LOG_MAX = 200;
export const ITEMS_MAX = 5000;
const KINDS = ['image', 'audio', 'palette', 'look'];
const STATES = ['ok', 'missing'];
const OUTCOMES = [
  'added',
  'dup',
  'changed',
  'renamed',
  'missing',
  'skipped',
  'pool-full',
  'rejected',
  'restored',
  'taken-in',
];
const ID = /^user:loot_[a-z0-9_]{1,40}$/;
const ID_ANY = /^user:[A-Za-z0-9_-]{1,40}$/;
const HASH = /^[0-9a-f]{8,64}$/;

export const emptyIndex = () => ({ v: 1, root: null, scannedAt: null, items: {}, log: [] });

const num = (v) => (Number.isFinite(v) ? v : null);
const str = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/**
 * A stored or received index as a clean one — counted. Never throws; hostile or half-written JSON becomes the empty
 * index. #1644: the tally says what the clean-up left behind (entries that could not be read, and entries past the
 * caps), because applyPlan's own standard — "logged as skipped rather than silently dropped" — applies to the load
 * path too. `sanitizeIndex` below stays the pure, tally-free face the reducers use.
 */
export function sanitizeIndexCounted(raw) {
  const tally = { itemsUnreadable: 0, itemsOverflow: 0, logUnreadable: 0, logOverflow: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return { index: emptyIndex(), tally };
  const out = emptyIndex();
  out.root = str(raw.root, 1024);
  out.scannedAt = num(raw.scannedAt);
  const entries =
    raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? Object.entries(raw.items) : [];
  for (let i = 0; i < entries.length; i++) {
    const [id, it] = entries[i];
    if (Object.keys(out.items).length >= ITEMS_MAX) {
      tally.itemsOverflow = entries.length - i;
      break;
    }
    if (!ID.test(id) || !it || typeof it !== 'object') {
      tally.itemsUnreadable++;
      continue;
    }
    const segs = relSegments(it.rel);
    const hash = typeof it.hash === 'string' && HASH.test(it.hash) ? it.hash : null;
    if (!segs || !hash || !KINDS.includes(it.kind)) {
      tally.itemsUnreadable++;
      continue;
    }
    out.items[id] = {
      kind: it.kind,
      rel: segs.join('/'),
      size: num(it.size) ?? 0,
      mtimeMs: num(it.mtimeMs) ?? 0,
      hash,
      state: STATES.includes(it.state) ? it.state : 'ok',
      ingested: it.ingested === true, // false until its asset/palette/audio has actually been taken in (slice 6 and on)
      hold: str(it.hold, 120), // why it was not taken in (rejected, pool full), so a rescan does not retry the same file
      assetId: typeof it.assetId === 'string' && ID_ANY.test(it.assetId) ? it.assetId : null, // the id it has in the pool
    };
  }
  const log = Array.isArray(raw.log) ? raw.log : [];
  for (let i = 0; i < log.length; i++) {
    const r = log[i];
    if (out.log.length >= LOG_MAX) {
      tally.logOverflow = log.length - i;
      break;
    }
    if (!r || typeof r !== 'object' || !OUTCOMES.includes(r.outcome)) {
      tally.logUnreadable++;
      continue;
    }
    const rel = str(r.rel, 512);
    if (!rel) {
      tally.logUnreadable++;
      continue;
    }
    out.log.push({ rel, kind: KINDS.includes(r.kind) ? r.kind : null, outcome: r.outcome, reason: str(r.reason, 120) });
  }
  // #1645 — the log's all-time trim count rides the index (absent =
  // nothing shed yet, the house idiom for optional fields).
  const lt = num(raw.logTrimmed);
  if (Number.isInteger(lt) && lt > 0) out.logTrimmed = lt;
  return { index: out, tally };
}

/** A stored or received index as a clean one. Never throws; hostile or half-written JSON becomes the empty index. */
export function sanitizeIndex(raw) {
  return sanitizeIndexCounted(raw).index;
}

const row = (rel, kind, outcome, reason = null) => ({ rel, kind: kind || null, outcome, reason });

/**
 * Fold one scan's plan into the index. Pure: returns a new index and the log rows this scan produced (newest first).
 * `plan` is lootScan.planScan's result with every hash in. A scan that found the folder unreachable changes nothing but
 * says so. Items beyond ITEMS_MAX are logged as skipped rather than silently dropped.
 */
export function applyPlan(index, plan, { nowMs = null } = {}) {
  const base = sanitizeIndex(index);
  if (!plan || typeof plan !== 'object') return { index: base, rows: [] };
  const items = { ...base.items };
  const rows = [];
  if (plan.unreachable) {
    return { index: base, rows: [row(base.root || '', null, 'skipped', 'folder not reachable')] };
  }
  for (const a of plan.add || []) {
    if (Object.keys(items).length >= ITEMS_MAX) {
      rows.push(row(a.rel, a.kind, 'skipped', 'index full'));
      continue;
    }
    items[a.id] = {
      kind: a.kind,
      rel: a.rel,
      size: a.size ?? 0,
      mtimeMs: a.mtimeMs ?? 0,
      hash: a.hash,
      state: 'ok',
      ingested: false,
      hold: null,
      assetId: null,
    };
    rows.push(row(a.rel, a.kind, 'added'));
  }
  for (const r of plan.renamed || []) {
    const it = items[r.id];
    if (it) {
      items[r.id] = { ...it, rel: r.rel, state: 'ok' };
      rows.push(row(r.rel, r.kind, 'renamed', `was ${r.from}`));
    }
  }
  for (const c of plan.changed || []) {
    const it = items[c.id];
    if (it) {
      items[c.id] = { ...it, hash: c.hash, state: 'ok', ingested: false, hold: null };
      rows.push(row(c.rel, c.kind, 'changed'));
    } // new bytes: to be taken in again
  }
  for (const d of plan.dup || []) rows.push(row(d.rel, d.kind, 'dup', `same as ${d.of}`));
  for (const m of plan.missing || []) {
    const it = items[m.id];
    if (it && it.state !== 'missing') {
      items[m.id] = { ...it, state: 'missing' };
      rows.push(row(m.rel, it.kind, 'missing', 'file is gone; the asset keeps working'));
    }
  }
  for (const u of plan.unchanged || []) {
    const it = items[u.id];
    if (it && it.state === 'missing') {
      items[u.id] = { ...it, state: 'ok' };
      rows.push(row(u.rel, it.kind, 'restored'));
    }
  }
  for (const s of plan.skipped || []) rows.push(row(s.rel, s.kind, 'skipped', s.reason));
  rows.reverse(); // newest first
  const log = [...rows, ...base.log].slice(0, LOG_MAX);
  // #1645 — rows the cap shed join the index's trim count.
  const logTrimmed = (base.logTrimmed || 0) + (rows.length + base.log.length - log.length);
  return {
    index: { ...base, items, log, scannedAt: num(nowMs) ?? base.scannedAt, ...(logTrimmed > 0 ? { logTrimmed } : {}) },
    rows,
  };
}

/** Point the index at a folder. A different folder starts a clean index (its items were another folder's). */
export function withRoot(index, root) {
  const base = sanitizeIndex(index);
  const r = str(root, 1024);
  if (!r) return emptyIndex();
  return r === base.root ? base : { ...emptyIndex(), root: r };
}

/** The counts a status line shows. */
export function countItems(index) {
  const items = Object.values(sanitizeIndex(index).items);
  return {
    items: items.length,
    ok: items.filter((i) => i.state === 'ok').length,
    missing: items.filter((i) => i.state === 'missing').length,
    pending: items.filter((i) => i.state === 'ok' && !i.ingested && !i.hold).length,
    held: items.filter((i) => i.state === 'ok' && !i.ingested && Boolean(i.hold)).length,
    taken: items.filter((i) => i.state === 'ok' && i.ingested).length,
  };
}

/** The plan's `prev` argument: just what lootScan reads. */
export const asPrev = (index) => ({ items: sanitizeIndex(index).items });

const zeroTally = () => ({ itemsUnreadable: 0, itemsOverflow: 0, logUnreadable: 0, logOverflow: 0 });
const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Load from a Storage-like, saying what happened (#1644). Never throws. `status` separates the three truths the old
 * loader folded into one empty index: 'empty' — nothing was ever stored; 'unreadable' — something WAS stored and
 * could not be read (corrupt, the wrong version, or the store refused the read), so the empty index is a fresh
 * start after a loss, not a first run; 'ok' — an index loaded. On 'ok', entries the sanitizer left behind are
 * counted in `tally` and logged as skipped rows in the loaded index's own log — the same standard applyPlan keeps —
 * so the trim is real AND has a record. The rows ride the saved index, so the loss is logged once, not per boot.
 */
export function loadIndexDetailed(storage) {
  let raw = null;
  try {
    raw = storage && storage.getItem(LOOT_KEY);
  } catch {
    return { index: emptyIndex(), status: 'unreadable', tally: zeroTally() };
  }
  if (!raw) return { index: emptyIndex(), status: 'empty', tally: zeroTally() };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { index: emptyIndex(), status: 'unreadable', tally: zeroTally() };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.v !== 1) {
    return { index: emptyIndex(), status: 'unreadable', tally: zeroTally() };
  }
  const { index, tally } = sanitizeIndexCounted(parsed);
  const rel = index.root || '';
  const rows = [];
  if (tally.itemsUnreadable)
    rows.push(
      row(rel, null, 'skipped', `${counted(tally.itemsUnreadable, 'stored item', 'stored items')} could not be read`),
    );
  if (tally.itemsOverflow)
    rows.push(
      row(
        rel,
        null,
        'skipped',
        `${counted(tally.itemsOverflow, 'stored item', 'stored items')} over the cap, left out`,
      ),
    );
  if (tally.logUnreadable)
    rows.push(
      row(
        rel,
        null,
        'skipped',
        `${counted(tally.logUnreadable, 'stored log row', 'stored log rows')} could not be read`,
      ),
    );
  if (tally.logOverflow)
    rows.push(
      row(
        rel,
        null,
        'skipped',
        `${counted(tally.logOverflow, 'stored log row', 'stored log rows')} over the cap, left out`,
      ),
    );
  return {
    index: rows.length ? { ...index, log: [...rows, ...index.log].slice(0, LOG_MAX) } : index,
    status: 'ok',
    tally,
  };
}

/** Load from a Storage-like. Never throws. The detailed face above says whether an empty result is a first run or a loss. */
export function loadIndex(storage) {
  return loadIndexDetailed(storage).index;
}

/** Save; false when storage refused (quota, private mode). The scan result still stands in memory. */
export function saveIndex(storage, index) {
  try {
    storage.setItem(LOOT_KEY, JSON.stringify(sanitizeIndex(index)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Record what became of one item's take-in: { id, status: 'taken'|'held', reason?, assetId? }. Pure; unknown ids are
 * ignored. A held item (rejected, pool full) keeps its reason so a rescan does not retry the same bytes; new bytes (a
 * `changed` row) clear it.
 */
export function markTaken(index, id, { status, reason = null, assetId = null } = {}) {
  const base = sanitizeIndex(index);
  const it = base.items[id];
  if (!it) return base;
  const next =
    status === 'taken'
      ? { ...it, ingested: true, hold: null, assetId: typeof assetId === 'string' ? assetId : it.assetId }
      : { ...it, ingested: false, hold: str(reason, 120) || 'not taken in' };
  return { ...base, items: { ...base.items, [id]: next } };
}

/** Prepend log rows (newest first, capped). */
export function addRows(index, rows) {
  const base = sanitizeIndex(index);
  const clean = (Array.isArray(rows) ? rows : []).filter((r) => r && OUTCOMES.includes(r.outcome) && str(r.rel, 512));
  const log = [
    ...clean.map((r) => ({
      rel: r.rel,
      kind: KINDS.includes(r.kind) ? r.kind : null,
      outcome: r.outcome,
      reason: str(r.reason, 120),
    })),
    ...base.log,
  ].slice(0, LOG_MAX);
  // #1645 — same count as applyPlan: the tail the cap shed is totalled.
  const logTrimmed = (base.logTrimmed || 0) + (clean.length + base.log.length - log.length);
  return { ...base, log, ...(logTrimmed > 0 ? { logTrimmed } : {}) };
}
