// MOTION chips — extracted from ModeGrid.jsx (UX-5 reorg).
// Change the animation only, not the arrangement.
import { useStore } from '../../state/store.js';
import { MOTION_MODES, isMotionActive } from '../../data/voices.js';

export function MotionShelf({ layoutParams }) {
  const loadMotion = useStore((s) => s.loadMotion);
  return (
    <div className="voice-shelf">
      <span className="shelf-label">MOTION</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
        {MOTION_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`chip-btn ${isMotionActive(layoutParams, m) ? 'active' : ''}`}
            onClick={() => loadMotion(m.id)}
            title={m.vibe}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
