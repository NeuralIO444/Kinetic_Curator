// usePerformanceGovernor — the Showrunner's enforcement arm.
//
// Auto-protects interactivity when FPS tanks. Strategy:
// - Track a short window of low-FPS samples; act only on sustained dips
//   with a cooldown between steps (never thrash on spikes).
// - Shed load in a DEFINED ORDER — the cut list. Order is the contract
//   (see ./governorCuts.js, pure and unit-tested):
//     cut 1: dynamic resolution scaling (renderScale 1 → 0.75 → 0.5 → 0.33)
//     cut 1.45: spectral feedback warp (#1490 — after mark weather, before the population)
//     cut 1.47: selective ACCUM feed (#1806 slice 2 — subset render drops to the composite path)
//     cut 1.48: ember steering (#1837 — the moths stop grazing the trail grid; the population stays)
//     cut 1.5: creature count (#1694 S2 — population sheds before finishes)
//     cut 1.6: travel (#1574 — FLOW marks settle home; after the population, ahead of the tier)
//     cut 2: quality tier step HIGH → BALANCED → PERF
//     cut 3: mirror/gloss/ACCUM shed (independent perfTier1 mechanism, lower FPS floor)
//     cut 4: cost-aware asset thinning (drop highest-cost assets first)
//     cut 5: render-only count clamp below the PERF floor
//     cut 6: freeze motion via slowRender (a still instrument beats a dead one)
//     cut 7: watchdog hard stop (existing tier 2, manual resume) —
//       #1919 ladder-first (Matt's ruling): the critical effect below
//       arms ONLY once the ladder is exhausted; while a rung remains,
//       the pause waits for the sheds, at the ladder's own cadence.
//       Two hang-class carve-outs bypass the gate by design (the poll
//       below): a frozen frame ('fps-stalled') and a loop-time crawl
//       ('fps-crawl', Option B) — neither is a perf problem the ladder
//       sheds its way out of.
// - Every cut is a render-only overlay: it never writes layoutParams, never
//   serializes into project JSON, and auto-clears on recovery — except the
//   hard stop, which needs manual resume (panic-key precedent, #107).
// - Phase 6 (#192): the old cuts 1–2 (FX simplify / FX bypass — the
//   fxShedLevel ladder) are REMOVED. GPU FX compositing has 10–50x headroom,
//   and the ladder caused the silent-cull trap: an FX layer shown in the UI
//   while its wrap was culled. The primary shed is dynamic resolution
//   scaling — pixels drop before anything visible is cut. If the governor
//   ever sheds, the UI says so: see TapeCounter in MasterBar.jsx (the
//   merged readout — #295 built it, #177/#483 own the design).

import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../state/store.js';
import {
  nextGovernorCut,
  isGpuBinding,
  GOVERNOR_RESTORE_CUTS,
  watchdogMayTrip,
  frameStalled,
  FRAME_STALL_MS,
  measureLoopRate,
  CRAWL_WINDOW_MS,
  CRAWL_MAX_LOOP_RATIO,
  effectiveGovernorFps,
} from './governorCuts.js';
import { getFrameDeltas, clearFrameDeltas } from './useFpsMeter.js';
import { recordGovernorEvent, CUT_KINDS } from '../gl/governorEventLog.mjs';
import { feedbackWarpAmount } from '../gl/spectrumWarp.mjs';
import { accumFeedSelection } from '../gl/renderer.mjs';
import { trailEmberWeight } from '../data/presets.js';

// #1574 — the event log's ladder map (gl/governorEventLog.mjs SHED_STEPS)
// predates the content rungs: it knows neither 'creatureCount' (cut 1.5)
// nor 'travel' (cut 1.6) — nor 'feedbackWarp' (cut 1.45, #1490),
// 'markWeather' (cut 1.4) or 'accumFeed' (cut 1.47, #1806) — and
// recordGovernorEvent throws on an unknown
// kind — inside this effect, at the moment a shed fires. Guard the two
// generic record sites below so a rung the log has not learned can never
// crash the governor; the shed itself, the badge (shedSummary) and the
// restore all still happen. Extending the log's map is a follow-up.
const LOG_KNOWN_KINDS = new Set(CUT_KINDS);
const recordCutEvent = (e) => {
  if (LOG_KNOWN_KINDS.has(e.cutKind)) recordGovernorEvent(e);
};

