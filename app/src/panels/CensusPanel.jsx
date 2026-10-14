// DEV → CENSUS (#1507): the Look Explorer census readout. Read-only by
// construction — it renders artifacts the E1/E2 stages produced (a
// coverage.json/census.json snapshot from scripts/censusSnapshot.mjs,
// or a miner run folder) and computes NOTHING itself: every number is
// reshaped by censusReadout.mjs from the artifact's own data, so the
// readout renders identically from the same artifacts on every load.
// Dev-panel only, reachable without the runbook (Matt's #1507 addition).
import { useRef, useState } from 'react';
import { coverageView, censusView, yieldByCornerView, COVERAGE_KIND, CENSUS_KIND } from '../curator/censusReadout.mjs';

const cell = { padding: '2px 6px', borderBottom: '1px solid #333', textAlign: 'left', whiteSpace: 'nowrap' };
const h3 = { margin: '14px 0 4px', fontSize: 12, letterSpacing: '0.08em' };
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const baseName = (f) => (f.webkitRelativePath || f.name).split('/').pop();

export function CensusPanel() {
  const fileRef = useRef(null);
  const [coverage, setCoverage] = useState(null);
  const [census, setCensus] = useState(null);
  const [runYield, setRunYield] = useState(null);
  const [note, setNote] = useState(null);

  const load = async (fileList) => {
    const files = new Map();
    for (const f of fileList || []) files.set(baseName(f), f);
    let saw = false;
    // Census snapshot artifacts: sniffed by their kind field.
    for (const name of ['coverage.json', 'census.json']) {
      const f = files.get(name);
      if (!f) continue;
      try {
        const art = JSON.parse(await f.text());
        if (art.kind === COVERAGE_KIND) { setCoverage(coverageView(art)); saw = true; }
        if (art.kind === CENSUS_KIND) { setCensus(censusView(art)); saw = true; }
      } catch { /* a bad file is skipped, never half-rendered */ }
    }
    // A run folder: yield by corner from its own candidate/finalist records.
    const runFile = files.get('run.json');
    const finFile = files.get('finalists.json');
    const candFile = files.get('candidates.json');
    if (runFile && finFile) {
      try {
        const run = JSON.parse(await runFile.text());
        const finalists = JSON.parse(await finFile.text());
        const candidates = candFile ? JSON.parse(await candFile.text()) : [];
        if (Array.isArray(finalists)) {
          setRunYield({ runId: run.runId ?? '?', ...yieldByCornerView({ candidates, finalists }) });
          saw = true;
        }
      } catch { /* skipped as above */ }
    }
    setNote(saw ? null : 'nothing readable in that pick — coverage.json / census.json, or a run folder');
  };

  const alarmCell = (r) => (
    r.alarm === 'zero' ? <span style={{ color: '#e5484d' }}>ZERO — alarm</span>
      : r.alarm === 'low' ? <span style={{ color: '#f5a524' }}>near-zero</span> : ''
  );
  const cutTable = (rows) => (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr>{['', 'library', 'dealt', 'tray'].map((h) => <th key={h} style={cell}>{h}</th>)}<th style={cell} /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td style={cell}>{r.name}</td><td style={cell}>{r.inLibrary}</td>
            <td style={cell}>{r.inCandidates}</td><td style={cell}>{r.inTray}</td>
            <td style={cell}>{alarmCell(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div>
        <button type="button" onClick={() => fileRef.current?.click()}>load artifacts</button>
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
          onChange={(e) => { load(e.target.files); e.target.value = ''; }} />
        <span style={{ opacity: 0.7, marginLeft: 8 }}>
          coverage.json + census.json (scripts/censusSnapshot.mjs) and/or a run folder — the readout computes nothing.
        </span>
      </div>
      {note && <p style={{ color: '#f5a524' }}>{note}</p>}
      {!coverage && !census && !runYield && !note && (
        <p style={{ opacity: 0.7 }}>No artifacts loaded. With the E1a snapshot present, radial + crystalline read 0 with their alarms lit.</p>
      )}

      {coverage && (
        <>
          <h3 style={h3}>TRAY COVERAGE — dice, {coverage.rolls} rolls (E1a census)</h3>
          <p style={{ margin: '2px 0' }}>
            library {coverage.library.assets} assets · {coverage.library.palettes} palettes · {coverage.library.layouts} layouts —
            tray reaches {coverage.trayDistinct}/{coverage.library.assets}; {coverage.trayNever} never; top-15 share {pct(coverage.top15Share)};
            layouts in tray {coverage.layoutsReached}/{coverage.layoutsTotal}.
          </p>
          {coverage.alarms.length > 0 && (
            <p style={{ margin: '2px 0', color: '#e5484d' }}>
              alarms: {coverage.alarms.map((a) => `${a.name} (${a.alarm})`).join(' · ')}
            </p>
          )}
          {cutTable(coverage.categories)}
          <h3 style={h3}>PACKS</h3>
          {cutTable(coverage.packs)}
          <h3 style={h3}>KEEPS COVERAGE</h3>
          <p style={{ margin: '2px 0' }}>
            {coverage.keeps.total} keeps ({coverage.keeps.withCast} with a cast, {coverage.keeps.castless} castless) —
            {coverage.keeps.distinctCategories} categories · {coverage.keeps.distinctPalettes} palettes · {coverage.keeps.distinctLayouts} layouts touched.
          </p>
          {coverage.keepsNote && <p style={{ margin: '2px 0', opacity: 0.75 }}>{coverage.keepsNote}</p>}
        </>
      )}

      {census && (
        <>
          <h3 style={h3}>PARAMETER CENSUS (E1b)</h3>
          <p style={{ margin: '2px 0' }}>
            {census.params.total} keys — {census.params.moves} move · {census.params.dead.length} dead ·
            {' '}{census.params.notHeadless.length} not headless-measurable · {census.params.dish} dish-matrix.
          </p>
          <p style={{ margin: '2px 0' }}>dead: {census.params.dead.join(', ') || 'none'}</p>
          <p style={{ margin: '2px 0' }}>
            render reach: {census.reach.assetsMeasured - census.reach.assetsUnreached.length}/{census.reach.assetsMeasured} assets draw
            {census.reach.assetsUnreached.length ? ` — unreached: ${census.reach.assetsUnreached.join(', ')}` : ''} ·
            {' '}palettes distinct {census.reach.palettesDistinct}/{census.reach.palettesTotal} ·
            {' '}layouts distinct {census.reach.layoutsDistinct}/{census.reach.layoutsTotal}.
          </p>
        </>
      )}

      {runYield && (
        <>
          <h3 style={h3}>EXPLORER YIELD BY CORNER — run {runYield.runId}</h3>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['corner', 'candidates', 'finalists', 'yield'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
            <tbody>
              {runYield.rows.map((r) => (
                <tr key={r.corner}>
                  <td style={cell}>{r.label}</td><td style={cell}>{r.candidates}</td>
                  <td style={cell}>{r.finalists}</td><td style={cell}>{pct(r.yieldPct)}</td>
                </tr>
              ))}
              <tr>
                <td style={cell}>all</td><td style={cell}>{runYield.totalCandidates}</td>
                <td style={cell}>{runYield.totalFinalists}</td>
                <td style={cell}>{runYield.totalCandidates ? pct(runYield.totalFinalists / runYield.totalCandidates) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
