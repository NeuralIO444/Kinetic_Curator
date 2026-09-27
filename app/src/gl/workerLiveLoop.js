/**
 * workerLiveLoop.js — Main-thread controller for Decoupled Render Worker (Issue #28, Task 3A & Option 1).
 *
 * Implements the same interface as createLiveLoop (liveLoop.mjs), but delegates
 * all 60 FPS WebGL2 instancing, physics ticks, and accumulation feedback passes
 * to a dedicated background worker with an OffscreenCanvas.
 */

import { bakeLiveAtlas } from './liveAtlas.mjs';
import { ASSETS } from '../data/assets/index.js';
import { mergePool } from '../assets/overlay.js';

export function serializeStoreState(s) {
  if (!s) return {};
  return {
    running: s.running !== false,
    layoutParams: s.layoutParams ? JSON.parse(JSON.stringify(s.layoutParams)) : {},
    layers: s.layers ? JSON.parse(JSON.stringify(s.layers)) : [],
    layerSnapshots: s.layerSnapshots ? JSON.parse(JSON.stringify(s.layerSnapshots)) : {},
    activeLayerId: s.activeLayerId,
    seed: s.seed,
    seedOffsets: s.seedOffsets ? { ...s.seedOffsets } : {},
    canvasBg: s.canvasBg,
    audioInput: s.audioInput,
    audioEnabled: s.audioEnabled,
    audioBands: s.audioBands,
    beatPulse: s.beatPulse,
    customAssets: s.customAssets,
    paletteId: s.paletteId,
    paletteOverrides: s.paletteOverrides,
    userPalettes: s.userPalettes,
    colorMode: s.colorMode,
    paletteMixSeconds: s.paletteMixSeconds,
    voice: s.voice,
    voiceState: s.voiceState,
    evolveMode: s.evolveMode,
    perfTier1: s.perfTier1,
    enabledAssets: s.enabledAssets ? { ...s.enabledAssets } : null,
    assetWeightOverrides: s.assetWeightOverrides ? { ...s.assetWeightOverrides } : null,
    quality: s.quality,
    caGrid: s.caGrid,
    lockedParams: s.lockedParams ? { ...s.lockedParams } : null,
    batchPaused: s.batchPaused,
    slowRender: s.slowRender,
    renderScale: s.renderScale,
    motionSmoothing: s.motionSmoothing,
  };
}

