/** liveResolve — FEED delay-1 + FIELD same-frame */
import { buildPlacements, clampCount, mirrorItems } from '../engine/buildPlacements.js';
import { createDriverClock, driverTimeSec, patternAmounts, rhythmTypeForPattern, createTravelStore, pruneTravelStore } from '../engine/kineme.js'; // #1128: the living-motion floor; #1574: the travel store
import { createSurgeStore, pruneSurgeStore } from '../engine/surge.js'; // #1576: the surge envelope store
import { createParallaxStore, pruneParallaxStore } from '../engine/parallaxDrift.js'; // #1576: the parallax drift store
import { ParticleSystem } from '../engine/particles.js';
import { isLiveSwarmMode, isOrganismMode, DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { resolvePalette } from '../data/palettes.js';
import { getQualityCaps } from '../data/quality.js';
import { shapeMixWeights, liveShapeLevels } from '../data/voices.js';
import { getAssetCost } from '../assets/cost.js';
import { isFxLayer } from '../fx/fxFilters.js';
import { isMathLayer } from '../fx/mathFilters.js';
import { mergePool } from '../assets/overlay.js';
import { ASSETS } from '../data/assets/index.js';
import { CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { createFeedLive } from '../engine/kernel/tracks/feedLive.js';
import { createResolverDish, creatureGround, groundArgs } from './dishGround.mjs'; // #1183: the dish, and the ground a layer rests on
import { weatherArgs } from './dishWeather.mjs'; // #1183 weather: the haze in the air over a layer
import { applyMod, motionMetrics, MAX_TRACKS } from '../engine/kernel/tracks/trackGraph.js';
// #1307 — SoA slice 2/5: FIELD/FEED column loops (zero per-point allocation,
// bit-identical to the map-based path they replace — see the module header).
import { resolveFieldItems, resolveFeedItems } from './fieldFeedColumns.mjs';
// #507 — inline PATCH diagnostic: record-only bulletin calls (no logic change).
import { recordPatchSample } from '../engine/kernel/tracks/patchDiag.mjs';

import { createNoise } from '../engine/noise.js';
import { createScentField } from '../engine/kernel/field/scent.js';
import { createDishSession, enrolDishBody, releaseDishBody, armDish, dishEnrolRadius, snapshotDishSession, restoreDishSession, checkDishSessionSnapshot, restoreDishEntries } from '../engine/dishContacts.mjs'; // #1407: one shared grid across strata; #1367: its snapshot
import { createFeedDelay } from '../engine/kernel/tracks/feedDelay.js'; // #1367 — restore validation builds a throwaway delay
import { coalescenceFields } from '../engine/dishCoalesce.mjs'; // #1411: the layer system's composed merge fields
import { publishDishDensity, EMPTY_DISH_DENSITY } from '../engine/dishDensity.mjs'; // #1412: the shared grid's density field, published per frame
import { tickDishTrails, clearDishTrails } from '../engine/dishTrails.mjs'; // #1415: the trail substrate's tick + seed-change wipe (the law lives in the module)
import { dishPigmentShed } from './sceneContract.js'; // #1412: the tier-2 shed predicate (the governor's rule, one home)
import { blendItems, planMorph, matchItems } from '../engine/kernel/itemMorph.mjs';
import { morphEase } from './paletteMix.mjs';
import { readMeterBandLevels } from '../hooks/audioMeterTap.js'; // #720 — default audio drive for DLA/Eden growth
import { ensureAggregate, GrowthHooks } from '../engine/kernel/sample/growth.js'; // #793 — biology regrow
import { assessAggregate, decideLifecycle, recordLifecycleState } from '../biology/lifecycle.js';
import { getBiologyPolicy } from '../biology/policy.js';
import { createCreatureBuilder } from '../engine/creature.js'; // #1355 step 4: the moth, on formed pins
import { createDishCreatureBuilder } from '../engine/dishCreature.js'; // #1634 slice 2: the dish creature, on the hosted pin
import { createCreatureSpawnState, registerSpawnState } from '../curator/spawnState.js'; // #1694 slice 1: the spawn channel, resolver-owned
import { CREATURE_ASSET_ID, mothsAllowed, dishAllowed } from '../curator/creatureCitizen.js'; // #1694 slice 2: the pool citizen's reads

const HOP_MAX_PX = 4;

/**
 * #564 — cheap content hash (djb2-xor) for overlay SVG bodies. Only ever run
 * when the customAssets array reference changes (the store replaces it on
 * every Assets-tab edit), never per frame: ≤ OVERLAY_CAP (32) small strings.
 */
function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * #425 — ambient life drift (#107), computed per layer inside the resolver:
 * a pure function of the layer's own params, its own locks, and the shared
 * loop clock. setActiveLayer makes snapshot and top-level equal for both
 * layers at the swap boundary, so every layer's rendered values are
 * identical before and after a focus click — the old active-layer-only
 * driftOverlay clicked the breathing over to the other layer in one frame.
 * Magnitudes match the original useContinuousLife ticker (0.04 phase per
 * 80ms, i.e. a continuous rate of 0.0005/ms); the caller gates on
 * slowRender / batchPaused, which is where life used to pause too.
 *
 * #431 — the phase used to be quantized to an 80ms/12.5Hz tick
 * (`Math.floor(loopTimeMs/80)*0.04`), which every layer reads off the
 * same shared loopTimeMs: every layer's jitter/displacement/noiseSpeed
 * stepped on the exact same frame, all at once ("stop...start" stair-
 * stepping, plus every layer's placement geoSig invalidating together —
 * a main-thread rebuild spike once per tick instead of spread out). Same
 * rate, continuous instead of stepped: smooth per-frame motion, and
 * rounding thresholds are no longer crossed in lockstep across layers.
 *
 * Hitch fix — the value quantizers (Math.round / toFixed) remained, so
 * each layer's geoSig still invalidated whenever a rounded value stepped
 * (irregular ~0.8–2s spacing): a full geometry rebuild and a single-frame
 * canvas blink. The drift is now a smooth post-geometry offset applied
 * after buildPlacements (see the warp pass below), not a mutation of the
 * layout params that participate in geometrySignature. Base jitter /
 * displacement / noiseSpeed stay stable, the cache holds, and the motion
 * is continuous.
 */

// Deterministic pseudo-random in [0, 1) for stable per-point drift offsets.
// Integer arithmetic only (no float magic constants).
function hash01(n) {
  let h = Math.imul((n | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

function applyLifeDrift(lp, locked, loopTimeMs) {
  const depth = lp.lifeDrift ?? 0.35;
  if (depth <= 0.01) return;
  const t = loopTimeMs * 0.0005;
  // Continuous drift offsets, applied post-geometry. NOT written into
  // lp.jitter / lp.displacement / lp.noiseSpeed — those feed
  // geometrySignature and must stay stable or the placement cache
  // invalidates every time a rounded value steps (the hitch).
  const drift = {};
  if (!locked.jitter) {
    drift.j = Math.sin(t * 0.7) * 12 * depth;
  }
  if (!locked.displacement) {
    drift.d = Math.sin(t * 0.45 + 1.2) * 18 * depth;
  }
  if (!locked.noiseSpeed) {
    drift.ns = Math.sin(t * 0.3 + 0.5) * 0.25 * depth;
  }
  lp.lifeDriftOffset = drift;
}

export function nodePhase(base, it) {
  // #558 — phase is a seed offset, speedMul scales the loop clock. Neither reads wall time.
  const speed = Number(it?.speedMul);
  const phase = Number(it?.phaseOffset);
  return base * (Number.isFinite(speed) && speed > 0 ? speed : 1) + (Number.isFinite(phase) ? phase : 0);
}

/**
 * #1128 — the living-motion floor for one layer: breath and drift (and pulse, which is off until a Director pattern
 * asks) from the layer's own layout, evaluated FROM rest so the first frame is the placed picture. null when every
 * amount is 0 (the hard gate: nothing is computed), and null under shed tier 3 (the governor froze motion: identity).
 * #1151 — palette-breath joins the floor: a per-instance palette sweep in the color domain, orthogonal to the motion
 * drivers (patterns don't re-weight it). Reduced motion damps it to zero (DS rule 7).
 * #1198 — the rhythm layer: ORGANIC/CADENCE select a placement-layer modulation (Perlin/sine over spacing, scale,
 * rotation) that switches on even when every motion amount is 0 — the pattern is the gate, not the amounts.
 */
function livingMotion(layoutParams, seed, driverSec, W, H, slowRender, beatDrive, assetStill, reducedMotion) {
  if (slowRender) return null;
  const amounts = patternAmounts(
    { breath: layoutParams.kinemeBreath, drift: layoutParams.kinemeDrift, pulse: layoutParams.kinemePulse },
    layoutParams.kinemePattern, beatDrive);
  amounts.paletteBreath = reducedMotion ? 0 : layoutParams.kinemePaletteBreath;
  // #1516 — brushWobble is assigned beside paletteBreath, for the same
  // reason: patternAmounts carries only the three pattern-weighted
  // amounts, and no pattern re-weights the boil channel. Until this
  // line nothing populated the field, so the brush-wobble driver
  // (kineme.js) read a permanent 0 and the kinemeBrushWobble param
  // was dead. (evaluateKineme's dWobble itself stays unapplied until
  // brush mode lands its stage-C consumer — #894/#897.)
  amounts.brushWobble = layoutParams.kinemeBrushWobble;
  const rhythmType = rhythmTypeForPattern(layoutParams.kinemePattern);
  const rhythm = rhythmType ? { type: rhythmType } : null;
  if (!rhythm && !(amounts.breath > 0) && !(amounts.drift > 0) && !(amounts.pulse > 0) && !(amounts.paletteBreath > 0) && !(amounts.brushWobble > 0)) return null;
  const pinned = assetStill && typeof assetStill === 'object' ? Object.keys(assetStill) : null;
  return { seed, driverSec, boilStep: 0, amounts, canvasW: W, canvasH: H, shedTier: 0, anchored: true, rhythm, ...(pinned && pinned.length ? { stillAssets: new Set(pinned) } : {}) };
}

/**
 * #1469 — the latest resolved frame's living-motion read, for the STIMULI MOTION strip
 * (composition/motionLive.js republishes it to hooks/motionMeterTap.js once per frame from the
 * resolve-frame tap). Module-level, like the dish-density holder: whichever resolver ran last
 * owns it. null until the first resolve completes. Shape:
 *   { kineme: <livingMotion's return for the first layer whose floor is alive> | null,
 *     wind:   <the first resolved layer's wind param, 0 on a frozen frame> | null,
 *     mothBeat: <0..1 wing openness from the creature builder> | null (no moths on stage) }
 * The kineme is the resolver's own ctx object — the same one buildPlacements consumed, after
 * pattern re-weighting, beat drive and shed (a frozen frame's kineme is null, by livingMotion's
 * own gate). Nothing here is recomputed for the readout.
 */
let lastFrameMotion = null;
export function getLastFrameMotion() { return lastFrameMotion; }

/**
 * Phase 2 S1 — the last resolved frame's creature skeletons (world/scene space, per pin, null where
 * no moth), published for the ?debug=skeleton overlay. Like the motion read above: the resolver's own
 * objects, nothing recomputed. Empty when no creature was resolved (worker mode carries no creatures).
 */
let lastSkeletons = [];
export function getLastSkeletons() { return lastSkeletons; }

/**
 * Phase 2 S5 — the last resolved frame's band poses (per pin, one shared object — the pose is the
 * room's; null where no moth, all null when no band rode the input), published for the consumers
 * that follow: S2's skinning and S4's material (the pose's dim above all) read them from here.
 */
let lastPoses = [];
export function getLastPoses() { return lastPoses; }

/**
 * #1694 slice 1 — the last resolved frame's SPAWN decisions, published by the resolver that owns the
 * channel (curator/spawnState.js): the standing homes, and what formation decided on the frame just
 * resolved. The loop stamps them on the NEXT frame's input (dishPins / dishFormed / dishLimbs /
 * dishTraits / dishHosted / dishPressure), exactly as the App-side tap channel used to hand them over —
 * a take records decisions, never recomputes them. Module-level, last-resolver-wins, like the motion
 * read above; null until the first resolve completes. `homesChanged` is the store write-back signal:
 * the homes moved on this frame (the old tap wrote the store on exactly this condition).
 * Shape: { dishPins, dishFormed, dishLimbs, dishTraits, dishHosted, dishPressure, homesChanged }.
 */
let lastSpawnDecisions = null;
export function getLastSpawnDecisions() { return lastSpawnDecisions; }

export function createLiveResolver() {
  const placementCaches = new Map();
  const swarmState = new Map();
  const feedLive = createFeedLive(CANVAS_W, CANVAS_H);
  const dish = createResolverDish(); // #1183: one dish per document
  // #606: scene units follow the authored canvas (set per resolveLayers).
  let W = CANVAS_W;
  let H = CANVAS_H;
  let worldNoise = null;
  let worldNoiseSeed = null;
  // #1128: ONE anchored clock for the living-motion floor. RATE 0 freezes it where it is, a RATE change re-anchors it
  // (no jump), and a held loop clock (pause) holds it: the same contract as the library kinemes.
  const driverClock = createDriverClock();
  // #1574: ONE travel store for every placement layer of this resolver —
  // per-instance sim state keyed by scene (layer) id + instance index +
  // seed, surviving placement rebuilds. The frame delta is measured once
  // per resolve (high-water, like warpPhase: a rolled-back frame credits
  // nothing, and a frozen frame's span is never lump-credited on thaw
  // because slowRender frames still advance the mark — see travelFrameMs).
  const travelStore = createTravelStore();
  // #1576 — P3's stores, one per resolver like the travel store: the
  // surge envelope state and the parallax drift clock. Both advance on
  // the same high-water frame delta travelFrameMs measures below.
  const surgeStore = createSurgeStore();
  const parallaxStore = createParallaxStore();
  let travelLastMs = null;

  // Item-level morph (chip clicks): per content layer, the last shown
  // (post-morph) items + the signature they were shown for, and any
  // in-flight transition. See itemMorph.mjs for why "identity" here is
  // nearest-same-asset, not a true cross-generator match.
  const lastShown = new Map(); // layerId -> { sig, items }
  const morphState = new Map(); // layerId -> { fromItems, startMs, dur }
  // #509 phase 1 — MOD steering: transient per-target multipliers computed
  // in this tick's MOD block, applied at the NEXT tick's update spread
  // (16ms lag, same order as FEED's delay-1). Module state, never the
  // store — steering is render-only overlay, not document state.
  const modSteerByLayer = new Map(); // layerId -> { ali, coh, sep }
  // #509 phase 2 — ONE scent field for every organism layer (stigmergy
  // across layers: mold on KC-1 smells KC-2's deposits). Stepped once per
  // tick after all layers update — never per-layer (N× decay + order
  // dependence). Persists across ticks; decay empties it, no prune needed.
  const sharedScent = createScentField();
  // #1407 — ONE dish session for every swarm stratum (the shared contact
  // grid). Enrolment is refreshed per layer in swarmItems, the session is
  // armed once per resolve with the visible stack order, and the pass
  // itself runs inside the first enrolled system's update — see
  // engine/dishContacts.mjs for the protocol.
  const dishSession = createDishSession();
  // #1412 — the density tick last published from the session (see the
  // publish at the end of resolveLayers): a frame whose dish pass ran
  // publishes its field; any other frame publishes the empty field.
  let densityTickSeen = 0;
  // #432 — per-layer displacement warp phase, accumulated incrementally
  // (integral of noiseSpeed over each frame's dt) rather than derived as
  // speed × absolute session time. See the warp block below for why.
  const warpPhase = new Map(); // layerId -> { base, lastMs }
  // #720 — DLA / Eden growth tick, per layer. The aggregate advances one
  // tick per presented frame (never in slowRender); growthTick rides the
  // geometry signature, so the placement cache busts honestly — the same
  // deal as the CA grid's identity change. Pruned against documentIds like
  // warpPhase: a hidden-then-reshown layer resumes its grown form instead
  // of regrowing from the seed.
  const growthTickByLayer = new Map(); // layerId -> { tick, key }
  // #564 — Assets-tab edits that change what a layer DRAWS without changing
  // which ids are enabled: SWAP replaces an overlay asset's SVG under the
  // same id, a weight edit re-rolls which asset each slot gets. Neither
  // moved morphSig before, so both snapped — the atlas rebaked under a fully
  // visible canvas (#561). Recomputed only when the store hands over a new
  // customAssets array, which it does on every such edit.
  let overlayRevSrc;
  let overlayRevs = new Map(); // overlay asset id -> content hash
  // #457 — PATCH (MOD/FIELD/FEED) targets a stable layer id (patch.to,
  // validated in layersSlice.js), but trackGraph.js's applyMod/applyField
  // and feedLive's delay buffer are numeric-slot APIs (FEED's fixed-size
  // Float32Array-per-slot needs a small bounded int, not a string key).
  // feedSlots is the adapter: each layer id gets ONE stable numeric slot
  // for as long as it exists, assigned once and reused every frame --
  // unlike an ordinal recomputed from content[]'s current visible-only
  // position, hide/solo/reorder/remove of OTHER layers never changes it.
  const feedSlots = new Map(); // layerId -> slot [0, MAX_TRACKS)
  const feedSlotFree = [];
  let feedSlotNext = 0;
  function slotFor(layerId) {
    let slot = feedSlots.get(layerId);
    if (slot !== undefined) return slot;
    slot = feedSlotFree.length ? feedSlotFree.pop() : feedSlotNext++;
    // Defensive only: MAX_CONTENT_TRACKS (layersSlice.js) already caps
    // concurrent content layers at MAX_TRACKS, so this never fires today.
    if (slot >= MAX_TRACKS) slot %= MAX_TRACKS;
    feedSlots.set(layerId, slot);
    return slot;
  }

  function prune(aliveIds, documentIds) {
    for (const k of [...placementCaches.keys()]) if (!aliveIds.has(k)) placementCaches.delete(k);
    for (const k of [...swarmState.keys()]) {
      if (!aliveIds.has(k)) {
        releaseDishBody(dishSession, swarmState.get(k).system); // #1407 — a removed stratum leaves the dish
        swarmState.delete(k);
      }
    }
    for (const k of [...lastShown.keys()]) if (!aliveIds.has(k)) lastShown.delete(k);
    for (const k of [...morphState.keys()]) if (!aliveIds.has(k)) morphState.delete(k);
    for (const k of [...modSteerByLayer.keys()]) if (!aliveIds.has(k)) modSteerByLayer.delete(k);
    // #450 — warpPhase prunes against documentIds (every layer still in the
    // document, hidden or not), not the visible-only aliveIds every other
    // map here uses. World time keeps advancing while a layer is merely
    // hidden; resetting its phase to 0 on re-show is discontinuous with
    // where the shared noise field actually is by then — a one-frame
    // visible snap in the displaced pixels. Only a genuinely REMOVED layer
    // (gone from the document entirely, so absent from documentIds too)
    // should free this entry.
    for (const k of [...warpPhase.keys()]) if (!documentIds.has(k)) warpPhase.delete(k);
    for (const k of [...growthTickByLayer.keys()]) if (!documentIds.has(k)) growthTickByLayer.delete(k); // #720
    pruneTravelStore(travelStore, documentIds); // #1574 — a removed layer's roam goes with it
    pruneSurgeStore(surgeStore, documentIds); // #1576 — a removed layer's envelope goes with it
    pruneParallaxStore(parallaxStore, documentIds); // #1576 — a removed layer's drift clock goes with it
    // #822 — FEED slots follow the document, not visibility. Freeing a slot
    // on hide let the next layer reuse it and read the hidden track's
    // delay-1 buffer (a snap, and a partner the picture did not have).
    // Only a removed layer returns its slot.
    for (const k of [...feedSlots.keys()]) {
      if (!documentIds.has(k)) { feedSlotFree.push(feedSlots.get(k)); feedSlots.delete(k); }
    }
  }

  function cacheFor(layerId) {
    let c = placementCaches.get(layerId);
    if (!c) { c = {}; placementCaches.set(layerId, c); }
    return c;
  }

  function swarmItems(layerId, ctx) {
    let st = swarmState.get(layerId);
    if (!st) {
      st = { system: new ParticleSystem(), initKey: null, phraseGen: -1 };
      swarmState.set(layerId, st);
    }
    const initKey = [ctx.mode, ctx.seed, W, H,
      ctx.seedOffsets?.spatial || 0, ctx.seedOffsets?.color || 0,
      ctx.seedOffsets?.asset || 0, ctx.seedOffsets?.noise || 0,
      ctx.layoutParams.graze || 0].join('|');
    if (st.initKey !== initKey) {
      // #427 — adopt-on-enter: capture whatever was actually on screen for
      // this layer last frame BEFORE re-init scatters fresh positions from
      // the seed. A mode chip click (GRID -> MURMURATION) changes `mode`,
      // which is in initKey, so the swarm re-inits even with the seed
      // untouched -- the old items were a structured placement or a
      // different swarm state, the new ones are init's scatter, two
      // unrelated distributions. itemMorph then honestly tweens toward
      // the new scatter -- but the targets are arbitrary relative to a
      // frame ago, so every organism used to fly canvas-wide on entry.
      const wasShown = ctx.slowRender ? [] : (lastShown.get(layerId)?.items || []);
      st.system.init(Math.ceil(ctx.safeParticles), W, H, ctx.activeAssets, ctx.palette, ctx.seed, ctx.seedOffsets, { graze: ctx.layoutParams.graze || 0 });
      st.initKey = initKey;
      if (wasShown.length) {
        // Right after init every particle is alive and (for organisms)
        // exactly one 'body' item exists per particle, both in ascending
        // particle-index order -- array position IS the particle index
        // here, with no ambiguity to resolve.
        // getItems() carries `.asset` (object); matchItems groups by
        // `.assetId` (string) — the same derivation swarmItems does below
        // for the presented list, needed here too or every fresh item
        // falls into one shared 'default' bucket and nothing matches.
        const fresh = st.system.getItems(ctx.activeAssets)
          .filter((it) => !it.role || it.role === 'body')
          .map((it) => (it.assetId ? it : { ...it, assetId: it.asset?.id }));
        const { pairs } = matchItems(wasShown, fresh);
        const adopt = pairs
          .map(([from, to]) => ({ i: fresh.indexOf(to), x: from.x, y: from.y }))
          .filter((p) => p.i >= 0);
        if (adopt.length) st.system.adoptPositions(adopt);
      }
    }
    if (st.phraseGen !== ctx.phraseWrapGen) {
      st.system.resetPhase();
      st.phraseGen = ctx.phraseWrapGen;
    }
    // #1407 — enrol this stratum in the shared dish grid, refreshed every
    // frame (contact params are live knobs). Only swarm strata reach
    // swarmItems: FX strata never enrol — they are the medium.
    // #1409 — the per-Look DISH switch gates enrolment itself: OFF enrols
    // radius 0, the session never arms, strata ghost (the bake driver
    // gates through the same helper — live and bake cannot disagree).
    enrolDishBody(dishSession, {
      key: layerId, sys: st.system,
      radius: dishEnrolRadius(ctx.layoutParams),
      restitution: ctx.layoutParams.contactRestitution ?? 0.5,
      contactMode: ctx.layoutParams.contactMode || 'none',
      umask: ctx.layoutParams.collideMask ?? 0xffffffff,
      organism: isOrganismMode(ctx.mode),
      // #1413 — the stratum's medium rides enrolment (the bake driver
      // enrols the same field through the same helper — live and bake
      // cannot disagree about how wet the dish is).
      wetness: ctx.layoutParams.accumulationWetness,
      // #1415 — the stratum's ACCUMULATION switch rides enrolment the
      // same way: up, the stratum deposits trails into the shared
      // ground (the bake driver enrols the same field).
      accum: !!ctx.layoutParams.accumulation,
      // #1416 — the stratum's ecology MODE and the governor's cap
      // ride enrolment the same way: in the mode, the stratum joins
      // the dish's pooled population ledger at this cap (the bake
      // driver enrols the same fields through the same helper).
      ecology: !!ctx.layoutParams.ecology,
      cap: ctx.caps?.maxParticles,
    });
    if (!ctx.slowRender) {
      // Spine A (#387): dtSec + loop-accumulated ms replace Date.now().
      // Spine C (#389): forward motionSmoothing for critically damped heading.
      // Spine E: forward safeParticles as float particleCount for fade spawn/death.
      // Spine F (#392): forward shared world noise + domain offset.
      st.system.update(
        {
          ...ctx.layoutParams,
          particleCount: ctx.safeParticles,
          maxParticles: ctx.caps?.maxParticles,
          motionSmoothing: ctx.motionSmoothing,
          noise: ctx.noise,
          noiseDomainOffset: ctx.noiseDomainOffset,
          // #509 phase 1 — last tick's MOD steering for this layer (undefined
          // = identity; particles.js defaults). Spread-only, never stored.
          modSteer: modSteerByLayer.get(layerId),
          // #509 phase 2 — the shared scent field (spread-only, never
          // stored). All organism layers deposit into and read one ground.
          scentField: sharedScent,
          // #1407 — the shared dish session (spread-only, never stored).
          // Armed once per resolve; the pass runs inside the first
          // enrolled system's update.
          dishSession,
          // #1410 — the stillness flag (spread-only, never stored): the
          // deform step renders rest under reduced-motion.
          reducedMotion: !!ctx.reducedMotion,
          // #1412 — the governor's tier-2 shed for pigment exchange
          // (spread-only, never stored), computed per layer at the
          // swarmItems call site from the frame's governor state.
          pigmentShed: !!ctx.pigmentShed,
        },
        ctx.activeAssets, ctx.palette, ctx.seed, ctx.loopTimeMs, ctx.attractor, ctx.seedOffsets,
        ctx.dtSec,
      );
    }
    let items = st.system.getItems(ctx.activeAssets).map((item) => {
      const swatches = ctx.palette.swatches || [];
      // #287 — grazers are stamped in the palette bg: the ACCUM
      // over-composite then erases beneath them (the deposit/erode loop).
      // The tint is stable per asset, so the atlas bakes the bg combo once.
      const bg = ctx.palette.bg;
      const accent = item.graze ? bg : (swatches[(swatches.indexOf(item.color) + 3) % swatches.length] || swatches[0]);
      const u = Number.isFinite(item.u) ? Math.min(1, Math.max(0, item.u)) : 0;
      const uScale = item.role === 'wing' ? 1 + u * 0.18 : 1;
      return {
        ...item,
        assetId: item.asset?.id,
        accent,
        color: item.graze ? bg : item.color,
        scale: item.scale * ctx.scaleMul * uScale,
        // #451 — pre-breath scale, carried through the same multipliers as
        // the live scale so it stays comparable; used only as the overlap
        // sort key below, never for drawing.
        baseScale: (Number.isFinite(item.baseScale) ? item.baseScale : item.scale) * ctx.scaleMul * uScale,
        alpha: Math.min(100, item.alpha + ctx.alphaBoost),
        u,
        seedOffset: item.seedOffset,
      };
    });
    // #451 — sort by baseScale (pre-#287-breath), not the live breathing
    // scale: two items whose live scales cross mid-breath used to swap
    // draw-order position every time they crossed, a one-frame z-fight with
    // no morph or chip click involved. Sorting on the stable, non-oscillating
    // size keeps stacking order settled unless the items' designed sizes
    // actually differ, or a placement rebuild changes them.
    if (!ctx.layoutParams.overlap) items = [...items].sort((a, b) => a.baseScale - b.baseScale);
    // #1202 — 4-state reflection on the organism path (was X-only stamp).
    // A legacy 'stamp' symmetry still reads as X here; normalize promotes
    // it to mirror:'x' for new documents.
    const stampState = ctx.layoutParams.symmetry === 'stamp' ? 'x' : ctx.layoutParams.mirror;
    if (ctx.caps.allowMirror) {
      items = mirrorItems(items, stampState, W, H);
    }
    return items;
  }

  // Phase 2 S2 — skinning on: the resolver is the skeleton's standing consumer (bent wings are the moth's
  // look, not a debug view). The builder builds each formed moth's skeleton every frame and skins the wing
  // items over it; input.wantSkeletons (the ?debug=skeleton flag) still gates only the debug PUBLICATION
  // downstream — the overlay reads getLastSkeletons(), which this builder now always fills for formed moths.
  const creatures = createCreatureBuilder({ skinning: true });
  const dishCreatures = createDishCreatureBuilder(); // #1634 slice 2: the second family's body, after the moths
  const spawnState = createCreatureSpawnState(); // #1694 slice 1: formation + spawn, owned by this resolver
  registerSpawnState(spawnState);

  function resolveLayers(input) {
    registerSpawnState(spawnState); // #1694 slice 1 — whichever resolver ran last owns the live channel (the getLastFrameMotion law)
    W = input.canvasW || CANVAS_W;
    H = input.canvasH || CANVAS_H;
    const caps = getQualityCaps(input.quality || 'balanced');
    const pool = mergePool(ASSETS, input.customAssets || []);
    if (overlayRevSrc !== input.customAssets) {
      overlayRevSrc = input.customAssets;
      overlayRevs = new Map((input.customAssets || [])
        .filter((a) => a && typeof a === 'object')
        .map((a) => [String(a.id), hashStr(String(a.svg || ''))]));
    }
    const driverSec = driverTimeSec(driverClock, input.loopTimeMs ?? 0, input.layoutParams?.kinemeRate ?? 1);
    // #1574 — this frame's travel delta on the spine-A clock, measured once
    // for every layer (high-water: a rolled-back frame credits nothing).
    // slowRender frames advance the mark without travelling, so a freeze
    // never banks sim time and a thaw never lump-credits the frozen span.
    const travelNowMs = input.loopTimeMs ?? 0;
    const travelFrameMs = travelLastMs == null ? 0 : Math.max(0, travelNowMs - travelLastMs);
    travelLastMs = travelLastMs == null ? travelNowMs : Math.max(travelLastMs, travelNowMs);
    // #1574 Q2 — the traveler budget's device class rides the same base:
    // input.travelIpadClass is a MACHINE key (stamped by liveLoop from the
    // device, recorded in a take's input log like every resolver input).
    // Absent — every take recorded before Q2 — it reads false (desktop
    // class), whose cap is the full placement cap: P1's behaviour exactly.
    const travelBase = input.slowRender ? null : { store: travelStore, frameMs: travelFrameMs, shed: !!input.travelShed, ipadClass: input.travelIpadClass === true };
    // #1576 — P3's bases ride the same measured frame delta and the same
    // travel shed. The surge TRIGGER is an input signal: input.surgeTrigger,
    // which the Queen stamps (Q3, ruled by Matt 2026-10-20 — liveLoop stamps
    // her call from the recorded keeps ledger: the curation layer's M9
    // mechanic, hosted by the Director; no beat wiring, no perform control,
    // no surface). Absent — every take recorded before Q3 — and 0 on every
    // frame she does not call, the machinery is inert and frames are
    // bit-identical to pre-P3.
    const surgeBase = input.slowRender ? null : { store: surgeStore, frameMs: travelFrameMs, shed: !!input.travelShed, trigger: input.surgeTrigger ?? 0 };
    const parallaxBase = input.slowRender ? null : { store: parallaxStore, frameMs: travelFrameMs, shed: !!input.travelShed };
    const weightOverrides = input.assetWeightOverrides || {};
    const out = [];
    // #1469 — this frame's living-motion read, published at the end of the resolve (getLastFrameMotion).
    let frameKineme = null;
    let frameWind = null;
    const aliveIds = new Set();
    // #450 — every layer id present in the document, regardless of
    // visibility. See prune()'s warpPhase branch for why this differs
    // from aliveIds (visible-only).
    const documentIds = new Set(
      (input.layers || []).filter((l) => l && typeof l === 'object' && typeof l.id === 'string').map((l) => l.id),
    );

    // Spine F (#392): Single shared world noise owned by the resolver.
    const projectSeed = (input.seed ?? 0) >>> 0;
    if (!worldNoise || worldNoiseSeed !== projectSeed) {
      if (input.focusSwap && worldNoise) {
        // #425 — a layer focus swap changes the top-level seed (every layer
        // carries its own), but must not reseed the shared weather: adopt
        // the seed and keep the field. Genuine reseeds (shuffle) arrive
        // with focusSwap false and still recreate.
        worldNoiseSeed = projectSeed;
      } else {
        worldNoise = createNoise(projectSeed || 444);
        worldNoiseSeed = projectSeed;
        // #1415 — state purity rides the same genuine-reseed branch:
        // a new seed starts with an empty trail field (the focus-swap
        // adoption above keeps the ground, exactly as it keeps the
        // weather). The bake never needs this — its session is born
        // empty.
        clearDishTrails(dishSession);
      }
    }

    // #720 — default audio drive for DLA/Eden growth: the mean of the
    // Stimuli meter bands, read once per resolve. null when the bus is
    // silent — the engine's seeded baseline keeps the piece alive. This is
    // a default driver, not the mapping: the curator engine (#762) owns
    // which bands drive rate/branching and will drive growthRate/growthBranch
    // directly.
    let audioEnergy = null;
    const meterBands = readMeterBandLevels();
    if (meterBands) {
      let sum = 0;
      let n = 0;
      for (const v of Object.values(meterBands)) {
        if (Number.isFinite(v)) { sum += v; n++; }
      }
      if (n > 0) audioEnergy = Math.min(1, Math.max(0, sum / n));
    }

    // #1407 — arm the dish for this frame with the visible stack order
    // (the order the loop below resolves in). Arms only when at least two
    // enrolled strata have contacts on; otherwise every update below
    // stays bit-identical to the per-system engine.
    armDish(dishSession, (input.layers || [])
      .filter((l) => l && typeof l === 'object' && l.visible !== false)
      .map((l) => l.id));

    for (const layer of (input.layers || []).filter((l) => l && typeof l === 'object' && l.visible !== false)) {
      aliveIds.add(layer.id);
      // #1097/#1098 — a PATTERN track is not a KC track: it has no snapshot (the content path below
      // would draw a phantom copy of the active KC), so it resolves here, to its own block and the
      // ACTIVE palette. It is drawn by the renderer as one generated texture.
      if (layer.type === 'pattern') {
        out.push({
          id: layer.id,
          isPattern: true,
          layer,
          pattern: layer.pattern,
          palette: resolvePalette(input.paletteId, input.paletteOverrides, input.userPalettes),
          t: (input.loopTimeMs ?? 0) / 1000,
          layerBlendMode: layer.layerBlendMode || 'normal',
          layerOpacity: layer.layerOpacity ?? 1,
          layoutParams: {},
          items: [],
        });
        continue;
      }
      if (isFxLayer(layer) || isMathLayer(layer)) {
        // #1010 — MATH tracks ride the same adjustment-layer fold as FX.
        // soloGrade marks a soloed MATH track: the renderer seeds its wrap
        // with neutral mid-grey so Matt sees the grade's contribution only.
        out.push({
          id: layer.id,
          isFx: true,
          isMath: isMathLayer(layer),
          layer,
          layerOpacity: layer.layerOpacity ?? 1,
          soloGrade: isMathLayer(layer) && input.soloStash?.id === layer.id,
        });
        continue;
      }
      const isActive = layer.id === input.activeLayerId;
      const snap = input.layerSnapshots?.[layer.id];
      const src = isActive
        ? {
            seed: input.seed, seedOffsets: input.seedOffsets, paletteId: input.paletteId,
            paletteOverrides: input.paletteOverrides,
            layoutParams: input.perfClampOverride
              ? { ...input.layoutParams, ...input.perfClampOverride }
              : input.layoutParams,
            caGrid: input.caGrid, enabledAssets: input.enabledAssets,
          }
        : (snap || {
            seed: input.seed, seedOffsets: input.seedOffsets, paletteId: input.paletteId,
            paletteOverrides: input.paletteOverrides, layoutParams: input.layoutParams,
            caGrid: input.caGrid, enabledAssets: input.enabledAssets,
          });

      const layoutParams = { ...DEFAULT_LAYOUT_PARAMS, ...(src.layoutParams || {}) };
      // #1202 — mirror is a 4-state enum; 'off' is truthy, so compare explicitly.
      if (input.perfTier1 && layoutParams.mirror !== 'off') layoutParams.mirror = 'off';
      // #425 — life drift per layer (see applyLifeDrift): own base, own
      // lifeDrift, own locks — top-level for the active layer, the snapshot
      // for the rest. Life pauses the same two ways it used to: slowRender
      // (which folds !running) and batch exports.
      if (!input.slowRender && !input.batchPaused) {
        const locks = isActive
          ? (input.lockedParams || {})
          : (snap ? (snap.lockedParams || {}) : (input.lockedParams || {}));
        applyLifeDrift(layoutParams, locks, input.loopTimeMs ?? 0);
      }
      const palette = resolvePalette(src.paletteId, src.paletteOverrides, input.userPalettes);
      // #733 — shape mixer: normalized per-asset pick weights, live only
      // while the pool is exactly the on-chips' union (liveShapeLevels).
      const mixW = shapeMixWeights(liveShapeLevels(input.shapeLevels, src.enabledAssets));
      // #1694 slice 2 — the creature citizen is a pool member, never a placeable mark: excluded
      // here, by id, BEFORE the pool signature is computed, so placements, assetSig and the swarm
      // are exactly as they were before the citizen joined the pool. By id, not by category: a
      // user duplicate of the citizen is an ordinary mark and stays placeable.
      let activeAssets = pool
        .filter((a) => a.id !== CREATURE_ASSET_ID && (!src.enabledAssets || src.enabledAssets[a.id]))
        .map((a) => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a))
        .map((a) => (mixW && mixW[a.id] ? { ...a, mixWeight: mixW[a.id] } : a));
      // #564 — identity of the pool this layer actually draws: which assets,
      // at what weight, with what content. Computed BEFORE assetThin on
      // purpose: a governor shed is a different class of change (#564's
      // out-of-scope list) and must not fire a transition.
      const assetSig = activeAssets
        .map((a) => `${a.id}:${a.weight || ''}:${a.mixWeight || ''}:${overlayRevs.get(a.id) || 0}`)
        .join(',');
      if (input.assetThin && activeAssets.length > 1) {
        const ranked = [...activeAssets].sort((a, b) => getAssetCost(b) - getAssetCost(a));
        const drop = Math.max(1, Math.ceil(ranked.length * 0.25));
        const dropped = new Set(ranked.slice(0, drop).map((a) => a.id));
        activeAssets = activeAssets.filter((a) => !dropped.has(a.id));
      }
      const safeCount = clampCount(layoutParams.count, layoutParams.mirror, caps);
      const safeParticles = Math.min(Math.max(0, layoutParams.particleCount || 150), caps.maxParticles);
      const seed = (src.seed ?? 0) >>> 0;
      const seedOffsets = src.seedOffsets ?? input.seedOffsets ?? null;

      let items;
      if (isLiveSwarmMode(layoutParams.mode)) {
        items = swarmItems(layer.id, {
          mode: layoutParams.mode, safeParticles, activeAssets, palette, seed, seedOffsets,
          layoutParams, caps, scaleMul: input.scaleMul ?? 1, alphaBoost: input.alphaBoost ?? 0,
          slowRender: !!input.slowRender, attractor: input.attractor ?? null,
          phraseWrapGen: input.phraseWrapGen || 0,
          // Spine A (#387): dt clock + loop time replace Date.now().
          dtSec: input.dtSec ?? 1 / 60,
          loopTimeMs: input.loopTimeMs ?? 0,
          // Spine C (#389): forward motionSmoothing.
          motionSmoothing: input.motionSmoothing ?? layoutParams.motionSmoothing,
          // #1410 — forward the stillness flag to the swarm update.
          reducedMotion: !!input.reducedMotion,
          // #1412 — the tier-2 pigment shed, from this frame's governor
          // state (doc.perfTier1 + quality, sceneContract's predicate).
          pigmentShed: dishPigmentShed({ perfTier1: !!input.perfTier1, quality: input.quality || 'balanced' }),
          // Spine F (#392): shared world noise + domain offset from seedOffsets.noise
          noise: worldNoise,
          noiseDomainOffset: (seedOffsets?.noise || 0) * 100,
        });
      } else {
        // #720 — advance the growth tick for dla/eden layers. A mode, seed,
        // or spatial-offset change restarts the organism from its zygote.
        // Frozen in slowRender: stills stay deterministic, like the warp pin.
        let growthTick = 0;
        if (layoutParams.mode === 'dla' || layoutParams.mode === 'eden') {
          const gKey = [layoutParams.mode, seed, seedOffsets?.spatial || 0].join('|');
          let gt = growthTickByLayer.get(layer.id);
          if (!gt || gt.key !== gKey) { gt = { tick: 0, key: gKey, gen: 0 }; growthTickByLayer.set(layer.id, gt); }
          if (!input.slowRender) {
            gt.tick++;
            // #793 — biology: the policy may end this generation. The decision
            // is pure over the aggregate's vital signs; the regrow goes
            // through GrowthHooks (clear + tick reset → the zygote blooms
            // again on the next sample, same seed, same organism reborn).
            const policy = getBiologyPolicy();
            const agg = ensureAggregate(seed, layoutParams.mode, gt.tick, {
              growthRate: layoutParams.growthRate,
              growthBranch: layoutParams.growthBranch,
              audioEnergy,
              seedOffsets,
            });
            const stats = assessAggregate(agg);
            const decision = decideLifecycle(stats, policy.growth, gt.tick);
            if (decision.action === 'regrow') {
              GrowthHooks.clearGrowth(seed, layoutParams.mode, seedOffsets);
              gt.tick = 0;
              gt.gen++;
            }
            recordLifecycleState(layer.id, {
              mode: layoutParams.mode, gen: gt.gen, tick: gt.tick,
              cellCount: stats.cellCount, oldestAge: stats.oldestAge,
              meanAge01: stats.meanAge01, decision: decision.action,
              reason: decision.reason,
            }, input.loopTimeMs);
          }
          growthTick = gt.tick;
        }
        // #1469 — capture the frame's living-motion read as the placements consume it: the first
        // layer (stack order) whose floor is alive supplies the kineme; wind comes from the first
        // resolved layer. Published at the end of the resolve (getLastFrameMotion).
        const kineme = livingMotion(layoutParams, seed, driverSec, W, H, input.slowRender, input.beatDrive, input.assetStill, input.reducedMotion);
        if (frameWind === null && Number.isFinite(layoutParams.wind)) frameWind = layoutParams.wind;
        if (frameKineme === null && kineme !== null) frameKineme = kineme;
        items = buildPlacements({
          layoutParams, seed, seedOffsets, activeAssets, palette,
          caGrid: src.caGrid ?? null, caps, canvasW: W, canvasH: H,
          scale: input.effectiveScale, scaleY: input.effectiveScaleY, alpha: input.effectiveAlpha, cache: cacheFor(layer.id),
          growthTick, audioEnergy,
          layerId: layer.id, // #1245 — unknown-sampler diagnostic key
          kineme,
          // #1574 — the travel input: the resolver's store + this frame's
          // spine-A delta + the governor's shed. Mode/leash/strength ride
          // layoutParams (recipe data); buildPlacements gates on them, so
          // a 'still' scene never steps the sim.
          travel: travelBase ? { ...travelBase, sceneId: layer.id } : null,
          // #1576 — P3's inputs: the resolver's surge/drift stores + this
          // frame's delta + the travel shed (+ the inert-by-default surge
          // trigger signal). Amounts ride layoutParams (recipe data);
          // buildPlacements gates on them, so an off scene never steps
          // either store.
          surge: surgeBase ? { ...surgeBase, sceneId: layer.id } : null,
          parallaxDrift: parallaxBase ? { ...parallaxBase, sceneId: layer.id } : null,
          // #1183 — the ground: { dish, lean } when this layer leans on a PATTERN below it, else nothing (byte-identical).
          ...groundArgs({
            dish, layers: input.layers, layerId: layer.id, lean: layoutParams.groundLean, nudge: layoutParams.groundNudge, snap: layoutParams.groundSnap, W, H, seed,
            getPalette: () => resolvePalette(input.paletteId, input.paletteOverrides, input.userPalettes),
            tSec: (input.loopTimeMs ?? 0) / 1000,
          }),
          // #1183 weather — the air: { dish, air, airVeil } when an FX layer above carries haze and this
          // layer's WEATHER dial is up, else nothing (byte-identical). Same dish, same frame time.
          ...weatherArgs({
            dish, layers: input.layers, layerId: layer.id, air: layoutParams.weatherAir, W, H, seed, seedOffsets,
            tSec: (input.loopTimeMs ?? 0) / 1000,
          }),
        }).items;

        // Spine F (#392): Live placement warp offset pass (loop-time nt).
        // Stills/renderFinal and slowRender pin nt to the seed slice, so golden
        // hashes remain deterministic while the live canvas breathes.
        if (layoutParams.displacement > 0) {
          const nowMs = input.loopTimeMs ?? 0;
          let wp = warpPhase.get(layer.id);
          if (!wp) { wp = { base: 0, lastMs: nowMs }; warpPhase.set(layer.id, wp); }
          if (input.slowRender) {
            // #474 — a governor cut6/watchdog freeze is NOT a true pause:
            // liveLoop.mjs only rolls loopTimeMs back for `paused` (!running);
            // slowRender leaves it advancing in real wall-clock time while
            // this whole block sits skipped. Left alone, wp.lastMs would
            // still read the pre-freeze instant once the freeze lifts, so
            // the resuming frame's dSec would lump-sum-credit the entire
            // frozen span as warp progress in one jump. Pinning lastMs to
            // "now" on every frozen frame keeps that next dSec small and
            // ordinary — the same guarantee a true pause gets for free from
            // its rollback, without spending the noise-sampling cost below
            // on frames nothing is presenting anyway.
            wp.lastMs = nowMs;
          } else {
            // #432 — nt0 is a FIXED per-seed reference (no longer noiseSpeed-
            // scaled: that let even the "pinned" baseline shift when speed
            // changed). The live phase is accumulated incrementally below
            // (integral of noiseSpeed over each frame's own dt) instead of
            // speed × absolute session time — the old form meant any speed
            // change (drift ticks it every 80ms, the slider, voice MIX)
            // jumped the phase by an amount that grew the longer the tab
            // stayed open, since the same small Δspeed multiplied an
            // ever-larger elapsed-time term. Accumulating means a speed
            // change only affects the phase's rate from that point on.
            const nt0 = (seed & 0xffff) * 0.02;
            const dSec = Math.max(0, nowMs - wp.lastMs) * 0.001;
            // Hitch fix — noiseSpeed drift is a smooth rate modulation,
            // not a quantized geometry param. Base noiseSpeed stays stable
            // for the cache; the drift adds to the warp phase rate.
            const driftNs = layoutParams.lifeDriftOffset?.ns ?? 0;
            wp.base += dSec * ((layoutParams.noiseSpeed ?? 0.5) + driftNs);
            // #460 — high-water mark, not a raw assignment: a backward jump
            // (a rejected/rolled-back frame, #421-style) must not walk
            // lastMs down to match. Without this, the clamp above correctly
            // refuses to rewind wp.base on THAT call, but lastMs still drops
            // to the lower value -- so once the clock climbs back past the
            // old high point, the next call's dSec is measured from the
            // lower dropped-to point instead of from where real progress
            // last actually happened, over-crediting elapsed time by the
            // size of the dip. A sustained pause re-ticks buildFrame every
            // frame with jittery clampedDtMs (liveLoop.mjs, [8,50]ms,
            // tracks real wall-clock frame timing), so this repeats every
            // tick the jitter dips below the high point -- a slow leak, not
            // a one-time bounded error.
            wp.lastMs = Math.max(wp.lastMs, nowMs);
            const noiseFreq = layoutParams.noiseFreq ?? 0.005;
            const displacement = layoutParams.displacement;
            const domainOffsetX = (seedOffsets?.noise || 0) * 100;
            const domainOffsetY = (seedOffsets?.noise || 0) * 100;
            const isLayersMode = layoutParams.mode === 'layers';

            items = items.map((it, k) => {
              const band = isLayersMode ? ((it.index ?? k) % 5) : 0;
              // bandMult is time-invariant, so scaling the already-accumulated
              // phase by it is exactly the integral of (speed * bandMult) dt.
              const bandMult = isLayersMode ? (0.4 + band * 0.25) : 1;
              const ntLive = nt0 + nodePhase(wp.base * bandMult, it);
              const curDx = worldNoise.fBm3D(it.x * noiseFreq + domainOffsetX, it.y * noiseFreq + domainOffsetY, ntLive, 3) * displacement;
              const curDy = worldNoise.fBm3D(it.x * noiseFreq + 200 + domainOffsetX, it.y * noiseFreq + 200 + domainOffsetY, ntLive + 100, 3) * displacement;
              const baseDx = worldNoise.fBm3D(it.x * noiseFreq + domainOffsetX, it.y * noiseFreq + domainOffsetY, nt0, 3) * displacement;
              const baseDy = worldNoise.fBm3D(it.x * noiseFreq + 200 + domainOffsetX, it.y * noiseFreq + 200 + domainOffsetY, nt0 + 100, 3) * displacement;
              return {
                ...it,
                x: it.x + (curDx - baseDx),
                y: it.y + (curDy - baseDy),
              };
            });
          }

          // Hitch fix — apply life-drift as smooth post-geometry offsets.
          // The base jitter/displacement/noiseSpeed in layoutParams stay
          // stable (geometry cache holds); the drift wobble is continuous.
          const drift = layoutParams.lifeDriftOffset;
          if (drift && (drift.j || drift.d)) {
            items = items.map((it, k) => {
              let dx = 0, dy = 0;
              if (drift.j) {
                dx += (hash01(k) - 0.5) * drift.j;
                dy += (hash01(k + 7919) - 0.5) * drift.j;
              }
              if (drift.d) {
                // Subtle additional wobble; base displacement is in geometry.
                dx += (hash01(k + 104729) - 0.5) * drift.d * 0.3;
                dy += (hash01(k + 104729 + 7919) - 0.5) * drift.d * 0.3;
              }
              return dx || dy ? { ...it, x: it.x + dx, y: it.y + dy } : it;
            });
          }
        }
      }
      items = (items || []).filter((it) => it && it.assetId);
      // Item-morph trigger signature: the fields that used to drive
      // the pixel crossfade (mode/behave/asset-set; palette left it, #622), scoped per
      // layer. Deliberately excludes seed — a SHUFFLE re-roll has never
      // dissolved, chip clicks are the only trigger.
      //
      // #455 — also deliberately excludes paletteOverrides. During an auto
      // voice/preset MIX, resolveLiveRenderState() (voices.js) lerps bg/ink/
      // swatches at full per-frame precision for Spine D's live GPU tint, so
      // paletteOverrides differs on essentially every frame for the whole
      // MIX duration. Including it here meant morphState.set() re-fired
      // every frame: planMorph replanned O(n^2) per frame, and startMs
      // reset each time so raw stayed ~0 and items presented the from-pose
      // for the entire MIX, landing all at once when it finally stopped
      // changing. The continuously-lerped override values were never meant
      // to be a transition trigger in their own right.
      // #622 — and paletteId is out of the sig too. A palette press alters no
      // position, scale, asset or count, only colours; since #564 the morph
      // is a scale swap, so a palette press made every node shrink to zero
      // and regrow over the MIX. Palette changes must never touch scale.
      // Known interim: nothing else eases a BARE palette press (the lerp in
      // resolveLiveRenderState runs only inside a voice MIX, and the pixel
      // dissolve backs only manual scrub), so the colours now cut in one
      // frame. The colour transitions are the Sleight v2 modes (#624 WASH,
      // #625 INJECT); do not paper over the cut by putting paletteId back.
      // #471 — seed rides the sig too, per Matt's mechanism-A pick: EVOLVE's
      // seed target used to write `seed + 1` directly with no morph
      // anywhere (buildPlacements/liveResolve recompute on the spot, every
      // item's position AND asset-cell assignment re-rolling in one
      // frame). Folding seed into morphSig routes every seed change
      // through the same blendItems/morphEase glide the mode/behave/
      // palette/asset-set fields already get — one canonical transition
      // path instead of seed being the one pure-snap field. This also
      // means a manual seed edit or +1 now eases the same way; that's the
      // mechanism's own named tradeoff, not an oversight.
      // #564 — assetSig replaces the old enabled-id join: same trigger for
      // enable/disable (the pool is already filtered by enabledAssets), plus
      // the weight and SVG-content edits the id set alone could not see.
      // #564 — mirror / symmetry double or halve the presented item list (the
      // stamp pass that appends the mirrored copies), and the loop's slider springs pass
      // booleans + strings through raw, so a press used to pop half the nodes
      // in or out at full size. They ride the sig so it goes through the scale
      // swap instead. Read from src.layoutParams (what the player authored),
      // NOT the local layoutParams: that one is already clamped by the
      // governor (`perfTier1 && mirror -> false`, above), and a perf-tier
      // drop is the same class of change as an assetThin shed — it must not
      // spend a MIX-long swap wave on top of the load that caused it.
      // #1202 — mirror is a 4-state string now; a legacy boolean still reads
      // (true → 'x'), and an unset mirror hashes as 'off' like before.
      const srcMirror = src.layoutParams?.mirror;
      const morphSig = [
        layoutParams.mode, layoutParams.behave, seed, assetSig,
        srcMirror === true ? 'x' : (typeof srcMirror === 'string' ? srcMirror : 'off'),
        src.layoutParams?.symmetry ?? 'none',
      ].join('|');
      // #1411 — coalescence: the swarm system's composed merge fields
      // ride the resolved layer (key present only while pairs actually
      // merge, so an unmerged layer's contract is exactly what it was).
      const coalesce = isLiveSwarmMode(layoutParams.mode)
        ? coalescenceFields(swarmState.get(layer.id)?.system)
        : null;
      out.push({ id: layer.id, layoutParams, palette, items, safeCount, morphSig, morphSeed: seed, layerBlendMode: layer.layerBlendMode || 'normal', layerOpacity: layer.layerOpacity ?? 1, layer, ...(coalesce && coalesce.length ? { coalesce } : {}) });
    }
    const content = out.filter((e) => !e.isFx);
    const toNorm = (it) => ({ x: (Number(it.x) || 0) / W, y: (Number(it.y) || 0) / H });
    // #343 / Spine F: MOD reads the source's motion (position + velocity).
    // Both cloud and organism tracks provide real vx/vy for motionMetrics.
    const toNormVel = (it) => ({ ...toNorm(it), vx: Number(it.vx) || 0, vy: Number(it.vy) || 0 });
    // `x || 0.16` would floor a real 0 (the slider's own "off" position) back
    // up to 0.16 — 0 is falsy, not just absent. Only fall back when the value
    // truly isn't a number.
    const patchStrength = (patch) => {
      const n = Number(patch.strength);
      return Number.isFinite(n) ? n : 0.16;
    };
    content.forEach((e) => {
      const patch = e.layer?.patch;
      // #509 phase 1 — steering only lives while a MOD patch points at a
      // live target: anything else (off/field/feed/unpointed) clears it so
      // no stale bend survives a mode change or hide.
      if (!patch || !patch.to || patch.mode !== 'mod') {
        modSteerByLayer.delete(e.id);
        if (!patch || !patch.to) return;
      }
      if (!patch || !patch.to) return;
      // #457 — patch.to is a stable layer id (layersSlice.js validates
      // it); resolve the source by id against THIS frame's content list,
      // not by ordinal. Hide/solo/reorder/remove of some OTHER layer
      // never changes which layer this patch targets.
      if (patch.mode === 'field' || patch.mode === 'feed') {
        // #822 — a missing or hidden partner is not a partner. Do not
        // slotFor() a ghost id (that invents a delay slot) and do not hop.
        const src = content.find((c) => c.id === patch.to && c.id !== e.id);
        if (!src) return;
      }
      if (patch.mode === 'field') {
        const src = content.find((c) => c.id === patch.to);
        // #1307 — column loop (was: toNorm maps ×2 + applyField map + item
        // map). Mutates e.items in place; e.items is reassigned to itself to
        // keep the old postcondition (always an array after this branch).
        const items = e.items || [];
        // #507 — mean presented hop (post-clamp px); the diagnostic line.
        const pullPx = resolveFieldItems(items, src?.items || [],
          { mode: 'field', from: slotFor(patch.to), to: slotFor(e.id), strength: patchStrength(patch) }, W, H);
        e.items = items;
        recordPatchSample(e.id, { mode: 'field', strength: patchStrength(patch), pullPx });
      } else if (patch.mode === 'feed') {
        const src = content.find((c) => c.id === patch.to);
        // #1307 — column loop (was: pts toNorm map + applyFeed map + item
        // map). Null field = no delay history, the old applyTo short-circuit.
        const items = e.items || [];
        const amt = patchStrength(patch) * 0.05;
        const from = slotFor(src.id);
        const field = feedLive.delay.hasHistory(from) ? feedLive.delay.field(from) : null;
        // #507 — same accumulation shape as FIELD (mean post-clamp hop px).
        const pullPx = resolveFeedItems(items, field,
          { mode: 'feed', from, to: slotFor(e.id), strength: amt }, W, H);
        e.items = items;
        recordPatchSample(e.id, { mode: 'feed', strength: patchStrength(patch), pullPx });
      } else if (patch.mode === 'mod') {
        const src = content.find((c) => c.id === patch.to);
        const metrics = motionMetrics((src?.items || []).map(toNormVel));
        const knobs = applyMod({ glow: 0, fade: 0, displace: 0 }, metrics,
          { mode: 'mod', from: slotFor(patch.to), to: slotFor(e.id), strength: patchStrength(patch) });
        // #509 phase 1 — steer the NEXT tick (see modSteerByLayer): the
        // force pass already ran this tick, so these multipliers land in the
        // following update spread — one frame of lag, same as FEED's delay.
        modSteerByLayer.set(e.id, { ali: knobs.ali, coh: knobs.coh, sep: knobs.sep });
        // #507 — MOD diagnostic rides the same knobs + metrics (no new math).
        recordPatchSample(e.id, {
          mode: 'mod', strength: patchStrength(patch),
          speed: metrics.speed, agitation: metrics.agitation,
          glow: knobs.glow, fade: knobs.fade, displace: knobs.displace,
        });
        e.items = (e.items || []).map((it) => ({
          ...it,
          scale: (Number(it.scale) || 1) * (1 + knobs.glow * 0.35),
          alpha: Math.max(0, Math.min(100, (Number(it.alpha) || 100) * (1 - knobs.fade * 0.4))),
          x: it.x + Math.min(HOP_MAX_PX, knobs.displace) * 0.15,
        }));
      }
    });
    // #1307 — rasterize straight from item x/y (was: a per-point toNorm map
    // per layer per frame). Bit-identical; see feedLive.pushSourceItems.
    content.forEach((e) => feedLive.pushSourceItems(slotFor(e.id), e.items || [], W, H));
    feedLive.commit();
    // #509 phase 2 — step the shared scent ONCE per tick, after every
    // layer's deposits landed. Skipped under slowRender (no updates ran, so
    // no deposits — stepping would decay a frozen field, same honesty as
    // the paused-tick rollback).
    if (!input.slowRender) sharedScent.step();
    // #1415 — tick the dish's trail substrate ONCE per tick, after
    // every layer has updated, on the same protocol as the scent step
    // above: deposits read post-integration positions, so the next
    // frame's force passes all read one uniform field. The bake driver
    // ticks once per step with the same call (bake = live arithmetic).
    if (!input.slowRender) tickDishTrails(dishSession);

    // Item-level morph: replaces the pixel crossfade for chip clicks (mode,
    // behave, palette, asset-set). Runs after FIELD/FEED/MOD so those patch
    // effects always see true simulated positions, never a blended
    // in-transition frame; only the final presented item list is swapped.
    const nowMs = input.loopTimeMs ?? 0;
    const mixSeconds = Math.max(0, Number(input.mixSeconds) || 0);
    for (const e of content) {
      const prevShown = lastShown.get(e.id);
      if (prevShown && prevShown.sig !== e.morphSig && mixSeconds > 0) {
        // New or retargeted transition: start from whatever was actually on
        // screen last frame (which may itself be mid-morph — a rapid
        // second chip click re-bases smoothly instead of snapping back).
        // #419: plan the pairing ONCE here. Targets breathe every frame
        // (life drift re-places, the warp slides); re-matching per frame
        // cost O(n^2) and flipped near-tied pairs mid-flight — items
        // darted across their group instead of gliding one straight line.
        // #951: rapid clicks accelerate — each retarget of an in-flight
        // transition squeezes the new duration (x0.65, floored at one
        // beat), so mashing chips rushes the choreography forward but it
        // always glides, never hard-cuts.
        const inFlight = morphState.get(e.id);
        const squeeze = inFlight ? Math.max(0.5, (inFlight.squeeze || 1) * 0.65) : 1;
        morphState.set(e.id, {
          fromItems: prevShown.items,
          startMs: nowMs,
          dur: mixSeconds * squeeze,
          squeeze,
          // #564 — the director's stagger is seeded off the layer seed, so a
          // given seed always replays the same wave across the canvas.
          plan: planMorph(prevShown.items, e.items, e.morphSeed),
        });
      }
      const tr = morphState.get(e.id);
      let shown = e.items;
      if (tr) {
        const raw = tr.dur > 0 ? (nowMs - tr.startMs) / (tr.dur * 1000) : 1;
        if (raw >= 1) {
          morphState.delete(e.id);
        } else {
          shown = blendItems(tr.fromItems, e.items, morphEase(Math.max(0, raw)), tr.plan);
        }
      }
      lastShown.set(e.id, { sig: e.morphSig, items: shown });
      e.items = shown;
    }

    prune(aliveIds, documentIds);
    // #1412 — publish the frame's contact-density field (engine/
    // dishDensity.mjs): the shared grid's per-cell body counts from
    // this frame's pass, stamped on the session by the pass itself.
    // A frame whose pass never ran (dish off, a single stratum, slow
    // render) publishes the empty field — never a stale one. The
    // shell bridges the holder to the bus (curator/dishDensityLive.js).
    publishDishDensity(dishSession.densityTick > densityTickSeen ? dishSession.density : EMPTY_DISH_DENSITY);
    densityTickSeen = dishSession.densityTick;
    // #1355: formed pins grow a moth (no pin formed: nothing happens). It hovers on the layer's own living-motion floor.
    // #1694 slice 2 — the citizen's switch + family option gate the append: citizen off (or family
    // set to dish-only) and no moth is born. The builders keep the full pool (their part lookups).
    if (mothsAllowed(input)) creatures.append(input, out, pool, (e) => livingMotion(e.layoutParams || {}, e.morphSeed, driverSec, W, H, input.slowRender, input.beatDrive, input.assetStill, input.reducedMotion),
      // and on the dials and ground it rests on: the same GROUND / EDGE / SNAP the marks obey (null when none)
      (e) => creatureGround({
        dish, layers: input.layers, layerId: e.id, layoutParams: e.layoutParams,
        getPalette: () => resolvePalette(input.paletteId, input.paletteOverrides, input.userPalettes),
        W, H, tSec: (input.loopTimeMs ?? 0) / 1000, seed: e.morphSeed,
      }));
    // #1634 slice 2 — the dish creature on the hosted pin (input.dishHosted), on the same motion floor and
    // the same ground. No pin hosted: nothing happens, the stage is the moths' alone.
    // #1694 slice 2 — same citizen gate, other family (family moth-only or citizen off: no dish creature).
    if (dishAllowed(input)) dishCreatures.append(input, out, pool, (e) => livingMotion(e.layoutParams || {}, e.morphSeed, driverSec, W, H, input.slowRender, input.beatDrive, input.assetStill, input.reducedMotion),
      (e) => creatureGround({
        dish, layers: input.layers, layerId: e.id, layoutParams: e.layoutParams,
        getPalette: () => resolvePalette(input.paletteId, input.paletteOverrides, input.userPalettes),
        W, H, tSec: (input.loopTimeMs ?? 0) / 1000, seed: e.morphSeed,
      }));
    // #1469 — publish the frame's living-motion read (see getLastFrameMotion). Wind reads 0 on a
    // frozen frame (slowRender): nothing is carried then, and a stale strength would be a ghost.
    lastFrameMotion = { kineme: frameKineme, wind: input.slowRender ? 0 : frameWind, mothBeat: creatures.lastWingBeat() };
    lastSkeletons = creatures.lastSkeletons(); // S1 — the frame's bone graphs, for ?debug=skeleton
    lastPoses = creatures.lastPoses(); // S5 — the frame's band poses, for S2/S4 to consume
    // #1694 slice 1 — the spawn channel observes the resolved frame (formation judges it, then spawn
    // reads the verdicts — App's tap order, the rules unchanged in curator/spawnState.js) and the
    // decisions are published for the loop to stamp on the next frame's input. On a replay this state
    // advances on the recorded inputs like every other resolver state, and cannot move the outputs:
    // the builders read the recorded decision fields, never this state.
    lastSpawnDecisions = spawnState.observe(input, out);
    return out;
  }

  function dispose() {
    creatures.dispose();
    placementCaches.clear();
    swarmState.clear();
    lastShown.clear();
    morphState.clear();
    warpPhase.clear();
    feedLive.reset();
    worldNoise = null;
    worldNoiseSeed = null;
  }

  // ── #1367 — mid-session state snapshot ─────────────────────────────────────
  // The whole accumulative state of this resolver as one JSON-safe object, so a take
  // can begin mid-session: snapshot at a frame boundary, restore into a fresh
  // resolver, and the continuation is bit-identical to the uninterrupted run (the
  // resolverSnapshot proof). The census behind this surface is recorded on #1367.
  // What is deliberately NOT here: placementCaches + the dish ground + growth
  // aggregates + the ecology ledger + coalesce fields (all derived — a cold cache /
  // refill / recount reproduces identical output), the module-level publications
  // (per-frame outputs), and any wall-clock or RNG stream (the resolve path has
  // none: time is a recorded input, RNG is index-addressed).
  function snapshotState() {
    const swarm = {};
    for (const [layerId, st] of swarmState) {
      swarm[layerId] = { initKey: st.initKey, phraseGen: st.phraseGen, system: st.system.snapshotState() };
    }
    const lastShownSnap = {};
    for (const [layerId, v] of lastShown) lastShownSnap[layerId] = { sig: v.sig, items: deepCopyData(v.items) };
    const morphSnap = {};
    for (const [layerId, v] of morphState) morphSnap[layerId] = snapshotMorphEntry(v);
    return {
      v: 1,
      W,
      H,
      worldNoiseSeed,
      driverClock: driverClock.snapshotState(),
      swarm,
      feedDelay: feedLive.delay.snapshotState(),
      feedSlots: [...feedSlots.entries()],
      feedSlotFree: [...feedSlotFree],
      feedSlotNext,
      scent: sharedScent.snapshotCells(),
      dishSession: snapshotDishSession(dishSession),
      lastShown: lastShownSnap,
      morphState: morphSnap,
      modSteer: [...modSteerByLayer.entries()].map(([k, v]) => [k, { ...v }]),
      warpPhase: [...warpPhase.entries()].map(([k, v]) => [k, { ...v }]),
      growthTick: [...growthTickByLayer.entries()].map(([k, v]) => [k, { ...v }]),
      densityTickSeen,
      creatures: creatures.snapshotState(),
      dishCreatures: dishCreatures.snapshotState(),
      spawn: spawnState.snapshotState(), // #1694 slice 1 — the channel rides the snapshot (an OPTIONAL key: pre-repipe snapshots stay valid)
    };
  }

  function restoreState(snap) {
    if (!checkResolverSnapshot(snap)) return false;
    // Phase 1 — validate every system payload against a THROWAWAY instance, so a
    // refused restore leaves this resolver exactly as it was (fail-closed, atomic).
    for (const layerId of Object.keys(snap.swarm)) {
      if (!new ParticleSystem().restoreState(snap.swarm[layerId].system)) return false;
    }
    if (!createFeedDelay(feedLive.w, feedLive.h).restoreState(snap.feedDelay)) return false;
    if (!createScentField().restoreCells(snap.scent)) return false;
    if (!checkDishSessionSnapshot(snap.dishSession)) return false;
    if (!createCreatureBuilder().restoreState(snap.creatures)) return false;
    if (!createDishCreatureBuilder().restoreState(snap.dishCreatures)) return false;
    if (snap.spawn !== undefined && !createCreatureSpawnState().restoreState(snap.spawn)) return false; // #1694 slice 1
    if (!createDriverClock().restoreState(snap.driverClock)) return false;
    // Phase 2 — apply (the same restores just validated; they cannot refuse now).
    W = snap.W;
    H = snap.H;
    worldNoiseSeed = snap.worldNoiseSeed;
    worldNoise = worldNoiseSeed == null ? null : createNoise(worldNoiseSeed || 444);
    driverClock.restoreState(snap.driverClock);
    for (const k of [...swarmState.keys()]) releaseDishBody(dishSession, swarmState.get(k).system);
    swarmState.clear();
    for (const [layerId, rec] of Object.entries(snap.swarm)) {
      const system = new ParticleSystem();
      system.restoreState(rec.system);
      swarmState.set(layerId, { system, initKey: rec.initKey, phraseGen: rec.phraseGen });
    }
    feedLive.delay.restoreState(snap.feedDelay);
    feedSlots.clear();
    for (const [k, v] of snap.feedSlots) feedSlots.set(k, v);
    feedSlotFree.length = 0;
    feedSlotFree.push(...snap.feedSlotFree);
    feedSlotNext = snap.feedSlotNext;
    sharedScent.restoreCells(snap.scent);
    restoreDishSession(dishSession, snap.dishSession);
    // #1367 — recreate the snapshot's enrolments: entry EXISTENCE is session state
    // (see snapshotDishSession). Without this, the first restored frame re-enrols
    // mid-frame and its cross-strata pass fires empty — the pass reads the entries
    // enrolled by previous frames. The next resolveLayers refreshes every record
    // from the live input, exactly as it refreshes a live session's entries.
    restoreDishEntries(dishSession, snap.dishSession.entries, (key) => {
      const st = swarmState.get(key);
      return st ? st.system : null;
    });
    lastShown.clear();
    for (const [k, v] of Object.entries(snap.lastShown)) lastShown.set(k, { sig: v.sig, items: deepCopyData(v.items) });
    morphState.clear();
    for (const [k, v] of Object.entries(snap.morphState)) morphState.set(k, restoreMorphEntry(v));
    modSteerByLayer.clear();
    for (const [k, v] of snap.modSteer) modSteerByLayer.set(k, { ...v });
    warpPhase.clear();
    for (const [k, v] of snap.warpPhase) warpPhase.set(k, { ...v });
    growthTickByLayer.clear();
    for (const [k, v] of snap.growthTick) growthTickByLayer.set(k, { ...v });
    densityTickSeen = snap.densityTickSeen;
    creatures.restoreState(snap.creatures);
    dishCreatures.restoreState(snap.dishCreatures);
    // #1694 slice 1 — a pre-repipe snapshot carries no spawn state: the channel starts fresh, as a fresh
    // resolver's would. Nothing is lost by it: a restored take replays its recorded decision fields.
    if (snap.spawn !== undefined) spawnState.restoreState(snap.spawn); else spawnState.reset();
    return true;
  }

  return { resolveLayers, dispose, snapshotState, restoreState };
}

// Snapshot data copy. A plain JSON round-trip silently DROPS keys whose value
// is undefined — but the warm resolver carries such keys (buildPlacements
// stamps `matParams = undefined` on default items), and the checkpoint canon
// counts key presence. Normalizing undefined -> null keeps the key, and the
// canon reads null and undefined identically, so a restored continuation
// hashes exactly like the uninterrupted run.
const deepCopyData = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_k, val) => (val === undefined ? null : val))));

