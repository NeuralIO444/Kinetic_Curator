import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { emit, Events } from '../composition/eventBus.js';

const MAX_VISIBLE = 12;

/**
 * Hits sequencer strip (was the floating Favorites tray, #8 / #35).
 * The tray becomes the sequencer — one surface, not two.
 *
 * Slice 1 (seq-cells): restyle as a bottom cell strip. No behavior change —
 * click = recall, shift-click = evolve-from, alt-click = morph-to,
 * 1–9 recall, Enter/Space/arrows step, ‹ › reorder by delta.
 * The transport slot at the left is reserved for the seq-transport slice.
 */
export function SeqStrip() {
  const { state } = useApp((s) => ({
    favorites: s.favorites,
    seed: s.seed,
    morphing: s.morphing,
  }));
  const favorites = state.favorites || [];
  const stripRef = useRef(null);
  const [cursor, setCursor] = useState(0);

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
    dragRef.current = { id: fav.id, fromIndex: i, startX: e.clientX, startY: e.clientY };
  }, []);

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
      const toIndex = gap > d.fromIndex ? gap - 1 : gap;
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

  // Performance order = favorites array order (oldest → newest); show last N
  const start = Math.max(0, favorites.length - MAX_VISIBLE);
  const visible = favorites.slice(start);
  // The window slides as favorites are added/removed — clamp the cursor so
  // it never points past the end or at a shifted item.
  const cur = Math.min(cursor, Math.max(0, visible.length - 1));

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

  const advance = useCallback(() => {
    if (visible.length === 0) return;
    const next = (cur + 1) % visible.length;
    setCursor(next);
    recall(visible[next]);
  }, [visible, cur, recall]);

  const onKeyDown = useCallback((e) => {
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (visible[idx]) {
        e.preventDefault();
        setCursor(idx);
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
      if (visible.length === 0) return;
      const next = (cur - 1 + visible.length) % visible.length;
      setCursor(next);
      recall(visible[next]);
    }
  }, [visible, recall, advance, cur]);

  if (visible.length === 0) {
    return (
      <div className="seq-strip seq-strip-empty" title="Press F to favorite a hit">
        <div className="seq-transport-slot" aria-hidden="true" />
        <span className="seq-label">HITS</span>
        <span className="seq-hint">
          F to save · Enter advances setlist
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
      {/* Transport lives here from the seq-transport slice on. */}
      <div className="seq-transport-slot" aria-hidden="true" />
      <span className="seq-label">HITS</span>
      {state.morphing && <span className="seq-hint" style={{ color: 'var(--accent)' }}>MORPH…</span>}
      <div className="seq-cells">
        {visible.map((f, i) => {
          const isCurrent = f.seed === state.seed;
          const isCursor = i === cur;
          const isDragging = dragId === f.id;
          const seedHex = (f.seed >>> 0).toString(16).padStart(4, '0').slice(-4);
          return (
            <Fragment key={f.id ?? `${f.seed}-${f.timestamp || i}`}>
              {dropGap === i && <div className="seq-drop-indicator" aria-hidden="true" />}
              <div
                ref={(el) => { if (f.id) { if (el) cellEls.current.set(f.id, el); else cellEls.current.delete(f.id); } }}
                className={`seq-cell ${isCurrent ? 'active' : ''} ${isCursor ? 'seq-cursor' : ''} ${isDragging ? 'seq-dragging' : ''}`}
                title={`Seed ${f.seed.toString(16)} · click recall · shift=evolve · alt=morph · drag to reorder`}
                style={isCursor ? { outline: '1px solid var(--accent)' } : undefined}
              >
              <button
                type="button"
                className="seq-cell-main"
                onPointerDown={(e) => onCellPointerDown(e, f, i)}
                onClick={(e) => {
                  if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                  setCursor(i);
                  if (e.altKey) morphTo(f);
                  else if (e.shiftKey) evolveFrom(f);
                  else recall(f);
                }}
              >
                <span className="seq-cell-num">{i + 1}</span>
                <span className="seq-cell-seed">{seedHex}</span>
              </button>
              <button
                type="button"
                className="seq-cell-btn"
                title="Morph layout to this hit"
                onClick={() => { setCursor(i); morphTo(f); }}
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
