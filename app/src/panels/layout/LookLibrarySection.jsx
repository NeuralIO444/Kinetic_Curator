// LookLibrarySection — #2148 step 2: the Look Library, in BUILD (docs/DLC_PRESET_TYPES.md §2: Looks are played in Build; Pipeline
// only installs). It lists what Pipeline installed, lets you pick Looks, remove one, and export the picked ones (or all) as a
// kc-pack/1 file. It does NOT apply a Look to the scene and does not touch the slots: loading a Look from here into one of the
// 16 slots is the next step, an explicit act of its own.
import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { downloadJsonFile } from '../pipeline/bundleFile.js';
import { buildLookPack, lookPackFilename } from '../../data/lookPack.mjs';
import {
  lookLibraryRows,
  toggleSelected,
  pruneSelection,
  exportSelectionPack,
  libraryCountLine,
  LIBRARY_EMPTY_LINE,
} from './lookLibraryRows.mjs';

export function LookLibrarySection() {
  const library = useStore((s) => s.lookLibrary);
  const removeLibraryLook = useStore((s) => s.removeLibraryLook);
  const [picked, setPicked] = useState([]);
  const [confirming, setConfirming] = useState(null); // the id whose REMOVE is awaiting its YES
  const [note, setNote] = useState(null);

  const rows = lookLibraryRows(library);
  const selected = pruneSelection(picked, library);

  const exportPicked = () => {
    const pack = exportSelectionPack(library, selected);
    if (!pack) return;
    downloadJsonFile(pack, lookPackFilename());
    setNote(`Look pack exported · ${pack.items.length} ${pack.items.length === 1 ? 'Look' : 'Looks'}`);
  };
  const exportAll = () => {
    if (!library.length) return;
    downloadJsonFile(buildLookPack(library), lookPackFilename());
    setNote(`Look pack exported · ${library.length} ${library.length === 1 ? 'Look' : 'Looks'}`);
  };

  return (
    <div className="look-library">
      {rows.length === 0 ? (
        <div className="unlock-note">{LIBRARY_EMPTY_LINE}</div>
      ) : (
        <>
          {rows.map((r) => (
            <div key={r.id} className="unlock-node is-lit" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={() => setPicked(toggleSelected(selected, r.id))}
                aria-label={`Select ${r.name}`}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="unlock-name">{r.name}</div>
                <div className="unlock-line">{r.detail}</div>
              </div>
              {confirming === r.id ? (
                <>
                  <button
                    className="big-btn act"
                    onClick={() => {
                      removeLibraryLook(r.id);
                      setConfirming(null);
                    }}
                    title="Remove this Look from the Library"
                  >
                    REMOVE?
                  </button>
                  <button className="big-btn" onClick={() => setConfirming(null)}>
                    KEEP
                  </button>
                </>
              ) : (
                <button
                  className="big-btn"
                  onClick={() => setConfirming(r.id)}
                  title="Remove this Look from the Library"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <span className="unlock-note" style={{ flex: 1 }}>
              {libraryCountLine(library, selected)}
            </span>
            <button
              className="big-btn dl act"
              disabled={selected.length === 0}
              onClick={exportPicked}
              title="Export the selected Looks as one shareable pack file"
            >
              ↓ SELECTED
            </button>
            <button
              className="big-btn dl act"
              onClick={exportAll}
              title="Export every Look in the Library as one pack file"
            >
              ↓ ALL
            </button>
          </div>
          {note && <div className="unlock-note">{note}</div>}
        </>
      )}
    </div>
  );
}
