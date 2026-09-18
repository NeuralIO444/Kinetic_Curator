import { emit, Events } from '../../composition/eventBus.js';

// Beat router — resolves the beat collision. One mic attack drives two
// consumers (the phrase clock on CLOCK=AUDIO, evolve on SOURCE=BEAT); this
// row picks who answers. Shown only while both sides are armed. Built as a
// standalone section so it ports cleanly into the consolidated PLAY panel.
const ROUTES = [
  { id: 'phrase', label: 'PHRASE', title: 'Only the bar answers. Evolve ignores the beat.' },
  { id: 'evolve', label: 'EVOLVE', title: 'Only the gate answers. The bar holds.' },
  { id: 'both', label: 'BOTH', title: 'Recommended. The clock ticks first, then the gate fires on the post-phrase state.' },
];

export function BeatRouter({ beatRoute = 'both' }) {
  return (
    <div className="davis-source-row" style={{ marginTop: 8 }}
      title="One mic attack, two consumers. Pick who answers the beat.">
      <span className="davis-label">BEAT</span>
      {ROUTES.map(r => (
        <button
          key={r.id}
          className={`chip-btn ${beatRoute === r.id ? 'active' : ''}`}
          title={r.title}
          onClick={() => emit(Events.DAVIS_EVOLVE, { beatRoute: r.id })}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
