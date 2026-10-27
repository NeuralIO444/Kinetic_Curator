import { startRun, tickRun, finishRun } from '../../data/evolveProgress.js';
import { loopClock } from '../../gl/loopClock.js';
import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import { generateLayoutTargets, MORPHABLE_KEYS, PALETTE_IDS } from '../paramUtils.js';
import { genId } from '../id.js';
import { stackOf, expandStack } from '../recipeStack.js'; // #1131: a keep carries the layer stack
import { tickPhraseBeat } from '../phraseTick.js';
import { sanitizeBeatRoute } from '../beatArbiter.js';
import { pushToUndo, UNDO_KIND_LAYERS, UNDO_KIND_SHELF } from '../history.js';
import { normalizeSeedOffsets } from '../../engine/kernel/rng.js';
import { EUCLID_MAX_STEPS } from '../euclid.js';
import { sanitizeQueueSeconds, sanitizeQueueBeats } from '../queueTransport.js';

/** #589 — the three phrase clock sources. */
export const PHRASE_CLOCKS = ['audio', 'metro', 'euclid'];
import { normalizeLayoutParams, validateLayoutParams } from '../../data/layout-modes.js';
import { captureKeepContext, sanitizeKeepContext, seedAgeMsNow } from '../../curator/keepContext.js'; // #1140: per-keep session context
import { captureBands, sanitizeBands } from '../../curator/hitBands.js'; // #1124
import { shownHeat, heatStep } from '../../panels/layout/kineticHeat.mjs';
import { appendToLedger } from '../../curator/tasteLedger.js'; // #1173: keep/pass ledgers for the MLX loop
import { sanitizeProvenance } from '../../curator/provenance.mjs'; // #1507: mined ≠ rolled ≠ hand-built, on the record
import { // #1589 (Keeps K1): the shelf's tiers — stage membership, crown routing, swaps, migration
  deriveStageIds, sanitizeStageIds, routeCrown, swapSlots, admitToStage,
  crownHistoryRecord, swapHistoryRecord, fillHistoryRecord, sanitizeHistoryRecord,
  exportHistoryRecord, importHistoryRecord, shelfRow,
  ON_SHELF_COPY, favoritesTrimCopy, shelfLoadLine, shelfSaveLine,
  plateNotCapturedLine, ledgerNotRecordedLine, ledgerSaveLine,
} from '../../curator/shelf.mjs';
import { dealFill } from '../../curator/shelfFill.mjs'; // #1590 (Keeps K2): the Kinetic fill
import { DEFAULT_SHELF_PREFS, tableName } from '../../curator/shelfPrefs.mjs'; // #1590: preferences.json
import { // #1591 (Keeps K3): the disk tier — stub index sanitizer, the anchor account, export paths
  sanitizeDiskIndex, anchorAccount, exportRelFor,
} from '../../curator/shelfDisk.mjs';
import { PALETTES } from '../../data/palettes.js'; // #1591: shelf row labels for the disk lines
const SHELF_ASSETS_BY_ID = new Map(ASSETS.map((a) => [a.id, a]));
const SHELF_PALETTES_BY_ID = new Map(PALETTES.map((p) => [p.id, p]));
const shelfLabelOf = (rec) => shelfRow(rec, [], { assetsById: SHELF_ASSETS_BY_ID, palettesById: SHELF_PALETTES_BY_ID }).label;
import { sanitizeGateVerdict } from '../../curator/loisJudge.mjs'; // #1590: stored E4 verdicts ride keeps
import { getTaste } from '../../curator/tasteStore.js'; // #762: the loaded taste (the Queen's head)
import { scoreLayout, headUsable } from '../../curator/tasteHead.js'; // the scorer interface (§7 door)
import { experimentalOn } from '../../curator/tasteGate.js';
import { ASSETS } from '../../data/assets/index.js';
import { withLiveRig } from '../audioRig.js'; // the audio setup is the performer's, not the hit's

// #568 — favorites are the set's curation (export-hits reads them), but they
// lived in memory only: a reload silently emptied the tray. Same pattern as the
// user palette library: their own kc: key, sanitized on the way back in (it is
// a trust boundary — recallFavorite writes layout straight into the store).
// Not in the project document on purpose: they are the performer's shelf, not
// the composition, and the hits export format is out of scope.
export const FAVORITES_KEY = 'kc:favorites:v1';
const FAVORITES_MAX = 200;
/** #996 — keeps are the performer's shelf without the star: every favorite
 * implies a keep, but a keep is not a favorite. Own kc: key, same record
 * shape as a favorite (seed, offsets, recipe, cast), same trust boundary. */
export const KEEPS_KEY = 'kc:keeps:v1';
/** #1589 (Keeps K1) — the shelf's tiers. `kc:keeps:v1` is now the
 * COLLECTION: every keep lives there, uncapped (the old KEEPS_MAX=200
 * tail eviction — slice(-KEEPS_MAX), the oldest keep silently vanishing
 * and the Queen's anchor silently moving with it — is gone; the
 * collection's 400 soft bound is an export trigger in K3, never a trim).
 * The STAGE (16 slots, what the Looks menu shows) is a separate ordered
 * list of keep ids: membership, not a copy, so a keep's tier is derived
 * and its record can never fork. Absence of the stage key IS the
 * migration signal (see readStage). */
export const STAGE_KEY = 'kc:keeps-stage:v1';
/** #1589 — K1's shelf-history staging area: flat crown/swap records in
 * the §5 shape K2's ledger (#1590) will consume. Capped generously;
 * unlike keeps, a history trim loses no work — the staging facts are
 * cached on the records themselves (stagedCount / lastStagedAt). */
export const SHELF_HISTORY_KEY = 'kc:keeps-history:v1';
const SHELF_HISTORY_MAX = 1000;
/** #1645 — the history cap sheds silently no longer: a companion
 * counter totals every record the cap has ever trimmed (at append
 * time and at the boot load), persisted beside the history and shown
 * by the census shelf readout. */
export const SHELF_HISTORY_SHED_KEY = 'kc:keeps-history-shed:v1';
/** #719 — cap on a kept cast (ids, not the full enabled map). */
export const FAVORITE_CAST_MAX = 256;

/**
 * #719 — a keep's cast: the ENABLED asset ids, sorted and de-duplicated.
 * Absent (legacy keeps) stays absent — never invent a cast. Ids are opaque
 * strings here (catalog or `user:`); the project load path re-validates them.
 */
export function sanitizeCast(raw) {
  if (!Array.isArray(raw)) return undefined;
  const ids = [...new Set(raw.filter((x) => typeof x === 'string' && x && x.length <= 80))].sort();
  return ids.slice(0, FAVORITE_CAST_MAX);
}

/**
 * #719 — the ONE place a keep is captured, so every keep path (DAVIS ★, the
 * `f` hotkey) records the full recipe: seed, stream offsets (#305), layout,
 * palette and the cast. The hotkey used to drop the offsets.
 * #1140 — plus the session context (audio/palette-warmth/dwell): what was in
 * the air when it was loved. Descriptors only, never raw audio/MIDI.
 */
export function captureFavorite(state, paletteId) {
  const enabled = state.enabledAssets || {};
  const stack = stackOf(state); // null for a plain one-track scene: the keep is exactly what it was
  return {
    ...(stack ? { stack } : {}),
    seed: state.seed,
    seedOffsets: { ...(state.seedOffsets || {}) },
    bands: captureBands(paletteId, state.paletteOverrides, state.userPalettes, heatStep(shownHeat())), // #1124: the vibe, frozen
    // #948 — full epoch ISO; legacy HH:MM:SS keeps still parse via
    // loisActivity.parseFavoriteTimestamp (date unknown -> null, honestly).
    timestamp: new Date().toISOString(),
    // #1390 (G1) — the same moment as epoch milliseconds, a number: the
    // cross-day signals (ECHO, WANE, recency) read this, never a string
    // parse. Additive — keeps written before it simply have no keptAt.
    // (new Date(), not Date.now(): #806/#808 keep davisSlice free of
    // Date.now reads; the clock inventory allow-lists this metadata read.)
    keptAt: new Date().getTime(),
    // #1391 G2 — ms between this seed landing and the keep, on the record
    // itself (additive; legacy keeps carry no field and none is invented).
    msSinceSeed: seedAgeMsNow(),
    context: captureKeepContext(paletteId),
    config: {
      layout: { ...state.layoutParams },
      palette: { id: paletteId },
      assets: sanitizeCast(Object.keys(enabled).filter((k) => enabled[k])),
    },
  };
}

