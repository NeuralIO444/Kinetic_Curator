import { useCallback, useRef, useState } from 'react';
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
          const seedHex = (f.seed >>> 0).toString(16).padStart(4, '0').slice(-4);
          return (
            <div
              key={f.id ?? `${f.seed}-${f.timestamp || i}`}
              className={`seq-cell ${isCurrent ? 'active' : ''} ${isCursor ? 'seq-cursor' : ''}`}
              title={`Seed ${f.seed.toString(16)} · click recall · shift=evolve · alt=morph`}
              style={isCursor ? { outline: '1px solid var(--accent)' } : undefined}
            >
              <button
                type="button"
                className="seq-cell-main"
                onClick={(e) => {
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
          );
        })}
      </div>
    </div>
  );
}
