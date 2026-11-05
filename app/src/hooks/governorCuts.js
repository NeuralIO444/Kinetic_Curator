// governorCuts — the Showrunner's cut ORDER, as a pure module (#192).
//
// usePerformanceGovernor owns timing (sustain windows, cooldown); this
// module owns the ORDER of cuts. The order is the contract:
//
//   cut 0: edge AA off (FXAA, #740) — cosmetic and the cheapest thing to lose;
//          gated on gpuSaturated like cut 1, fires only when the caller says
//          fxaa === true (armed and not already shed)
//   cut 1: dynamic resolution scaling (renderScale 1 → 0.75 → 0.5 → 0.33)
//          gated on the gpuSaturated signal (#259): fires only when the GPU
//          is the bottleneck — otherwise it only pixelates.
//   cut 1.4: mark weather (#1627 S1) — the mark-born motes shed FIRST
//          among everything the picture can lose: weather dies before
//          marks, before the population, before travel. Only edge AA
//          and the pixel trim precede it, and those cost the picture
//          nothing. One boolean step off the weatherShed overlay — no
//          recipe ever carried weather, so nothing authored moves —
//          restoring whole when pressure clears. Fires only when the
//          caller says weather is live (weatherActive: a spawn source
//          the engine measures is present — sun spec pool, dish, or
//          traveling marks — and the rung is not already shed), so
//          older callers and their pinned ladder walks see the ladder
//          exactly as it was. NOT the #1183 WEATHER dial (haze-as-air):
//          that response is weather/haze-air, tier 1, a different cut.
//   cut 1.45: spectral feedback warp (#1490) — the FX stratum's feedback
//          warp sheds after mark weather (cut 1.4 still dies first: weather
//          before marks stands) and BEFORE the creature count (cut 1.5 is
//          not moved): the issue's law is "a cost tier the governor sheds
//          before body counts", and 1.45 is the rung that makes both laws
//          literally true at once. One boolean step off the
//          feedbackWarpShed overlay — the artist's FX item amount never
//          moves — restoring whole when pressure clears. Fires only when
//          the caller says the warp is live (feedbackWarpActive: an FX
//          layer carries a feedbackWarp item with amount > 0, ACCUM is on
//          — no feedback buffer, no warp — and the rung is not already
//          shed), so older callers and their pinned ladder walks see the
//          ladder exactly as it was.
//   cut 1.47: selective ACCUM feed (#1806 slice 2) — the subset render
//          sheds after the feedback warp (cut 1.45, its ACCUM family) and
//          BEFORE the creature count: the presented frame costs the
//          picture nothing (only what the buffer remembers changes —
//          every stratum trails again), and it drops a whole partial
//          render. One boolean step off the accumFeedShed overlay — the
//          strata's FEEDS ACCUM flags never move — restoring whole when
//          pressure clears. Fires only when the caller says a selection
//          is live (accumFeedActive: a feed-capable stratum is flagged
//          off, ACCUM is on, and the rung is not already shed), so older
//          callers and their pinned ladder walks see the ladder exactly
//          as it was. Ahead of cut 3 by design: the subset degrades to
//          the composite path BEFORE ACCUM itself sheds (the issue's
//          cost paragraph).
//   cut 1.48: ember steering (#1837, ACCUM rung 2 slice 2) — the moths'
//          trail-following drive sheds after the selective feed (cut 1.47,
//          its ACCUM family) and BEFORE the creature count: the population
//          stays on stage whole, it just stops grazing the light — the
//          grid freezes, the borrowed offsets walk home, and the moths
//          fall back to today's drives (the issue's own shed law: steering
//          sheds before the buffer itself, cut 3). One boolean step off
//          the trailSteerShed overlay — the look's declared weight never
//          moves — restoring whole when pressure clears. Fires only when
//          the caller says steering is live (trailSteerActive: a look
//          declaring an ember weight is up, creatures may exist, ACCUM is
//          on, and the rung is not already shed), so older callers and
//          their pinned ladder walks see the ladder exactly as it was.
//   cut 1.5: creature count (#1694 slice 2, Matt's ruling Q2) — the population
//          sheds FIRST among content cuts, before the quality tier and every
//          finish below it; only edge AA and the pixel trim precede it, and
//          those cost the picture nothing. One creature per governor step,
//          off the creatureShed overlay — the artist's count never moves —
//          and the population restores whole when pressure clears.
//   cut 1.6: travel (#1574) — FLOW transport sheds AFTER the creature count
//          (cut 1.5 is not moved; Matt's population-first ruling stands) and
//          ahead of the quality tier step and the motion freeze: velocities
//          zero, marks settle home, and the frame degrades to exactly the
//          still behaviour. One boolean step off the travelShed overlay —
//          the artist's transport params never move — restoring whole when
//          pressure clears. Fires only when the caller says travel is
//          live (travelActive: the scene's transport is 'flow', leash > 0,
//          and the rung is not already shed), so older callers and their
//          pinned ladder walks see the ladder exactly as it was.
//   cut 2: quality tier step high → balanced → performance
//   cut 3: mirror/gloss/ACCUM shed (perfTier1 — independent, lower FPS floor)
//   cut 4: cost-aware asset thinning
//   cut 5: render-only count clamp below the PERF floor
//   cut 6: freeze motion via slowRender
//   cut 7: watchdog hard stop (armed only once the ladder above is
//          exhausted — #1919 ladder-first, see watchdogMayTrip)
//
// Phase 6 change: cuts 1–2 of the old ladder (FX simplify, then FX bypass —
// the fxShedLevel mechanism) are GONE. On the GPU, FX compositing is one
// extra FBO pair + one filter pass per wrap — 10–50x headroom — so shedding
// FX layers buys nothing and caused the silent-cull trap: an FX layer shown
// in the UI while its wrap was culled. The primary shed is now dynamic
// resolution scaling: render scale drops before anything is cut. FX layers
// are never culled in normal operation.
//
// Hardening 3/6: the ladder's per-effect knowledge now comes from the cost
// registry (gl/costTiers.mjs) instead of hard-coded comments. The ORDER
// above is unchanged — the contract — but the inputs are honest: cut 3's
// coverage is tier1ShedIds(), the memory gate on echoes is declared on
// accum/echo and enforced by the recipe, and the CI gate
// (gl/costTiers.selfcheck.mjs) proves declared tiers match measured GPU
// cost. Every cut is still a render-only overlay: it never writes
// layoutParams, never serializes into project JSON, and auto-clears on
// recovery — except the hard stop, which needs manual resume (panic-key
// precedent, #107).
//
// Kept pure (no React, no store) so the order is unit-testable — see
// gl/phase6.selfcheck.mjs, which asserts resolution sheds before effects
// and that no FX-culling cut exists.

