/**
 * renderWorker.js — Decoupled Live WebGL & Accumulation Render Worker (Issue #28)
 *
 * Runs the WebGL2 rendering loop, physical particle resolution, and persistent
 * accumulation feedback buffer (accum.mjs) completely decoupled from the main
 * thread and declarative React DOM reconciliation.
 *
 * Message protocol:
 * - INIT: { canvas: OffscreenCanvas, previewScale, initialState, initialView }
 * - UPDATE_STATE: { state }
 * - UPDATE_VIEW: { view }
 * - SET_BG_MODE: { bgMode }
 * - ACCUM_GESTURE: { action: 'clear' | 'freeze' | 'swell', value }
 * - START / STOP / DISPOSE
 * - RECEIVE_ATLAS: { atlasKey, pixels, width, height, cells, mipmaps }
 * - RECEIVE_GRAIN: { grainKey, luts }
 * - CAPTURE_FRAME: { reqId, width, height }
 * - WAIT_READY: { reqId, timeoutMs }
 * - WAIT_SETTLED: { reqId, timeoutMs }
 */

import { createLiveRenderer } from './renderer.mjs';
import { createLiveResolver } from './liveResolve.mjs';
import { buildSceneContract } from './sceneContract.js';
import { resolvePalette } from '../data/palettes.js';
import { resolveLiveRenderState } from '../data/voices.js';
import { CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { accumRecipeParams, applyAudioEnvelope } from './accum.mjs';
import { attachVelocities } from './velocitySmear.mjs';
import { halfLifeToKeep } from '../components/taper.js';
import { createBallisticsState, processBallistics } from './audioBallistics.mjs';
import { comboKey } from './liveAtlas.mjs';

const CX = CANVAS_W / 2;
const CY = CANVAS_H / 2;

let canvas = null;
let live = null;
let resolver = null;
let ballisticsState = null;

let running = false;
let rafId = 0;
let lastTickMs = 0;
let loopTimeMs = 0;

let storeState = {};
let view = { zoom: 1, pan: { x: 0, y: 0 }, attractor: null };
let bgMode = 'palette';

let accumObj = null;
let accumActive = false;
let accumFrozen = false;
let accumRetryAt = 0;
let lastAccumOn = false;
let swellStart = 0;

let previewScale = 1.0;
let cells = null;
let atlasKey = null;
let building = false;

const velPrev = new Map();
const smoothedLayoutParams = {};

function swellEnvelope() {
  if (!swellStart) return 0;
  const elapsed = (performance.now() - swellStart) / 1000;
  if (elapsed >= 2.0) { swellStart = 0; return 0; }
  return Math.sin((elapsed / 2.0) * Math.PI);
}

function handleInit(data) {
  canvas = data.canvas;
  previewScale = data.previewScale || 1.0;
  storeState = data.initialState || {};
  view = data.initialView || view;
  bgMode = storeState.canvasBg || 'palette';

  live = createLiveRenderer(canvas);
  resolver = createLiveResolver();
  ballisticsState = createBallisticsState();

  self.postMessage({ type: 'READY' });
  startLoop();
}

function buildFrame() {
  const s = storeState;
  const layoutParams = s.layoutParams || {};
  const layers = s.layers || [];
  const activeLayerId = s.activeLayerId || (layers[0] && layers[0].id) || 'default';
  const voiceState = resolveLiveRenderState(s);

  // Time step
  const now = performance.now();
  const dtMs = lastTickMs ? Math.min(now - lastTickMs, 100) : 16.667;
  lastTickMs = now;
  const dtSec = dtMs / 1000;

  loopTimeMs += dtMs;

  // Spring smoothing for layoutParams
  for (const [k, v] of Object.entries(layoutParams)) {
    if (typeof v === 'number') {
      const cur = smoothedLayoutParams[k] ?? v;
      smoothedLayoutParams[k] = cur + (v - cur) * (1 - Math.exp(-dtSec * 12));
    }
  }

  // Audio ballistics
  const audioBands = s.audioInput || null;
  const ballistics = processBallistics(ballisticsState, audioBands, dtSec);

  // Resolver step
  const resolved = resolver.resolveLayers({
    layers,
    activeLayerId,
    layoutParams: { ...layoutParams, ...smoothedLayoutParams },
    seed: s.seed || 1,
    seedOffsets: s.seedOffsets || {},
    loopTimeMs,
    audioBands: ballistics,
    dtSec,
  });

  const totalInstances = resolved.reduce((acc, l) => acc + (l.items ? l.items.length : 0), 0);
  self.postMessage({ type: 'NODE_COUNT', nodeCount: totalInstances });

  // Scene contract
  const contract = buildSceneContract({
    doc: { seed: s.seed, seedOffsets: s.seedOffsets, quality: s.quality, layers: s.layers },
    resolvedLayers: resolved,
    caps: null,
    accum: null,
  });

  // Viewport transforms
  const zoom = view.zoom || 1;
  const panX = (view.pan && view.pan.x) || 0;
  const panY = (view.pan && view.pan.y) || 0;

  for (const it of contract.instances) {
    it.x = zoom * (it.x - CX) + CX + panX;
    it.y = zoom * (it.y - CY) + CY + panY;
    it.scaleX = (it.scaleX || 1) * zoom;
    it.scaleY = (it.scaleY || 1) * zoom;
  }

  // Velocity smear
  if (!!layoutParams.accumulation && !s.perfTier1 && accumActive) {
    attachVelocities(contract.instances, velPrev);
  }

  // Combos check for atlas
  const combos = contract.instances.map((it) => ({ asset: it.asset, ink: it.tint, accent: it.accent }));
  const fxLayerIds = Array.from(new Set((contract.fxWraps || []).map((w) => w.fxLayerId)));
  const nextAtlasKey = combos.map((c) => comboKey(c.asset)).sort().join('|');

  if (nextAtlasKey !== atlasKey && !building) {
    building = true;
    self.postMessage({
      type: 'REQUEST_ATLAS_BAKE',
      combos,
      fxLayerIds,
      key: nextAtlasKey,
    });
  }

  if (!cells) return null;

  const activePalette = resolvePalette(voiceState.paletteId, voiceState.paletteOverrides, s.userPalettes);
  const bgCss = bgMode === 'white' ? '#ffffff' : bgMode === 'transparent' ? null : activePalette.bg;

  const renderScale = Math.min(1, Math.max(0.1, (s.renderScale || 1.0) * previewScale));
  const rw = Math.max(2, Math.round(CANVAS_W * renderScale));
  const rh = Math.max(2, Math.round(CANVAS_H * renderScale));

  return {
    payload: {
      width: rw,
      height: rh,
      bg: bgCss || '#000000',
      contract,
      cells,
    },
    transparent: !bgCss,
    bgCss: bgCss || activePalette.bg,
    rw, rh,
    accumOn: !!layoutParams.accumulation && !s.perfTier1,
    accumFrozen,
    accumParams: {
      fade: halfLifeToKeep((layoutParams.accumulationFade ?? 5.4)
        + swellEnvelope() * (40 - (layoutParams.accumulationFade ?? 5.4))),
      optics: layoutParams.accumulationOptics,
      tunnel: layoutParams.accumulationTunnel,
      prism: layoutParams.accumulationPrism,
      flow: layoutParams.accumulationFlow,
    },
    audioBands: ballistics,
    audioOn: !!s.audioInput,
    audioSwell: swellEnvelope(),
    glow: layoutParams.glow || 0,
    paused: !s.running,
  };
}

function renderTick() {
  if (!running) return;

  const frame = buildFrame();
  if (frame && live) {
    const { payload, transparent, bgCss, accumOn, accumFrozen: frozen, accumParams, audioBands, audioOn, audioSwell, paused } = frame;

    if (!paused) {
      live.ensureTargets(payload.width, payload.height, previewScale);

      if (accumOn) {
        if (!accumActive) {
          if (performance.now() >= accumRetryAt) {
            try {
              accumObj = live.ensureAccum(payload.width, payload.height);
              accumObj.begin(bgCss);
              accumActive = true;
            } catch {
              accumActive = false;
              accumRetryAt = performance.now() + 2000;
            }
          }
        }
        lastAccumOn = true;
        if (frozen && accumObj) {
          live.presentUpscaled(accumObj.texture());
        } else if (accumObj) {
          try {
            const fresh = live.ensureAccum(payload.width, payload.height);
            if (fresh !== accumObj) {
              accumObj = fresh;
              accumObj.begin(bgCss);
            }
            const target = live.renderFrameInto(payload, { transparent: true });
            const bands = audioBands || { rms: 0, beatPulse: 0 };
            const rp = applyAudioEnvelope(accumRecipeParams({ ...accumParams, background: bgCss }), {
              rms: audioOn ? bands.rms || 0 : 0,
              flux: 0,
              beatPulse: audioOn ? bands.beatPulse || 0 : 0,
            }, { swell: audioSwell ?? 1 });

            accumObj.step(target.tex, rp, { width: target.w, height: target.h });
            live.presentUpscaled(accumObj.texture());
          } catch {
            const target = live.renderFrameInto(payload, { transparent });
            live.present(target);
          }
        } else {
          const target = live.renderFrameInto(payload, { transparent });
          live.present(target);
        }
      } else {
        if (lastAccumOn) {
          live.dropAccum();
          accumObj = null;
          accumActive = false;
          velPrev.clear();
          accumFrozen = false;
        }
        lastAccumOn = false;
        const target = live.renderFrameInto(payload, { transparent });
        live.present(target);
      }
    }
  }

  rafId = requestAnimationFrame(renderTick);
}

function startLoop() {
  if (running) return;
  running = true;
  lastTickMs = performance.now();
  rafId = requestAnimationFrame(renderTick);
}

function stopLoop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'INIT':
      handleInit(msg);
      break;

    case 'UPDATE_STATE':
      storeState = { ...storeState, ...msg.state };
      break;

    case 'UPDATE_VIEW':
      view = { ...view, ...msg.view };
      break;

    case 'SET_BG_MODE':
      bgMode = msg.bgMode;
      break;

    case 'ACCUM_GESTURE':
      if (msg.action === 'clear' && accumObj && accumActive) {
        accumObj.begin(bgMode === 'white' ? '#ffffff' : '#000000');
      } else if (msg.action === 'freeze') {
        accumFrozen = !!msg.value;
      } else if (msg.action === 'swell') {
        swellStart = performance.now();
      }
      break;

    case 'START':
      startLoop();
      break;

    case 'STOP':
      stopLoop();
      break;

    case 'RECEIVE_ATLAS':
      atlasKey = msg.key;
      cells = msg.cells;
      building = false;
      if (live) {
        live.setAtlas(msg.pixels, msg.width, msg.height, msg.mipmaps);
      }
      break;

    case 'CAPTURE_FRAME': {
      const { reqId, width, height } = msg;
      try {
        if (!live) throw new Error('Live renderer not initialized');
        const frame = buildFrame();
        if (!frame) throw new Error('Frame not ready for capture');
        const pixels = live.renderFrameOffscreen(
          { ...frame.payload, width: width || CANVAS_W, height: height || CANVAS_H },
          { transparent: frame.transparent }
        );
        self.postMessage(
          { type: 'CAPTURE_FRAME_RESULT', reqId, pixels, width, height, ok: true },
          [pixels.buffer]
        );
      } catch (err) {
        self.postMessage({ type: 'CAPTURE_FRAME_RESULT', reqId, error: err.message, ok: false });
      }
      break;
    }

    case 'DISPOSE':
      stopLoop();
      if (live) {
        try { live.dispose(); } catch { /* */ }
        live = null;
      }
      break;
  }
};