// Hysteresis defaults (#259 — the permanent-shed-trap fix). Shed below 28,
// recover at/above 30: the two thresholds must never coincide above a
// machine's sustainable rate, or the governor walks the whole ladder and can
// never climb back. Live-overridable via the store (GOV TUNE panel); the
// setters enforce shed < recover so the trap is unrepresentable.
const DEFAULT_SHED_FPS = 28;
const DEFAULT_RECOVER_FPS = 30;
const CRITICAL_FPS = 10; // ~0 FPS: the tab is barely getting frames at all
const TIER1_FPS = 16; // shed ACCUM/gloss/mirror before things go fully critical
const TIER1_RECOVER_FPS = 20; // #265 — restore ABOVE the shed floor: fps
// hovering at 16 must not destroy and rebuild the ACCUM feedback buffer
// every couple of seconds (the single-threshold flap #260 fixed on the
// main ladder).
const SUSTAIN_MS = 1600; // must stay low this long before acting
const CRITICAL_SUSTAIN_MS = 800; // react faster — this is the worse case
const TIER1_SUSTAIN_MS = 2000; // #107 §4 spec: 2s sustained below TIER1_FPS
const COOLDOWN_MS = 8000; // don't auto-step again for a while
const STALL_POLL_MS = 250; // #1919 carve-outs: how often the frozen-frame + crawl checks wake

