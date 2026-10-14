// DEV → MIND (#1464 Mind 3). The personas' hidden engagement, for tuning: score, tier (eased), cool-down, zodiac and
// the session's calendar reading, plus the numbers that shape them. Dev-only; the main UI never shows any of this.
import { useEffect, useState } from 'react';
import { getPresenceView, subscribePresence } from '../curator/mindPresenceLive.js';

const cell = { padding: '2px 6px', borderBottom: '1px solid #333', textAlign: 'left', whiteSpace: 'nowrap' };
const fmt = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : '—');

export function MindPanel() {
  const [view, setView] = useState(getPresenceView);
  useEffect(() => subscribePresence(() => setView(getPresenceView())), []);
  if (!view) return <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>The personas have not thought yet. Play a bar.</div>;
  const r = view.reading;
  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <p style={{ opacity: 0.75 }}>
        Reading: {r ? `${r.moonPhase} moon (${Math.round(r.illumination * 100)}% lit), ${r.season}` : 'none this session (no modulation)'}
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>{['', 'score', 'tier', 'level', 'cool', 'next at', 'sign', 'tempo', 'intensity', 'half-life d', 'last'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.label}>
              <td style={cell}>{row.label}</td>
              <td style={cell}>{fmt(row.score)}</td>
              <td style={cell}>{row.tier}</td>
              <td style={cell}>{fmt(row.level)}</td>
              <td style={cell}>{row.cool ? 'cooling' : ''}</td>
              <td style={cell}>{row.next ?? 'top'}</td>
              <td style={cell}>{row.sign} {row.born}</td>
              <td style={cell}>{fmt(row.temperament.tempo * row.mod.tempo)}</td>
              <td style={cell}>{fmt(row.temperament.intensity * row.mod.intensity)}</td>
              <td style={cell}>{fmt(row.halfLifeDays)}</td>
              <td style={cell}>{row.moved}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details style={{ marginTop: 10 }}>
        <summary>the numbers</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify({
          tierFloors: view.constants.floors, coolBelow: view.constants.coolEnter, cool: view.constants.cool, tiers: view.constants.shape,
          personas: Object.fromEntries(view.rows.map((row) => [row.label, { weights: row.weights, temperament: row.temperament }])),
        }, null, 1)}</pre>
      </details>
    </div>
  );
}
