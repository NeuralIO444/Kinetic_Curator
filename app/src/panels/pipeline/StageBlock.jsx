import { useStore } from '../../state/store.js';
import { closeStageWindow, isTauriRuntime, openStageWindow } from './stageWindow.js';

export function StageBlock() {
  const mode = useStore((s) => s.stageMode);
  const setMode = useStore((s) => s.setStageMode);
  const blackout = useStore((s) => s.stageBlackout);
  const setBlackout = useStore((s) => s.setStageBlackout);
  const syphonOn = useStore((s) => s.syphonOn);
  const setSyphonOn = useStore((s) => s.setSyphonOn);
  const syphonName = useStore((s) => s.syphonName);
  const setSyphonName = useStore((s) => s.setSyphonName);
  const isFs = useStore((s) => s.isFullscreen);
  const toggleFs = useStore((s) => s.toggleFullscreen);

  const tauri = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

  return (
    <div className="pipeline-stage">
      <div className="pipeline-row">
        <span style={{ flex: 1, fontSize: 11 }}>STAGE MODE</span>
        {['preview', 'fullscreen', 'syphon'].map((m) => (
          <button key={m} type="button" className={`chip-btn${mode === m ? ' active' : ''}`}
            onClick={() => {
              setMode(m);
              if (m === 'fullscreen') {
                if (isTauriRuntime()) openStageWindow();
                else if (!isFs) toggleFs?.();
              }
              if (m === 'preview') {
                if (isTauriRuntime()) closeStageWindow();
                else if (isFs) toggleFs?.();
              }
            }}>
            {m === 'preview' ? 'PREVIEW' : m === 'fullscreen' ? 'FULLSCREEN' : 'SYPHON'}
          </button>
        ))}
      </div>
      <div className="pipeline-row">
        <span style={{ flex: 1, fontSize: 11 }}>BLACKOUT</span>
        <button type="button" className={`chip-btn${blackout ? ' active' : ''}`} onClick={() => setBlackout(!blackout)}>
          {blackout ? 'ON' : 'OFF'}
        </button>
      </div>
      {mode === 'syphon' && (
        <>
          <div className="pipeline-row">
            <span style={{ flex: 1, fontSize: 11 }}>SERVER</span>
            <input value={syphonName} onChange={(e) => setSyphonName(e.target.value)} style={{ fontSize: 11, width: 140 }} />
            {tauri ? (
              <button type="button" className={`chip-btn${syphonOn ? ' active' : ''}`}
                onClick={() => setSyphonOn(!syphonOn)}>
                {syphonOn ? 'ON' : 'OFF'}
              </button>
            ) : (
              /* #962 (UX-2): the toggle is inert in browser builds (platform-gated
                 to the desktop app) — don't show a dead button. */
              <span className="pipeline-status">DESKTOP ONLY</span>
            )}
          </div>
          <div className="pipeline-hint" style={{ fontSize: 10, opacity: 0.7 }}>
            {tauri
              ? 'Syphon publishes from the Tauri build only. Toggle off stops the server.'
              : 'Syphon needs the Mac / Tauri build — this browser cannot publish a GPU texture.'}
          </div>
        </>
      )}
    </div>
  );
}
