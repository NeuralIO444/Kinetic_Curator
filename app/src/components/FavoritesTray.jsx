import { useCallback, useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { emit, Events } from '../composition/eventBus.js';

const MAX_VISIBLE = 12;

/**
 * Floating Favorites / Hits tray (#8).
 * Always-visible strip of recent hits for one-click recall.
 */
export function FavoritesTray() {
  const { state } = useApp((s) => ({
    favorites: s.favorites,
    seed: s.seed,
  }));
  const favorites = state.favorites || [];
  const trayRef = useRef(null);

  const visible = favorites.slice(-MAX_VISIBLE).reverse();

  const recall = useCallback((fav) => {
    emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: fav });
  }, []);

  const evolveFrom = useCallback((fav) => {
    emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: fav });
    // Start evolve after recall so the hit becomes the origin
    emit(Events.DAVIS_EVOLVE, { mode: true });
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (visible[idx]) {
        e.preventDefault();
        recall(visible[idx]);
      }
    }
  }, [visible, recall]);

  if (visible.length === 0) {
    return (
      <div className="favorites-tray favorites-tray-empty" title="Press F to favorite a hit">
        <span className="favorites-tray-label">HITS</span>
        <span className="favorites-tray-hint">F to save · tray appears here</span>
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
      aria-label="Favorite hits"
    >
      <span className="favorites-tray-label">HITS</span>
      <div className="favorites-tray-chips">
        {visible.map((f, i) => {
          const isCurrent = f.seed === state.seed;
          const seedHex = (f.seed >>> 0).toString(16).padStart(4, '0').slice(-4);
          return (
            <div
              key={f.id ?? `${f.seed}-${f.timestamp || i}`}
              className={`fav-chip ${isCurrent ? 'active' : ''}`}
              title={`Seed ${f.seed.toString(16)} · click recall · shift+click evolve from`}
            >
              <button
                type="button"
                className="fav-chip-main"
                onClick={(e) => {
                  if (e.shiftKey) evolveFrom(f);
                  else recall(f);
                }}
              >
                <span className="fav-chip-num">{i + 1}</span>
                <span className="fav-chip-seed">{seedHex}</span>
              </button>
              <button
                type="button"
                className="fav-chip-evolve"
                title="Evolve from this"
                onClick={() => evolveFrom(f)}
              >
                ↻
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
