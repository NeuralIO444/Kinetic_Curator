/** liveResolve — FEED delay-1 + FIELD same-frame */
import { buildPlacements, clampCount } from '../engine/buildPlacements.js';
import { ParticleSystem } from '../engine/particles.js';
import { isLiveSwarmMode, DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { resolvePalette } from '../data/palettes.js';
import { getQualityCaps } from '../data/quality.js';
import { getAssetCost } from '../assets/cost.js';
import { isFxLayer } from '../fx/fxFilters.js';
import { mergePool } from '../assets/overlay.js';
import { ASSETS } from '../data/assets/index.js';
import { CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { createFeedLive } from '../engine/kernel/tracks/feedLive.js';
import { applyField, applyMod, motionMetrics, MAX_TRACKS } from '../engine/kernel/tracks/trackGraph.js';
// #507 — inline PATCH diagnostic: record-only bulletin calls (no logic change).
import { recordPatchSample } from '../engine/kernel/tracks/patchDiag.mjs';

import { createNoise } from '../engine/noise.js';
import { createScentField } from '../engine/kernel/field/scent.js';
import { blendItems, planMorph, matchItems } from '../engine/kernel/itemMorph.mjs';
import { morphEase } from './paletteMix.mjs';

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

function clampHop(it, q) {
  if (!q) return it;
  let dx = q.x * CANVAS_W - it.x;
  let dy = q.y * CANVAS_H - it.y;
  const m = Math.hypot(dx, dy);
  if (m > HOP_MAX_PX) { dx *= HOP_MAX_PX / m; dy *= HOP_MAX_PX / m; }
  return { ...it, x: it.x + dx, y: it.y + dy };
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
 */
function applyLifeDrift(lp, locked, loopTimeMs) {
  const depth = lp.lifeDrift ?? 0.35;
  if (depth <= 0.01) return;
  const t = loopTimeMs * 0.0005;
  if (!locked.jitter) {
    lp.jitter = Math.max(0, Math.min(200, Math.round(lp.jitter + Math.sin(t * 0.7) * 12 * depth)));
  }
  if (!locked.displacement) {
    lp.displacement = Math.max(0, Math.min(250, Math.round(lp.displacement + Math.sin(t * 0.45 + 1.2) * 18 * depth)));
  }
  if (!locked.noiseSpeed) {
    lp.noiseSpeed = Math.max(0.1, Math.min(3, +(lp.noiseSpeed + Math.sin(t * 0.3 + 0.5) * 0.25 * depth).toFixed(2)));
  }
}

export function createLiveResolver() {
  const placementCaches = new Map();
  const swarmState = new Map();
  const feedLive = createFeedLive(CANVAS_W, CANVAS_H);
  let worldNoise = null;
  let worldNoiseSeed = null;

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
  // #432 — per-layer displacement warp phase, accumulated incrementally
  // (integral of noiseSpeed over each frame's dt) rather than derived as
  // speed × absolute session time. See the warp block below for why.
  const warpPhase = new Map(); // layerId -> { base, lastMs }
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
    for (const k of [...swarmState.keys()]) if (!aliveIds.has(k)) swarmState.delete(k);
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
    for (const k of [...feedSlots.keys()]) {
      if (!aliveIds.has(k)) { feedSlotFree.push(feedSlots.get(k)); feedSlots.delete(k); }
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
    const initKey = [ctx.mode, ctx.seed, CANVAS_W, CANVAS_H,
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
      st.system.init(Math.ceil(ctx.safeParticles), CANVAS_W, CANVAS_H, ctx.activeAssets, ctx.palette, ctx.seed, ctx.seedOffsets, { graze: ctx.layoutParams.graze || 0 });
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
    const stamp = ctx.layoutParams.mirror || ctx.layoutParams.symmetry === 'stamp';
    if (stamp && ctx.caps.allowMirror) {
      items = [...items, ...items.map((item) => ({ ...item, x: CANVAS_W - item.x, rotation: -item.rotation, _mirrored: true, key: item.key ? `${item.key}-stamp` : undefined, seedOffset: item.seedOffset }))];
    }
    return items;
  }

  function resolveLayers(input) {
    const caps = getQualityCaps(input.quality || 'balanced');
    const pool = mergePool(ASSETS, input.customAssets || []);
    if (overlayRevSrc !== input.customAssets) {
      overlayRevSrc = input.customAssets;
      overlayRevs = new Map((input.customAssets || [])
        .filter((a) => a && typeof a === 'object')
        .map((a) => [String(a.id), hashStr(String(a.svg || ''))]));
    }
    const weightOverrides = input.assetWeightOverrides || {};
    const out = [];
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
      }
    }

    for (const layer of (input.layers || []).filter((l) => l && typeof l === 'object' && l.visible !== false)) {
      aliveIds.add(layer.id);
      if (isFxLayer(layer)) {
        out.push({ id: layer.id, isFx: true, layer, layerOpacity: layer.layerOpacity ?? 1 });
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
      if (input.perfTier1 && layoutParams.mirror) layoutParams.mirror = false;
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
      let activeAssets = pool
        .filter((a) => !src.enabledAssets || src.enabledAssets[a.id])
        .map((a) => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a));
      // #564 — identity of the pool this layer actually draws: which assets,
      // at what weight, with what content. Computed BEFORE assetThin on
      // purpose: a governor shed is a different class of change (#564's
      // out-of-scope list) and must not fire a transition.
      const assetSig = activeAssets
        .map((a) => `${a.id}:${a.weight || ''}:${overlayRevs.get(a.id) || 0}`)
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
          // Spine F (#392): shared world noise + domain offset from seedOffsets.noise
          noise: worldNoise,
          noiseDomainOffset: (seedOffsets?.noise || 0) * 100,
        });
      } else {
        items = buildPlacements({
          layoutParams, seed, seedOffsets, activeAssets, palette,
          caGrid: src.caGrid ?? null, caps, canvasW: CANVAS_W, canvasH: CANVAS_H,
          scale: input.effectiveScale, alpha: input.effectiveAlpha, cache: cacheFor(layer.id),
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
            wp.base += dSec * (layoutParams.noiseSpeed ?? 0.5);
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
              const ntLive = nt0 + wp.base * bandMult;
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
        }
      }
      items = (items || []).filter((it) => it && it.assetId);
      // Item-morph trigger signature: the same fields that used to drive
      // the pixel crossfade (mode/behave/palette/asset-set), scoped per
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
      // changing. paletteId alone still catches a genuine discrete palette
      // change; the continuously-lerped override values were never meant to
      // be a transition trigger in their own right — that's what the live
      // tint shader already animates smoothly, independent of item-morph.
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
      // spend a MIX-long swap wave on top of the load that caused it. !! so an
      // unset mirror and an explicit false hash the same.
      const morphSig = [
        layoutParams.mode, layoutParams.behave, src.paletteId, seed, assetSig,
        !!(src.layoutParams?.mirror), src.layoutParams?.symmetry ?? 'none',
      ].join('|');
      out.push({ id: layer.id, layoutParams, palette, items, safeCount, morphSig, morphSeed: seed, layerBlendMode: layer.layerBlendMode || 'normal', layerOpacity: layer.layerOpacity ?? 1, layer });
    }
    const content = out.filter((e) => !e.isFx);
    const toNorm = (it) => ({ x: (Number(it.x) || 0) / CANVAS_W, y: (Number(it.y) || 0) / CANVAS_H });
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
      if (patch.mode === 'field') {
        const src = content.find((c) => c.id === patch.to);
        const srcPts = (src?.items || []).map(toNorm);
        const tgt = (e.items || []).map(toNorm);
        const pulled = applyField(tgt, srcPts, { mode: 'field', from: slotFor(patch.to), to: slotFor(e.id), strength: patchStrength(patch) });
        // #507 — mean presented hop (post-clamp px); the diagnostic line.
        let pullSumPx = 0;
        const fieldN = (e.items || []).length;
        e.items = (e.items || []).map((it, k) => {
          const next = clampHop(it, pulled[k]);
          pullSumPx += Math.hypot(next.x - it.x, next.y - it.y);
          return next;
        });
        recordPatchSample(e.id, { mode: 'field', strength: patchStrength(patch), pullPx: pullSumPx / Math.max(1, fieldN) });
      } else if (patch.mode === 'feed') {
        const pts = (e.items || []).map(toNorm);
        const amt = patchStrength(patch) * 0.05;
        const pulled = feedLive.applyTo(pts, { mode: 'feed', from: slotFor(patch.to), to: slotFor(e.id), strength: amt });
        // #507 — same accumulation shape as FIELD (mean post-clamp hop px).
        let feedSumPx = 0;
        const feedN = (e.items || []).length;
        e.items = (e.items || []).map((it, k) => {
          const next = clampHop(it, pulled[k]);
          feedSumPx += Math.hypot(next.x - it.x, next.y - it.y);
          return next;
        });
        recordPatchSample(e.id, { mode: 'feed', strength: patchStrength(patch), pullPx: feedSumPx / Math.max(1, feedN) });
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
    content.forEach((e) => feedLive.pushSource(slotFor(e.id), (e.items || []).map(toNorm)));
    feedLive.commit();
    // #509 phase 2 — step the shared scent ONCE per tick, after every
    // layer's deposits landed. Skipped under slowRender (no updates ran, so
    // no deposits — stepping would decay a frozen field, same honesty as
    // the paused-tick rollback).
    if (!input.slowRender) sharedScent.step();

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
        morphState.set(e.id, {
          fromItems: prevShown.items,
          startMs: nowMs,
          dur: mixSeconds,
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
    return out;
  }

  function dispose() {
    placementCaches.clear();
    swarmState.clear();
    lastShown.clear();
    morphState.clear();
    warpPhase.clear();
    feedLive.reset();
    worldNoise = null;
    worldNoiseSeed = null;
  }

  return { resolveLayers, dispose };
}
