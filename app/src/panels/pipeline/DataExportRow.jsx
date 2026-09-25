import { useRef } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { parseProject, downloadProject } from '../../state/projectDocument.js';
import { paletteImportMessage } from './paletteImportCopy.mjs';
import { buildProjectPayload } from '../../hooks/useProjectPayload.js';
import { hitsFromFavorites } from '../../state/hitsExport.js';

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
  enabledAssets, quality, autoQuality, assetWeightOverrides, customAssets, layers,
  activeLayerId, layerSnapshots, userPalettes, favorites, onMessage,
}) {
  const fileInputRef = useRef(null);
  const paletteInputRef = useRef(null);

  const projectFields = {
    seed, seedOffsets, paletteId, paletteOverrides, paletteLocks, layoutParams, lockedParams, caGrid,
    enabledAssets, quality, autoQuality, assetWeightOverrides, customAssets, layers,
    activeLayerId, layerSnapshots,
  };

  const exportProject = () => downloadProject(buildProjectPayload(projectFields));

  const exportPalettes = () => downloadJsonBlob(userPalettes || [], 'kinetic-curator-palettes.json');

  const exportHits = () => {
    downloadJsonBlob({
      version: 1,
      project: buildProjectPayload(projectFields),
      hits: hitsFromFavorites(favorites),
    }, 'kinetic-curator-hits.json');
  };

  const importProject = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const result = parseProject(raw);
        if (!result.ok) {
          onMessage(result.error);
          return;
        }
        emit(Events.EXPORT_LOAD_PROJECT, result.doc);
        onMessage('Project loaded');
        setTimeout(() => onMessage(null), 2000);
      } catch (err) {
        console.warn('Failed to import project:', err);
        onMessage('Invalid JSON');
      }
    };
    // #640 — a failed file read (disk error, permissions) must say so
    // instead of failing silently.
    reader.onerror = () => {
      onMessage('Could not read file');
    };
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
        <button className="big-btn dl" onClick={exportProject} style={{ flex: 1 }} title="Export full project">↓ PROJECT</button>
        <button className="big-btn" onClick={() => fileInputRef.current?.click()} style={{ flex: 1 }} title="Import project JSON">↑ IMPORT</button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importProject} style={{ display: 'none' }} />
      </div>
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
    </>
  );
}
