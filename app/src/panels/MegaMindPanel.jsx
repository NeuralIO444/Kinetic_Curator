// DEV → MEGAMIND (#1525 MegaMind S1). The local model link: point KC-1 at your own Ollama, connect, and see
// what detection measured — model, cadence tier, badges, context. Dev panel first (Matt's ruling,
// 2026-11-10); a user-Settings home is a later move only on a further ruling.
//
// S1 wires NO persona calls: MegaMind still runs on rules. This surface proves the link and publishes the
// measured capabilities to the registry every later stage reads. Nothing is probed on page load or when
// this tab opens — connecting is a user act, and the buttons below are the only way anything is measured.
import { useEffect, useState } from 'react';
import { ensureLinkDriver, getLinkView, subscribeLink } from '../curator/megamindLive.js';
import { HOUSE_TEXT, TIER_BLURB } from '../curator/megamindLink.mjs';
import { CAPABILITY_CONSUMERS, capabilityEnabled } from '../composition/capabilityRegistry.mjs';

const cell = { padding: '2px 6px', borderBottom: '1px solid #333', textAlign: 'left', whiteSpace: 'nowrap' };
const btn = {
  background: 'none',
  border: '1px solid #555',
  color: 'inherit',
  padding: '3px 10px',
  cursor: 'pointer',
  font: 'inherit',
};
const badge = {
  border: '1px solid #777',
  padding: '0 5px',
  marginLeft: 6,
  fontSize: 11,
  letterSpacing: 0.5,
};
const fmtCtx = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'unknown');

function Status({ view }) {
  if (view.phase === 'connecting') return <p style={{ opacity: 0.85 }}>Asking Ollama for its model list…</p>;
  if (view.phase === 'detecting')
    return <p style={{ opacity: 0.85 }}>Measuring {view.model} — show data, preload, one timed warm probe…</p>;
  if (view.phase === 'connected' && view.record) {
    const r = view.record;
    return (
      <div>
        <p style={{ margin: '0 0 4px' }}>
          connected · {r.model} · <strong>tier {r.tier}</strong> ({TIER_BLURB[r.tier]}) · ctx {fmtCtx(r.context)}
          {r.badges.map((b) => (
            <span key={b} style={badge}>
              {b}
            </span>
          ))}
        </p>
        <p style={{ opacity: 0.75, margin: '0 0 4px' }}>
          warm probe {r.probeMs.toLocaleString('en-US')} ms ·{' '}
          {r.probeClean
            ? 'reply in verdict shape'
            : 'reply NOT in verdict shape — deep verdicts only, and S2\u2019s format ladder decides the rest'}
          {' · '}thinking {r.thinking === 'controllable' ? 'controllable (sent off)' : 'not reported by the model'}
        </p>
        {r.badges.includes('cloud') && (
          <p style={{ opacity: 0.85, margin: '0 0 4px' }}>
            This is a cloud pointer: it runs on Ollama&rsquo;s cloud, not on this machine. May work — unsupported, and
            never the recommendation.
          </p>
        )}
      </div>
    );
  }
  if (view.saved)
    return (
      <p style={{ opacity: 0.85 }}>
        saved: {view.saved.model} @ {view.saved.endpoint} — not connected. Nothing is probed until you press Connect;
        MegaMind is on rules.
      </p>
    );
  return <p style={{ opacity: 0.85 }}>not connected — MegaMind is on rules.</p>;
}

export function MegaMindPanel() {
  const [driver] = useState(() => ensureLinkDriver());
  const [view, setView] = useState(getLinkView);
  const [endpointText, setEndpointText] = useState(() => (getLinkView() ? getLinkView().endpoint : ''));
  useEffect(() => subscribeLink(() => setView(getLinkView())), []);
  if (!view) return <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>The link has not been touched yet.</div>;
  const busy = view.phase === 'connecting' || view.phase === 'detecting';
  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Your own local Ollama, measured — never assumed. S1 proves the link only: no persona calls are wired, MegaMind
        still runs on rules, and disconnect returns it to rules silently.
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          type="text"
          value={endpointText}
          onChange={(e) => setEndpointText(e.target.value)}
          disabled={busy}
          aria-label="Ollama endpoint"
          style={{
            background: 'none',
            border: '1px solid #555',
            color: 'inherit',
            padding: '3px 6px',
            font: 'inherit',
            minWidth: 220,
          }}
        />
        <button type="button" style={btn} disabled={busy} onClick={() => driver.connect(endpointText)}>
          Connect
        </button>
        {view.models.length > 0 && (
          <select
            value={view.model ?? ''}
            disabled={busy}
            aria-label="Model"
            onChange={(e) => driver.changeModel(e.target.value)}
            style={{
              background: 'none',
              border: '1px solid #555',
              color: 'inherit',
              padding: '3px 6px',
              font: 'inherit',
            }}
          >
            {view.models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {view.phase === 'connected' && (
          <>
            <button type="button" style={btn} disabled={busy} onClick={() => driver.redetect()}>
              Re-detect
            </button>
            <button type="button" style={btn} disabled={busy} onClick={() => driver.disconnect()}>
              Disconnect
            </button>
          </>
        )}
      </div>
      <Status view={view} />
      {view.error && (
        <div style={{ border: '1px solid #a33', padding: '6px 8px', margin: '8px 0' }}>
          <p style={{ margin: '0 0 4px' }}>
            <strong>{view.error.title}</strong>
          </p>
          {view.error.lines.map((l, i) => (
            <p key={i} style={{ margin: '0 0 2px', opacity: 0.85, whiteSpace: 'pre-wrap' }}>
              {l}
            </p>
          ))}
        </div>
      )}
      <details style={{ marginTop: 10 }} open>
        <summary>the House configuration — the one supported setup</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{HOUSE_TEXT}</pre>
      </details>
      <details style={{ marginTop: 10 }}>
        <summary>capability registry — what later stages may do</summary>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {CAPABILITY_CONSUMERS.map((c) => (
              <tr key={c.id}>
                <td style={cell}>{c.id}</td>
                <td style={cell}>{c.stage}</td>
                <td style={cell}>{capabilityEnabled(c.id) ? 'ENABLED' : 'off'}</td>
                <td style={{ ...cell, whiteSpace: 'normal', opacity: 0.7 }}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
