import { useEffect, useRef, useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { parseProject, downloadProject } from '../../state/projectDocument.js';
import { paletteImportMessage } from './paletteImportCopy.mjs';
import {
  importConfirmMessage, loadedMessage, exportSavedMessage, nextExportFilename,
  missingPaletteMessage, rememberRecent, readRecent, dirtyMessage,
} from './pipelineNotices.mjs';
import { attachThumbnail, readThumbnail } from './thumbnail.mjs';
import { buildProjectPayload } from '../../hooks/useProjectPayload.js';
import { hitsFromFavorites } from '../../state/hitsExport.js';
import { useStore } from '../../state/store.js';
import { helpText } from '../../data/helpCopy.js';

function downloadJsonBlob(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// onMessage: shown by the parent, the same slot batch-completion writes to —
// matches the original single status line under this section.
export function DataExportRow({
  seed, seedOffsets, paletteId, paletteOverrides, paletteLocks, layoutParams, lockedParams, caGrid,
  enabledAssets, quality, autoQuality, assetWeightOverrides, assetKineme, audioRoutes, midiMap, customAssets, layers,
  activeLayerId, layerSnapshots, userPalettes, favorites, onMessage,
}) {
  const fileInputRef = useRef(null);
  const paletteInputRef = useRef(null);
  const tasteInputRef = useRef(null);
  const [recent, setRecent] = useState(() => readRecent());
  const [loadedName, setLoadedName] = useState(null);
  const [pendingImport, setPendingImport] = useState(null); // #647 — { fileName, doc, sanitized }
  const exportedPayload = useRef(null);
  const [behind, setBehind] = useState(false);
  const tasteStatus = useStore((s) => s.tasteStatus);
  const importTasteToStore = useStore((s) => s.importTaste);
  const clearTaste = useStore((s) => s.clearTaste);
  const projectTitle = useStore((s) => s.projectTitle);
  const setProjectTitle = useStore((s) => s.setProjectTitle);

  const projectFields = {
    seed, seedOffsets, paletteId, paletteOverrides, paletteLocks, layoutParams, lockedParams, caGrid,
    enabledAssets, quality, autoQuality, assetWeightOverrides, assetKineme, audioRoutes, midiMap, customAssets, layers,
    activeLayerId, layerSnapshots, projectTitle,
  };


  const exportProject = () => {
    let payload = buildProjectPayload(projectFields);
    const canvas = document.querySelector('canvas');
    if (canvas?.toDataURL) {
      try { payload = attachThumbnail(payload, canvas.toDataURL('image/jpeg', 0.4)); } catch { /* hold last frame */ }
    }
    const filename = nextExportFilename(payload);
    downloadProject(payload, filename);
    exportedPayload.current = JSON.stringify(payload);
    onMessage(exportSavedMessage(filename));
    setRecent(rememberRecent(filename));
    setBehind(false);
  };

  useEffect(() => {
    setBehind(Boolean(dirtyMessage(exportedPayload.current, JSON.stringify(buildProjectPayload(projectFields)))));
  }, [projectFields]);


  const exportPalettes = () => downloadJsonBlob(userPalettes || [], 'kinetic-curator-palettes.json');

  const exportHits = () => {
    downloadJsonBlob({
      version: 1,
      project: buildProjectPayload(projectFields),
      hits: hitsFromFavorites(favorites),
    }, 'kinetic-curator-hits.json');
  };

  // #647 — read + parse shared by direct import and the confirm dialog.
  const readImportFile = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const result = parseProject(raw);
        resolve(result.ok
          ? { ok: true, doc: result.doc, sanitized: result.sanitized }
          : { ok: false, error: result.error });
      } catch (err) {
        console.warn('Failed to import project:', err);
        resolve({ ok: false, error: 'Invalid JSON' });
      }
    };
    // #640 — a failed file read (disk error, permissions) must say so
    // instead of failing silently.
    reader.onerror = () => resolve({ ok: false, error: 'Could not read file' });
    reader.readAsText(file);
  });

  const applyImport = (fileName, doc, sanitized) => {
    emit(Events.EXPORT_LOAD_PROJECT, doc);
    const miss = missingPaletteMessage(doc, userPalettes);
    const loaded = loadedMessage(fileName, doc, sanitized);
    onMessage(miss ? `${loaded}. ${miss}` : loaded);
    setLoadedName(fileName);
    setRecent(rememberRecent(fileName));
    exportedPayload.current = JSON.stringify(buildProjectPayload(projectFields));
  };

  const importProject = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const result = await readImportFile(file);
    if (!result.ok) {
      onMessage(result.error);
      return;
    }
    if (layers?.length) {
      // #647 — confirm before the import replaces the live piece. The
      // dialog shows the incoming seed and offers export-first.
      setPendingImport({ fileName: file.name, doc: result.doc, sanitized: result.sanitized });
      return;
    }
    applyImport(file.name, result.doc, result.sanitized);
  };

  const cancelImport = () => setPendingImport(null);

  const proceedImport = () => {
    if (!pendingImport) return;
    applyImport(pendingImport.fileName, pendingImport.doc, pendingImport.sanitized);
    setPendingImport(null);
  };

  const exportFirstImport = () => {
    if (!pendingImport) return;
    exportProject();
    applyImport(pendingImport.fileName, pendingImport.doc, pendingImport.sanitized);
    setPendingImport(null);
  };

  // #762 — taste.json from the Mac Studio runbook (§4). Validated before it is
  // kept; a bad file says why and changes nothing.
  const importTaste = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let raw;
      try {
        raw = JSON.parse(ev.target.result);
      } catch {
        onMessage('Taste: not valid JSON');
        return;
      }
      const r = importTasteToStore(raw);
      onMessage(r.ok ? 'Taste loaded' : `Taste: ${r.error}`);
      if (r.ok) setTimeout(() => onMessage(null), 2000);
    };
    reader.onerror = () => onMessage('Could not read file');
    reader.readAsText(file);
    e.target.value = '';
  };

  const importPalettes = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        emit(Events.PALETTE_IMPORT, list);
        onMessage(paletteImportMessage(list)); // #601: what the store keeps, not what the file held
      } catch {
        onMessage('Invalid palette JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <div className="pipeline-row">
        <input
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          placeholder="Project title (optional)"
          title="Project title — used in export filenames"
          style={{ flex: 2, fontSize: 11 }}
        />
        <button className="big-btn dl" onClick={exportProject} style={{ flex: 1 }} title="Export full project (X)">↓ PROJECT</button>
        <button className="big-btn" onClick={() => fileInputRef.current?.click()} style={{ flex: 1 }} title="Import project JSON">↑ IMPORT</button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importProject} style={{ display: 'none' }} />
      </div>
      {pendingImport && (
        <div style={{ border: '1px solid #8a6d2f', borderRadius: 4, padding: 8, margin: '2px 0 6px', background: '#16130c' }}>
          <div style={{ fontSize: 11, marginBottom: 6 }}>{importConfirmMessage(pendingImport.fileName, pendingImport.doc.seed)}</div>
          <div className="pipeline-row" style={{ gap: 6 }}>
            <button className="big-btn dl" onClick={exportFirstImport} style={{ flex: 1 }} title="Save the current piece to a file first, then import">Export current first</button>
            <button className="big-btn" onClick={cancelImport} style={{ flex: 1 }}>Cancel</button>
            <button className="big-btn" onClick={proceedImport} style={{ flex: 1 }} title="Replace the current piece with the imported file">Proceed</button>
          </div>
        </div>
      )}
      <div className="pipeline-row">
        <button className="big-btn dl" onClick={exportPalettes} style={{ flex: 1 }} title={`Export your ${(userPalettes || []).length} saved palettes`}>↓ PALETTES</button>
        <button className="big-btn" onClick={() => paletteInputRef.current?.click()} style={{ flex: 1 }} title="Import palette library JSON">↑ PALETTES</button>
        <input ref={paletteInputRef} type="file" accept=".json,application/json" onChange={importPalettes} style={{ display: 'none' }} />
      </div>
      <div className="pipeline-row">
        <button
          className="big-btn dl"
          onClick={exportHits}
          style={{ width: '100%' }}
          title={`Export ${(favorites || []).length} favourited seed(s) for studio/hits_bridge.py (issue #91)`}
        >
          ↓ HITS ({(favorites || []).length})
        </button>
      </div>
      <div className="pipeline-row" title={helpText('output-taste')}>
        <button className="big-btn" onClick={() => tasteInputRef.current?.click()} style={{ flex: 3 }}>↑ IMPORT TASTE</button>
        <button className="big-btn" onClick={clearTaste} style={{ flex: 1 }} title="Forget the imported taste">CLEAR</button>
        <input ref={tasteInputRef} type="file" accept=".json,application/json" onChange={importTaste} style={{ display: 'none' }} />
      </div>
      <div className="taste-status" style={{ fontSize: 10, opacity: 0.75, margin: '2px 0 6px' }}>{tasteStatus}</div>
      {loadedName && <div className="pipeline-hint" style={{ fontSize: 10 }}>Loaded {loadedName}{readThumbnail(projectFields) ? '' : ''}</div>}
      {behind && (
        <div className="pipeline-hint" style={{ fontSize: 10 }}>Export is behind the live piece</div>
      )}
      {recent.length > 0 && (
        <div className="pipeline-hint" style={{ fontSize: 10 }}>
          Recent: {recent.join(' · ')}
        </div>
      )}
    </>
  );
}
