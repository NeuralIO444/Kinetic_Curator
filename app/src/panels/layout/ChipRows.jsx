// SYMMETRY / BEHAVE as TE button matrices (#1202).
// MIRROR is the 4-state OFF/X/Y/XY (was a boolean toggle); SYMMETRY gains
// the kaleido (dihedral) variants. BEHAVE lives in MOTION & BEHAVIOR.
import { SYMMETRY_MODES, BEHAVE_MODES, MIRROR_STATES } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';

const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });

const MIRROR_LABELS = { off: 'OFF', x: 'X', y: 'Y', xy: 'XY' };
const MIRROR_TITLES = {
  off: 'No reflection',
  x: 'Reflect across the vertical axis (2× items)',
  y: 'Reflect across the horizontal axis (2× items)',
  xy: 'Reflect across both axes (4× items)',
};

function symmetryLabel(s) {
  return s.replace('radial-', 'R').replace('kaleido-', 'K');
}

export function SymmetryRow({ layoutParams }) {
  const mirror = layoutParams.mirror ?? 'off';
  // Legacy boolean reads as X (the old X-only mirror).
  const mirrorVal = mirror === true ? 'x' : mirror;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      <div>
        <div className="davis-label lbl" style={{ marginBottom: 2 }}>mirror</div>
        <TeaMatrix
          ariaLabel="Mirror"
          columns={4}
          tone="red"
          value={mirrorVal}
          onChange={(id) => set('mirror', id)}
          options={MIRROR_STATES.map((id) => ({
            id,
            label: MIRROR_LABELS[id],
            title: MIRROR_TITLES[id],
          }))}
        />
      </div>
      <div>
        <div className="davis-label lbl" style={{ marginBottom: 2 }}>symmetry</div>
        <TeaMatrix
          ariaLabel="Symmetry"
          columns={4}
          value={layoutParams.symmetry || 'none'}
          onChange={(id) => set('symmetry', id)}
          options={SYMMETRY_MODES.map((s) => ({
            id: s,
            label: symmetryLabel(s).toUpperCase(),
            title: s.startsWith('kaleido-')
              ? `${s} — true dihedral mirror symmetry`
              : s.startsWith('radial-')
                ? `${s} — rotation only, no mirrors`
                : s,
          }))}
        />
      </div>
    </div>
  );
}

export function BehaveRow({ layoutParams }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div className="davis-label lbl" style={{ marginBottom: 2 }}>behave</div>
      <TeaMatrix
        ariaLabel="Behave"
        columns={4}
        value={layoutParams.behave || 'cruise'}
        onChange={(id) => set('behave', id)}
        options={BEHAVE_MODES.map((s) => ({ id: s, label: s.toUpperCase() }))}
      />
    </div>
  );
}
