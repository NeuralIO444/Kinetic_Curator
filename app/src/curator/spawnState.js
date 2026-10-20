// curator/spawnState.js — #1694 slice 1: the creature spawn channel as RESOLVER-OWNED state.
//
// Until this slice the channel ran beside the resolver: App's frame tap fed two module singletons
// (formationLive.js / spawnLive.js), their decisions crossed back through providers on gl/resolveTap.mjs,
// and the loop stamped them on the next frame's input. Now the resolver owns an instance of this factory
// and observes each resolved frame itself, at the end of resolveLayers — the decisions are published
// (gl/liveResolve.mjs getLastSpawnDecisions) and the loop stamps them on the next frame's input exactly
// as before, plus the artist's creatureCount, which now rides the input like every other decision.
//
// THE RULES DID NOT MOVE. Formation (formation.js), limbs (limbs.js), Davis's birth shifts (davisShift.js)
// and home choice (spawn.js) are imported unchanged; the observe below is formationLive's and spawnLive's
// frame logic transcribed line for line, in the same order (formation first, then spawn — the spawn rule
// reads the formation verdicts of the frame's own pins). Davis still stamps traits at birth; the room and
// the keeps still reach a birth through the module-level provider/taps registered here (the facades in
// formationLive.js forward to them, so PerformanceButton and App wire up exactly as they did).
//
// Snapshot law (#1367): the whole channel rides the resolver snapshot under `spawn` — trackers, standing
// homes, the last decisions, the keep ring. Pre-repipe snapshots carry no `spawn` key and restore to a
// fresh channel (restoreState's caller handles the absent key); the snapshot version stays 1. The two
// fertility-field caches are NOT state: each is a pure function of (seed, seedOffsets, W, H), dropped on
// restore and rebuilt on the next observe, like the resolver's own derived caches.
import { createFormationTracker, fertilityField, quantizeSignal } from './formation.js';
import { pinPressures } from './dishPressure.js';
import { sanitizePins } from './dishPins.js';
import { createLimbTracker } from './limbs.js';
import { createShiftTracker } from './davisShift.js';
import { chooseHomes, marksOf, sanitizeCount } from './spawn.js';
import { birthCentre } from './director.js'; // the nudge toward the recent keeps (hosted there, never a surface)
import { TRAIT_DEFAULTS } from '../engine/creature.js';

/** Frames between home searches while fewer homes stand than asked (spawnLive's RETRY_FRAMES). */
export const SPAWN_RETRY_FRAMES = 30;
/** Frames a home's creature may fail to form before the home is given up (spawnLive's PATIENCE_FRAMES). */
export const SPAWN_PATIENCE_FRAMES = 180;
const KEEP_RING_CAP = 8;

// ── the channel's wiring (one listener each, as it was in formationLive) ─────────────────────────────

let formationTap = null;
let shiftTap = null;
let roomProvider = null;

/** A take's recorder: `fn(update, events)` gets every formation tracker update, or null to stop. */
export function setFormationTap(fn) {
  formationTap = typeof fn === 'function' ? fn : null;
}

/** Observe Davis's birth shifts: fn(born) for frames that made any (the `davis-shift` events). One listener (or null). */
export function setShiftTap(fn) {
  shiftTap = typeof fn === 'function' ? fn : null;
}

/**
 * Where a moth's birth reads the room: fn() => { width, room } from the two Directors' live states.
 * Called only at a birth. Null = no room: the band's width as it was.
 */
export function setRoomProvider(fn) {
  roomProvider = typeof fn === 'function' ? fn : null;
}

// ── the active instance ──────────────────────────────────────────────────────────────────────────────
// Whichever resolver ran last owns the live channel (the getLastFrameMotion law): createLiveResolver
// registers its instance, and resolveLayers re-registers on every frame, so a resolver built for a
// replay or a verify hands the channel back to the live one on the live one's next frame. Used
// standalone (the curator suites, through the formationLive/spawnLive facades) a default instance
// answers. noteKeep lands on the active instance: a keep remembers the moths alive in the live channel.

