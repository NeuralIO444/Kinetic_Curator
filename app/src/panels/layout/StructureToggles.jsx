// Structure toggles — BLEED / OVERLAP as ON/OFF matrices (#1202).
// MIRROR moved to the SYMMETRY block (now 4-state); the ACCUM trail family
// lives in MOTION & BEHAVIOR (AccumFamily.jsx).
import { emit, Events } from '../../composition/eventBus.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';

const TOGGLES = ['bleed', 'overlap'];

export function StructureToggles({ layoutParams }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      {TOGGLES.map((key) => (
        <div key={key}>
          <div className="davis-label lbl" style={{ marginBottom: 2 }}>{key}</div>
          <TeaMatrix
            ariaLabel={key}
            columns={2}
            value={layoutParams[key] ? 'on' : 'off'}
            onChange={(id) => emit(Events.LAYOUT_PARAM, { key, value: id === 'on' })}
            options={[
              { id: 'on', label: 'ON' },
              { id: 'off', label: 'OFF' },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