export function createWorkerLiveLoop(canvas, { getState, viewRef, previewScale = 1.0 } = {}) {
  if (!canvas || typeof canvas.transferControlToOffscreen !== 'function') {
    throw new Error('[workerLiveLoop] canvas does not support transferControlToOffscreen');
  }

  const rawState = getState ? getState() : {};
  const initialState = serializeStoreState(rawState);
  const initialView = viewRef ? viewRef.current : { zoom: 1, pan: { x: 0, y: 0 } };

  const offscreen = canvas.transferControlToOffscreen();
  canvas._kcTransferred = true;
  const worker = new Worker(new URL('./renderWorker.js', import.meta.url), { type: 'module' });

  let disposed = false;
  let running = false;
  let isBuilding = false;
  let isReady = false;
  let readyResolvers = [];
  let reqCounter = 0;
  const pendingRequests = new Map();

  // Helper to load SVGs for atlas bake
  function getSvgMap() {
    const s = getState();
    const svgMap = new Map();
    const pool = mergePool(ASSETS, s?.customAssets || []);
    for (const a of pool) {
      if (a && a.id && a.svg) svgMap.set(a.id, a.svg);
    }
    return svgMap;
  }

  worker.onmessage = async (e) => {
    const msg = e.data;
    if (!msg || !msg.type || disposed) return;

    switch (msg.type) {
      case 'READY':
        isReady = true;
        readyResolvers.forEach((fn) => fn());
        readyResolvers = [];
        break;

      case 'NODE_COUNT': {
        const s = getState();
        if (s && typeof s.setNodeCount === 'function') {
          s.setNodeCount(msg.nodeCount);
        }
        break;
      }

      case 'REQUEST_ATLAS_BAKE': {
        isBuilding = true;
        try {
          const svgById = getSvgMap();
          const atlas = await bakeLiveAtlas(msg.combos, svgById);
          if (disposed) return;

          const transferList = [];
          const seen = new Set();
          if (atlas.pixels?.buffer && !seen.has(atlas.pixels.buffer)) {
            transferList.push(atlas.pixels.buffer);
            seen.add(atlas.pixels.buffer);
          }
          if (atlas.mipmaps) {
            for (const m of atlas.mipmaps) {
              if (m?.pixels?.buffer && !seen.has(m.pixels.buffer)) {
                transferList.push(m.pixels.buffer);
                seen.add(m.pixels.buffer);
              }
            }
          }

          const cellsObj = atlas.cells instanceof Map ? Object.fromEntries(atlas.cells) : (atlas.cells || {});
          worker.postMessage(
            {
              type: 'RECEIVE_ATLAS',
              key: msg.key,
              pixels: atlas.pixels,
              width: atlas.width,
              height: atlas.height,
              cells: cellsObj,
              mipmaps: atlas.mipmaps,
            },
            transferList
          );
        } catch (err) {
          console.warn('[workerLiveLoop] Atlas bake failed', err);
        } finally {
          isBuilding = false;
        }
        break;
      }

      case 'CAPTURE_FRAME_RESULT': {
        const resolver = pendingRequests.get(msg.reqId);
        if (resolver) {
          pendingRequests.delete(msg.reqId);
          if (msg.ok) {
            resolver.resolve({
              pixels: msg.pixels,
              width: msg.width,
              height: msg.height,
              upscaledFrom: msg.upscaledFrom || null,
            });
          } else {
            resolver.reject(new Error(msg.error || 'Capture frame failed in worker'));
          }
        }
        break;
      }
    }
  };

  // Initialize worker with transferred canvas
  worker.postMessage(
    {
      type: 'INIT',
      canvas: offscreen,
      previewScale,
      initialState,
      initialView,
    },
    [offscreen]
  );

  function start() {
    running = true;
    worker.postMessage({ type: 'START' });
  }

  function stop() {
    running = false;
    worker.postMessage({ type: 'STOP' });
  }

  function dispose() {
    disposed = true;
    running = false;
    worker.postMessage({ type: 'DISPOSE' });
    worker.terminate();
  }

  function setBgMode(bgMode) {
    worker.postMessage({ type: 'SET_BG_MODE', bgMode });
  }

  function setAccumFrozen(frozen) {
    worker.postMessage({ type: 'ACCUM_GESTURE', action: 'freeze', value: !!frozen });
  }

  function swellAccum() {
    worker.postMessage({ type: 'ACCUM_GESTURE', action: 'swell' });
  }

  function clearAccum() {
    worker.postMessage({ type: 'ACCUM_GESTURE', action: 'clear' });
  }

  function updateState(nextState) {
    if (disposed) return;
    worker.postMessage({ type: 'UPDATE_STATE', state: serializeStoreState(nextState) });
  }

  function updateView(nextView) {
    if (disposed) return;
    worker.postMessage({ type: 'UPDATE_VIEW', view: nextView });
  }

  function captureFrame({ width = 1000, height = 700 } = {}) {
    return new Promise((resolve, reject) => {
      const reqId = ++reqCounter;
      pendingRequests.set(reqId, { resolve, reject });
      worker.postMessage({ type: 'CAPTURE_FRAME', reqId, width, height });
    });
  }

  function waitForReady(timeoutMs = 60000) {
    if (isReady && !isBuilding) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('[workerLiveLoop] Ready timeout')), timeoutMs);
      readyResolvers.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  function waitForSettled(timeoutMs = 12000) {
    return waitForReady(timeoutMs);
  }

  return {
    start,
    stop,
    dispose,
    setBgMode,
    setAccumFrozen,
    swellAccum,
    clearAccum,
    updateState,
    updateView,
    captureFrame,
    waitForReady,
    waitForSettled,
    getCanvas: () => canvas,
    isBuilding: () => isBuilding,
    isRunning: () => running,
    isDisposed: () => disposed,
    isWorker: true,
  };
}
