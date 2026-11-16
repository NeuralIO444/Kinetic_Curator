// LookLibrarySection — #2148 step 2: the Look Library, in BUILD (docs/DLC_PRESET_TYPES.md §2: Looks are played in Build; Pipeline
// only installs). It lists what Pipeline installed, lets you pick Looks, remove one, and export the picked ones (or all) as a
// kc-pack/1 file. #2148 step 3 adds LOAD: an explicit act that puts a Look into a stage slot (a free one, or a chosen one after a
// REPLACE? confirm). Loading fills the slot only; it never applies the Look to the scene — playing the slot is the existing press.
import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { ASSETS } from '../../data/assets/index.js';
import { PALETTES } from '../../data/palettes.js';
import { shelfRow } from '../../curator/shelf.mjs';
import { slotChoices, REPLACE_PROMPT } from '../../curator/lookSlot.mjs';
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

const ASSETS_BY_ID = new Map(ASSETS.map((a) => [a.id, a]));
const PALETTES_BY_ID = new Map(PALETTES.map((p) => [p.id, p]));
const slotLabel = (k) => shelfRow(k, [], { assetsById: ASSETS_BY_ID, palettesById: PALETTES_BY_ID }).label;

export function LookLibrarySection() {
  const library = useStore((s) => s.lookLibrary);
  const removeLibraryLook = useStore((s) => s.removeLibraryLook);
  const [picked, setPicked] = useState([]);
  const [confirming, setConfirming] = useState(null); // the id whose REMOVE is awaiting its YES
  const [note, setNote] = useState(null);
  const keeps = useStore((s) => s.keeps);
  const keepStage = useStore((s) => s.keepStage);
  const performingKeepId = useStore((s) => s.performingKeepId);
  const loadLookToSlot = useStore((s) => s.loadLookToSlot);
  const [loading, setLoading] = useState(null); // the Library id whose LOAD picker is open
  const [replacing, setReplacing] = useState(null); // { outId } awaiting its REPLACE? / KEEP
  const choices = loading ? slotChoices(keeps, keepStage, { performingKeepId, labelOf: slotLabel }) : null;
  const doLoad = (id, outId) => {
    loadLookToSlot(id, outId);
    setNote(useStore.getState().shelfNotice); // the shelf's own line: what landed, or why it did not
    setLoading(null);
    setReplacing(null);
  };

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
            <div
              key={r.id}
              className="unlock-node is-lit"
              style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
            >
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
              <button
                className="big-btn"
                onClick={() => {
                  setLoading(loading === r.id ? null : r.id);
                  setReplacing(null);
                }}
                title="Put this Look into a stage slot (fills the slot only; does not apply it)"
              >
                LOAD
              </button>
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
              {loading === r.id && choices && (
                <div
                  style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 4 }}
                  role="group"
                  aria-label="Load into slot"
                >
                  <button
                    className="big-btn act"
                    disabled={!choices.canAddNew}
                    onClick={() => doLoad(r.id, null)}
                    title={choices.canAddNew ? 'Take the next free slot' : 'The stage is full — pick a slot to replace'}
                  >
                    ＋ FREE SLOT
                  </button>
                  {choices.slots.map((sl) =>
                    replacing?.outId === sl.outId ? (
                      <span key={sl.outId} style={{ display: 'inline-flex', gap: 4 }}>
                        <button className="big-btn act" onClick={() => doLoad(r.id, sl.outId)}>
                          {REPLACE_PROMPT} {sl.n}
                        </button>
                        <button className="big-btn" onClick={() => setReplacing(null)}>
                          KEEP
                        </button>
                      </span>
                    ) : (
                      <button
                        key={sl.outId}
                        className="big-btn"
                        disabled={sl.performing}
                        onClick={() => setReplacing({ outId: sl.outId })}
                        title={
                          sl.performing
                            ? 'That Look is on the deck — pick another slot'
                            : `Replace slot ${sl.n}: ${sl.label}`
                        }
                      >
                        {sl.n}
                      </button>
                    ),
                  )}
                </div>
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
