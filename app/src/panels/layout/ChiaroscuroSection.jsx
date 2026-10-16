// CHIAROSCURO (#1587; collapsed to a button by #1629) — one home for
// the render engine in BUILD.
//
// In the panel it is JUST A BUTTON (Matt's ruling, 2026-10-16): the
// titled section row — plain TE label, live one-line summary of the
// sun + hue, EDIT cell — is gone. The button, labelled CHIAROSCURO,
// opens the full control set in a floating editor OVER the
// canvas (Matt's form ruling, 2026-10-15): no backdrop, the canvas
// stays live and rendering underneath, no apply/confirm — every
// control emits its usual event the moment it moves, so a sun slider
// changes the light in the same gesture. Esc or click-away closes it;
// there is no focus trap.
//
// Tenants (the explicit #1587 inventory, plus the map):
//   · the sun (#594) — from the Appearance shelf's sun row (SunRow.jsx)
//   · HUE ROTATE — from AppearanceSliders.jsx (whole-canvas finish)
//   · the field→channel map (#1199, home per #1204) — from the §④ row
//     (2026-10-16, Matt's direction: the map rides with the render
//     engine family. #1204 still holds — it is an Appearance-family
//     scene control, NOT a MATH op; it now lives inside Appearance's
//     own editor instead of the §④ row.)
// Deliberately NOT here: FXAA (output/display render — stays in
// Pipeline's DisplayBlock, amendment 1), materials (their own M4 home),
// per-stratum controls, and the governor's tuning (stays with the
// governor).
//
// Size (2026-10-16, amendment 2): the window is RESPONSIVE — it takes
// only the essential size, the size its content needs (Matt's words).
// No width or height is forced: the CSS hugs the panel to its groups,
// which keep the measure they were designed at (a width cap in the
// CSS). The one bound is the canvas: shelfView's shelfAnchor (the K5
// expanded shelf's mechanism, not a second one) supplies the
// placement — top-left of the wrap rect shrunk by the 16px inset —
// and the caps: the panel may never exceed that rect in either
// dimension, and past the height cap the body scrolls internally
// rather than overflowing the canvas. (Amendment 1 forced the full
// shelf size for a few hours; the expanded panel was mostly empty,
// so the size now follows the content, not the canvas.)
//
// The editor follows the app's overlay grammar (portal + fixed position,
// like the beat menu / favorites tray), anchored to the canvas wrap's
// rect. The panel value dock is the other editor grammar and it never
// covers the canvas by design — so the button closes the dock when it
// opens: one editor at a time.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store.js';
import { emit, Events } from '../../composition/eventBus.js';
import { SunControls } from './SunControls.jsx';
import { MapRow } from './MapRow.jsx';
import { shelfAnchor } from '../shelfView.mjs';
import { DialEditor } from '../build/te/editors.jsx';
import { useDock } from '../build/te/useDock.js';

function canvasAnchor() {
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return null;
  // The K5 expanded shelf's anchor supplies the placement and the
  // bound: top-left of the wrap rect minus a 16px inset on every side,
  // and that rect's size as the caps. The panel itself is
  // content-sized by the CSS and may never exceed the bound (null
  // when the wrap is too small to host it).
  const bound = shelfAnchor(wrap.getBoundingClientRect());
  if (!bound) return null;
  return { top: bound.top, left: bound.left, maxWidth: bound.width, maxHeight: bound.height };
}

export function ChiaroscuroSection({ layoutParams, lockedParams }) {
  const light = useStore((s) => s.light);
  const { close: closeDock } = useDock();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const editorRef = useRef(null);
  const anchorRef = useRef(null);

  const hue = layoutParams.hueRotate ?? 0;
  const hueLocked = !!lockedParams.hueRotate;

  const place = useCallback(() => {
    const next = canvasAnchor();
    setPos((prev) => {
      if (!next) return prev;
      if (prev && prev.top === next.top && prev.left === next.left
        && prev.maxWidth === next.maxWidth && prev.maxHeight === next.maxHeight) return prev;
      return next;
    });
  }, []);

  const openEditor = useCallback(() => {
    closeDock();
    place();
    setOpen(true);
  }, [closeDock, place]);

  const closeEditor = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeEditor(); };
    const onDown = (e) => {
      if (editorRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      closeEditor();
    };
    // Re-anchor on viewport resize, and after any drag ends (the column
    // divider resizes the canvas without a window resize event).
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
  }, [open, closeEditor, place]);

  return (
    <div className="chiaro-section">
      <button
        type="button"
        ref={anchorRef}
        className="te-cell chiaro-open"
        onClick={() => (open ? closeEditor() : openEditor())}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Open the render engine — the sun and the finish, over the canvas"
      >
        <span className="te-cell-label">CHIAROSCURO</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={editorRef}
          className="chiaro-editor"
          role="dialog"
          aria-label="CHIAROSCURO — render engine controls"
          style={{ top: pos.top, left: pos.left, maxWidth: pos.maxWidth, maxHeight: pos.maxHeight }}
        >
          <div className="chiaro-editor-head">
            <div>
              <div className="te-dock-kicker">RENDER ENGINE</div>
              <div className="chiaro-editor-title">CHIAROSCURO</div>
            </div>
            <button
              type="button"
              className="te-dock-close"
              onClick={closeEditor}
              aria-label="Close CHIAROSCURO editor"
            >
              ×
            </button>
          </div>
          <div className="chiaro-editor-body">
            <div className="davis-label lbl chiaro-group">sun</div>
            <SunControls />
            {!light && (
              <div className="chiaro-note">the sun is off — the finish still applies</div>
            )}
            <div className="chiaro-group chiaro-group-row">
              <span className="davis-label lbl">hue rotate</span>
              <button
                type="button"
                className={`te-lock${hueLocked ? ' locked' : ''}`}
                onClick={() => emit(Events.LAYOUT_LOCK, { key: 'hueRotate' })}
                title={hueLocked ? 'HUE ROTATE locked against life-drift — tap to unlock' : 'Lock HUE ROTATE against life-drift'}
                aria-pressed={hueLocked}
                aria-label={hueLocked ? 'Unlock HUE ROTATE' : 'Lock HUE ROTATE'}
              >
                {hueLocked ? '▪' : '▫'}
              </button>
            </div>
            <DialEditor
              ariaLabel="Hue rotate"
              value={hue}
              min={0} max={360}
              onChange={(v) => emit(Events.LAYOUT_PARAM, { key: 'hueRotate', value: Math.round(v) })}
            />
            <MapRow layoutParams={layoutParams} lockedParams={lockedParams} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
