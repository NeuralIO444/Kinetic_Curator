// Composition tiles — extracted from ModeGrid.jsx (UX-5 reorg).
// The 14 layout tiles (12 stub modes + DLA + Eden). Arrangement only —
// MOTION chips change the animation, SHAPES chips swap the asset pool.
import { useStore } from '../../state/store.js';
import { STUB_VOICES } from '../../data/voices.js';

export function CompositionTiles({ mode }) {
  const loadStubMode = useStore((s) => s.loadStubMode);
  return (
    <div className="mode-grid">
      {STUB_VOICES.map((m) => (
        <button
          key={m.id}
          className={`mode-tile${mode === m.id ? ' active' : ''}`}
          onClick={() => loadStubMode(m.id)}
          title={m.vibe}
        >
          <span style={{ fontSize: '11px' }}>{m.glyph}</span>
          {m.name}
        </button>
      ))}
    </div>
  );
}
