import { emit, Events } from '../../composition/eventBus.js';
import { captureStill, useVideoRecorder } from '../../hooks/useMediaExport.js';
import { resolutionLabel } from '../../data/quality.js';

export function SnapRecordRow({
  svgRef, accumRef, palette, seed, layoutParams, exportResolution,
  accumOn, isRecording, rendering,
}) {
  useVideoRecorder({
    svgRef,
    isRecording,
    seedStr: seed.toString(16),
    fps: 15,
  });

  const addSnapshot = () => {
    captureStill({
      accumOn, accumRef, svgNode: svgRef.current,
      resolution: exportResolution, seedStr: seed.toString(16), background: palette.bg,
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
        disabled={rendering || (accumOn && !isRecording)}
        title={accumOn && !isRecording ? 'REC is disabled while ACCUM is on: the recorder captures the SVG layer, not the accumulation buffer' : 'Record live output to WEBM'}
        style={isRecording ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 2 } : { flex: 2 }}
      >
        {isRecording ? '⏹ STOP REC' : '⏺ REC WEBM'}
      </button>
    </div>
  );
}