import { tier1ShedIds } from '../gl/costTiers.mjs';

/**
 * #265 — when is the GPU the binding constraint? Cut 1 (resolution) may
 * only fire when dropping pixels can buy frames back: the GPU-implied rate
 * is below the shed floor AND at or below the rAF rate. The old predicate
 * also required rAF fps to stay healthy — false exactly when BOTH rates
 * were below the floor, the case where the GPU is demonstrably the
 * bottleneck and resolution is the one cut that would buy frames back.
 */
export function isGpuBinding(fps, gpuFps, shedFps) {
  return gpuFps < shedFps && gpuFps <= fps;
}

/**
 * #264 — the restore contract, declarative. Every kind nextGovernorCut can
 * produce MUST appear here: recovery iterates this table in REVERSE shed
 * order, so a shed cut with no entry here is a structural impossibility —
 * not a forgotten line in a hand-maintained block (the trap that left
 * quality shed forever). needsRestore is pure: a state snapshot plus
 * ctx { healthy } (the main ladder's recover condition). The hook binds
 * the restore actions per kind.
 *
 * Not here by design: cut 3 (perfTier1) is the independent mechanism with
 * its own hysteresis, and cut 7 (watchdog) is the hard stop — it needs
 * manual resume and never auto-restores.
 */
export const GOVERNOR_RESTORE_CUTS = [
  {
    kind: 'fxaa',
    // #740 — cut 0. Restores LAST (the table is walked in reverse): the
    // cheapest cut to lose is the last thing to come back.
    needsRestore: (s, ctx) => ctx.healthy && !!s.fxaaShed,
    restoredLabel: 'EDGE AA back on',
  },
  {
    kind: 'renderScale',
    needsRestore: (s, ctx) => ctx.healthy && Number(s.renderScale) < 1 - 1e-9,
    restoredLabel: 'PIXEL TRIM off — full pixels back',
  },
  {
    kind: 'dishLife',
    // #1923 — cut 1.39: the quiet culture sheds BEFORE weather (it is the lightest sacrifice: a
    // secondary read, never the picture itself), so it restores AFTER weather in the reverse walk.
    needsRestore: (s, ctx) => ctx.healthy && (s.dishLifeShed | 0) > 0,
    restoredLabel: 'culture back — the dish catches up',
  },
  {
    kind: 'markWeather',
    // #1627 S1 — weather restores after the population and travel in
    // the reverse walk (it shed before them): the finest level is the
    // last thing to come back, like edge AA at the other end.
    needsRestore: (s, ctx) => ctx.healthy && !!s.weatherShed,
    restoredLabel: 'weather back — motes return',
  },
  {
    kind: 'feedbackWarp',
    // #1490 — cut 1.45: the warp restores after the population in the
    // reverse walk (it shed before it): finer sacrifices come back later.
    needsRestore: (s, ctx) => ctx.healthy && !!s.feedbackWarpShed,
    restoredLabel: 'feedback warp back — the music bends the trails again',
  },
  {
    kind: 'accumFeed',
    // #1806 slice 2 — cut 1.47: the selective feed restores after the
    // warp in the reverse walk (it shed after it, before the population):
    // finer sacrifices come back later.
    needsRestore: (s, ctx) => ctx.healthy && !!s.accumFeedShed,
    restoredLabel: 'selective feed back — chosen strata only',
  },
  {
    kind: 'trailSteer',
    // #1837 — cut 1.48: ember steering restores after the selective feed
    // in the reverse walk (it shed after it, before the population): the
    // moths graze the cooling light again.
    needsRestore: (s, ctx) => ctx.healthy && !!s.trailSteerShed,
    restoredLabel: 'ember steering back — moths graze the light again',
  },
  {
    kind: 'creatureCount',
    // #1694 S2 — the shed stepped one creature at a time; the restore brings
    // the whole population back in one pass (this table's convention).
    needsRestore: (s, ctx) => ctx.healthy && (s.creatureShed | 0) > 0,
    restoredLabel: 'creatures back — full cast',
  },
  {
    kind: 'travel',
    // #1574 — travel sheds after the population and before the tier; the
    // restore brings the roam back whole (this table's convention).
    needsRestore: (s, ctx) => ctx.healthy && !!s.travelShed,
    restoredLabel: 'travel back — marks roam again',
  },
  {
    kind: 'quality',
    // #264 M1 — quality restores only when the GOVERNOR shed it
    // (qualityShedFrom tracks the tier it stepped down from); a
    // user-chosen tier is never "restored" over.
    needsRestore: (s, ctx) => ctx.healthy && s.qualityShedFrom != null,
    restoredLabel: 'tier restored',
  },
  {
    kind: 'assetThin',
    needsRestore: (s, ctx) => ctx.healthy && !!s.assetThin,
    restoredLabel: 'dead weight back — full cast',
  },
  {
    kind: 'countClamp',
    // The count clamp's premise is "still struggling at the lowest tier",
    // so it also clears on tier change — the nuance the old block carried.
    needsRestore: (s, ctx) => !!s.perfClampOverride && (ctx.healthy || s.quality !== 'performance'),
    restoredLabel: 'crowd control lifted',
  },
  {
    kind: 'slowRender',
    // #264 — the auto-clear applies ONLY to the cut-6 soft freeze. The
    // watchdog hard stop (source 'watchdog') needs manual resume.
    needsRestore: (s, ctx) => ctx.healthy && !!s.slowRender && s.slowRenderSource === 'cut6',
    restoredLabel: 'freeze frame off — motion back',
  },
];

