// DEV → CENSUS (#1507): the Look Explorer census readout. Read-only by
// construction — it renders artifacts the E1/E2 stages produced (a
// coverage.json/census.json snapshot from scripts/censusSnapshot.mjs,
// or a miner run folder) and computes NOTHING itself: every number is
// reshaped by censusReadout.mjs from the artifact's own data, so the
// readout renders identically from the same artifacts on every load.
// Dev-panel only, reachable without the runbook (Matt's #1507 addition).
//
// The KEEPS SHELF section (#1592, K4) is the one live read in the
// panel: the shelf's own telemetry — tier counts, the fill-rule
// distribution, neglect coverage — tallied by censusReadout's
// shelfCensusView from the store's records + history ledger. It is
// still a readout: it renders what the ledger says, and an empty
// shelf says so in words instead of showing zeros with confidence.
import { useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { coverageView, censusView, yieldByCornerView, shelfCensusView, COVERAGE_KIND, CENSUS_KIND } from '../curator/censusReadout.mjs';
import { shelfRow } from '../curator/shelf.mjs';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES } from '../data/palettes.js';

const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));

const cell = { padding: '2px 6px', borderBottom: '1px solid #333', textAlign: 'left', whiteSpace: 'nowrap' };
const h3 = { margin: '14px 0 4px', fontSize: 12, letterSpacing: '0.08em' };
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const baseName = (f) => (f.webkitRelativePath || f.name).split('/').pop();

function ShelfSection() {
  const keeps = useStore((s) => s.keeps) || [];
  const keepStage = useStore((s) => s.keepStage) || [];
  const shelfHistory = useStore((s) => s.shelfHistory) || [];
  const shelfDiskStubs = useStore((s) => s.shelfDiskStubs) || {};
  const shelfDiskRecords = useStore((s) => s.shelfDiskRecords) || {};
  const shelfPrefs = useStore((s) => s.shelfPrefs);
  const shelfExportPrefs = useStore((s) => s.shelfExportPrefs);

  const labels = {};
  for (const k of [...keeps, ...Object.values(shelfDiskRecords)]) {
    if (k) labels[k.id] = shelfRow(k, keepStage, { assetsById, palettesById }).label;
  }
  for (const [id, stub] of Object.entries(shelfDiskStubs)) {
    if (!labels[id] && stub?.label) labels[id] = stub.label;
  }
  const v = shelfCensusView({
    keeps, stageIds: keepStage, history: shelfHistory,
    stubs: shelfDiskStubs, diskRecords: shelfDiskRecords,
    prefs: shelfPrefs, exportPrefs: shelfExportPrefs, labels,
  });

  return (
    <>
      <h3 style={{ ...h3, marginTop: 0 }}>KEEPS SHELF (#1592) — live, from the ledger</h3>
      {v.empty && <p style={{ margin: '2px 0' }}>{v.emptyLine}</p>}
      {!v.empty && (
        <>
          <p style={{ margin: '2px 0' }}>
            stage {v.tiers.stage} keeps · {v.tiers.slotsUsed}/{v.tiers.slotsBudget} slots —
            collection {v.tiers.collection} in-app — disk {v.tiers.disk}
            {v.tiers.disk ? ` (${v.tiers.diskRead} read · ${v.tiers.diskUnread} unread${v.tiers.diskMissing ? ` · ${v.tiers.diskMissing} missing` : ''})` : ''} —
            total {v.tiers.total} keeps.
          </p>
          <p style={{ margin: '2px 0' }}>
            soft bound {v.tiers.softBound}: {v.tiers.overBy > 0 ? `${v.tiers.overBy} over` : 'under'} ·
            ledger: {v.moves.crowns} crowns · {v.moves.swaps} swaps · {v.moves.exports} exports · {v.moves.imports} imports ·
            anchor {v.anchor.partial ? `partial — ${v.anchor.unread} on disk unread` : 'full weight'}
          </p>

          <h3 style={h3}>FILL RULES — last {v.fills.window} fills</h3>
          {v.fills.none && <p style={{ margin: '2px 0', opacity: 0.75 }}>no fills yet — the distribution reads the ledger once the trio has dealt.</p>}
          {!v.fills.none && (
            <>
              <p style={{ margin: '2px 0' }}>
                {v.fills.counted} of {v.fills.total} fills in the window · {v.fills.slotsTotal} slots dealt ·
                {' '}{v.fills.distinctDealt} distinct keeps{v.fills.lastTable ? ` · last table: ${v.fills.lastTable}` : ''}
              </p>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr>{['rule', 'dealt', 'fills', 'undealt'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
                <tbody>
                  {v.fills.rows.map((r) => (
                    <tr key={r.rule}>
                      <td style={cell}>{r.rule}</td><td style={cell}>{r.dealt}</td>
                      <td style={cell}>{r.fillsDealt}</td><td style={cell}>{r.undealt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3 style={h3}>NEGLECT — the disease, measured</h3>
          <p style={{ margin: '2px 0' }}>
            {v.neglect.stagedEver} of {v.neglect.population} keeps have reached the stage — coverage {pct(v.neglect.coverage)} ·
            {' '}{v.neglect.neverStaged} never staged.
          </p>
          {v.neglect.tail.length > 0 && (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>{['longest-unstaged', 'kept', 'staged', 'where'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {v.neglect.tail.map((t) => (
                  <tr key={t.id}>
                    <td style={cell}>{t.label}</td>
                    <td style={cell}>{t.keptAt ? new Date(t.keptAt).toLocaleDateString() : '—'}</td>
                    <td style={cell}>{t.neverStaged ? 'never' : `${t.stagedCount ?? 0}×`}</td>
                    <td style={cell}>{t.location === 'app' ? 'collection' : t.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {v.neglect.tailTotal > v.neglect.tail.length && (
            <p style={{ margin: '2px 0', opacity: 0.75 }}>…and {v.neglect.tailTotal - v.neglect.tail.length} more off-stage, in the same order.</p>
          )}

          <h3 style={h3}>WIRING — settings in force, and their footprints</h3>
          {v.wiring.map((w) => (
            <p key={w.key} style={{ margin: '2px 0' }}>{w.setting} — {w.footprint}</p>
          ))}
        </>
      )}
    </>
  );
}

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
      <ShelfSection />
      <div style={{ marginTop: 16 }}>
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
