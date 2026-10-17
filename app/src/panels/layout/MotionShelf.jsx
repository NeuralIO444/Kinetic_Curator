// MOTION chips as a TE button matrix (#1202).
// Change the animation only, not the arrangement.
// #1204 — the shift layer: HEROES is MOTION's second function. Long-press
// the shelf and the HEROES row opens in place beneath it; long-press again
// to close. A plain tap still just picks a motion — the hold swallows its
// own release click (useLongPress), so opening the row never loads the
// chip under the finger.
import { useState } from 'react';
import { MOTION_MODES, isMotionActive } from '../../data/voices.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { emit, Events } from '../../composition/eventBus.js';
import { useLongPress } from '../../hooks/useLongPress.js';
import { HeroesRow } from './ShiftRows.jsx';

export function MotionShelf({ layoutParams }) {
  const [shiftOpen, setShiftOpen] = useState(false);
  const press = useLongPress(() => setShiftOpen((o) => !o));
  return (
    <>
      <div className="voice-shelf" {...press}>
        <span className="shelf-label ttl" title="Motion — long-press for heroes">motion</span>
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
      {shiftOpen && <HeroesRow layoutParams={layoutParams} />}
    </>
  );
}