/** Dynamic resolution ladder — the primary shed. GPU headroom means the
 *  live canvas can drop pixels before it drops anything visible. */
export const RENDER_SCALES = [1, 0.75, 0.5, 0.33];

/** The lowest render scale the ladder reaches. */
export const MIN_RENDER_SCALE = RENDER_SCALES[RENDER_SCALES.length - 1];

/**
 * Cut 3's coverage — the passes the independent perfTier1 mechanism sheds.
 * Read from the cost registry (tier 1 = "shed first": the ACCUM chain),
 * not hard-coded here. Resolved at call time: registrations land when the
 * effect modules load, so this must not be snapshotted at import time.
 * The shed ORDER is unchanged; this is the input the registry owns.
 *
 * @returns {string[]} effect ids at cost tier 1 (e.g. accum/fade, …).
 */
export function perfTier1Passes() {
  return tier1ShedIds();
}

/**
 * Decide the next governor cut, given the current governor state.
 *
 * @param {object} s
 *   { renderScale, quality, assetThin, perfClampOverride, effectiveCount, slowRender, gpuSaturated }
 *   gpuSaturated: the governor's GPU-saturation signal — the GPU-implied
 *   rate is the binding constraint (at/below the rAF rate and below the
 *   shed floor, see isGpuBinding). Cut 1 (renderScale) only fires when
 *   true: if the GPU is NOT the bottleneck, the bottleneck is main-thread
 *   JS and cutting resolution cannot recover frames — it only pixelates.
 *   Omitted (older callers, selfchecks) defaults to true: resolution still
 *   sheds first when the signal is unknown.
 * @returns {{ kind: string, label: string, ... } | null} the cut to apply,
 *   or null when the ladder is exhausted (the hook then holds — and only
 *   then is the watchdog armed: #1919 ladder-first, see watchdogMayTrip).
 */
