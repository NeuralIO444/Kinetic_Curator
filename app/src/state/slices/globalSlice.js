import { ASSETS } from '../../data/assets/index.js';
import { getQualityCaps } from '../../data/quality.js';
import { normalizeLayoutParams } from '../../data/layout-modes.js';
import {
  sanitizeOverlay,
  duplicateIntoOverlay,
  ingestIntoOverlay,
  removeFromOverlay,
  renameOverlayAsset,
  replaceOverlayAsset,
} from '../../assets/overlay.js';
import {
  normalizeSnapshots,
  sanitizeEnabledAssets,
  sanitizeAssetWeightOverrides,
  sanitizeAssetOptions,
  sanitizeQuality,
  sanitizePaletteLocks,
  MAX_LAYERS,
} from '../projectNormalize.js';
import { normalizeSeedOffsets } from '../../engine/kernel/rng.js';
import { importTaste as keepTaste, clearTaste as dropTaste, getTaste } from '../../curator/tasteStore.js';
import { tasteSummary, loisSummary } from '../../curator/tasteHead.js';
import { experimentalOn, setExperimental } from '../../curator/tasteGate.js';
import { sanitizeLight } from '../../data/light.js';
import { sanitizeAssetKineme, sanitizeAssetStill, getKineme, DEFAULT_ASSET_KINEME } from '../../data/kinemes.js';
import { sanitizeRegionKinemesDoc } from '../../data/regionKinemes.js';
import { tagImportedRegions } from '../../data/regionDefaults.js';
import { sanitizeAudioRoutes } from '../../data/audioRoutes.js';
import { sanitizeCanvasSpec } from '../../data/canvasPresets.js';
import { sanitizeMidiBanks, sanitizeMidiActiveBank, activeBankMap } from '../../midi/banks.mjs';
import { sanitizeMathMacros } from '../../curator/mathMacros.js';
import { normalizeRegionSlots, assignRegionSlot, REGION_SLOTS } from '../../assets/regionSlots.js';
import { queueRegionDetect } from '../../assets/regionRaster.js';
import { sanitizePins } from '../../curator/dishPins.js';
import { clickAttach, sanitizeAssetAttach, sanitizeAttachPoints } from '../../engine/assetAttach.js';
import { sanitizeScope, DEFAULT_SCOPE } from '../kineticScope.mjs'; // #1772: the START cycle

// HYPE Processing aesthetic: start with exactly 4 curated assets, not all 205
const DEFAULT_4_ASSETS = ['org_blob_01', 'rad_rings_01', 'stamp_glyph_01', 'rad_orbit_01'];
const initialEnabledAssets = Object.fromEntries(DEFAULT_4_ASSETS.map((id) => [id, true]));
// #1694 S2 — the creature citizen starts ENABLED in the default document: creatures were never
// gated by this map (the artist's count alone governed them), so citizenship must not unbirth
// them at rest. Only an explicit off — the tile toggle, or a solo of another asset — ever
// writes `creature: false` (see curator/creatureCitizen.js for the resolver-side read).
initialEnabledAssets.creature = true;

/**
 * #1062 — a document's asset map, taken as the WHOLE set rather than an overlay
 * on the defaults. `false` is a deliberate OFF and is kept. A map with no keys
 * (absent, `{}`, or a hostile map the sanitizer collapsed to nothing) is read as
 * "the document does not say" and falls back to the default four: a damaged
 * file must not open to a blank canvas, and a genuine all-off state is stored as
 * explicit `false` values, never as `{}`.
 */
function wholeEnabledAssets(map) {
  return map && typeof map === 'object' && Object.keys(map).length > 0 ? { ...map } : { ...initialEnabledAssets };
}

const WEIGHT_CYCLE = ['light', 'medium', 'heavy'];

// #310: GRID/LIST is a remembered preference, not a live toggle. The last
// choice survives sessions in its own localStorage key.
const POOL_VIEW_KEY = 'kc:pool-view:v1';
function readPoolView() {
  try {
    const v = localStorage.getItem(POOL_VIEW_KEY);
    return v === 'grid' || v === 'list' ? v : 'grid';
  } catch {
    return 'grid';
  }
}
function persistPoolView(view) {
  try {
    localStorage.setItem(POOL_VIEW_KEY, view);
  } catch {
    // private window / quota — the session value still works, it just won't
    // be remembered. Deliberately silent.
  }
}

// #740: FXAA in the resolve pass is a per-machine display preference (like the
// pool view), not project content — it lives in its own localStorage key and
// never enters the project document. Default ON.
const FXAA_KEY = 'kc:fxaa:v1';
export function readFxaa() {
  try {
    return localStorage.getItem(FXAA_KEY) !== '0';
  } catch {
    return true;
  }
}
function persistFxaa(on) {
  try {
    localStorage.setItem(FXAA_KEY, on ? '1' : '0');
  } catch {
    // private window / quota — the session value still works. Deliberately silent.
  }
}

// #741: gate weave — the other per-machine display pref. Default OFF (a finish you opt into).
const WEAVE_KEY = 'kc:weave:v1';
export function readWeave() {
  try {
    return localStorage.getItem(WEAVE_KEY) === '1';
  } catch {
    return false;
  }
}
function persistWeave(on) {
  try {
    localStorage.setItem(WEAVE_KEY, on ? '1' : '0');
  } catch {
    // private window / quota — the session value still works. Deliberately silent.
  }
}

// #946: START mode — what a cold launch opens on. #1772: now a four-state cycle
// OFF → WEAK → MED → KOZ that also sets the KINETIC ceiling (state/kineticScope.mjs);
// #946's 'fixed' reads as OFF and its 'chaos' as KOZ. A per-machine
// preference like the pool view, not project content — its own
// localStorage key, never enters the project document.
const STARTUP_MODE_KEY = 'kc:startup-mode:v1';
function readStartupMode() {
  try {
    return sanitizeScope(localStorage.getItem(STARTUP_MODE_KEY));
  } catch {
    return DEFAULT_SCOPE;
  }
}
function persistStartupMode(mode) {
  try {
    localStorage.setItem(STARTUP_MODE_KEY, mode);
  } catch {
    // private window / quota — the session value still works. Deliberately silent.
  }
}

