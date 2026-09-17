import { emit, Events } from '../../composition/eventBus.js';
import { captureStill, useVideoRecorder } from '../../hooks/useMediaExport.js';
import { resolutionLabel } from '../../data/quality.js';

export function SnapRecordRow({
  glCanvasRef, glLoopRef, palette, seed, layoutParams, exportResolution,
  accumOn, isRecording, rendering,
}) {
  useVideoRecorder({
    canvasRef: glCanvasRef,
    isRecording,
    seedStr: seed.toString(16),
    fps: 15,
  });

  const addSnapshot = () => {
    captureStill({
      loopRef: glLoopRef,
      resolution: exportResolution, seedStr: seed.toString(16),
      onThumbnail: (thumb) => {
        emit(Events.EXPORT_SNAPSHOT, {
          seed,
          format: 'PNG',
          resolution: `${resolutionLabel(exportResolution)}${accumOn ? ' · ACCUM' : ''}`,
          timestamp: new Date().toISOString().slice(11, 19),
          config: { layout: { ...layoutParams }, palette: { id: palette.id } },
          thumb,
        });
      },
    }).catch(() => {});
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
    </div>
  );
}
