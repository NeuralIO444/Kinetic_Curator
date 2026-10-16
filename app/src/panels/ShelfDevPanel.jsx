// DEV → SHELF (#1590): the Keeps fill's receipt surface, backstage.
// Read-only: it renders the preferences in force (with every named
// correction the parser made) and the LAST fill's ledger record —
// which rule dealt each slot, which rules dealt nothing, and the
// receipt's own notes. The deal itself lives in curator/shelfFill.mjs;
// this panel computes nothing, it reads the ledger.
import { useStore } from '../state/store.js';
import { shelfRow } from '../curator/shelf.mjs';
import { DEFAULT_SHELF_PREFS, RULE_ORDER, tableName } from '../curator/shelfPrefs.mjs';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES } from '../data/palettes.js';

const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));
const cell = { padding: '2px 6px', borderBottom: '1px solid #333', textAlign: 'left', whiteSpace: 'nowrap' };
const h3 = { margin: '14px 0 4px', fontSize: 12, letterSpacing: '0.08em' };
const dim = { opacity: 0.75, fontSize: 11 };

export function ShelfDevPanel() {
  const keeps = useStore((s) => s.keeps) || [];
  const keepStage = useStore((s) => s.keepStage) || [];
  const shelfHistory = useStore((s) => s.shelfHistory) || [];
  const shelfPrefs = useStore((s) => s.shelfPrefs);
  const shelfPrefsLines = useStore((s) => s.shelfPrefsLines) || [];
  const shelfPrefsSource = useStore((s) => s.shelfPrefsSource);

  const prefs = shelfPrefs || DEFAULT_SHELF_PREFS;
  const byId = new Map(keeps.map((k) => [k.id, k]));
  const lastFill = [...shelfHistory].reverse().find((r) => r && r.kind === 'fill') || null;
  const labelOf = (id) => {
    const k = byId.get(id);
    return k ? shelfRow(k, keepStage, { assetsById, palettesById }).label : id;
  };
  const undealt = lastFill?.undealt || [];

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <h3 style={{ ...h3, marginTop: 0 }}>THE TABLE IN FORCE</h3>
      <div>
        {tableName(prefs)} — {shelfPrefsSource === 'file' ? 'from preferences.json in the loot folder' : 'shipped defaults (no preferences.json read)'}
      </div>
      <div style={dim}>
        {RULE_ORDER.map((r) => `${r} ${prefs.table[r]}`).join(' · ')} · recency window {prefs.recencyWindow} fills ·
        collection soft bound {prefs.collectionSoftBound} (collection now {keeps.length}
        {keeps.length > prefs.collectionSoftBound ? ' — over: K3\'s export is the release valve, nothing is deleted' : ''})
      </div>
      {shelfPrefsLines.length > 0 && (
        <>
          <h3 style={h3}>CORRECTIONS + FALLBACKS, NAMED</h3>
          {shelfPrefsLines.map((l, i) => <div key={i} style={dim}>{l}</div>)}
        </>
      )}

      <h3 style={h3}>LAST FILL — THE RECEIPT</h3>
      {!lastFill && <div style={dim}>no fill yet — press KINETIC on the shelf and the deal lands here</div>}
      {lastFill && (
        <>
          <div style={dim}>
            seed {lastFill.seed} · table: {lastFill.table || '—'}
            {lastFill.at ? ` · ${new Date(lastFill.at).toLocaleString()}` : ''}
          </div>
          <table style={{ borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr><th style={cell}>slot</th><th style={cell}>rule</th><th style={cell}>keep</th></tr>
            </thead>
            <tbody>
              {lastFill.slots.map((s, i) => (
                <tr key={i}>
                  <td style={cell}>{i + 1}</td>
                  <td style={cell}>{s.rule}</td>
                  <td style={cell}>{labelOf(s.keepId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {undealt.length > 0 && (
            <div style={{ ...dim, marginTop: 6 }}>
              dealt nothing: {undealt.join(', ')} — named, never quietly backfilled
            </div>
          )}
          {(lastFill.notes || []).length > 0 && (
            <>
              <h3 style={h3}>RECEIPT NOTES</h3>
              {lastFill.notes.map((n, i) => <div key={i} style={dim}>{n}</div>)}
            </>
          )}
        </>
      )}
    </div>
  );
}
