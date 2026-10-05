import { useCallback, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { emit, Events } from '../composition/eventBus.js';
import { recipeFieldsFromKept, copyTextToClipboard } from '../state/recipes.js';
import { encodeRecipeUrl, buildShareHref } from '../state/recipeUrls.js';
import { QUEUE_MAX_VISIBLE } from '../state/queueTransport.js';

const MAX_VISIBLE = QUEUE_MAX_VISIBLE; // #966 — the tray window IS the queue transport's setlist.

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
  // #966 — tap-to-jump: any tray tap moves the queue transport's index, so
  // autoplay continues from the jumped-to hit without pausing.
  const setQueueIndex = useStore((s) => s.setQueueIndex);
  const bumpQueueJump = useStore((s) => s.bumpQueueJump);
  const queuePlaying = useStore((s) => s.queuePlaying);
  const queueIndex = useStore((s) => s.queueIndex);
  // #534 — per-hit link feedback: the chip key whose link just copied.
  const [copiedKey, setCopiedKey] = useState(null);

  // #534 — favorite-as-link: favorites carry the identical field set as
  // live state, so one shared function encodes them.
  const copyLink = useCallback(async (fav) => {
    const payload = encodeRecipeUrl(recipeFieldsFromKept(fav));
    const href = buildShareHref(payload, typeof window !== 'undefined' ? window.location.href : '');
    const ok = await copyTextToClipboard(href);
    if (ok) {
      const key = fav.id ?? `${fav.seed}-${fav.timestamp || ''}`;
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
    }
  }, []);

  // Performance order = favorites array order (oldest → newest); show last N
  const start = Math.max(0, favorites.length - MAX_VISIBLE);
  const visible = favorites.slice(start);
  // The window slides as favorites are added/removed — clamp the cursor so
  // it never points past the end or at a shifted item.
  const cur = Math.min(cursor, Math.max(0, visible.length - 1));

  const recall = useCallback((fav, i) => {
    emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: fav });
    // #966 — tap-to-jump: autoplay continues from the jumped-to hit.
    if (typeof i === 'number') { setQueueIndex(i); bumpQueueJump(); }
  }, [setQueueIndex, bumpQueueJump]);

  const evolveFrom = useCallback((fav, i) => {
    emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: fav });
    emit(Events.DAVIS_EVOLVE, { mode: true });
    // #966 — tap-to-jump applies to shift-recall too.
    if (typeof i === 'number') { setQueueIndex(i); bumpQueueJump(); }
  }, [setQueueIndex, bumpQueueJump]);

  const morphTo = useCallback((fav, i) => {
    emit(Events.DAVIS_FAVORITE, { action: 'morph', favorite: fav });
    // #966 — tap-to-jump applies to alt-morph too.
    if (typeof i === 'number') { setQueueIndex(i); bumpQueueJump(); }
  }, [setQueueIndex, bumpQueueJump]);

  const move = useCallback((fav, delta) => {
    if (!fav.id) return;
    emit(Events.DAVIS_FAVORITE, { action: 'reorder', id: fav.id, delta });
  }, []);

  const advance = useCallback(() => {
    if (visible.length === 0) return;
    const next = (cur + 1) % visible.length;
    setCursor(next);
    recall(visible[next], next);
  }, [visible, cur, recall]);

  const onKeyDown = useCallback((e) => {
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (visible[idx]) {
        e.preventDefault();
        setCursor(idx);
        recall(visible[idx], idx);
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
      recall(visible[next], next);
    }
  }, [visible, recall, advance, cur]);

  if (visible.length === 0) {
    return (
      <div className="favorites-tray favorites-tray-empty" title="Press F to favorite a hit">
        <span className="favorites-tray-label">HITS</span>
        <span className="favorites-tray-hint">
          F to save · Enter advances setlist
        </span>
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
          const isCursor = i === cur;
          // #966 — highlight the hit the queue transport is on while playing.
          const isQueueHit = queuePlaying && i === Math.min(queueIndex, visible.length - 1);
          const seedHex = (f.seed >>> 0).toString(16).padStart(4, '0').slice(-4);
          return (
            <div
              key={f.id ?? `${f.seed}-${f.timestamp || i}`}
              className={`fav-chip ${isCurrent ? 'active' : ''} ${isCursor ? 'setlist-cursor' : ''} ${isQueueHit ? 'queue-now' : ''}`}
              title={`Seed ${f.seed.toString(16)} · click recall · shift=evolve · alt=morph`}
              style={isCursor ? { outline: '1px solid var(--accent)' } : undefined}
            >
              <button
                type="button"
                className="fav-chip-main"
                onClick={(e) => {
                  setCursor(i);
                  if (e.altKey) morphTo(f, i);
                  else if (e.shiftKey) evolveFrom(f, i);
                  else recall(f, i); // #966 — tap-to-jump
                }}
              >
                <span className="fav-chip-num">{i + 1}</span>
                <span className="fav-chip-seed">{seedHex}</span>
              </button>
              <button
                type="button"
                className="fav-chip-evolve"
                title="Copy a share link for this hit"
                onClick={() => copyLink(f)}
              >
                {copiedKey === (f.id ?? `${f.seed}-${f.timestamp || ''}`) ? '✓' : '⧉'}
              </button>
              <button
                type="button"
                className="fav-chip-evolve"
                title="Morph layout to this hit"
                onClick={() => { setCursor(i); morphTo(f, i); }}
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
