// MOTION chips as a TE button matrix (#1202).
// Change the animation only, not the arrangement.
import { MOTION_MODES, isMotionActive } from '../../data/voices.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { emit, Events } from '../../composition/eventBus.js';

export function MotionShelf({ layoutParams }) {
  return (
    <div className="voice-shelf">
      <span className="shelf-label ttl">motion</span>
      <TeaMatrix
        ariaLabel="Motion"
        value={MOTION_MODES.find((m) => isMotionActive(layoutParams, m))?.id}
        onChange={(id) => emit(Events.MOTION_LOAD, { id })}
        options={MOTION_MODES.map((m) => ({
          id: m.id,
          label: m.name,
          title: m.vibe,
        }))}
      />
    </div>
  );
}
