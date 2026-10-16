import { startRun, tickRun, finishRun } from '../../data/evolveProgress.js';
import { loopClock } from '../../gl/loopClock.js';
import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import { generateLayoutTargets, MORPHABLE_KEYS, PALETTE_IDS } from '../paramUtils.js';
import { genId } from '../id.js';
import { stackOf, expandStack } from '../recipeStack.js'; // #1131: a keep carries the layer stack
import { tickPhraseBeat } from '../phraseTick.js';
import { sanitizeBeatRoute } from '../beatArbiter.js';
import { pushToUndo, UNDO_KIND_LAYERS } from '../history.js';
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
  crownHistoryRecord, swapHistoryRecord, sanitizeHistoryRecord,
  ON_SHELF_COPY, favoritesTrimCopy,
} from '../../curator/shelf.mjs';
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
  return {
    ...(stackOk ? { stack: JSON.parse(JSON.stringify(raw.stack)) } : {}),
    ...(bands ? { bands } : {}),
    ...(provenance ? { provenance } : {}),
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

function readFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(sanitizeFavorite).filter(Boolean).slice(0, FAVORITES_MAX)
      : [];
  } catch {
    return [];
  }
}

function persistFavorites(list) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[favorites] save failed', e);
  }
}

/** #996 — keeps persist exactly like favorites (same record shape).
 * #1589: NO length slice on the way in or out — the collection is not a
 * cliff. A stored list longer than the old 200 cap (a foreign bundle, a
 * pre-cap build) loads whole: migration must be lossless on the real
 * record shapes, and a read-path trim would be the old silent eviction
 * wearing a new coat. */
function readKeeps() {
  try {
    const raw = localStorage.getItem(KEEPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(sanitizeFavorite).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function persistKeeps(list) {
  try {
    localStorage.setItem(KEEPS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[keeps] save failed', e);
  }
}

function persistStage(ids) {
  try {
    localStorage.setItem(STAGE_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn('[keeps] stage save failed', e);
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

function readShelfHistory() {
  try {
    const raw = localStorage.getItem(SHELF_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(sanitizeHistoryRecord).filter(Boolean).slice(-SHELF_HISTORY_MAX)
      : [];
  } catch {
    return [];
  }
}

function persistShelfHistory(list) {
  try {
    localStorage.setItem(SHELF_HISTORY_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[keeps] shelf history save failed', e);
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
  const list = [...(state.shelfHistory || []), record].slice(-SHELF_HISTORY_MAX);
  persistShelfHistory(list);
  return list;
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
  favorites: readFavorites(),
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
  keepStage: readStage(bootKeeps),
  shelfHistory: readShelfHistory(),
  shelfNotice: null,
  setShelfNotice: (msg) => set({ shelfNotice: typeof msg === 'string' && msg ? msg : null }),
  performingKeepId: null,
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
      ? { caGrid: state.caGrid ? stepGrid(state.caGrid) : createGrid(40, 28) }
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
    if (!entry) return {};
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
      appendToLedger('keeps', routed.entry, state.projectTitle);
    }
    // Audit S2 rider: a favorites-cap trim is no longer silent either.
    const lines = [favDropped ? favoritesTrimCopy(favDropped) : null, crownLine].filter(Boolean);
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
    if (!entry) return {};
    const at = new Date().getTime();
    const routed = crownIntoShelf(state, entry, at);
    const shelfHistory = withShelfHistory(state, crownHistoryRecord(entry.id, routed.landed, at));
    persistKeeps(routed.keeps);
    persistStage(routed.keepStage);
    appendToLedger('keeps', routed.entry, state.projectTitle); // #1173
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
    const res = swapSlots(state.keeps, state.keepStage, outId, inId, { performingKeepId: state.performingKeepId });
    if (!res.ok) return { shelfNotice: res.copy };
    const at = new Date().getTime();
    const keeps = state.keeps.map((k) => {
      if (k.id === inId) return { ...k, stagedCount: (k.stagedCount || 0) + 1, lastStagedAt: at };
      if (k.id === outId) return { ...k, lastStagedAt: at };
      return k;
    });
    const shelfHistory = withShelfHistory(state, swapHistoryRecord(outId, inId, at));
    persistKeeps(keeps);
    persistStage(res.stageIds);
    return { keeps, keepStage: res.stageIds, shelfHistory, shelfNotice: null };
  }),
  /**
   * #1589 — promote a collection keep into a free stage slot (the shelf
   * view's "stage it"; a swap with nobody when the budget has room).
   * Recorded as a swap with an empty out side, the shape K2's ledger
   * consumes for membership changes that exchange nothing.
   */
  stageKeep: (keepId) => set((state) => {
    const keep = state.keeps.find((k) => k.id === keepId);
    if (!keep) return {};
    const res = admitToStage(state.keeps, state.keepStage, keep);
    if (!res.ok) return { shelfNotice: res.copy };
    const at = new Date().getTime();
    const keeps = state.keeps.map((k) => (k.id === keepId
      ? { ...k, stagedCount: (k.stagedCount || 0) + 1, lastStagedAt: at }
      : k));
    const shelfHistory = withShelfHistory(state, swapHistoryRecord(null, keepId, at));
    persistKeeps(keeps);
    persistStage(res.stageIds);
    return { keeps, keepStage: res.stageIds, shelfHistory, shelfNotice: null };
  }),
  /**
   * #1173 — X passes on the current plate: same capture as a keep, one line in
   * the passes ledger, nothing else. No store state changes, so no live
   * influence (taste pressure from passes is Phase 4, #1356 — not here).
   */
  addPass: (rec) => set((state) => {
    const entry = sanitizeFavorite({ ...rec, id: genId() });
    if (entry) appendToLedger('passes', entry, state.projectTitle);
    return {};
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
