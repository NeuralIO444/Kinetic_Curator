import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { emit, Events } from '../composition/eventBus.js';
import { recipeFieldsFromKept, copyTextToClipboard } from '../state/recipes.js';
import { encodeRecipeUrl, buildShareHref } from '../state/recipeUrls.js';
import { QUEUE_MAX_VISIBLE } from '../state/queueTransport.js';
import { hitName, hitAge } from '../curator/hitName.js';
import { bandsFor } from '../curator/hitBands.js';
import { parseFavoriteTimestamp } from '../curator/loisActivity.js';

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
    userPalettes: s.userPalettes,
  }));
  const favorites = state.favorites || [];
  const userPalettes = state.userPalettes;
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
  const [dragId, setDragId] = useState(null); // #1124 — the pill being dragged
  // #1124 — the hover card. The chip row scrolls sideways (which clips anything inside it), so the card is drawn
  // once, in the page, above the pill it belongs to; a short grace lets the pointer cross onto it.
  const [card, setCard] = useState(null); // { i, now, left, bottom }
  const cardTimer = useRef(null);
  const openCard = useCallback((i, el) => {
    clearTimeout(cardTimer.current);
    const r = el.getBoundingClientRect();
    setCard({ i, now: Date.now(), left: Math.max(4, Math.min(r.left, window.innerWidth - 238)), bottom: window.innerHeight - r.top + 6 });
  }, []);
  const closeCard = useCallback(() => { clearTimeout(cardTimer.current); cardTimer.current = setTimeout(() => setCard(null), 160); }, []);

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

  // #1124 — drag a pill onto another to put it there: the reorder is a delta from where it is now, in the full list.
  const dropOn = useCallback((targetId) => {
    if (!dragId || !targetId || dragId === targetId) return;
    const from = favorites.findIndex((x) => x.id === dragId);
    const to = favorites.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0) return;
    emit(Events.DAVIS_FAVORITE, { action: 'reorder', id: dragId, delta: to - from });
  }, [dragId, favorites]);

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
    // Alt + arrow moves the hit under the cursor earlier / later in the setlist (the keyboard's drag)
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && visible[cur]) {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      move(visible[cur], delta);
      setCursor(Math.max(0, Math.min(visible.length - 1, cur + delta)));
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
  }, [visible, recall, advance, cur, move]);

  if (visible.length === 0) {
    return (
      <div className="favorites-tray favorites-tray-empty" title="Press F to favorite a hit">
        <span className="favorites-tray-label ttl">hits</span>
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
      <span className="favorites-tray-label ttl">hits</span>
      {state.morphing && <span className="favorites-tray-hint lbl" style={{ color: 'var(--accent)' }}>morph…</span>}
      <div className="favorites-tray-chips">
        {visible.map((f, i) => {
          const isCurrent = f.seed === state.seed;
          const isCursor = i === cur;
          // #966 — highlight the hit the queue transport is on while playing.
          const isQueueHit = queuePlaying && i === Math.min(queueIndex, visible.length - 1);
          const nm = hitName(f.seed);
          const bands = bandsFor(f, userPalettes);
          return (
            <div
              key={f.id ?? `${f.seed}-${f.timestamp || i}`}
              className={`hit-pill ${isCurrent ? 'active' : ''} ${isCursor ? 'setlist-cursor' : ''} ${isQueueHit ? 'queue-now' : ''}`}
              data-playing={isQueueHit ? 'true' : undefined}
              draggable={!!f.id}
              data-dragging={dragId === f.id ? 'true' : undefined}
              onDragStart={(e) => { if (!f.id) return; setDragId(f.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id); }}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); dropOn(f.id); setDragId(null); }}
              onDragEnd={() => setDragId(null)}
              onMouseEnter={(e) => openCard(i, e.currentTarget)}
              onMouseLeave={closeCard}
              onFocus={(e) => openCard(i, e.currentTarget)}
              onBlur={closeCard}
            >
              <button
                type="button"
                className="hit-pill-main"
                aria-label={`Hit ${i + 1}, ${nm.short}. Click to recall, shift to evolve, alt to morph`}
                onClick={(e) => {
                  setCursor(i);
                  if (e.altKey) morphTo(f, i);
                  else if (e.shiftKey) evolveFrom(f, i);
                  else recall(f, i); // #966 — tap-to-jump
                }}
              >
                <span className="hit-pill-num">{i + 1}</span>
                <span className="hit-pill-name">{nm.short}</span>
                <span className="hit-bands" aria-hidden="true">
                  {bands.c.map((c, k) => <span key={k} className="hit-band" style={{ background: c }} />)}
                  <span className={`hit-band heat h${bands.h}`} />
                </span>
              </button>
              <button type="button" className="hit-pill-act" aria-label={`Duplicate hit ${i + 1}`} title="Duplicate (a setlist copy, not a new keep)"
                disabled={!f.id} onClick={() => emit(Events.DAVIS_FAVORITE, { action: 'duplicate', id: f.id })}>⧉</button>
              <button type="button" className="hit-pill-act del" aria-label={`Delete hit ${i + 1}`} title="Remove from the setlist (the keep stays)"
                disabled={!f.id} onClick={() => emit(Events.DAVIS_FAVORITE_REMOVE, { id: f.id })}>×</button>
              <span className="hit-pill-grip" aria-hidden="true" title="Drag to reorder (Alt+Left/Right from the keyboard)">⋮⋮</span>
            </div>
          );
        })}
      </div>
      {card && visible[card.i] && (() => {
        const f = visible[card.i];
        const key = f.id ?? `${f.seed}-${f.timestamp || ''}`;
        const nm = hitName(f.seed);
        const bands = bandsFor(f, userPalettes);
        const age = hitAge(parseFavoriteTimestamp(f.timestamp), card.now);
        return createPortal(
          <div className="hit-detail" role="group" aria-label={`Hit ${card.i + 1} details`}
            style={{ left: card.left, bottom: card.bottom }}
            onMouseEnter={() => clearTimeout(cardTimer.current)} onMouseLeave={closeCard}>
            <div className="hit-detail-name">{nm.full}</div>
            <div className="hit-detail-seed">seed {nm.hex}{age ? ` · captured ${age}` : ''}</div>
            <ul className="hit-detail-legend">
              {bands.c.map((c, k) => <li key={k}><i style={{ background: c }} />palette {k + 1}</li>)}
              <li><i className={`heat h${bands.h}`} />heat {bands.h}/3 at capture</li>
            </ul>
            <div className="hit-detail-more">
              <button type="button" onClick={() => copyLink(f)}>{copiedKey === key ? '✓ copied' : '⧉ share'}</button>
              <button type="button" onClick={() => { setCursor(card.i); morphTo(f, card.i); }}>↔ morph</button>
              <button type="button" onClick={() => evolveFrom(f, card.i)}>↻ evolve</button>
            </div>
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}
