// Pure placement + asset + color + mirror pipeline.
// Shared by live preview (useCanvasItems) and renderFinal (#24 / #32).
// Kernel K0: asset + color channels index-stable (#58).
//
// Kernel v2 (#108) step 4: optional staged-eval cache. Pass `cache` (an
// object the CALLER owns and keeps across calls — useCanvasItems holds one
// per Layer in a ref) and stages A/B (geometry + displacement), D (asset
// bind) and E (colour) are skipped whenever their inputs are unchanged,
// leaving only stage C (scale/rotate/alpha arithmetic) and the item build.
//
// This matters because liveLoop ticks lifeT every rAF frame, so
// effectiveScale/effectiveAlpha are fresh arrays on every frame while the
// geometry params sit still — the full pipeline was re-deriving identical
// positions, asset picks and colours 60x a second.
//
// Omit `cache` and nothing is retained: the function computes everything,
// exactly as before. Selfchecks and studio/render.mjs take that path.

import { computeGeometrySoA, applyAttributes, geometrySignature } from './placement.js';
import { makeHeroInfo } from './kernel/field/attractors.js';
import { applyKinemeDrivers, applyRhythm } from './kineme.js';
import { assignColor, resolveStrategy, applyLean } from './kernel/color/index.js';
import { fillDishPoints } from './kernel/dish.js';
import { applyGroundNudge } from './groundNudge.js'; // #1183 tile-edge nudge
import { applyGroundSnap } from './groundSnap.js'; // #1183 palette snap
import { mkRng } from './prng.js';
import { getPreset } from '../data/presets.js';
import { getQualityCaps } from '../data/quality.js';
import { mirrorMultiplier } from '../data/layout-modes.js';
import { getBiologyPolicy } from '../biology/policy.js';
import { fadeForAge } from '../biology/lifecycle.js';
import { sortGlassInstances } from './glassSort.mjs';
import { sanitizeFieldMap, applyFieldMap } from './fieldMap.mjs'; // #1199 — field→channel MAP
import {
  pickWeightedIndexStable,
} from './kernel/rng.js';

/** Authored per-asset weight → selection frequency. */
export const SELECTION_WEIGHT = { heavy: 4, medium: 2, light: 1 };

/**
 * Seeded weighted pick from an asset list (sequential stream — tests / legacy).
 * Prefer pickWeightedIndexStable for pipeline.
 */
export function pickWeighted(assets, weights, totalWeight, rng) {
  let r = rng() * totalWeight;
  for (let i = 0; i < assets.length; i++) {
    r -= weights[i];
    if (r <= 0) return assets[i];
  }
  return assets[assets.length - 1];
}

/**
 * Element-wise signature compare. Uses Object.is, so NaN matches NaN and
 * objects (caGrid, activeAssets, palette) compare by identity — which is
 * what we want: the store replaces those references on edit rather than
 * mutating them, and a deep compare per frame would cost more than the
 * recompute it saves.
 *
 * ponytail: identity compare means a caller that mutates activeAssets or
 * palette in place gets a stale cache. Upgrade path is a version counter on
 * those slices, not a deep compare.
 */
