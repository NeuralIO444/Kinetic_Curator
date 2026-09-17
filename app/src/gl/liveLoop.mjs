/**
 * liveLoop.mjs — the live WebGL render loop (issue #224, PERFORM leg).
 *
 * One instrument: the visible canvas renders through the same WebGL2
 * pipeline as the exported stills (renderer.mjs renderFrameInto), so what
 * plays is what renders. The loop:
 *
 * 1. Resolves live layers each frame with the browser-safe resolver
 *    (liveResolve.mjs — same placements + real swarm physics as the app).
 * 2. Bakes + uploads texture resources (liveAtlas.mjs) whenever the needed
 *    asset/color combos or FX grain wraps change; the last frame holds while
 *    a bake is in flight.
 * 3. Builds a v1 scene contract (sceneContract.js), applies the viewport
 *    (zoom/pan) and breath transforms to instance coordinates, and renders
 *    at the governor's renderScale into persistent GPU targets.
 * 4. Runs the GPU ACCUM recipe (accum.mjs) with per-frame recipe params
 *    (fade/optics/tunnel/prism + audio envelope), or presents the content
 *    frame directly. FREEZE holds the feedback image; CLEAR re-seeds it.
 * 5. Exposes captureFrame() — real GPU pixels for PNG stills and batch —
 *    and the canvas itself for captureStream() recording.
 *
 * The loop never touches React state per frame (no re-render storm): it
 * reads the zustand store directly and reports node count through the
 * store's setNodeCount.
 */

