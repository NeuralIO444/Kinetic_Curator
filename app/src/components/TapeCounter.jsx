import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { shedSummary } from '../hooks/governorCuts.js';
import { getGovernorEvents } from '../gl/governorEventLog.mjs';

// TapeCounter — the governor's one budget readout (#295, R1 of the
// governor×TE roadmap). It merges the footer ShedBadge, the four
// MasterBar pills (PERF PAUSED / MOTION HELD / RENDER FAULT / LOAD SHED)
// and the Q meter's AUTO state into a single PLAY readout: the budget as
// tape on a reel.
//
// Fill = measured frame cost against a 60fps frame budget — the live
// patrol's GPU frame timing (stageTimings.gpuFrame, the same signal the
// governor sheds on), falling back to the rAF-implied frame time when the
// live loop hasn't reported yet. Never decorative: no data, no fill.
// When a shed fires, the counter "clicks over" to the new stage name
// (the event log's shed label, polled at 1Hz like the dev-only X-ray
// view — the log is a module ring buffer, not store state).
//
// The honest semantics of the old pills are kept, not softened:
// critical stops read as critical; the counter is the single place the
// performer looks.

const FRAME_BUDGET_MS = 1000 / 60;

function stageFromEvents() {
  const events = getGovernorEvents?.() || [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'shed' && e.label) return e.label;
    if (e?.type === 'restore') break;
  }
  return null;
}

export function TapeCounter() {
  const { state } = useApp((s) => ({
    fps: s.fps,
    stageTimings: s.stageTimings,
    autoQuality: s.autoQuality,
    quality: s.quality,
    qualityShedFrom: s.qualityShedFrom,
    renderScale: s.renderScale,
    assetThin: s.assetThin,
    perfTier1: s.perfTier1,
    perfClampOverride: s.perfClampOverride,
    slowRender: s.slowRender,
    slowRenderSource: s.slowRenderSource,
    watchdogTripped: s.watchdogTripped,
  }));
  const {
    fps = 60,
    stageTimings,
    autoQuality = true,
    quality,
    qualityShedFrom,
    renderScale = 1,
    assetThin = false,
    perfTier1 = false,
    perfClampOverride = null,
    slowRender = false,
    slowRenderSource = null,
    watchdogTripped = false,
  } = state || {};

  const [stageLabel, setStageLabel] = useState(null);
  useEffect(() => {
    const tick = () => setStageLabel(stageFromEvents());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const summary = shedSummary({
    renderScale,
    quality,
    qualityShedFrom,
    assetThin,
    perfTier1,
    perfClampOverride,
    slowRender,
    watchdogTripped: watchdogTripped || (slowRender && slowRenderSource === 'watchdog'),
  });

  const gpuMs = Number(stageTimings?.gpuFrame) || 0;
  const frameMs = gpuMs > 0 ? gpuMs : (fps > 0 ? 1000 / fps : 0);
  const fill = frameMs > 0 ? Math.min(100, (frameMs / FRAME_BUDGET_MS) * 100) : 0;

  const shedding = !!(summary && summary.length);
  const critical = !!(watchdogTripped || (slowRender && slowRenderSource === 'watchdog'));
  const label = critical
    ? 'WATCHDOG'
    : stageLabel || (shedding ? summary[0] : (autoQuality ? 'AUTO' : 'MANUAL'));

  const title = critical
    ? 'Watchdog hard stop — press Space or RUN to resume'
    : shedding
      ? `Budget active: ${summary.join(' · ')}`
      : autoQuality
        ? 'Governor on — defending the budget'
        : 'Governor off — flying without a ceiling';

  return (
    <div
      className={`tape-counter${critical ? ' critical' : ''}${shedding ? ' shedding' : ''}`}
      title={title}
      aria-label={title}
    >
      <span className="tape-counter-label">BUDGET</span>
      <div className="tape-counter-bar" aria-hidden="true">
        <span className="tape-counter-fill" style={{ width: `${fill}%` }} />
      </div>
      <span className="tape-counter-stage">{label}</span>
    </div>
  );
}
