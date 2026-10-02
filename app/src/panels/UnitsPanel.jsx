// DEV → UNITS. One section per open PR. RUN tests the files that PR changed.
import { useEffect, useState } from 'react';
import { makeUnit, pushUnitCheck } from '../dev/unitMaker.mjs';

export function UnitsPanel() {
  const [prs, setPrs] = useState([]);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState({});
  const [issue, setIssue] = useState('722');
  const [name, setName] = useState('behave ease');
  const [made, setMade] = useState(() => makeUnit({ issue: '722', name: 'behave ease' }));

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    fetch('/__kc/units').then((r) => r.json()).then((d) => {
      setPrs(d.prs || []);
      setError(d.error || '');
    }).catch((e) => setError(String(e)));
  }, []);

  const run = async (n) => {
    setRuns((s) => ({ ...s, [n]: { running: true, results: [] } }));
    const data = await fetch(`/__kc/units?pr=${n}`).then((r) => r.json());
    const ok = (data.results || []).every((r) => r.ok);
    pushUnitCheck(`PR ${n}`, ok && (data.results || []).length > 0, `${(data.results || []).length} suites`);
    setRuns((s) => ({ ...s, [n]: { running: false, ...data, ok } }));
  };

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <p style={{ opacity: 0.75 }}>Press U. Each open PR runs the tests next to its files. This is the dev server only.</p>
      {error && <p>{error}</p>}
      {prs.map((pr) => {
        const runState = runs[pr.number];
        return (
          <section key={pr.number} style={{ borderTop: '1px solid #333', padding: '8px 0' }}>
            <div>#{pr.number} {pr.title}</div>
            <button type="button" className="chip-btn" onClick={() => run(pr.number)} disabled={runState?.running}>
              {runState?.running ? 'RUNNING' : 'RUN'}
            </button>
            {runState && !runState.running && (
              <div>
                {(runState.results || []).length === 0 ? 'no unit next to this PR' : runState.results.map((r) => (
                  <div key={r.suite}>{r.ok ? 'ok' : 'fail'} {r.suite}</div>
                ))}
              </div>
            )}
          </section>
        );
      })}
      <div style={{ marginTop: 12 }}>
        <input value={issue} onChange={(e) => setIssue(e.target.value)} style={{ width: 64 }} aria-label="Issue" />
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 140 }} aria-label="Unit name" />
        <button type="button" className="chip-btn" onClick={() => setMade(makeUnit({ issue, name }))}>MAKE</button>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{made.src}</pre>
      </div>
    </div>
  );
}