/**
 * #1131 — a keep that carries a layer stack brings its tracks back with it: extra KC tracks, FX, MATH, PATTERN, the
 * active track, and the other tracks' own save states. One undo entry (the whole document). A stack that does not
 * expand is ignored (the keep still restores its look); a keep without one changes nothing, as before.
 */
export function keepStackPatch(state, fav) {
  if (!fav || !fav.stack) return {};
  const ex = expandStack(fav.stack);
  if (!ex.ok) return {};
  return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: ex.stack.layers, activeLayerId: ex.stack.activeLayerId, layerSnapshots: ex.stack.layerSnapshots };
}

/** #719 — a kept cast back to the store's enabledAssets map (ids on, nothing else). */
function castToEnabled(ids) {
  return Object.fromEntries(ids.map((id) => [id, true]));
}

export function sanitizeFavorite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seed = Number(raw.seed);
  if (!Number.isFinite(seed)) return null;
  const layout = raw.config?.layout;
  const paletteId = raw.config?.palette?.id;
  const cast = sanitizeCast(raw.config?.assets);
  // #1131 — a stored stack is trusted no further than the project normalizers trust a file: refuse it whole if
  // it does not expand (the keep itself survives), and bound its size.
  const bands = sanitizeBands(raw.bands); // #1124: kept only if it is exactly what a keep writes
  const stackOk = raw.stack && JSON.stringify(raw.stack).length < 60000 && expandStack(raw.stack).ok;
  const context = sanitizeKeepContext(raw.context);
  // #1507 — provenance rides along when it is a real one (explorer-mined);
  // hand-built and dice-crowned records carry none and none is invented.
  const provenance = sanitizeProvenance(raw.provenance);
  // #1590 — a stored Lois gate verdict (E4, recorded at bake time)
  // rides the keep when a real one is present, so the fill's gate has
  // verdicts to read; absent stays absent (unjudged, never failed).
  const gateVerdict = sanitizeGateVerdict(raw.gateVerdict);
  return {
    ...(stackOk ? { stack: JSON.parse(JSON.stringify(raw.stack)) } : {}),
    ...(bands ? { bands } : {}),
    ...(provenance ? { provenance } : {}),
    ...(gateVerdict ? { gateVerdict } : {}),
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : genId(),
    seed,
    ...(raw.seedOffsets && typeof raw.seedOffsets === 'object'
      ? { seedOffsets: normalizeSeedOffsets(raw.seedOffsets) } : {}),
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp.slice(0, 32) : '',
    // #1390 (G1) — a real epoch stamp rides along; absent or junk (legacy
    // files, foreign bundles) stays absent — never invented, never repaired.
    ...(Number.isFinite(raw.keptAt) && raw.keptAt > 0 ? { keptAt: Math.floor(raw.keptAt) } : {}),
    // #1391 G2 — ms-since-seed rides along when it is a real measurement;
    // absent or malformed stays absent.
    ...(Number.isFinite(Number(raw.msSinceSeed)) && Number(raw.msSinceSeed) >= 0 && raw.msSinceSeed != null
      ? { msSinceSeed: Math.floor(Number(raw.msSinceSeed)) } : {}),
    // #1140 — session context rides along when present; legacy keeps (no
    // context key) stay without it — never invented.
    ...(context ? { context } : {}),
    // #1589 (K1) — the shelf's staging facts ride along when real
    // (stagedCount a positive count, lastStagedAt an epoch stamp). They
    // are caches of the shelf history, maintained by the crown/swap
    // paths; absent stays absent — a legacy keep has never been staged
    // and none is invented for it (spec §2.4/§7).
    ...(Number.isFinite(raw.stagedCount) && raw.stagedCount >= 1 ? { stagedCount: Math.floor(raw.stagedCount) } : {}),
    ...(Number.isFinite(raw.lastStagedAt) && raw.lastStagedAt > 0 ? { lastStagedAt: Math.floor(raw.lastStagedAt) } : {}),
    config: {
      ...(layout && typeof layout === 'object' && !Array.isArray(layout)
        ? { layout: normalizeLayoutParams(layout) } : {}),
      palette: { id: typeof paletteId === 'string' ? paletteId.slice(0, 80) : '' },
      ...(cast && cast.length ? { assets: cast } : {}),
    },
  };
}

/** #1642 — shelf persistence speaks; nothing is silently lost at the
 * storage layer either. Two channels, both landing on shelfNotice (the
 * shelf's own visible line):
 *
 * LOAD — the read* functions below run once, at slice creation. A record
 * the sanitizer leaves out is COUNTED; a blob that cannot be read at all
 * (or a read storage refuses) is named; and the raw string is stashed
 * under `<key>:quarantine` — the boot document's quarantine shape —
 * BEFORE any persist can overwrite the shortened list, so what was lost
 * stays recoverable by hand. The factory drains the report into the
 * shelf's initial notice.
 *
 * SAVE — the five persist* functions share one failure path. A refused
 * write records ONE pending line per failure EPISODE (an episode ends
 * at the next successful shelf persist; the line informs, it never
 * nags). The factory wraps `set` so the pending line rides the very
 * update whose persist failed, appended to any notice that update
 * already carries — no persist failure is ever only a console line. */
const bootLoadLosses = [];
function noteLoadLoss(one, many, loss) { bootLoadLosses.push(shelfLoadLine(one, many, loss)); }
function drainBootLoadNotice() {
  if (!bootLoadLosses.length) return null;
  const lines = bootLoadLosses.slice();
  bootLoadLosses.length = 0;
  return lines.join(' — ');
}
function quarantineShelfRaw(key, raw, reason) {
  try {
    localStorage.setItem(`${key}:quarantine`, JSON.stringify({
      quarantinedAt: new Date().toISOString(), reason, raw,
    }));
  } catch { /* storage is already unhappy; the notice still speaks */ }
}
/** Read one stored shelf part with its losses accounted. `load` maps the
 * parsed array to the loaded list; anything left behind is reported. */
function readShelfPart(key, one, many, load, capOf) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    noteLoadLoss(one, many, { refused: true });
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantineShelfRaw(key, raw, 'unparseable JSON');
    noteLoadLoss(one, many, { unreadable: true });
    return null;
  }
  if (!Array.isArray(parsed)) {
    quarantineShelfRaw(key, raw, 'stored value is not a list');
    noteLoadLoss(one, many, { unreadable: true });
    return null;
  }
  const loaded = load(parsed);
  // #1645 — a loader whose cap trimmed says so via capOf: those
  // records WERE read, then shed by the cap, and they belong to the
  // cap's own counter — not to this "could not be read" loss.
  const capDropped = typeof capOf === 'function' ? capOf() : 0;
  const dropped = parsed.length - loaded.length - capDropped;
  if (dropped > 0) {
    quarantineShelfRaw(key, raw, `${dropped} stored record(s) could not be read`);
    noteLoadLoss(one, many, { dropped });
  }
  return loaded;
}

let persistEpisodeOpen = false;
let ledgerEpisodeOpen = false;
const pendingNoticeLines = [];
function pushNoticeLine(line) { pendingNoticeLines.push(line); }
function notePersistFailure() {
  if (persistEpisodeOpen) return;
  persistEpisodeOpen = true;
  pushNoticeLine(shelfSaveLine('the shelf'));
}
function notePersistSuccess() { persistEpisodeOpen = false; }
/** #1643 — the ledger's storage failures ride the same drain, under
 * their own episode: a stuck ledger store speaks once, recovers
 * silently, and a later failure is a new episode that speaks again. */