import { createLiveRenderer } from './renderer.mjs';
import { createLiveResolver } from './liveResolve.mjs';
import { bakeLiveAtlas, bakeLiveGrainLut, comboKey } from './liveAtlas.mjs';
import { buildSceneContract } from './sceneContract.js';
import { resolvePalette } from '../data/palettes.js';
import { CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { ASSETS } from '../data/assets/index.js';
import { mergePool } from '../assets/overlay.js';
import { accumRecipeParams, applyAudioEnvelope } from './accum.mjs';
import { createGpuTimer } from './debug/gpuTimer.mjs';
import { reportStage } from '../hooks/useFpsMeter.js';

const CX = CANVAS_W / 2;
const CY = CANVAS_H / 2;

function staticKeyFor(combos, fxLayerIds, w, h) {
  const ck = combos.map((c) => comboKey(c.asset, c.ink, c.accent)).sort().join(';');
  return `${w}x${h}|${[...fxLayerIds].sort().join(',')}|${ck}`;
}

/**
 * @param {HTMLCanvasElement} canvas — the visible canvas.
 * @param {object} opts
 *   getState: () => zustand store state (live read, no subscriptions)
 *   lifeRef: { current: { lifeT, scaleMul, alphaBoost, breathScale, breathRot,
 *     glow, effectiveScale, effectiveAlpha, depth, bands, pulse } }
 *   viewRef: { current: { zoom, pan: {x, y} } }
 *   wrapEl: element receiving the audio glow (box-shadow), optional
 */
export function createLiveLoop(canvas, { getState, lifeRef, viewRef, wrapEl = null } = {}) {
  if (!canvas) throw new Error('[gl-live] no canvas');
  if (typeof getState !== 'function') throw new Error('[gl-live] getState required');

  const live = createLiveRenderer(canvas);
  const resolver = createLiveResolver();

  // #103 Track A — per-tick GPU frame timing for the governor. Timer query
  // when EXT_disjoint_timer_query_webgl2 exists, CPU-wall fallback otherwise
  // (see gl/debug/gpuTimer.mjs). Reported through the Showrunner patrol
  // channel; the governor reads the rolling average from stageTimings and
  // treats sustained GPU saturation like sustained low FPS.
  let gpuTimer = null;
  const ensureGpuTimer = () => {
    if (!gpuTimer) gpuTimer = createGpuTimer(live.getGL());
    return gpuTimer;
  };

  let rafId = 0;
  let running = false;
  let bgMode = 'palette'; // palette | transparent | white
  let frameCount = 0;

  // Static resources (atlas + grain LUTs), uploaded once per combo set.
  // cells is a plain object: "asset|tint|accent" -> {u0,v0,u1,v1}, exactly
  // what renderFrameInto's instanceData reads.
  let cells = null;
  let staticKey = null;
  let building = false;
  let buildToken = 0;
  let svgPool = null; // Map asset id -> svg fragment, rebuilt on customAssets change
  let svgPoolRef = null;

  // ACCUM session state.
  let accumObj = null;
  let accumActive = false;
  let accumFrozen = false;
  let lastAccumOn = false;

  let lastErrTs = 0;
  let lastNodeCount = -1;

  function setBgMode(m) {
    bgMode = m === 'transparent' ? 'transparent' : m === 'white' ? 'white' : 'palette';
  }

  function getPool(customAssets) {
    if (customAssets !== svgPoolRef) {
      const pool = mergePool(ASSETS, customAssets || []);
      // Canon + custom (overlay) assets both carry `.svg` fragments — the
      // same field the offline baker rasterizes (gl/atlas.mjs bakeCombo).
      svgPool = new Map(pool.map((a) => [a.id, a.svg]));
      svgPoolRef = customAssets;
    }
    return svgPool;
  }

  /**
   * Resolve layers -> contract -> transformed payload, and ensure static
   * resources. Returns null when a bake is in flight (hold last frame);
   * throws on real errors (the tick catches and throttles).
   */
  function buildFrame() {
    const s = getState();
    const life = lifeRef?.current || {};
    const layoutParams = s.layoutParams || {};

    const resolved = resolver.resolveLayers({
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      layerSnapshots: s.layerSnapshots,
      seed: s.seed,
      paletteId: s.paletteId,
      paletteOverrides: s.paletteOverrides,
      userPalettes: s.userPalettes,
      layoutParams,
      caGrid: s.caGrid,
      enabledAssets: s.enabledAssets,
      assetWeightOverrides: s.assetWeightOverrides,
      customAssets: s.customAssets,
      quality: s.quality,
      driftOverlay: s.driftOverlay,
      perfClampOverride: s.perfClampOverride,
      perfTier1: s.perfTier1,
      assetThin: s.assetThin,
      // Pausing freezes the instrument: swarm physics halts (same slot the
      // governor's slowRender uses) and the tick holds the last frame.
      slowRender: s.slowRender || !s.running,
      scaleMul: life.scaleMul ?? 1,
      alphaBoost: life.alphaBoost ?? 0,
      effectiveScale: life.effectiveScale,
      effectiveAlpha: life.effectiveAlpha,
      phraseWrapGen: s.phraseWrapGen || 0,
      attractor: viewRef.current?.attractor?.current ?? null,
    });

    // Node-count instrumentation (footer readout), store-owned.
    let nodes = 0;
    for (const r of resolved) if (!r.isFx) nodes += r.items?.length || 0;
    if (nodes !== lastNodeCount) {
      lastNodeCount = nodes;
      try { s.setNodeCount(nodes); } catch { /* store gone */ }
    }

    const contract = buildSceneContract({
      doc: { seed: s.seed, quality: s.quality, layers: s.layers },
      resolvedLayers: resolved,
      caps: null,
      accum: null, // ACCUM is loop-owned (begin/step below), not contract-owned
    });

    // Apply viewport (zoom/pan) + breath transforms to instance coordinates
    // so the GL frame matches what the live canvas shows — this is the
    // "what you play is what renders" step. Contract instances use
    // scaleX/scaleY (mirrored instances negate scaleX — preserve the sign).
    const view = viewRef?.current || { zoom: 1, pan: { x: 0, y: 0 } };
    const z = view.zoom || 1;
    const px = view.pan?.x || 0;
    const py = view.pan?.y || 0;
    const bs = life.breathScale ?? 1;
    const br = ((life.breathRot ?? 0) * Math.PI) / 180;
    const cos = Math.cos(br);
    const sin = Math.sin(br);
    const sizeMul = bs * z;
    for (const it of contract.instances) {
      const x = z * (it.x - CX) + CX + px;
      const y = z * (it.y - CY) + CY + py;
      const dx = bs * (x - CX);
      const dy = bs * (y - CY);
      it.x = CX + dx * cos - dy * sin;
      it.y = CY + dx * sin + dy * cos;
      it.scaleX *= sizeMul;
      it.scaleY *= sizeMul;
      it.rotation += life.breathRot || 0;
    }

    // Static resources: atlas combos from the transformed instances, grain
    // LUTs keyed by FX layer id (what renderFrameInto's auxFor reads).
    const combos = contract.instances.map((it) => ({ asset: it.asset, ink: it.tint, accent: it.accent }));
    const fxLayerIds = new Set((contract.fxWraps || []).map((w) => w.fxLayerId));

    const renderScale = Math.min(1, Math.max(0.1, s.renderScale || 1));
    const rw = Math.max(2, Math.round(CANVAS_W * renderScale));
    const rh = Math.max(2, Math.round(CANVAS_H * renderScale));

    const key = staticKeyFor(combos, fxLayerIds, rw, rh);
    if (key !== staticKey && !building) {
      startStaticBuild(combos, fxLayerIds, rw, rh, key);
    }
    if (building || !cells) return null;

    const activePalette = resolvePalette(s.paletteId, s.paletteOverrides, s.userPalettes);
    const bgCss = bgMode === 'white' ? '#ffffff' : bgMode === 'transparent' ? null : activePalette.bg;

    return {
      payload: {
        width: rw,
        height: rh,
        bg: bgCss || '#000000',
        contract,
        cells,
        wrapBoxes: {},
      },
      transparent: !bgCss,
      bgCss: bgCss || activePalette.bg,
      rw, rh,
      accumOn: !!layoutParams.accumulation && !s.perfTier1,
      accumFrozen,
      accumParams: {
        fade: layoutParams.accumulationFade,
        optics: layoutParams.accumulationOptics,
        tunnel: layoutParams.accumulationTunnel,
        prism: layoutParams.accumulationPrism,
      },
      audioBands: s.audioBands,
      audioOn: !!s.audioEnabled,
      glow: life.glow ?? 0,
      paused: !s.running,
    };
  }

  async function startStaticBuild(combos, fxLayerIds, rw, rh, key) {
    building = true;
    const token = ++buildToken;
    try {
      const svgById = getPool(getState().customAssets);
      const atlas = await bakeLiveAtlas(combos, svgById);
      if (token !== buildToken) return; // superseded
      const luts = {};
      for (const id of fxLayerIds) {
        luts[id] = await bakeLiveGrainLut(rw, rh);
        if (token !== buildToken) return;
      }
      if (token !== buildToken) return;
      live.setAtlas(atlas.pixels, atlas.width, atlas.height, atlas.mipmaps);
      live.setGrainLuts(luts);
      cells = Object.fromEntries(atlas.cells);
      staticKey = key;
    } catch (e) {
      console.error('[gl-live] static build failed:', e);
    } finally {
      if (token === buildToken) building = false;
    }
  }

  function tick() {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    try {
      const frame = buildFrame();
      if (!frame) return; // static bake in flight — hold last frame

      const { payload, transparent, bgCss, accumOn, accumFrozen, accumParams, audioBands, audioOn, glow, paused } = frame;

      if (paused) return; // hold the last presented frame

      if (wrapEl) {
        wrapEl.style.boxShadow = glow > 0.02
          ? `0 0 ${Math.round(90 * glow)}px ${Math.round(18 * glow)}px rgba(255,255,255,${(0.10 * glow).toFixed(3)})`
          : '';
      }

      // #103 Track A — time the GPU work itself: content render, ACCUM step,
      // and present. Timer query when the extension exists; CPU-wall
      // fallback (submission time) otherwise. Reported through the patrol
      // channel; disjoint or still-pending queries skip this round.
      const timer = ensureGpuTimer();
      const cpuFallback = !timer.isHardware;
      const cpuT0 = cpuFallback ? performance.now() : 0;
      if (!cpuFallback) timer.begin('frame');
      try {
        if (accumOn) {
          if (!accumActive) {
            accumObj = live.ensureAccum(payload.width, payload.height);
            accumObj.begin(bgCss);
            accumActive = true;
          }
          lastAccumOn = true;
          if (accumFrozen) {
            // FREEZE: hold the feedback image, skip render + step.
            live.present(accumObj.texture());
          } else {
            const target = live.renderFrame(payload, { transparent: true });
            const bands = audioBands || { rms: 0, beatPulse: 0 };
            // Silence is a true no-op: the envelope passes params through at 0.
            const rp = applyAudioEnvelope(accumRecipeParams(accumParams), {
              rms: audioOn ? bands.rms || 0 : 0,
              flux: 0,
              beatPulse: audioOn ? bands.beatPulse || 0 : 0,
            });
            accumObj.step(target.tex, rp);
            live.present(accumObj.texture());
          }
        } else {
          if (lastAccumOn) {
            live.dropAccum();
            accumObj = null;
            accumActive = false;
          }
          lastAccumOn = false;
          const target = live.renderFrame(payload, { transparent });
          live.present(target);
        }
      } finally {
        if (cpuFallback) {
          reportStage('gpuFrame', performance.now() - cpuT0);
        } else {
          timer.end('frame');
          const r = timer.poll();
          if (r.done && !r.disjoint) {
            const ms = r.timings.get('frame');
            if (typeof ms === 'number') reportStage('gpuFrame', ms);
          }
        }
      }
      frameCount++;
    } catch (e) {
      // Never let a bad frame kill the loop; throttle the noise.
      const now = performance.now();
      if (now - lastErrTs > 1000) {
        console.error('[gl-live] frame error:', e);
        lastErrTs = now;
      }
    }
  }

  /**
   * Render the current frame offscreen and return real GPU pixels.
   * Used by PNG stills, batch export, and the print desk. The render size is
   * independent of the live renderScale (1x/2x/4x stills).
   */
  function captureFrame({ width = CANVAS_W, height = CANVAS_H } = {}) {
    if (building) throw new Error('[gl-live] textures baking — wait a moment and retry');
    const frame = buildFrame();
    if (!frame) throw new Error('[gl-live] textures baking — wait a moment and retry');
    const { payload, transparent, accumOn } = frame;

    if (accumOn && accumActive && accumObj) {
      // Capture the actual feedback image at live size, then upscale in 2D.
      const tex = accumObj.texture();
      const livePixels = live.readback(tex, payload.width, payload.height);
      return upscaleIfNeeded(livePixels, payload.width, payload.height, width, height);
    }
    const target = live.renderFrame(
      { ...payload, width, height },
      { transparent },
    );
    const pixels = live.readback(target, width, height);
    return { pixels, width, height };
  }

  function upscaleIfNeeded(pixels, sw, sh, dw, dh) {
    if (sw === dw && sh === dh) return { pixels, width: dw, height: dh };
    const src = document.createElement('canvas');
    src.width = sw; src.height = sh;
    src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), sw, sh), 0, 0);
    const out = document.createElement('canvas');
    out.width = dw; out.height = dh;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, dw, dh);
    const img = ctx.getImageData(0, 0, dw, dh);
    return { pixels: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), width: dw, height: dh };
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function dispose() {
    stop();
    resolver.dispose();
    live.dispose();
  }

  /**
   * Batch export support: resolve when no static build is in flight and at
   * least two frames have rendered since the call (covers the seed-change
   * -> resolve -> rebake -> render pipeline).
   */
  /**
   * Resolve when the static resources are ready for capture: no bake in
   * flight and atlas cells present. Nudges the resource pipeline first so a
   * loop that has never ticked (or one whose combos changed while paused)
   * starts its bake instead of hanging. Uses setTimeout, not rAF, so it
   * resolves even while the loop is paused or the tab is backgrounded.
   * captureFrame() renders on demand, so no frame advancement is needed —
   * unlike waitForSettled, which requires the loop to be running.
   */
  function waitForReady(timeoutMs = 60000) {
    try { buildFrame(); } catch { /* real errors surface from captureFrame */ }
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const check = () => {
        if (performance.now() - t0 > timeoutMs) {
          reject(new Error('[gl-live] ready timeout — textures never finished baking'));
          return;
        }
        if (!building && cells) {
          resolve();
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  function waitForSettled(timeoutMs = 12000) {    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const startFrame = frameCount;
      const check = () => {
        if (performance.now() - t0 > timeoutMs) {
          reject(new Error('[gl-live] settle timeout — textures never finished baking'));
          return;
        }
        if (!building && cells && frameCount > startFrame + 1) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  return {
    start, stop, dispose,
    setBgMode,
    setAccumFrozen: (f) => { accumFrozen = !!f; },
    captureFrame,
    waitForSettled,
    waitForReady,
    getCanvas: () => canvas,
    isBuilding: () => building,
    clearAccum() {
      if (accumObj && accumActive) {
        const s = getState();
        const activePalette = resolvePalette(s.paletteId, s.paletteOverrides, s.userPalettes);
        accumObj.begin(bgMode === 'white' ? '#ffffff' : activePalette.bg);
      }
    },
  };
}