export function nextGovernorCut(s) {
  const gpuSaturated = s.gpuSaturated !== false; // unknown signal: shed as before
  // Cut 0 (#740): edge AA. Opt-in per caller (`fxaa === true` = the user has it
  // on and the governor has not already shed it) so older callers and their
  // selfchecks keep the pre-#740 ladder. Same GPU-bound gate as cut 1: if the
  // GPU is not the bottleneck, dropping AA cannot buy frames back.
  if (s.fxaa === true && gpuSaturated) {
    return { kind: 'fxaa', label: 'EDGE AA OFF' };
  }
  const scale = Number(s.renderScale);
  // Cut 1: dynamic resolution scaling. Unknown/NaN scale snaps to full.
  // Skipped outright when the GPU is not the bottleneck (#259): pixels
  // drop only when dropping pixels can buy frames back.
  const cur = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const next = gpuSaturated ? RENDER_SCALES.find((step) => step < cur - 1e-9) : undefined;
  if (next !== undefined) {
    return {
      kind: 'renderScale',
      scale: next,
      label: `PIXEL TRIM → ${Math.round(next * 100)}%`,
    };
  }

  // Cut 1.39 (#1923): the quiet culture (DISH LIFE). The first sacrifice after the pixel trim — it is a
  // secondary read (marks breathing near living colonies), so shedding it costs the picture nothing. Two steps, a balanced
  // fall: TRICKLE (one generation per frame — it keeps moving, slowly), then HELD (the generation freezes; the
  // frame still draws). Opt-in per caller (`dishLifeActive === true` = the quiet layer is on) so older callers and
  // their pinned ladder walks keep the pre-#1923 ladder exactly as it was.
  if (s.dishLifeActive === true && (s.dishLifeShed | 0) < 2) {
    const dishLifeShed = (s.dishLifeShed | 0) + 1;
    return {
      kind: 'dishLife',
      dishLifeShed,
      label: dishLifeShed === 1 ? 'CULTURE TRICKLE — the dish slows' : 'CULTURE HELD — the dish holds still',
    };
  }

  // Cut 1.4 (#1627 S1): mark weather. FIRST among the picture's own
  // cuts — the motes are the fine read, and the fine read is the
  // designated first sacrifice (the issue's law: weather dies before
  // marks). Opt-in per caller (`weatherActive === true` = a measured
  // spawn source is live and the rung is not already shed) so older
  // callers and their pinned ladder walks keep the pre-#1627 ladder.
  if (s.weatherActive === true && !s.weatherShed) {
    return { kind: 'markWeather', weatherShed: true, label: 'WEATHER CLEAR — motes shed' };
  }

  // Cut 1.45 (#1490): the spectral feedback warp. After mark weather
  // (cut 1.4 stands — weather still dies before marks) and ahead of the
  // creature count: the warp is a finish the music drives, and finishes
  // shed before body counts. Opt-in per caller (`feedbackWarpActive ===
  // true` = an FX feedbackWarp item is up with ACCUM on, not already
  // shed) so older callers and their pinned ladder walks keep the ladder
  // exactly as it was.
  if (s.feedbackWarpActive === true && !s.feedbackWarpShed) {
    return { kind: 'feedbackWarp', feedbackWarpShed: true, label: 'FEEDBACK WARP OFF — trails run straight' };
  }

  // Cut 1.47 (#1806 slice 2): the selective ACCUM feed. After the
  // feedback warp (cut 1.45 stands — the ACCUM family sheds together)
  // and ahead of the creature count: dropping the subset render costs
  // the presented frame nothing — the buffer simply eats the composite
  // again and every stratum trails — and it buys back a whole partial
  // render. Opt-in per caller (`accumFeedActive === true` = a stratum
  // selection is live with ACCUM on, not already shed) so older callers
  // and their pinned ladder walks keep the pre-#1806 ladder.
  if (s.accumFeedActive === true && !s.accumFeedShed) {
    return { kind: 'accumFeed', accumFeedShed: true, label: 'SELECTIVE FEED OFF — all strata trail' };
  }

  // Cut 1.48 (#1837): ember steering. After the selective feed (cut 1.47
  // stands — the ACCUM family sheds together) and ahead of the creature
  // count: holding the drive costs the picture nothing but the grazing —
  // the moths stay, whole and hovering, on today's drives — and it buys
  // back the grid's readback + derivation at cadence. Ahead of cut 3 by
  // design: steering degrades BEFORE the buffer it reads is stood down
  // (the issue's shed law). Opt-in per caller (`trailSteerActive ===
  // true` = a declaring look is up with creatures and ACCUM live, not
  // already shed) so older callers and their pinned ladder walks keep
  // the pre-#1837 ladder exactly as it was.
  if (s.trailSteerActive === true && !s.trailSteerShed) {
    return { kind: 'trailSteer', trailSteerShed: true, label: 'EMBER STEERING HELD — moths keep to their pins' };
  }

  // Cut 1.5 (#1694 slice 2, Matt's ruling on #1694 Q2): the creature count
  // sheds FIRST among content cuts — population before finishes. One
  // creature per step, off the creatureShed overlay; the artist's count is
  // never written. Both fields default to 0 when absent, so callers that
  // predate the citizen (and their pinned ladder walks) see the ladder
  // exactly as it was.
  const creatureCount = s.creatureCount | 0;
  const creatureShed = s.creatureShed | 0;
  if (creatureCount - creatureShed > 0) {
    return {
      kind: 'creatureCount',
      creatureShed: creatureShed + 1,
      label: `CREATURES → ${creatureCount - creatureShed - 1}`,
    };
  }

  // Cut 1.6 (#1574): travel. After the population (cut 1.5 stands), ahead
  // of the quality tier and the motion freeze. Opt-in per caller
  // (`travelActive === true` = a live FLOW scene, not already shed) so
  // older callers and their pinned ladder walks keep the pre-#1574 ladder.
  if (s.travelActive === true && !s.travelShed) {
    return { kind: 'travel', travelShed: true, label: 'TRAVEL HELD — marks settle home' };
  }

  // Cut 2: quality tier step (placement + particle budgets).
  if (s.quality === 'high') {
    return { kind: 'quality', quality: 'balanced', label: 'TIER DROP → BALANCED' };
  }
  if (s.quality === 'balanced') {
    return { kind: 'quality', quality: 'performance', label: 'TIER DROP → PERF' };
  }

  // Cut 4: cost-aware asset thinning. (Cut 3 — mirror/gloss/ACCUM — is the
  // independent perfTier1 mechanism at its own lower FPS floor; its pass
  // coverage is perfTier1Passes(), read from the cost registry.)
  if (!s.assetThin) {
    return { kind: 'assetThin', label: 'DEAD WEIGHT — costliest assets cut first' };
  }

  // Cut 5: render-only count clamp below the PERF floor. A live-only
  // performance cut must never be what a snapshot inherits, so this lands
  // on perfClampOverride, never on layoutParams.
  const eff = s.perfClampOverride?.count ?? s.effectiveCount;
  if (Number.isFinite(eff) && eff > 120) {
    const count = Math.max(80, Math.floor(eff * 0.7));
    return { kind: 'countClamp', count, label: `CROWD CONTROL → ${count} (live only)` };
  }

  // Cut 6: freeze motion. Reuses the tested slowRender path (pauses
  // evolve/ambient-drift/ACCUM/swarm). A still instrument beats a dead one.
  if (!s.slowRender) {
    return { kind: 'slowRender', label: 'FREEZE FRAME — motion held' };
  }

  // Ladder exhausted — hold. Only from here is the watchdog (cut 7)
  // armed: the hook gates its trip on this null (#1919 ladder-first).
  return null;
}

