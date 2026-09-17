/**
 * liveResolve.mjs — browser-safe live layer resolution for the WebGL loop (#224).
 *
 * Mirrors studio/render.mjs's resolveLayers() (which is Node-only via its
 * node:fs import) plus the live app's render-only overlays from CanvasPanel:
 * driftOverlay / perfClampOverride merge on the active layer, the perfTier1
 * mirror shed, and cost-aware asset thinning. Output shape matches
 * resolveLayers() so buildSceneContract() consumes it unchanged.
 *
 * Swarm layers run the real ParticleSystem (same mapping as useSwarmTick);
 * still layers run buildPlacements with a per-layer persistent cache, fed
 * the audio/life-modulated scale+alpha overrides exactly like the old live
 * path did.
 *
 * Node-safe (no DOM): covered by liveResolve.selfcheck.mjs.
 */

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

export function createLiveResolver() {
  // One buildPlacements cache per layer (mirrors useCanvasItems' per-Layer
  // cache — a shared cache would thrash between layers).
  const placementCaches = new Map();
  // Live swarm physics per layer (mirrors useSwarmTick's hook instance).
  const swarmState = new Map();

  function prune(aliveIds) {
    for (const k of [...placementCaches.keys()]) {
      if (!aliveIds.has(k)) placementCaches.delete(k);
    }
    for (const k of [...swarmState.keys()]) {
      if (!aliveIds.has(k)) swarmState.delete(k);
    }
  }

  function cacheFor(layerId) {
    let c = placementCaches.get(layerId);
    if (!c) {
      c = {};
      placementCaches.set(layerId, c);
    }
    return c;
  }

  /**
   * Advance one swarm layer's particle system and map to render items.
   * Mirrors useSwarmTick's update + item mapping (accent/u/scale/alpha,
   * overlap sort, mirror/stamp duplication).
   */
  function swarmItems(layerId, ctx) {
    let st = swarmState.get(layerId);
    if (!st) {
      st = { system: new ParticleSystem(), initKey: null, phraseGen: -1 };
      swarmState.set(layerId, st);
    }
    const initKey = [ctx.mode, ctx.seed, ctx.safeParticles, CANVAS_W, CANVAS_H].join('|');
    if (st.initKey !== initKey) {
      st.system.init(ctx.safeParticles, CANVAS_W, CANVAS_H, ctx.activeAssets, ctx.palette, ctx.seed);
      st.initKey = initKey;
    }
    if (st.phraseGen !== ctx.phraseWrapGen) {
      st.system.resetPhase();
      st.phraseGen = ctx.phraseWrapGen;
    }
    // #107 §4: swarm physics pause under the governor's slowRender, not the
    // app's `running` flag — matches useSwarmTick.
    if (!ctx.slowRender) {
      st.system.update(
        { ...ctx.layoutParams, maxParticles: ctx.caps?.maxParticles },
        ctx.activeAssets, ctx.palette, ctx.seed, Date.now(), ctx.attractor,
      );
    }
    let items = st.system.getItems(ctx.activeAssets).map((item) => {
      const swatches = ctx.palette.swatches || [];
      const accent = swatches[(swatches.indexOf(item.color) + 3) % swatches.length] || swatches[0];
      const u = Number.isFinite(item.u) ? Math.min(1, Math.max(0, item.u)) : 0;
      const uScale = item.role === 'wing' ? 1 + u * 0.18 : 1;
      return {
        ...item,
        assetId: item.asset?.id,
        accent,
        scale: item.scale * ctx.scaleMul * uScale,
        alpha: Math.min(100, item.alpha + ctx.alphaBoost),
        u,
      };
    });
    if (!ctx.layoutParams.overlap) items = [...items].sort((a, b) => a.scale - b.scale);
    const stamp = ctx.layoutParams.mirror || ctx.layoutParams.symmetry === 'stamp';
    if (stamp && ctx.caps.allowMirror) {
      const mirrored = items.map((item) => ({
        ...item,
        x: CANVAS_W - item.x,
        rotation: -item.rotation,
        _mirrored: true,
        key: item.key ? `${item.key}-stamp` : undefined,
      }));
      items = [...items, ...mirrored];
    }
    return items;
  }

  /**
   * Resolve visible layers to placements.
   *
   * @param {object} input — live store fields + animated life values:
   *   layers, activeLayerId, layerSnapshots, seed, paletteId, paletteOverrides,
   *   userPalettes, layoutParams, caGrid, enabledAssets, assetWeightOverrides,
   *   customAssets, quality, driftOverlay, perfClampOverride, perfTier1,
   *   assetThin, slowRender, scaleMul, alphaBoost, effectiveScale,
   *   effectiveAlpha, phraseWrapGen, attractor
   * @returns {Array} resolveLayers-shaped entries
   */
  function resolveLayers(input) {
    const caps = getQualityCaps(input.quality || 'balanced');
    const pool = mergePool(ASSETS, input.customAssets || []);
    const weightOverrides = input.assetWeightOverrides || {};
    const out = [];
    const aliveIds = new Set();

    for (const layer of (input.layers || []).filter((l) => l.visible !== false)) {
      aliveIds.add(layer.id);
      // FX layers hold no content — marker only, like resolveLayers().
      if (isFxLayer(layer)) {
        out.push({ id: layer.id, isFx: true, layer, layerOpacity: layer.layerOpacity ?? 1 });
        continue;
      }
      const isActive = layer.id === input.activeLayerId;
      const snap = input.layerSnapshots?.[layer.id];
      // #107 §2/§5: ambient drift + governor density clamp live in ephemeral
      // overlay slots — merged for render only, active layer only.
      const src = isActive
        ? {
            seed: input.seed,
            paletteId: input.paletteId,
            paletteOverrides: input.paletteOverrides,
            layoutParams: (input.driftOverlay || input.perfClampOverride)
              ? { ...input.layoutParams, ...input.driftOverlay, ...input.perfClampOverride }
              : input.layoutParams,
            caGrid: input.caGrid,
            enabledAssets: input.enabledAssets,
          }
        : (snap || {
            seed: input.seed,
            paletteId: input.paletteId,
            paletteOverrides: input.paletteOverrides,
            layoutParams: input.layoutParams,
            caGrid: input.caGrid,
            enabledAssets: input.enabledAssets,
          });

      const layoutParams = { ...DEFAULT_LAYOUT_PARAMS, ...(src.layoutParams || {}) };
      // #107 §4 tier 1: mirror shed applies to EVERY visible layer.
      if (input.perfTier1 && layoutParams.mirror) layoutParams.mirror = false;

      const palette = resolvePalette(src.paletteId, src.paletteOverrides, input.userPalettes);
      let activeAssets = pool
        .filter((a) => !src.enabledAssets || src.enabledAssets[a.id])
        .map((a) => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a));
      // Showrunner cut 4: cost-aware thinning, render-only.
      if (input.assetThin && activeAssets.length > 1) {
        const ranked = [...activeAssets].sort((a, b) => getAssetCost(b) - getAssetCost(a));
        const drop = Math.max(1, Math.ceil(ranked.length * 0.25));
        const dropped = new Set(ranked.slice(0, drop).map((a) => a.id));
        activeAssets = activeAssets.filter((a) => !dropped.has(a.id));
      }

      const safeCount = clampCount(layoutParams.count, layoutParams.mirror, caps);
      const safeParticles = Math.min(layoutParams.particleCount || 150, caps.maxParticles);
      const seed = (src.seed ?? 0) >>> 0;

      let items;
      if (isLiveSwarmMode(layoutParams.mode)) {
        items = swarmItems(layer.id, {
          mode: layoutParams.mode, safeParticles, activeAssets, palette, seed,
          layoutParams, caps, scaleMul: input.scaleMul ?? 1, alphaBoost: input.alphaBoost ?? 0,
          slowRender: !!input.slowRender, attractor: input.attractor ?? null,
          phraseWrapGen: input.phraseWrapGen || 0,
        });
      } else {
        items = buildPlacements({
          layoutParams,
          seed,
          activeAssets,
          palette,
          caGrid: src.caGrid ?? null,
          caps,
          canvasW: CANVAS_W,
          canvasH: CANVAS_H,
          scale: input.effectiveScale,
          alpha: input.effectiveAlpha,
          cache: cacheFor(layer.id),
        }).items;
      }
      // The GL backend draws instanced quads per asset id — items without
      // one (a poisoned placement) are skipped, mirroring Layer.jsx's filter.
      items = (items || []).filter((it) => it && it.assetId);

      out.push({
        id: layer.id,
        layoutParams,
        palette,
        items,
        safeCount,
        layerBlendMode: layer.layerBlendMode || 'normal',
        layerOpacity: layer.layerOpacity ?? 1,
        layer,
      });
    }
    prune(aliveIds);
    return out;
  }

  function dispose() {
    placementCaches.clear();
    swarmState.clear();
  }

  return { resolveLayers, dispose };
}
