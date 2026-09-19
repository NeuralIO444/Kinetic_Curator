/** liveResolve — FEED hop replayed on current main */
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

const FEED_MAX_PX = 4;

export function createLiveResolver() {
  const placementCaches = new Map();
  const swarmState = new Map();
  const feedLive = createFeedLive(CANVAS_W, CANVAS_H);

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
    if (!c) { c = {}; placementCaches.set(layerId, c); }
    return c;
  }

  function swarmItems(layerId, ctx) {
    let st = swarmState.get(layerId);
    if (!st) {
      st = { system: new ParticleSystem(), initKey: null, phraseGen: -1 };
      swarmState.set(layerId, st);
    }
    const initKey = [ctx.mode, ctx.seed, ctx.safeParticles, CANVAS_W, CANVAS_H,
      ctx.seedOffsets?.spatial || 0, ctx.seedOffsets?.color || 0,
      ctx.seedOffsets?.asset || 0, ctx.seedOffsets?.noise || 0].join('|');
    if (st.initKey !== initKey) {
      st.system.init(ctx.safeParticles, CANVAS_W, CANVAS_H, ctx.activeAssets, ctx.palette, ctx.seed, ctx.seedOffsets);
      st.initKey = initKey;
    }
    if (st.phraseGen !== ctx.phraseWrapGen) {
      st.system.resetPhase();
      st.phraseGen = ctx.phraseWrapGen;
    }
    if (!ctx.slowRender) {
      st.system.update(
        { ...ctx.layoutParams, maxParticles: ctx.caps?.maxParticles },
        ctx.activeAssets, ctx.palette, ctx.seed, Date.now(), ctx.attractor, ctx.seedOffsets,
      );
    }
    let items = st.system.getItems(ctx.activeAssets).map((item) => {
      const swatches = ctx.palette.swatches || [];
      const accent = swatches[(swatches.indexOf(item.color) + 3) % swatches.length] || swatches[0];
      const u = Number.isFinite(item.u) ? Math.min(1, Math.max(0, item.u)) : 0;
      const uScale = item.role === 'wing' ? 1 + u * 0.18 : 1;
      return { ...item, assetId: item.asset?.id, accent, scale: item.scale * ctx.scaleMul * uScale, alpha: Math.min(100, item.alpha + ctx.alphaBoost), u };
    });
    if (!ctx.layoutParams.overlap) items = [...items].sort((a, b) => a.scale - b.scale);
    const stamp = ctx.layoutParams.mirror || ctx.layoutParams.symmetry === 'stamp';
    if (stamp && ctx.caps.allowMirror) {
      items = [...items, ...items.map((item) => ({ ...item, x: CANVAS_W - item.x, rotation: -item.rotation, _mirrored: true, key: item.key ? `${item.key}-stamp` : undefined }))];
    }
    return items;
  }

  function resolveLayers(input) {
    const caps = getQualityCaps(input.quality || 'balanced');
    const pool = mergePool(ASSETS, input.customAssets || []);
    const weightOverrides = input.assetWeightOverrides || {};
    const out = [];
    const aliveIds = new Set();

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
            layoutParams: (input.driftOverlay || input.perfClampOverride)
              ? { ...input.layoutParams, ...input.driftOverlay, ...input.perfClampOverride }
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
      const palette = resolvePalette(src.paletteId, src.paletteOverrides, input.userPalettes);
      let activeAssets = pool
        .filter((a) => !src.enabledAssets || src.enabledAssets[a.id])
        .map((a) => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a));
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
        });
      } else {
        items = buildPlacements({
          layoutParams, seed, seedOffsets, activeAssets, palette,
          caGrid: src.caGrid ?? null, caps, canvasW: CANVAS_W, canvasH: CANVAS_H,
          scale: input.effectiveScale, alpha: input.effectiveAlpha, cache: cacheFor(layer.id),
        }).items;
      }
      items = (items || []).filter((it) => it && it.assetId);
      out.push({ id: layer.id, layoutParams, palette, items, safeCount, layerBlendMode: layer.layerBlendMode || 'normal', layerOpacity: layer.layerOpacity ?? 1, layer });
    }
    const content = out.filter((e) => !e.isFx);
    content.forEach((e, i) => {
      const patch = e.layer?.patch;
      if (patch?.mode === 'feed') {
        const pts = (e.items || []).map((it) => ({ x: (Number(it.x) || 0) / CANVAS_W, y: (Number(it.y) || 0) / CANVAS_H }));
        const amt = (Number(patch.strength) || 0.16) * 0.05;
        const pulled = feedLive.applyTo(pts, { mode: 'feed', from: patch.to | 0, to: i, strength: amt });
        e.items = (e.items || []).map((it, k) => {
          const q = pulled[k];
          if (!q) return it;
          let dx = q.x * CANVAS_W - it.x;
          let dy = q.y * CANVAS_H - it.y;
          const m = Math.hypot(dx, dy);
          if (m > FEED_MAX_PX) { dx *= FEED_MAX_PX / m; dy *= FEED_MAX_PX / m; }
          return { ...it, x: it.x + dx, y: it.y + dy };
        });
      }
    });
    content.forEach((e, i) => {
      feedLive.pushSource(i, (e.items || []).map((it) => ({ x: (Number(it.x) || 0) / CANVAS_W, y: (Number(it.y) || 0) / CANVAS_H })));
    });
    feedLive.commit();
    prune(aliveIds);
    return out;
  }

  function dispose() {
    placementCaches.clear();
    swarmState.clear();
    feedLive.reset();
  }

  return { resolveLayers, dispose };
}