/**
 * #1919 — ladder-first (Matt's ruling, 2026-11-01): the watchdog (cut 7)
 * is the ladder's LAST rung, not a separate trigger racing it. The hook's
 * critical effect asks this gate before its 800 ms window may run:
 *
 *   - While a rung the ladder is eligible to apply remains
 *     (nextGovernorCut answers non-null on the same snapshot the ladder
 *     effect applies from) AND the rate is inside the ladder's own shed
 *     region (effFps < shedFps), the watchdog WAITS. The ladder's own
 *     cadence — sustain window, then one cut per cooldown — governs how
 *     fast the rungs land; there is no separate grace timer.
 *   - Once the ladder is exhausted (nextGovernorCut null), the watchdog
 *     is armed exactly as before: the caller runs its sustained window
 *     below CRITICAL_FPS and trips.
 *   - A shed floor tuned below the current rate (GOV TUNE) takes the
 *     ladder out of play at that rate — its effect will not fire there —
 *     so there is nothing for the watchdog to wait for and the gate
 *     releases even with rungs standing.
 *
 * Pure like the rest of this module, so the ordering is unit-testable:
 * governorCuts.selfcheck.mjs walks the ladder under sustained critical
 * pressure and pins the gate at every step, boot state included.
 *
 * @param {object} s the same snapshot nextGovernorCut consumes.
 * @param {object} ctx { effFps, shedFps } — the rate being judged and
 *   the ladder's live shed floor.
 * @returns {boolean} true when the watchdog may run its trip window.
 */
