import { useState, useRef } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { captureStill, useVideoRecorder } from '../../hooks/useMediaExport.js';
import { resolutionLabel } from '../../data/quality.js';

export function SnapRecordRow({
  glCanvasRef, glLoopRef, palette, seed, seedOffsets, layoutParams, exportResolution,
  accumOn, isRecording, rendering,
}) {
  useVideoRecorder({
    canvasRef: glCanvasRef,
    isRecording,
    seedStr: seed.toString(16),
    fps: 15,
  });

  // #267: captureStill retries internally via waitForReady while textures
  // bake; a genuine failure surfaces here instead of being swallowed — the
  // button must never silently do nothing.
  const [snapError, setSnapError] = useState(null);
  const errTimer = useRef(null);
  const addSnapshot = () => {
    setSnapError(null);
    if (errTimer.current) clearTimeout(errTimer.current);
    captureStill({
      loopRef: glLoopRef,
      resolution: exportResolution, seedStr: seed.toString(16),
      onThumbnail: (thumb, info) => {
        const up = info && info.upscaledFrom;
        emit(Events.EXPORT_SNAPSHOT, {
          seed,
          // #305 — the recipe is only deterministic with the stream offsets.
          seedOffsets: { ...(seedOffsets || {}) },
          format: 'PNG',
          resolution: `${resolutionLabel(exportResolution)}${accumOn ? ' · ACCUM' : ''}${up ? ` · upscaled ${up.width}×${up.height}→${exportResolution}x` : ''}`,
          timestamp: new Date().toISOString().slice(11, 19),
          config: { layout: { ...layoutParams }, palette: { id: palette.id } },
          thumb,
        });
      },
    }).catch((e) => {
      console.error('[snap] capture failed:', e);
      setSnapError(e && e.message ? e.message : String(e));
      errTimer.current = setTimeout(() => setSnapError(null), 6000);
    });
  };

  return (
    <div className="output-row">
      <button className="big-btn" onClick={addSnapshot} style={{ flex: 2 }} disabled={rendering}>↓ SNAP</button>
      <button
        className="big-btn"
        onClick={() => emit(Events.EXPORT_RECORD, !isRecording)}
        disabled={rendering}
        title="Record the live canvas to WEBM — what plays is what records, ACCUM included"
        style={isRecording ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 2 } : { flex: 2 }}
      >
        {isRecording ? '⏹ STOP REC' : '⏺ REC WEBM'}
      </button>
      {snapError && (
        <div style={{ color: '#ff5d7a', fontSize: 11, marginTop: 6 }} role="alert">
          SNAP failed: {snapError}
        </div>
      )}
    </div>
  );
}
