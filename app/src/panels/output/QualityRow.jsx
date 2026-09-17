import { emit, Events } from '../../composition/eventBus.js';
import { QUALITY_PRESETS } from '../../data/quality.js';

export function QualityRow({ quality, autoQuality }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--dim)', marginBottom: 4 }}>QUALITY</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Object.values(QUALITY_PRESETS).map(q => (
          <button
            key={q.id}
            className={`chip-btn ${quality === q.id ? 'active' : ''}`}
            title={q.description}
            onClick={() => emit(Events.EXPORT_QUALITY, q.id)}
            style={quality === q.id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          >
            {q.label}
          </button>
        ))}
        <button
          className={`chip-btn ${autoQuality ? 'active' : ''}`}
          title="Automatically step quality down when FPS stays low"
          onClick={() => emit(Events.EXPORT_AUTO_QUALITY, !autoQuality)}
          style={autoQuality ? { borderColor: '#00ff88', color: '#00ff88' } : {}}
        >
          AUTO {autoQuality ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