export function watchdogMayTrip(s, ctx = {}) {
  if (nextGovernorCut(s) == null) return true; // ladder exhausted — armed
  const { effFps, shedFps } = ctx;
  // Rungs remain: wait — unless the rate sits outside the ladder's shed
  // region (a tuned floor below this rate), where the ladder cannot act.
  return Number.isFinite(effFps) && Number.isFinite(shedFps) && effFps >= shedFps;
}

/**
 * The frozen-frame bound (#1919 carve-out): how long the stage may go
 * without completing a frame before the watchdog calls it a hang.
 * Sized off the living floor: at 1 fps a frame lands every 1000 ms and
 * the patrol syncs the loop's reports at ~4 Hz, so the widest gap
 * between observed completions in a scene that is still alive is
 * ~1.3 s — the bound must clear it, or slow scenes would read as
 * frozen. 2000 ms clears it with room, a single long hitch or a
 * shader-compile pause inside it never trips, and a true hang still
 * stops in about two seconds.
 */
export const FRAME_STALL_MS = 2000;

/**
 * #1919 carve-out — has the frame stream gone silent past the bound?
 * The third hard trip, alongside 'accum-nan' and 'render-error': a
 * frozen frame is a hang, not a perf problem, so this predicate is
 * deliberately NOT gated on ladder state (watchdogMayTrip above is the
 * fps-critical gate; the two never consult each other). It keys on
 * frame COMPLETION, not on a rate average: a throttled-but-alive scene
 * (frames completing at 1–9 fps) keeps its heartbeat fresh and stays
 * ladder territory. `lastFrameAt` is the wall time of the last
 * completed frame the caller observed; null (no frame observed yet —
 * a scene that has never drawn) never stalls: that is the rate path's
 * problem, not a hang.
 */
export function frameStalled(lastFrameAt, now, boundMs = FRAME_STALL_MS) {
  return Number.isFinite(lastFrameAt) && Number.isFinite(now) && now - lastFrameAt >= boundMs;
}

/**
 * The live loop's dt clamp (Spine A, liveLoop.mjs's tick): every
 * presented frame advances loopTimeMs by the frame's real delta
 * clamped to [8, 50] ms, so a tab-switch or GC stall can't spike the
 * physics into a single huge step. The crawl measurement below
 * replays this exact arithmetic over the patrol's frame-delta
 * stream — if the loop's clamp ever moves, these constants must
 * move with it.
 */