let activeState = null;

export function registerSpawnState(state) {
  activeState = state;
}

export function activeSpawnState() {
  if (!activeState) activeState = createCreatureSpawnState();
  return activeState;
}

/** A keep just landed: remember the traits of the moths alive now in the live channel. */
export function noteKeep() {
  activeSpawnState().noteKeep();
}

// ── the factory ──────────────────────────────────────────────────────────────────────────────────────

const sameHomes = (a, b) => a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
const copyTraits = (t) => (t ? { spread: t.spread, wing: t.wing, body: t.body, swatch: t.swatch } : null);
const isTrait = (t) => !!t && typeof t === 'object' && Number.isFinite(t.spread) && Number.isFinite(t.wing) && Number.isFinite(t.body) && Number.isFinite(t.swatch);

export function createCreatureSpawnState() {
  let formationTracker = createFormationTracker();
  let limbTracker = createLimbTracker();
  let shiftTracker = createShiftTracker();
  let limbs = [];
  let traits = [];
  let hosted = [];
  let latest = Object.freeze({ states: [], band: null });
  let field = null; // the formation half's fertility field (derived cache — never snapshotted)
  let fieldKey = '';
  // the spawn half (spawnLive's steady homes)
  let homes = []; // [{ x, y, age }]
  let dishKey = '';
  let sinceTry = SPAWN_RETRY_FRAMES;
  let spawnField = null; // chooseHomes' fertility probe (derived cache — never snapshotted)
  let spawnFieldKey = '';
  const keepRing = []; // session-only: the traits of the moths alive at each recent keep (never saved to a document)
  let decisions = freshDecisions(false);

  function freshDecisions(homesChanged) {
    return {
      dishPins: homes.map(({ x, y }) => ({ x, y })),
      dishFormed: latest.states.map((s) => !!(s && s.formed)),
      dishLimbs: limbs,
      dishTraits: traits,
      dishHosted: hosted,
      dishPressure: latest.states.map((s) => (s ? s.density : 0)),
      homesChanged,
    };
  }

  // formationLive.observeFormation, transcribed: pins from the frame's own input, attraction from the
  // fertility field, density from the marks the resolver placed, the band the frame rode in on.
  function observeFormationHalf(input, output, band) {
    const pins = sanitizePins(input && input.dishPins);
    const W = input && input.canvasW; const H = input && input.canvasH;
    let attraction = [];
    if (pins.length) {
      const key = JSON.stringify([input.seed >>> 0, input.seedOffsets ?? null, W, H]);
      if (key !== fieldKey) { field = fertilityField(input.seed, input.seedOffsets, W, H); fieldKey = key; }
      attraction = pins.map((p) => quantizeSignal(field.at(p.x, p.y)));
    }
    const density = pinPressures(pins, output, W, H).map(quantizeSignal);
    const u = { pins, attraction, density, band };
    const r = formationTracker.update(u);
    latest = Object.freeze({
      band,
      states: r.states.map((s, i) => (s ? { ...s, attraction: attraction[i], density: density[i] } : null)),
    });
    limbs = limbTracker.update(latest.states);
    hosted = latest.states.map((s, i) => !!(s && s.formed) && !latest.states.slice(0, i).some((p) => p && p.formed));
    const shifted = shiftTracker.update(latest.states, {
      seed: input && input.seed, seedOffsets: input && input.seedOffsets, band,
      room: () => { try { return roomProvider ? roomProvider() : null; } catch { return null; } },
      centre: (r) => birthCentre({ ring: keepRing, keeps: r && r.keeps, allowance: r && r.allowance, defaults: TRAIT_DEFAULTS }),
    });
    traits = shifted.traits;
    if (shifted.born.length && shiftTap) { try { shiftTap(shifted.born); } catch { shiftTap = null; } }
    if (formationTap) {
      // resolveTap's listener law, carried over: a throwing tap is dropped, never fatal to the frame.
      try { formationTap(u, r.events); } catch { formationTap = null; }
    }
    return r;
  }

  // spawnLive.observeSpawn, transcribed: steady homes until the dish changes; a home whose creature
  // never forms is given up after PATIENCE_FRAMES; the search retries every RETRY_FRAMES.
  // Returns true when the standing homes changed (App's tap wrote the store on exactly this condition).
  function observeSpawnHalf(input, output, { count = 0, formed = [], band = null } = {}) {
    const want = sanitizeCount(count);
    const W = input && input.canvasW; const H = input && input.canvasH;
    const k = `${(input && input.seed) >>> 0}|${JSON.stringify((input && input.seedOffsets) ?? null)}|${W}x${H}`;
    const before = homes.map(({ x, y }) => ({ x, y }));
    if (k !== dishKey) { dishKey = k; homes = []; spawnField = null; sinceTry = SPAWN_RETRY_FRAMES; } // a new dish: start again
    if (homes.length > want) homes = homes.slice(0, want);
    for (let i = 0; i < homes.length; i++) {
      homes[i].age += 1;
      if (!formed[i] && homes[i].age >= SPAWN_PATIENCE_FRAMES) { homes.splice(i, 1); i--; sinceTry = SPAWN_RETRY_FRAMES; }
    }
    if (homes.length < want) {
      sinceTry += 1;
      if (sinceTry >= SPAWN_RETRY_FRAMES) {
        sinceTry = 0;
        if (!spawnField || spawnFieldKey !== k) { spawnField = fertilityField(input.seed, input.seedOffsets, W, H).at; spawnFieldKey = k; }
        const next = chooseHomes({ count: want, existing: homes, marks: marksOf(output), field: spawnField, band, canvasW: W, canvasH: H });
        for (let i = homes.length; i < next.length; i++) homes.push({ x: next[i].x, y: next[i].y, age: 0 });
      }
    }
    const after = homes.map(({ x, y }) => ({ x, y }));
    return !sameHomes(before, after);
  }

  return {
    /**
     * One resolved frame, the resolver's path: formation judges the frame, then spawn reads the
     * verdicts — App's tap order. The band and the count ride the input (the loop stamps both).
     * Returns the decisions the NEXT frame's input carries.
     */
    observe(input, output) {
      const band = input && input.band !== undefined ? input.band : null;
      observeFormationHalf(input, output, band);
      const changed = observeSpawnHalf(input, output, {
        count: input && input.creatureCount,
        formed: latest.states.map((s) => !!(s && s.formed)),
        band,
      });
      decisions = freshDecisions(changed);
      return decisions;
    },
    /** The facade path (formationLive.observeFormation): the formation half only, band resolved by the caller. */
    observeFormationOnly(input, output, band) {
      const r = observeFormationHalf(input, output, band);
      decisions = freshDecisions(false);
      return r;
    },
    /** The facade path (spawnLive.observeSpawn): the spawn half only; the new homes when they changed, else null. */
    observeSpawnOnly(input, output, opts = {}) {
      const changed = observeSpawnHalf(input, output, opts);
      decisions = freshDecisions(changed);
      return changed ? decisions.dishPins : null;
    },
    /** The decisions the next frame's input carries, as of the last observed frame. */
    getDecisions() { return decisions; },
    /** The latest per-pin formation view ([{ x, y, hold, formed, attraction, density }] and their band) — the ?debug=stress readout's. */
    getFormationView() { return latest; },
    /** A keep just landed: remember the traits of the moths alive now (a session ring; nothing without a moth). */
    noteKeep() {
      const alive = traits.filter(Boolean).map((t) => ({ ...t }));
      if (!alive.length) return;
      keepRing.push(alive);
      while (keepRing.length > KEEP_RING_CAP) keepRing.shift();
    },
    /** Start the formation half over (a take starts from fresh formation state, like the fresh resolver `rec` asks for). */
    resetFormationHalf() {
      formationTracker = createFormationTracker();
      latest = Object.freeze({ states: [], band: null });
      limbTracker.reset();
      limbs = [];
      hosted = [];
      shiftTracker.reset();
      traits = [];
      keepRing.length = 0;
      decisions = freshDecisions(false);
    },
    /** Start the spawn half over (a fresh document, tests). */
    resetSpawnHalf() {
      homes = []; dishKey = ''; sinceTry = SPAWN_RETRY_FRAMES; spawnField = null; spawnFieldKey = '';
      decisions = freshDecisions(false);
    },
    /** Start the whole channel over. */
    reset() {
      this.resetFormationHalf();
      this.resetSpawnHalf();
    },
    // #1367's law: the channel's whole accumulative state as one JSON-safe object. The fertility caches
    // are derived (a pure function of the dish key) and stay out, like the resolver's own derived state.
    snapshotState() {
      return {
        v: 1,
        formation: formationTracker.snapshotState(),
        limbs: limbTracker.snapshotState(),
        shift: shiftTracker.snapshotState(),
        latest: { band: latest.band, states: latest.states.map((s) => (s ? { ...s } : null)) },
        limbsOut: limbs.slice(),
        traitsOut: traits.map(copyTraits),
        hostedOut: hosted.slice(),
        homes: homes.map((h) => ({ ...h })),
        dishKey,
        sinceTry,
        keepRing: keepRing.map((list) => list.map(copyTraits)),
      };
    },
    /** Fail-closed, like the builders': validate everything (sub-trackers against throwaway instances) before applying anything. */
    restoreState(snap) {
      if (!snap || typeof snap !== 'object' || Array.isArray(snap) || snap.v !== 1) return false;
      if (!createFormationTracker().restoreState(snap.formation)) return false;
      if (!createLimbTracker().restoreState(snap.limbs)) return false;
      if (!createShiftTracker().restoreState(snap.shift)) return false;
      if (!snap.latest || typeof snap.latest !== 'object' || !Array.isArray(snap.latest.states)) return false;
      if (!(snap.latest.band === null || typeof snap.latest.band === 'string')) return false;
      for (const s of snap.latest.states) {
        if (s === null) continue;
        if (!s || typeof s !== 'object' || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.hold)
          || typeof s.formed !== 'boolean' || !Number.isFinite(s.attraction) || !Number.isFinite(s.density)) return false;
      }
      if (!Array.isArray(snap.limbsOut) || !snap.limbsOut.every((n) => n === 1 || n === 2)) return false;
      if (!Array.isArray(snap.traitsOut) || !snap.traitsOut.every((t) => t === null || isTrait(t))) return false;
      if (!Array.isArray(snap.hostedOut) || !snap.hostedOut.every((b) => typeof b === 'boolean')) return false;
      if (!Array.isArray(snap.homes)) return false;
      for (const h of snap.homes) {
        if (!h || typeof h !== 'object' || !Number.isFinite(h.x) || !Number.isFinite(h.y) || !Number.isFinite(h.age)) return false;
      }
      if (typeof snap.dishKey !== 'string' || !Number.isInteger(snap.sinceTry) || snap.sinceTry < 0) return false;
      if (!Array.isArray(snap.keepRing)) return false;
      for (const list of snap.keepRing) {
        if (!Array.isArray(list) || !list.every(isTrait)) return false;
      }
      formationTracker.restoreState(snap.formation);
      limbTracker.restoreState(snap.limbs);
      shiftTracker.restoreState(snap.shift);
      latest = Object.freeze({ band: snap.latest.band, states: snap.latest.states.map((s) => (s ? { ...s } : null)) });
      limbs = snap.limbsOut.slice();
      traits = snap.traitsOut.map(copyTraits);
      hosted = snap.hostedOut.slice();
      homes = snap.homes.map((h) => ({ x: h.x, y: h.y, age: h.age }));
      dishKey = snap.dishKey;
      sinceTry = snap.sinceTry;
      keepRing.length = 0;
      for (const list of snap.keepRing) keepRing.push(list.map(copyTraits));
      field = null; fieldKey = '';
      spawnField = null; spawnFieldKey = '';
      decisions = freshDecisions(false);
      return true;
    },
  };
}
