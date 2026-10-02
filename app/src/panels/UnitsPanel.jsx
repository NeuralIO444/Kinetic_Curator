// DEV → UNITS. Makes a selfcheck stub and shows the trio plus live __kcUnits checks.
import { useEffect, useState } from 'react';
import { UNIT_TRIO, makeUnit, pushUnitCheck } from '../dev/unitMaker.mjs';

export function UnitsPanel() {
  const [issue, setIssue] = useState('722');
  const [name, setName] = useState('behave ease');
  const [stub, setStub] = useState(() => makeUnit({ issue: '722', name: 'behave ease' }));
  const [log, setLog] = useState([]);

  useEffect(() => {
    const id = setInterval(() => setLog([...(window.__kcUnits || [])].slice(-8).reverse()), 500);
    return () => clearInterval(id);
  }, []);

  const make = () => {
    const next = makeUnit({ issue, name });
    setStub(next);
    pushUnitCheck(`made #${issue} ${name}`, true, 'stub ready');
  };

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <p style={{ opacity: 0.75 }}>Review launches on http://127.0.0.1:5170/Kinetic_Curator/. Trio is the iteration gate.</p>
      {Object.entries(UNIT_TRIO).map(([lane, items]) => (
        <div key={lane} style={{ marginBottom: 6 }}><b>{lane}</b> · {items.join(' · ')}</div>
      ))}
      <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
        <input value={issue} onChange={(e) => setIssue(e.target.value)} style={{ width: 64 }} aria-label="Issue" />
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} aria-label="Unit name" />
        <button type="button" className="chip-btn" onClick={make}>MAKE</button>
        <button type="button" className="chip-btn" onClick={() => navigator.clipboard?.writeText(stub)}>COPY</button>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#111', padding: 8 }}>{stub}</pre>
      <div>debug {log.length ? log.map((r) => `${r.ok ? 'ok' : 'fail'} ${r.name}`).join(' · ') : 'no checks yet'}</div>
    </div>
  );
}
