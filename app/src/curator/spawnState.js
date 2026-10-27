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
import { creatureEnabled, CREATURE_ASSET_ID } from './creatureCitizen.js';
import { birthCentre } from './director.js'; // the nudge toward the recent keeps (hosted there, never a surface)
import { TRAIT_DEFAULTS } from '../engine/creature.js';
import { genomeFromTraits, traitsOf, sanitizeGenome } from '../engine/creatureGenome.js'; // #1734: genomes at birth
import { breedFor } from './creatureBreeding.js'; // #1738: children of kept creatures

/** Frames between home searches while fewer homes stand than asked (spawnLive's RETRY_FRAMES). */
export const SPAWN_RETRY_FRAMES = 30;
/** Frames a home's creature may fail to form before the home is given up (spawnLive's PATIENCE_FRAMES). */
export const SPAWN_PATIENCE_FRAMES = 180;
const KEEP_RING_CAP = 8;
/** #1738 — keeps whose living genomes the breeding pool remembers (session-only, like the trait ring). */
const GENOME_RING_CAP = 8;

/** FNV-1a: a stable number for a birth's key (breeding and the wild type roll from it). */
function birthKey(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

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
const isTrait = (t) =>
  !!t &&
  typeof t === 'object' &&
  Number.isFinite(t.spread) &&
  Number.isFinite(t.wing) &&
  Number.isFinite(t.body) &&
  Number.isFinite(t.swatch);

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
  // #1734 / #1738 — the ALife channel (only when the input carries creatureAlife): each formed pin's genome, the kept
  // genomes the breeding pool draws from, the birth count, the last bred pair, and a keep serial the builder reads
  // (a keep lands → the serial steps → the dish creature consolidates and its chemistry hears the keep).
  let genomes = []; // per pin: { x, y, genome } | null
  const genomeRing = [];
  let breedOrdinal = 0;
  let lastPair = null;
  let keepSerial = 0;
  let alifeOn = false;
  let decisions = freshDecisions(false);

  function freshDecisions(homesChanged) {
    return {
      dishPins: homes.map(({ x, y }) => ({ x, y })),
      dishFormed: latest.states.map((s) => !!(s && s.formed)),
      dishLimbs: limbs,
      dishTraits: traits,
      dishHosted: hosted,
      dishPressure: latest.states.map((s) => (s ? s.density : 0)),
      // #1734 — only when the ALife channel is on, so an older take's decisions keep their exact shape
      ...(alifeOn ? { dishGenomes: genomes.map((g) => (g ? g.genome : null)), creatureKeeps: keepSerial } : {}),
      homesChanged,
    };
  }

  // formationLive.observeFormation, transcribed: pins from the frame's own input, attraction from the
  // fertility field, density from the marks the resolver placed, the band the frame rode in on.
  function observeFormationHalf(input, output, band) {
    const pins = sanitizePins(input && input.dishPins);
    const W = input && input.canvasW;
    const H = input && input.canvasH;
    let attraction = [];
    if (pins.length) {
      const key = JSON.stringify([input.seed >>> 0, input.seedOffsets ?? null, W, H]);
      if (key !== fieldKey) {
        field = fertilityField(input.seed, input.seedOffsets, W, H);
        fieldKey = key;
      }
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
      seed: input && input.seed,
      seedOffsets: input && input.seedOffsets,
      band,
      room: () => {
        try {
          return roomProvider ? roomProvider() : null;
        } catch {
          return null;
        }
      },
      centre: (r) =>
        birthCentre({ ring: keepRing, keeps: r && r.keeps, allowance: r && r.allowance, defaults: TRAIT_DEFAULTS }),
    });
    traits = shifted.traits;
    alifeOn = !!(input && input.creatureAlife);
    if (alifeOn) observeGenomes(input, shifted.born);
    else genomes = [];
    if (shifted.born.length && shiftTap) {
      try {
        shiftTap(shifted.born);
      } catch {
        shiftTap = null;
      }
    }
    if (formationTap) {
      // resolveTap's listener law, carried over: a throwing tap is dropped, never fatal to the frame.
      try {
        formationTap(u, r.events);
      } catch {
        formationTap = null;
      }
    }
    return r;
  }

  // #1734 / #1738 — a genome per formed pin, decided once at birth: a child of two kept genomes when the pool allows
  // (breedFor), else the wild type of Davis's roll. A bred child's look is its genome's (genetics change looks AND
  // behaviour, the Spore warning), so the pin's traits follow its genome for life — overriding the shift tracker's
  // slot, every frame, not only at birth.
  function observeGenomes(input, born) {
    const seed = (input && input.seed) >>> 0;
    const bornAt = new Map(born.map((e) => [e.pin, e]));
    const next = new Array(latest.states.length).fill(null);
    for (let i = 0; i < latest.states.length; i++) {
      const s = latest.states[i];
      if (!s || !s.formed || !traits[i]) continue;
      const prev = genomes[i] && genomes[i].x === s.x && genomes[i].y === s.y ? genomes[i] : null;
      if (prev && !bornAt.has(i)) {
        next[i] = prev;
        continue;
      }
      breedOrdinal += 1;
      const key = birthKey(`alife:${i}:${breedOrdinal}:${Math.round(s.x)}:${Math.round(s.y)}`);
      const bred = breedFor({ ring: genomeRing, seed, key, ordinal: breedOrdinal, lastPair });
      let genome;
      if (bred) {
        genome = bred.genome;
        lastPair = bred.pair;
      } else genome = genomeFromTraits(traits[i], seed, `wild:${key}`);
      next[i] = { x: s.x, y: s.y, genome };
      const e = bornAt.get(i);
      if (e && bred) e.traits = traitsOf(genome); // the davis-shift log records the look this animal was born with
    }
    genomes = next;
    traits = traits.map((t, i) => (genomes[i] ? traitsOf(genomes[i].genome) : t));
  }

  // spawnLive.observeSpawn, transcribed: steady homes until the dish changes; a home whose creature
  // never forms is given up after PATIENCE_FRAMES; the search retries every RETRY_FRAMES.
  // Returns true when the standing homes changed (App's tap wrote the store on exactly this condition).
  function observeSpawnHalf(input, output, { count = 0, formed = [], band = null, weight = null } = {}) {
    const want = sanitizeCount(count);
    const W = input && input.canvasW;
    const H = input && input.canvasH;
    const k = `${(input && input.seed) >>> 0}|${JSON.stringify((input && input.seedOffsets) ?? null)}|${W}x${H}`;
    const before = homes.map(({ x, y }) => ({ x, y }));
    if (k !== dishKey) {
      dishKey = k;
      homes = [];
      spawnField = null;
      sinceTry = SPAWN_RETRY_FRAMES;
    } // a new dish: start again
    if (homes.length > want) homes = homes.slice(0, want);
    for (let i = 0; i < homes.length; i++) {
      homes[i].age += 1;
      if (!formed[i] && homes[i].age >= SPAWN_PATIENCE_FRAMES) {
        homes.splice(i, 1);
        i--;
        sinceTry = SPAWN_RETRY_FRAMES;
      }
    }
    if (homes.length < want) {
      sinceTry += 1;
      if (sinceTry >= SPAWN_RETRY_FRAMES) {
        sinceTry = 0;
        if (!spawnField || spawnFieldKey !== k) {
          spawnField = fertilityField(input.seed, input.seedOffsets, W, H).at;
          spawnFieldKey = k;
        }
        const next = chooseHomes({
          count: want,
          existing: homes,
          marks: marksOf(output),
          field: spawnField,
          band,
          canvasW: W,
          canvasH: H,
          weight,
        });
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
        // #1694 slice 2 — the citizen's pool switch folds into the count the spawn half sees:
        // citizen off reads as a count of 0 (the population and its homes clear, exactly as
        // dialing the count to 0 does), and the citizen's pool weight rides to the home choice.
        // An input that never mentions the citizen (every pre-slice take, the gate fixture)
        // reads enabled and unweighted — this frame logic is then unchanged.
        count: creatureEnabled(input) ? input && input.creatureCount : 0,
        formed: latest.states.map((s) => !!(s && s.formed)),
        band,
        weight: input && input.assetWeightOverrides ? input.assetWeightOverrides[CREATURE_ASSET_ID] : undefined,
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
    getDecisions() {
      return decisions;
    },
    /** The latest per-pin formation view ([{ x, y, hold, formed, attraction, density }] and their band) — the ?debug=stress readout's. */
    getFormationView() {
      return latest;
    },
    /** A keep just landed: remember the traits of the moths alive now (a session ring; nothing without a moth). */
    noteKeep() {
      if (alifeOn) {
        keepSerial += 1; // #1736/#1737: the builder hears every keep (consolidation, the approval drive's drop)
        const kept = genomes.filter(Boolean).map((g) => g.genome);
        if (kept.length) {
          genomeRing.push(kept);
          while (genomeRing.length > GENOME_RING_CAP) genomeRing.shift();
        } // #1738: the breeding pool
      }
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
      genomes = [];
      genomeRing.length = 0;
      breedOrdinal = 0;
      lastPair = null;
      keepSerial = 0;
      alifeOn = false;
      decisions = freshDecisions(false);
    },
    /** Start the spawn half over (a fresh document, tests). */
    resetSpawnHalf() {
      homes = [];
      dishKey = '';
      sinceTry = SPAWN_RETRY_FRAMES;
      spawnField = null;
      spawnFieldKey = '';
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
        // #1734/#1738 — the ALife channel, only once it has run (a session without it snapshots exactly as before);
        // absent from older snapshots, which restore it empty
        ...(alifeOn || breedOrdinal > 0 || keepSerial > 0
          ? {
              alife: {
                on: alifeOn,
                genomes: genomes.map((g) => (g ? { x: g.x, y: g.y, genome: g.genome } : null)),
                ring: genomeRing.map((l) => l.slice()),
                ordinal: breedOrdinal,
                lastPair,
                keepSerial,
              },
            }
          : {}),
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
        if (
          !s ||
          typeof s !== 'object' ||
          !Number.isFinite(s.x) ||
          !Number.isFinite(s.y) ||
          !Number.isFinite(s.hold) ||
          typeof s.formed !== 'boolean' ||
          !Number.isFinite(s.attraction) ||
          !Number.isFinite(s.density)
        )
          return false;
      }
      if (!Array.isArray(snap.limbsOut) || !snap.limbsOut.every((n) => n === 1 || n === 2)) return false;
      if (!Array.isArray(snap.traitsOut) || !snap.traitsOut.every((t) => t === null || isTrait(t))) return false;
      if (!Array.isArray(snap.hostedOut) || !snap.hostedOut.every((b) => typeof b === 'boolean')) return false;
      if (!Array.isArray(snap.homes)) return false;
      for (const h of snap.homes) {
        if (!h || typeof h !== 'object' || !Number.isFinite(h.x) || !Number.isFinite(h.y) || !Number.isFinite(h.age))
          return false;
      }
      if (typeof snap.dishKey !== 'string' || !Number.isInteger(snap.sinceTry) || snap.sinceTry < 0) return false;
      if (!Array.isArray(snap.keepRing)) return false;
      for (const list of snap.keepRing) {
        if (!Array.isArray(list) || !list.every(isTrait)) return false;
      }
      const al = snap.alife;
      if (al !== undefined) {
        if (
          !al ||
          typeof al !== 'object' ||
          !Array.isArray(al.genomes) ||
          !Array.isArray(al.ring) ||
          !Number.isInteger(al.ordinal) ||
          al.ordinal < 0 ||
          !Number.isInteger(al.keepSerial) ||
          al.keepSerial < 0 ||
          !(al.lastPair === null || (Array.isArray(al.lastPair) && al.lastPair.length === 2))
        )
          return false;
        for (const g of al.genomes)
          if (g !== null && (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y) || !sanitizeGenome(g.genome)))
            return false;
        for (const l of al.ring) if (!Array.isArray(l) || !l.every((g) => sanitizeGenome(g))) return false;
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
      genomes = al ? al.genomes.map((g) => (g ? { x: g.x, y: g.y, genome: sanitizeGenome(g.genome) } : null)) : [];
      genomeRing.length = 0;
      if (al) for (const l of al.ring) genomeRing.push(l.map(sanitizeGenome));
      breedOrdinal = al ? al.ordinal : 0;
      lastPair = al && al.lastPair ? al.lastPair.slice() : null;
      keepSerial = al ? al.keepSerial : 0;
      alifeOn = !!(al && al.on);
      field = null;
      fieldKey = '';
      spawnField = null;
      spawnFieldKey = '';
      decisions = freshDecisions(false);
      return true;
    },
  };
}
