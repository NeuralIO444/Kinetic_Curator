// GovernorXrayPanel — dev-only X-ray guide view (backend hardening 5/6).
//
// The "guide" leg: the live pass chain with per-pass cost — effect name,
// declared tier, measured cost, current shed state — so a performer learns
// what each effect costs and the governor stops being a black box.
//
// Registered only when import.meta.env.DEV (see PanelRegistry) and loaded
// via React.lazy, so production bundles never include it.
//
// The silent-cull trap stays dead here: a pass row shows SHED exactly when
// the governor has it shed, never the other way round.

import { useEffect, useMemo, useState } from 'react';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useStore } from '../state/store.js';
import { allCostTiers } from '../gl/costTiers.mjs';
import { MEASURED_COSTS, MEASURED_AT } from '../gl/effects/measuredCosts.mjs';
import { buildXray } from '../gl/governorXray.mjs';
import {
  getGovernorEvents,
  clearGovernorEvents,
  exportGovernorLogJSON,
  governorEventLogSize,
} from '../gl/governorEventLog.mjs';

// Import the registration sites so the registry holds every declaration
// when the X-ray builds its rows (module side-effects only — no GL needed).
import '../gl/accum.mjs';
import '../gl/effects/fxShaders.mjs';
import '../gl/bridge/builtinEffects.mjs';
import '../gl/renderer.mjs';

const TIER_COLORS = { 0: '#8a93a6', 1: '#ffb454', 2: '#7cc7ff', 3: '#9fe870' };

function downloadLog() {
  const json = exportGovernorLogJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `governor-event-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function EventRow({ e }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 11, padding: '2px 0', borderBottom: '1px solid #222' }}>
      <span style={{ color: e.type === 'shed' ? '#ffb454' : '#9fe870', flexShrink: 0 }}>
        {e.type === 'shed' ? 'SHED' : 'OK'}
      </span>
      <span style={{ flexShrink: 0, color: '#8a93a6' }}>{new Date(e.t).toLocaleTimeString()}</span>
      <span style={{ flexShrink: 0 }}>step {e.step}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
      {e.fps && (
        <span style={{ color: '#8a93a6', marginLeft: 'auto', flexShrink: 0 }}>
          {e.fps.at.toFixed(0)}fps &lt; {e.fps.threshold}
        </span>
      )}
    </div>
  );
}

export function GovernorXrayPanel() {
  // NOTE: select primitives individually — an object-literal selector makes
  // zustand's snapshot change every render → infinite loop (React #185).
  const renderScale = useStore((s) => s.renderScale);
  const perfTier1 = useStore((s) => s.perfTier1);
  const assetThin = useStore((s) => s.assetThin);
  const perfClampOverride = useStore((s) => s.perfClampOverride);
  const slowRender = useStore((s) => s.slowRender);
  const lastWatchdogReason = useStore((s) => s.lastWatchdogReason);

  const [eventsVersion, setEventsVersion] = useState(0);

  // Dev-only poll: the event log is a module-level ring buffer, not store
  // state — refresh the tail view every second while the panel is open.
  useEffect(() => {
    const id = setInterval(() => setEventsVersion((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const shed = useMemo(() => ({
    perfTier1,
    renderScale,
    assetThin,
    perfClampOverride,
    slowRender,
    watchdogTripped: !!lastWatchdogReason,
  }), [perfTier1, renderScale, assetThin, perfClampOverride, slowRender, lastWatchdogReason]);

  const { cuts, passes } = useMemo(
    () => buildXray({ tiers: allCostTiers(), measuredMs: MEASURED_COSTS, shed }),
    [shed],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => getGovernorEvents().slice(-12), [eventsVersion]);

  return (
    <div style={{ padding: 8, fontSize: 12, lineHeight: 1.45 }}>
      <PanelHeader tag="DEV" title="GOVERNOR X-RAY" subtitle="live pass chain · per-pass cost · shed state" />

      <div style={{ color: '#8a93a6', margin: '8px 0', fontSize: 11 }}>
        What each effect costs, and what the governor is doing right now. Tier colors:
        <span style={{ color: TIER_COLORS[1] }}> 1 shed-first</span>
        <span style={{ color: TIER_COLORS[2] }}> · 2 quality-scaler</span>
        <span style={{ color: TIER_COLORS[3] }}> · 3 cosmetic</span>
        <span style={{ color: TIER_COLORS[0] }}> · 0 structural</span>.
        Measurements from {MEASURED_AT ? new Date(MEASURED_AT).toLocaleDateString() : '—'}.
      </div>

      <h4 style={{ margin: '10px 0 4px' }}>Governor cuts (the shed ladder)</h4>
      {cuts.map((c) => (
        <div key={c.cutKind} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '2px 0' }}>
          <span style={{ color: '#8a93a6', flexShrink: 0 }}>step {c.step}</span>
          <span style={{ flex: 1 }}>{c.label}</span>
          <span style={{ color: c.active ? '#ffb454' : '#8a93a6', fontWeight: c.active ? 'bold' : 'normal' }}>
            {c.state}
          </span>
        </div>
      ))}

      <h4 style={{ margin: '10px 0 4px' }}>Pass chain — per-pass cost ({passes.length} passes)</h4>
      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #2a2a2a', borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: '#141414' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>pass</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>tier</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>est</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>measured</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>working set</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>state</th>
            </tr>
          </thead>
          <tbody>
            {passes.map((p) => (
              <tr key={p.id} style={{ borderTop: '1px solid #1e1e1e' }}>
                <td style={{ padding: '3px 6px' }}>{p.id}</td>
                <td style={{ padding: '3px 6px', color: TIER_COLORS[p.tier] ?? '#fff' }}>
                  {p.tier} · {p.tierName}
                </td>
                <td style={{ padding: '3px 6px', textAlign: 'right', color: '#8a93a6' }}>
                  {p.declaredMs ? `${p.declaredMs}ms` : '—'}
                </td>
                <td style={{ padding: '3px 6px', textAlign: 'right' }}>
                  {p.measuredMs != null ? `${p.measuredMs.toFixed(1)}ms` : '—'}
                </td>
                <td style={{ padding: '3px 6px', textAlign: 'right', color: '#8a93a6' }}>{p.memoryMB}</td>
                <td style={{ padding: '3px 6px', color: p.shed ? '#ffb454' : '#9fe870', fontWeight: p.shed ? 'bold' : 'normal' }}>
                  {p.shed ? `SHED (${p.shedBy})` : 'active'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 style={{ margin: '10px 0 4px' }}>
        Event log — {governorEventLogSize()} events
        <span style={{ color: '#8a93a6', fontWeight: 'normal', fontSize: 11 }}> (last {events.length} shown)</span>
      </h4>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <button type="button" className="micro-btn" onClick={downloadLog} title="Download the full governor event log as JSON">
          ⬇ export log (JSON)
        </button>
        <button
          type="button"
          className="micro-btn"
          onClick={() => { clearGovernorEvents(); setEventsVersion((v) => v + 1); }}
          title="Empty the in-memory event log"
        >
          clear
        </button>
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #2a2a2a', borderRadius: 4, padding: '0 6px' }}>
        {events.length === 0 && (
          <div style={{ color: '#8a93a6', fontSize: 11, padding: '6px 0' }}>
            No governor events yet this session — sheds and restores appear here as they happen.
          </div>
        )}
        {events.map((e, i) => <EventRow key={`${e.t}-${i}`} e={e} />)}
      </div>
    </div>
  );
}
