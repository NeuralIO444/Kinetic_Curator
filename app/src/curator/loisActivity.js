// loisActivity.js — the LOIS honest feed (#948/#956).
//
// The single place user-behavior signals are recorded for the curator
// persona. Every LOIS state must be driven by a REAL signal — never a timer
// pretending to have an opinion. This module only records and exposes; the
// surfaces (HUD pill #948, TUI #956) come later.
//
// #1391 — telemetry gap closure (G2–G7, G9–G15 from
// docs/research/telemetry-gap-closure-2026-10-12.md). Instruments 8+ below
// record the raw signals the 16-state voice records read: per-keep roll
// cost (HUNT), undo bursts + param-tweak collisions (EDGE), recall seed age
// (ECHO), session cadence + keep trend (TIDE / WANE), per-seed pass runs
// (WEED), evolve-from-kept (GRAFT), mid-roll cast changes (DROWN),
// return-to-bloomed-seed (EMBER), MIDI presence (Queen M11). Still records
// only — no state here judges, nothing renders from this module.
//
// Wall-clock lives HERE, never in the store (#806: slice files are must-loop
// performers — same pattern as the kinetic button's useRef). It subscribes
// to the existing event bus plus one passive store subscription; it writes
// nothing, renders nothing, changes nothing visible.
import { Events, on, emit } from '../composition/eventBus.js';

// Feed tunables — surfaces read these, nothing else sets them.
export const LOIS_AWAY_MS = 5 * 60 * 1000; // AWAY: "he's out of the room" is literally true
// BURN: a hot streak, chain-smoking: this many keeps inside the rolls-vs-keeps window below (#1126; it used to mean
// fifteen minutes of nothing, which contradicted the word).
export const LOIS_BURN_KEEPS = 3;
// Davis reads the same feed through his own windows (#1126); the thresholds live with his states, in davisState.js.
import { getDishReading } from './dishPressure.js'; // #1356 step 4: the room reads the dish
import { DAVIS_UGLY_PASSES, DAVIS_UGLY_WINDOW_MS, DAVIS_FLOW_WINDOW_MS } from './davisState.js';
import { VERDICT_WINDOW } from './stress.js'; // #1753: the verdict window taste pressure reads
// A keep reaches the feed from two doors (the bus event, and the store's own list growing, which F / the star / K
// use directly). Two notes this close together are the one keep.
const KEEP_DEDUPE_MS = 250;
export const LOIS_VIBE_DWELL_MS = 8000; // VIBE starting point: lingered this long, no action (tune by feel)
export const LOIS_ROLL_KEEP_WINDOW_MS = 5 * 60 * 1000; // rolls-vs-keeps window
export const ACTIVITY_HEARTBEAT_MS = 5000; // #1390 (G8): the bus heartbeat cadence while the artist is active
export const LOIS_UNDO_BURST_WINDOW_MS = 10 * 1000; // undo-burst window
// #1391 feed tunables (same status as LOIS_BURN_KEEPS: the feed names the
// grain, the voice states set their own thresholds on top).
export const LOIS_UNDO_BURST_MIN = 3; // undos inside the window that make a burst (EDGE's ground floor)
export const LOIS_TREND_WINDOW_MS = 5 * 60 * 1000; // keep-trend / cadence bucket width
export const LOIS_TREND_WINDOWS = 4; // keep-trend series length (WANE reads the drop across these)
export const LOIS_CADENCE_WINDOWS = 12; // cadence series cap: the most recent hour of buckets (TIDE)
const LOG_CAP = 100; // per-log memory bound
const ROLL_LOG_CAP = 600; // session-scale roll log for cadence (timestamps only)

const cap = (arr) => {
  if (arr.length > LOG_CAP) arr.splice(0, arr.length - LOG_CAP);
};
const countSince = (list, windowMs, nowTs) => {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (nowTs - list[i] > windowMs) break;
    n++;
  }
  return n;
};

