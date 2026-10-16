// CHIAROSCURO section (#1587) — one home for the render engine in BUILD.
//
// In the panel the section is a compact row: a plain TE label, a live
// one-line summary of the sun + hue, and an EDIT button. The full control
// set lives in a large floating editor OVER the canvas (Matt's form
// ruling, 2026-10-15): no backdrop, the canvas stays live and rendering
// underneath, no apply/confirm — every control emits its usual event the
// moment it moves, so a sun slider changes the light in the same gesture.
// Esc or click-away closes it; there is no focus trap.
//
// Tenants (the explicit #1587 inventory — nothing else moved):
//   · the sun (#594) — from the Appearance shelf's sun row (SunRow.jsx)
//   · HUE ROTATE — from AppearanceSliders.jsx (whole-canvas finish)
// Deliberately NOT here: FXAA (output/display render — stays in
// Pipeline's DisplayBlock, amendment 1), materials (their own M4 home),
// the field→channel map (#1204 home), per-stratum controls, and the
// governor's tuning (stays with the governor).
//
// The editor follows the app's overlay grammar (portal + fixed position,
// like the beat menu / favorites tray), anchored to the canvas wrap's
// rect. The panel value dock is the other editor grammar and it never
// covers the canvas by design — so the section closes the dock when it
// opens: one editor at a time.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store.js';
import { emit, Events } from '../../composition/eventBus.js';
import { helpText } from '../../data/helpCopy.js';
import { SunControls } from './SunControls.jsx';
import { DialEditor } from '../build/te/editors.jsx';
import { useDock } from '../build/te/useDock.js';

const EDITOR_W = 560;
const INSET = 16;

function canvasAnchor() {
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return null;
  const r = wrap.getBoundingClientRect();
  if (r.width < 80 || r.height < 80) return null;
  const width = Math.min(EDITOR_W, r.width - INSET * 2);
  return {
    top: r.top + INSET,
    left: r.right - width - INSET,
    width,
    maxHeight: r.height - INSET * 2,
  };
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
        && prev.width === next.width && prev.maxHeight === next.maxHeight) return prev;
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

  const summary = light
    ? `sun ${Math.round(light.x)},${Math.round(light.y)} · int ${Math.round(light.intensity * 100)}% · hue ${Math.round(hue)}°`
    : `sun off · hue ${Math.round(hue)}°`;

  return (
    <div className="chiaro-section">
      <div className="chiaro-row">
        <div className="chiaro-head">
          <span className="chiaro-title" title={helpText('layout-sun')}>CHIAROSCURO</span>
          <span className="chiaro-summary">{summary}</span>
        </div>
        <button
          type="button"
          ref={anchorRef}
          className="te-cell chiaro-open"
          onClick={() => (open ? closeEditor() : openEditor())}
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Open the render engine — the sun and the finish, over the canvas"
        >
          <span className="te-cell-label">EDIT</span>
        </button>
      </div>
      {open && pos && createPortal(
        <div
          ref={editorRef}
          className="chiaro-editor"
          role="dialog"
          aria-label="CHIAROSCURO — render engine controls"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
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
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