function noteLedgerFailure(kind) {
  if (ledgerEpisodeOpen) return;
  ledgerEpisodeOpen = true;
  pushNoticeLine(ledgerSaveLine(kind));
}
function noteLedgerSuccess() { ledgerEpisodeOpen = false; }
function drainPersistLine(partial) {
  // #1645 — an update that appended history carries the cap's trims
  // into the counter: the total moves with the update that caused it
  // and persists alongside. A refused counter write pushes the shelf's
  // failure line into this same update via notePersistFailure.
  if (partial && typeof partial === 'object' && pendingHistoryShed > 0 && partial.shelfHistory !== undefined) {
    historyShedTotal += pendingHistoryShed;
    pendingHistoryShed = 0;
    partial = { ...partial, shelfHistoryShed: historyShedTotal };
    persistHistoryShed(historyShedTotal);
  }
  if (!pendingNoticeLines.length || !partial || typeof partial !== 'object') return partial;
  const lines = pendingNoticeLines.splice(0).join(' — ');
  return { ...partial, shelfNotice: partial.shelfNotice ? `${partial.shelfNotice} — ${lines}` : lines };
}

/** #1643 — one ledger append, spoken. The three doors (F, J, X) append
 * through here so a lost label always answers at press time: a rejected
 * row (no usable seed or timestamp) pushes the per-press line; a refused
 * save pushes the episode line above. The append's row still returns. */
function appendLedgerSpoken(kind, rec, projectRef, noun) {
  const row = appendToLedger(kind, rec, projectRef, {
    report: (why) => {
      if (why === 'storage') noteLedgerFailure(kind);
      else if (why === 'saved') noteLedgerSuccess();
    },
  });
  if (!row) pushNoticeLine(ledgerNotRecordedLine(noun));
  return row;
}

function readFavorites() {
  return readShelfPart(FAVORITES_KEY, 'favorite', 'favorites',
    (parsed) => parsed.map(sanitizeFavorite).filter(Boolean).slice(0, FAVORITES_MAX)) || [];
}

function persistFavorites(list) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    notePersistSuccess();
  } catch (e) {
    console.warn('[favorites] save failed', e);
    notePersistFailure();
  }
}

/** #996 — keeps persist exactly like favorites (same record shape).
 * #1589: NO length slice on the way in or out — the collection is not a
 * cliff. A stored list longer than the old 200 cap (a foreign bundle, a
 * pre-cap build) loads whole: migration must be lossless on the real
 * record shapes, and a read-path trim would be the old silent eviction
 * wearing a new coat. */
function readKeeps() {
  return readShelfPart(KEEPS_KEY, 'keep', 'keeps',
    (parsed) => parsed.map(sanitizeFavorite).filter(Boolean)) || [];
}

function persistKeeps(list) {
  try {
    localStorage.setItem(KEEPS_KEY, JSON.stringify(list));
    notePersistSuccess();
  } catch (e) {
    console.warn('[keeps] save failed', e);
    notePersistFailure();
  }
}

function persistStage(ids) {
  try {
    localStorage.setItem(STAGE_KEY, JSON.stringify(ids));
    notePersistSuccess();
  } catch (e) {
    console.warn('[keeps] stage save failed', e);
    notePersistFailure();
  }
}

/**
 * #1589 — read the stage, migrating on first sight (spec §7: a
 * sanitize-path version step, idempotent). The stage key's ABSENCE is
 * the unmigrated state: derive the stage from the collection (the 16
 * most recently kept the budget admits), persist it, and from then on
 * the stored list is law — later reads sanitize it against the
 * collection but never re-derive it. A present-but-empty list is a real
 * state (an emptied stage), not a migration trigger.
 */
function readStage(keeps) {
  try {
    const raw = localStorage.getItem(STAGE_KEY);
    if (raw == null) {
      const derived = deriveStageIds(keeps);
      persistStage(derived);
      return derived;
    }
    return sanitizeStageIds(JSON.parse(raw), keeps);
  } catch {
    return deriveStageIds(keeps);
  }
}

/** #1645 — records the history cap trimmed at the boot load. Set by
 * readShelfHistory's loader below; the factory folds it into the
 * shed counter's opening total. Invalid records the sanitizer drops
 * are NOT counted here — #1642's load line already names those; this
 * counter is the cap's alone. */
let bootHistoryCapShed = 0;

function readShelfHistory() {
  return readShelfPart(SHELF_HISTORY_KEY, 'shelf history record', 'shelf history records',
    (parsed) => {
      const clean = parsed.map(sanitizeHistoryRecord).filter(Boolean);
      bootHistoryCapShed = Math.max(0, clean.length - SHELF_HISTORY_MAX);
      return clean.slice(-SHELF_HISTORY_MAX);
    }, () => bootHistoryCapShed) || [];
}

/** #1645 — the shed counter's own persistence. A refused write joins
 * the shelf's failure episode (#1642): the history did save, the
 * count did not — the shelf still did not fully save. */
function persistHistoryShed(total) {
  try {
    localStorage.setItem(SHELF_HISTORY_SHED_KEY, JSON.stringify(total));
  } catch {
    notePersistFailure();
  }
}

