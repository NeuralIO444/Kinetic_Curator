// LootRow (#1479 slice 5) — point KC-1 at one folder on this Mac. Setup, not a feature to perform with: one quiet row,
// a status line and a log. This slice finds and indexes what is in the folder; taking the files in as assets, palettes
// and audio is the next slices, so nothing here changes the canvas yet.
//
// Desktop reads the folder natively; Chrome and Edge keep a folder handle (slice 5b). A browser with neither shows its reason
// instead of a dead button (like Syphon, #962). The folder is this machine's: it lives in its own local key and never
// travels in a project, a bundle or a share link.
import { useMemo, useState } from 'react';
import { seenLine } from '../../loot/lootNative.mjs';
import { createLootBackend } from '../../loot/lootBackend.mjs';
import { runScan } from '../../loot/lootRun.mjs';
import { takeInImages, ingestVia } from '../../loot/lootIngest.mjs';
import { takeInPalettes } from '../../loot/lootPalettes.mjs';
import { useStore } from '../../state/store.js';
import { loadIndex, saveIndex, withRoot, emptyIndex, countItems } from '../../loot/lootIndex.mjs';
import { statusLine, logLine, confirmForgetMessage, rootLabel, LABELS, NOT_CONFIRMED } from '../../loot/lootCopy.mjs';

const storage = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
const LOG_SHOWN = 40;

export function LootRow() {
  const native = useMemo(() => createLootBackend(), []); // the desktop shell's native side, or the browser's folder handle
  const [index, setIndex] = useState(() => loadIndex(storage()));
  const [busy, setBusy] = useState(null); // null | 'scanning' | 'reading n of m'
  const [last, setLast] = useState(null); // the last scan's summary, for the status line
  const [note, setNote] = useState(null);

  const unavailable = native.unavailable(); // null when the native calls are open
  const counts = countItems(index);

  const keep = (next) => { setIndex(next); saveIndex(storage(), next); };

  const scan = async (from) => {
    setBusy(LABELS.scanning); setNote(null);
    try {
      const r = await runScan({
        native, index: from, nowMs: Date.now(),
        onProgress: ({ done, total }) => setBusy(total ? LABELS.hashing(done, total) : LABELS.scanning),
      });
      if (!r.ok) { setNote(r.reason); return; }
      // the SVGs go into the pool through the app's own ingest (every trust check applies), up to its 32 slots
      const taken = await takeInImages({
        native, index: r.index, ingest: ingestVia(() => useStore.getState()),
        onProgress: ({ done, total }) => setBusy(total ? `adding ${done} of ${total} to the pool...` : LABELS.scanning),
      });
      // palettes go into the user palette library (your library, shared by every project)
      setBusy('adding palettes...');
      const pals = await takeInPalettes({ native, index: taken.index, importPalettes: (list) => useStore.getState().importUserPalettes(list) });
      keep(pals.index);
      setLast({
        added: r.summary.add, skipped: r.summary.skipped, missing: r.summary.missing,
        taken: taken.summary.taken + pals.summary.files, held: taken.summary.poolFull + taken.summary.rejected + pals.summary.rejected + pals.summary.unreadable,
      });
      if (r.unreachable) setNote('folder not reachable');
    } catch (e) {
      setNote(String((e && e.message) || e).slice(0, 120));
    } finally {
      setBusy(null);
    }
  };

  const point = async () => {
    const p = await native.pickFolder();
    if (!p.ok) { setNote(p.reason); return; }
    if (!p.path) return; // cancelled
    const next = withRoot(index, p.path);
    keep(next);
    await scan(next);
    if (p.note) setNote(p.note); // a browser that would not store the folder link says so, once
  };

  const forget = () => {
    if (!window.confirm(confirmForgetMessage(counts.items))) return;
    keep(emptyIndex()); setLast(null); setNote(null);
    if (native.forget) native.forget(); // a browser also drops its stored folder link (the folder and files are not touched)
  };

  const has = !!index.root;
  return (
    <div className="pipeline-loot" aria-label="Loot folder">
      <div className="pipeline-row">
        <span className="lbl" style={{ flex: 1, fontSize: 11 }}>{LABELS.title}</span>
        {unavailable ? (
          <span className="pipeline-status lbl" title={unavailable === NOT_CONFIRMED ? seenLine(typeof window !== 'undefined' ? window : undefined) : undefined}>{unavailable}</span>
        ) : (
          <>
            <button type="button" className="chip-btn act" onClick={point} disabled={!!busy}>{has ? LABELS.change : LABELS.point}</button>
            {has && <button type="button" className="chip-btn act" onClick={() => scan(index)} disabled={!!busy}>{LABELS.rescan}</button>}
            {has && <button type="button" className="chip-btn" onClick={forget} disabled={!!busy}>{LABELS.forget}</button>}
          </>
        )}
      </div>
      <div className="pipeline-hint" style={{ fontSize: 10, opacity: 0.7 }}>
        {unavailable ? LABELS.hint : (has ? rootLabel(index.root) : LABELS.hint)}
      </div>
      {!unavailable && (
        <div className="pipeline-hint pipeline-loot-status" style={{ fontSize: 10 }}>
          {busy || note || statusLine({ ...counts, ...(last || {}), scanned: !!last })}
        </div>
      )}
      {!unavailable && has && (
        <details className="pipeline-loot-log">
          <summary className="lbl" style={{ fontSize: 10 }}>{LABELS.logTitle} · {index.log.length}</summary>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, fontSize: 10, opacity: 0.8 }}>
            {index.log.length === 0 && <li>{LABELS.empty}</li>}
            {index.log.slice(0, LOG_SHOWN).map((r, i) => <li key={`${r.rel}-${i}`}>{logLine(r)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
