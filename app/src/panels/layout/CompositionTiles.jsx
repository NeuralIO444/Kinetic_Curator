// Composition tiles — the 14 layout modes as a TE button matrix (#1202).
// Arrangement only — MOTION chips change the animation, SHAPES chips swap
// the asset pool. The dice tray lives below; the ROLL button itself moved
// to the panel header (BuildPanel owns the dice state now).
import { useStore } from '../../state/store.js';
import { STUB_VOICES } from '../../data/voices.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { DiceTray } from './DiceRoller.jsx';

export function CompositionTiles({ mode, tray, onCrown, onReroll, onDismiss }) {
  const loadStubMode = useStore((s) => s.loadStubMode);
  return (
    <>
      <TeaMatrix
        ariaLabel="Layout mode"
        columns={4}
        value={mode}
        onChange={(id) => loadStubMode(id)}
        options={STUB_VOICES.map((m) => ({
          id: m.id,
          label: m.name,
          glyph: m.glyph,
          title: m.vibe,
        }))}
      />
      <DiceTray tray={tray} onCrown={onCrown} onReroll={onReroll} onDismiss={onDismiss} />
    </>
  );
}
