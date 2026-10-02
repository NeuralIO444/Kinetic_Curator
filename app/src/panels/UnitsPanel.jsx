// DEV → UNITS. Make a selfcheck stub and watch window.__kcUnits while the app runs.
import { useEffect, useState } from 'react';
import { UNIT_TRIO, makeUnit, pushUnitCheck, readUnitLog, clearUnitLog } from '../dev/unitMaker.mjs';

export function UnitsPanel() {
  const [issue, setIssue] = useState('722');
  const [name, setName] = useState('behave ease');
  const [made, setMade] = useState(() => makeUnit({ issue: '722', name: 'behave ease' }));
  const [log, setLog] = useState([]);

  useEffect(() => {
    const id = setInterval(() => setLog(readUnitLog().slice(-8).reverse()), 400);
    return () => clearInterval(id);
  }, []);

  const make = () => {
    const next = makeUnit({ issue, name });
    setMade(next);
    pushUnitCheck(`made #${issue}`, true, next.file);
  };
  const probe = () => {
    const ok = made.src.includes(`#${issue.replace(/\D/g, '') || '000'}`);
    pushUnitCheck('probe stub', ok, ok ? made.file : 'stub missing the issue');
  };

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <p style={{ opacity: 0.75 }}>Press U to open this tab. Debug log is window.__kcUnits. Review page: http://127.0.0.1:5170/Kinetic_Curator/</p>
      {Object.entries(UNIT_TRIO).map(([lane, items]) => (
        <div key={lane} style={{ marginBottom: 6 }}><b>{lane}</b> · {items.join(' · ')}</div>
      ))}
      <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
        <input value={issue} onChange={(e) => setIssue(e.target.value)} style={{ width: 64 }} aria-label="Issue" />
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} aria-label="Unit name" />
        <button type="button" className="chip-btn" onClick={make}>MAKE</button>
        <button type="button" className="chip-btn" onClick={probe}>PROBE</button>
        <button type="button" className="chip-btn" onClick={() => navigator.clipboard?.writeText(made.src)}>COPY</button>
        <button type="button" className="chip-btn" onClick={() => { clearUnitLog(); setLog([]); }}>CLEAR</button>
      </div>
      <div style={{ opacity: 0.7, marginBottom: 4 }}>{made.file}</div>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#111', padding: 8 }}>{made.src}</pre>
      <div>{log.length ? log.map((r) => `${r.ok ? 'ok' : 'fail'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`).join(' · ') : 'no checks yet'}</div>
    </div>
  );
}
