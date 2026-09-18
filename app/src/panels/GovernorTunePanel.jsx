// GovernorTunePanel — dev-only governor tuning surface (#259).
//
// Matt asked for tuning tools after the permanent-shed trap: the FPS
// average lies, so this panel shows the frame-time HISTOGRAM; the shed /
// recover thresholds are visible and live-overridable; and shed→restore
// flapping is detected from the event log. It builds on the existing
// governor event log + X-ray infra (hardening 5/6) — it does not reinvent
// them. The X-ray panel stays the pass-chain/cost view; this is the
// timing/threshold view.
//
// Registered only when import.meta.env.DEV (see PanelRegistry) and loaded
// via React.lazy, so production bundles never include it.

import { useEffect, useMemo, useState } from 'react';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useStore } from '../state/store.js';
import { getFrameDeltas } from '../hooks/useFpsMeter.js';
import { gpuImpliedFps, effectiveGovernorFps } from '../hooks/governorCuts.js';
import { getGovernorEvents, governorEventLogSize } from '../gl/governorEventLog.mjs';

// Histogram geometry: 5ms buckets, 0–100ms, plus an overflow bucket.
const BUCKET_MS = 5;
const BUCKET_N = 20;
const FLAP_WINDOW_S = 120;
const FLAP_CYCLES = 3;

function bucketize(deltas) {
  const counts = new Array(BUCKET_N + 1).fill(0);
  for (const d of deltas) {
    const i = Math.min(BUCKET_N, Math.floor(Math.max(0, d) / BUCKET_MS));
    counts[i] += 1;
  }
  return counts;
}

/**
 * Shed→restore flap detection from the event log. A "cycle" is a shed
 * followed by a restore of the same cutKind; FLAPPING when a cutKind
 * completes >= FLAP_CYCLES cycles inside the trailing FLAP_WINDOW_S.
 */
function flapReport(events) {
  const now = Date.now();
  const cutoff = now - FLAP_WINDOW_S * 1000;
  const open = new Map(); // cutKind -> shed timestamp (ms)
  const cycles = new Map(); // cutKind -> [cycleEndMs]
  for (const e of events) {
    const t = new Date(e.t).getTime();
    if (!Number.isFinite(t)) continue;
    if (e.type === 'shed') {
      open.set(e.cutKind, t);
    } else if (e.type === 'restore' && open.has(e.cutKind)) {
      open.delete(e.cutKind);
      if (!cycles.has(e.cutKind)) cycles.set(e.cutKind, []);
      cycles.get(e.cutKind).push(t);
    }
  }
  return [...cycles.entries()].map(([cutKind, ends]) => {
    const recent = ends.filter((t) => t >= cutoff);
    return { cutKind, cycles: recent.length, flapping: recent.length >= FLAP_CYCLES };
  }).sort((a, b) => b.cycles - a.cycles);
}

function ThresholdRow({ label, value, setValue, min, max, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
      <span style={{ width: 150, color: '#8a93a6' }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => setValue(e.target.value)}
        title={hint}
        style={{ width: 64, background: '#141414', color: '#fff', border: '1px solid #2a2a2a', borderRadius: 4, padding: '2px 6px' }}
      />
      <span style={{ color: '#8a93a6' }}>fps</span>
      <span style={{ color: '#5a6272', fontSize: 11 }}>{hint}</span>
    </div>
  );
}