// #1367 — the morph plan's pairings point INTO fromItems by object identity
// (blendItems ranks partners through an identity map over fromItems), and JSON
// cannot carry identity: a round-trip duplicates the shared items, every
// identity lookup misses, and the blend's depth order scrambles. The snapshot
// form therefore stores each pairing's from-item as its INDEX in fromItems
// (and onlyFrom as indices); restore re-links them to the restored copies.
function snapshotMorphEntry(v) {
  if (!v || !v.plan || !Array.isArray(v.fromItems)) return deepCopyData(v);
  const out = deepCopyData(v);
  out.plan = {
    ...out.plan,
    pairs: v.plan.pairs.map((p) => ({ i: v.fromItems.indexOf(p.f), g: p.g, j: p.j })),
    onlyFrom: v.plan.onlyFrom.map((it) => v.fromItems.indexOf(it)),
  };
  return out;
}
function restoreMorphEntry(snap) {
  const v = deepCopyData(snap);
  if (!v || !v.plan || !Array.isArray(v.fromItems)) return v;
  v.plan = {
    ...v.plan,
    pairs: v.plan.pairs.map((p) => ({ f: v.fromItems[p.i], g: p.g, j: p.j })),
    onlyFrom: v.plan.onlyFrom.map((i) => v.fromItems[i]),
  };
  return v;
}