function findAsset(id, overlay) {
  return overlay.find((a) => a.id === id) || ASSETS.find((a) => a.id === id) || null;
}

/**
 * #1434 — an import's regions land: cap at the tag cap and apply the family
 * defaults (tagImportedRegions — the same pipeline the library gets at
 * bake), so a newly arrived asset is first-class immediately, never
 * raw/inert. Defaults are recomputed from the CURRENT geometry (a redraw
 * re-tags); the artist's doc-level overrides are separate data and always
 * win at resolve time, so recomputing defaults never clobbers an edit.
 */
function withTaggedRegions(asset, regions) {
  const tagged = tagImportedRegions(asset, regions);
  const rest = { ...asset };
  delete rest.regionKinemes; // stale defaults off — the fresh tag below replaces them
  return {
    ...rest,
    regions: tagged.regions,
    ...(tagged.regionKinemes ? { regionKinemes: tagged.regionKinemes } : {}),
  };
}

export const createGlobalSlice = (set) => ({
  running: true,
  fps: 60,
  nodeCount: 0,
  quality: 'balanced',
  autoQuality: true,
  isFullscreen: false,
  curatorConfidence: 0,
  curatorActive: false,
  curatorLatencyMs: 0,
  setCuratorConfidence: (confidence, active = true, latencyMs = 0) =>
    set({ curatorConfidence: confidence, curatorActive: active, curatorLatencyMs: latencyMs }),
  /**
   * Set by usePerformanceGovernor when FPS is sustained near zero (#107 §4).
   * Quality/count steps only shrink what gets drawn; at ~0 FPS the cost is
   * often evolve/ambient-drift/ACCUM/swarm still doing full-rate work
   * underneath whatever quality is set, so those pause outright on this flag
   * until FPS recovers. MasterBar surfaces it so the operator knows why the
   * composition suddenly stopped breathing.
   */
  slowRender: false,
  /**
   * Which mechanism set slowRender — the honest-pill discriminator (#259).
   *   null       — motion not frozen
   *   'cut6'     — governor cut 6: motion frozen to protect frame rate,
   *                auto-clears when FPS recovers
   *   'watchdog' — cut 7 hard stop (tripWatchdog): needs manual resume
   * MasterBar used to show "PERF PAUSED / Watchdog tripped" for both; cut 6
   * gets its own auto-clearing indicator now.
   */
  slowRenderSource: null,
  /**
   * The quality tier the governor's cut 2 stepped DOWN from (#264). null
   * when quality was not governor-shed — a user-chosen tier is never
   * "restored" over. The governor records this on its first quality shed
   * of an episode and restores to it on recovery; a manual quality change
   * (SET_QUALITY) or a fresh project load clears it. Session-only, never
   * serialized — like slowRenderSource, it is live governor overlay state.
   */
  qualityShedFrom: null,
  /**
   * Set for the duration of a batch export (#107 §5). Deliberately separate
   * from slowRender/perfTier1 above — those are owned by usePerformanceGovernor
   * and auto-clear on live FPS, which would fight a pause that must hold for
   * the whole batch regardless of momentary FPS readings.
   */
  batchPaused: false,
  /**
   * Tier 1 of the watchdog (#107 §4): FPS < 16 sustained 2s. Shedding, not
   * stopping — ACCUM, gloss and mirror render-off across every visible
   * layer, not just the active one, since a bad layer or a heavy inactive
   * snapshot can be the one costing the frame. Auto-clears the instant FPS
   * recovers; tripWatchdog (tier 2) also sets it, since a full trip should
   * shed everything tier 1 sheds too.
   */
  perfTier1: false,
  /** #740 — governor cut 0: FXAA shed. Render-only overlay: never serialized, auto-clears on recovery. The user's own `fxaa` choice is never overwritten. */
  fxaaShed: false,
  /**
   * Showrunner patrol snapshot (§4): per-stage rolling-average timings in
   * ms, synced ~4Hz by useFpsMeter. Keys are stage names ('kernel', …);
   * `__frame` carries { avg, worst } RAF-delta stats. Read-only signal for
   * the operator and for future governor stages — the governor currently
   * acts on FPS only. Never serialized (live-only, like fps itself).
   */
  stageTimings: {},
  /**
   * Showrunner cut 1: dynamic resolution scaling (#192), render-only overlay.
   *   1    — full resolution
   *   0.75 — first shed step
   *   0.5  — second shed step
   *   0.33 — deepest shed step before quality tiers move
   * Render scale drops before anything visible is cut: GPU FX compositing
   * has 10–50x headroom, so the old FX cut ladder (fxShedLevel) is retired
   * and FX layers are never culled. Auto-clears to 1 on recovery.
   * Never serialized. The live app surfaces it via TapeCounter (the merged
   * readout — #295 built it, #483 confirms it); the GL render paths scale width/height by it.
   */
  renderScale: 1,
  /**
   * Showrunner cut 5: cost-aware asset thinning, render-only overlay.
   * When on, layers drop highest-cost-score assets first instead of
   * thinning uniformly. Never serialized.
   */
  assetThin: false,
  /**
   * Governor hysteresis thresholds (#259 — the permanent-shed-trap fix).
   * Shed when effective FPS < governorShedFps; recover when >=
   * governorRecoverFps. These MUST stay apart: the trap was one shared
   * threshold (32) sitting above a machine's sustainable rate (29.9 on a
   * 30Hz-locked loop), so the governor walked the whole ladder and could
   * never recover. The setters enforce shed < recover — the trap is
   * unrepresentable by construction.
   * Session-only, never serialized (machine-specific, like frameLock).
   * Live-overridable from the dev-only GOV TUNE panel.
   */
  governorShedFps: 28,
  governorRecoverFps: 30,
  /**
   * Showrunner frame-lock show mode: a USER choice, not a degradation.
   * When on, the life/breathing tick (the dominant per-frame re-render
   * driver) is gated to ~30Hz — a locked 30fps reads smoother than a
   * fluctuating 40–60 and halves React render work. Never auto-cleared.
   * Never serialized (it is a machine-specific choice, not composition).
   */
  frameLock: false,
  /**
   * Live-GL context health (#263): 'ok' | 'lost' | 'restoring'.
   *   'lost'      — the GPU context went down (webglcontextlost); the live
   *                 loop holds frames instead of drawing black forever.
   *   'restoring' — the context came back; the renderer is being
   *                 cold-restarted and textures are rebaking.
   * Clears to 'ok' when the post-restore rebake lands. MasterBar shows a
   * fault pill for either non-ok state so the outage is never silent.
   * Session-only, never serialized — it describes this tab's GPU session.
   */
  glContext: 'ok',
  /** Bumped by every tripWatchdog() call — lets a subscriber (PipelinePanel's
   * in-flight export restore) react to a NEW trip instead of a boolean it
   * has already seen. */
  watchdogTripGen: 0,
  /** Last string passed to tripWatchdog(reason) — surfaced for debugging why
   * the session is paused (e.g. 'fps-critical' vs a render-error label). */
  lastWatchdogReason: null,
  /**
   * RENDER FAULT (#266): a deterministic per-frame fault in the live loop
   * (frame building / rendering / presenting throwing on consecutive ticks)
   * or a deterministic atlas-bake failure. The loop sets this sticky — the
   * canvas keeps the last good frame, so without the pill the app would
   * look alive while silently stopped presenting. It clears only on an
   * honest recovery (RENDER_FAULT_RECOVERY consecutive clean frames) or a
   * reload — never on a single good frame.
   * renderFaultReason carries a one-line diagnosis for the pill tooltip.
   * Never serialized (session-only, like fps).
   */
  renderFault: false,
  renderFaultReason: null,
  webcamEnabled: false,

  enabledAssets: initialEnabledAssets,
  assetWeightOverrides: {},
  /** #781 KINEME — { assetId: kinemeId }: which assets move, and how. Assets stay static sources. */
  assetKineme: { ...DEFAULT_ASSET_KINEME }, // #705 — micro-HUD ornaments move out of the box
  /** #1434 — { assetId: { regionId: kinemeId | null } }: the artist's per-region overrides over the family
   * defaults. null is a tombstone: that region is still on purpose. Rides the document. */
  regionKinemes: {},
  /** #1128 — { assetId: true }: assets pinned still. The living-motion floor (breath, drift) leaves their marks where they were placed. */
  assetStill: {},
  /** #1694 S2 — { assetId: { key: choice } }: tile options a record declares (the creature citizen's
   * `family`). Generic like assetKineme: written only when set (cycling back to the declared
   * default removes the key), ridden by the document, read by the resolver off the input. */
  assetOptions: {},
  assetAttach: {}, // #1355 — { assetId: [{x, y}] } attach points set in the wet lab
  customAssets: [],
  ingestError: null,
  /**
   * Whether the session is actually being persisted (#107 §6).
   *   'ok'          last autosave written
   *   'unsaved'     localStorage refused the write (quota, or a private window)
   *   'quarantined' boot found a document it could not parse; defaults were
   *                 loaded and the bad blob moved to kc:project:quarantine
   *
   * Surfaced in MasterBar because the failure this guards against is an
   * operator believing a long set is being saved when nothing is.
   */
  persistStatus: 'ok',
  // #1641 — latched by state/store.js when a small tuning surface's
  // persist is refused (sessionOnly.mjs): the tuning holds for this
  // session only. MasterBar renders it beside the persistStatus pill.
  tuningSessionOnly: false,
  search: '',
  catFilter: 'all',
  poolView: readPoolView(),
  // #762 — the imported taste (kept per machine in curator/tasteStore.js). The
  // store mirrors a status line + a revision so the curator bar re-renders.
  tasteStatus: tasteSummary(getTaste(), { experimental: experimentalOn() }),
  // #997 — the Lois boldness line mirrors the taste line: three honest states
  // (not trained / fidelity too low / boldness live). Never picks, never scores.
  loisStatus: loisSummary(getTaste(), { experimental: experimentalOn() }),
  tasteRev: 0,
  // #762 — the artist's experimental switch (curator/tasteGate.js): a below-bar taste may steer, and says so.
  tasteExperimental: experimentalOn(),
  setTasteExperimental: (value) => {
    const experimental = setExperimental(value);
    set((s) => ({
      tasteExperimental: experimental,
      tasteStatus: tasteSummary(getTaste(), { experimental }),
      loisStatus: loisSummary(getTaste(), { experimental }),
      tasteRev: (s.tasteRev || 0) + 1,
    }));
  },
  importTaste: (raw) => {
    const r = keepTaste(raw);
    if (r.ok)
      set((s) => ({
        tasteStatus: tasteSummary(r.taste, { experimental: experimentalOn() }),
        loisStatus: loisSummary(r.taste, { experimental: experimentalOn() }),
        tasteRev: (s.tasteRev || 0) + 1,
      }));
    return r;
  },
  clearTaste: () => {
    dropTaste();
    set((s) => ({ tasteStatus: tasteSummary(null), loisStatus: loisSummary(null), tasteRev: (s.tasteRev || 0) + 1 }));
  },
  fxaa: readFxaa(),
  weave: readWeave(),
  setWeave: (on) => {
    persistWeave(!!on);
    set({ weave: !!on });
  },
  setFxaa: (on) => {
    persistFxaa(!!on);
    set({ fxaa: !!on });
  },
  // #946 / #1772 — START: OFF · WEAK · MED · KOZ. Read by the boot sequence in useProjectAutosave and by every KINETIC
  // pass (its ceiling); the pill lives next to the KIN button in the CuratorBar and cycles. Junk sanitizes to KOZ.
  startupMode: readStartupMode(),
  setStartupMode: (mode) => {
    const next = sanitizeScope(mode);
    persistStartupMode(next);
    set({ startupMode: next });
  },
  /**
   * #310: the canvas background cycle moved from the CanvasPanel header to
   * OUTPUT. The state lives here (not panel-local) so both panels share it;
   * the live loop picks it up via the CanvasPanel effect below.
   */
  canvasBg: 'palette',
  cycleCanvasBg: () =>
    set((state) => ({
      canvasBg: state.canvasBg === 'palette' ? 'transparent' : state.canvasBg === 'transparent' ? 'white' : 'palette',
    })),

  setPersistStatus: (persistStatus) => set({ persistStatus }),
  /**
   * #534 — transient boot note (share-link applied, bad link, palette
   * fallback). Set once at boot; MasterBar shows it as a pill and clears
   * it after a few seconds. Never persisted, never blocks boot.
   */
  bootNotice: null,
  setBootNotice: (msg) => set({ bootNotice: typeof msg === 'string' && msg ? msg : null }),
  setRunning: (running) =>
    set((state) => {
      // #264 — manual resume contract: anything that sets running=true
      // (Space, the RUN button) after a watchdog hard stop clears the stop
      // outright — slowRender, its source, and the badge's reason. The cut-6
      // soft freeze is NOT cleared here; it auto-clears on FPS recovery in
      // the governor hook.
      const resumeWatchdog = !!running && state.slowRenderSource === 'watchdog';
      return {
        running,
        ...(resumeWatchdog ? { slowRender: false, slowRenderSource: null, lastWatchdogReason: null } : {}),
      };
    }),
  setFps: (fps) => set({ fps }),
  setNodeCount: (count) => set({ nodeCount: count }),
  setQuality: (quality) =>
    set((state) => {
      const caps = getQualityCaps(quality);
      const next = { quality };
      if (!caps.allowMirror && state.layoutParams.mirror) {
        next.layoutParams = { ...state.layoutParams, mirror: false };
      }
      return next;
    }),
  setAutoQuality: (auto) => set({ autoQuality: !!auto }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  // #1355 AUTO SPAWN homes are published here as `dishPins`, which the resolver reads (so a
  // take records them). Not set by hand. (#1694 S3 — the artist's creature COUNT left this
  // slice with the fold-in: it is the BUILD layout param `creatures` now, set from BUILD's
  // hype/moth block; the DIRECTORS stepper and this field retired together.)
  /** #1694 S2 — the governor's creature shed: how many of the artist's creatures the governor is
   * currently holding back. A render-only overlay in the perfClampOverride class — never
   * serialized into a document; liveLoop stamps the `creatures` param − creatureShed on the
   * resolver input. Restores whole when pressure clears (governorCuts' restore table). */
  creatureShed: 0,
  setCreatureShed: (n) => set({ creatureShed: Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0 }),
  /** #1574 — the governor's travel shed: while true, liveLoop stamps
   * travelShed on the resolver input and FLOW marks settle home. A
   * render-only overlay in the creatureShed class — never serialized
   * into a document; the artist's transport params never move. Restores
   * whole when pressure clears (governorCuts' restore table). */
  travelShed: false,
  setTravelShed: (on) => set({ travelShed: !!on }),
  /** #1627 S1 — the governor's mark-weather shed: while true, the mote
   * store clears and nothing spawns (engine/markWeather.mjs reads the
   * shed through its frame input). A render-only overlay in the
   * travelShed class — never serialized into a document; weather is
   * derived state and no recipe ever carried it. Restores whole when
   * pressure clears (governorCuts' restore table, cut 1.4). */
  weatherShed: false,
  setWeatherShed: (on) => set({ weatherShed: !!on }),
  /** #1490 — the governor's spectral feedback warp shed (cut 1.45): while
   * true, liveLoop reads the FX strata's feedbackWarp amount as 0 and the
   * ACCUM trails run straight. A render-only overlay in the travelShed
   * class — never serialized into a document; the artist's FX item amount
   * never moves. Restores whole when pressure clears (governorCuts'
   * restore table). */
  feedbackWarpShed: false,
  setFeedbackWarpShed: (on) => set({ feedbackWarpShed: !!on }),
  dishPins: [],
  setDishPins: (pins) => set({ dishPins: sanitizePins(pins) }),
  setSlowRender: (slow, source) =>
    set({
      slowRender: slow,
      slowRenderSource: slow ? source || 'cut6' : null,
    }),
  /** #264 — the governor records the tier its quality shed stepped from. */
  setQualityShedFrom: (tier) => set({ qualityShedFrom: tier }),
  /** #264 — lets the badge return to clean once a watchdog stop is gone. */
  clearWatchdogReason: () => set({ lastWatchdogReason: null }),
  setBatchPaused: (paused) => set({ batchPaused: !!paused }),
  setPerfTier1: (on) => set({ perfTier1: !!on }),
  setFxaaShed: (on) => set({ fxaaShed: !!on }),
  setStageTimings: (stages) => set({ stageTimings: { ...stages } }),
  setRenderScale: (scale) => {
    const s = Number(scale);
    set({ renderScale: Number.isFinite(s) && s > 0 ? Math.min(1, s) : 1 });
  },
  setAssetThin: (on) => set({ assetThin: !!on }),
  /**
   * Live governor threshold overrides (GOV TUNE panel). Clamped to 1–120
   * and to each other: shed must stay strictly below recover, or the
   * permanent-shed trap returns.
   */
  setGovernorShedFps: (v) =>
    set((state) => ({
      governorShedFps: Math.min(
        Math.max(1, Math.round(Number(v) || state.governorShedFps)),
        120,
        state.governorRecoverFps - 1,
      ),
    })),
  setGovernorRecoverFps: (v) =>
    set((state) => ({
      governorRecoverFps: Math.max(
        Math.min(120, Math.round(Number(v) || state.governorRecoverFps)),
        1,
        state.governorShedFps + 1,
      ),
    })),
  setFrameLock: (on) => set({ frameLock: !!on }),
  /** Live-GL context health signal (#263) — one of 'ok' | 'lost' | 'restoring'. */
  setGlContext: (v) => set({ glContext: v === 'lost' ? 'lost' : v === 'restoring' ? 'restoring' : 'ok' }),
  /**
   * Tier 2 of the watchdog (#107 §4): FPS ~ 0 sustained, or a critical
   * render-error (top-level Shell boundary only). Unlike tier 1, this is a
   * hard stop that does not undo itself on recovery — matches the Escape
   * panic-key precedent, where a panic action pauses but never resumes.
   * Cross-slice write (evolveMode lives in davisSlice): already precedented
   * by setQuality reaching into layoutParams above.
   */
  tripWatchdog: (reason) =>
    set((state) => ({
      slowRender: true,
      slowRenderSource: 'watchdog',
      running: false,
      evolveMode: false,
      perfTier1: true,
      watchdogTripGen: state.watchdogTripGen + 1,
      lastWatchdogReason: reason,
    })),
  setWebcamEnabled: (enabled) => set({ webcamEnabled: enabled }),
  /**
   * RENDER FAULT setter (#266). Written only on transitions by the live
   * loop (never per frame — no re-render storm). Setting `on` while the
   * fault is already active updates the diagnosis; clearing requires an
   * explicit `false`, which also drops the reason so a stale diagnosis
   * can't linger after recovery.
   */
  setRenderFault: (on, reason) =>
    set({
      renderFault: !!on,
      renderFaultReason: on ? reason || 'render-error' : null,
    }),

  toggleAsset: (id) =>
    set((state) => ({
      enabledAssets: { ...state.enabledAssets, [id]: !state.enabledAssets[id] },
    })),
  soloAsset: (id) =>
    set((state) => {
      const next = {};
      ASSETS.forEach((a) => {
        next[a.id] = a.id === id;
      });
      sanitizeOverlay(state.customAssets).forEach((a) => {
        next[a.id] = a.id === id;
      });
      return { enabledAssets: next };
    }),
  toggleAllAssets: (enabled) =>
    set((state) => {
      const next = { ...state.enabledAssets };
      const userOnly = state.catFilter === 'user';
      ASSETS.forEach((a) => {
        if (userOnly) return;
        if (state.catFilter === 'all' || a.category === state.catFilter) next[a.id] = enabled;
      });
      sanitizeOverlay(state.customAssets).forEach((a) => {
        if (state.catFilter === 'all' || state.catFilter === 'user' || a.category === state.catFilter)
          next[a.id] = enabled;
      });
      return { enabledAssets: next };
    }),
  setEnabledAssets: (map) => set({ enabledAssets: { ...map } }),
  setSearch: (search) => set({ search }),
  setCatFilter: (filter) => set({ catFilter: filter }),
  setPoolView: (view) => {
    persistPoolView(view);
    return set({ poolView: view });
  },

  duplicateAsset: (id) =>
    set((state) => {
      const src = findAsset(id, sanitizeOverlay(state.customAssets));
      if (!src) return {};
      const result = duplicateIntoOverlay(src, state.customAssets);
      if (!result.ok) return { ingestError: result.hint || result.error };
      // #1434 — a duplicate is a new arrival: it inherits its source's
      // regions + defaults through the record spread; if the source had
      // none yet, tag it on arrival like any import.
      if (!Array.isArray(result.asset.regions) || !result.asset.regions.length) {
        queueRegionDetect(result.asset.id, result.asset.svg, (rid, regions) => {
          set((st) => {
            const cur = findAsset(rid, sanitizeOverlay(st.customAssets));
            if (!cur || cur.svg !== result.asset.svg) return {};
            return {
              customAssets: st.customAssets.map((a) => (a.id === rid ? withTaggedRegions(a, regions) : a)),
            };
          });
        });
      }
      return {
        customAssets: result.overlay,
        enabledAssets: { ...state.enabledAssets, [result.asset.id]: false },
        ingestError: null,
      };
    }),

  ingestAsset: (svg, hint, opts = {}) =>
    set((state) => {
      const result = ingestIntoOverlay(svg, state.customAssets, hint, opts);
      if (!result.ok) return { ingestError: result.hint || result.error || 'ingest failed' };
      // #725: region detection needs a rasterize (async) — the asset lands
      // now, its regions follow. Stale-guarded: a replace in between wins.
      // #1434: when they land they are capped + family-defaulted
      // (withTaggedRegions) — no raw/inert import state.
      queueRegionDetect(result.asset.id, result.asset.svg, (id, regions) => {
        set((st) => {
          const cur = findAsset(id, sanitizeOverlay(st.customAssets));
          if (!cur || cur.svg !== result.asset.svg) return {};
          return {
            customAssets: st.customAssets.map((a) => (a.id === id ? withTaggedRegions(a, regions) : a)),
          };
        });
      });
      return {
        customAssets: result.overlay,
        enabledAssets: { ...state.enabledAssets, [result.asset.id]: false },
        ingestError: null,
      };
    }),

  removeCustomAsset: (id) =>
    set((state) => {
      const result = removeFromOverlay(id, state.customAssets);
      if (!result.ok) return { ingestError: result.hint || result.error };
      const enabled = { ...state.enabledAssets };
      const overrides = { ...(state.assetWeightOverrides || {}) };
      delete enabled[id];
      delete overrides[id];
      return {
        customAssets: result.overlay,
        enabledAssets: enabled,
        assetWeightOverrides: overrides,
        ingestError: null,
      };
    }),

  renameCustomAsset: (id, name) =>
    set((state) => {
      const result = renameOverlayAsset(id, name, state.customAssets);
      if (!result.ok) return { ingestError: result.hint || result.error };
      const enabled = { ...state.enabledAssets };
      const overrides = { ...(state.assetWeightOverrides || {}) };
      if (result.from !== result.to) {
        // Propagate the rename to every id-keyed map so no stale reference
        // to the old id survives (#134: overrides used to be left behind,
        // silently resetting the renamed asset's weight and persisting the
        // dead id into saved project documents).
        if (result.from in enabled) {
          enabled[result.to] = enabled[result.from];
          delete enabled[result.from];
        }
        if (result.from in overrides) {
          overrides[result.to] = overrides[result.from];
          delete overrides[result.from];
        }
      }
      return {
        customAssets: result.overlay,
        enabledAssets: enabled,
        assetWeightOverrides: overrides,
        ingestError: null,
      };
    }),

  replaceCustomAsset: (id, svg) =>
    set((state) => {
      const result = replaceOverlayAsset(id, svg, state.customAssets);
      if (!result.ok) return { ingestError: result.hint || result.error };
      // #725: re-detect regions for the new artwork; stale-guard as above.
      // #1434: the new geometry re-tags (cap + family defaults) on arrival.
      const nextSvg = result.overlay.find((a) => a.id === id)?.svg;
      if (nextSvg) {
        queueRegionDetect(id, nextSvg, (rid, regions) => {
          set((st) => {
            const cur = findAsset(rid, sanitizeOverlay(st.customAssets));
            if (!cur || cur.svg !== nextSvg) return {};
            return {
              customAssets: st.customAssets.map((a) => (a.id === rid ? withTaggedRegions(a, regions) : a)),
            };
          });
        });
      }
      return { customAssets: result.overlay, ingestError: null };
    }),

  /**
   * #725 — set an asset's detected regions (from the async rasterize) or
   * assign a region to a named slot (A/B/C/D). Slot keys are stable region
   * IDs: redraw-same-color survives, recolor breaks (new ID).
   */
  setAssetRegions: (id, regions) =>
    set((state) => {
      const asset = findAsset(id, sanitizeOverlay(state.customAssets));
      if (!asset) return {};
      // #1434 — regions landing through here get the import pipeline too:
      // the tag cap + family defaults, recomputed from the new geometry.
      const tagged = tagImportedRegions(asset, regions);
      const clean = tagged.regions;
      // #725: prune slot assignments whose IDs died with the recolor — a slot
      // pointing at a missing region is a broken promise, not a kept one.
      const alive = new Set(clean.map((r) => r.id));
      const slots = normalizeRegionSlots(asset.regionSlots);
      let pruned = false;
      for (const s of REGION_SLOTS) {
        if (slots[s] && !alive.has(slots[s])) {
          slots[s] = null;
          pruned = true;
        }
      }
      const prevSlots = normalizeRegionSlots(asset.regionSlots);
      const slotsChanged = pruned || REGION_SLOTS.some((s) => slots[s] !== prevSlots[s]);
      return {
        customAssets: state.customAssets.map((a) => {
          if (a.id !== id) return a;
          const rest = { ...a };
          delete rest.regionKinemes; // stale defaults off — the fresh tag below replaces them
          return {
            ...rest,
            regions: clean,
            ...(slotsChanged ? { regionSlots: slots } : {}),
            ...(tagged.regionKinemes ? { regionKinemes: tagged.regionKinemes } : {}),
          };
        }),
      };
    }),
  setAssetRegionSlot: (id, slot, regionId) =>
    set((state) => {
      if (!REGION_SLOTS.includes(slot)) return {};
      const asset = findAsset(id, sanitizeOverlay(state.customAssets));
      if (!asset) return {};
      const next = assignRegionSlot(asset.regionSlots, slot, regionId);
      const prev = normalizeRegionSlots(asset.regionSlots);
      if (REGION_SLOTS.every((s) => next[s] === prev[s])) return {};
      return {
        customAssets: state.customAssets.map((a) => (a.id === id ? { ...a, regionSlots: next } : a)),
      };
    }),

  /**
   * #781 KINEME — give an asset a motion (kinemeId) or make it still (null).
   * Unknown kineme ids are ignored. The UI arrives with the DAVIS perform
   * surface; until then this is the store/test entry point.
   */
  /** #1128 — pin an asset still, or let it move again. The artist's own choice, so it rides the document. */
  toggleAssetStill: (assetId) =>
    set((state) => {
      if (!assetId || typeof assetId !== 'string') return {};
      const cur = state.assetStill || {};
      if (cur[assetId]) {
        const next = { ...cur };
        delete next[assetId];
        return { assetStill: next };
      }
      return { assetStill: { ...cur, [assetId]: true } };
    }),
  /**
   * #1355 — a wet-lab click on an asset: add an attach point, or step the clicked one's role (#1634: plain →
   * H → L → gone). `shown` is what the lab is
   * showing (the asset's own points, or the ones worked out from its shape): the first hand edit starts from those
   * and from then on the asset uses the artist's. Rides the document.
   */
  clickAssetAttach: (assetId, pt, shown) =>
    set((state) => {
      if (!assetId || typeof assetId !== 'string') return {};
      const cur = state.assetAttach || {};
      const before = Array.isArray(cur[assetId]) ? cur[assetId] : sanitizeAttachPoints(shown);
      const after = clickAttach(before, pt);
      if (after === before) return {};
      return { assetAttach: { ...cur, [assetId]: after } };
    }),
  /** No points on this asset: an explicit empty list, the artist's choice (not the same as "auto"). */
  clearAssetAttach: (assetId) =>
    set((state) =>
      assetId && typeof assetId === 'string' ? { assetAttach: { ...(state.assetAttach || {}), [assetId]: [] } } : {},
    ),
  /** Back to the points worked out from the shape: the hand edit is dropped. */
  autoAssetAttach: (assetId) =>
    set((state) => {
      if (!state.assetAttach || !(assetId in state.assetAttach)) return {};
      const next = { ...state.assetAttach };
      delete next[assetId];
      return { assetAttach: next };
    }),
  setAssetKineme: (assetId, kinemeId) =>
    set((state) => {
      const cur = state.assetKineme || {};
      if (!assetId) return {};
      if (kinemeId == null) {
        if (!(assetId in cur)) return {};
        const next = { ...cur };
        delete next[assetId];
        return { assetKineme: next };
      }
      if (!getKineme(kinemeId) || cur[assetId] === kinemeId) return {};
      return { assetKineme: { ...cur, [assetId]: kinemeId } };
    }),
  /**
   * #1434 — the artist's per-region kineme override, from the asset tools.
   * value: a kineme id (override), 'still' (tombstone — the region rests
   * on purpose, the default does not come back), or 'default' (clear the
   * override; the family default rules again). Rides the document; beats
   * the baked/auto-tagged defaults at resolve time, and a re-bake or
   * re-tag never touches this map.
   */
  setRegionKineme: (assetId, regionId, value) =>
    set((state) => {
      if (!assetId || typeof assetId !== 'string' || !regionId || typeof regionId !== 'string') return {};
      const cur = state.regionKinemes || {};
      const per = { ...(cur[assetId] || {}) };
      if (value === 'default') {
        if (!(regionId in per)) return {};
        delete per[regionId];
      } else if (value === 'still') {
        if (per[regionId] === null) return {};
        per[regionId] = null;
      } else if (typeof value === 'string' && getKineme(value)) {
        if (per[regionId] === value) return {};
        per[regionId] = value;
      } else return {};
      const next = { ...cur };
      if (Object.keys(per).length) next[assetId] = per;
      else delete next[assetId];
      return { regionKinemes: next };
    }),
  setAssetWeight: (id, weight) =>
    set((state) => {
      if (!WEIGHT_CYCLE.includes(weight)) return {};
      const asset = findAsset(id, sanitizeOverlay(state.customAssets));
      if (!asset) return {};
      if (asset.weight === weight) {
        if (!(id in state.assetWeightOverrides)) return {};
        const next = { ...state.assetWeightOverrides };
        delete next[id];
        return { assetWeightOverrides: next };
      }
      return { assetWeightOverrides: { ...state.assetWeightOverrides, [id]: weight } };
    }),

  cycleAssetWeight: (id) =>
    set((state) => {
      const asset = findAsset(id, sanitizeOverlay(state.customAssets));
      if (!asset) return {};
      const current = state.assetWeightOverrides[id] || asset.weight || 'medium';
      const idx = WEIGHT_CYCLE.indexOf(current);
      const nextW = WEIGHT_CYCLE[(idx + 1) % WEIGHT_CYCLE.length];
      if (nextW === asset.weight) {
        const next = { ...state.assetWeightOverrides };
        delete next[id];
        return { assetWeightOverrides: next };
      }
      return { assetWeightOverrides: { ...state.assetWeightOverrides, [id]: nextW } };
    }),

  /**
   * #1694 S2 — cycle one declared tile option on an asset (the citizen's family). Fully generic,
   * the assetKineme pattern: the record declares its options ({ key, choices, default }); this
   * walks the choices and REMOVES the key when the cycle lands back on the default, so the map
   * only ever holds what the artist actually set. Unknown assets, undeclared keys and
   * single-choice options are no-ops.
   */
  cycleAssetOption: (assetId, key) =>
    set((state) => {
      const asset = findAsset(assetId, sanitizeOverlay(state.customAssets));
      const opt = (asset && Array.isArray(asset.options) ? asset.options : []).find((o) => o && o.key === key);
      if (!opt || !Array.isArray(opt.choices) || opt.choices.length < 2) return {};
      const dflt = opt.default !== undefined ? opt.default : opt.choices[0];
      const cur = (state.assetOptions && state.assetOptions[assetId] && state.assetOptions[assetId][key]) ?? dflt;
      const idx = opt.choices.indexOf(cur);
      const nextV = opt.choices[((idx < 0 ? 0 : idx) + 1) % opt.choices.length];
      const forAsset = { ...(state.assetOptions && state.assetOptions[assetId] ? state.assetOptions[assetId] : {}) };
      if (nextV === dflt) delete forAsset[key];
      else forAsset[key] = nextV;
      const assetOptions = { ...(state.assetOptions || {}) };
      if (Object.keys(forAsset).length) assetOptions[assetId] = forAsset;
      else delete assetOptions[assetId];
      return { assetOptions };
    }),

  setCategoryWeight: (category, weight) =>
    set((state) => {
      if (!WEIGHT_CYCLE.includes(weight)) return {};
      const next = { ...state.assetWeightOverrides };
      ASSETS.forEach((a) => {
        if (a.category !== category) return;
        if (a.weight === weight) delete next[a.id];
        else next[a.id] = weight;
      });
      return { assetWeightOverrides: next };
    }),

  clearWeightOverrides: () => set({ assetWeightOverrides: {} }),

  applyProject: (doc) =>
    set((state) => {
      const next = {
        seed: doc.seed >>> 0,
        // #305 — sub-seed offsets restore with the seed; absent → zeros.
        seedOffsets: normalizeSeedOffsets(doc.seedOffsets),
        paletteId: doc.paletteId || state.paletteId,
        // #103 Track B — a dangling quality key must never reach the caps lookup.
        quality: sanitizeQuality(doc.quality, state.quality || 'balanced'),
        // #310: AUTO left performer sight, but the governor still reads the
        // flag — the document carries the hidden default.
        autoQuality: doc.autoQuality !== false,
        // #264 — a fresh document owns its quality; any governor shed claim ends here.
        qualityShedFrom: null,
        // #1694 S2 — the creature shed is likewise a governor claim on the OLD document's population.
        creatureShed: 0,
        // #1574 — the travel shed is likewise a governor claim on the OLD document's roam.
        travelShed: false,
        // #1627 S1 — the weather shed is likewise a governor claim on the OLD document's air.
        weatherShed: false,
        // #1490 — the warp shed is likewise a governor claim on the OLD document's FX strata.
        feedbackWarpShed: false,
        layoutParams: normalizeLayoutParams(doc.layoutParams),
        customAssets: sanitizeOverlay(doc.customAssets),
        ingestError: null,
      };
      if (doc.enabledAssets && typeof doc.enabledAssets === 'object') {
        // #103 Track B — apply-path defense in depth: collapse hostile maps to
        // known asset ids (+ the doc's own sanitized custom assets) before they
        // reach the store.
        // #1062 — what the document lists IS the set. This used to seed the
        // default four ON and overlay the document, so an asset the file never
        // mentioned came back enabled and export -> import -> export widened.
        next.enabledAssets = wholeEnabledAssets(sanitizeEnabledAssets(doc.enabledAssets, next.customAssets));
      }
      if (doc.assetWeightOverrides && typeof doc.assetWeightOverrides === 'object') {
        next.assetWeightOverrides = { ...sanitizeAssetWeightOverrides(doc.assetWeightOverrides, next.customAssets) };
      } else {
        // The serializer omits the field when empty — without this, loading a
        // clean project over a session with overrides kept the old weights.
        next.assetWeightOverrides = {};
      }
      next.paletteOverrides = doc.paletteOverrides ?? null;
      next.paletteChosen = false; // #1365 — a loaded document's palette is the document's, not a pick made this session
      // #639 — an import is a new document: undo must never resurrect the
      // pre-import composition. This runs for every import, not just ones with
      // layers (a layerless doc used to leave stale undo history behind).
      next.historyUndoStack = [];
      next.historyRedoStack = [];
      // #638 — restore palette locks so harmony regeneration keeps building
      // around the swatches the designer pinned.
      next.paletteLocks = sanitizePaletteLocks(doc.paletteLocks) || {};
      next.light = sanitizeLight(doc.light); // #594 — a doc without a sun turns it off
      next.assetStill = sanitizeAssetStill(doc.assetStill) || {}; // #1128 — a doc without pins moves everything
      next.assetAttach = sanitizeAssetAttach(doc.assetAttach) || {}; // #1355
      // #1694 S3 — the creature count rides doc.layoutParams.creatures (installed above with the
      // rest of the params; parseProject lands a pre-fold-in document's top-level creatureCount
      // there). Homes are found again for the new dish either way.
      next.dishPins = [];
      next.assetKineme = { ...DEFAULT_ASSET_KINEME, ...sanitizeAssetKineme(doc.assetKineme) }; // #781 — a doc without kinemes is still; #705 — doc values win over the micro-HUD defaults
      next.regionKinemes = sanitizeRegionKinemesDoc(doc.regionKinemes) || {}; // #1434 — a doc without region edits leaves the family defaults alone
      next.assetOptions = sanitizeAssetOptions(doc.assetOptions, next.customAssets) || {}; // #1694 S2 — a doc without tile options is all-defaults (citizen family: both)
      next.audioRoutes = sanitizeAudioRoutes(doc.audioRoutes); // #790
      {
        const canvas = sanitizeCanvasSpec(doc);
        next.canvasW = canvas.canvasW;
        next.canvasH = canvas.canvasH;
        next.canvasFps = canvas.canvasFps;
        next.canvasPresetId = canvas.canvasPresetId;
        next.stageMode = canvas.stageMode;
      }
      {
        // #617 + #1720 — banks land together: the bank list, the active bank, and
        // the active bank's map as the `midiMap` mirror. A doc without banks
        // (the legacy midiMap shape) becomes the single MAIN bank.
        const banks = sanitizeMidiBanks(doc.midiBanks, doc.midiMap);
        const active = sanitizeMidiActiveBank(doc.midiActiveBank, banks);
        next.midiBanks = banks;
        next.midiActiveBank = active;
        next.midiMap = activeBankMap(banks, active);
      }
      next.mathMacros = sanitizeMathMacros(doc.mathMacros); // #724 — a doc without macros has none
      next.mathLearnArmed = null; // #724 — learn never survives a load; it is a gesture
      // #651 — reimported titles persist; a doc without a title clears it.
      next.projectTitle = typeof doc.title === 'string' ? doc.title.slice(0, 80) : '';
      if (Array.isArray(doc.layers) && doc.layers.length > 0 && doc.activeLayerId) {
        // #103 Track B — bound on the apply path too; the live loop resolves
        // every layer per frame.
        next.layers = doc.layers.slice(0, MAX_LAYERS);
        next.activeLayerId = doc.activeLayerId;
        next.layerSnapshots = normalizeSnapshots(doc.layerSnapshots, doc.customAssets, doc);
        // Install the active layer's snapshot onto live state. The serializer
        // writes lockedParams/caGrid only into snapshots (never root fields),
        // so without this a load silently dropped parameter locks and the CA
        // grid; and a doc whose root values disagree with its active snapshot
        // rendered the wrong composition until a layer switch. For well-formed
        // docs this is a no-op — the snapshot was captured from the same
        // state as the root values.
        const activeSnap = next.layerSnapshots[doc.activeLayerId];
        if (activeSnap) {
          next.seed = activeSnap.seed >>> 0;
          next.seedOffsets = normalizeSeedOffsets(activeSnap.seedOffsets ?? doc.seedOffsets);
          next.paletteId = activeSnap.paletteId || next.paletteId;
          next.paletteOverrides = activeSnap.paletteOverrides ?? null;
          next.layoutParams = normalizeLayoutParams(activeSnap.layoutParams);
          next.lockedParams = activeSnap.lockedParams || {};
          next.caGrid = activeSnap.caGrid || null;
          next.enabledAssets = wholeEnabledAssets(activeSnap.enabledAssets); // #1062 — the snapshot is the whole set too
        }
      }
      return next;
    }),
});

export { WEIGHT_CYCLE, initialEnabledAssets };
