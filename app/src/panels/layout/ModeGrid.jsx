// Layout mode tiles
import { LAYOUT_MODES } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';

// One-line plain-language tooltips per mode (#158). Cellular is the one the
// Davis CA wrap mode needs — said out loud here, not just in helpCopy.
const MODE_TITLES = {
  random: 'Scatter placements by chance.',
  grid: 'Even rows and columns.',
  fibonacci: 'Golden-angle spiral packing.',
  radial: 'Rings around the center.',
  swarm: 'Flocking particles that chase the cursor.',
  noise: 'Placements warped by a flowing noise field.',
  hype: 'Moth bodies riding the noise wind.',
  stratified: 'Bands stacked by depth tier.',
  flow: 'Placements follow a vector field.',
  layers: 'Stacked z-slices, front to back.',
  rails: 'Placements ride horizontal rails.',
  ca: 'Cellular automata grid — the only mode the Davis CA wrap paints.',
  orbit: 'Placements circle the center.',
  abacus: 'Beads sliding on wires.',
};

export function ModeGrid({ mode }) {
  return (
    <div className="mode-grid">
      {LAYOUT_MODES.map(m => (
        <button
          key={m.id}
          className={`mode-tile ${mode === m.id ? 'active' : ''}`}
          title={MODE_TITLES[m.id] || m.name}
          onClick={() => emit(Events.LAYOUT_PARAM, { key: 'mode', value: m.id })}
        >
          <span style={{ fontSize: '11px' }}>{m.glyph}</span>
          {m.name}
        </button>
      ))}
    </div>
  );
}
