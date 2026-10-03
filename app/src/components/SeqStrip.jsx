import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { SEQ_CLOCKS, SEQ_CLOCK_LABELS } from '../hooks/useSeqClock.js';
import { SEQ_PAGE_SIZE } from '../state/seqEngine.mjs';
import { emit, Events } from '../composition/eventBus.js';

// (SEQ_PAGE_SIZE lives in seqEngine.mjs)

/** Manual transport: ▶/■, step-forward, loop, clock source, tempo. */
function Transport({ playing, loop, clock, phraseBpm, onPlayStop, onStep, onLoop, onClock, onBpm }) {
  const cycleClock = () => {
    const i = SEQ_CLOCKS.indexOf(clock);
    onClock(SEQ_CLOCKS[(i + 1) % SEQ_CLOCKS.length]);
  };
  return (
    <div className="seq-transport" role="toolbar" aria-label="Sequencer transport">
      <button
        type="button"
        className={`seq-transport-btn ${playing ? 'on' : ''}`}
        title={playing ? 'Stop the sequencer (■)' : 'Play the setlist (▶)'}
        onClick={onPlayStop}
      >
        {playing ? '■' : '▶'}
      </button>
      <button
        type="button"
        className="seq-transport-btn"
        title="Step forward one hit"
        onClick={onStep}
      >
        ⏭
      </button>
      <button
        type="button"
        className={`seq-transport-btn ${loop ? 'on' : ''}`}
        title={loop ? 'Loop on — wraps at the end' : 'Loop off — stops at the end'}
        onClick={onLoop}
        aria-pressed={loop}
      >
        ∞
      </button>
      {/* Clock source picker (seq-clock-sources): metro / phrase / audio / euclid. */}
      <button
        type="button"
        className="seq-transport-btn seq-clock-btn"
        title={`Clock source: ${clock} — click to cycle`}
        onClick={cycleClock}
      >
        {SEQ_CLOCK_LABELS[clock] || 'MTR'}
      </button>
      {/* The visible clock (seq-clocked): the SHARED phrase BPM, displayed
          and set right here. One tempo for everything. */}
      <input
        type="number"
        className="seq-tempo"
        min={40}
        max={240}
        step={1}
        value={phraseBpm}
        title="Tempo — shared with the phrase clock"
        aria-label="Sequencer tempo (shared phrase BPM)"
        onChange={(e) => onBpm(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * Hits sequencer strip (was the floating Favorites tray, #8 / #35).
 * The tray becomes the sequencer — one surface, not two.
 *
 * Slice 3 (seq-transport-manual): the transport shell lives in the reserved
 * slot — ▶/■, step-forward, loop. The local cursor is now the store
 * playhead (seqIndex); manual steps fire recall, like the tray's advance.
 * The clock slices drive the same playhead.
 */
export function SeqStrip() {
  const { state } = useApp((s) => ({
    favorites: s.favorites,
    seed: s.seed,
    morphing: s.morphing,
    seqPlaying: s.seqPlaying,
    seqIndex: s.seqIndex,
    seqLoop: s.seqLoop,
    seqGaps: s.seqGaps,
    phraseBpm: s.phraseBpm,
    seqClock: s.seqClock,
    seqPage: s.seqPage,
  }));
  const seqSetClock = useStore((s) => s.seqSetClock);
  const seqSetPage = useStore((s) => s.seqSetPage);
  const seqSetGap = useStore((s) => s.seqSetGap);
  const seqStep = useStore((s) => s.seqStep);
  const seqPlay = useStore((s) => s.seqPlay);
  const seqStop = useStore((s) => s.seqStop);
  const seqSetLoop = useStore((s) => s.seqSetLoop);
  const seqSetIndex = useStore((s) => s.seqSetIndex);
  const favorites = state.favorites || [];
  const stripRef = useRef(null);

  // seq-strip-cap: page computation lives here so the DnD handlers below
  // can use the global pageStart.
  const pageCount = Math.max(1, Math.ceil(favorites.length / SEQ_PAGE_SIZE));
  const page = Math.max(0, Math.min(state.seqPage, pageCount - 1));
  const pageStart = page * SEQ_PAGE_SIZE;
  const visible = favorites.slice(pageStart, pageStart + SEQ_PAGE_SIZE);
  // Global playhead index; the page-relative position for highlighting.
  const cur = Math.min(state.seqIndex, Math.max(0, favorites.length - 1));

  // --- seq-dnd: pointer-based drag reorder ---------------------------------
  // Drag starts on a cell's main button; a >6px move becomes a drag (the
  // click is then suppressed). The insertion gap is computed from the
  // pointer's x against cell midpoints; the drop indicator renders at it.
  const dragRef = useRef(null); // { id, fromIndex, startX, startY } | null
  const suppressClickRef = useRef(false);
  const cellEls = useRef(new Map()); // fav.id -> element
  const [dragId, setDragId] = useState(null);
  const [dropGap, setDropGap] = useState(null); // insertion gap 0..n

  const gapFromPoint = useCallback((clientX) => {
    const els = [];
    cellEls.current.forEach((el) => { if (el) els.push(el); });
    for (let k = 0; k < els.length; k++) {
      const r = els[k].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return k;
    }
    return els.length;
  }, []);

  const onCellPointerDown = useCallback((e, fav, i) => {
    if (e.button !== 0 || !fav.id) return;
    // Store the global index and page start — DnD is within the page, but
    // moveFavorite needs the global toIndex.
    dragRef.current = { id: fav.id, fromIndex: pageStart + i, pageStart, startX: e.clientX, startY: e.clientY };
  }, [pageStart]);

  // Window-level move/up: the pointer leaves the button mid-drag, so the
  // button's own handlers would go deaf. These read dragRef and no-op
  // unless a drag is in flight.
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= 6) return;
      setDragId((prev) => (prev === d.id ? prev : d.id));
      setDropGap(gapFromPoint(e.clientX));
    };
    const onUp = (e) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragId(null);
      setDropGap(null);
      if (!d) return;
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= 6) return; // a click
      const gap = gapFromPoint(e.clientX);
      // gap is page-relative; convert to a global toIndex.
      const globalGap = d.pageStart + gap;
      const toIndex = globalGap > d.fromIndex ? globalGap - 1 : globalGap;
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 100);
      emit(Events.DAVIS_FAVORITE, { action: 'move', id: d.id, toIndex });
    };
    const onCancel = () => {
      dragRef.current = null;
      setDragId(null);
      setDropGap(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [gapFromPoint]);
  // --- /seq-dnd -------------------------------------------------------------

  const recall = useCallback((fav) => {
    emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: fav });
  }, []);

  const evolveFrom = useCallback((fav) => {
    emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: fav });
    emit(Events.DAVIS_EVOLVE, { mode: true });
  }, []);

  const morphTo = useCallback((fav) => {
    emit(Events.DAVIS_FAVORITE, { action: 'morph', favorite: fav });
  }, []);

  const move = useCallback((fav, delta) => {
    if (!fav.id) return;
    emit(Events.DAVIS_FAVORITE, { action: 'reorder', id: fav.id, delta });
  }, []);

  // Manual step: advance the playhead and fire the transition the gap toggle
  // chose for the destination cell (seq-gap-toggles).
  const stepFire = useCallback(() => {
    const res = seqStep();
    if (!res || res.stopped || !res.favorite) return;
    emit(Events.DAVIS_FAVORITE, {
      action: res.mode === 'cut' ? 'recall' : 'morph',
      favorite: res.favorite,
    });
  }, [seqStep]);

  const advance = useCallback(() => {
    stepFire();
  }, [stepFire]);

  const onKeyDown = useCallback((e) => {
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (visible[idx]) {
        e.preventDefault();
        seqSetIndex(pageStart + idx);
        recall(visible[idx]);
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advance();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      advance();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (favorites.length === 0) return;
      const next = (cur - 1 + favorites.length) % favorites.length;
      seqSetIndex(next);
      recall(favorites[next]);
    }
  }, [visible, favorites, recall, advance, cur, pageStart, seqSetIndex]);

  if (visible.length === 0) {
    return (
      <div className="seq-strip seq-strip-empty" title="Press F to favorite a hit">
        <Transport
          playing={state.seqPlaying}
          loop={state.seqLoop}
          onPlayStop={() => (state.seqPlaying ? seqStop() : seqPlay())}
          onStep={stepFire}
          onLoop={() => seqSetLoop(!state.seqLoop)}
        />
        <span className="seq-label">HITS</span>
        <span className="seq-hint">
          F to save · ▶ plays the setlist
        </span>
      </div>
    );
  }

  return (
    <div
      className="seq-strip"
      ref={stripRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="toolbar"
      aria-label="Hits sequencer"
    >
      <Transport
        playing={state.seqPlaying}
        loop={state.seqLoop}
        clock={state.seqClock}
        phraseBpm={state.phraseBpm}
        onPlayStop={() => (state.seqPlaying ? seqStop() : seqPlay())}
        onStep={stepFire}
        onLoop={() => seqSetLoop(!state.seqLoop)}
        onClock={(c) => seqSetClock(c)}
        onBpm={(bpm) => emit(Events.DAVIS_PHRASE, { bpm })}
      />
      <span className="seq-label">HITS</span>
      {pageCount > 1 && (
        <span className="seq-pager" role="group" aria-label="Strip pages">
          <button
            type="button"
            className="seq-pager-btn"
            title="Previous page"
            disabled={page <= 0}
            onClick={() => seqSetPage(page - 1)}
          >
            ‹
          </button>
          <span className="seq-pager-num" title={`Page ${page + 1} of ${pageCount}`}>
            {page + 1}/{pageCount}
          </span>
          <button
            type="button"
            className="seq-pager-btn"
            title="Next page"
            disabled={page >= pageCount - 1}
            onClick={() => seqSetPage(page + 1)}
          >
            ›
          </button>
        </span>
      )}
      {state.morphing && <span className="seq-hint" style={{ color: 'var(--accent)' }}>MORPH…</span>}
      <div className="seq-cells">
        {visible.map((f, i) => {
          const gi = pageStart + i; // global index in the full array
          const isCurrent = f.seed === state.seed;
          const isCursor = gi === cur;
          const isDragging = dragId === f.id;
          const seedHex = (f.seed >>> 0).toString(16).padStart(4, '0').slice(-4);
          return (
            <Fragment key={f.id ?? `${f.seed}-${f.timestamp || gi}`}>
              {dropGap === i && <div className="seq-drop-indicator" aria-hidden="true" />}
              {/* Gap toggle: the transition INTO this cell. Default morph. */}
              <button
                type="button"
                className={`seq-gap-toggle ${((state.seqGaps || {})[f.id] || 'morph') === 'cut' ? 'cut' : ''}`}
                title={`Transition into hit ${gi + 1}: ${(state.seqGaps || {})[f.id] || 'morph'} — click to flip`}
                onClick={() => {
                  if (!f.id) return;
                  const curMode = (state.seqGaps || {})[f.id] || 'morph';
                  seqSetGap(f.id, curMode === 'cut' ? 'morph' : 'cut');
                }}
              >
                {((state.seqGaps || {})[f.id] || 'morph') === 'cut' ? 'C' : 'M'}
              </button>
              <div
                ref={(el) => { if (f.id) { if (el) cellEls.current.set(f.id, el); else cellEls.current.delete(f.id); } }}
                className={`seq-cell ${isCurrent ? 'active' : ''} ${isCursor ? (state.seqPlaying ? 'seq-playhead' : 'seq-cursor') : ''} ${isDragging ? 'seq-dragging' : ''}`}
                title={`Seed ${f.seed.toString(16)} · click recall · shift=evolve · alt=morph · drag to reorder`}
                style={isCursor && !state.seqPlaying ? { outline: '1px solid var(--accent)' } : undefined}
              >
              <button
                type="button"
                className="seq-cell-main"
                onPointerDown={(e) => onCellPointerDown(e, f, i)}
                onClick={(e) => {
                  if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                  seqSetIndex(gi);
                  if (e.altKey) morphTo(f);
                  else if (e.shiftKey) evolveFrom(f);
                  else recall(f);
                }}
              >
                <span className="seq-cell-num">{gi + 1}</span>
                <span className="seq-cell-seed">{seedHex}</span>
              </button>
              <button
                type="button"
                className="seq-cell-btn"
                title="Morph layout to this hit"
                onClick={() => { seqSetIndex(gi); morphTo(f); }}
              >
                ↔
              </button>
              <button
                type="button"
                className="seq-cell-btn"
                title="Evolve from this"
                onClick={() => evolveFrom(f)}
              >
                ↻
              </button>
              <button
                type="button"
                className="seq-cell-btn"
                title="Move earlier in setlist"
                onClick={() => move(f, -1)}
                disabled={!f.id}
              >
                ‹
              </button>
              <button
                type="button"
                className="seq-cell-btn"
                title="Move later in setlist"
                onClick={() => move(f, 1)}
                disabled={!f.id}
              >
                ›
              </button>
            </div>
            </Fragment>
          );
        })}
        {dropGap === visible.length && <div className="seq-drop-indicator" aria-hidden="true" />}
      </div>
    </div>
  );
}
