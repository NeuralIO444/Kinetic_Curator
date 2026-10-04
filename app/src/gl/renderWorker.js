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
import { createKinemeClock } from '../data/kinemes.js';
import { buildSceneContract } from './sceneContract.js';
import { resolvePalette } from '../data/palettes.js';
import { resolveLiveRenderState } from '../data/voices.js';
import { CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { accumRecipeParams, applyAudioEnvelope } from './accum.mjs';
import { attachVelocities } from './velocitySmear.mjs';
import { halfLifeToKeep } from '../components/taper.js';
import { createBallisticsState, processBallistics } from './audioBallistics.mjs';
import { comboKey } from './liveAtlas.mjs';
import { createTintWash, applyWash, paletteIdentity } from './tintWash.mjs'; // #624: WASH tint adoption state machine
import { createTintInject, applyInject } from './tintInject.mjs'; // #625: INJECT field-first propagation

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
const kinemeClock = createKinemeClock(); // #781 KINEME RATE (anchored)

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

// #624 (WASH) + #625 (INJECT): the worker is the primary render path
// (OffscreenCanvas); the in-thread liveLoop.mjs is only the fallback. Both
// tint machines run here so palette taps soak/propagate even when the worker
// owns the loop — each activates only in its own color mode.
const washMachine = createTintWash();
const injectMachine = createTintInject();
let lastResolved = null;

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

/**
 * Build one frame. With no arguments this is the live tick: dt comes from the
 * wall clock and loopTimeMs advances. With (dtSecOverride, loopTimeMsOverride)
 * it is a non-advancing peek — the frame resolves at the given clock without
 * consuming wall time or moving loopTimeMs. Capture uses buildFrame(0,
 * loopTimeMs), mirroring the in-thread capture peek (#810): zero dt makes
 * springs/ballistics/physics exact no-ops while warp/morph sample the
 * current loop time.
 */
function buildFrame(dtSecOverride, loopTimeMsOverride) {
  const s = storeState;
  const layoutParams = s.layoutParams || {};
  const layers = s.layers || [];
  const activeLayerId = s.activeLayerId || (layers[0] && layers[0].id) || 'default';
  const voiceState = resolveLiveRenderState(s);

  // Time step
  const now = performance.now();
  let dtMs, dtSec, frameTimeMs;
  if (dtSecOverride === undefined) {
    dtMs = lastTickMs ? Math.min(now - lastTickMs, 100) : 16.667;
    lastTickMs = now;
    dtSec = dtMs / 1000;
    loopTimeMs += dtMs;
    // #823 — a governor cut6/watchdog freeze (and a true pause) holds the
    // loop clock, mirroring liveLoop.mjs: roll the tick's advance back so
    // every loopTimeMs reader sees a held clock and nothing lump-sums on
    // thaw. frameTimeMs below is read after the rollback.
    if (s.running === false || s.slowRender) loopTimeMs -= dtMs;
    frameTimeMs = loopTimeMs;
  } else {
    // Peek: resolve at the override clock, advance nothing.
    dtSec = dtSecOverride;
    dtMs = dtSec * 1000;
    frameTimeMs = loopTimeMsOverride === undefined ? loopTimeMs : loopTimeMsOverride;
  }

  // Spring smoothing for layoutParams
  for (const [k, v] of Object.entries(layoutParams)) {
    if (typeof v === 'number') {
      const cur = smoothedLayoutParams[k] ?? v;
      smoothedLayoutParams[k] = cur + (v - cur) * (1 - Math.exp(-dtSec * 12));
    }
  }

  // Audio ballistics
  const audioBands = s.audioInput || null;
  const ballistics = processBallistics(ballisticsState, audioBands, dtMs);

  // Resolver step
  const resolved = resolver.resolveLayers({
    layers,
    activeLayerId,
    layerSnapshots: s.layerSnapshots,
    seed: s.seed || 1,
    seedOffsets: s.seedOffsets || {},
    paletteId: voiceState.paletteId,
    paletteOverrides: voiceState.paletteOverrides,
    userPalettes: s.userPalettes,
    layoutParams: { ...layoutParams, ...smoothedLayoutParams },
    caGrid: s.caGrid,
    enabledAssets: s.enabledAssets,
    shapeLevels: s.shapeLevels, // #733
    assetWeightOverrides: s.assetWeightOverrides,
    customAssets: s.customAssets,
    quality: s.quality,
    lockedParams: s.lockedParams,
    batchPaused: s.batchPaused,
    perfClampOverride: s.perfClampOverride,
    perfTier1: s.perfTier1,
    assetThin: s.assetThin,
    slowRender: s.slowRender || s.running === false,
    attractor: view.attractor,
    audioBands: ballistics,
    dtSec,
    loopTimeMs: frameTimeMs,
  });

  const totalInstances = resolved.reduce((acc, l) => acc + (l.items ? l.items.length : 0), 0);
  self.postMessage({ type: 'NODE_COUNT', nodeCount: totalInstances });

  // #624 (WASH) / #625 (INJECT): on palette identity changes, dye the new
  // tint across as a deterministic per-item wave (WASH) or field-first
  // propagation (INJECT) instead of an instant cut. The machines mutate the
  // resolved per-instance tint carrier in place (no atlas rebake — the atlas
  // key below is asset-only — and no scale change), then hand the frame to
  // the scene contract.
  const tintTargetPalette = resolvePalette(voiceState.paletteId, voiceState.paletteOverrides, s.userPalettes);
  const tintArgs = {
    // The store's palette, not voiceState's: a voice MIX blends the overrides
    // every frame, and a per-frame identity change would restart the fade
    // forever (FADE is the default mode now, #632). liveLoop does the same.
    identity: paletteIdentity(s.paletteId, s.paletteOverrides, s.userPalettes),
    mode: s.colorMode || 'FADE',
    mixSeconds: s.paletteMixSeconds,
    now: frameTimeMs,
    seed: s.seed || 1,
    bg: tintTargetPalette.bg,
    lastResolved,
  };
  const washEv = washMachine.update(tintArgs);
  const injectEv = injectMachine.update(tintArgs);
  if (washEv.washing) applyWash(resolved, washEv);
  if (injectEv.injecting) applyInject(resolved, injectEv);
  lastResolved = resolved;

  // Scene contract
  const contract = buildSceneContract({
    doc: { seed: s.seed, seedOffsets: s.seedOffsets, quality: s.quality, layers: s.layers, light: s.light, squash: layoutParams.squash, assetKineme: s.assetKineme, kinemeTime: kinemeClock.at(frameTimeMs / 1000, layoutParams.kinemeRate ?? 1), palette: tintTargetPalette },
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

  // #624/#625: during a wash the background dyes across the same wave as
  // the items, during an inject the field dyes first on the fast envelope
  // (the event's bg interpolates); otherwise it is the palette's bg.
  const bgCss = bgMode === 'white' ? '#ffffff' : bgMode === 'transparent' ? null
    : (s.colorMode || 'FADE') === 'INJECT' ? injectEv.bg : washEv.bg;

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
    bgCss: bgCss || tintTargetPalette.bg,
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
    paused: s.running === false || !!s.slowRender,
  };
}

function renderTick() {
  if (!running) return;

  const frame = buildFrame();
  if (frame && live) {
    const { payload, transparent, bgCss, accumOn, accumFrozen: frozen, accumParams, audioBands, audioOn, audioSwell, paused } = frame;

    if (!paused) {
      if (accumOn) {
        if (!accumActive) {
          if (performance.now() >= accumRetryAt) {
            try {
              accumObj = live.ensureAccum(payload.width, payload.height, previewScale);
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
            const fresh = live.ensureAccum(payload.width, payload.height, previewScale);
            if (fresh !== accumObj) {
              accumObj = fresh;
              accumObj.begin(bgCss);
            }
            const target = live.renderFrame(payload, { transparent: true, dprScale: previewScale });
            const bands = audioBands || { rms: 0, beatPulse: 0 };
            const rp = applyAudioEnvelope(accumRecipeParams({ ...accumParams, background: bgCss }), {
              rms: audioOn ? bands.rms || 0 : 0,
              flux: 0,
              beatPulse: audioOn ? bands.beatPulse || 0 : 0,
            }, { swell: audioSwell ?? 1 });

            accumObj.step(target.tex, rp, { width: target.w, height: target.h });
            live.presentUpscaled(accumObj.texture());
          } catch {
            const target = live.renderFrame(payload, { transparent, dprScale: previewScale });
            live.present(target);
          }
        } else {
          const target = live.renderFrame(payload, { transparent, dprScale: previewScale });
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
        const target = live.renderFrame(payload, { transparent, dprScale: previewScale });
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
      cells = (msg.cells instanceof Map) ? Object.fromEntries(msg.cells) : (msg.cells || {});
      building = false;
      if (live) {
        live.setAtlas(msg.pixels, msg.width, msg.height, msg.mipmaps);
        // #725: slot mask rides with the atlas when the bake produced one.
        if (msg.mask) live.setRegionMask(msg.mask, msg.width, msg.height);
      }
      break;

    case 'CAPTURE_FRAME': {
      const { reqId, width, height } = msg;
      try {
        if (!live) throw new Error('Live renderer not initialized');
        // #809 drive-by: a peek, not a tick — resolve at the current clock
        // without advancing loopTimeMs (a background-tab capture used to eat
        // up to a 100ms wall-derived dt per still).
        const frame = buildFrame(0, loopTimeMs);
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
