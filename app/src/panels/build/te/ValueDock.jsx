// The value dock — popup editors docked to the panel edge (#1202).
//
// One dock per panel, rendered by DockProvider at the panel root. Editors
// open via the useDock() hook: open({ title, open }) where `open` is a
// function returning the editor node. The dock is position:absolute inside
// the panel — it NEVER covers the canvas. Escape or tap-outside dismisses.
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const DockContext = createContext(null);

export function useDock() {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error('useDock must be used inside DockProvider');
  return ctx;
}

export function DockProvider({ children }) {
  const [editor, setEditor] = useState(null);
  const open = useCallback((config) => setEditor(config), []);
  const close = useCallback(() => setEditor(null), []);
  const dockRef = useRef(null);

  // Escape dismisses; tap-outside the dock dismisses (but taps on the
  // value button that opened it are ignored — it's outside the dock too).
  useEffect(() => {
    if (!editor) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onDown = (e) => {
      if (dockRef.current && !dockRef.current.contains(e.target)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [editor, close]);

  return (
    <DockContext.Provider value={{ open, close, isOpen: !!editor }}>
      {children}
      <div
        ref={dockRef}
        className={`te-dock${editor ? ' open' : ''}`}
        role="dialog"
        aria-label={editor ? `Edit ${editor.title}` : undefined}
        aria-hidden={!editor}
      >
        {editor && (
          <>
            <div className="te-dock-head">
              <div>
                <div className="te-dock-kicker">EDIT VALUE</div>
                <div className="te-dock-title">{editor.title}</div>
              </div>
              <button
                type="button"
                className="te-dock-close"
                onClick={close}
                aria-label="Close editor"
              >
                ×
              </button>
            </div>
            <div className="te-dock-body">{editor.open()}</div>
          </>
        )}
      </div>
    </DockContext.Provider>
  );
}