/**
 * Parse a favorite timestamp honestly. Full epoch ISO (current format)
 * resolves to ms; legacy "HH:MM:SS" (time-of-day only, pre-#948) resolves to
 * null — no date means no conviction timing, and we never invent one.
 */
export function parseFavoriteTimestamp(ts) {
  if (typeof ts !== 'string' || !ts) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(ts)) return null; // legacy: date unknown
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

/** #1391 G14 — a cast's signature: the enabled asset ids, sorted. */
function castSignature(enabled) {
  if (!enabled || typeof enabled !== 'object') return { sig: '', size: 0 };
  const ids = Object.keys(enabled)
    .filter((k) => enabled[k])
    .sort();
  return { sig: ids.join(','), size: ids.length };
}

export function createLoisActivity({
  now = () => Date.now(),
  setInterval: si = globalThis.setInterval,
  clearInterval: ci = globalThis.clearInterval,
} = {}) {
  const t = () => now();
  const s = {
    lastActivityTs: t(),
    tabHidden: false,
    seedSetAt: t(),
    seed: null,
    dwell: null, // open window: { seed, comp, startedAt }
    dwells: [], // closed windows: { seed, comp, ms }
    favorites: [], // { ts, msSinceSeed, seed, paletteId }
    recalls: [], // { ts, seed }
    exports: [], // { ts, seed, paletteId }
    rolls: [], // ts of curate + KINETIC taps
    keeps: [], // ts of keeps (any door: F, the star, J)
    passes: [], // ts of rolls that replaced a frame nobody kept (a roll while frameKept was false): Davis's UGLY
    evolves: [], // ts of EVOLVE fires: the generator rolling with nobody at the controls
    seedChanges: [], // ts the seed value changed
    rollsSinceSeed: 0,
    bloomAt: null, // ts of a keep that followed a run of passes: the ugly paid off
    bloomDepth: 0, // how many rolls (passes) that run held: the number an earned voice carries (#1153)
    activityCount: 0, // #1354: real artist actions since launch (beat() calls); a count, never a duration
    verdicts: [], // #1753: the last few deliberate verdicts, 'keep' | 'pass' (X), oldest first — taste pressure's share
    passCount: 0, // #1753: the store's pass counter as last seen
    passRun: 0, // the artist's own passes (CURATOR, KIN) since the last keep; EVOLVE fires are Davis's and do not count
    muted: 0, // >0 while the machine (the dead-frame guard) is re-dealing: not the artist, not noted
    frameKept: false, // the frame on screen was kept: true from a keep until the next roll or seed change (#1126: NOD)
    keepNote: { at: -Infinity, door: null },
    favNote: { at: -Infinity, door: null },
    undos: [], // ts
    seedRevisit: false,
    // --- #1391 instruments -------------------------------------------------
    sessionStart: null, // ts start() wired the feed: session length + cadence read from here (G10)
    rollsAll: [], // ts of ARTIST rolls only (curate + KINETIC taps), session-scale, for cadence (G10)
    rollsSinceKeep: 0, // artist rolls since the last keep: the live rolls-per-keep counter (G6)
    keepCosts: [], // { ts, rolls } — rolls expended to earn each keep (G6 / HUNT)
    tweaks: [], // { ts, key } param tweaks off the bus (LAYOUT_PARAM) (G7)
    bursts: [], // { ts, size } undo runs that reached LOIS_UNDO_BURST_MIN (G7)
    burstRun: null, // open undo run: { first, last, size, noted }
    collisions: [], // { ts, key, undos } a tweak that landed inside an undo burst (G7 / EDGE)
    passLog: [], // { ts, seed } passes WITH the seed they rejected (G12)
    passClusterSeed: null, // seed of the current run of consecutive passes (G12 / WEED)
    passClusterLen: 0,
    bloomedSeeds: new Map(), // seed -> { ts, depth } seeds that bloomed this session (G15)
    bloomReturns: [], // { ts, seed } landings back on a bloomed seed (G15 / EMBER)
    evolvesFromKept: [], // { ts, seed } EVOLVE fired off a seed the artist had kept (G13 / GRAFT)
    castChanges: [], // { ts, kind, seed, ... } palette/cast changes while a rolled frame was live (G14 / DROWN)
    midi: { present: false, inputs: [], state: 'off', lastMsgAt: null }, // observed MIDI presence (G9 / M11)
  };
  const unsubs = [];
  let removeDomListeners = null;
  let heartbeatTimer = null;

  const beat = () => {
    s.lastActivityTs = t();
    s.activityCount += 1; // #1354: every real artist action, counted (the stress signal reads the count, not a clock)
  };

  // #1390 (G8) — the activity heartbeat ON THE BUS. beat() above is the
  // internal pulse; this publishes it at a steady cadence so session-cadence
  // signals (G10 / TIDE) have something real to read. It publishes only while
  // the artist is active — inside the same AWAY window that defines idle —
  // and the timer dies with stop(), so an idle or closed instrument has no
  // pulse to report. Payload is the moment and the honest idle reading,
  // nothing inferred.
  const tickHeartbeat = () => {
    const at = t();
    const idleMs = at - s.lastActivityTs;
    if (idleMs >= LOIS_AWAY_MS) return;
    emit(Events.ACTIVITY_HEARTBEAT, { ts: at, idleMs });
  };

  // Instrument 5 — dwell windows. Called on seed/composition change via the
  // passive store subscription in start(); closing the old window first.
  function noteSeed(seed, comp) {
    const at = t();
    if (s.dwell && (s.dwell.seed !== seed || s.dwell.comp !== comp)) {
      s.dwells.push({ seed: s.dwell.seed, comp: s.dwell.comp, ms: at - s.dwell.startedAt });
      cap(s.dwells);
    }
    const seen = s.dwells.some((d) => d.seed === seed);
    s.dwell = { seed, comp, startedAt: at };
    s.frameKept = false; // a new seed or composition is not the frame that was kept
    s.seedRevisit = seen && s.seed !== seed;
    const first = s.seed === null;
    if (s.seed !== seed) {
      // #1391 G15 — landing on a seed again after it bloomed (and was left):
      // EMBER's raw event. Recorded here, judged by Davis's states.
      if (seed != null && s.bloomedSeeds.has(seed)) {
        s.bloomReturns.push({ ts: at, seed });
        cap(s.bloomReturns);
      }
      s.seed = seed;
      s.seedSetAt = at;
      s.rollsSinceSeed = 0;
      if (first === false) {
        s.seedChanges.push(at);
        cap(s.seedChanges);
      } // loading a seed is not dropping one
    }
  }

  // One keep, however it arrived. The bus carries the DAVIS star; F, the star and K also dispatch straight to the
  // store, so the store's own lists growing is the signal that never misses (#1001 found the same gap for the pill).
  function noteKeep(door, at) {
    if (s.keepNote.door !== door && at - s.keepNote.at < KEEP_DEDUPE_MS) return;
    s.keepNote = { at, door };
    // a keep after a run of passes is the payoff (Davis BLOOM); count the passes BEFORE this keep lands
    const bloomed = countSince(s.passes, DAVIS_UGLY_WINDOW_MS, at) >= DAVIS_UGLY_PASSES;
    const rolls = s.passRun;
    if (bloomed) {
      s.bloomAt = at;
      s.bloomDepth = rolls;
      // #1391 G15 — remember WHICH seed bloomed, so a later return is visible.
      if (s.seed != null) s.bloomedSeeds.set(s.seed, { ts: at, depth: rolls });
    }
    s.passRun = 0;
    // #1391 G6 — the keep cost: how many artist rolls this keep took (HUNT).
    s.keepCosts.push({ ts: at, rolls: s.rollsSinceKeep });
    cap(s.keepCosts);
    s.rollsSinceKeep = 0;
    // #1391 G12 — a keep breaks any run of consecutive passes.
    s.passClusterSeed = null;
    s.passClusterLen = 0;
    s.keeps.push(at);
    cap(s.keeps);
    noteVerdict('keep');
    s.frameKept = true;
    beat();
    // announced AFTER the ledgers are updated and while the kept frame is still the live one (#1153 mints from it)
    if (bloomed) emit(Events.BLOOM, { rolls, at });
  }
  // #1753 — one deliberate verdict (a keep from any door, or X), kept to a short window for taste pressure.
  function noteVerdict(v) {
    s.verdicts.push(v);
    if (s.verdicts.length > VERDICT_WINDOW) s.verdicts.splice(0, s.verdicts.length - VERDICT_WINDOW);
  }
  const keepListeners = new Set();
  function noteFavorite(fav, at, door) {
    if (s.favNote.door !== door && at - s.favNote.at < KEEP_DEDUPE_MS) return;
    s.favNote = { at, door };
    for (const fn of keepListeners) {
      try {
        fn();
      } catch {
        /* a listener must not break the ledger */
      }
    }
    s.favorites.push({
      ts: at,
      msSinceSeed: at - s.seedSetAt,
      seed: fav.seed ?? null,
      paletteId: fav.config?.palette?.id ?? null,
    });
    cap(s.favorites);
  }

  function snapshot() {
    const at = t();
    const idleMs = at - s.lastActivityTs;
    const last = s.favorites[s.favorites.length - 1] || null;
    // #1391 G10/G11 — windowed series, computed from the recorded logs:
    // keep counts across consecutive trend windows (oldest → newest, the
    // last is the live partial window), and artist-roll counts per cadence
    // bucket since the session started.
    const keepTrend = [];
    for (let w = LOIS_TREND_WINDOWS - 1; w >= 0; w--) {
      const hi = at - w * LOIS_TREND_WINDOW_MS;
      const lo = hi - LOIS_TREND_WINDOW_MS;
      keepTrend.push(s.keeps.filter((k) => k > lo && k <= hi).length);
    }
    const rollCadence = [];
    if (s.sessionStart != null) {
      const total = Math.floor((at - s.sessionStart) / LOIS_TREND_WINDOW_MS) + 1;
      const offset = Math.max(0, total - LOIS_CADENCE_WINDOWS); // long sessions: the most recent windows
      const n = total - offset;
      for (let b = 0; b < n; b++) rollCadence.push(0);
      for (const r of s.rollsAll) {
        const b = Math.floor((r - s.sessionStart) / LOIS_TREND_WINDOW_MS) - offset;
        if (b >= 0 && b < n) rollCadence[b] += 1;
      }
    }
    return {
      now: at,
      idleMs,
      away: idleMs >= LOIS_AWAY_MS,
      burning: countSince(s.keeps, LOIS_ROLL_KEEP_WINDOW_MS, at) >= LOIS_BURN_KEEPS,
      frameKept: s.frameKept,
      tabHidden: s.tabHidden,
      dwellMs: s.dwell ? at - s.dwell.startedAt : 0,
      dwellSeed: s.dwell ? s.dwell.seed : null,
      seedRevisit: !!s.seedRevisit,
      lastDwellMs: s.dwells.length ? s.dwells[s.dwells.length - 1].ms : 0,
      lastFavorite: last,
      favoriteCount: s.favorites.length,
      recallCount: s.recalls.length,
      exportCount: s.exports.length,
      lastRollAgoMs: s.rolls.length ? at - s.rolls[s.rolls.length - 1] : null, // #1122: the V pill breathes only after a real roll
      rollsLast5m: countSince(s.rolls, LOIS_ROLL_KEEP_WINDOW_MS, at),
      keepsLast5m: countSince(s.keeps, LOIS_ROLL_KEEP_WINDOW_MS, at),
      undosLast10s: countSince(s.undos, LOIS_UNDO_BURST_WINDOW_MS, at),
      // #1356 step 4: how crowded the dish is around the pins (null with no pins)
      dishPressure: getDishReading(),
      // Davis's inputs (#1126)
      rollsLastMinute: countSince(s.rolls, DAVIS_FLOW_WINDOW_MS, at),
      passesLast2m: countSince(s.passes, DAVIS_UGLY_WINDOW_MS, at),
      seedAgeMs: s.seed == null ? 0 : at - s.seedSetAt,
      seedDropped: s.seedChanges.length > 0, // a seed was dropped this session (the first one was only loaded)
      rollsSinceSeed: s.rollsSinceSeed,
      keptThisSeed: s.keeps.some((k) => k >= s.seedSetAt),
      bloomAgeMs: s.bloomAt == null ? null : at - s.bloomAt,
      bloomAt: s.bloomAt,
      bloomDepth: s.bloomDepth,
      evolveCount: s.evolves.length,
      // --- #1391 gap-closure signals (recorded data; states judge) ---------
      lastRecall: s.recalls[s.recalls.length - 1] || null, // G3: { ts, seed, favTs, seedAgeMs }
      lastExport: s.exports[s.exports.length - 1] || null, // G4: { ts, seed, paletteId }
      sessionStart: s.sessionStart, // G10
      sessionLengthMs: s.sessionStart == null ? 0 : at - s.sessionStart, // G10
      rollCadence, // G10: artist rolls per trend window since session start, oldest → newest
      keepTrend, // G11: keeps per trend window, oldest → newest (WANE reads the drop)
      rollsSinceKeep: s.rollsSinceKeep, // G6: the live rolls-per-keep counter (HUNT)
      lastKeepCost: s.keepCosts.length ? s.keepCosts[s.keepCosts.length - 1].rolls : null, // G6
      keepCostCount: s.keepCosts.length, // G6
      tweakCount: s.tweaks.length, // G7
      lastTweak: s.tweaks[s.tweaks.length - 1] || null, // G7
      undoBurstCount: s.bursts.length, // G7
      lastUndoBurst: s.bursts[s.bursts.length - 1] || null, // G7: { ts, size }
      undoBurstSize: s.burstRun && at - s.burstRun.last <= LOIS_UNDO_BURST_WINDOW_MS ? s.burstRun.size : 0, // G7: the live run
      tweakCollisionCount: s.collisions.length, // G7 / EDGE
      lastTweakCollision: s.collisions[s.collisions.length - 1] || null, // G7 / EDGE
      passClusterSeed: s.passClusterLen > 0 ? s.passClusterSeed : null, // G12 / WEED
      passClusterLen: s.passClusterLen, // G12 / WEED: consecutive passes on one seed
      lastPass: s.passLog[s.passLog.length - 1] || null, // G12
      evolveFromKeptCount: s.evolvesFromKept.length, // G13 / GRAFT
      lastEvolveFromKept: s.evolvesFromKept[s.evolvesFromKept.length - 1] || null, // G13 / GRAFT
      castChangeCount: s.castChanges.length, // G14 / DROWN
      lastCastChange: s.castChanges[s.castChanges.length - 1] || null, // G14 / DROWN
      bloomedSeedCount: s.bloomedSeeds.size, // G15
      bloomReturnCount: s.bloomReturns.length, // G15 / EMBER
      lastBloomReturn: s.bloomReturns[s.bloomReturns.length - 1] || null, // G15 / EMBER
      midiPresent: s.midi.present, // G9 / M11 — presence only, no mapping
      midiInputs: [...s.midi.inputs], // G9
      midiState: s.midi.state, // G9
      midiLastMsgAgoMs: s.midi.lastMsgAt == null ? null : at - s.midi.lastMsgAt, // G9
    };
  }

  function start({ store } = {}) {
    // #1390 (G8) — the bus heartbeat runs for the instrument's lifetime;
    // stop() clears it. unref'd where the runtime allows (node selfchecks)
    // so the timer alone never holds a process open.
    if (heartbeatTimer === null && typeof si === 'function') {
      heartbeatTimer = si(tickHeartbeat, ACTIVITY_HEARTBEAT_MS);
      if (heartbeatTimer && typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
    }

    if (s.sessionStart == null) s.sessionStart = t(); // #1391 G10 — the session clock starts when the feed wires up
    // Instrument 1 — activity heartbeat. DOM-only; guarded for node/selfcheck.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const onBeat = () => beat();
      const onVis = () => {
        s.tabHidden = document.hidden;
        if (!document.hidden) beat(); // coming back counts as activity
      };
      window.addEventListener('pointerdown', onBeat, { passive: true });
      window.addEventListener('keydown', onBeat, { passive: true });
      document.addEventListener('visibilitychange', onVis);
      removeDomListeners = () => {
        window.removeEventListener('pointerdown', onBeat);
        window.removeEventListener('keydown', onBeat);
        document.removeEventListener('visibilitychange', onVis);
      };
    }

    // Instruments 2+3 — favorite:add (with ms-since-seed for GOLD timing) and
    // favorite:recall (the revisit signal). Both already ride DAVIS_FAVORITE.
    unsubs.push(
      on(Events.DAVIS_FAVORITE, (p) => {
        if (!p || typeof p !== 'object') return;
        const at = t();
        if (p.action === 'add' && p.favorite) {
          noteFavorite(p.favorite, at, 'bus');
          noteKeep('bus', at);
        } else if (p.action === 'recall' && p.favorite) {
          // #1391 G3 — a recall is a logged event, and it carries the recalled
          // seed's age: ECHO reads "a seed older than a day, recalled" from
          // exactly this. Legacy favorites (time-of-day stamp) age honestly
          // to null — never invented.
          const favTs = parseFavoriteTimestamp(p.favorite.timestamp);
          s.recalls.push({
            ts: at,
            seed: p.favorite.seed ?? null,
            favTs,
            seedAgeMs: favTs != null ? at - favTs : null,
          });
          cap(s.recalls);
          beat();
        }
      }),
    );

    // Instrument 4 — export hook: they took it with them (stronger than a favorite).
    unsubs.push(
      on(Events.EXPORT_SNAPSHOT, (p) => {
        s.exports.push({ ts: t(), seed: p?.seed ?? null, paletteId: p?.config?.palette?.id ?? null });
        cap(s.exports);
        beat();
      }),
    );

    // #1391 G7 — param tweaks: every LAYOUT_PARAM off the bus is a hand on a
    // control. A tweak that lands while an undo burst is hot is the EDGE
    // collision (undo burst + param tweak). Recorded, never judged here.
    // #1434 — a per-region kineme edit in the asset tools is the same class
    // of artist action (LAYOUT_PARAM-class, artist-attributed): it records
    // as a tweak under the 'regionKineme' key.
    const noteTweak = (key) => {
      const at = t();
      s.tweaks.push({ ts: at, key });
      cap(s.tweaks);
      const undos = countSince(s.undos, LOIS_UNDO_BURST_WINDOW_MS, at);
      if (undos >= LOIS_UNDO_BURST_MIN) {
        s.collisions.push({ ts: at, key, undos });
        cap(s.collisions);
      }
    };
    unsubs.push(
      on(Events.LAYOUT_PARAM, (p) => {
        noteTweak(p && typeof p.key === 'string' ? p.key : null);
      }),
    );
    unsubs.push(on(Events.ASSETS_REGION_KINEME, () => noteTweak('regionKineme')));

    // Instrument 6 — rolls-per-keep: curate taps and KINETIC taps vs keeps.
    // #1391 G6/G10/G12 — the same roll feeds the per-keep cost counter, the
    // session cadence log, and (when it passes) the per-seed pass log.
    const noteRoll = (kind) => {
      const at = t();
      s.rolls.push(at);
      cap(s.rolls);
      if (kind !== 'evolve') {
        s.rollsSinceKeep += 1;
        s.rollsAll.push(at);
        if (s.rollsAll.length > ROLL_LOG_CAP) s.rollsAll.splice(0, s.rollsAll.length - ROLL_LOG_CAP);
      }
      if (!s.frameKept) {
        s.passes.push(at);
        cap(s.passes); // it replaced a frame nobody kept
        // #1391 G12 — the pass WITH its seed. There is no seed-region
        // partition anywhere in the instrument; rolls re-press on one seed,
        // so the honest grain is the seed itself: a run of consecutive
        // passes on one seed is what WEED reads.
        s.passLog.push({ ts: at, seed: s.seed });
        cap(s.passLog);
        if (s.passClusterSeed === s.seed && s.seed != null) s.passClusterLen += 1;
        else {
          s.passClusterSeed = s.seed;
          s.passClusterLen = 1;
        }
        // the number an earned voice carries is the ARTIST's rolls: an EVOLVE left running overnight must not farm depth
        if (kind !== 'evolve') s.passRun += 1;
      }
      s.rollsSinceSeed += 1;
      s.frameKept = false; // rolling moves off the kept frame
      if (kind !== 'evolve') beat(); // an EVOLVE fire is the generator at work, not the artist: it must not wake LOIS
    };
    unsubs.push(on(Events.LAYOUT_CURATE, () => noteRoll('curate')));
    unsubs.push(on(Events.KINETIC_TAP, () => noteRoll('kin')));

    // Passive store subscription: dwell windows (5) + undo bursts (7).
    // Undo pops exactly one entry AND pushes it onto the redo stack; an
    // import clears both stacks (#639) — so only (undo -1, redo not down)
    // counts as an undo. Never a dispatch site.
    if (store && typeof store.subscribe === 'function' && typeof store.getState === 'function') {
      const read = (st) => {
        const cast = castSignature(st.enabledAssets);
        return {
          seed: st.seed ?? null,
          comp: st.layoutParams?.composition ?? null,
          undoDepth: Array.isArray(st.historyUndoStack) ? st.historyUndoStack.length : 0,
          redoDepth: Array.isArray(st.historyRedoStack) ? st.historyRedoStack.length : 0,
          evolveTs: st.lastEvolveTs ?? null,
          paletteId: st.paletteId ?? null, // #1391 G14
          castSig: cast.sig, // #1391 G14
          castSize: cast.size, // #1391 G14
          midiStatus: st.midiStatus ?? null, // #1391 G9 — observed, never driven
          midiLast: st.midiLast ?? null, // #1391 G9
          favIds: new Set((Array.isArray(st.favorites) ? st.favorites : []).map((f) => f && f.id)),
          keepIds: new Set((Array.isArray(st.keeps) ? st.keeps : []).map((k) => k && k.id)),
          passCount: Number.isInteger(st.passCount) ? st.passCount : 0, // #1753
        };
      };
      // exactly one new entry is a keep; an import or a restore lands many at once and is not one
      const fresh = (list, before) => (Array.isArray(list) ? list.filter((e) => e && !before.has(e.id)) : []);
      const init = read(store.getState());
      noteSeed(init.seed, init.comp);
      let prev = init;
      unsubs.push(
        store.subscribe((st) => {
          const cur = read(st);
          // `prev` moves on BEFORE anything is noted: a note can announce an event (BLOOM) whose handler writes the
          // store, which re-enters this listener, and that re-entry must see this update as already seen.
          const was = prev;
          prev = cur;
          if (s.muted) return; // the machine, not the artist (the dead-frame guard re-dealing)
          const newFav = fresh(st.favorites, was.favIds);
          const newKeep = fresh(st.keeps, was.keepIds);
          if (newFav.length === 1 && cur.favIds.size > was.favIds.size - 1) noteFavorite(newFav[0], t(), 'store');
          if (cur.evolveTs != null && cur.evolveTs !== was.evolveTs) {
            // #1391 G13 — the flag: EVOLVE fired off the seed that was live,
            // and that seed had been kept (GRAFT). Read BEFORE noteSeed moves
            // the feed onto the evolved seed.
            if (s.seed != null && s.keeps.some((k) => k >= s.seedSetAt)) {
              s.evolvesFromKept.push({ ts: t(), seed: s.seed });
              cap(s.evolvesFromKept);
            }
            s.evolves.push(t());
            cap(s.evolves);
            noteRoll('evolve');
          }
          // #1391 G14 — palette / cast changes while a rolled frame is live
          // and unkept: the cast moved mid-roll (DROWN). The seed must not
          // move in the same update — an evolve or a recall re-deals the
          // whole frame, cast included; that is not a mid-roll change.
          const midRoll = !s.frameKept && s.rollsSinceSeed >= 1 && cur.seed === was.seed;
          if (midRoll && cur.paletteId !== was.paletteId) {
            s.castChanges.push({ ts: t(), kind: 'palette', seed: s.seed, from: was.paletteId, to: cur.paletteId });
            cap(s.castChanges);
          }
          if (midRoll && cur.castSig !== was.castSig) {
            s.castChanges.push({ ts: t(), kind: 'assets', seed: s.seed, size: cur.castSize });
            cap(s.castChanges);
          }
          // #1391 G9 — MIDI presence, observed only: the engine owns the
          // devices and #617 owns mapping; the feed just notes a live input
          // and the last time a message actually arrived.
          if (cur.midiStatus) {
            const inputs = Array.isArray(cur.midiStatus.inputs) ? cur.midiStatus.inputs : [];
            s.midi.present = cur.midiStatus.state === 'ready' && inputs.length > 0;
            s.midi.inputs = [...inputs];
            s.midi.state = typeof cur.midiStatus.state === 'string' ? cur.midiStatus.state : 'off';
          }
          if (cur.midiLast != null && cur.midiLast !== was.midiLast) s.midi.lastMsgAt = t();
          if (cur.seed !== was.seed || cur.comp !== was.comp) noteSeed(cur.seed, cur.comp);
          if (cur.undoDepth === was.undoDepth - 1 && cur.redoDepth >= was.redoDepth) {
            const at = t();
            s.undos.push(at);
            cap(s.undos);
            // #1391 G7 — burst runs: undos chained inside the burst window;
            // a run registers once when it reaches LOIS_UNDO_BURST_MIN.
            if (s.burstRun && at - s.burstRun.last <= LOIS_UNDO_BURST_WINDOW_MS) {
              s.burstRun.last = at;
              s.burstRun.size += 1;
            } else {
              s.burstRun = { first: at, last: at, size: 1, noted: false };
            }
            if (s.burstRun.size >= LOIS_UNDO_BURST_MIN && !s.burstRun.noted) {
              s.burstRun.noted = true;
              s.bursts.push({ ts: s.burstRun.first, size: s.burstRun.size });
              cap(s.bursts);
            }
            beat();
          }
          // #1753: X landed a pass (the store counts landed passes; exactly one more is one press)
          if (cur.passCount === was.passCount + 1) noteVerdict('pass');
          // last: a keep can announce BLOOM, and its handler may write the store
          if (newKeep.length === 1) noteKeep('store', t());
        }),
      );
    }

    return api;
  }

  function stop() {
    if (heartbeatTimer !== null && typeof ci === 'function') {
      ci(heartbeatTimer);
      heartbeatTimer = null;
    }
    for (const u of unsubs.splice(0)) {
      try {
        u();
      } catch {
        /* listener already gone */
      }
    }
    if (removeDomListeners) {
      removeDomListeners();
      removeDomListeners = null;
    }
  }

  /** Run `fn` as the MACHINE: the store changes it makes (a re-deal, its undo) are not the artist and are not noted. */
  function machine(fn) {
    s.muted += 1;
    try {
      return fn();
    } finally {
      s.muted -= 1;
    }
  }

  /** #1354 — the two COUNTS the stress signal reads. Cheap (no window scans): safe to call every frame. */
  const pressureCounts = () => ({ activityCount: s.activityCount, passRun: s.passRun, verdicts: s.verdicts.slice() }); // #1753: + verdicts
  const api = {
    start,
    stop,
    beat,
    noteSeed,
    snapshot,
    machine,
    pressureCounts,
    onKeep: (fn) => {
      keepListeners.add(fn);
      return () => keepListeners.delete(fn);
    },
  };
  return api;
}

// App singleton — inert until start() is called (App.jsx wires it).
export const loisActivity = createLoisActivity();
