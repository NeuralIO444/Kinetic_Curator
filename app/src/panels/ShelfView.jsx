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
//
// K5 (the shelf revision — UX pass 2026-10-16 + Matt's split ruling):
// ONE shelf at two sizes, never two shelves. This component owns the
// shelf's one copy of UI state (aim, query, sort, notice, prefs) and
// renders it compact or expanded from the same variables:
//   · MINI — in the ASSETS drawer: head + stage grid + the fill band.
//     The glance surface; it renders no collection rows.
//   · EXPANDED — a large floating panel over the canvas (portal +
//     fixed, anchored to the canvas wrap, Esc / click-away closes, no
//     backdrop, no focus trap — the floating-editor grammar the
//     CHIAROSCURO editor shipped in #1587/#1621), carrying the tools
//     and the collection. Aiming in the mini is aiming in the
//     expanded: the same state, so the two can never disagree.
// The pass's hierarchy lives in panels/shelfView.mjs (two-tier rows,
// the fixed 16-cell grid, the aim sentence in the fill band, location
// as a right-edge tag, stub reasons said in the row).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import {
  shelfAnchor, stageCells, fillBandState, toolsStandDown,
  rowIdentity, rowMeta, rowLocationTag, rowReason,
} from './shelfView.mjs';

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
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('kept');
  const [aimedSlot, setAimedSlot] = useState(null); // stage index a swap targets
  const editorRef = useRef(null);
  const expandRef = useRef(null);

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
  const collectionCount = keeps.length + diskCount;
  const standDown = toolsStandDown(collectionCount);
  const cells = stageCells(staged, state.performingKeepId);
  const band = fillBandState({
    aimedSlot: aimedId != null ? aimedSlot : null,
    tableLine: `table: ${tableName(effectivePrefs)} · ${state.shelfPrefsSource === 'file' ? 'preferences.json' : 'shipped defaults'}`,
  });
  const countsText = `stage ${used}/${STAGE_BUDGET} · collection ${collectionCount}`
    + (diskCount ? ` · ${diskCount} on disk` : '');
  // The pass (P2-3): the soft-bound overflow is an event, not a count —
  // it leaves the head and stands in the notice position (the store's
  // own line, an actual receipt, always wins the slot).
  const overBound = keeps.length > softBound;

  const swapIn = (row) => {
    if (aimedId == null) return;
    dispatch({ type: A.SWAP_STAGE_SLOT, outId: aimedId, inId: row.id });
    setAimedSlot(null);
  };

  // The expanded panel's anchor + dismissal — the shipped floating
  // editor's seams (#1587): measure the canvas wrap, portal to body,
  // Esc or a pointerdown outside (editor and its anchor button aside)
  // closes, re-anchor on resize and after drags. No backdrop.
  const place = useCallback(() => {
    const wrap = document.querySelector('.canvas-wrap');
    const next = wrap ? shelfAnchor(wrap.getBoundingClientRect()) : null;
    setPos((prev) => {
      if (!next) return prev;
      if (prev && prev.top === next.top && prev.left === next.left
        && prev.width === next.width && prev.height === next.height) return prev;
      return next;
    });
  }, []);

  const openExpanded = useCallback(() => {
    place();
    setExpanded(true);
  }, [place]);

  const closeExpanded = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeExpanded(); };
    const onDown = (e) => {
      if (editorRef.current?.contains(e.target)) return;
      if (expandRef.current?.contains(e.target)) return;
      closeExpanded();
    };
    const onResize = () => place();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointerup', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerup', onResize);
    };
  }, [expanded, closeExpanded, place]);

  // — the shared bands: defined once, rendered by both sizes ————————

  const stageGrid = (
    <div className="shelf-stage" role="list" aria-label="the stage — 16 slots">
      {cells.map((cell) => (cell.keepId == null ? (
        <div key={cell.n} className="shelf-slot ghost" aria-hidden="true">
          <span className="shelf-slot-n">{cell.n}</span>
        </div>
      ) : (
        <button
          type="button" role="listitem" key={cell.keepId}
          className={`shelf-slot${aimedSlot === cell.n - 1 ? ' aimed' : ''}${cell.onDeck ? ' on-deck' : ''}`}
          title={cell.onDeck ? 'on the deck — this slot refuses swaps' : 'aim a swap at this slot'}
          onClick={() => setAimedSlot(aimedSlot === cell.n - 1 ? null : cell.n - 1)}
        >
          <span className="shelf-slot-top">
            <span className="shelf-slot-n">{cell.n}</span>
            <span className="shelf-slot-label" title={cell.label}>{cell.label}</span>
          </span>
          {cell.marks.length > 0 && <span className="shelf-slot-mark">{cell.marks.join(' · ')}</span>}
        </button>
      )))}
    </div>
  );

  const motto = (
    <div className="shelf-motto">
      tier is membership, not a copy — a keep lives once: on the stage, in the collection, or on disk
    </div>
  );

  const fillBand = (
    <div className="shelf-fillrow">
      <button type="button" className="micro-btn shelf-fill-btn" onClick={() => dispatch({ type: A.FILL_STAGE })}>
        KINETIC — deal a new stage
      </button>
      {band.kind === 'aim' ? (
        <>
          <span className="shelf-aimline">{band.text}</span>
          <button type="button" className="micro-btn shelf-aim-clear" onClick={() => setAimedSlot(null)}>clear</button>
        </>
      ) : (
        <span className="shelf-table">{band.text}</span>
      )}
    </div>
  );

  const noticeBand = state.shelfNotice ? (
    <div className="shelf-line" role="status">
      <span className="shelf-line-text">{state.shelfNotice}</span>
      <button type="button" className="micro-btn" onClick={() => setShelfNotice(null)}>ok</button>
    </div>
  ) : overBound ? (
    <div className="shelf-line shelf-overbound" role="status">
      <span className="shelf-line-text">collection over the {softBound} soft bound</span>
    </div>
  ) : null;

  const emptyStageLine = staged.length === 0
    ? <div className="shelf-empty">the stage is empty — crown something</div>
    : null;

  const controlsBand = (
    <div className="shelf-controls">
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
  );

  const rowsList = (
    <div className="shelf-rows">
      {rows.map((row) => {
        const reason = rowReason(row);
        const tag = rowLocationTag(row);
        return (
          <div key={row.id} className={`shelf-row${row.tier === 'stage' ? ' is-stage' : ''}`}>
            <span className="shelf-row-main">
              <span className="shelf-row-label" title={row.label}>{rowIdentity(row)}</span>
              <span className="shelf-row-meta">{rowMeta(row).join(' · ')}</span>
            </span>
            {tag && <span className="shelf-row-tag">{tag}</span>}
            {reason ? (
              <span className="shelf-row-reason">{reason}</span>
            ) : (
              <span className="shelf-row-actions">
                {row.tier !== 'stage' && aimedId != null && (
                  <>
                    <button type="button" className="micro-btn" disabled={!row.keep}
                      title="swap into the aimed slot"
                      onClick={() => swapIn(row)}>swap in</button>
                    <button type="button" className="micro-btn" disabled={!row.keep}
                      title="take a free stage slot"
                      onClick={() => dispatch({ type: A.STAGE_KEEP, keepId: row.id })}>stage it</button>
                  </>
                )}
                <button type="button" className="micro-btn" disabled={!row.keep}
                  onClick={() => dispatch({ type: A.RECALL_FAVORITE, favorite: row.keep })}>load</button>
              </span>
            )}
          </div>
        );
      })}
      {rows.length === 0 && <div className="shelf-empty">nothing on the shelf matches</div>}
    </div>
  );

  // — the two sizes ————————————————————————————————————————————————

  return (
    <div className="shelf">
      <div className="shelf-head">
        <button type="button" className="shelf-head-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="shelf-title">KEEPS SHELF</span>
          <span className="shelf-counts">{countsText}</span>
          <span className="shelf-caret">{open ? '▾' : '▸'}</span>
        </button>
        <button
          type="button" ref={expandRef} className="micro-btn shelf-expand"
          aria-expanded={expanded} aria-haspopup="dialog"
          title="Open the shelf over the canvas"
          onClick={() => (expanded ? closeExpanded() : openExpanded())}
        >expand</button>
      </div>
      {open && (
        <>
          {stageGrid}
          {motto}
          {!standDown && fillBand}
          {noticeBand}
          {emptyStageLine}
        </>
      )}
      {expanded && pos && createPortal(
        <div
          ref={editorRef}
          className="shelf-overlay"
          role="dialog"
          aria-label="KEEPS SHELF — the collection"
          style={{ top: pos.top, left: pos.left, width: pos.width, height: pos.height }}
        >
          <div className="shelf-overlay-head">
            <span className="shelf-title">KEEPS SHELF</span>
            <span className="shelf-counts">{countsText}</span>
            <button
              type="button" className="micro-btn shelf-overlay-close"
              onClick={closeExpanded}
              aria-label="Close the shelf"
            >×</button>
          </div>
          {stageGrid}
          {motto}
          {!standDown && controlsBand}
          {!standDown && fillBand}
          {noticeBand}
          {emptyStageLine}
          {rowsList}
        </div>,
        document.body,
      )}
    </div>
  );
}
