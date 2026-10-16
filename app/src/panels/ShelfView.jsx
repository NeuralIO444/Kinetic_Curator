// ShelfView.jsx — #1589 (Keeps K1): the keeps shelf, explorable in-app.
//
// The ASSETS drawer grows the shelf view the ruling demands (spec §2.2:
// "explorable is a surface requirement, not a sort order"). Two strips:
//
//   THE STAGE — the 16 slots the Looks menu shows, in menu order. Click
//   a slot to aim a swap at it. The performing Look's slot carries the
//   deck mark: it refuses swaps, out loud, in the line below (S1).
//
//   THE COLLECTION — every keep, searchable by label/family/palette/
//   origin/seed and sortable by kept date, last-staged, or never-staged
//   (the neglect order made visible — Lois's rule: show what has never
//   been staged like it matters). A collection keep can be loaded onto
//   the deck, staged into a free slot, or swapped into the aimed slot.
//
// All tier law lives in curator/shelf.mjs; this component only renders
// rows and dispatches the store's crown/swap actions. The shelf's line
// (shelfNotice) renders here — the surface where shelf acts happen.
//
// #1591 (Keeps K3): the collection listing spans the disk tier — keeps
// exported to the loot folder stay listed, marked on disk; staging or
// swapping one in re-imports its record in the same move. A keep whose
// record is not in hand (folder away, file gone) lists from its stub
// with its actions disabled — it cannot be loaded from a listing card.
import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import * as A from '../state/actions.js';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES } from '../data/palettes.js';
import {
  stageRecords, stageSlotsUsed, shelfDiskRows,
  STAGE_BUDGET, COLLECTION_SOFT_BOUND, SHELF_SORTS,
} from '../curator/shelf.mjs';
import { DEFAULT_SHELF_PREFS, tableName } from '../curator/shelfPrefs.mjs';

const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));

const SORT_LABEL = { kept: 'kept date', staged: 'last staged', never: 'never staged' };

