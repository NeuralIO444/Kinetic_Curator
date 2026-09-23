import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { shedSummary } from '../hooks/governorCuts.js';
import { activeFxKinds, sceneFxCost } from '../hooks/sceneCost.js';
import { getGovernorEvents } from '../gl/governorEventLog.mjs';
import { FRAME_BUDGET_MS, isTapeFull } from '../state/tapeBudget.js';

// TapeCounter — the governor's one budget readout (#295, R1 of the
// governor×TE roadmap; #483 confirms the merge is complete). It merged the
// footer ShedBadge and the four MasterBar pills
// (PERF PAUSED / MOTION HELD / RENDER FAULT / LOAD SHED) plus the Q
// meter's AUTO state into a single PLAY readout: the budget as tape
// on a reel. The badge and the separate pills are retired.
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
// RENDER FAULT and the watchdog hard stop stay red and explicit about
// manual resume; self-clearing sheds stay amber and say so.

/** Latest shed-event label in the governor event log, or null. */
function lastShedLabel() {
  const evs = getGovernorEvents();
  for (let i = evs.length - 1; i >= 0; i--) {
    if (evs[i].type === 'shed' && evs[i].label) return evs[i].label;
  }
  return null;
}

const RED = { background: 'rgba(255, 45, 111, 0.18)', color: '#ff2d6f', borderColor: '#ff2d6f' };
const AMBER = { background: 'rgba(255, 176, 0, 0.18)', color: '#ffb000', borderColor: '#ffb000' };

