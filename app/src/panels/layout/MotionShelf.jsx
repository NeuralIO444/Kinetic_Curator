// MOTION chips as a TE button matrix (#1202).
// Change the animation only, not the arrangement.
import { useStore } from '../../state/store.js';
import { MOTION_MODES, isMotionActive } from '../../data/voices.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';

export function MotionShelf({ layoutParams }) {
  const loadMotion = useStore((s) => s.loadMotion);
  return (
    <div className="voice-shelf">
      <span className="shelf-label ttl">motion</span>
      <TeaMatrix
        ariaLabel="Motion"
        value={MOTION_MODES.find((m) => isMotionActive(layoutParams, m))?.id}
        onChange={(id) => loadMotion(id)}
        options={MOTION_MODES.map((m) => ({
          id: m.id,
          label: m.name,
          title: m.vibe,
        }))}
      />
    </div>
  );
}
