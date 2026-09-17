import { emit, Events } from '../../composition/eventBus.js';
import { renderFinal } from '../../hooks/useMediaExport.js';
import { resolutionLabel } from '../../data/quality.js';

export function RenderFinalBlock({
  glLoopRef, palette, seed, layoutParams, exportResolution,
  accumOn, rendering, setRendering, batchActive,
}) {
  const resLabel = resolutionLabel(exportResolution);

  const runRenderFinal = async () => {
    if (rendering) return;
    setRendering(true);

    try {
      // One instrument: finals capture the live GL frame as-is — with ACCUM
      // on, the captured frame is the trail buffer (history is pixels).
      await renderFinal({
        loopRef: glLoopRef,
        resolution: exportResolution,
        seedStr: seed.toString(16),
        onThumbnail: (thumb) => {
          emit(Events.EXPORT_SNAPSHOT, {
            seed,
            format: 'PNG',
            resolution: accumOn ? `${resLabel} · ACCUM` : `${resLabel} · FINAL`,
            timestamp: new Date().toISOString().slice(11, 19),
            config: { layout: { ...layoutParams }, palette: { id: palette.id }, ...(accumOn ? { accum: true } : {}) },
            thumb,
          });
        },
      });
    } catch (e) {
      console.warn('[RENDER]', e);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div style={{ marginBottom: 8, padding: 8, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--dim)', marginBottom: 6 }}>RENDER · FINAL STILL</div>
      <div className="output-row" style={{ marginBottom: 6 }}>
        <select
          value={exportResolution}
          onChange={e => emit(Events.EXPORT_RESOLUTION, parseInt(e.target.value, 10))}
          style={{ padding: '4px', fontSize: '10px', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', flex: 1 }}
        >
          <option value={1}>1x (1000×700@1x)</option>
          <option value={2}>2x (1000×700@2x)</option>
          <option value={4}>4x (1000×700@4x)</option>
        </select>
      </div>
      <button
        type="button"
        className="big-btn"
        onClick={runRenderFinal}
        disabled={rendering}
        style={{
          width: '100%',
          background: rendering ? 'var(--line)' : 'var(--accent)',
          color: rendering ? 'var(--dim)' : '#000',
          borderColor: 'var(--accent)',
          fontWeight: 800,
          letterSpacing: '0.08em',
        }}
      >
        {rendering && !batchActive ? 'RENDERING…' : accumOn ? '▶ RENDER ACCUM' : '▶ RENDER FINAL'}
      </button>
      <div className="output-hint" style={{ marginTop: 6 }}>
        {accumOn
          ? 'ACCUM on — export captures the live trail buffer.'
          : 'Matches live preview. Denser 4K/8K finals: studio.py render --uncapped.'}
      </div>
    </div>
  );
}
