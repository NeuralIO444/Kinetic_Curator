// BiologyPanel — #793: inspect and tune the lifecycle policy.
//
// Dev-only tab of the merged DEV panel. Shows the active biology policy
// (versioned, like the taste vector), the live vital signs of every growth
// layer, and import/export/reset. No prod surface: performer-facing controls
// stay in BUILD; this is the instrument's diagnostics bench.

import { useEffect, useRef, useState } from 'react';
import {
  BIO_VERSION,
  getBiologyPolicy, importBiologyPolicy, resetBiologyPolicy, exportBiologyPolicy,
} from '../biology/policy.js';
import { getLifecycleState } from '../biology/lifecycle.js';

function downloadJson(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const ROW = { display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 12 };
const KEY = { opacity: 0.55 };
const BTN = { fontSize: 12, padding: '4px 10px', cursor: 'pointer' };

export function BiologyPanel() {
  const [policy, setPolicy] = useState(() => getBiologyPolicy());
  const [layers, setLayers] = useState(() => [...getLifecycleState().entries()]);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);

  // Vital signs refresh while the panel is open — the live loop records
  // once per frame per growth layer.
  useEffect(() => {
    const id = setInterval(() => {
      setLayers([...getLifecycleState().entries()]);
      setPolicy(getBiologyPolicy());
    }, 500);
    return () => clearInterval(id);
  }, []);

  const onExport = () => {
    downloadJson(exportBiologyPolicy(), 'kinetic-curator-biology.json');
    setMessage('exported kinetic-curator-biology.json');
  };
  const onImportFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = importBiologyPolicy(JSON.parse(reader.result));
        setMessage(r.ok ? 'policy imported' : `import rejected: ${r.error}`);
        setPolicy(getBiologyPolicy());
      } catch {
        setMessage('import rejected: not JSON');
      }
    };
    reader.readAsText(file);
  };
  const onReset = () => {
    resetBiologyPolicy();
    setPolicy(getBiologyPolicy());
    setMessage('reset to shipped tuning');
  };

  const g = policy.growth;
  const entries = layers.sort((a, b) => b[1].at - a[1].at);

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div style={{ ...ROW, fontSize: 13 }}>
        <span><b>Lifecycle policy</b> <span style={KEY}>kc-biology v{BIO_VERSION}</span></span>
        <span style={KEY}>{policy.kind}</span>
      </div>
      <div style={{ margin: '8px 0', opacity: 0.85 }}>
        {[
          ['fadeStart', g.fadeStart, 'age01 where fading begins'],
          ['fadeEnd', g.fadeEnd, 'age01 where fully faded'],
          ['softCap', g.softCap, 'cells — regrow before the 2048 hard cap'],
          ['maxLifespan', `${g.maxLifespan}t`, 'oldest-cell age that ends a generation'],
          ['regrowMeanAge', g.regrowMeanAge, 'mean age01 that ends a generation'],
          ['minLifetime', `${g.minLifetime}t`, 'no rebirth before this age'],
        ].map(([k, v, hint]) => (
          <div key={k} style={ROW} title={hint}>
            <span style={KEY}>{k}</span><span>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button type="button" style={BTN} onClick={onExport}>Export JSON</button>
        <button type="button" style={BTN} onClick={() => fileRef.current?.click()}>Import JSON</button>
        <button type="button" style={BTN} onClick={onReset}>Reset to defaults</button>
        <input
          ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={(e) => { onImportFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
      {message && <div style={{ opacity: 0.7, marginBottom: 8 }}>{message}</div>}

      <div style={{ ...ROW, fontSize: 13, marginTop: 12 }}>
        <span><b>Living forms</b></span>
        <span style={KEY}>{entries.length} growth layer{entries.length === 1 ? '' : 's'}</span>
      </div>
      {entries.length === 0 && (
        <div style={{ opacity: 0.55, marginTop: 4 }}>
          No dla/eden layers on the live canvas. CURATE or pick a growth mode to watch a form live and die.
        </div>
      )}
      {entries.map(([id, s]) => (
        <div key={id} style={{ marginTop: 8, padding: 8, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4 }}>
          <div style={ROW}>
            <span><b>{s.mode}</b> <span style={KEY}>gen {s.gen}</span></span>
            <span style={KEY}>tick {s.tick}</span>
          </div>
          <div style={ROW}><span style={KEY}>cells</span><span>{s.cellCount}</span></div>
          <div style={ROW}><span style={KEY}>oldest cell</span><span>{s.oldestAge}t</span></div>
          <div style={ROW}><span style={KEY}>mean age</span><span>{Number(s.meanAge01).toFixed(2)}</span></div>
          <div style={ROW}>
            <span style={KEY}>policy</span>
            <span>{s.decision === 'regrow' ? `rebirth — ${s.reason}` : 'alive'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