export function GovernorTunePanel() {
  const fps = useStore((s) => s.fps);
  const stageTimings = useStore((s) => s.stageTimings);
  const shedFps = useStore((s) => s.governorShedFps);
  const recoverFps = useStore((s) => s.governorRecoverFps);
  const setShedFps = useStore((s) => s.setGovernorShedFps);
  const setRecoverFps = useStore((s) => s.setGovernorRecoverFps);
  const renderScale = useStore((s) => s.renderScale);
  const slowRender = useStore((s) => s.slowRender);

  const [tick, setTick] = useState(0);

  // Poll: deltas and the event log are module-level, not store state.
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deltas = useMemo(() => getFrameDeltas(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => getGovernorEvents(), [tick]);

  const counts = useMemo(() => bucketize(deltas), [deltas]);
  const maxCount = Math.max(1, ...counts);
  const flaps = useMemo(() => flapReport(events), [events]);

  const gpuFps = gpuImpliedFps(stageTimings);
  const effFps = Math.round(effectiveGovernorFps(fps, stageTimings) * 10) / 10;
  const saturated = Number.isFinite(gpuFps) && gpuFps < shedFps && fps >= shedFps;

  // ms positions for the threshold lines on the histogram.
  const shedMs = 1000 / Math.max(1, shedFps);
  const recoverMs = 1000 / Math.max(1, recoverFps);

  return (
    <div style={{ padding: 8, fontSize: 12, lineHeight: 1.45 }}>
      <PanelHeader tag="DEV" title="GOV TUNE" subtitle="frame-time histogram · thresholds · flap detection" />

      <div style={{ color: '#8a93a6', margin: '8px 0', fontSize: 11 }}>
        The FPS average lies — one 200ms hitch vanishes inside it. The histogram shows
        what the governor actually reacts to. Thresholds are live: change them and the
        governor uses the new values on its next tick.
      </div>

      <h4 style={{ margin: '10px 0 4px' }}>
        Frame-time histogram — last {deltas.length} frames
        <span style={{ color: '#8a93a6', fontWeight: 'normal', fontSize: 11 }}> (5ms buckets)</span>
      </h4>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 2, height: 90, borderBottom: '1px solid #2a2a2a', paddingBottom: 2 }}>
        {counts.map((c, i) => (
          <div
            key={i}
            title={`${i * BUCKET_MS}–${i === BUCKET_N ? '∞' : (i + 1) * BUCKET_MS}ms: ${c} frames`}
            style={{
              flex: 1,
              height: `${Math.max(2, (c / maxCount) * 84)}px`,
              background: i * BUCKET_MS >= 33.3 ? '#ff2d6f' : '#7cc7ff',
              opacity: 0.85,
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
        {/* shed threshold line */}
        <div
          title={`shed below ${shedFps}fps (${shedMs.toFixed(1)}ms)`}
          style={{ position: 'absolute', top: 0, bottom: 2, left: `${Math.min(100, (shedMs / ((BUCKET_N + 1) * BUCKET_MS)) * 100)}%`, width: 2, background: '#ffb454' }}
        />
        {/* recover threshold line */}
        <div
          title={`recover at ${recoverFps}fps (${recoverMs.toFixed(1)}ms)`}
          style={{ position: 'absolute', top: 0, bottom: 2, left: `${Math.min(100, (recoverMs / ((BUCKET_N + 1) * BUCKET_MS)) * 100)}%`, width: 2, background: '#9fe870' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#8a93a6', marginTop: 4 }}>
        <span><span style={{ color: '#ffb454' }}>│</span> shed &lt; {shedFps}fps</span>
        <span><span style={{ color: '#9fe870' }}>│</span> recover ≥ {recoverFps}fps</span>
        <span><span style={{ color: '#ff2d6f' }}>■</span> slower than 30fps</span>
      </div>

      <h4 style={{ margin: '10px 0 4px' }}>Thresholds — live override</h4>
      <ThresholdRow
        label="Shed below"
        value={shedFps}
        setValue={setShedFps}
        min={1}
        max={120}
        hint="sustained below this → next ladder cut"
      />
      <ThresholdRow
        label="Recover at/above"
        value={recoverFps}
        setValue={setRecoverFps}
        min={1}
        max={120}
        hint="cuts auto-clear once FPS is back here"
      />
      <div style={{ fontSize: 11, color: '#5a6272', marginTop: 2 }}>
        Shed must stay below recover — the setters enforce it, so the permanent-shed trap can't be reintroduced from this panel.
      </div>

      <h4 style={{ margin: '10px 0 4px' }}>Live signal</h4>
      <div style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
        <span style={{ color: '#8a93a6' }}>rAF fps</span><span>{Number.isFinite(fps) ? fps.toFixed(1) : '—'}</span>
        <span style={{ color: '#8a93a6' }}>GPU-implied fps</span><span>{Number.isFinite(gpuFps) ? gpuFps.toFixed(1) : '∞ (no timing yet)'}</span>
        <span style={{ color: '#8a93a6' }}>effective fps</span><span>{Number.isFinite(effFps) ? effFps.toFixed(1) : '—'}</span>
        <span style={{ color: '#8a93a6' }}>gpuSaturated</span>
        <span style={{ color: saturated ? '#ffb454' : '#9fe870', fontWeight: 'bold' }}>{String(saturated)}</span>
        <span style={{ color: '#8a93a6' }}>renderScale</span><span>{Math.round(renderScale * 100)}%</span>
        <span style={{ color: '#8a93a6' }}>motion</span><span>{slowRender ? 'frozen' : 'live'}</span>
      </div>
      <div style={{ fontSize: 11, color: '#5a6272', marginTop: 2 }}>
        Resolution cuts (ladder step 1) fire only when gpuSaturated is true — otherwise cutting pixels can't buy frames back.
      </div>

      <h4 style={{ margin: '10px 0 4px' }}>
        Flap detection — {governorEventLogSize()} events
        <span style={{ color: '#8a93a6', fontWeight: 'normal', fontSize: 11 }}> (shed→restore cycles, trailing {FLAP_WINDOW_S}s)</span>
      </h4>
      {flaps.length === 0 && (
        <div style={{ color: '#8a93a6', fontSize: 11 }}>No shed/restore cycles this session.</div>
      )}
      {flaps.map((f) => (
        <div key={f.cutKind} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '2px 0' }}>
          <span style={{ flex: 1 }}>{f.cutKind}</span>
          <span style={{ color: '#8a93a6' }}>{f.cycles} cycle{f.cycles === 1 ? '' : 's'}</span>
          <span style={{ color: f.flapping ? '#ff2d6f' : '#9fe870', fontWeight: 'bold' }}>
            {f.flapping ? 'FLAPPING' : 'stable'}
          </span>
        </div>
      ))}
    </div>
  );
}
