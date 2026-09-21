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
 *    a bake is in flight. The atlas is resolution-independent — a governor
 *    renderScale step rebakes only the grain LUTs, never the atlas (#265).
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
import { halfLifeToKeep } from '../components/taper.js'; // #274: fade stored as half-life frames
import { createLiveResolver } from './liveResolve.mjs';
import { createPaletteMix } from './paletteMix.mjs'; // #278: VJ MIX crossfade state machine
import { bakeLiveAtlas, bakeLiveGrainLut, comboKey } from './liveAtlas.mjs';
import { buildSceneContract } from './sceneContract.js';
import { resolvePalette } from '../data/palettes.js';
import { resolveLiveRenderState } from '../data/voices.js';
import { CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { ASSETS } from '../data/assets/index.js';
import { mergePool } from '../assets/overlay.js';
import { accumRecipeParams, applyAudioEnvelope } from './accum.mjs';
import { attachVelocities } from './velocitySmear.mjs';
import { createGpuTimer } from './debug/gpuTimer.mjs';
import { reportStage } from '../hooks/useFpsMeter.js';
import {
  createRenderFaultTracker,
  RENDER_FAULT_FAILS,
  frameFaultReason,
  bakeFaultReason,
} from './renderFault.mjs';

const CX = CANVAS_W / 2;
const CY = CANVAS_H / 2;

/**
 * #265 — the atlas is resolution-independent (asset/color combos only), so
 * render-size changes must NOT rebake it. The grain LUTs ARE baked at the
 * render size, so they get their own key. A renderScale shed step now
 * rebakes only grain — not the whole sequential-SVG atlas bake.
 */
function atlasKeyFor(combos, fxLayerIds) {
  const ck = combos.map((c) => comboKey(c.asset, c.ink, c.accent)).sort().join(';');
  return `${[...fxLayerIds].sort().join(',')}|${ck}`;
}
function grainKeyFor(fxLayerIds, w, h) {
  return `${w}x${h}|${[...fxLayerIds].sort().join(',')}`;
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

  let live = createLiveRenderer(canvas);
  const resolver = createLiveResolver();
  // #278 — VJ MIX: palette crossfade state machine (pure) + the last
  // presented frame's target (the outgoing deck snapshot source).
  const paletteMix = createPaletteMix();
  let lastFrameTarget = null;

  // #263 — WebGL context loss. The browser fires webglcontextlost when the
  // GPU session dies (tab backgrounded too long, driver hiccup, GPU reset);
  // every GL object in the session is dead from that moment, and drawing
  // with the stale handles wedges the canvas black forever. While the
  // context is down the loop holds frames (rAF keeps spinning so the
  // restore is picked up immediately) and the store's glContext flag
  // drives the MasterBar fault pill — no more silent black.
  //
  // On webglcontextrestored the whole renderer is cold-restarted through
  // the single init path (base programs + VBOs, bridge, targets,
  // textures): surgically restoring each handle would need a parallel
  // restore path per resource that drifts out of sync with init. The
  // static resources are then rebaked, which re-uploads the atlas and
  // grain textures onto the new session; targets reallocate lazily via
  // ensureTargets and the loop resumes presenting without a reload.
  let contextDown = false;
  let restoringSession = false;
  const setGlContextSafe = (v) => {
    try {
      const s = getState();
      if (s && typeof s.setGlContext === 'function') s.setGlContext(v);
    } catch { /* store gone */ }
  };
  const restartGlSession = () => {
    // Detach the dead session's bridge listeners. Do NOT call live.dispose():
    // the context loss already invalidated every GL handle, and deleting
    // those dead handles on the restored context crashes SwiftShader's GPU
    // process (observed as a spontaneous second webglcontextlost). The JS
    // wrappers are garbage-collected; the browser reclaims the dead GL
    // objects with the lost context.
    try { live.getBridge().dispose(); } catch { /* best-effort */ }
    live = createLiveRenderer(canvas);
    // Orphan any bake in flight against the dead session — its token
    // checkpoints bail at the next await boundary; nulling the bake keys
    // below makes the next tick start a fresh bake onto the new session.
    buildToken++;
    building = false;
    cells = null;
    atlasKey = null;
    grainKey = null;
    accumObj = null;
    accumActive = false;
    accumRetryAt = 0;
    gpuTimer = null;
    // #278 — the old GPU session is dead, including any held dissolve deck:
    // cancel the mix so the next palette update hard-cuts instead of
    // compositing against a dead target.
    lastFrameTarget = null;
    paletteMix.cancel();
    // #266: a fresh GPU session — don't carry the dead session's bake
    // failure streak / retry backoff into the rebake.
    bakeConsecFails = 0;
    bakeRetryAt = 0;
    contextDown = false;
    restoringSession = true;
    // Spine A (#387): reset the dt clock so the first frame after
    // restore doesn't spike from the gap during context loss.
    prevTime = 0;
    setGlContextSafe('restoring');
    // A fresh GPU session — don't carry the dead session's watchdog hard
    // stop into the rebake. The pause belonged to the old session's
    // performance; without a resume the tick's paused early-return would
    // wedge the restore forever (the "GL RESTORING" pill never clears).
    // setRunning(true) clears the watchdog stop per the #264 manual-resume
    // contract; the governor re-evaluates the new session and re-trips
    // honestly if it's still slow. A deliberate user pause (running=false
    // with no watchdog stop) is left alone.
    try {
      const st = getState();
      if (st && st.slowRenderSource === 'watchdog' && typeof st.setRunning === 'function') {
        st.setRunning(true);
      }
    } catch { /* store gone */ }
  };
  // Synchronous half of the loss path: webglcontextlost is dispatched
  // asynchronously, so a tick can land in the gap between the loss and
  // the event — drawing into the dead session then throws (e.g.
  // "framebuffer incomplete" from the target completeness check).
  // Poll isContextLost() in the tick and flag it immediately; the real
  // event still arrives afterwards and preventDefaults normally.
  const flagContextLost = () => {
    if (contextDown) return;
    contextDown = true;
    setGlContextSafe('lost');
  };
  const onCtxLost = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    flagContextLost();
  };
  const onCtxRestored = () => {
    // The bridge recompiles its own programs via its own listener; the
    // cold restart below rebuilds everything else. Guard against a stray
    // restore with no preceding loss (e.g. listener attached mid-session).
    if (!contextDown && !restoringSession) return;
    try {
      restartGlSession();
    } catch (e) {
      console.error('[gl-live] context restore failed:', e);
      contextDown = true;
      restoringSession = false;
      setGlContextSafe('lost');
    }
  };
  canvas.addEventListener('webglcontextlost', onCtxLost);
  canvas.addEventListener('webglcontextrestored', onCtxRestored);

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

  // Spine A (#387) — dt clock. prevTime tracks the last frame's timestamp;
  // loopTimeMs is the accumulated simulation time in ms (replaces Date.now()
  // as the noise/sim clock so tab-switches don't jump the field).
  // dtSec is clamped to [8, 50] ms → [0.008, 0.05] s.
  let prevTime = 0;
  let loopTimeMs = 0;

  // Static resources (atlas + grain LUTs), uploaded once per combo set.
  // cells is a plain object: "asset|tint|accent" -> {u0,v0,u1,v1}, exactly
  // what renderFrameInto's instanceData reads.
  let cells = null;
  let atlasKey = null;
  let grainKey = null;
  let building = false;
  let buildToken = 0;
  let svgPool = null; // Map asset id -> svg fragment, rebuilt on customAssets change
  let svgPoolRef = null;

  // ACCUM session state.
  let accumObj = null;
  let accumActive = false;
  let accumFrozen = false;
  let lastAccumOn = false;
  // #309 velocity smear: per-instance position history (layer|key) for the
  // frame-to-frame displacement attached as vx/vy. Cleared whenever the
  // ACCUM session ends so re-enabling starts at zero velocity.
  let velPrev = new Map();
  // #268 SWELL: breathe the trail length out and back over ~2s. A timestamp,
  // not a flag — the envelope derives from wall-clock in buildFrame, so the
  // gesture can't stick if a frame is dropped mid-swell.
  let swellStart = 0;
  const swellEnvelope = () => {
    if (!swellStart) return 0;
    const p = (performance.now() - swellStart) / 2000;
    if (p >= 1) { swellStart = 0; return 0; }
    return Math.sin(Math.PI * p);
  };
  // Fault isolation: a persistent ACCUM failure must never freeze the live
  // canvas. On fault the session is torn down, the frame falls back to plain
  // rendering, and re-enable is deferred by a short cooldown (avoids a
  // per-frame shader-recompile storm when enable itself is what throws).
  let accumRetryAt = 0;
  let lastAccumErrTs = 0;
  const noteAccumFault = (e) => {
    try { live.dropAccum(); } catch { /* already torn down */ }
    accumObj = null;
    accumActive = false;
    velPrev.clear(); // #309: the retry starts at zero velocity
    accumRetryAt = performance.now() + 2000;
    const now = performance.now();
    if (now - lastAccumErrTs > 5000) {
      console.error('[gl-live] ACCUM fault — falling back to plain render:', e);
      lastAccumErrTs = now;
    }
  };

  let lastErrTs = 0;
  let lastNodeCount = -1;

  // #266 — deterministic render-fault tracking. A single transient throw is
  // not a fault: the RENDER FAULT pill trips only after consecutive failed
  // ticks, and clears only after a sustained run of clean presents (or a
  // reload). The store write happens only on transitions — the loop never
  // re-renders React per frame.
  const renderFault = createRenderFaultTracker((on, reason) => {
    try { getState().setRenderFault(on, reason); } catch { /* store gone */ }
  });

  // #266 — atlas-bake failure state. A deterministic bake failure (e.g. an
  // unrasterizable custom asset) used to retry on the very next tick with a
  // bare console.error: an infinite rebuild loop with unthrottled spam and a
  // permanent blank canvas. Now the log is throttled, retries back off
  // exponentially, and after RENDER_FAULT_FAILS consecutive failures the
  // fault surfaces as a sticky RENDER FAULT pill.
  let bakeConsecFails = 0;
  let bakeRetryAt = 0;
  let lastBakeErrTs = 0;

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
   *
   * Spine A (#387): dtSec and loopTimeMs drive the particle physics clock.
   */
  function buildFrame(dtSec = 1 / 60, loopTimeMs = 0) {
    const s = getState();
    const life = lifeRef?.current || {};
    // #280: during a voice MIX the loop renders the interpolated blend,
    // not the raw committed state — no hard jumps on voice switches.
    const voiceState = resolveLiveRenderState(s);
    const layoutParams = voiceState.layoutParams || {};

    // #278 — VJ MIX: detect palette changes once per frame and drive the
    // crossfade state machine. On a fresh 'start' the outgoing deck is
    // snapshotted from the last presented frame BEFORE anything renders
    // the incoming palette; a retargeted switch re-uses the original held
    // frame (DJ re-base) so rapid switches converge without stacking.
    const mixEv = paletteMix.update({
      id: s.paletteId,
      overrides: s.paletteOverrides,
      userPalettes: s.userPalettes,
      mixSeconds: s.paletteMixSeconds,
      now: performance.now(),
      canDissolve: frameCount > 0 && !!lastFrameTarget && !contextDown,
      bakeReady: !building && !!cells,
    });
    if (mixEv.kind === 'start' && !mixEv.retarget) {
      if (!live.snapshotHoldFrame(lastFrameTarget)) paletteMix.cancel();
    }

    const resolved = resolver.resolveLayers({
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      layerSnapshots: s.layerSnapshots,
      seed: s.seed,
      seedOffsets: s.seedOffsets,
      paletteId: voiceState.paletteId,
      paletteOverrides: voiceState.paletteOverrides,
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
      // Spine A (#387): dt clock — loop-owned time, not Date.now().
      dtSec,
      loopTimeMs,
    });

    // Node-count instrumentation (footer readout), store-owned.
    let nodes = 0;
    for (const r of resolved) if (!r.isFx) nodes += r.items?.length || 0;
    if (nodes !== lastNodeCount) {
      lastNodeCount = nodes;
      try { s.setNodeCount(nodes); } catch { /* store gone */ }
    }

    const contract = buildSceneContract({
      doc: { seed: s.seed, seedOffsets: s.seedOffsets, quality: s.quality, layers: s.layers },
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

    // #309 velocity smear: per-frame displacement in final rendered scene
    // units, attached as vx/vy for the trail system (QUAD_VS stretches each
    // quad along its own motion). Only while an ACCUM session is active —
    // plain rendering never sees vx/vy and is unchanged. Gated on
    // accumActive (not just accumOn) so the enable tick starts at zero
    // velocity instead of diffing against a stale session's history.
    if (!!layoutParams.accumulation && !s.perfTier1 && accumActive) {
      attachVelocities(contract.instances, velPrev);
    }

    // Static resources: atlas combos from the transformed instances, grain
    // LUTs keyed by FX layer id + render size (what renderFrameInto's
    // auxFor reads). The atlas key excludes the render size — it is
    // resolution-independent, so a governor renderScale step rebakes grain
    // only (#265).
    const combos = contract.instances.map((it) => ({ asset: it.asset, ink: it.tint, accent: it.accent }));
    const fxLayerIds = new Set((contract.fxWraps || []).map((w) => w.fxLayerId));

    const renderScale = Math.min(1, Math.max(0.1, s.renderScale || 1));
    const rw = Math.max(2, Math.round(CANVAS_W * renderScale));
    const rh = Math.max(2, Math.round(CANVAS_H * renderScale));

    const aKey = atlasKeyFor(combos, fxLayerIds);
    const gKey = grainKeyFor(fxLayerIds, rw, rh);
    if ((aKey !== atlasKey || gKey !== grainKey) && !building && performance.now() >= bakeRetryAt) {
      startStaticBuild(combos, fxLayerIds, rw, rh, aKey, gKey);
    }
    // Spine B (#388): never return null just because a bake is in flight.
    // Keep resolving + simulating + presenting last-good atlas cells.
    // New combos simply do not draw until baked (renderer.mjs skips them).
    // Only return null on initial boot before ANY atlas has finished baking.
    if (!cells) return null;

    const activePalette = resolvePalette(voiceState.paletteId, voiceState.paletteOverrides, s.userPalettes);
    const bgCss = bgMode === 'white' ? '#ffffff' : bgMode === 'transparent' ? null : activePalette.bg;

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
        // #274: fade is trail half-life in frames — convert to keep at the
        // boundary. #268: SWELL breathes the half-life toward 40 frames and
        // back on a timestamped envelope, so it can't stick at full swell.
        fade: halfLifeToKeep((layoutParams.accumulationFade ?? 5.4)
          + swellEnvelope() * (40 - (layoutParams.accumulationFade ?? 5.4))),
        optics: layoutParams.accumulationOptics,
        tunnel: layoutParams.accumulationTunnel,
        prism: layoutParams.accumulationPrism,
        flow: layoutParams.accumulationFlow, // #284: exposed via the FLOW slider
      },
      audioBands: s.audioBands,
      audioOn: !!s.audioEnabled,
      // #306: the audio→glow fader (STIMULI panel) — scales only the glow
      // gesture of the envelope mapping, so loud passages can't wash out
      // the render at high optics. The headroom-relative form (#303) is
      // untouched.
      audioSwell: s.layoutParams.audioSwell ?? 1,
      glow: life.glow ?? 0,
      paused: !s.running,
      // #278 — eased dissolve factor for this frame (null when no dissolve
      // is running: render + present the incoming palette directly).
      mix: mixEv.kind === 'mix' ? mixEv.t : null,
    };
  }

  async function startStaticBuild(combos, fxLayerIds, rw, rh, aKey, gKey) {
    building = true;
    const token = ++buildToken;
    try {
      const svgById = getPool(getState().customAssets);
      // #265 — rebake only what changed: the atlas is resolution-
      // independent, so a renderScale step skips the heavy sequential-SVG
      // bake and only the (cheap) grain LUTs rebuild.
      if (aKey !== atlasKey) {
        const atlas = await bakeLiveAtlas(combos, svgById);
        if (token !== buildToken) return; // superseded
        live.setAtlas(atlas.pixels, atlas.width, atlas.height, atlas.mipmaps);
        cells = Object.fromEntries(atlas.cells);
        atlasKey = aKey;
      }
      if (gKey !== grainKey) {
        const luts = {};
        for (const id of fxLayerIds) {
          luts[id] = await bakeLiveGrainLut(rw, rh);
          if (token !== buildToken) return;
        }
        if (token !== buildToken) return;
        live.setGrainLuts(luts);
        grainKey = gKey;
      }
      if (token !== buildToken) return;
      bakeConsecFails = 0; // #266 — a good bake resets the failure streak
    } catch (e) {
      // #266 — the failure is deterministic until the inputs change, so
      // retrying every tick just floods the console: throttle the log,
      // back off exponentially, and surface it as a sticky RENDER FAULT
      // pill after a few consecutive failures instead of a permanent blank
      // canvas with no signal.
      bakeConsecFails++;
      bakeRetryAt = performance.now() + Math.min(8000, 250 * 2 ** (bakeConsecFails - 1));
      const now = performance.now();
      if (now - lastBakeErrTs > 5000) {
        console.error('[gl-live] static build failed:', e);
        lastBakeErrTs = now;
      }
      if (bakeConsecFails >= RENDER_FAULT_FAILS) {
        renderFault.noteExternalFault(bakeFaultReason(e));
      }
    } finally {
      if (token === buildToken) building = false;
    }
  }

  // #278 — VJ MIX render helper. Renders the incoming palette, then
  // dissolves it over the held outgoing deck while a palette crossfade
  // runs. The mixed frame feeds ACCUM / present exactly like a normal
  // frame, so trails stay coherent and the governor sees honest per-frame
  // cost. Defined once per loop (not per tick): no per-frame allocation.
  function renderMixedFrame(payload, useTransparent, mix) {
    const toTarget = live.renderFrame(payload, { transparent: useTransparent });
    let outTarget = toTarget;
    if (typeof mix === 'number') {
      const { target: mixed, resized } = live.mixWithHold(toTarget, mix);
      if (resized) {
        // Deck targets reallocated mid-dissolve (render size changed) —
        // the held frame is blank; cancel rather than dissolve black.
        paletteMix.cancel();
      } else {
        outTarget = mixed;
      }
    }
    lastFrameTarget = outTarget;
    return outTarget;
  }

  function tick() {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    // #263: GPU session down — hold frames (and keep rAF spinning so the
    // restore is picked up immediately). The glContext flag drives the
    // MasterBar fault pill while we hold. isContextLost() is polled
    // synchronously to cover the gap before webglcontextlost is dispatched.
    if (contextDown || live.getGL().isContextLost()) {
      flagContextLost();
      return;
    }
    // Spine A (#387) — dt clock. Compute dtSec from the real frame delta,
    // clamped to [8, 50] ms so a tab-switch or GC stall can't spike the
    // physics into a single huge step. Accumulate loopTimeMs so the noise
    // field progresses in simulation time, not wall time — a tab that was
    // backgrounded for 30 s resumes where it left off instead of jumping.
    const now = performance.now();
    if (prevTime === 0) prevTime = now; // first frame after start/restore
    const rawDtMs = now - prevTime;
    prevTime = now;
    const clampedDtMs = Math.max(8, Math.min(50, rawDtMs));
    const dtSec = clampedDtMs / 1000;
    loopTimeMs += clampedDtMs;

    try {
      const frame = buildFrame(dtSec, loopTimeMs);
      if (!frame) {
        // Cold boot: atlas not baked yet (!cells). Roll back loopTimeMs since frame did not simulate/present.
        loopTimeMs -= clampedDtMs;
        return;
      }

      const { payload, transparent, bgCss, accumOn, accumFrozen: frozen, accumParams, audioBands, audioOn, audioSwell, glow, paused, mix } = frame;

      if (paused) {
        // Spine B (#388): paused holds the last presented frame; roll back loopTimeMs since physics did not step.
        loopTimeMs -= clampedDtMs;
        return;
      }

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
            // Enable can fail (GL error during compile/begin). A persistent
            // ACCUM fault must never freeze the live canvas: tear down, fall
            // back to plain rendering, and retry after a short cooldown so a
            // hard failure can't turn into a per-frame recompile storm.
            if (performance.now() >= accumRetryAt) {
              try {
                accumObj = live.ensureAccum(payload.width, payload.height);
                accumObj.begin(bgCss);
                accumActive = true;
              } catch (e) {
                noteAccumFault(e);
              }
            }
          }
          lastAccumOn = true;
          if (frozen && accumObj) {
            // FREEZE: hold the feedback image, skip render + step.
            // #309: the pair is half-res — present upscaled.
            live.presentUpscaled(accumObj.texture());
          } else if (accumObj) {
            try {
              // #309: a dprScale change rebuilds the feedback pair at the
              // new ratio — re-begin it so trails restart cleanly.
              const fresh = live.ensureAccum(payload.width, payload.height);
              if (fresh !== accumObj) {
                accumObj = fresh;
                accumObj.begin(bgCss);
              }
              const target = renderMixedFrame(payload, true, mix);
              const bands = audioBands || { rms: 0, beatPulse: 0 };
              // Silence is a true no-op: the envelope passes params through at 0.
              // #306: the bands are already shaped by the ballistics follower
              // (useAudioInput); swell scales the glow gesture only.
              // #287 fade-to-paper: the fade target follows the scene bg.
              const rp = applyAudioEnvelope(accumRecipeParams({ ...accumParams, background: bgCss }), {
                rms: audioOn ? bands.rms || 0 : 0,
                flux: 0,
                beatPulse: audioOn ? bands.beatPulse || 0 : 0,
              }, { swell: audioSwell ?? 1 });
              // #309: the frame is backing-store sized; the pair is logical.
              accumObj.step(target.tex, rp, { width: target.w, height: target.h });
              live.presentUpscaled(accumObj.texture());
            } catch (e) {
              noteAccumFault(e);
              // Fall back to plain rendering so the canvas keeps moving.
              const target = renderMixedFrame(payload, transparent, mix);
              live.present(target);
            }
          } else {
            // ACCUM unavailable this frame (enable failed or cooling down).
            const target = renderMixedFrame(payload, transparent, mix);
            live.present(target);
          }
        } else {
          if (lastAccumOn) {
            live.dropAccum();
            accumObj = null;
            accumActive = false;
            velPrev.clear(); // #309: the next session starts at zero velocity
            // #268: the session ended — reset the loop's own frozen flag
            // (not the frame's read-only copy), or re-enabling ACCUM shows
            // no trails while the panel reads inactive (two-press FREEZE trap).
            accumFrozen = false;
          }
          lastAccumOn = false;
          const target = renderMixedFrame(payload, transparent, mix);
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
      // #266 — the tick presented cleanly; counts toward honest recovery.
      // Ticks that return early (bake in flight / paused) never reach here,
      // so they neither trip nor clear the fault — only real presents count.
      renderFault.noteCleanPresent();
      // #263: the first clean present after a context restore proves the
      // new session is actually drawing — only now does the scene count as
      // back, so the GL RESTORING pill clears here, not at bake completion.
      // (If the context dropped again mid-restore, hold the pill for the
      // new outage.)
      if (restoringSession && !contextDown) {
        restoringSession = false;
        setGlContextSafe('ok');
      }
    } catch (e) {
      // Never let a bad frame kill the loop; throttle the noise.
      // #266 — track consecutive failures so a deterministic fault surfaces
      // as a RENDER FAULT pill instead of a silently frozen canvas.
      renderFault.noteFrameFailure(frameFaultReason(e));
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
    // #263: never hand back black pixels from a dead GPU session — the
    // caller surfaces this instead of a silently blank export.
    // isContextLost() covers the gap before webglcontextlost dispatches.
    if (contextDown || live.getGL().isContextLost()) {
      flagContextLost();
      throw new Error('[gl-live] GPU context lost — capture unavailable until the context is restored');
    }
    if (building) throw new Error('[gl-live] textures baking — wait a moment and retry');
    const frame = buildFrame();
    if (!frame) throw new Error('[gl-live] textures baking — wait a moment and retry');
    const { payload, transparent, accumOn } = frame;

    if (accumOn && accumActive && accumObj) {
      // Capture the actual feedback image at live size, then upscale in 2D.
      // #267: the trail buffer only exists at the live render size, so this
      // upscale is disclosed to the caller (upscaledFrom) instead of being
      // sold as a true 2× — the print desk labels it honestly.
      const tex = accumObj.texture();
      const livePixels = live.readback(tex, payload.width, payload.height);
      const up = upscaleIfNeeded(livePixels, payload.width, payload.height, width, height);
      const upscaled = up.width !== payload.width || up.height !== payload.height;
      return { ...up, upscaledFrom: upscaled ? { width: payload.width, height: payload.height } : null };
    }
    // #267: offscreen targets at the capture size — the live canvas is never
    // resized, so no flash and no mid-stream resolution jump for recordings.
    // #270: export resolution is exact — no display-DPR multiplier here.
    const pixels = live.renderFrameOffscreen({ ...payload, width, height }, { transparent });
    return { pixels, width, height, upscaledFrom: null };
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
    canvas.removeEventListener('webglcontextlost', onCtxLost);
    canvas.removeEventListener('webglcontextrestored', onCtxRestored);
    paletteMix.cancel();
    lastFrameTarget = null;
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
    swellAccum: () => { swellStart = performance.now(); },
    captureFrame,
    waitForSettled,
    waitForReady,
    getCanvas: () => canvas,
    isBuilding: () => building,
    clearAccum() {
      if (accumObj && accumActive) {
        const s = getState();
        const voiceState = resolveLiveRenderState(s);
        const activePalette = resolvePalette(voiceState.paletteId, voiceState.paletteOverrides, s.userPalettes);
        accumObj.begin(bgMode === 'white' ? '#ffffff' : activePalette.bg);
      }
    },
  };
}