export const LOOP_DT_MIN_MS = 8;
export const LOOP_DT_MAX_MS = 50;

/**
 * The crawl window (#1919 Option B, Matt's ruling 2026-11-01): the
 * trailing span of wall time the crawl predicate judges. ~4 s is
 * long enough that a hitch or a shader compile inside it cannot
 * swing the verdict (and any silence long enough to dominate it is
 * the stall trip's catch first), and short enough that a true crawl
 * trips in seconds — the failure this answers gave the specs 60 s
 * while the ladder gate held the watchdog for a 70–95 s walk.
 */
export const CRAWL_WINDOW_MS = 4000;

/**
 * The crawl floor: the window must hold at least this many presented
 * frames before it reads as a RATE. A couple of giant gaps is a
 * silence — the stall trip's story — not a crawl; eight frames
 * spanning the window is a tempo.
 */
export const CRAWL_MIN_FRAMES = 8;

/**
 * The crawl threshold: loop time gaining less than this fraction of
 * wall time across the window is a crawl. In even-cadence terms the
 * booked share is fps × 50 / 1000 below 20 fps, so 0.25 is a
 * sustained ~5 fps — deep under CRITICAL_FPS, in the band the
 * fps-critical watchdog used to own outright. Above it (10 fps
 * books 0.5) the ladder-first gate governs untouched: this trip
 * never reaches into the shed band.
 */
export const CRAWL_MAX_LOOP_RATIO = 0.25;

/**
 * #1919 Option B — measure how fast loop time is advancing against
 * wall time over the trailing window, from the patrol's rAF delta
 * stream (useFpsMeter's ring — the same honest distribution the GOV
 * TUNE histogram reads, because the FPS average lies about exactly
 * this). Each delta is one presented-frame interval on the shared
 * main thread; replaying the loop's own clamp over the stream gives
 * the advance loopTimeMs actually booked: a delta at or under the
 * 50 ms ceiling books itself whole, a longer one books 50.
 *
 * The walk runs newest → oldest until it holds BOTH the full window
 * of wall time and the minimum frame count (a sparse stream fills
 * the frame count past the window; the measurement is then over
 * that longer span, and "sustained" is satisfied a fortiori). A
 * delta at or over FRAME_STALL_MS ends the measurable episode: that
 * silence is the stall trip's jurisdiction (in the live wiring its
 * trip latches first), and the rate is judged on the completing
 * stream since it. Returns null when the stream cannot fill the
 * window — too little history is no verdict, never a trip.
 *
 * The healthy invariant is arithmetic, not tuning: at 41 fps the
 * raw delta is ~24.4 ms, under the clamp ceiling, so every frame
 * books its full delta and loop time gains exactly wall time
 * (ratio 1) — the crawl trip cannot fire there, or anywhere at or
 * above 20 fps, whatever the ladder is doing. Matt's incident ran
 * at rAF 41 fps: this trip is silent there by construction.
 *
 * @param {number[]} deltas frame deltas, oldest → newest (ms)
 * @returns {{ wallMs: number, loopMs: number, frames: number, ratio: number } | null}
 */
export function measureLoopRate(deltas, windowMs = CRAWL_WINDOW_MS, minFrames = CRAWL_MIN_FRAMES) {
  if (!Array.isArray(deltas)) return null;
  let wallMs = 0;
  let loopMs = 0;
  let frames = 0;
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i];
    if (!Number.isFinite(d) || d < 0) continue;
    // A stall-bound silence inside the stream ends the episode —
    // judge only the completing stream after it (see above).
    if (d >= FRAME_STALL_MS) break;
    wallMs += d;
    loopMs += Math.max(LOOP_DT_MIN_MS, Math.min(LOOP_DT_MAX_MS, d));
    frames++;
    if (wallMs >= windowMs && frames >= minFrames) break;
  }
  if (wallMs < windowMs || frames < minFrames) return null;
  return { wallMs, loopMs, frames, ratio: loopMs / wallMs };
}

