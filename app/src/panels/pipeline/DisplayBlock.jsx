import { useStore } from '../../state/store.js';
import { helpText } from '../../data/helpCopy.js';

// #740: global display settings — how the frame is resolved to the screen and
// to exports. FXAA is per-machine (its own localStorage key), never project
// content, and the export path uses the same setting so what you see is what
// you export.
export function DisplayBlock() {
  const fxaa = useStore((s) => s.fxaa);
  const setFxaa = useStore((s) => s.setFxaa);
  const shed = useStore((s) => s.fxaaShed);
  return (
    <div className="pipeline-row" title={helpText('output-fxaa')}>
      <span style={{ flex: 1, fontSize: 11 }}>
        EDGE AA · FXAA
        {fxaa && shed && <em style={{ marginLeft: 6, color: '#ffb000' }}>shed by governor</em>}
      </span>
      <button
        type="button"
        className={`chip-btn${fxaa ? ' active' : ''}`}
        aria-pressed={fxaa}
        onClick={() => setFxaa(!fxaa)}
      >
        {fxaa ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