export function usePerformanceGovernor() {
  const fps = useStore((s) => s.fps);
  const stageTimings = useStore((s) => s.stageTimings);
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
  const shedFps = Number(useStore((s) => s.governorShedFps)) || DEFAULT_SHED_FPS;
  const recoverFps = Number(useStore((s) => s.governorRecoverFps)) || DEFAULT_RECOVER_FPS;
  // #265 — cut 1 (resolution) may fire when the GPU-implied rate is the
  // binding constraint: at/below the rAF rate AND below the shed floor —
  // including when BOTH are bad, the case where dropping pixels is what
  // buys frames back. See isGpuBinding in governorCuts.js.
  const gpuSaturated = isGpuBinding(fps, gpuFps, shedFps);
  const gpuNote = gpuSaturated
    ? ` (gpu-saturated: GPU frame ${gpuFrameMs.toFixed(1)}ms ≈ ${Math.round(gpuFps)}fps)`
    : '';
  const quality = useStore((s) => s.quality);
  const qualityShedFrom = useStore((s) => s.qualityShedFrom);
  const setQualityShedFrom = useStore((s) => s.setQualityShedFrom);
  const clearWatchdogReason = useStore((s) => s.clearWatchdogReason);
  const autoQuality = useStore((s) => s.autoQuality);
  const slowRender = useStore((s) => s.slowRender);
  const slowRenderSource = useStore((s) => s.slowRenderSource);
  const perfTier1 = useStore((s) => s.perfTier1);
  // #655 — e2e test hook: a page can force the governor off before the app
  // boots (page.addInitScript sets window.__KC_GOVERNOR_OFF = true). Shed
  // cuts are render-only overlays driven by wall-clock FPS, so under CI load
  // they contaminate node-count assertions with nondeterminism. This flag is
  // only ever set by tests; it never appears in the product surface.
  const governorTestOff = typeof window !== 'undefined' && window.__KC_GOVERNOR_OFF === true;
  const governorArmed = autoQuality && !governorTestOff;
  const perfClampOverride = useStore((s) => s.perfClampOverride);
  const assetThin = useStore((s) => s.assetThin);
  const renderScale = useStore((s) => s.renderScale);
  const setQuality = useStore((s) => s.setQuality);
  const setSlowRender = useStore((s) => s.setSlowRender);
  const setPerfTier1 = useStore((s) => s.setPerfTier1);
  const tripWatchdog = useStore((s) => s.tripWatchdog);
  const setPerfClampOverride = useStore((s) => s.setPerfClampOverride);
  const setAssetThin = useStore((s) => s.setAssetThin);
  const setRenderScale = useStore((s) => s.setRenderScale);
  const fxaa = useStore((s) => s.fxaa);
  const fxaaShed = useStore((s) => s.fxaaShed);
  const setFxaaShed = useStore((s) => s.setFxaaShed);
  // #1694 S2 — the creature rung: the artist's count and the shed overlay.
  // S3 — the count is the BUILD param `creatures`; it derives from the layoutParams
  // selection below (the governor state's creatureCount field keeps its shape, so
  // governorCuts' shed/restore contract is untouched).
  const creatureShed = useStore((s) => s.creatureShed);
  const setCreatureShed = useStore((s) => s.setCreatureShed);
  const layoutParams = useStore((s) => s.layoutParams);
  const creatureCount = layoutParams?.creatures ?? 0;
  // #1574 — the travel rung: the shed overlay, and whether travel is live
  // on the scene (FLOW with a leash — the same gate buildPlacements runs).
  // #1575 — PATH scenes are travel too: the same rung sheds them (marks
  // settle/freeze home) ahead of quality and the motion freeze.
  // #1575 Q4 (ruled 2026-10-20) — travel is PER-STRATUM, so the rung's
  // sensor reads every stratum, not just the active one: the live params
  // (the active stratum's) plus each stratum's snapshot params. A stratum
  // travels when its mode is flow/path and its leash — defaults-merged
  // exactly as the resolver merges it — is above 0. The rung itself, its
  // order and the shed overlay are unmoved; only the sensor's scope
  // matches the per-stratum mechanism. (Snapshots exist only for KC
  // strata, so the snapshot scan is the non-active strata by construction.)
  // #1923 — the DISH LIFE rung (cut 1.39, first after the pixel trim): the shed overlay (0 live, 1 trickle, 2 held),
  // and whether a culture is awake (the loop publishes it) — no awake culture, no rung.
  const dishLifeShed = useStore((s) => s.dishLifeShed);
  const setDishLifeShed = useStore((s) => s.setDishLifeShed);
  const dishLifeActive = useStore((s) => s.dishLifeAwake);
  // #1997 — the FERROFLUID rung (cut 1.395, right after its sibling the culture): the shed
  // overlay (an index into the kernel's rung ladder — steps, then resolution, then held), and
  // whether a fluid is awake (the loop publishes it) — no awake fluid, no rung.
  const dishFluidShed = useStore((s) => s.dishFluidShed);
  const setDishFluidShed = useStore((s) => s.setDishFluidShed);
  const dishFluidActive = useStore((s) => s.dishFluidAwake);
  const travelShed = useStore((s) => s.travelShed);
  const setTravelShed = useStore((s) => s.setTravelShed);
  // #1576 — P3's siblings are travel too: a scene whose only travel is
  // surge or parallax drift (either amount up, any transport mode) is
  // live for this rung, and the same shed holds them (surge dies,
  // drift presents home — engine/surge.js, engine/parallaxDrift.js).
  const layerSnapshots = useStore((s) => s.layerSnapshots);
  const activeLayerId = useStore((s) => s.activeLayerId);
  const stratumTravels = (p) =>
    !!p &&
    (((p.transport === 'flow' || p.transport === 'path') && (p.transportLeash ?? 112) > 0) ||
      (p.transportSurge ?? 0) > 0 ||
      (p.transportParallax ?? 0) > 0);
  const travelActive =
    stratumTravels(layoutParams) ||
    Object.entries(layerSnapshots || {}).some(
      ([id, snap]) => id !== activeLayerId && stratumTravels(snap?.layoutParams),
    );
  // #1627 S1 — the mark-weather rung (cut 1.4, FIRST): the shed overlay,
  // and whether weather can be live on this scene — a measured spawn
  // source is present: the sun's spec pool (a lit sun with spec up),
  // the dish (density peaks + contacts), or traveling marks (travel
  // live). No source, no weather, no rung.
  const weatherShed = useStore((s) => s.weatherShed);
  const setWeatherShed = useStore((s) => s.setWeatherShed);
  // #1490 — the feedback warp rung (cut 1.45): the shed overlay, and whether
  // the warp is live on this scene — an FX layer carries a feedbackWarp item
  // with amount > 0 (gl/spectrumWarp.mjs reads the FX strata), ACCUM is on
  // (no feedback buffer, no warp), and the tier-1 shed has not already
  // killed the feedback chain the warp rides.
  const feedbackWarpShed = useStore((s) => s.feedbackWarpShed);
  const setFeedbackWarpShed = useStore((s) => s.setFeedbackWarpShed);
  const layers = useStore((s) => s.layers);
  const feedbackWarpActive = feedbackWarpAmount(layers, false) > 0 && !!layoutParams?.accumulation && !perfTier1;
  // #1806 slice 2 — the accum-feed rung (cut 1.47): the shed overlay, and
  // whether a selective feed is live on this scene — a feed-capable
  // stratum is flagged off (the renderer's own derivation, run over the
  // store layers so the sensor and the recipe can never disagree about
  // who feeds), ACCUM is on (no buffer, no feed), and the tier-1 shed
  // has not already killed the buffer the feed runs into.
  const accumFeedShed = useStore((s) => s.accumFeedShed);
  const setAccumFeedShed = useStore((s) => s.setAccumFeedShed);
  const accumFeedActive =
    !!layoutParams?.accumulation &&
    !perfTier1 &&
    accumFeedSelection({ layers, compositeOrder: (layers || []).map((l) => l && l.id) }) !== null;
  // #1837 — the ember-steering rung (cut 1.48): the shed overlay, and whether
  // steering is live on this scene — the current look declares an ember
  // weight (data/presets.js reads the `composition` param's look), creatures
  // may exist, ACCUM is on (no buffer, no grid), and the tier-1 shed has not
  // already killed the buffer the grid reads.
  const trailSteerShed = useStore((s) => s.trailSteerShed);
  const setTrailSteerShed = useStore((s) => s.setTrailSteerShed);
  const trailSteerActive =
    trailEmberWeight(layoutParams?.composition) > 0 &&
    (layoutParams?.creatures ?? 0) > 0 &&
    !!layoutParams?.accumulation &&
    !perfTier1;
  const light = useStore((s) => s.light);
  const weatherActive =
    !!(light && (light.spec ?? 0) > 0 && (light.intensity ?? 0) > 0) || layoutParams?.dish === true || travelActive;
  // #263 — while a context restore is in flight the FPS reading is
  // meaningless (no frames present during the rebake); don't let the
  // watchdog trip on the new session before it has drawn anything.
  const glContext = useStore((s) => s.glContext);

  const lowSinceRef = useRef(null);
  const lastActionRef = useRef(0);
  const criticalSinceRef = useRef(null);
  const tier1SinceRef = useRef(null);

  // #1919 — the ladder snapshot, built once per render: the ladder
  // effect applies its cuts from this object and the watchdog gate
  // reads eligibility from the SAME object, so the two can never
  // disagree about whether a rung remains. The gate itself is pure
  // (governorCuts.watchdogMayTrip): it answers whether the watchdog
  // may run its trip window at this rate — false while the ladder
  // still has a rung it is eligible to apply, true once the ladder is
  // exhausted (or tuned out of play at this rate).
  const ladderQuery = useMemo(
    () => ({
      fxaa: fxaa !== false && !fxaaShed,
      renderScale,
      quality,
      assetThin,
      perfClampOverride,
      effectiveCount: layoutParams?.count,
      creatureCount,
      creatureShed,
      dishLifeActive,
      dishLifeShed,
      dishFluidActive,
      dishFluidShed,
      weatherActive,
      weatherShed,
      feedbackWarpActive,
      feedbackWarpShed,
      accumFeedActive,
      accumFeedShed,
      trailSteerActive,
      trailSteerShed,
      travelActive,
      travelShed,
      slowRender,
      gpuSaturated,
    }),
    [
      fxaa,
      fxaaShed,
      renderScale,
      quality,
      assetThin,
      perfClampOverride,
      layoutParams,
      creatureCount,
      creatureShed,
      dishLifeActive,
      dishLifeShed,
      dishFluidActive,
      dishFluidShed,
      weatherActive,
      weatherShed,
      feedbackWarpActive,
      feedbackWarpShed,
      accumFeedActive,
      accumFeedShed,
      trailSteerActive,
      trailSteerShed,
      travelActive,
      travelShed,
      slowRender,
      gpuSaturated,
    ],
  );
  const watchdogMayTripNow = watchdogMayTrip(ladderQuery, { effFps, shedFps });

  useEffect(() => {
    // #264 — clear a motion freeze, logging the restore under the cutKind
    // the flap detector can pair with the shed: 'watchdog' for the hard
    // stop, 'slowRender' for the cut-6 soft freeze. Clearing the hard stop
    // also clears the badge's reason so the indicator can return to clean.
    const clearFreeze = (detail) => {
      const kind = slowRenderSource === 'watchdog' ? 'watchdog' : 'slowRender';
      setSlowRender(false);
      if (kind === 'watchdog') clearWatchdogReason();
      recordGovernorEvent({
        type: 'restore',
        cutKind: kind,
        label: kind === 'watchdog' ? 'watchdog hard stop cleared' : 'freeze frame off — motion back',
        ...(detail ? { detail } : {}),
        fps: { at: effFps, threshold: recoverFps, sustainedMs: 0 },
      });
    };
    if (!governorArmed) {
      criticalSinceRef.current = null;
      // Governor disabled: overlays clear. The cut-6 soft freeze clears via
      // the declarative restore table (healthy covers !governorArmed); this
      // path covers the watchdog hard stop, which the table deliberately
      // never auto-clears.
      if (slowRender && slowRenderSource === 'watchdog') clearFreeze('autoQuality off');
      return;
    }
    // #264 — the watchdog hard stop NEVER auto-clears on FPS recovery; it
    // needs manual resume (Space/RUN clears it in setRunning). Only the
    // cut-6 soft freeze auto-clears, in the restore table below.
    // #263 — a context restore is in flight (glContext 'lost'/'restoring'):
    // FPS is meaningless while the new session rebakes, so hold the
    // watchdog instead of tripping on the session before it draws.
    if (glContext !== 'ok') {
      criticalSinceRef.current = null;
      return;
    }
    if (effFps >= recoverFps) {
      criticalSinceRef.current = null;
      return;
    }
    if (effFps >= CRITICAL_FPS) {
      criticalSinceRef.current = null;
      return;
    }
    // #1919 — ladder-first (Matt's ruling): while the shed ladder still
    // has a rung it is eligible to apply, the critical window does not
    // run — the watchdog waits for the ladder, whose own cadence (the
    // sustain + cooldown in the ladder effect below) governs how fast
    // the rungs land. Holding the window at null means the 800 ms is
    // measured from exhaustion: once the ladder is exhausted and the
    // rate remains below CRITICAL_FPS for the full window, the trip
    // fires exactly as it did before this gate existed. (The
    // 'accum-nan' and 'render-error' trip callers are correctness
    // stops; they never pass through this effect and are untouched.)
    if (!watchdogMayTripNow) {
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
        type: 'shed',
        cutKind: 'watchdog',
        label: 'watchdog hard stop',
        fps: { at: effFps, threshold: CRITICAL_FPS, sustainedMs: CRITICAL_SUSTAIN_MS },
        detail: `FPS ${effFps} < ${CRITICAL_FPS} sustained ${CRITICAL_SUSTAIN_MS / 1000}s${gpuNote}`,
      });
      console.info(
        '[Kinetic] Perf critical: watchdog tripped — running/evolve off (FPS below',
        CRITICAL_FPS + ')' + gpuNote,
      );
    }
  }, [
    effFps,
    gpuNote,
    governorArmed,
    slowRender,
    slowRenderSource,
    tripWatchdog,
    setSlowRender,
    clearWatchdogReason,
    recoverFps,
    glContext,
    watchdogMayTripNow,
  ]);

  // #1919 carve-out — the frozen frame, a third hard trip alongside
  // 'accum-nan' and 'render-error', and like them NOT gated on ladder
  // state: walking the ladder to exhaustion can take minutes, and a
  // genuinely frozen frame is a hang, not a perf problem. The criterion
  // is frame COMPLETION, not a rate: the live loop times every frame it
  // completes into the patrol (reportStage 'gpuFrame'), and the meter's
  // 4 Hz drain reads 0 for a stage that produced no sample in the
  // window — so a sync with gpuFrame > 0 IS a heartbeat. A scene
  // crawling at 1–9 fps keeps that heartbeat fresh and stays ladder
  // territory; only silence past FRAME_STALL_MS trips.
  //
  // #1919 Option B — the crawl, a fourth hard trip sharing this poll:
  // frames completing (the stall check above them passes) can still
  // starve the instrument — each completion books at most 50 ms of
  // loop time (the loop's dt clamp) while wall time runs full, so at
  // 3–5 fps the thread saturates and loop-time landings take minutes
  // of wall time, all while the gate holds the fps-critical trip for
  // the whole ladder walk (the PR #1920 e2e failure, diagnosed in the
  // goal's hidden_files). The poll therefore also judges the RATE
  // loop time advances — governorCuts.measureLoopRate over the meter's
  // delta ring — and trips 'fps-crawl' when it stays under the crawl
  // threshold across the window. Same guards, same episode restarts:
  // the measurement restarts wherever the stall bound restarts, and
  // the delta ring is cleared at those moments so a window never
  // spans a stop, a restore, or a hidden tab.
  const lastFrameAtRef = useRef(null);
  const stallWasStoppedRef = useRef(false);
  useEffect(() => {
    if (gpuFrameMs > 0) lastFrameAtRef.current = Date.now();
  }, [stageTimings, gpuFrameMs]);

  useEffect(() => {
    if (!governorArmed) return;
    // The poll runs on timers, not rAF: it must still be awake when
    // the frame stream is not. Every read is fresh store state.
    const onVisible = () => {
      // Returning from a hidden tab restarts the bound (below).
      if (!document.hidden) lastFrameAtRef.current = Date.now();
      // The crawl window restarts with it: the delta spanning the
      // hidden span lands in the meter's ring when rAF resumes, and
      // it was the browser parking the page, not the stage crawling.
      if (!document.hidden) clearFrameDeltas();
    };
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => {
      const s = useStore.getState();
      // #263's precedent: while the context restores, no frame CAN
      // complete — the silence is the rebake's, not a hang. Hold.
      // Arm the resume-restart on the way out (QA finding, #1919):
      // the restored session's first heartbeat reaches the store up
      // to a drain (~250 ms) after 'ok' flips, and without this the
      // first poll back would judge the pre-loss heartbeat — by then
      // arbitrarily old — and false-trip on a successful restore.
      if (s.glContext !== 'ok') {
        stallWasStoppedRef.current = true;
        return;
      }
      // A hidden tab completes no frames by platform design; that
      // silence is the browser parking the page, not the stage
      // hanging, so hidden time never counts toward the bound.
      if (typeof document !== 'undefined' && document.hidden) {
        lastFrameAtRef.current = Date.now();
        return;
      }
      // Paused by the performer, frozen by cut 6, or already stopped:
      // the stage is not supposed to be completing frames. The bound
      // restarts from the moment it is expected to run again, so a
      // resume always gets a full bound to produce a frame.
      if (!s.running || s.slowRender) {
        stallWasStoppedRef.current = true;
        return;
      }
      if (stallWasStoppedRef.current) {
        stallWasStoppedRef.current = false;
        lastFrameAtRef.current = Date.now();
        // The crawl window restarts from the same moment: the ring
        // still holds the stopped episode's deltas, and a window must
        // never span a stop (or a restore — the context-down branch
        // above arms this same restart, per the QA fix).
        clearFrameDeltas();
        return;
      }
      if (frameStalled(lastFrameAtRef.current, Date.now())) {
        s.tripWatchdog('fps-stalled');
        // Event-log only: the carve-out fires under the watchdog kind.
        recordGovernorEvent({
          type: 'shed',
          cutKind: 'watchdog',
          label: 'watchdog hard stop — frame stalled',
          fps: {
            at: Math.round(effectiveGovernorFps(Number(s.fps) || 0, s.stageTimings) * 10) / 10,
            threshold: 0,
            sustainedMs: FRAME_STALL_MS,
          },
          detail: `no completed frame for ${FRAME_STALL_MS / 1000}s`,
        });
        console.info(
          '[Kinetic] Perf critical: watchdog tripped — frame stalled (no completed frame for',
          FRAME_STALL_MS / 1000 + 's)',
        );
        return;
      }
      // #1919 Option B — the crawl. The stall check just passed, so
      // frames ARE completing; judge the rate loop time is advancing
      // over the trailing window. Disarmed until the first presented
      // frame (the same null heartbeat that disarms the stall), and
      // not gated on ladder state — like the stall, it is a hang-class
      // trip, and the gate holding for the ladder is precisely the
      // condition it exists under. At healthy rates the measured
      // ratio is 1 by arithmetic (raw dt under the loop's clamp
      // ceiling), so this can only fire in a genuine crawl.
      if (lastFrameAtRef.current == null) return;
      const rate = measureLoopRate(getFrameDeltas());
      if (!rate || rate.ratio >= CRAWL_MAX_LOOP_RATIO) return;
      s.tripWatchdog('fps-crawl');
      // Event-log only: the carve-out fires under the watchdog kind.
      recordGovernorEvent({
        type: 'shed',
        cutKind: 'watchdog',
        label: 'watchdog hard stop — loop time crawling',
        fps: {
          at: Math.round(effectiveGovernorFps(Number(s.fps) || 0, s.stageTimings) * 10) / 10,
          threshold: 0,
          sustainedMs: CRAWL_WINDOW_MS,
        },
        detail: `loop time advanced ${Math.round(rate.ratio * 100)}% of wall across ${(rate.wallMs / 1000).toFixed(1)}s (${rate.frames} frames)`,
      });
      console.info(
        '[Kinetic] Perf critical: watchdog tripped — loop time crawling (loop clock at',
        Math.round(rate.ratio * 100) + '% of wall)',
      );
    }, STALL_POLL_MS);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [governorArmed]);

  // Tier 1 (#107 §4): a milder, self-clearing shed. Independent sustain
  // window from the critical tier above — this one fires first, at a higher
  // FPS floor, and never touches running/evolveMode.
  // #265 — hysteresis: shed below TIER1_FPS, restore at/above
  // TIER1_RECOVER_FPS. Between the two the governor holds — fps hovering at
  // the floor no longer destroys and rebuilds the ACCUM feedback buffer
  // every couple of seconds.
  useEffect(() => {
    if (!governorArmed) {
      tier1SinceRef.current = null;
      if (perfTier1) {
        setPerfTier1(false);
        // Event-log only: the cut cleared (governor disabled).
        recordGovernorEvent({
          type: 'restore',
          cutKind: 'perfTier1',
          label: 'shine back on',
          detail: 'autoQuality off',
        });
      }
      return;
    }
    if (effFps >= TIER1_RECOVER_FPS) {
      tier1SinceRef.current = null;
      if (perfTier1) {
        setPerfTier1(false);
        // Event-log only: the cut cleared (FPS recovered past the tier-1
        // RECOVER threshold — hysteresis, #265).
        recordGovernorEvent({
          type: 'restore',
          cutKind: 'perfTier1',
          label: 'shine back on',
          fps: { at: effFps, threshold: TIER1_RECOVER_FPS, sustainedMs: 0 },
        });
      }
      return;
    }
    if (effFps >= TIER1_FPS) {
      // Hysteresis band — hold: neither shed nor restore.
      tier1SinceRef.current = null;
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
        type: 'shed',
        cutKind: 'perfTier1',
        label: 'SHINE OFF',
        fps: { at: effFps, threshold: TIER1_FPS, sustainedMs: TIER1_SUSTAIN_MS },
        detail: `FPS ${effFps} < ${TIER1_FPS} sustained ${TIER1_SUSTAIN_MS / 1000}s${gpuNote}`,
      });
      console.info('[Kinetic] Perf tier1: ACCUM/gloss/mirror off (FPS below', TIER1_FPS + ')' + gpuNote);
    }
  }, [effFps, gpuNote, governorArmed, perfTier1, setPerfTier1]);

  // The cut list: ordered, one step per sustain+cooldown cycle.
  // Hysteresis (#259): shed below shedFps, recover at/above recoverFps.
  // Recovery (#264) iterates GOVERNOR_RESTORE_CUTS in REVERSE shed order —
  // every cut declares its own restore, so no cut can be forgotten the way
  // quality was. (Cut 3/perfTier1 keeps its own effect — independent
  // mechanism, own hysteresis; cut 7/watchdog needs manual resume.)
  useEffect(() => {
    const healthy = !governorArmed || effFps >= recoverFps;

    const snap = {
      fxaaShed,
      renderScale,
      quality,
      qualityShedFrom,
      assetThin,
      perfClampOverride,
      slowRender,
      slowRenderSource,
      creatureShed,
      dishLifeShed,
      dishFluidShed,
      travelShed,
      weatherShed,
      feedbackWarpShed,
      accumFeedShed,
      trailSteerShed,
    };
    for (const cut of [...GOVERNOR_RESTORE_CUTS].reverse()) {
      if (!cut.needsRestore(snap, { healthy })) continue;
      switch (cut.kind) {
        case 'fxaa':
          setFxaaShed(false);
          break;
        case 'renderScale':
          setRenderScale(1);
          break;
        case 'dishLife':
          setDishLifeShed(0);
          break;
        case 'dishFluid':
          setDishFluidShed(0);
          break;
        case 'markWeather':
          setWeatherShed(false);
          break;
        case 'feedbackWarp':
          setFeedbackWarpShed(false);
          break;
        case 'accumFeed':
          setAccumFeedShed(false);
          break;
        case 'trailSteer':
          setTrailSteerShed(false);
          break;
        case 'creatureCount':
          setCreatureShed(0);
          break;
        case 'travel':
          setTravelShed(false);
          break;
        case 'quality':
          // #264 M1 — restore the tier the governor stepped down from,
          // then release the claim. A manual quality change clears
          // qualityShedFrom via SET_QUALITY, so this never overrides the
          // operator's own tier.
          setQuality(qualityShedFrom);
          setQualityShedFrom(null);
          break;
        case 'assetThin':
          setAssetThin(false);
          break;
        case 'countClamp':
          setPerfClampOverride(null);
          break;
        case 'slowRender':
          setSlowRender(false);
          break;
        default:
          break;
      }
      // Event-log only: the cut cleared (FPS recovered past RECOVER —
      // hysteresis, #259; countClamp also clears on tier change).
      recordCutEvent({
        type: 'restore',
        cutKind: cut.kind,
        label: cut.kind === 'quality' ? `tier restored → ${qualityShedFrom}` : cut.restoredLabel,
        fps: { at: effFps, threshold: recoverFps, sustainedMs: 0 },
      });
    }

    if (!governorArmed) {
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

    const cut = nextGovernorCut(ladderQuery);
    if (!cut) return; // ladder exhausted — hold; the watchdog is armed from here (#1919)

    switch (cut.kind) {
      case 'fxaa':
        setFxaaShed(true);
        break;
      case 'renderScale':
        setRenderScale(cut.scale);
        break;
      case 'markWeather':
        setWeatherShed(true);
        break;
      case 'feedbackWarp':
        setFeedbackWarpShed(true);
        break;
      case 'accumFeed':
        setAccumFeedShed(true);
        break;
      case 'trailSteer':
        setTrailSteerShed(true);
        break;
      case 'dishLife':
        setDishLifeShed(cut.dishLifeShed);
        break;
      case 'dishFluid':
        setDishFluidShed(cut.dishFluidShed);
        break;
      case 'creatureCount':
        setCreatureShed(cut.creatureShed);
        break;
      case 'travel':
        setTravelShed(true);
        break;
      case 'quality':
        // #264 — record the tier being stepped down from, once per shed
        // episode, so recovery restores exactly it (never the operator's
        // manual tier — that clears the claim via SET_QUALITY).
        if (qualityShedFrom == null) setQualityShedFrom(quality);
        setQuality(cut.quality);
        break;
      case 'assetThin':
        setAssetThin(true);
        break;
      case 'countClamp':
        setPerfClampOverride({ count: cut.count, mirror: false });
        break;
      case 'slowRender':
        setSlowRender(true, 'cut6');
        break;
      default:
        break;
    }
    // Event-log only: steps 1–2 / 4–6 of the shed ladder fire here.
    recordCutEvent({
      type: 'shed',
      cutKind: cut.kind,
      label: cut.label,
      fps: { at: effFps, threshold: shedFps, sustainedMs: SUSTAIN_MS },
      detail: `FPS ${effFps} < ${shedFps} sustained ${SUSTAIN_MS / 1000}s${gpuNote}`,
    });
    lastActionRef.current = now;
    lowSinceRef.current = null;
    console.info('[Kinetic] Showrunner cut:', cut.label, '(FPS sustained below', shedFps + ')' + gpuNote);
  }, [
    fxaa,
    fxaaShed,
    setFxaaShed,
    effFps,
    gpuNote,
    quality,
    qualityShedFrom,
    setQualityShedFrom,
    governorArmed,
    setQuality,
    layoutParams.count,
    perfClampOverride,
    setPerfClampOverride,
    assetThin,
    setAssetThin,
    renderScale,
    setRenderScale,
    creatureCount,
    creatureShed,
    setCreatureShed,
    weatherActive,
    weatherShed,
    setWeatherShed,
    feedbackWarpActive,
    feedbackWarpShed,
    setFeedbackWarpShed,
    accumFeedActive,
    accumFeedShed,
    setAccumFeedShed,
    trailSteerActive,
    trailSteerShed,
    setTrailSteerShed,
    dishLifeShed,
    setDishLifeShed,
    dishFluidShed,
    setDishFluidShed,
    travelActive,
    travelShed,
    setTravelShed,
    slowRender,
    slowRenderSource,
    setSlowRender,
    shedFps,
    recoverFps,
    gpuSaturated,
    ladderQuery,
  ]);
}
