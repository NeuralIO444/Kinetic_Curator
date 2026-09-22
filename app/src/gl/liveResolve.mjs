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
import { applyField, applyMod, motionMetrics } from '../engine/kernel/tracks/trackGraph.js';

import { createNoise } from '../engine/noise.js';
import { blendItems } from '../engine/kernel/itemMorph.mjs';
import { mixEase } from './paletteMix.mjs';

const HOP_MAX_PX = 4;

function clampHop(it, q) {
  if (!q) return it;
  let dx = q.x * CANVAS_W - it.x;
  let dy = q.y * CANVAS_H - it.y;
  const m = Math.hypot(dx, dy);
  if (m > HOP_MAX_PX) { dx *= HOP_MAX_PX / m; dy *= HOP_MAX_PX / m; }
  return { ...it, x: it.x + dx, y: it.y + dy };
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

  function prune(aliveIds) {
    for (const k of [...placementCaches.keys()]) if (!aliveIds.has(k)) placementCaches.delete(k);
    for (const k of [...swarmState.keys()]) if (!aliveIds.has(k)) swarmState.delete(k);
    for (const k of [...lastShown.keys()]) if (!aliveIds.has(k)) lastShown.delete(k);
    for (const k of [...morphState.keys()]) if (!aliveIds.has(k)) morphState.delete(k);
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
      st.system.init(Math.ceil(ctx.safeParticles), CANVAS_W, CANVAS_H, ctx.activeAssets, ctx.palette, ctx.seed, ctx.seedOffsets, { graze: ctx.layoutParams.graze || 0 });
      st.initKey = initKey;
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
        alpha: Math.min(100, item.alpha + ctx.alphaBoost),
        u,
        seedOffset: item.seedOffset,
      };
    });
    if (!ctx.layoutParams.overlap) items = [...items].sort((a, b) => a.scale - b.scale);
    const stamp = ctx.layoutParams.mirror || ctx.layoutParams.symmetry === 'stamp';
    if (stamp && ctx.caps.allowMirror) {
      items = [...items, ...items.map((item) => ({ ...item, x: CANVAS_W - item.x, rotation: -item.rotation, _mirrored: true, key: item.key ? `${item.key}-stamp` : undefined, seedOffset: item.seedOffset }))];
    }
    return items;
  }

  function resolveLayers(input) {
    const caps = getQualityCaps(input.quality || 'balanced');
    const pool = mergePool(ASSETS, input.customAssets || []);
    const weightOverrides = input.assetWeightOverrides || {};
    const out = [];
    const aliveIds = new Set();

    // Spine F (#392): Single shared world noise owned by the resolver.
    const projectSeed = (input.seed ?? 0) >>> 0;
    if (!worldNoise || worldNoiseSeed !== projectSeed) {
      worldNoise = createNoise(projectSeed || 444);
      worldNoiseSeed = projectSeed;
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
        if (!input.slowRender && layoutParams.displacement > 0) {
          const nt0 = (seed & 0xffff) * 0.02 * (layoutParams.noiseSpeed ?? 0.5);
          const loopTime = (input.loopTimeMs ?? 0) * 0.001;
          const noiseFreq = layoutParams.noiseFreq ?? 0.005;
          const displacement = layoutParams.displacement;
          const domainOffsetX = (seedOffsets?.noise || 0) * 100;
          const domainOffsetY = (seedOffsets?.noise || 0) * 100;
          const isLayersMode = layoutParams.mode === 'layers';

          items = items.map((it, k) => {
            const band = isLayersMode ? ((it.index ?? k) % 5) : 0;
            const speed = isLayersMode
              ? (layoutParams.noiseSpeed ?? 0.5) * (0.4 + band * 0.25)
              : (layoutParams.noiseSpeed ?? 0.5);
            const ntLive = nt0 + loopTime * speed;
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
      items = (items || []).filter((it) => it && it.assetId);
      // Item-morph trigger signature: the same fields that used to drive
      // the pixel crossfade (mode/behave/palette/asset-set), scoped per
      // layer. Deliberately excludes seed — a SHUFFLE re-roll has never
      // dissolved, chip clicks are the only trigger.
      const morphSig = [
        layoutParams.mode, layoutParams.behave, src.paletteId,
        JSON.stringify(src.paletteOverrides || null),
        Object.keys(src.enabledAssets || {}).filter((k) => src.enabledAssets[k]).sort().join(','),
      ].join('|');
      out.push({ id: layer.id, layoutParams, palette, items, safeCount, morphSig, layerBlendMode: layer.layerBlendMode || 'normal', layerOpacity: layer.layerOpacity ?? 1, layer });
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
    content.forEach((e, i) => {
      const patch = e.layer?.patch;
      if (!patch) return;
      if (patch.mode === 'field') {
        const src = content[patch.to | 0];
        const srcPts = (src?.items || []).map(toNorm);
        const tgt = (e.items || []).map(toNorm);
        const pulled = applyField(tgt, srcPts, { mode: 'field', from: patch.to | 0, to: i, strength: patchStrength(patch) });
        e.items = (e.items || []).map((it, k) => clampHop(it, pulled[k]));
      } else if (patch.mode === 'feed') {
        const pts = (e.items || []).map(toNorm);
        const amt = patchStrength(patch) * 0.05;
        const pulled = feedLive.applyTo(pts, { mode: 'feed', from: patch.to | 0, to: i, strength: amt });
        e.items = (e.items || []).map((it, k) => clampHop(it, pulled[k]));
      } else if (patch.mode === 'mod') {
        const src = content[patch.to | 0];
        const metrics = motionMetrics((src?.items || []).map(toNormVel));
        const knobs = applyMod({ glow: 0, fade: 0, displace: 0 }, metrics,
          { mode: 'mod', from: patch.to | 0, to: i, strength: patchStrength(patch) });
        e.items = (e.items || []).map((it) => ({
          ...it,
          scale: (Number(it.scale) || 1) * (1 + knobs.glow * 0.35),
          alpha: Math.max(0, Math.min(100, (Number(it.alpha) || 100) * (1 - knobs.fade * 0.4))),
          x: it.x + Math.min(HOP_MAX_PX, knobs.displace) * 0.15,
        }));
      }
    });
    content.forEach((e, i) => feedLive.pushSource(i, (e.items || []).map(toNorm)));
    feedLive.commit();

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
        morphState.set(e.id, { fromItems: prevShown.items, startMs: nowMs, dur: mixSeconds });
      }
      const tr = morphState.get(e.id);
      let shown = e.items;
      if (tr) {
        const raw = tr.dur > 0 ? (nowMs - tr.startMs) / (tr.dur * 1000) : 1;
        if (raw >= 1) {
          morphState.delete(e.id);
        } else {
          shown = blendItems(tr.fromItems, e.items, mixEase(Math.max(0, raw)));
        }
      }
      lastShown.set(e.id, { sig: e.morphSig, items: shown });
      e.items = shown;
    }

    prune(aliveIds);
    return out;
  }

  function dispose() {
    placementCaches.clear();
    swarmState.clear();
    lastShown.clear();
    morphState.clear();
    feedLive.reset();
    worldNoise = null;
    worldNoiseSeed = null;
  }

  return { resolveLayers, dispose };
}