export function TapeCounter() {
  const { state } = useApp((s) => ({
    fps: s.fps,
    stageTimings: s.stageTimings,
    renderScale: s.renderScale,
    quality: s.quality,
    qualityShedFrom: s.qualityShedFrom,
    perfTier1: s.perfTier1,
    assetThin: s.assetThin,
    perfClampOverride: s.perfClampOverride,
    slowRender: s.slowRender,
    slowRenderSource: s.slowRenderSource,
    lastWatchdogReason: s.lastWatchdogReason,
    renderFault: s.renderFault,
    renderFaultReason: s.renderFaultReason,
    autoQuality: s.autoQuality,
    layers: s.layers,
  }));
  const {
    fps = 0, stageTimings, renderScale = 1, quality = 'balanced',
    qualityShedFrom = null, perfTier1 = false, assetThin = false,
    perfClampOverride = null, slowRender = false, slowRenderSource = null,
    lastWatchdogReason = null, renderFault = false, renderFaultReason = null,
    autoQuality = true,
  } = state;

  const [eventLabel, setEventLabel] = useState(null);
  useEffect(() => {
    const id = setInterval(() => setEventLabel(lastShedLabel()), 1000);
    return () => clearInterval(id);
  }, []);

  const summary = shedSummary({
    renderScale, perfTier1, assetThin, perfClampOverride, slowRender,
    watchdogTripped: !!lastWatchdogReason, quality, qualityShedFrom,
  });
  const watchdog = slowRender && slowRenderSource === 'watchdog';

  // Measured frame cost, ms: live GPU frame timing first (the patrol
  // signal the governor itself sheds on), rAF-implied frame time as the
  // fallback. Zero/unknown → no fill rather than a fake one.
  const gpuMs = Number(stageTimings?.gpuFrame) || 0;
  const frameMs = gpuMs > 0 ? gpuMs : (fps > 0 ? 1000 / fps : 0);
  const fillRatio = frameMs > 0 ? frameMs / FRAME_BUDGET_MS : 0;
  const fillPct = Math.round(fillRatio * 100);

  // #485 R4 — registry-driven FX-stack weight (bench ms, attribution only).
  const fxKinds = activeFxKinds(state.layers);
  const fxCost = sceneFxCost(fxKinds);
  const fxNote = fxCost.count > 0
    ? ` FX stack ≈ ${fxCost.totalMs.toFixed(1)}ms bench (${fxCost.count} fx` +
      `${fxCost.shedFirstMs > 0 ? `, ${fxCost.shedFirstMs.toFixed(1)}ms shed-first` : ''}).`
    : '';

  // --- state 1: render fault (hard-stop class, red, explicit) ---
  if (renderFault) {
    return (
      <div className="status-pill" style={RED}
        title={renderFaultReason
          ? `Render fault: ${renderFaultReason}. The canvas is holding the last good frame. Clears after sustained clean rendering, or reload the page.`
          : 'Render fault: a deterministic per-frame failure stopped presenting. The canvas is holding the last good frame. Clears after sustained clean rendering, or reload the page.'}
      >
        <span className="status-dot" style={{ background: '#ff2d6f' }} />
        RENDER FAULT
      </div>
    );
  }

  // --- state 2: watchdog hard stop (red — never auto-resumes) ---
  if (watchdog) {
    return (
      <div className="status-pill" style={RED}
        title="Watchdog tripped: running and evolve are off and will not resume on their own. Press space or ▶ RUN to resume."
      >
        <span className="status-dot" style={{ background: '#ff2d6f' }} />
        PERF PAUSED
      </div>
    );
  }

  // --- state 2.5: tape full (#342) — a new track/FX slot would be refused.
  // isTapeFull, not a fillPct threshold check here: they must agree exactly
  // with what layersSlice's arm gate decides, or the pill lies (shows full
  // while arming still succeeds, or vice versa) — see tapeBudget.js for why
  // it's stricter than the fps-derived fillPct shown below.
  // Wording is a placeholder pending Matt's pass (issue #342: "PLAY readout
  // wording = taste"); the mechanism (refuse rather than silently degrade)
  // is what's load-bearing here. ---
  if (isTapeFull({ stageTimings, fps })) {
    return (
      <div className="status-pill" style={AMBER}
        title={`Tape full: measured frame cost ${frameMs.toFixed(1)}ms is already at ${fillPct}% of the ${FRAME_BUDGET_MS.toFixed(1)}ms (60fps) budget. A new track or FX slot is refused rather than silently degrading the render — drop the ceiling, free a track, or wait for headroom.`}
      >
        <span className="status-dot" style={{ background: '#ffb000' }} />
        TAPE FULL · {fillPct}%
      </div>
    );
  }

  // --- state 3: shedding (amber) — the counter clicks to the stage name ---
  if (summary) {
    // The latest stage: the event log's shed label when we have one (the
    // performed stage name), else the deepest active cut from the summary.
    const stageName = eventLabel || summary[summary.length - 1].toUpperCase();
    return (
      <div className="status-pill" style={AMBER}
        title={`Showrunner shed active: ${summary.join('; ')}.${fxNote} Auto-clears on recovery (watchdog needs manual resume). Tape fill: measured frame cost ${frameMs ? `${frameMs.toFixed(1)}ms` : '—'} vs ${FRAME_BUDGET_MS.toFixed(1)}ms budget.`}
      >
        <span className="status-dot" style={{ background: '#ffb000' }} />
        <span key={stageName} className="tape-click">{stageName}</span>
        <span className="tape-bar" aria-hidden="true">
          <span className="tape-bar-fill" style={{ width: `${Math.min(100, fillPct)}%`, background: '#ffb000' }} />
        </span>
        <span className="meter-value">{fillPct}%</span>
      </div>
    );
  }

  // --- state 4: clean — the tape, fill only, sitting quiet ---
  return (
    <div className="status-pill"
      title={`Budget tape: measured frame cost ${frameMs ? `${frameMs.toFixed(1)}ms` : 'no data yet'} vs a ${FRAME_BUDGET_MS.toFixed(1)}ms (60fps) frame budget.${fxNote} Fill is live-measured, never decorative.${autoQuality ? ' Governor armed — defending the budget.' : ' Governor off — nothing is defended (AUTO is off).'}`}
    >
      <span className="status-dot" style={{ background: autoQuality ? '#00ff88' : '#5a5a5a' }} />
      <span className="meter-label">TAPE</span>
      <span className="tape-bar" aria-hidden="true">
        <span className="tape-bar-fill" style={{ width: `${Math.min(100, fillPct)}%` }} />
      </span>
      <span className="meter-value">{frameMs > 0 ? `${fillPct}%` : '—'}</span>
      <span style={{ fontSize: '9px', opacity: 0.6, marginLeft: 2 }}>{autoQuality ? 'AUTO' : 'OFF'}</span>
    </div>
  );
}
