// SYMMETRY / BEHAVE chip rows — extracted from ParamBlock.jsx (UX-5 reorg).
// SYMMETRY lives in LAYOUT (structure); BEHAVE lives in MOTION & BEHAVIOR.
import { SYMMETRY_MODES, BEHAVE_MODES } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';

const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });

export function SymmetryRow({ layoutParams }) {
  return (
    <div className="davis-source-row" style={{ marginTop: 6 }}>
      <span className="davis-label lbl">symmetry</span>
      {SYMMETRY_MODES.map((s) => (
        <button key={s} type="button" className={`chip-btn chip-symmetry ${(layoutParams.symmetry || 'none') === s ? 'active' : ''}`} onClick={() => set('symmetry', s)}>{s.toUpperCase()}</button>
      ))}
    </div>
  );
}

export function BehaveRow({ layoutParams }) {
  return (
    <div className="davis-source-row" style={{ marginTop: 6 }}>
      <span className="davis-label lbl">behave</span>
      {BEHAVE_MODES.map((s) => (
        <button key={s} type="button" className={`chip-btn chip-behave ${(layoutParams.behave || 'cruise') === s ? 'active' : ''}`} onClick={() => set('behave', s)}>{s.toUpperCase()}</button>
      ))}
    </div>
  );
}
