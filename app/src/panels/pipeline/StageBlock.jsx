// StageBlock.jsx — #607 STAGE Phase B: fullscreen live output window.
import { useStore } from '../../state/store.js';
import { isTauriRuntime } from './stageWindow.js';
import { useStageOutput } from './useStageOutput.js';
import { displayLabel, matchRaster, REFRESH_RATE_UNAVAILABLE } from './stageDisplays.mjs';
import { STAGE_MAPPINGS, stageMappingLabel } from './stageMapping.mjs';

export function StageBlock() {
  const mode = useStore((s) => s.stageMode);
  const setMode = useStore((s) => s.setStageMode);
  const blackout = useStore((s) => s.stageBlackout);
  const setBlackout = useStore((s) => s.setStageBlackout);
  const testPattern = useStore((s) => s.stageTestPattern);
  const setTestPattern = useStore((s) => s.setStageTestPattern);
  const mapping = useStore((s) => s.stageMapping);
  const setMapping = useStore((s) => s.setStageMapping);
  const stageDisplayId = useStore((s) => s.stageDisplayId);
  const setStageDisplayId = useStore((s) => s.setStageDisplayId);
  const stageError = useStore((s) => s.stageError);
  const setStageError = useStore((s) => s.setStageError);
  const setCanvasSize = useStore((s) => s.setCanvasSize);
  const syphonOn = useStore((s) => s.syphonOn);
  const setSyphonOn = useStore((s) => s.setSyphonOn);
  const syphonName = useStore((s) => s.syphonName);
  const setSyphonName = useStore((s) => s.setSyphonName);
  const isFs = useStore((s) => s.isFullscreen);
  const toggleFs = useStore((s) => s.toggleFullscreen);

  const { begin, end, displays, displaysBusy, refreshDisplays } = useStageOutput();
  const tauri = isTauriRuntime();
  const activeDisplay = displays.find((d) => d.id === stageDisplayId) || null;

  const pickMode = (m) => {
    setMode(m);
    if (m === 'fullscreen') {
      if (tauri) begin();
      else if (!isFs) toggleFs?.();
    }
    if (m === 'preview') {
      if (tauri) end();
      else if (isFs) toggleFs?.();
    }
  };

  const matchDisplay = () => {
    const raster = activeDisplay && matchRaster(activeDisplay);
    if (!raster) {
      setStageError('Pick a display first — there is no raster to match.');
      return;
    }
    setCanvasSize(raster.w, raster.h, 'custom');
  };

  return (
    <div className="pipeline-stage">
      {stageError && (
        <div className="pipeline-row" style={{ background: 'rgba(200,30,30,0.16)', border: '1px solid rgba(200,30,30,0.55)', borderRadius: 4, padding: '6px 8px' }}>
          <span style={{ flex: 1, fontSize: 11, color: '#ff9a9a' }}>⚠ {stageError}</span>
          <button type="button" className="chip-btn" onClick={() => setStageError(null)}>DISMISS</button>
        </div>
      )}
      <div className="pipeline-row">
        <span style={{ flex: 1, fontSize: 11 }}>STAGE MODE</span>
        {['preview', 'fullscreen', 'syphon'].map((m) => (
          <button key={m} type="button" className={`chip-btn${mode === m ? ' active' : ''}`}
            onClick={() => pickMode(m)}>
            {m === 'preview' ? 'PREVIEW' : m === 'fullscreen' ? 'FULLSCREEN' : 'SYPHON'}
          </button>
        ))}
      </div>
      <div className="pipeline-hint" style={{ fontSize: 10, opacity: 0.7 }}>
        Preview only is the safe default — no window opens uninvited.
      </div>

      {mode === 'fullscreen' && (
        <>
          {tauri ? (
            <>
              <div className="pipeline-row">
                <span style={{ flex: 1, fontSize: 11 }}>DISPLAY</span>
                <select
                  value={stageDisplayId || ''}
                  onChange={(e) => setStageDisplayId(e.target.value || null)}
                  style={{ fontSize: 11, maxWidth: 220 }}
                  title={REFRESH_RATE_UNAVAILABLE}
                >
                  {displays.length === 0 && <option value="">— no displays —</option>}
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>{displayLabel(d)}</option>
                  ))}
                </select>
                <button type="button" className="chip-btn" onClick={refreshDisplays} disabled={displaysBusy}>
                  {displaysBusy ? '…' : 'REFRESH'}
                </button>
              </div>
              <div className="pipeline-row">
                <span style={{ flex: 1, fontSize: 11 }}>NATIVE RASTER</span>
                <span className="pipeline-status" style={{ fontSize: 11 }}>
                  {activeDisplay ? `${activeDisplay.w}×${activeDisplay.h}` : '—'}
                </span>
                <button type="button" className="chip-btn" onClick={matchDisplay} disabled={!activeDisplay}
                  title="Write the display's native raster to the canvas size">
                  MATCH DISPLAY
                </button>
              </div>
              <div className="pipeline-row">
                <span style={{ flex: 1, fontSize: 11 }}>MAPPING</span>
                {STAGE_MAPPINGS.map((mp) => (
                  <button key={mp} type="button" className={`chip-btn${mapping === mp ? ' active' : ''}`}
                    onClick={() => setMapping(mp)}
                    title={mp === 'fit' ? 'Whole frame visible, letterboxed' : mp === 'fill' ? 'Cover the display, crop the overflow' : 'Native pixels, centered'}>
                    {stageMappingLabel(mp)}
                  </button>
                ))}
              </div>
              <div className="pipeline-row">
                <span style={{ flex: 1, fontSize: 11 }}>TEST PATTERN</span>
                <button type="button" className={`chip-btn${testPattern ? ' active' : ''}`} onClick={() => setTestPattern(!testPattern)}>
                  {testPattern ? 'ON' : 'OFF'}
                </button>
              </div>
            </>
          ) : (
            <div className="pipeline-hint" style={{ fontSize: 10, opacity: 0.7 }}>
              Fullscreen stage needs the Mac / Tauri build — this browser cannot open a
              borderless stage window on a second display. In the browser, FULLSCREEN
              falls back to the tab's own fullscreen.
            </div>
          )}
          <div className="pipeline-row">
            <span style={{ flex: 1, fontSize: 11 }}>BLACKOUT</span>
            <button type="button" className={`chip-btn${blackout ? ' active' : ''}`} onClick={() => setBlackout(!blackout)}
              title="Stage goes black instantly. The UI stays live; toggling back recovers without re-creating the window.">
              {blackout ? 'ON' : 'OFF'}
            </button>
          </div>
        </>
      )}

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