/**
 * #1367 — structural validation of a resolver snapshot (the deep decode validation
 * lives in restoreState's phase 1, which runs every system's own fail-closed
 * restore against a throwaway instance). Returns true only for a snapshot whose
 * shape snapshotState could have produced.
 */
export function checkResolverSnapshot(snap) {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return false;
  if (snap.v !== 1) return false;
  if (!Number.isFinite(snap.W) || !Number.isFinite(snap.H)) return false;
  if (!(snap.worldNoiseSeed === null || Number.isFinite(snap.worldNoiseSeed))) return false;
  if (!snap.driverClock || typeof snap.driverClock !== 'object') return false;
  if (!snap.swarm || typeof snap.swarm !== 'object' || Array.isArray(snap.swarm)) return false;
  for (const rec of Object.values(snap.swarm)) {
    if (!rec || typeof rec !== 'object' || !rec.system || typeof rec.system !== 'object') return false;
    if (!Number.isInteger(rec.system.cap) || rec.system.cap < 0) return false;
  }
  if (!snap.feedDelay || typeof snap.feedDelay !== 'object') return false;
  if (!Array.isArray(snap.feedSlots) || !Array.isArray(snap.feedSlotFree) || !Number.isInteger(snap.feedSlotNext)) return false;
  if (!snap.scent || typeof snap.scent !== 'object') return false;
  if (!snap.dishSession || typeof snap.dishSession !== 'object') return false;
  if (!snap.lastShown || typeof snap.lastShown !== 'object' || Array.isArray(snap.lastShown)) return false;
  if (!snap.morphState || typeof snap.morphState !== 'object' || Array.isArray(snap.morphState)) return false;
  for (const entry of Object.values(snap.morphState)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.fromItems)) return false;
    if (!Number.isFinite(entry.startMs) || !Number.isFinite(entry.dur)) return false;
    const plan = entry.plan;
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.pairs) || !Array.isArray(plan.onlyFrom)) return false;
    if (!Number.isFinite(plan.seed)) return false;
    for (const p of plan.pairs) {
      if (!p || !Number.isInteger(p.i) || p.i < 0 || p.i >= entry.fromItems.length) return false;
      if (typeof p.g !== 'string' || !Number.isInteger(p.j) || p.j < 0) return false;
    }
    for (const i of plan.onlyFrom) {
      if (!Number.isInteger(i) || i < 0 || i >= entry.fromItems.length) return false;
    }
  }
  if (!Array.isArray(snap.modSteer) || !Array.isArray(snap.warpPhase) || !Array.isArray(snap.growthTick)) return false;
  if (!Number.isFinite(snap.densityTickSeen)) return false;
  if (!snap.creatures || typeof snap.creatures !== 'object') return false;
  if (!snap.dishCreatures || typeof snap.dishCreatures !== 'object') return false;
  // #1694 slice 1 — `spawn` is optional (absent in every pre-repipe snapshot); when present it must be an object.
  if (snap.spawn !== undefined && (!snap.spawn || typeof snap.spawn !== 'object' || Array.isArray(snap.spawn))) return false;
  return true;
}