export function ShelfView() {
  const { state, dispatch } = useApp((s) => ({
    keeps: s.keeps, keepStage: s.keepStage,
    shelfNotice: s.shelfNotice, performingKeepId: s.performingKeepId,
    shelfPrefs: s.shelfPrefs, shelfPrefsSource: s.shelfPrefsSource,
    // #1591 — the disk tier: records read this session + the stub index.
    shelfDiskRecords: s.shelfDiskRecords, shelfDiskStubs: s.shelfDiskStubs,
  }));
  const setShelfNotice = useStore((s) => s.setShelfNotice);
  const keeps = state.keeps || [];
  const keepStage = state.keepStage || [];
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('kept');
  const [aimedSlot, setAimedSlot] = useState(null); // stage index a swap targets

  const staged = useMemo(() => stageRecords(keeps, keepStage), [keeps, keepStage]);
  const used = stageSlotsUsed(keeps, keepStage);
  // #1591 — one listing, three locations: in-app records, disk records
  // read this session (marked on disk), and a stub row for every disk
  // keep whose record is not in hand (folder away, or the file gone).
  const diskRecords = useMemo(
    () => Object.values(state.shelfDiskRecords || {}),
    [state.shelfDiskRecords],
  );
  const diskStubs = state.shelfDiskStubs || {};
  const diskCount = Object.keys(diskStubs).length;
  const rows = useMemo(
    () => shelfDiskRows(keeps, keepStage, {
      diskRecords, stubs: diskStubs, query, sort, assetsById, palettesById,
    }),
    [keeps, keepStage, diskRecords, diskStubs, query, sort],
  );
  const aimedId = aimedSlot != null ? keepStage[aimedSlot] : null;
  // #1590 — the preferences in force (the loot read path applies the
  // file's; until then / without a folder, the shipped defaults).
  const effectivePrefs = state.shelfPrefs || DEFAULT_SHELF_PREFS;
  const softBound = state.shelfPrefs?.collectionSoftBound ?? COLLECTION_SOFT_BOUND;

  const swapIn = (row) => {
    if (aimedId == null) return;
    dispatch({ type: A.SWAP_STAGE_SLOT, outId: aimedId, inId: row.id });
    setAimedSlot(null);
  };

  return (
    <div className="shelf">
      <button type="button" className="shelf-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="shelf-title">KEEPS SHELF</span>
        <span className="shelf-counts">
          stage {used}/{STAGE_BUDGET} · collection {keeps.length + diskCount}
          {diskCount ? ` · ${diskCount} on disk` : ''}
          {keeps.length > softBound ? ` · over the ${softBound} soft bound` : ''}
        </span>
        <span className="shelf-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <div className="shelf-stage" role="list" aria-label="the stage — 16 slots">
            {staged.map((k, i) => (
              <button
                type="button" role="listitem" key={k.id}
                className={`shelf-slot${aimedSlot === i ? ' aimed' : ''}${k.id === state.performingKeepId ? ' on-deck' : ''}`}
                title={k.id === state.performingKeepId ? 'on the deck — this slot refuses swaps' : 'aim a swap at this slot'}
                onClick={() => setAimedSlot(aimedSlot === i ? null : i)}
              >
                <span className="shelf-slot-n">{i + 1}</span>
                <span className="shelf-slot-label">{k.config?.layout?.mode || 'look'} · {k.config?.palette?.id || ''}</span>
                {k.provenance?.source === 'explorer' ? <span className="shelf-mined">mined ×2</span> : null}
                {k.id === state.performingKeepId ? <span className="shelf-deck">on deck</span> : null}
              </button>
            ))}
            {staged.length === 0 && <span className="shelf-empty">the stage is empty — crown something</span>}
          </div>
          <div className="shelf-controls">
            <span className="prompt">⟩</span>
            <input
              placeholder="search the collection — family, palette, origin, seed"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="shelf-sorts" role="group" aria-label="sort the collection">
              {SHELF_SORTS.map((s) => (
                <button
                  type="button" key={s}
                  className={`shelf-sort${sort === s ? ' active' : ''}`}
                  onClick={() => setSort(s)}
                >{SORT_LABEL[s]}</button>
              ))}
            </span>
          </div>
          <div className="shelf-fillrow">
            <button type="button" className="micro-btn" onClick={() => dispatch({ type: A.FILL_STAGE })}>
              KINETIC — deal a new stage
            </button>
            <span className="shelf-table">
              table: {tableName(effectivePrefs)} · {state.shelfPrefsSource === 'file' ? 'preferences.json' : 'shipped defaults'}
            </span>
          </div>
          {aimedId != null && (
            <div className="shelf-aim">
              slot {aimedSlot + 1} aimed — pick a shelf keep to swap in
              <button type="button" className="micro-btn" onClick={() => setAimedSlot(null)}>clear</button>
            </div>
          )}
          {state.shelfNotice && (
            <div className="shelf-line" role="status">
              {state.shelfNotice}
              <button type="button" className="micro-btn" onClick={() => setShelfNotice(null)}>ok</button>
            </div>
          )}
          <div className="shelf-rows">
            {rows.map((row) => (
              <div key={row.id} className={`shelf-row${row.tier === 'stage' ? ' is-stage' : ''}`}>
                <span className="shelf-row-label" title={row.label}>{row.label}</span>
                <span className="shelf-row-meta">
                  {row.families.join(' ')}
                  {row.origin ? ` · ${row.origin}` : ''}
                  {row.keptAt ? ` · kept ${new Date(row.keptAt).toLocaleDateString()}` : ' · kept (legacy)'}
                  {row.stagedCount ? ` · staged ×${row.stagedCount}` : ' · never staged'}
                  {row.location === 'disk' ? ' · on disk' : ''}
                  {row.location === 'disk-away' ? ' · on disk — folder away' : ''}
                  {row.location === 'missing' ? ' · on disk — file gone' : ''}
                </span>
                <span className="shelf-row-actions">
                  {row.tier === 'stage'
                    ? <span className="shelf-onstage">on stage</span>
                    : (
                      <>
                        <button type="button" className="micro-btn" disabled={aimedId == null || !row.keep}
                          title={!row.keep ? 'its record is on disk, not read yet — connect the loot folder to bring it back' : (aimedId == null ? 'aim a stage slot first' : 'swap into the aimed slot')}
                          onClick={() => swapIn(row)}>swap in</button>
                        <button type="button" className="micro-btn" disabled={!row.keep}
                          title={row.keep ? 'take a free stage slot' : 'its record is on disk, not read yet — connect the loot folder to bring it back'}
                          onClick={() => dispatch({ type: A.STAGE_KEEP, keepId: row.id })}>stage it</button>
                      </>
                    )}
                  <button type="button" className="micro-btn" disabled={!row.keep}
                    title={row.keep ? undefined : 'on disk — stage it or swap it in to bring it back'}
                    onClick={() => dispatch({ type: A.RECALL_FAVORITE, favorite: row.keep })}>load</button>
                </span>
              </div>
            ))}
            {rows.length === 0 && <div className="shelf-empty">nothing on the shelf matches</div>}
          </div>
          <div className="shelf-foot">
            tier is membership, not a copy — a keep lives once: on the stage, in the collection, or on disk
          </div>
        </>
      )}
    </div>
  );
}
