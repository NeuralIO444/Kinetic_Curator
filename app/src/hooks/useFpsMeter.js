// useFpsMeter — real rAF-based FPS measurement
// Updates the Zustand store ~4 times per second to avoid thrashing UI.
//
// Showrunner patrol (§4): alongside FPS this also carries per-stage frame
// timings. Any pipeline stage can call reportStage('kernel', ms); samples
// are aggregated as rolling averages and synced to the store at the same
// 4Hz cadence. The patrol itself must stay cheap (TouchDesigner lesson:
// the Probe costs 3.5ms) — sampling, never per-frame store writes.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

// Module-level sampler: name -> { total, n }. Module-level (not a ref) so
// non-React pipeline code can report without a hook instance.
const stageSamples = new Map();

/**
 * Report one timed sample for a pipeline stage (e.g. 'kernel').
 * Cheap: a Map write. Aggregation + store sync happen in the meter tick.
 */
export function reportStage(name, ms) {
  if (!name || !Number.isFinite(ms) || ms < 0) return;
  let s = stageSamples.get(name);
  if (!s) {
    s = { total: 0, n: 0 };
    stageSamples.set(name, s);
  }
  s.total += ms;
  s.n += 1;
}

/**
 * Time a synchronous function and report it as a stage sample.
 * The patrol owns its own stopwatch: keeping the performance.now() calls
 * in this plain module function (not a component/hook) keeps instrumented
 * components pure under react-hooks/purity.
 */
export function timeStage(name, fn) {
  const t0 = performance.now();
  const out = fn();
  reportStage(name, performance.now() - t0);
  return out;
}

export function useFpsMeter(enabled = true) {
  const setFps = useStore(s => s.setFps);
  const setStageTimings = useStore(s => s.setStageTimings);
  const framesRef = useRef(0);
  const lastReportRef = useRef(0);
  const rafRef = useRef(null);
  // Rolling frame-delta stats for the patrol: avg + worst in window.
  const deltasRef = useRef([]);

  useEffect(() => {
    if (!enabled) return;

    lastReportRef.current = performance.now();
    framesRef.current = 0;
    deltasRef.current = [];
    let lastTick = performance.now();

    const tick = (now) => {
      framesRef.current += 1;
      const delta = now - lastTick;
      lastTick = now;
      const deltas = deltasRef.current;
      deltas.push(delta);
      if (deltas.length > 120) deltas.shift(); // ~2s window at 60fps

      const elapsed = now - lastReportRef.current;

      // Report ~4 Hz
      if (elapsed >= 250) {
        const fps = (framesRef.current / elapsed) * 1000;
        setFps(Math.round(fps * 10) / 10);

        // Patrol snapshot: per-stage rolling averages (ms) + frame stats.
        const stages = {};
        for (const [name, s] of stageSamples) {
          stages[name] = s.n > 0 ? Math.round((s.total / s.n) * 100) / 100 : 0;
          s.total = 0;
          s.n = 0;
        }
        let worst = 0;
        let sum = 0;
        for (const d of deltas) {
          sum += d;
          if (d > worst) worst = d;
        }
        stages.__frame = {
          avg: deltas.length ? Math.round((sum / deltas.length) * 100) / 100 : 0,
          worst: Math.round(worst * 100) / 100,
        };
        setStageTimings(stages);

        framesRef.current = 0;
        lastReportRef.current = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, setFps, setStageTimings]);
}
