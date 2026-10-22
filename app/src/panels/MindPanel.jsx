// DEV → MIND (#1464 Mind 3). The personas' hidden engagement, for tuning: score, tier (eased), cool-down, zodiac and
// the session's calendar reading, plus the numbers that shape them. Dev-only; the main UI never shows any of this.
import { useEffect, useState } from 'react';
import { getPresenceView, subscribePresence } from '../curator/mindPresenceLive.js';
import { getTrioView, subscribeTrio } from '../curator/trioLive.js'; // #1483: Davis's conducting
import { getStoryView, subscribeStory } from '../curator/storyLive.js'; // #1560 S3: the room's story machine

const cell = { padding: '2px 6px', borderBottom: '1px solid #333', textAlign: 'left', whiteSpace: 'nowrap' };
const fmt = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : '—');

/** #1483 — what Davis is doing to the audio show: his tier, what he holds, what waits, what became of the last twelve. */
function Conducting() {
  const [t, setT] = useState(getTrioView);
  useEffect(() => subscribeTrio(() => setT(getTrioView())), []);
  if (!t) return <p style={{ opacity: 0.6 }}>Conducting: not running.</p>;
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ opacity: 0.75, margin: '0 0 4px' }}>
        Conducting: {t.on ? 'audio on' : 'audio off'} · tier {t.tier ?? 'none'}{t.cooling ? ' · backing off' : ''}
        {t.on ? ` · ${t.energy ?? 'no energy yet'}${t.bpm ? ` · ${Math.round(t.bpm)} bpm` : ''}${t.silent ? ' · silent' : ''} · flat ${t.flatBars} bar${t.flatBars === 1 ? '' : 's'}` : ''}
        {t.on ? ` · LOIS calls it flat under ${t.flatBelow.toFixed(3)} (${t.bias > 0.05 ? 'tight: passes piling up' : t.bias < -0.05 ? 'loose: you are keeping' : 'neutral'})` : ''}
      </p>
      <p style={{ opacity: 0.75, margin: '0 0 4px' }}>
        His routes {t.mine} of {t.routes} · owned by you: {t.owned.length ? t.owned.join(', ') : 'none'}
        {t.pending ? ` · waiting for bar ${t.pending.landBar}: ${t.pending.desc}` : ''}
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {t.log.length === 0 && <tr><td style={cell}>nothing yet</td></tr>}
          {t.log.map((e, i) => (
            <tr key={i}>
              <td style={cell}>bar {e.landBar ?? e.bar}</td>
              <td style={cell}>{e.status === 'applied' ? 'applied' : `dropped: ${e.reason}`}</td>
              <td style={cell}>{e.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** #1560 S3 — the room's story: the two directed standings (with what each of them believes of them), the
 * grudges on record, the episode the session is in, and the beats the machine has chosen. Dev only. */
function Story() {
  const [s, setS] = useState(getStoryView);
  useEffect(() => subscribeStory(() => setS(getStoryView())), []);
  if (!s) return <p style={{ opacity: 0.6 }}>Story: not running.</p>;
  const rows = [
    ['LOIS → DAVIS', s.esteem, 'esteem'],
    ['DAVIS → LOIS', s.trust, 'trust'],
  ];
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ opacity: 0.75, margin: '0 0 4px' }}>
        Story: session {s.session} · {s.phase} · intensity {fmt(s.intensity)} · beats {s.storyBeats} of {s.budget}
        {s.grudges.length ? ` · grudges: ${s.grudges.map((g) => `${g.topic} ×${g.count}${g.promoted ? ' (named)' : ''}`).join(', ')}` : ''}
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>{['regard', 'mood', 'standing', 'as DAVIS reads it', 'as LOIS reads it'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(([label, v, key]) => (
            <tr key={label}>
              <td style={cell}>{label}</td>
              <td style={cell}>{fmt(v.mood)}</td>
              <td style={cell}>{fmt(v.standing)}</td>
              <td style={cell}>{fmt(s.believed.davis[key])}</td>
              <td style={cell}>{fmt(s.believed.lois[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {s.beats.length === 0 && <tr><td style={cell}>no beats yet — a quiet room is a valid scene</td></tr>}
          {s.beats.map((b, i) => (
            <tr key={i}>
              <td style={cell}>bar {b.bar}</td>
              <td style={cell}>{b.kind}</td>
              <td style={cell}>{b.persona}</td>
              <td style={cell}>{b.form || ''}{b.topic ? ` · ${b.topic}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MindPanel() {
  const [view, setView] = useState(getPresenceView);
  useEffect(() => subscribePresence(() => setView(getPresenceView())), []);
  if (!view) return <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}><Conducting /><Story />The personas have not thought yet. Play a bar.</div>;
  const r = view.reading;
  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <Conducting />
      <Story />
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
