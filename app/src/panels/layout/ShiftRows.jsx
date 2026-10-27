// ShiftRows.jsx — #1204: the two shift-layer rows.
//
// HEROES (shift of MOTION, hosted by MotionShelf) and PULL (shift of WILD,
// hosted by the dice's ROLL button in BuildPanel). Each row is a quantized
// mode row — OFF · LOW · MID · HIGH as a TeaMatrix, the ONE discrete-choice
// component — under its own label. No sliders, no fifth knob beside the
// host: the row only exists while its host's second function is open.
//
// Copy discipline: "shift layer" is a backstage term and never appears on
// the performer's surface; the rows say HEROES and PULL, nothing more.
import { useRef } from 'react';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { SliderEditor } from '../build/te/editors.jsx';
import { useDock } from '../build/te/useDock.js';
import { emit, Events } from '../../composition/eventBus.js';
import {
  SHIFT_MODE_OPTIONS,
  MAX_HEROES,
  clampHeroCount,
  heroModeForCount,
  heroesWrite,
  heroesExactWrite,
  attractorModeForParams,
  attractorWrites,
} from './shiftLayer.mjs';

export function HeroesRow({ layoutParams }) {
  const { open } = useDock();
  const count = clampHeroCount(layoutParams.heroes ?? 0);
  // #1272 pattern (see ValueButton): the dock editor reads the LATEST
  // count through a ref, so an open editor tracks store changes.
  const latest = useRef({ count });
  // eslint-disable-next-line react-hooks/refs -- render-phase write precedes the dock's read in the same commit (ValueButton #1272)
  latest.current = { count };

  const openExact = () =>
    open({
      title: 'HEROES',
      open: () => (
        <SliderEditor
          ariaLabel="Heroes — exact count"
          value={latest.current.count}
          min={0}
          max={MAX_HEROES}
          step={1}
          onChange={(v) => emit(Events.LAYOUT_PARAM, heroesExactWrite(v))}
        />
      ),
    });

  return (
    <div className="voice-shelf">
      <span
        className="shelf-label ttl"
        onDoubleClick={openExact}
        title="Heroes — marks that move against the flow. Double-click for the exact count."
      >
        heroes · {count}
      </span>
      <TeaMatrix
        ariaLabel="Heroes"
        options={SHIFT_MODE_OPTIONS}
        value={heroModeForCount(count)}
        onChange={(id) => emit(Events.LAYOUT_PARAM, heroesWrite(id))}
      />
    </div>
  );
}

export function AttractorRow({ layoutParams }) {
  const count = Math.max(0, Math.floor(Number(layoutParams.attractorCount) || 0));
  return (
    <div className="voice-shelf">
      <span className="shelf-label ttl" title="Pull — attractor points that bend placement density toward them.">
        pull · {count}
      </span>
      <TeaMatrix
        ariaLabel="Attractors"
        options={SHIFT_MODE_OPTIONS}
        value={attractorModeForParams(layoutParams)}
        onChange={(id) => {
          for (const w of attractorWrites(id)) emit(Events.LAYOUT_PARAM, w);
        }}
      />
    </div>
  );
}
