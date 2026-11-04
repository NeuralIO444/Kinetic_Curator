// useVoiceMixDriver (#280) — advances an in-flight voice MIX toward t=1.
//
// The mix itself is render-side (the live loop interpolates via
// resolveLiveRenderState); this driver just moves the blend position and
// commits the target when the dissolve completes. Mounted once in App.

import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { loopClock } from '../gl/loopClock.js';

/**
 * #1935 — the bounded-crawl ceiling factor (RULED, Matt, 2026-11-02).
 *
 * The engine's presentation states are running / HELD / DRAGGING. While the
 * engine DRAGS (alive and advancing, but presented frames arrive slower
 * than real time), a MIX dissolve keeps blending on simulation time — the
 * gesture is unchanged — but no dissolve may outlive a wall-clock ceiling
 * of 1.5× its authored duration: past the ceiling it lands, through the
 * same commitVoiceMix landing as a natural t=1 (final state applied in
 * one undo step, bookkeeping settled).
 *
 * "Wall clock" here is presented time: loopClock.presentedMs, liveLoop's
 * accumulation of real frame deltas. It freezes while the engine is HELD
 * or the tab is hidden (no frames present), so held time can never bring
 * a landing closer — the freeze-holds-dissolve law (#806) is untouched,
 * and this file still reads no wall-clock API: both of its clocks arrive
 * via loopClock.
 */
export const MIX_WALL_CEILING_FACTOR = 1.5;

/**
 * #1935 — pure ceiling test, exported for the headless pin. True when the
 * mix's presented age has reached the bounded-crawl ceiling. A mix with
 * no presented stamp (or a not-yet-observed presented clock) never hits:
 * the ceiling governs DRAGGING, and an unstamped mix has no measured drag.
 */
export function mixCeilingHit(mix, presentedMs) {
  if (!mix || !Number.isFinite(mix.durationMs) || mix.durationMs <= 0) return false;
  if (!Number.isFinite(mix.presentedAt) || !Number.isFinite(presentedMs)) return false;
  return presentedMs - mix.presentedAt >= mix.durationMs * MIX_WALL_CEILING_FACTOR;
}

export function useVoiceMixDriver() {
  useEffect(() => {
    let raf = 0;
    // Ticks spent observing a dissolve that can never start (engine held,
    // t still 0). We hold the bar for a short beat before cutting so it
    // paints and the name is readable — then cut to the target.
    // (20 rAF ticks ≈ 1/3s at 60fps; the e2e polls on rAF too.)
    let heldTicks = 0;
    const HELD_CUT_TICKS = 20;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = useStore.getState();
      const mix = s.voiceMix;
      if (!mix || !mix.auto) {
        heldTicks = 0;
        return;
      }
      // #806: the dissolve rides the loop clock — but a dissolve needs presented
      // frames. If the engine is held (paused / watchdog trip) the loop clock is
      // frozen, so a dissolve that never started can never progress: cut to the
      // target instead of hanging the mix-bar forever. A dissolve already in
      // flight (t > 0) keeps holding per the freeze-holds-dissolve law and
      // resumes when the engine does. No wall clock here — this is a held-clock
      // cut, not a wall timeout.
      if (!s.running && mix.t <= 0) {
        if (++heldTicks >= HELD_CUT_TICKS) s.commitVoiceMix();
        return;
      }
      heldTicks = 0;
      // #806: MIX dissolve is a must-loop performer — advance off the loop
      // clock, not wall clock, so a freeze/pause holds the dissolve instead
      // of completing it invisibly. Unobserved clock (<= 0) holds at t=0.
      const nowMs = loopClock.ms > 0 ? loopClock.ms : mix.startedAt;
      const t = Math.min(1, Math.max(0, nowMs - mix.startedAt) / mix.durationMs);
      if (t >= 1) {
        // commitVoiceMix is a plain store action — no setState-in-effect.
        s.commitVoiceMix();
        return;
      }
      // #1935 bounded crawl: on a DRAGGING engine the sim-time t above can
      // take unbounded wall time to reach 1 (the loop credits at most
      // 50 ms of sim per presented frame). Past the presented-age ceiling
      // the dissolve lands instead — the same commit as t=1, never a
      // partial snap. Gated on running: while HELD, presentedMs is frozen
      // anyway, but the gate states the law — a held dissolve is never
      // landed by the ceiling.
      if (s.running && mixCeilingHit(mix, loopClock.presentedMs)) {
        s.commitVoiceMix();
        return;
      }
      // advanceVoiceMix (not setVoiceMixT): the driver's own writes must not
      // pause the auto-advance it is driving.
      s.advanceVoiceMix(t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