function sameSignature(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * #269 — absolute placement ceiling, defense-in-depth. clampCount trusted the
 * caller's count via caps alone, so a hostile/erroneous count of 1e7
 * allocated until the V8 heap died — uncatchable. The richest tier (FINAL)
 * tops out at maxCount 800; the mirror multiplier (1/2/2/4) is priced into
 * clampCount below, so 4096 leaves real headroom while no raw caller can
 * OOM the process. Clamp, don't throw; valid inputs are unaffected.
 */
export const MAX_ABSOLUTE_COUNT = 4096;

export function clampCount(count, mirror, caps) {
  // #1202 — the cap scales with the reflection multiplier so the ITEM budget
  // stays constant: maxCountMirrored is sized for 2×, so 4× (XY) halves it.
  const mult = mirrorMultiplier(mirror);
  const base = mult > 1 ? (caps.maxCountMirrored ?? caps.maxCount ?? 420) : (caps.maxCount ?? 420);
  const maxForMirror = mult > 2 ? Math.floor((base * 2) / mult) : base;
  return Math.min(MAX_ABSOLUTE_COUNT, Math.max(1, Number(count) || 1), maxForMirror);
}

/**
 * #1202 — reflect items across canvas axes. Pure: returns a new array with
 * the mirrored copies appended (the source list is never mutated).
 *  'x'  → 2×: (x → W−x, rotation negated, _mirrored)
 *  'y'  → 2×: (y → H−y, rotation negated, _mirrored)
 *  'xy' → 4×: x-mirror + y-mirror + the 180° turn (x → W−x, y → H−y,
 *           rotation unchanged — two reflections restore chirality)
 * 'off' (or anything unrecognized) → the list unchanged.
 */
export function mirrorItems(items, mirrorState, W, H) {
  // Legacy boolean true reads as X (the old X-only mirror).
  const st = mirrorState === true ? 'x' : mirrorState;
  if (st !== 'x' && st !== 'y' && st !== 'xy') return items;
  const out = [...items];
  const mirrored = (item, fx, fy) => ({
    ...item,
    x: fx ? W - item.x : item.x,
    y: fy ? H - item.y : item.y,
    // A single reflection flips chirality (negate rotation, flip scaleX via
    // _mirrored); two reflections are a 180° turn — chirality restored.
    rotation: fx !== fy ? -item.rotation : item.rotation,
    ...(fx !== fy ? { _mirrored: true } : null),
    // #1410 — a reflected copy's deform axis reflects with it, like its
    // rotation. Only live swarm items carry the fields; placement items
    // never do, so their mirrored copies are exactly what they were.
    ...(item.deformAmt > 0 ? {
      deformAxisX: fx ? -item.deformAxisX : item.deformAxisX,
      deformAxisY: fy ? -item.deformAxisY : item.deformAxisY,
    } : null),
    key: item.key ? `${item.key}-m${fx ? 'x' : ''}${fy ? 'y' : ''}` : undefined,
  });
  if (st === 'x' || st === 'xy') {
    for (const item of items) out.push(mirrored(item, true, false));
  }
  if (st === 'y' || st === 'xy') {
    for (const item of items) out.push(mirrored(item, false, true));
  }
  if (st === 'xy') {
    for (const item of items) out.push(mirrored(item, true, true));
  }
  return out;
}

/**
 * Build fully attributed items for the canvas (or offline render).
 */
export function buildPlacements({
  layoutParams,
  seed,
  seedOffsets = null,
  activeAssets,
  palette,
  caGrid = null,
  caps: capsIn,
  canvasW,
  canvasH,
  scale: scaleOverride,
  scaleY: scaleYOverride, // #1202 — breath-modulated Y range (array) or undefined
  alpha: alphaOverride,
  cache,
  // #720 — DLA / Eden growth. growthTick advances the aggregate one step
  // per presented frame (the live resolver owns the counter, per layer);
  // audioEnergy (0..1, null when the Stimuli bus is silent) is the default
  // audio driver for the cells-per-tick rate. Both ride into geoParams like
  // caGrid — geometry inputs, not layout params.
  growthTick = 0,
  audioEnergy = null,
  kineme = null,
  // #1245 — layer id for the unknown-sampler fallback diagnostic; rides into
  // geoParams below and down to getSampler. Optional; null reads as '?'.
  layerId = null,
  // #1183 slice 1 — the dish. The orchestrator fills it once per placement
  // call (never per frame); `lean` (0..1) mixes mark colors toward
  // dish.ground. Both are ephemeral: no dish/lean → today's path exactly.
  dish = null,
  lean = 0,
  // #1183 tile-edge nudge (0..1): marks ease off the edges of the tile beneath them (dish.groundCell). 0 = off.
  nudge = 0,
  // #1183 palette snap (0..1): the SHARE of marks that take the exact colours of the tile beneath them
  // (dish.groundRoles). Snapped marks are not leaned. 0 = off.
  snap = 0,
  // Kineme living-motion drivers (slice 2). Ephemeral per-frame input —
  // NEVER in geometrySignature (same deal as audioEnergy): a living canvas
  // must not bust the geometry cache. kineme = {
  //   driverSec, boilStep, seed,
  //   amounts: { breath, drift, pulse, brushWobble, paletteBreath },
  //   canvasW, canvasH, shedTier,
  //   rhythm: { type: 'perlin'|'sine' } | null }  // #1198 — the rhythm layer
  // #1151 — buildPlacements attaches palette ({ swatches }) and colorArrays
  // ({ colors, accents }) to the ctx before the applier runs.
}) {
  const caps = capsIn || getQualityCaps('balanced');
  const preset = getPreset(layoutParams.composition);

  if (!activeAssets || activeAssets.length === 0) {
    return { preset, items: [], safeCount: 0 };
  }

  // #1202 — mirror is a 4-state enum now ('off'|'x'|'y'|'xy'); a legacy
  // boolean still reads (true → 'x') via mirrorMultiplier.
  const mirrorState = typeof layoutParams.mirror === 'boolean'
    ? (layoutParams.mirror ? 'x' : 'off')
    : (layoutParams.mirror ?? 'off');
  const safeCount = clampCount(layoutParams.count, mirrorState, caps);
  const countInt = Math.ceil(safeCount);
  const countFrac = safeCount - Math.floor(safeCount);
  // #1202 — resolve X/Y ranges. Breath overrides (arrays) win per-axis;
  // otherwise the authored {x, y} pair (a legacy array reads as linked).
  const sc = layoutParams.scale;
  const xBase = (Array.isArray(sc) ? sc : sc?.x) ?? [0.4, 1.6];
  const xRange = scaleOverride ?? xBase;
  const yRange = scaleYOverride ?? (Array.isArray(sc) ? sc : sc?.y) ?? xRange;
  const scale = { x: xRange, y: yRange };
  const alpha = alphaOverride ?? layoutParams.alpha;

  const geoParams = {
    mode: layoutParams.mode,
    count: countInt,
    layerId, // #1245 — unknown-sampler diagnostic key; not in geometrySignature
    seed,
    seedOffsets,
    jitter: layoutParams.jitter,
    density: layoutParams.density,
    zTiers: layoutParams.zTiers,
    bleed: layoutParams.bleed,
    canvasW,
    canvasH,
    caGrid: layoutParams.mode === 'ca' ? caGrid : null,
    phylloDivergence: layoutParams.phylloDivergence,
    lsysDepth: layoutParams.lsysDepth,
    lsysAngle: layoutParams.lsysAngle,
    // #720 — DLA / Eden growth. Rate/branch knobs come from layoutParams
    // (curator-driven); the tick and audio drive are per-frame resolver
    // inputs, like caGrid.
    growthRate: layoutParams.growthRate,
    growthBranch: layoutParams.growthBranch,
    growthTick,
    audioEnergy,
    // Brush line + slice 2 (the crooked) — forwarded like growth/lsys.
    // Until #1516 the document's stored values never reached
    // computeGeometrySoA, which ran its hardcoded defaults (24 / 0.5 /
    // 0.004 / 6 / 0 / 0.5 — the same values DEFAULT_LAYOUT_PARAMS
    // carries, so forwarding the defaults is bit-identical).
    // geometrySignature already lists all six, so the staged-eval
    // cache stays honest: a brush edit busts the geometry stage.
    brushSize: layoutParams.brushSize,
    brushSpacing: layoutParams.brushSpacing,
    fieldScale: layoutParams.fieldScale,
    trailCount: layoutParams.trailCount,
    wobbleAmp: layoutParams.wobbleAmp,
    wobbleFreq: layoutParams.wobbleFreq,
    displacement: layoutParams.displacement,
    noiseFreq: layoutParams.noiseFreq,
    noiseSpeed: layoutParams.noiseSpeed,
    // #1195 — circle packing packs for the BASE scale slider range, never the audio-modulated override (that would
    // re-pack every frame). Other modes: null, not in their signature.
    packScale: layoutParams.mode === 'circlepack' ? [xBase[0], xBase[1]] : null,
    // #1200 — attractor density pooling. attractorCount/attractorRadius ride
    // stage A (density pooling) and join geometrySignature. Defaults off:
    // no attractors is byte-identical to current behavior. UI homes are
    // #1204's shift layer (attractors = shift of WILD) — that panel work
    // lands separately.
    attractorCount: layoutParams.attractorCount ?? 0,
    attractorRadius: layoutParams.attractorRadius,
  };

  const strategy = resolveStrategy(layoutParams, preset);

  // ── Stage A+B: geometry. Reused whenever nothing it reads has changed.
  const geoSig = geometrySignature(geoParams);
  const geoHit = cache && sameSignature(cache.geoSig, geoSig);
  // Reuse the buffers even on a miss — same shape, one fewer allocation.
  const soa = geoHit ? cache.soa : computeGeometrySoA(geoParams, cache?.soa);

  // ── Stage C: attributes. Always runs; this is what the audio/life
  // modulation actually moves, and it is pure arithmetic over cached units.
  // #1200 — heroes ride stage C (HEROES is #1204's shift function of a
  // MOTION control; the panel work lands separately). makeHeroInfo is the
  // off-state no-op: 0 heroes -> null -> applyAttributes untouched.
  const heroInfo = makeHeroInfo(seed, countInt, layoutParams.heroes ?? 0, seedOffsets);
  applyAttributes(soa, { scale, rotate: layoutParams.rotate, alpha, heroes: heroInfo });
  // Spine E: float count fades the spawning/dying point's alpha
  if (countFrac > 0.001 && soa.n > 0) {
    soa.alpha[soa.n - 1] *= countFrac;
  }
  // #793 — biology: old growth fades. The sampler's `t` is the cell's age01;
  // the policy maps it through GrowthHooks.fadeWeight into the per-item alpha
  // channel stage C already owns. Growth modes bust the geometry cache every
  // frame (growthTick is in the signature), so this recomputes honestly and
  // the render path is untouched. Young cells are always being born
  // (cellsPerTick floors at 1), so the form never goes fully dark.
  if ((layoutParams.mode === 'dla' || layoutParams.mode === 'eden') && soa.t) {
    const fade = getBiologyPolicy().growth;
    for (let k = 0; k < soa.n; k++) {
      soa.alpha[k] *= fadeForAge(soa.t[k], fade);
    }
  }

  // ── Stage D+E: asset bind + colour. Both are functions of (seed, index)
  // plus the asset pool / palette / strategy — never of the ranges — so they
  // ride on the geometry cache plus their own inputs.
  // geoHit is required: the bind arrays are indexed by slot, and a geometry
  // change can alter both n and which source index sits in each slot.
  // The sub-seed offsets ride as scalars (#305): a mutate changes a number,
  // never object identity, so Object.is comparison stays sound.
  const so = seedOffsets || {};
  const bindSig = [activeAssets, palette, strategy, seed,
    so.spatial || 0, so.color || 0, so.asset || 0, so.noise || 0];
  const bindHit = cache && geoHit && sameSignature(cache.bindSig, bindSig);

  let assetIds;
  let colors;
  let accents;
  let keys;
  let palSlots;
  if (bindHit) {
    ({ assetIds, colors, accents, keys } = cache);
  } else {
    // #733 — a shape-mixer weight (already normalized) replaces the asset's
    // own heavy/medium/light when the resolver set one.
    const weights = activeAssets.map((a) => (a.mixWeight > 0 ? a.mixWeight : SELECTION_WEIGHT[a.weight] || 1));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    assetIds = new Array(soa.n);
    colors = new Array(soa.n);
    accents = new Array(soa.n);
    keys = new Array(soa.n);
    palSlots = new Array(soa.n);
    for (let k = 0; k < soa.n; k++) {
      const index = soa.index[k];
      const asset = pickWeightedIndexStable(
        activeAssets, weights, totalWeight, seed, index, seedOffsets,
      );
      // K5 (#64): colour comes from the kernel's colour channel only.
      const { color, accent, slot } = assignColor(
        { seed, index, t: soa.t[k], seedOffsets }, palette, strategy,
      );
      assetIds[k] = asset.id;
      colors[k] = color;
      accents[k] = accent;
      keys[k] = `p${index}-${asset.id}`;
      palSlots[k] = slot; // #1151 — base palette slot; the breath applier shifts around it
    }
    soa.palSlot = palSlots;
  }

  if (cache) {
    cache.geoSig = geoSig;
    cache.soa = soa;
    cache.bindSig = bindSig;
    cache.assetIds = assetIds;
    cache.colors = colors;
    cache.accents = accents;
    cache.keys = keys;
  }

  // #1183 slice 1 — the dish + tile-color lean. The orchestrator fills the
  // dish once per placement call (never per frame): every mark lands as an
  // addressable entity { id, family: 'mark', source: assetId }. Ephemeral
  // like kineme: the bind cache keeps the BASE colors, and the lean applies
  // to a fresh array, so a lean change can never serve stale cache.
  // lean = 0 (or no dish.ground) is byte-identical to the old path —
  // applyLean returns the input untouched. The dish holds the unmirrored
  // placement set; mirror is a render-time reflection applied below.
  if (dish) {
    const entities = new Array(soa.n);
    for (let k = 0; k < soa.n; k++) {
      entities[k] = {
        id: keys[k],
        family: 'mark',
        source: assetIds[k],
        x: soa.x[k],
        y: soa.y[k],
        index: soa.index[k],
        t: soa.t[k],
      };
    }
    fillDishPoints(dish, 'marks', entities);
    // #1183 palette snap — before the lean, and the snapped marks skip it (snap wins). Fresh arrays, like the
    // lean: the bind cache keeps the base colours. Re-read per frame, so a drifting ground re-colours the marks.
    let snapped = null;
    if (dish.groundRoles && snap > 0) {
      const sn = applyGroundSnap({ soa, colors, accents, rolesAt: dish.groundRoles, share: snap, seed, seedOffsets });
      if (sn) { colors = sn.colors; accents = sn.accents; snapped = sn.snapped; }
    }
    if (dish.ground && lean > 0) {
      colors = colors.map((c, k) => (snapped && snapped[k] ? c : applyLean(c, dish.ground(soa.x[k], soa.y[k]), lean)));
    }
  }

  // Kineme living-motion drivers (slice 2): per-instance scale/position deltas folded into the stage-C channels.
  // Ephemeral: the geometry and bind caches are untouched, and amount 0 is bit-identical. They run AFTER the asset
  // bind (#1128) because the artist can pin an asset still, and which asset a mark is only known once it is bound
  // (neither bind nor colour reads x, y or scale). The applier returns an undo that puts the cached x/y back.
  let stillMarks = null;
  if (kineme && kineme.stillAssets && kineme.stillAssets.size) {
    stillMarks = new Uint8Array(soa.n);
    for (let k = 0; k < soa.n; k++) if (kineme.stillAssets.has(assetIds[k])) stillMarks[k] = 1;
  }
  if (kineme) {
    // #1151 — palette-breath resources: the resolved palette for the wrap
    // modulus and the bind-cache color arrays the applier shifts in place
    // (its undo restores base values, so the cache stays clean).
    kineme.palette = palette;
    kineme.colorArrays = { colors, accents };
  }
  // #1198 — the rhythm layer runs first: it IS the placement layer (a static
  // field over the placed positions), and the time drivers compose on top.
  // Each applier undoes its own cached-x/y writes; undos run in reverse of
  // application below.
  const undoRhythm = kineme ? applyRhythm(soa, kineme, stillMarks) : null;
  const undoKineme = kineme ? applyKinemeDrivers(soa, kineme, stillMarks) : null;
  // #1183 tile-edge nudge — after the motion drivers, so the PRESENTED position feels the (possibly drifting)
  // tile it is over. Per frame, undone below like the drivers; nudge 0 or no ground never calls it.
  const undoNudge = dish && dish.groundCell && nudge > 0 ? applyGroundNudge(soa, dish.groundCell, nudge, stillMarks) : null;

  // Items: rebuilt fresh on any geometry/bind miss, or when overlap is off
  // (below sorts the array, see the pool guard for why that must stay
  // unpooled). On a full hit with overlap on, x/y/index/t/zTier/assetId/
  // color/accent/key are all still valid from the geo+bind cache — only
  // scale/rotation/alpha (stage C) can have moved — so the pooled objects
  // from last call are mutated in place instead of reallocated. That does
  // alias last frame's returned items (the old caution below no longer
  // fully holds for this path), but nothing downstream holds a reference
  // across frames — useCanvasItems' useMemo hands out a fresh result each
  // call and Layer only ever reads the latest one.
  const poolHit = cache && geoHit && bindHit && layoutParams.overlap
    && cache.itemPool && cache.itemPool.length === soa.n;

  let mapped;
  if (poolHit) {
    mapped = cache.itemPool;
    for (let k = 0; k < soa.n; k++) {
      const item = mapped[k];
      item.x = soa.x[k];
      item.y = soa.y[k];
      item.scale = soa.scale[k];
      item.scaleY = soa.scaleY[k]; // #1202 — equals scale when X/Y linked
      item.rotation = soa.rotation[k];
      item.alpha = soa.alpha[k];
    }
  } else {
    mapped = new Array(soa.n);
    for (let k = 0; k < soa.n; k++) {
      mapped[k] = {
        x: soa.x[k],
        y: soa.y[k],
        scale: soa.scale[k],
        scaleY: soa.scaleY[k], // #1202
        rotation: soa.rotation[k],
        alpha: soa.alpha[k],
        index: soa.index[k],
        t: soa.t[k],
        zTier: soa.zTier[k],
        assetId: assetIds[k],
        color: colors[k],
        accent: accents[k],
        key: keys[k],
      };
    }
  }

  // #1199 — field→channel MAP (MATH stratum): sample the field at each
  // mark's position and remap the selected visual channel. Runs on the
  // built items, before the overlap sort, so the small-first order sees
  // final scales. The hard gate inside applyFieldMap makes the all-off
  // config a strict no-op (no field built, no math). On the pool path the
  // colors are refreshed from the bind arrays first: the saturation
  // channel must always start from the placed color, never last frame's
  // remapped one (the same no-accumulation rule palette-breath's undo
  // enforces on the bind cache).
  if (poolHit) {
    for (let k = 0; k < soa.n; k++) {
      const item = mapped[k];
      item.color = colors[k];
      item.accent = accents[k];
    }
  }
  applyFieldMap(mapped, sanitizeFieldMap({
    field: layoutParams.fieldMapField,
    channel: layoutParams.fieldMapChannel,
    amount: layoutParams.fieldMapAmount,
    curve: layoutParams.fieldMapCurve,
  }), { seed, canvasW, canvasH });

  if (!layoutParams.overlap) {
    // `mapped` is already a fresh array we own — no defensive copy needed.
    // Never stash a sorted array into cache.itemPool: the pool is indexed by
    // soa slot (item[k] <-> soa.x[k]/scale[k]/...), and sorting breaks that
    // correspondence — a later pool-hit would mutate the wrong item's
    // scale/rotation/alpha. That aliasing bug was caught in review; the
    // overlap-only guard above is what prevents it.
    mapped.sort((a, b) => a.scale - b.scale);
  } else if (cache) {
    cache.itemPool = mapped;
  }

  // #1202 — 4-state reflection via the shared helper (off/x/y/xy).
  if (caps.allowMirror) {
    mapped = mirrorItems(mapped, mirrorState, canvasW, canvasH);
  }

  // #1129 PR1 — translucent sort. Flag glass-type instances from the voice
  // param, then order the glass set back-to-front by z-tier so overlapping
  // alpha layers composite in depth order under the premultiplied single
  // pass (gl.ONE, gl.ONE_MINUS_SRC_ALPHA). sortGlassInstances returns a new
  // array and moves glass items only relative to each other: non-glass
  // order (the RULES small-first sort above, #565's z-fight fix) is
  // untouched, and the pool keeps soa-slot order because the sorted array is
  // never stashed in cache.itemPool (same guard as the overlap sort above).
  const glassOn = !!layoutParams.glass;
  for (const it of mapped) it.glass = glassOn;
  if (glassOn) mapped = sortGlassInstances(mapped);

  if (undoNudge) undoNudge(); // #1183 — reverse of application
  if (undoKineme) undoKineme();
  if (undoRhythm) undoRhythm(); // #1198 — reverse of application
  return { preset, items: mapped, safeCount };
}

// Re-export for tests that still use sequential streams
export { mkRng };