function readStoredHistoryShed() {
  try {
    const n = JSON.parse(localStorage.getItem(SHELF_HISTORY_SHED_KEY) || '0');
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** #1645 — cap trims recorded by the append helpers, drained into
 * the updating action's state by the factory's wrapped set. The
 * running total lives here (the store field mirrors it) because the
 * drain sees the update, not the state it lands on. */
let pendingHistoryShed = 0;
let historyShedTotal = 0;

function persistShelfHistory(list) {
  try {
    localStorage.setItem(SHELF_HISTORY_KEY, JSON.stringify(list));
    notePersistSuccess();
  } catch (e) {
    console.warn('[keeps] shelf history save failed', e);
    notePersistFailure();
  }
}

/** #1591 (Keeps K3) — the disk index (`kc:keeps-disk:v1`): this
 * machine's diary of which keeps live as files in the loot folder —
 * one slim stub per disk keep (listing fields only; the RECORD lives
 * in the file, verbatim), bound to one loot root. Machine-local like
 * the loot index itself: it never rides a bundle (BUNDLE_LEFT_OUT),
 * and a different folder starts it clean. */
export const DISK_KEY = 'kc:keeps-disk:v1';

function readDiskIndex() {
  try {
    const raw = localStorage.getItem(DISK_KEY);
    return raw ? sanitizeDiskIndex(JSON.parse(raw)) : { v: 1, root: null, stubs: {} };
  } catch {
    return { v: 1, root: null, stubs: {} };
  }
}

function persistDiskIndex(root, stubs) {
  try {
    localStorage.setItem(DISK_KEY, JSON.stringify({ v: 1, root: root || null, stubs }));
    notePersistSuccess();
  } catch (e) {
    console.warn('[keeps] disk index save failed', e);
    notePersistFailure();
  }
}

/**
 * #1589 — route one crowned keep into the shelf (spec §4, all crowns):
 * the stage has room → the keep takes a slot and is stamped with its
 * first staging; the stage is full → the keep lands in the collection
 * and the caller speaks ON_SHELF_COPY. The collection append is
 * unconditional — a crown is never refused and never evicts. Returns
 * the next { keeps, keepStage, landed } for the caller's set().
 */
function crownIntoShelf(state, entry, at) {
  const route = routeCrown(state.keeps, state.keepStage, entry);
  const landed = route.lands;
  const staged = landed === 'stage'
    ? { ...entry, stagedCount: (entry.stagedCount || 0) + 1, lastStagedAt: at }
    : entry;
  return { entry: staged, keeps: [...state.keeps, staged], keepStage: route.stageIds, landed };
}

/** Append one shelf-history record, capped, persisted. Returns the list. */
function withShelfHistory(state, record) {
  const before = (state.shelfHistory || []).length;
  const list = [...(state.shelfHistory || []), record].slice(-SHELF_HISTORY_MAX);
  if (before + 1 - list.length > 0) pendingHistoryShed += before + 1 - list.length; // #1645: the cap's trim is counted, not silent
  persistShelfHistory(list);
  return list;
}

/** Append several shelf-history records (a fill and the imports it
 * caused), capped, persisted once. Returns the list. */
function withShelfHistoryMany(state, records) {
  if (!records.length) return state.shelfHistory || [];
  const before = (state.shelfHistory || []).length;
  const list = [...(state.shelfHistory || []), ...records].slice(-SHELF_HISTORY_MAX);
  if (before + records.length - list.length > 0) pendingHistoryShed += before + records.length - list.length; // #1645
  persistShelfHistory(list);
  return list;
}

/**
 * #1591 — every keep the shelf can see: the in-app collection plus
 * the disk records read this session. One list for the pure law
 * (swap / stage / fill / anchor): a disk keep competes exactly like
 * an in-app one, and dealing or promoting it is the import below.
 * The invariant the actions maintain: a keep id lives in exactly one
 * of the two lists — its record has exactly one writable home.
 */
function allKeeps(state) {
  return [...(state.keeps || []), ...Object.values(state.shelfDiskRecords || {})];
}

/**
 * #1591 — bring a disk keep's record back in-app (the promotion: the
 * swap, stage-it, or fill that dealt it). The record appends to the
 * collection; its disk record + stub drop — the file left in looks/
 * becomes a fossil the shelf ignores (the take-in marks it as an
 * in-app keep's disk copy; a later re-export overwrites it whole).
 * Returns the moved state pieces, or null when the keep isn't on disk.
 */
function importDiskKeep(state, keepId) {
  const rec = (state.shelfDiskRecords || {})[keepId];
  if (!rec) return null;
  const shelfDiskRecords = { ...state.shelfDiskRecords };
  delete shelfDiskRecords[keepId];
  const shelfDiskStubs = { ...state.shelfDiskStubs };
  delete shelfDiskStubs[keepId];
  persistDiskIndex(state.shelfDiskRoot, shelfDiskStubs);
  return { keeps: [...(state.keeps || []), rec], shelfDiskRecords, shelfDiskStubs };
}

/**
 * #1589 (audit S1) — which keep is on the deck? A loaded record names
 * its keep directly when its id is a keep id; a favorite names its
 * implied keep twin (addFavorite captures both from the same plate:
 * same seed, same keptAt/timestamp, different ids). Anything else (a
 * preset, a scene) resolves to undefined — the pin stays where it was.
 */
function performingIdFor(state, rec) {
  if (!rec || typeof rec !== 'object') return undefined;
  if (typeof rec.id === 'string' && state.keeps.some((k) => k.id === rec.id)) return rec.id;
  const match = state.keeps.find((k) => k.seed === rec.seed
    && (Number.isFinite(rec.keptAt) ? k.keptAt === rec.keptAt : k.timestamp === rec.timestamp));
  return match ? match.id : undefined;
}

/**
 * #616 — stamp EVOLVE progress onto an evolve step's update: the generation
 * (only while EVOLVE runs) and the candidate seen (every tick, run or manual).
 */
function withEvolveStats(state, update) {
  if (!update || !Object.keys(update).length) return update;
  return {
    ...update,
    // #808: the run stamp rides the same loop clock as lastEvolveTs — a
    // Date.now() fallback here would mix clocks and break secPerGen.
    evolveRun: state.evolveMode ? tickRun(state.evolveRun, update.lastEvolveTs ?? loopClock.ms) : state.evolveRun,
    evolveSeen: (state.evolveSeen || 0) + 1,
  };
}

export const createDavisSlice = (set) => {
  // #1589 — boot the shelf once: the collection first, then the stage
  // read against it (which migrates on first sight; see readStage).
  const bootKeeps = readKeeps();
  const bootFavorites = readFavorites();
  const bootHistory = readShelfHistory();
  // #1645 — the shed counter opens at what storage kept plus what
  // this boot's load just trimmed. When the boot itself shed, the
  // trimmed history is written back capped (the stage migration's
  // boot-write precedent) and only then the merged total persists:
  // the write-back is what stops a reload counting the same trims
  // twice, and if it is refused the counter stays stale so the next
  // boot recounts from the still-fat blob — self-healing either way.
  historyShedTotal = readStoredHistoryShed() + bootHistoryCapShed;
  if (bootHistoryCapShed > 0) {
    const episodeWasOpen = persistEpisodeOpen;
    persistShelfHistory(bootHistory);
    if (persistEpisodeOpen === episodeWasOpen) persistHistoryShed(historyShedTotal);
  }
  // #1642 — whatever the boot reads could not load was counted above;
  // the shelf opens with the loss spoken, not buried.
  const bootNotice = drainBootLoadNotice();
  // #1591 — the disk index boots with the shelf: the listing knows its
  // disk keeps (as stubs) before any folder read; their records load
  // when the loot surface scans (loot/shelfDiskRun.mjs).
  const bootDisk = readDiskIndex();
  // #1642 — every update this slice applies passes through the persist
  // drain: when the update's own persist was refused, the failure line
  // rides that update (see notePersistFailure above).
  const rawSet = set;
  set = (update, ...rest) => rawSet(
    typeof update === 'function' ? (state) => drainPersistLine(update(state)) : drainPersistLine(update),
    ...rest,
  );
  return {
  evolveMode: false,
  // #616 EVOLVE progress: live run, last finished run, candidates seen this session.
  evolveRun: null,
  evolveLast: null,
  evolveSeen: 0,
  evolveSource: 'time',
  evolveTarget: 'seed',
  evolveInterval: 2000,
  autoSnapshot: false,
  lastEvolveTs: 0,
  favorites: bootFavorites,
  // #996 — keeps without the star. A favorite implies a keep (addFavorite
  // appends both); un-favoriting leaves the keep. Session-persisted like
  // favorites; the HITS export carries them for hits_bridge.py bold.
  // #1589 — state.keeps IS the collection (every keep; consumers like
  // the Queen's centroid read the whole of it, spec §6). keepStage is
  // the stage's ordered id list; shelfHistory is K1's staging area for
  // K2's ledger; shelfNotice is the shelf's visible line (Law 1: the
  // crown landing, the swap refusal, the favorites trim all speak here
  // and in their own surfaces); performingKeepId is the deck pin (S1),
  // session-only — what is performing is a live fact, not shelf data.
  keeps: bootKeeps,
  passCount: 0, // #1753: passes landed this session (X); taste pressure's keeps-vs-passes share reads it, never persisted
  keepStage: readStage(bootKeeps),
  shelfHistory: bootHistory,
  shelfHistoryShed: historyShedTotal, // #1645 — the cap's all-time trim count (census readout)
  shelfNotice: bootNotice,
  setShelfNotice: (msg) => set({ shelfNotice: typeof msg === 'string' && msg ? msg : null }),
  performingKeepId: null,
  // #1590 — the preferences.json state (curator/shelfPrefs.mjs): the
  // effective table + window + soft bound, where they came from, and
  // every correction the parser named. null until the loot read path
  // reports (a launch without a loot folder runs on shipped defaults —
  // dealFill's caller substitutes DEFAULT_SHELF_PREFS). Applied by the
  // loot surface on launch + rescan; a fill reads the values in force
  // at press time, so an edit lands on the NEXT fill, never mid-fill.
  shelfPrefs: null,
  shelfPrefsLines: [],
  shelfPrefsSource: null,
  setShelfPrefs: (prefs, lines = [], source = null) => set({
    shelfPrefs: prefs || null,
    shelfPrefsLines: Array.isArray(lines) ? lines : [],
    shelfPrefsSource: source || null,
    // Law 1: a correction the artist made by hand-editing the file is
    // spoken where the shelf acts happen, not only in the dev panel.
    ...(Array.isArray(lines) && lines.length ? { shelfNotice: lines[0] } : {}),
  }),
  // #1591 — the `shelf.export` preferences (curator/shelfDisk.mjs):
  // where exports land, whether stills ride, and whether the soft
  // bound exports at all. Applied by the same loot read path as the
  // table (loot/shelfPrefsLoad.mjs); null = shipped defaults.
  shelfExportPrefs: null,
  setShelfExportPrefs: (prefs) => set({ shelfExportPrefs: prefs || null }),
  // #1591 — the disk tier's face in the store. shelfDiskStubs is the
  // persisted index (kc:keeps-disk:v1); shelfDiskRecords holds the
  // disk keeps actually READ this session (memory only — persisting
  // them in-app would defeat the tier: their home is the file);
  // shelfDiskConnected says whether a scan has read the folder in
  // this session, which is what makes the anchor partial-or-full an
  // honest statement (audit S5). The loot glue (loot/shelfDiskRun.mjs)
  // is the only writer of scans; the shelf actions move records.
  shelfDiskRoot: bootDisk.root,
  shelfDiskStubs: bootDisk.stubs,
  shelfDiskRecords: {},
  shelfDiskConnected: false,
  /**
   * #1591 — fold one folder reading into the disk tier. records are
   * the raw export docs the take-in read (sanitized at this door,
   * like every boundary) keyed by the keep id their filename names;
   * freshStubs are their listing cards; present / missingIds are the
   * scan's verdict on every looks/ keep file. Laws enforced here:
   * an in-app keep is never a disk keep (a scan that finds its file
   * treats the file as the keep's fossil copy and drops the stub);
   * a missing file marks its stub, never drops the listing; a
   * different root starts the index clean.
   */
  setShelfDiskScan: ({ root = null, connected = false, records = {}, freshStubs = {}, present = [], missingIds = [] } = {}) => set((state) => {
    const rootNow = root || state.shelfDiskRoot;
    const reset = !!(root && state.shelfDiskRoot && root !== state.shelfDiskRoot);
    const stubs = reset ? {} : { ...state.shelfDiskStubs };
    const diskRecords = reset ? {} : { ...state.shelfDiskRecords };
    const inApp = new Set((state.keeps || []).map((k) => k.id));
    for (const [id, rawRec] of Object.entries(records || {})) {
      if (inApp.has(id)) continue;
      const rec = sanitizeFavorite(rawRec);
      if (!rec || rec.id !== id) continue;
      diskRecords[id] = rec;
      if (freshStubs[id]) stubs[id] = { ...freshStubs[id], missing: false };
    }
    for (const p of present || []) {
      if (!p || typeof p.keepId !== 'string') continue;
      if (inApp.has(p.keepId)) { delete stubs[p.keepId]; delete diskRecords[p.keepId]; continue; }
      if (stubs[p.keepId]) stubs[p.keepId] = { ...stubs[p.keepId], rel: p.rel, missing: false };
      else if (freshStubs[p.keepId]) stubs[p.keepId] = { ...freshStubs[p.keepId] };
    }
    for (const id of missingIds || []) {
      if (inApp.has(id)) { delete stubs[id]; delete diskRecords[id]; continue; }
      // The file is gone; the stub stays and says so. A record already
      // read this session stays in hand (performable, promotable —
      // a promotion is now the only copy, which the import speaks).
      if (stubs[id]) stubs[id] = { ...stubs[id], missing: true };
    }
    persistDiskIndex(rootNow, stubs);
    return {
      shelfDiskRoot: rootNow, shelfDiskStubs: stubs, shelfDiskRecords: diskRecords,
      shelfDiskConnected: !!connected,
    };
  }),
  /** #1591 — the folder was forgotten (or changed): the disk tier
   * empties with its index. The files themselves are not touched. */
  clearShelfDisk: () => set(() => {
    persistDiskIndex(null, {});
    return { shelfDiskRoot: null, shelfDiskStubs: {}, shelfDiskRecords: {}, shelfDiskConnected: false };
  }),
  /**
   * #1591 — one export, completed by the runner (loot/shelfDiskRun
   * .mjs) AFTER the file is written and read back verified: the
   * record leaves the collection, its disk record + stub land, and
   * the move is a history record and a line on the shelf (Law 1:
   * nothing silently moves). A staged or performing keep can never
   * be exported from under the artist — the planner never names one
   * and this door refuses one all the same.
   */
  shelfExported: (keepId, stub) => set((state) => {
    const keep = (state.keeps || []).find((k) => k.id === keepId);
    if (!keep || !stub || stub.id !== keepId || typeof stub.rel !== 'string') return {};
    if ((state.keepStage || []).includes(keepId) || state.performingKeepId === keepId) return {};
    const keeps = state.keeps.filter((k) => k.id !== keepId);
    persistKeeps(keeps);
    const at = new Date().getTime();
    const shelfHistory = withShelfHistory(state, exportHistoryRecord(keepId, stub.rel, at));
    const shelfDiskStubs = { ...state.shelfDiskStubs, [keepId]: { ...stub, missing: false } };
    persistDiskIndex(state.shelfDiskRoot, shelfDiskStubs);
    const shelfDiskRecords = { ...state.shelfDiskRecords, [keepId]: keep };
    return {
      keeps, shelfHistory, shelfDiskStubs, shelfDiskRecords,
      shelfNotice: `exported to the loot folder — ${stub.label || keepId}`,
    };
  }),
  // Beat router: which consumers answer a mic attack when evolve SOURCE is
  // BEAT and the phrase CLOCK is AUDIO. 'both' (recommended) ticks the
  // phrase first, then fires evolve on the post-phrase state.
  beatRoute: 'both',

  // #966 — HITS queue transport: autoplay walks the favorites setlist.
  // Session-only (not persisted): it's a performance control, not curation.
  queuePlaying: false,
  queueIndex: 0,
  queueSource: 'time', // 'time' = seconds per hit, 'beat' = beats per hit at BEAT tempo
  queueSecondsPerHit: 8,
  queueBeatsPerHit: 4,
  // Bumped on every manual tray jump (tap / keys) so the autoplay hold
  // restarts even when the jumped-to hit is already the current one.
  queueJumpNonce: 0,

  morphEvolve: true,
  morphDurationMs: 1200,
  morphing: false,
  morphFrom: null,
  morphTo: null,
  morphStart: 0,
  morphPendingSeed: null,
  morphPendingPalette: null,
  // #305 — a morph-to-favorite lands the favorite's stream offsets with its seed.
  morphPendingSeedOffsets: null,

  phraseEnabled: false,
  phraseLength: 8,
  phraseMode: 'cycle-seed',
  phraseBeat: 0,
  phraseOriginSeed: null,
  phraseWrapGen: 0,
  phraseClock: 'audio',
  phraseBpm: 120,
  // #589 — Euclidean clock: k hits spread as evenly as possible over n steps.
  // The phrase advances on hit steps only, so the misses are part of the bar.
  euclidBeats: 5,
  euclidSteps: 8,
  euclidRotate: 0,

  setEvolveMode: (valOrFn) => set((state) => {
    const next = !!(typeof valOrFn === 'function' ? valOrFn(state.evolveMode) : valOrFn);
    if (next === !!state.evolveMode) return { evolveMode: next };
    // #808: run timing is loop time, not wall — the HUD cadence (secPerGen)
    // reads the real cadence, and the ticks land on the same clock.
    const now = loopClock.ms;
    // #616: start a fresh run on EVOLVE, keep a summary when it stops.
    return next
      ? { evolveMode: true, evolveRun: startRun(now) }
      : { evolveMode: false, evolveRun: null, evolveLast: finishRun(state.evolveRun, now) };
  }),
  setEvolveSource: (source) => set({ evolveSource: source }),
  setEvolveTarget: (target) => set({ evolveTarget: target }),
  setEvolveInterval: (interval) => set({ evolveInterval: interval }),
  setAutoSnapshot: (auto) => set({ autoSnapshot: auto }),
  setBeatRoute: (route) => set({ beatRoute: sanitizeBeatRoute(route) }),

  setMorphEvolve: (v) => set({ morphEvolve: !!v }),
  setMorphDurationMs: (ms) => set({
    morphDurationMs: Math.max(200, Math.min(8000, Number(ms) || 1200)),
  }),
  finishMorph: () => set((state) => ({
    morphing: false,
    morphFrom: null,
    morphTo: null,
    ...(state.morphPendingSeed != null ? { seed: state.morphPendingSeed } : {}),
    ...(state.morphPendingSeedOffsets ? { seedOffsets: state.morphPendingSeedOffsets } : {}),
    ...(state.morphPendingPalette ? { paletteId: state.morphPendingPalette } : {}),
    morphPendingSeed: null,
    morphPendingSeedOffsets: null,
    morphPendingPalette: null,
  })),

  setPhraseEnabled: (enabled) => set({ phraseEnabled: !!enabled, phraseBeat: 0 }),
  setPhraseLength: (len) => set({
    phraseLength: Math.max(2, Math.min(64, Number(len) || 8)),
    phraseBeat: 0,
  }),
  setPhraseMode: (mode) => set({ phraseMode: mode }),
  setPhraseClock: (clock) => set({
    phraseClock: PHRASE_CLOCKS.includes(clock) ? clock : 'audio',
  }),
  // Clamped against each other as well as to their ranges: beats > steps has
  // no Euclidean meaning (euclid.js degrades it to a plain metro).
  setEuclid: ({ beats, steps, rotate }) => set((state) => {
    const next = {};
    if (steps !== undefined) next.euclidSteps = Math.max(2, Math.min(EUCLID_MAX_STEPS, Math.round(Number(steps) || 8)));
    const n = next.euclidSteps ?? state.euclidSteps;
    if (beats !== undefined) next.euclidBeats = Math.max(0, Math.min(n, Math.round(Number(beats) || 0)));
    if (rotate !== undefined) next.euclidRotate = Math.max(0, Math.min(n - 1, Math.round(Number(rotate) || 0)));
    // A steps change can strand beats/rotate above the new ceiling.
    if (next.euclidSteps !== undefined) {
      next.euclidBeats = Math.min(next.euclidBeats ?? state.euclidBeats, n);
      next.euclidRotate = Math.min(next.euclidRotate ?? state.euclidRotate, n - 1);
    }
    return next;
  }),
  setPhraseBpm: (bpm) => set({ phraseBpm: Math.max(40, Math.min(240, Number(bpm) || 120)) }),
  armPhrase: (seed) => set({ phraseOriginSeed: seed, phraseBeat: 0 }),
  resetPhrase: () => set((state) => ({
    phraseBeat: 0,
    phraseWrapGen: (state.phraseWrapGen || 0) + 1,
    seed: state.phraseOriginSeed != null ? state.phraseOriginSeed : state.seed,
  })),

  tickPhraseBeat: () => set((state) => {
    const next = tickPhraseBeat(state, { stepGrid, createGrid });
    if (next.phraseDidWrap) {
      const rest = { ...next };
      delete rest.phraseDidWrap;
      return rest;
    }
    return next;
  }),

  triggerEvolve: (opts = {}) => set((state) => withEvolveStats(state, (() => {
    // #808: the stamp is loop time. Callers thread it through (App.jsx);
    // the event-bus path has no loop handle, so it reads the mirrored stamp.
    const ts = Number.isFinite(opts.loopTimeMs) ? opts.loopTimeMs : loopClock.ms;
    const caUpdate = state.layoutParams.mode === 'ca'
      ? { caGrid: state.caGrid ? stepGrid(state.caGrid) : createGrid(40, 28, state.seed) }
      : {};

    if (state.evolveTarget === 'seed') {
      return { ...caUpdate, seed: (state.seed + 1) % 1000000, lastEvolveTs: ts };
    }

    if (state.evolveTarget === 'palette') {
      const currentIdx = PALETTE_IDS.indexOf(state.paletteId);
      const nextIdx = (currentIdx + 1) % PALETTE_IDS.length;
      return { ...caUpdate, paletteId: PALETTE_IDS[nextIdx], lastEvolveTs: ts };
    }

    if (state.evolveTarget === 'layout' || state.evolveTarget === 'all') {
      // #1550: targets land through the validating door, like every other
      // write. generateLayoutTargets rolls the shared dice table now, whose
      // one declared overhang (density proposes to 120, PARAM_SPEC caps at
      // 100) must clamp at write time — the non-morph path below spreads
      // targets into layoutParams directly, and the morph path's endpoints
      // are what its validated per-tick writes interpolate toward. Only the
      // target keys are taken from the validated params; a rejected key
      // (none a roll can produce) keeps its current value, per the door's
      // partial-accept contract.
      const rolledTargets = generateLayoutTargets(state);
      const { params: validatedTargets, rejected: rejectedTargets } = validateLayoutParams(rolledTargets);
      const targets = {};
      for (const key of Object.keys(rolledTargets)) {
        if (!rejectedTargets.includes(key)) targets[key] = validatedTargets[key];
      }
      const seedUpdate = state.evolveTarget === 'all'
        ? { seed: (state.seed + 1) % 1000000 }
        : {};
      const paletteUpdate = state.evolveTarget === 'all'
        ? { paletteId: PALETTE_IDS[Math.floor(Math.random() * PALETTE_IDS.length)] }
        : {};

      if (state.morphEvolve) {
        const from = {};
        const to = {};
        for (const key of MORPHABLE_KEYS) {
          if (key in targets && !state.lockedParams[key]) {
            from[key] = state.layoutParams[key];
            to[key] = targets[key];
          }
        }
        return {
          // #107 §7: one undo entry for the whole morph, capturing the look
          // right before it starts — not one per lerp frame (useMorphEvolve
          // calls setLayoutParams, which never pushes undo, on every tick).
          ...pushToUndo(state, true),
          ...caUpdate,
          ...seedUpdate,
          ...paletteUpdate,
          morphing: true,
          morphFrom: from,
          morphTo: to,
          // #806: morph easing is a must-loop performer — stamp in loop ms
          // (useMorphEvolve reads loopClock.ms), never wall clock.
          morphStart: loopClock.ms,
          morphPendingSeed: null,
          morphPendingSeedOffsets: null,
          morphPendingPalette: null,
          lastEvolveTs: ts,
        };
      }

      return {
        ...caUpdate,
        ...seedUpdate,
        ...paletteUpdate,
        layoutParams: { ...state.layoutParams, ...targets },
        lastEvolveTs: ts,
      };
    }
    return {};
  })())),

  addFavorite: (fav) => set((state) => {
    const entry = sanitizeFavorite({ ...fav, id: genId() });
    if (!entry) return { shelfNotice: plateNotCapturedLine };
    const favNext = [...state.favorites, entry];
    const favDropped = Math.max(0, favNext.length - FAVORITES_MAX);
    const favorites = favNext.slice(-FAVORITES_MAX);
    persistFavorites(favorites);
    // #996 — a favorite implies a keep: same plate, its own record. Removing
    // the favorite later leaves this keep in place.
    // #1589 — the implied keep is a crown like any other: it routes into
    // the shelf (stage slot or collection + the line), never evicts.
    const keepEntry = sanitizeFavorite({ ...fav, id: genId() });
    let keeps = state.keeps;
    let keepStage = state.keepStage;
    let shelfHistory = state.shelfHistory;
    let crownLine = null;
    let lostLine = null;
    if (keepEntry) {
      const at = new Date().getTime();
      const routed = crownIntoShelf(state, keepEntry, at);
      keeps = routed.keeps;
      keepStage = routed.keepStage;
      shelfHistory = withShelfHistory(state, crownHistoryRecord(keepEntry.id, routed.landed, at));
      persistKeeps(keeps);
      persistStage(keepStage);
      if (routed.landed === 'collection') crownLine = ON_SHELF_COPY;
      // #1173 — the keep is a deliberate act: one line in the keeps ledger.
      appendLedgerSpoken('keeps', routed.entry, state.projectTitle, 'keep');
    } else {
      // #1643 — the favorite landed, but its implied keep could not be
      // captured: say so on the same line the crown speaks on.
      lostLine = plateNotCapturedLine;
    }
    // Audit S2 rider: a favorites-cap trim is no longer silent either.
    const lines = [favDropped ? favoritesTrimCopy(favDropped) : null, crownLine, lostLine].filter(Boolean);
    return { favorites, keeps, keepStage, shelfHistory, ...(lines.length ? { shelfNotice: lines.join(' — ') } : {}) };
  }),
  removeFavorite: (id) => set((state) => {
    const favorites = state.favorites.filter((f) => f.id !== id);
    persistFavorites(favorites);
    return { favorites };
  }),
  /**
   * Every pill in the HITS row at once. The keeps ledger is the artist's own finds and stays (two-ledger rule): a
   * pill is a place in the setlist, not a find. The queue goes back to the top.
   */
  clearFavorites: () => set((state) => {
    if (!Array.isArray(state.favorites) || state.favorites.length === 0) return {};
    persistFavorites([]);
    return { favorites: [], queueIndex: 0 };
  }),
  /**
   * #1124 — a setlist copy: the same recipe right after the original, its own id. It is NOT a new keep: the keeps
   * ledger is the artist's own finds (two-ledger rule), and copying a pill is not finding anything.
   */
  duplicateFavorite: (id) => set((state) => {
    const idx = state.favorites.findIndex((f) => f.id === id);
    if (idx < 0) return {};
    const copy = sanitizeFavorite({ ...state.favorites[idx], id: genId() });
    if (!copy) return {};
    const grown = [...state.favorites.slice(0, idx + 1), copy, ...state.favorites.slice(idx + 1)];
    const dropped = Math.max(0, grown.length - FAVORITES_MAX);
    const next = grown.slice(-FAVORITES_MAX);
    persistFavorites(next);
    // S2 rider: the duplicate's trim speaks too.
    return { favorites: next, ...(dropped ? { shelfNotice: favoritesTrimCopy(dropped) } : {}) };
  }),
  /** #996 — K keeps the current plate without starring it. Same capture as
   * a favorite (recipe, seed, offsets, cast); no star, no tray entry.
   * #1589 — a crown: routes into the shelf (stage slot, or the
   * collection with the line). Never refused, never evicting. */
  addKeep: (keep) => set((state) => {
    const entry = sanitizeFavorite({ ...keep, id: genId() });
    if (!entry) return { shelfNotice: plateNotCapturedLine };
    const at = new Date().getTime();
    const routed = crownIntoShelf(state, entry, at);
    const shelfHistory = withShelfHistory(state, crownHistoryRecord(entry.id, routed.landed, at));
    persistKeeps(routed.keeps);
    persistStage(routed.keepStage);
    appendLedgerSpoken('keeps', routed.entry, state.projectTitle, 'keep'); // #1173
    return {
      keeps: routed.keeps, keepStage: routed.keepStage, shelfHistory,
      ...(routed.landed === 'collection' ? { shelfNotice: ON_SHELF_COPY } : {}),
    };
  }),
  /**
   * #1589 — hand-swap: exchange one stage slot for a collection keep
   * (curator/shelf swapSlots owns the law: position preserved, the
   * performing Look's slot pinned, the budget a hard invariant). Both
   * keeps' lastStagedAt update — being chosen against is information
   * too (§3.6) — but only the incoming keep's stagedCount grows, and
   * nothing here feeds taste (swaps move membership, not the Queen).
   * A refusal lands in shelfNotice and changes nothing else.
   */
  swapStageSlot: (outId, inId) => set((state) => {
    // #1591 — the law reads the whole shelf (in-app + disk records):
    // swapping in a disk keep IS its re-import, in the same move.
    const res = swapSlots(allKeeps(state), state.keepStage, outId, inId, { performingKeepId: state.performingKeepId });
    if (!res.ok) return { shelfNotice: res.copy };
    const at = new Date().getTime();
    const inRel = state.shelfDiskStubs?.[inId]?.rel || exportRelFor(inId);
    const imported = importDiskKeep(state, inId);
    const base = imported || state;
    const keeps = base.keeps.map((k) => {
      if (k.id === inId) return { ...k, stagedCount: (k.stagedCount || 0) + 1, lastStagedAt: at };
      if (k.id === outId) return { ...k, lastStagedAt: at };
      return k;
    });
    const recs = [swapHistoryRecord(outId, inId, at)];
    if (imported) recs.push(importHistoryRecord(inId, inRel, at));
    const shelfHistory = withShelfHistoryMany(state, recs);
    persistKeeps(keeps);
    persistStage(res.stageIds);
    return {
      keeps, keepStage: res.stageIds, shelfHistory,
      ...(imported ? { shelfDiskRecords: imported.shelfDiskRecords, shelfDiskStubs: imported.shelfDiskStubs } : {}),
      shelfNotice: imported
        ? `back from disk — ${shelfLabelOf(keeps.find((k) => k.id === inId))}`
        : null,
    };
  }),
  /**
   * #1589 — promote a collection keep into a free stage slot (the shelf
   * view's "stage it"; a swap with nobody when the budget has room).
   * Recorded as a swap with an empty out side, the shape K2's ledger
   * consumes for membership changes that exchange nothing.
   */
  stageKeep: (keepId) => set((state) => {
    // #1591 — a disk keep promotes exactly like an in-app one; the
    // promotion is its re-import (the record joins the collection in
    // the same move, and the ledger carries both records).
    const merged = allKeeps(state);
    const keep = merged.find((k) => k.id === keepId);
    if (!keep) return {};
    const res = admitToStage(merged, state.keepStage, keep);
    if (!res.ok) return { shelfNotice: res.copy };
    const at = new Date().getTime();
    const inRel = state.shelfDiskStubs?.[keepId]?.rel || exportRelFor(keepId);
    const imported = importDiskKeep(state, keepId);
    const base = imported || state;
    const keeps = base.keeps.map((k) => (k.id === keepId
      ? { ...k, stagedCount: (k.stagedCount || 0) + 1, lastStagedAt: at }
      : k));
    const recs = [swapHistoryRecord(null, keepId, at)];
    if (imported) recs.push(importHistoryRecord(keepId, inRel, at));
    const shelfHistory = withShelfHistoryMany(state, recs);
    persistKeeps(keeps);
    persistStage(res.stageIds);
    return {
      keeps, keepStage: res.stageIds, shelfHistory,
      ...(imported ? { shelfDiskRecords: imported.shelfDiskRecords, shelfDiskStubs: imported.shelfDiskStubs } : {}),
      shelfNotice: imported
        ? `back from disk — ${shelfLabelOf(keeps.find((k) => k.id === keepId))}`
        : null,
    };
  }),
  /**
   * #1590 (Keeps K2) — the Kinetic fill: deal a new stage from the
   * whole collection (curator/shelfFill.mjs owns the deal; this owns
   * the write). The seed is the session seed (the current Look's)
   * mixed with the fill counter, and the fill RECORD carries it — a
   * fill replays bit-exactly from the same ledger state. The Queen's
   * ranking door: a usable taste head (either kind) orders consensus
   * through the existing scorer interface — scores order, they never
   * gate or deal (§7); with no usable head the deal falls back to the
   * kept centroid inside the pure fill. Dealt keeps are stamped like
   * any staging; the fill is ONE undo step (S7); a fill that can deal
   * nothing changes nothing and says why on the shelf's line.
   */
  fillStage: () => set((state) => {
    const prefs = state.shelfPrefs || DEFAULT_SHELF_PREFS;
    const fillsSoFar = (state.shelfHistory || []).filter((r) => r && r.kind === 'fill').length;
    let seed = ((Number(state.seed) >>> 0) ^ Math.imul(fillsSoFar + 1, 0x9e3779b9)) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
    const taste = getTaste();
    const head = taste?.head ?? null;
    const scoreOf = (head && headUsable(head, experimentalOn()))
      ? (keep) => scoreLayout(head, keep?.config?.layout ?? {})
      : null;
    const tableLabel = `${state.shelfPrefsSource === 'file' ? 'preferences.json' : 'shipped defaults'} · ${tableName(prefs)}`;
    // #1591 — the deal reads the whole shelf: disk keeps compete at
    // full weight (their records in hand), and the anchor's partiality
    // — the disk keeps whose records are NOT in hand — is named in
    // the receipt by the pure fill itself (audit S5).
    const acct = anchorAccount({
      stubs: state.shelfDiskStubs || {}, diskRecords: state.shelfDiskRecords || {},
      inAppIds: new Set((state.keeps || []).map((k) => k.id)),
    });
    const res = dealFill({
      keeps: allKeeps(state), stageIds: state.keepStage, history: state.shelfHistory,
      prefs, seed, scoreOf, performingKeepId: state.performingKeepId,
      assetsById: new Map(ASSETS.map((a) => [a.id, a])),
      anchorPartial: acct.unread.length,
    });
    if (!res.stageIds) {
      return { shelfNotice: res.receipt.notes.at(-1) || 'nothing to deal' };
    }
    const at = new Date().getTime();
    const dealtIds = new Set(res.dealt.map((d) => d.keepId));
    // #1591 — dealt disk keeps re-import in the same move: their
    // records join the collection before the stamps land, and each
    // import is its own ledger record under the fill's.
    let work = state;
    const importRecs = [];
    for (const d of res.dealt) {
      if (!(work.shelfDiskRecords || {})[d.keepId]) continue;
      const rel = work.shelfDiskStubs?.[d.keepId]?.rel || exportRelFor(d.keepId);
      const imp = importDiskKeep(work, d.keepId);
      if (imp) { work = { ...work, ...imp }; importRecs.push(importHistoryRecord(d.keepId, rel, at)); }
    }
    const keeps = work.keeps.map((k) => (dealtIds.has(k.id)
      ? { ...k, stagedCount: (k.stagedCount || 0) + 1, lastStagedAt: at }
      : k));
    const shelfHistory = withShelfHistoryMany(state, [
      fillHistoryRecord({
        seed: res.receipt.seed, table: tableLabel, slots: res.receipt.slots,
        undealt: res.receipt.undealt, notes: res.receipt.notes, at,
      }),
      ...importRecs,
    ]);
    persistKeeps(keeps);
    persistStage(res.stageIds);
    const c = res.receipt.dealtByRule;
    const summary = `the trio dealt a new stage — ${c.consensus} consensus · ${c.neglected} neglected · ${c.wild} wild · ${c.lois} lois · ${c.contrarian} contrarian`
      + (importRecs.length ? ` · ${importRecs.length} from disk` : '');
    return {
      ...pushToUndo(state, true, UNDO_KIND_SHELF),
      keeps, keepStage: res.stageIds, shelfHistory,
      ...(importRecs.length ? { shelfDiskRecords: work.shelfDiskRecords, shelfDiskStubs: work.shelfDiskStubs } : {}),
      shelfNotice: res.receipt.undealt.length
        ? `${summary} — undealt: ${res.receipt.undealt.join(', ')}`
        : summary,
    };
  }),
  /**
   * #1173 — X passes on the current plate: same capture as a keep, one line in
   * the passes ledger. #1753: a landed pass also bumps `passCount`, the one
   * store change, so taste pressure can read the keeps-vs-passes share
   * (decision 5). Nothing on screen changes.
   */
  addPass: (rec) => set((state) => {
    const entry = sanitizeFavorite({ ...rec, id: genId() });
    // #1643 — a pass changes nothing on screen BY DESIGN, so a swallowed
    // press was indistinguishable from a landed one. Both failure shapes
    // now answer: an uncapturable plate, and a rejected/refused append.
    if (!entry) return { shelfNotice: plateNotCapturedLine };
    const row = appendLedgerSpoken('passes', entry, state.projectTitle, 'pass');
    return row ? { passCount: (state.passCount || 0) + 1 } : {};
  }),
  /**
   * #1051 — replace the performer's shelf from an imported bundle. Same
   * sanitizer and caps as the localStorage reader (a file is a trust
   * boundary), same persistence. A list that is not an array is ignored, so
   * a refused bundle part can never wipe what is here.
   */
  importShelf: ({ favorites, keeps } = {}) => {
    const out = {};
    if (Array.isArray(favorites)) {
      out.favorites = favorites.map(sanitizeFavorite).filter(Boolean).slice(0, FAVORITES_MAX);
      persistFavorites(out.favorites);
    }
    if (Array.isArray(keeps)) {
      // #1589 — an imported shelf replaces the collection whole (no cap
      // slice: the collection is not a cliff) and its stage re-derives
      // by the migration rule, exactly as a first boot would derive it.
      out.keeps = keeps.map(sanitizeFavorite).filter(Boolean);
      out.keepStage = deriveStageIds(out.keeps);
      persistKeeps(out.keeps);
      persistStage(out.keepStage);
    }
    if (Object.keys(out).length) set(() => out);
    // #1064 — what actually landed, so the result line can be honest about caps.
    return { ...(out.favorites ? { favorites: out.favorites.length } : null), ...(out.keeps ? { keeps: out.keeps.length } : null) };
  },
  reorderFavorite: (id, delta) => set((state) => {
    const idx = state.favorites.findIndex((f) => f.id === id);
    if (idx < 0) return {};
    const j = Math.max(0, Math.min(state.favorites.length - 1, idx + delta));
    if (j === idx) return {};
    const next = [...state.favorites];
    const [item] = next.splice(idx, 1);
    next.splice(j, 0, item);
    persistFavorites(next);
    return { favorites: next };
  }),
  recallFavorite: (fav) => set((state) => ({
    ...keepStackPatch(state, fav),
    // #1589 (S1) — loading a keep pins it as the performing Look: its
    // stage slot now refuses swaps until another keep is loaded.
    ...(performingIdFor(state, fav) ? { performingKeepId: performingIdFor(state, fav) } : {}),
    seed: fav.seed,
    // #305 — a kept recipe replays its stream offsets too.
    seedOffsets: normalizeSeedOffsets(fav.seedOffsets),
    // the picture comes back; the audio setup stays as it is live (state/audioRig.js — Matt, 2026-10-14: "always live")
    ...(fav.config?.layout ? { layoutParams: withLiveRig(fav.config.layout, state.layoutParams) } : {}),
    ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
    // #719 — the kept cast comes back too; legacy keeps (no cast) leave the pool alone.
    ...(fav.config?.assets?.length ? { enabledAssets: castToEnabled(fav.config.assets) } : {}),
  })),
  morphToFavorite: (fav) => set((state) => ({ ...((state) => {
    const target = fav.config?.layout ? withLiveRig(fav.config.layout, state.layoutParams) : fav.config?.layout; // audio setup stays live
    // #305 — old favorites carry no offsets → zeros, like a fresh project.
    const favOffsets = normalizeSeedOffsets(fav.seedOffsets);
    // #719 — the cast swaps at the press, like a shape chip (item-morph flies
    // the nodes into their new costumes); layout keeps its own morph below.
    const cast = fav.config?.assets?.length ? { enabledAssets: castToEnabled(fav.config.assets) } : {};
    if (!target || typeof target !== 'object') {
      return {
        ...cast,
        seed: fav.seed,
        seedOffsets: favOffsets,
        ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
      };
    }
    const from = {};
    const to = {};
    for (const key of MORPHABLE_KEYS) {
      if (key in target && state.layoutParams[key] !== undefined) {
        from[key] = state.layoutParams[key];
        to[key] = target[key];
      }
    }
    const discrete = {};
    for (const [k, v] of Object.entries(target)) {
      if (!(k in from) && k !== 'composition') discrete[k] = v;
    }
    if (Object.keys(to).length === 0) {
      return {
        ...cast,
        seed: fav.seed,
        seedOffsets: favOffsets,
        layoutParams: { ...state.layoutParams, ...target },
        ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
      };
    }
    return {
      // #107 §7: same one-entry-per-morph undo as triggerEvolve above.
      ...pushToUndo(state, true),
      ...cast,
      layoutParams: { ...state.layoutParams, ...discrete },
      morphing: true,
      morphFrom: from,
      morphTo: to,
      // #806: morph easing is a must-loop performer — stamp in loop ms
      // (useMorphEvolve reads loopClock.ms), never wall clock.
      morphStart: loopClock.ms,
      morphPendingSeed: fav.seed,
      morphPendingSeedOffsets: favOffsets,
      morphPendingPalette: fav.config?.palette.id || null,
    };
  })(state), ...keepStackPatch(state, fav),
  // #1589 (S1) — a morph lands the keep on the deck too: same pin as recall.
  ...(performingIdFor(state, fav) ? { performingKeepId: performingIdFor(state, fav) } : {}) })),

  // #966 — HITS queue transport actions.
  setQueuePlaying: (on) => set({ queuePlaying: !!on }),
  toggleQueuePlaying: () => set((state) => ({ queuePlaying: !state.queuePlaying })),
  setQueueIndex: (i) => set({ queueIndex: Math.max(0, Math.floor(Number(i) || 0)) }),
  setQueueSource: (source) => set({ queueSource: source === 'beat' ? 'beat' : 'time' }),
  setQueueSecondsPerHit: (s) => set({ queueSecondsPerHit: sanitizeQueueSeconds(s) }),
  setQueueBeatsPerHit: (b) => set({ queueBeatsPerHit: sanitizeQueueBeats(b) }),
  bumpQueueJump: () => set((state) => ({ queueJumpNonce: state.queueJumpNonce + 1 })),
  };
};
