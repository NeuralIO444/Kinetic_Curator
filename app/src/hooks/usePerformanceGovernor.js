// usePerformanceGovernor — the Showrunner's enforcement arm.
//
// Auto-protects interactivity when FPS tanks. Strategy:
// - Track a short window of low-FPS samples; act only on sustained dips
//   with a cooldown between steps (never thrash on spikes).
// - Shed load in a DEFINED ORDER — the cut list. Order is the contract
//   (see ./governorCuts.js, pure and unit-tested):
//     cut 1: dynamic resolution scaling (renderScale 1 → 0.75 → 0.5 → 0.33)
//     cut 2: quality tier step HIGH → BALANCED → PERF
//     cut 3: mirror/gloss/ACCUM shed (independent perfTier1 mechanism, lower FPS floor)
//     cut 4: cost-aware asset thinning (drop highest-cost assets first)
//     cut 5: render-only count clamp below the PERF floor
//     cut 6: freeze motion via slowRender (a still instrument beats a dead one)
//     cut 7: watchdog hard stop (existing tier 2, manual resume)
// - Every cut is a render-only overlay: it never writes layoutParams, never
//   serializes into project JSON, and auto-clears on recovery — except the
//   hard stop, which needs manual resume (panic-key precedent, #107).
// - Phase 6 (#192): the old cuts 1–2 (FX simplify / FX bypass — the
//   fxShedLevel ladder) are REMOVED. GPU FX compositing has 10–50x headroom,
//   and the ladder caused the silent-cull trap: an FX layer shown in the UI
//   while its wrap was culled. The primary shed is dynamic resolution
//   scaling — pixels drop before anything visible is cut. If the governor
//   ever sheds, the UI says so: see ShedBadge in App.jsx (#177 owns the
//   full indicator design later).

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { nextGovernorCut } from './governorCuts.js';
import { recordGovernorEvent } from '../gl/governorEventLog.mjs';

// Hysteresis defaults (#259 — the permanent-shed-trap fix). Shed below 28,
// recover at/above 30: the two thresholds must never coincide above a
// machine's sustainable rate, or the governor walks the whole ladder and can
// never climb back. Live-overridable via the store (GOV TUNE panel); the
// setters enforce shed < recover so the trap is unrepresentable.
const DEFAULT_SHED_FPS = 28;
const DEFAULT_RECOVER_FPS = 30;
const CRITICAL_FPS = 10; // ~0 FPS: the tab is barely getting frames at all
const TIER1_FPS = 16; // shed ACCUM/gloss/mirror before things go fully critical
const SUSTAIN_MS = 1600; // must stay low this long before acting
const CRITICAL_SUSTAIN_MS = 800; // react faster — this is the worse case
const TIER1_SUSTAIN_MS = 2000; // #107 §4 spec: 2s sustained below TIER1_FPS
const COOLDOWN_MS = 8000; // don't auto-step again for a while

