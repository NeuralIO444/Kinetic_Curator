import { useCallback, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { emit, Events } from '../composition/eventBus.js';

const MAX_VISIBLE = 12;

/**
 * Floating Favorites / Hits setlist (#8 / #35).
 * Ordered tray: 1–9 recall, Enter/Space = next, morph-to, reorder.
 */
export function FavoritesTray() {
  const { state } = useApp((s) => ({
    favorites: s.favorites,
    seed: s.seed,
    morphing: s.morphing,
  }));
  const favorites = state.favorites || [];
  const trayRef = useRef(null);
  const [cursor, setCursor] = useState(0);

  // Performance order = favorites array order (oldest → newest); show last N
  const start = Math.max(0, favorites.length - MAX_VISIBLE);
  const visible = favorites.slice(start);

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
    const next = (cursor + 1) % visible.length;
    setCursor(next);
    recall(visible[next]);
  }, [visible, cursor, recall]);

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
      const next = (cursor - 1 + visible.length) % visible.length;
      setCursor(next);
      recall(visible[next]);
    }
  }, [visible, recall, advance, cursor]);

  if (visible.length === 0) {
    return (
      <div className="favorites-tray favorites-tray-empty" title="Press F to favorite a hit">
        <span className="favorites-tray-label">HITS</span>
        <span className="favorites-tray-hint">F to save · Enter advances setlist</span>
      </div>
    );
  }

  return (
    <div
      className="favorites-tray"
      ref={trayRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="toolbar"
      aria-label="Favorite hits setlist"
    >
      <span className="favorites-tray-label">HITS</span>
      {state.morphing && <span className="favorites-tray-hint" style={{ color: 'var(--accent)' }}>MORPH…</span>}
      <div className="favorites-tray-chips">
        {visible.map((f, i) => {
          const isCurrent = f.seed === state.seed;
          const isCursor = i === cursor;
          const seedHex = (f.seed >>> 0).toString(16).padStart(4, '0').slice(-4);
          return (
            <div
              key={f.id ?? `${f.seed}-${f.timestamp || i}`}
              className={`fav-chip ${isCurrent ? 'active' : ''} ${isCursor ? 'setlist-cursor' : ''}`}
              title={`Seed ${f.seed.toString(16)} · click recall · shift=evolve · alt=morph`}
              style={isCursor ? { outline: '1px solid var(--accent)' } : undefined}
            >
              <button
                type="button"
                className="fav-chip-main"
                onClick={(e) => {
                  setCursor(i);
                  if (e.altKey) morphTo(f);
                  else if (e.shiftKey) evolveFrom(f);
                  else recall(f);
                }}
              >
                <span className="fav-chip-num">{i + 1}</span>
                <span className="fav-chip-seed">{seedHex}</span>
              </button>
              <button
                type="button"
                className="fav-chip-evolve"
                title="Morph layout to this hit"
                onClick={() => { setCursor(i); morphTo(f); }}
              >
                ↔
              </button>
              <button
                type="button"
                className="fav-chip-evolve"
                title="Evolve from this"
                onClick={() => evolveFrom(f)}
              >
                ↻
              </button>
              <button
                type="button"
                className="fav-chip-evolve"
                title="Move earlier in setlist"
                onClick={() => move(f, -1)}
                disabled={!f.id}
              >
                ‹
              </button>
              <button
                type="button"
                className="fav-chip-evolve"
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