/**
 * #1919 Option B — is loop time crawling? The second carve-out,
 * sibling to frameStalled: frames are COMPLETING (the stall
 * heartbeat is fresh), yet each completion books at most 50 ms of
 * loop time while wall time runs full — bars stretch to many times
 * their length, loop-time landings crawl, and the main thread
 * saturates behind frames that take hundreds of ms to present.
 * Like the stall, this predicate is deliberately NOT gated on
 * ladder state: the crawl is a hang-class pathology (the thread is
 * drowning), not a perf problem the ladder sheds its way out of —
 * and left alone it holds the fps-critical trip hostage for the
 * whole ladder walk behind the gate. Unlike the stall, it keys on
 * the RATE loop time advances, not on silence.
 */
export function loopTimeCrawling(deltas, opts = {}) {
  const m = measureLoopRate(deltas, opts.windowMs ?? CRAWL_WINDOW_MS, opts.minFrames ?? CRAWL_MIN_FRAMES);
  return m != null && m.ratio < (opts.maxRatio ?? CRAWL_MAX_LOOP_RATIO);
}

/**
 * Honest shed summary for the UI badge (#192, coordinates with #177).
 * Returns null when nothing is shed; otherwise a short list of what's cut.
 */
export function shedSummary(s) {
  const out = [];
  if (Number(s.renderScale) < 1 - 1e-9) {
    out.push(`pixel trim ${Math.round(Number(s.renderScale) * 100)}%`);
  }
  // #1923 — and about a culture shed: the dish slowed or held.
  if ((s.dishLifeShed | 0) === 1) out.push('culture slowed');
  if ((s.dishLifeShed | 0) >= 2) out.push('culture held');
  // #1627 S1 — the badge is honest about a weather shed.
  if (s.weatherShed) out.push('weather clear');
  // #1490 — and about a warp shed: the trails run straight, the badge says so.
  if (s.feedbackWarpShed) out.push('feedback warp off');
  // #1806 slice 2 — and about an accum-feed shed: the buffer eats every
  // stratum again, the badge says so.
  if (s.accumFeedShed) out.push('accum feed — all strata');
  // #1837 — and about an ember-steering shed: the moths keep to their
  // pins on today's drives, the badge says so (the show block's report).
  if (s.trailSteerShed) out.push('ember steering held');
  // #1694 S2 — the badge is honest about a population shed.
  if ((s.creatureShed | 0) > 0) {
    out.push(`creatures −${s.creatureShed | 0}`);
  }
  // #1574 — and about a travel shed: held marks read as settled home.
  if (s.travelShed) out.push('travel held');
  // #264 — governor-shed quality is a shed like any other: the badge shows
  // it. qualityShedFrom is only set by the governor's own shed, so a
  // user-chosen tier never appears here.
  if (s.qualityShedFrom != null && s.quality !== s.qualityShedFrom) {
    out.push(`tier → ${String(s.quality).toUpperCase()}`);
  }
  if (s.fxaaShed) out.push('edge AA off');
  if (s.perfTier1) out.push('shine off');
  if (s.assetThin) out.push('dead weight cut');
  if (s.perfClampOverride) out.push(`crowd control → ${s.perfClampOverride.count}`);
  if (s.slowRender) out.push('freeze frame');
  if (s.watchdogTripped) out.push('watchdog — hard stop');
  return out.length ? out : null;
}

/**
 * #103 Track A — GPU-implied frame rate from the live loop's per-tick GPU
 * timing (stageTimings.gpuFrame, rolling-average ms reported by the live
 * loop via reportStage). Under vsync the rAF cadence lies: the GPU can be
 * saturated (fill-rate, ACCUM ping-pong) while FPS reads 60. Absent timing
 * (no live loop, no samples yet) this returns Infinity so the governor
 * reduces exactly to the rAF rate.
 */
export function gpuImpliedFps(stageTimings) {
  const ms = Number(stageTimings?.gpuFrame) || 0;
  return ms > 0 ? 1000 / ms : Infinity;
}

/**
 * The rate the governor's sustain windows run against: the worse of the
 * rAF rate and the GPU-implied rate. A GPU-bound instrument (rAF 60, GPU
 * frame 40ms → 25fps) trips the same sustain windows as sustained low FPS.
 */
export function effectiveGovernorFps(fps, stageTimings) {
  return Math.min(fps, gpuImpliedFps(stageTimings));
}