export function usePerformanceGovernor() {
  const fps = useStore(s => s.fps);
  const stageTimings = useStore(s => s.stageTimings);
  // #103 Track A — GPU-implied frame rate. Under vsync the rAF cadence lies:
  // the GPU can be saturated (fill-rate, ACCUM ping-pong) while FPS reads 60.
  // The live loop reports per-tick GPU time into stageTimings ('gpuFrame',
  // rolling-average ms); the governor runs its sustain windows against the
  // effective rate so a GPU-bound instrument sheds before it cliffs. Absent
  // (no live loop, no samples yet) this reduces exactly to fps.
  const gpuFrameMs = Number(stageTimings?.gpuFrame) || 0;
  const gpuFps = gpuFrameMs > 0 ? 1000 / gpuFrameMs : Infinity;
  const effFps = Math.round(Math.min(fps, gpuFps) * 10) / 10;
  // Hysteresis thresholds, live-overridable (GOV TUNE). Shed below shedFps,
  // recover at/above recoverFps — never the same number (#259).
  const shedFps = Number(useStore(s => s.governorShedFps)) || DEFAULT_SHED_FPS;
  const recoverFps = Number(useStore(s => s.governorRecoverFps)) || DEFAULT_RECOVER_FPS;
  const gpuSaturated = gpuFps < shedFps && fps >= shedFps;
  const gpuNote = gpuSaturated
    ? ` (gpu-saturated: GPU frame ${gpuFrameMs.toFixed(1)}ms ≈ ${Math.round(gpuFps)}fps)`
    : '';
  const quality = useStore(s => s.quality);
  const autoQuality = useStore(s => s.autoQuality);
  const slowRender = useStore(s => s.slowRender);
  const perfTier1 = useStore(s => s.perfTier1);
  const perfClampOverride = useStore(s => s.perfClampOverride);
  const assetThin = useStore(s => s.assetThin);
  const renderScale = useStore(s => s.renderScale);
  const setQuality = useStore(s => s.setQuality);
  const setSlowRender = useStore(s => s.setSlowRender);
  const setPerfTier1 = useStore(s => s.setPerfTier1);
  const tripWatchdog = useStore(s => s.tripWatchdog);
  const setPerfClampOverride = useStore(s => s.setPerfClampOverride);
  const setAssetThin = useStore(s => s.setAssetThin);
  const setRenderScale = useStore(s => s.setRenderScale);
  const layoutParams = useStore(s => s.layoutParams);

  const lowSinceRef = useRef(null);
  const lastActionRef = useRef(0);
  const criticalSinceRef = useRef(null);
  const tier1SinceRef = useRef(null);

  useEffect(() => {
    if (!autoQuality) {
      criticalSinceRef.current = null;
      if (slowRender) {
        setSlowRender(false);
        // Event-log only: the cut cleared (governor disabled).
        recordGovernorEvent({ type: 'restore', cutKind: 'slowRender', label: 'motion unfrozen', detail: 'autoQuality off' });
      }
      return;
    }
    if (effFps >= recoverFps) {
      criticalSinceRef.current = null;
      if (slowRender) {
        setSlowRender(false);
        // Event-log only: the cut cleared (FPS recovered past the RECOVER
        // threshold — hysteresis, #259).
        recordGovernorEvent({ type: 'restore', cutKind: 'slowRender', label: 'motion unfrozen', fps: { at: effFps, threshold: recoverFps, sustainedMs: 0 } });
      }
      return;
    }
    if (effFps >= CRITICAL_FPS) {
      criticalSinceRef.current = null;
      return;
    }
    const now = Date.now();
    if (criticalSinceRef.current == null) {
      criticalSinceRef.current = now;
      return;
    }
    if (!slowRender && now - criticalSinceRef.current >= CRITICAL_SUSTAIN_MS) {
      tripWatchdog('fps-critical');
      // Event-log only: step 7 of the shed ladder fired.
      recordGovernorEvent({
        type: 'shed', cutKind: 'watchdog', label: 'watchdog hard stop',
        fps: { at: effFps, threshold: CRITICAL_FPS, sustainedMs: CRITICAL_SUSTAIN_MS },
        detail: `FPS ${effFps} < ${CRITICAL_FPS} sustained ${CRITICAL_SUSTAIN_MS / 1000}s${gpuNote}`,
      });
      console.info('[Kinetic] Perf critical: watchdog tripped — running/evolve off (FPS below', CRITICAL_FPS + ')' + gpuNote);
    }
  }, [effFps, gpuNote, autoQuality, slowRender, tripWatchdog, setSlowRender, recoverFps]);

  // Tier 1 (#107 §4): a milder, self-clearing shed. Independent sustain
  // window from the critical tier above — this one fires first, at a higher
  // FPS floor, and never touches running/evolveMode.
  useEffect(() => {
    if (!autoQuality) {
      tier1SinceRef.current = null;
      if (perfTier1) {
        setPerfTier1(false);
        // Event-log only: the cut cleared (governor disabled).
        recordGovernorEvent({ type: 'restore', cutKind: 'perfTier1', label: 'mirror/gloss/ACCUM restored', detail: 'autoQuality off' });
      }
      return;
    }
    if (effFps >= TIER1_FPS) {
      tier1SinceRef.current = null;
      if (perfTier1) {
        setPerfTier1(false);
        // Event-log only: the cut cleared (FPS recovered).
        recordGovernorEvent({
          type: 'restore', cutKind: 'perfTier1', label: 'mirror/gloss/ACCUM restored',
          fps: { at: effFps, threshold: TIER1_FPS, sustainedMs: 0 },
        });
      }
      return;
    }
    const now = Date.now();
    if (tier1SinceRef.current == null) {
      tier1SinceRef.current = now;
      return;
    }
    if (!perfTier1 && now - tier1SinceRef.current >= TIER1_SUSTAIN_MS) {
      setPerfTier1(true);
      // Event-log only: step 3 of the shed ladder fired.
      recordGovernorEvent({
        type: 'shed', cutKind: 'perfTier1', label: 'mirror/gloss/ACCUM off',
        fps: { at: effFps, threshold: TIER1_FPS, sustainedMs: TIER1_SUSTAIN_MS },
        detail: `FPS ${effFps} < ${TIER1_FPS} sustained ${TIER1_SUSTAIN_MS / 1000}s${gpuNote}`,
      });
      console.info('[Kinetic] Perf tier1: ACCUM/gloss/mirror off (FPS below', TIER1_FPS + ')' + gpuNote);
    }
  }, [effFps, gpuNote, autoQuality, perfTier1, setPerfTier1]);

  // The cut list: ordered, one step per sustain+cooldown cycle.
  // Hysteresis (#259): shed below shedFps, recover at/above recoverFps.
  useEffect(() => {
    const healthy = !autoQuality || effFps >= recoverFps;

    // Recovery: render-only cuts auto-clear the moment the premise stops
    // holding. (The count clamp keeps its original nuance: its premise is
    // "still struggling at the lowest tier", so it also clears on tier
    // change.)
    if (healthy || quality !== 'performance') {
      if (perfClampOverride) {
        setPerfClampOverride(null);
        // Event-log only: the cut cleared (recovery or tier change).
        recordGovernorEvent({
          type: 'restore', cutKind: 'countClamp', label: 'count clamp released',
          fps: { at: effFps, threshold: recoverFps, sustainedMs: 0 },
        });
      }
    }
    if (healthy) {
      if (renderScale < 1) {
        setRenderScale(1);
        // Event-log only: the cut cleared (FPS recovered past RECOVER).
        recordGovernorEvent({
          type: 'restore', cutKind: 'renderScale', label: 'resolution → 100%',
          fps: { at: effFps, threshold: recoverFps, sustainedMs: 0 },
        });
      }
      if (assetThin) {
        setAssetThin(false);
        // Event-log only: the cut cleared (FPS recovered past RECOVER).
        recordGovernorEvent({
          type: 'restore', cutKind: 'assetThin', label: 'asset thinning released',
          fps: { at: effFps, threshold: recoverFps, sustainedMs: 0 },
        });
      }
    }

    if (!autoQuality) {
      lowSinceRef.current = null;
      return;
    }

    const now = Date.now();

    if (effFps >= shedFps) {
      lowSinceRef.current = null;
      return;
    }

    // Start / continue low window
    if (lowSinceRef.current == null) {
      lowSinceRef.current = now;
      return;
    }

    const sustained = now - lowSinceRef.current >= SUSTAIN_MS;
    const cooled = now - lastActionRef.current >= COOLDOWN_MS;

    if (!sustained || !cooled) return;

    const cut = nextGovernorCut({
      renderScale,
      quality,
      assetThin,
      perfClampOverride,
      effectiveCount: layoutParams.count,
      slowRender,
      gpuSaturated,
    });
    if (!cut) return; // ladder exhausted — hold; the watchdog is separate

    switch (cut.kind) {
      case 'renderScale': setRenderScale(cut.scale); break;
      case 'quality': setQuality(cut.quality); break;
      case 'assetThin': setAssetThin(true); break;
      case 'countClamp': setPerfClampOverride({ count: cut.count, mirror: false }); break;
      case 'slowRender': setSlowRender(true, 'cut6'); break;
      default: break;
    }
    // Event-log only: steps 1–2 / 4–6 of the shed ladder fire here.
    recordGovernorEvent({
      type: 'shed', cutKind: cut.kind, label: cut.label,
      fps: { at: effFps, threshold: shedFps, sustainedMs: SUSTAIN_MS },
      detail: `FPS ${effFps} < ${shedFps} sustained ${SUSTAIN_MS / 1000}s${gpuNote}`,
    });
    lastActionRef.current = now;
    lowSinceRef.current = null;
    console.info('[Kinetic] Showrunner cut:', cut.label, '(FPS sustained below', shedFps + ')' + gpuNote);
  }, [effFps, gpuNote, quality, autoQuality, setQuality, layoutParams.count, perfClampOverride,
    setPerfClampOverride, assetThin, setAssetThin, renderScale, setRenderScale,
    slowRender, setSlowRender, shedFps, recoverFps, gpuSaturated]);
}
